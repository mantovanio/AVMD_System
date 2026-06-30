import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AivenSqlClient } from '../db/aivenClient.js'
import type { CommunicationEventRepository } from '../repositories/communicationEventRepository.js'
import type { ExternalIntegrationRepository } from '../repositories/externalIntegrationRepository.js'
import type { LeadRepository } from '../repositories/leadRepository.js'
import { readJson, writeJson } from '../utils/http.js'

type JsonRecord = Record<string, unknown>

type SendChatMessageInput = {
  lead_id?: string
  conversation_id?: string
  content?: string
  instance_name?: string
  quoted_message_id?: string | null
  quoted_content?: string | null
}

type InitChatInput = {
  lead_id?: string
  phone?: string
  instance_name?: string
}

function normalizePhoneDigits(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits || null
}

function buildRemoteJid(phoneDigits: string | null) {
  return phoneDigits ? `${phoneDigits}@s.whatsapp.net` : null
}

function cleanBaseUrl(value: string | null | undefined) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : ('https://' + raw.replace(/^\/+/,'') )
  return withProtocol.replace(/\/$/, '')
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseMessageId(payload: JsonRecord | null | undefined) {
  if (!payload || typeof payload !== 'object') return null
  const key = payload.key
  if (key && typeof key === 'object' && !Array.isArray(key)) {
    const value = (key as JsonRecord).id
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  const response = payload.response
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const candidate = (response as JsonRecord).key
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      const nested = (candidate as JsonRecord).id
      if (typeof nested === 'string' && nested.trim()) return nested.trim()
    }
  }
  return asString(payload.messageId) || asString(payload.id) || null
}

async function resolveIntegration(
  integrationRepo: ExternalIntegrationRepository,
  preferredInstanceName?: string | null,
) {
  const integrations = await integrationRepo.findActiveWhatsApp()
  if (!integrations.length) return null

  const preferred = preferredInstanceName
    ? integrations.find(item => item.instance_name === preferredInstanceName)
    : null

  return preferred ?? integrations[0] ?? null
}

async function sendEvolutionTextMessage(
  integrationRepo: ExternalIntegrationRepository,
  input: { instanceName?: string | null; remoteJid: string; content: string },
) {
  const integration = await resolveIntegration(integrationRepo, input.instanceName)
  if (!integration?.base_url || !integration?.api_token || !integration?.instance_name) {
    return { ok: false, error: 'Nenhuma integracao WhatsApp ativa configurada.', status: 422, payload: null as JsonRecord | null, instanceName: null as string | null }
  }

  const evolutionUrl = `${cleanBaseUrl(integration.base_url)}/message/sendText/${integration.instance_name}`
  const response = await fetch(evolutionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: integration.api_token,
    },
    body: JSON.stringify({
      number: input.remoteJid.replace(/@.+$/, ''),
      text: input.content,
    }),
  })

  const payload = await response.json().catch(() => ({ status: response.status })) as JsonRecord
  if (!response.ok) {
    return { ok: false, error: `Evolution retornou HTTP ${response.status}`, status: 502, payload, instanceName: integration.instance_name }
  }

  return { ok: true, error: null, status: 200, payload, instanceName: integration.instance_name }
}

export async function handleChatRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  leadRepository: LeadRepository,
  communicationEventRepository: CommunicationEventRepository,
  externalIntegrationRepository: ExternalIntegrationRepository,
  db: AivenSqlClient,
  corsOrigin: string,
): Promise<boolean> {
  const url = req.url ?? ''
  const method = req.method ?? ''

  if (!url.startsWith('/api/chat')) return false

  if (method === 'GET' && url === '/api/chat/crm/integrations') {
    const integrations = await externalIntegrationRepository.findActiveWhatsApp()
    const rows = integrations.map(item => ({
      id: item.id,
      name: item.name,
      status: item.status,
      base_url: item.base_url,
      api_token: item.api_token,
      instance_name: item.instance_name,
      sender_name: item.sender_name,
    }))
    writeJson(res, 200, rows, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/chat/crm/conversations') {
    const result = await db.query<any>('SELECT * FROM crm_chat_admin_view ORDER BY ultima_interacao_em DESC NULLS LAST')
    writeJson(res, 200, { ok: true, data: result.rows }, corsOrigin)
    return true
  }

  if (method === 'GET' && url.startsWith('/api/chat/crm/messages')) {
    const parsedUrl = new URL(url, 'http://localhost')
    const conversationId = parsedUrl.searchParams.get('conversation_id') ?? ''
    const documentKey = parsedUrl.searchParams.get('document_key') ?? ''
    if (!conversationId && !documentKey) {
      writeJson(res, 400, { ok: false, error: 'conversation_id ou document_key obrigatorio.' }, corsOrigin)
      return true
    }
    const searchKey = conversationId || documentKey
    const remoteJid = documentKey ? `${documentKey}@s.whatsapp.net` : ''
    const [crmResult, evolutionResult] = await Promise.all([
      db.query<any>(
        `SELECT id, conversation_id, document_key, external_message_id, direction, sender_type, sender_name, mensagem, mime_type, file_name, media_url, created_at
         FROM crm_chat_messages
         WHERE (conversation_id::text = $1 OR document_key = $2 OR document_key = $3)
         ORDER BY created_at ASC`,
        [searchKey, documentKey, remoteJid.replace(/@.+$/, '')],
      ),
      db.query<any>(
        `SELECT id, event_type, payload, created_at, source
         FROM communication_events
         WHERE source IN ('evolution', 'chatwoot')
           AND conversation_id IN ($1, $2, $3)
         ORDER BY created_at ASC`,
        [searchKey, documentKey, remoteJid],
      ),
    ])
    writeJson(res, 200, { ok: true, crmMessages: crmResult.rows, evolutionMessages: evolutionResult.rows }, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/chat/crm/agents') {
    const result = await db.query<any>(
      `SELECT id, nome, perfil, email
       FROM profiles
       WHERE status = 'ativo'
         AND perfil IN ('admin', 'superadmin', 'usuario', 'vendedor', 'agente_registro', 'atendente')
       ORDER BY nome ASC`,
    )
    writeJson(res, 200, result.rows, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/chat/leads') {
    const leads = await leadRepository.findAll()
    writeJson(res, 200, { ok: true, leads }, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/chat/kanban-columns') {
    const columns = await leadRepository.getKanbanColumns()
    writeJson(res, 200, { ok: true, columns }, corsOrigin)
    return true
  }

  const detailsMatch = url.match(/^\/api\/chat\/leads\/([^/]+)\/details$/)
  if (method === 'GET' && detailsMatch) {
    const lead = await leadRepository.findById(detailsMatch[1])
    if (!lead) {
      writeJson(res, 404, { ok: false, error: 'Lead nao encontrado.' }, corsOrigin)
      return true
    }
    writeJson(res, 200, { ok: true, lead }, corsOrigin)
    return true
  }

  const historyMatch = url.match(/^\/api\/chat\/leads\/([^/]+)\/history(?:\?(.*))?$/)
  if (method === 'GET' && historyMatch) {
    const lead = await leadRepository.findById(historyMatch[1])
    if (!lead) {
      writeJson(res, 404, { ok: false, error: 'Lead nao encontrado.' }, corsOrigin)
      return true
    }

    const parsedUrl = new URL(url, 'http://localhost')
    const conversationId = parsedUrl.searchParams.get('conversation_id') || lead.evolution_remote_jid
    if (!conversationId) {
      writeJson(res, 200, { ok: true, messages: [], conversation_id: null }, corsOrigin)
      return true
    }

    const messages = await communicationEventRepository.listByConversation(conversationId)
    writeJson(res, 200, { ok: true, messages, conversation_id: conversationId }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/chat/init') {
    const body = await readJson<InitChatInput>(req)
    const leadId = asString(body.lead_id)
    const lead = leadId ? await leadRepository.findById(leadId) : null
    const phoneDigits = normalizePhoneDigits(body.phone) ?? normalizePhoneDigits(lead?.whatsapp_lead)

    if (!phoneDigits) {
      writeJson(res, 400, { ok: false, error: 'Telefone do contato nao informado.' }, corsOrigin)
      return true
    }

    const remoteJid = lead?.evolution_remote_jid ?? buildRemoteJid(phoneDigits)
    const preferredInstance = asString(body.instance_name) || lead?.evolution_instance || null

    if (lead && remoteJid && (!lead.evolution_remote_jid || !lead.evolution_instance) && preferredInstance) {
      await leadRepository.update(lead.id, {
        evolution_remote_jid: remoteJid,
        evolution_instance: preferredInstance,
      })
    }

    const messages = remoteJid
      ? await communicationEventRepository.listByConversation(remoteJid)
      : []

    writeJson(res, 200, { ok: true, remoteJid, messages }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/chat/send') {
    const body = await readJson<SendChatMessageInput>(req)
    const leadId = asString(body.lead_id)
    const content = asString(body.content)
    const lead = leadId ? await leadRepository.findById(leadId) : null
    const remoteJid = asString(body.conversation_id) || lead?.evolution_remote_jid || buildRemoteJid(normalizePhoneDigits(lead?.whatsapp_lead))

    if (!content || !remoteJid) {
      writeJson(res, 400, { ok: false, error: 'content e conversation_id sao obrigatorios.' }, corsOrigin)
      return true
    }

    const sendResult = await sendEvolutionTextMessage(externalIntegrationRepository, {
      instanceName: asString(body.instance_name) || lead?.evolution_instance || null,
      remoteJid,
      content,
    })

    if (!sendResult.ok) {
      writeJson(res, sendResult.status, { ok: false, error: sendResult.error, detail: sendResult.payload }, corsOrigin)
      return true
    }

    const messageId = parseMessageId(sendResult.payload)
    const payload: JsonRecord = {
      content,
      fromMe: true,
      messageId,
      messageType: 'conversation',
      pushName: 'Operador',
      quoted: body.quoted_message_id
        ? {
            messageId: body.quoted_message_id,
            content: body.quoted_content ?? 'Mensagem respondida',
          }
        : null,
      provider_payload: sendResult.payload,
    }

    await communicationEventRepository.create({
      source: 'evolution',
      event_type: 'message_sent',
      external_id: messageId,
      conversation_id: remoteJid,
      lead_id: lead?.id ?? null,
      contact: normalizePhoneDigits(lead?.whatsapp_lead) ?? remoteJid.replace(/@.+$/, ''),
      payload,
    })

    if (lead?.id) {
      await leadRepository.update(lead.id, {
        ultima_mensagem: content,
        resumo_conversa: content,
        status: 'conversando',
        evolution_remote_jid: remoteJid,
        evolution_instance: sendResult.instanceName,
      })
    }

    writeJson(res, 200, { ok: true, messageId, remoteJid }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/chat/internal-note') {
    const body = await readJson<SendChatMessageInput>(req)
    const leadId = asString(body.lead_id)
    const content = asString(body.content)
    const lead = leadId ? await leadRepository.findById(leadId) : null
    const remoteJid = asString(body.conversation_id) || lead?.evolution_remote_jid || null

    if (!content) {
      writeJson(res, 400, { ok: false, error: 'content e obrigatorio.' }, corsOrigin)
      return true
    }

    const event = await communicationEventRepository.create({
      source: 'crm',
      event_type: 'internal_note',
      conversation_id: remoteJid,
      lead_id: lead?.id ?? null,
      contact: normalizePhoneDigits(lead?.whatsapp_lead),
      payload: {
        content,
        fromMe: true,
        messageType: 'internalNote',
        pushName: 'Operador',
      },
    })

    writeJson(res, 200, { ok: true, event }, corsOrigin)
    return true
  }

  if (method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') return false

  if (method === 'POST' && url === '/api/chat/leads') {
    const body = await readJson<Record<string, unknown>>(req)
    const lead = await leadRepository.create({
      nome_lead: (body.nome_lead as string | null) ?? null,
      whatsapp_lead: (body.whatsapp_lead as string | null) ?? null,
      motivo_contato: (body.motivo_contato as string | null) ?? null,
      resumo_conversa: (body.resumo_conversa as string | null) ?? null,
      ultima_mensagem: (body.ultima_mensagem as string | null) ?? null,
      status: (body.status as string | null) ?? 'iniciou_conversa',
      inicio_atendimento: (body.inicio_atendimento as string | null) ?? new Date().toISOString(),
      anotacoes: (body.anotacoes as string | null) ?? null,
      data_agendamento: (body.data_agendamento as string | null) ?? null,
    })
    writeJson(res, 200, { ok: true, lead }, corsOrigin)
    return true
  }

  const leadMatch = url.match(/^\/api\/chat\/leads\/([^/]+)$/)
  if (method === 'PATCH' && leadMatch) {
    const body = await readJson<Record<string, unknown>>(req)
    const updated = await leadRepository.update(leadMatch[1], body)
    writeJson(res, 200, { ok: true, lead: updated }, corsOrigin)
    return true
  }

  if (method === 'DELETE' && leadMatch) {
    await leadRepository.deleteById(leadMatch[1])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  if (method === 'DELETE' && url === '/api/chat/leads') {
    const body = await readJson<{ ids?: string[] }>(req)
    await leadRepository.deleteMany(body.ids ?? [])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/chat/kanban-columns') {
    const body = await readJson<Record<string, unknown>>(req)
    const col = await leadRepository.saveKanbanColumn({
      id: (body.id as string | undefined) ?? undefined,
      status_key: body.status_key as string,
      label: body.label as string,
      color: (body.color as string) ?? 'text-gray-700',
      bg: (body.bg as string) ?? 'bg-gray-100',
      border: (body.border as string) ?? 'border-gray-300',
      ordem: Number(body.ordem ?? 0),
      ativo: body.ativo !== false,
    })
    writeJson(res, 200, { ok: true, column: col }, corsOrigin)
    return true
  }

  if (method === 'PATCH' && url === '/api/chat/kanban-columns/reorder') {
    const body = await readJson<{ items: { id: string; ordem: number }[] }>(req)
    await leadRepository.updateKanbanOrders(body.items ?? [])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  const colMatch = url.match(/^\/api\/chat\/kanban-columns\/([^/]+)$/)
  if (method === 'DELETE' && colMatch) {
    const body = await readJson<{ fallbackStatusKey?: string }>(req)
    await leadRepository.deleteKanbanColumn(colMatch[1], body.fallbackStatusKey ?? 'iniciou_conversa')
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  if (method === 'PATCH' && url.startsWith('/api/chat/crm/conversations/')) {
    const id = url.replace('/api/chat/crm/conversations/', '')
    if (!id) {
      writeJson(res, 400, { ok: false, error: 'ID da conversa obrigatorio.' }, corsOrigin)
      return true
    }
    const body = await readJson<JsonRecord>(req)
    const allowedFields = ['kanban_status', 'atendimento_humano', 'agente_nome', 'cliente_nome', 'telefone']
    const updates: string[] = []
    const values: unknown[] = []
    let idx = 1
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${idx++}`)
        values.push(body[field])
      }
    }
    if (!updates.length) {
      writeJson(res, 400, { ok: false, error: 'Nenhum campo valido para atualizar.' }, corsOrigin)
      return true
    }
    values.push(id)
    const sql = `UPDATE crm_chat_conversations SET ${updates.join(', ')} WHERE id = $${idx}`
    await db.query(sql, values)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/chat/crm/assignments') {
    const body = await readJson<{ conversation_id?: string; agent_id?: string; agente_nome?: string; deactivate_only?: boolean }>(req)
    const conversationId = asString(body.conversation_id)
    if (!conversationId) {
      writeJson(res, 400, { ok: false, error: 'conversation_id obrigatorio.' }, corsOrigin)
      return true
    }
    if (body.deactivate_only) {
      await db.query(`UPDATE crm_chat_assignments SET ativo = false WHERE conversation_id = $1 AND ativo = true`, [conversationId])
      writeJson(res, 200, { ok: true }, corsOrigin)
      return true
    }
    const agentId = asString(body.agent_id)
    if (!agentId) {
      writeJson(res, 400, { ok: false, error: 'agent_id obrigatorio.' }, corsOrigin)
      return true
    }
    const agentNome = asString(body.agente_nome)
    await db.query(
      `UPDATE crm_chat_assignments SET ativo = false WHERE conversation_id = $1 AND ativo = true`,
      [conversationId],
    )
    const insertResult = await db.query(
      `INSERT INTO crm_chat_assignments (conversation_id, agent_id, agente_nome, ativo) VALUES ($1, $2, $3, true) RETURNING id`,
      [conversationId, agentId, agentNome || 'Atendente'],
    )
    const assignmentId = insertResult.rows[0]?.id ?? null
    writeJson(res, 200, { ok: true, assignment_id: assignmentId }, corsOrigin)
    return true
  }

  if (method === 'PATCH' && url.startsWith('/api/chat/crm/customers/')) {
    const id = url.replace('/api/chat/crm/customers/', '')
    if (!id) {
      writeJson(res, 400, { ok: false, error: 'ID do cliente obrigatorio.' }, corsOrigin)
      return true
    }
    const body = await readJson<JsonRecord>(req)
    const allowedFields = ['nome', 'telefone_principal', 'email_principal', 'contato_status', 'observacoes']
    const updates: string[] = []
    const values: unknown[] = []
    let idx = 1
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = $${idx++}`)
        values.push(body[field])
      }
    }
    if (!updates.length) {
      writeJson(res, 400, { ok: false, error: 'Nenhum campo valido para atualizar.' }, corsOrigin)
      return true
    }
    values.push(id)
    await db.query(`UPDATE crm_customers SET ${updates.join(', ')} WHERE id = $${idx}`, values)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/chat/crm/events') {
    const body = await readJson<JsonRecord>(req)
    const source = asString(body.source) || 'crm'
    const eventType = asString(body.event_type)
    if (!eventType) {
      writeJson(res, 400, { ok: false, error: 'event_type obrigatorio.' }, corsOrigin)
      return true
    }
    const conversationId = body.conversation_id !== undefined && body.conversation_id !== null ? String(body.conversation_id) : null
    const contact = body.contact !== undefined && body.contact !== null ? String(body.contact) : null
    const leadId = body.lead_id !== undefined && body.lead_id !== null ? String(body.lead_id) : null
    const payload = (body.payload && typeof body.payload === 'object') ? JSON.stringify(body.payload) : '{}'
    const externalId = body.external_id !== undefined && body.external_id !== null ? String(body.external_id) : null
    const result = await db.query(
      `INSERT INTO communication_events (source, event_type, conversation_id, contact, lead_id, payload, external_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [source, eventType, conversationId, contact, leadId, payload, externalId],
    )
    writeJson(res, 200, { ok: true, event_id: result.rows[0]?.id ?? null }, corsOrigin)
    return true
  }

  return false
}


