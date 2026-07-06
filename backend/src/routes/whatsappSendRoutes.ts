import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadConfig } from '../config/env.js'
import { createAivenSqlClient } from '../db/aivenClient.js'
import type { ExternalIntegrationRepository } from '../repositories/externalIntegrationRepository.js'
import type { LinksProdutosRepository } from '../repositories/linksProdutosRepository.js'
import type { RenovacaoRepository, RenovacaoRow } from '../repositories/renovacaoRepository.js'
import { CommunicationEventRepository } from '../repositories/communicationEventRepository.js'
import { readJson, writeJson } from '../utils/http.js'

interface SendWhatsAppInput {
  phone: string
  body: string
  instance_name?: string
  canal?: 'atendimento' | 'renovacao'
}

type JsonRecord = Record<string, unknown>

type EvolutionControlInput = {
  base_url?: string
  api_token?: string
  instance_name?: string
  webhook_url?: string
}

type NormalizedEvolutionEvent = {
  eventType: string | null
  instanceName: string | null
  conversationId: string | null
  contactDigits: string | null
  externalMessageId: string | null
  pushName: string | null
  fromMe: boolean
  messageType: string
  content: string | null
  mimeType: string | null
  fileName: string | null
  mediaUrl: string | null
  quoted: { messageId: string; content: string } | null
  raw: JsonRecord
}

type LeadRow = {
  id: string
  nome_lead: string | null
  whatsapp_lead: string | null
  resumo_conversa: string | null
  ultima_mensagem: string | null
  status: string | null
  evolution_remote_jid: string | null
  evolution_instance: string | null
}

const config = loadConfig()
const db = createAivenSqlClient()
const communicationEventRepository = new CommunicationEventRepository(db)

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function pickString(source: JsonRecord | null, ...keys: string[]) {
  if (!source) return ''
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function parseMessageId(payload: JsonRecord | null | undefined) {
  if (!payload || typeof payload !== 'object') return null
  const key = asRecord(payload.key)
  if (key) {
    const direct = pickString(key, 'id')
    if (direct) return direct
  }
  const response = asRecord(payload.response)
  const responseKey = asRecord(response?.key)
  if (responseKey) {
    const nested = pickString(responseKey, 'id')
    if (nested) return nested
  }
  return pickString(payload, 'messageId', 'id') || null
}

function cleanBaseUrl(value: string) {
  const raw = value.trim()
  if (!raw) return ''
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : ('https://' + raw.replace(/^\/+/,'') )
  return withProtocol.replace(/\/$/, '')
}

function normalizePhoneDigits(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('55')) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

function buildRemoteJid(phoneDigits: string | null) {
  return phoneDigits ? `${phoneDigits}@s.whatsapp.net` : null
}

function inferCanalFromInstance(instanceName: string | null | undefined) {
  const normalized = String(instanceName ?? '').trim().toLowerCase()
  if (!normalized) return 'atendimento'
  if (normalized.includes('renov') || normalized.includes('certiid')) return 'renovacao'
  return 'atendimento'
}

function chooseIntegrationByCanal(
  integrations: Awaited<ReturnType<ExternalIntegrationRepository['findActiveWhatsApp']>>,
  canal: 'atendimento' | 'renovacao' | null | undefined,
) {
  if (!canal) return integrations[0] ?? null

  const target = canal === 'renovacao'
    ? integrations.find(item => inferCanalFromInstance(item.instance_name) === 'renovacao')
    : integrations.find(item => inferCanalFromInstance(item.instance_name) === 'atendimento')

  return target ?? integrations[0] ?? null
}

function calculateDiasRestantes(dataVencimento: string | null | undefined) {
  const dateStr = String(dataVencimento ?? '').slice(0, 10)
  if (!dateStr) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const venc = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(venc.getTime())) return null
  venc.setHours(0, 0, 0, 0)
  return Math.round((venc.getTime() - hoje.getTime()) / 86400000)
}

function extractMessageContent(message: JsonRecord | null) {
  if (!message) {
    return {
      content: null,
      messageType: 'conversation',
      mimeType: null,
      fileName: null,
      mediaUrl: null,
      quoted: null as { messageId: string; content: string } | null,
    }
  }

  const entry = Object.entries(message).find(([, value]) => value !== null && value !== undefined)
  const messageType = entry?.[0] ?? 'conversation'
  const payload = asRecord(entry?.[1])
  const context = asRecord(payload?.contextInfo)
  const quotedMessage = asRecord(context?.quotedMessage)
  const quotedEntry = quotedMessage ? Object.entries(quotedMessage).find(([, value]) => value !== null && value !== undefined) : null
  const quotedPayload = asRecord(quotedEntry?.[1])
  const quotedContent = pickString(quotedPayload, 'text', 'caption') || (typeof quotedEntry?.[1] === 'string' ? quotedEntry[1] : '')
  const fallbackContent = typeof entry?.[1] === 'string' ? entry[1] : ''

  return {
    content: pickString(payload, 'text', 'caption', 'conversation') || fallbackContent || null,
    messageType,
    mimeType: pickString(payload, 'mimetype') || null,
    fileName: pickString(payload, 'fileName', 'title') || null,
    mediaUrl: pickString(payload, 'url', 'mediaUrl') || null,
    quoted: pickString(context, 'stanzaId')
      ? { messageId: pickString(context, 'stanzaId'), content: quotedContent || 'Mensagem respondida' }
      : null,
  }
}

function normalizeEvolutionEvent(body: JsonRecord): NormalizedEvolutionEvent {
  const data = asRecord(body.data)
  const key = asRecord(data?.key) ?? asRecord(body.key)
  const message = asRecord(data?.message) ?? asRecord(body.message)
  const extracted = extractMessageContent(message)

  const rawConversationId =
    pickString(body, 'conversationId', 'remoteJid', 'chatId')
    || pickString(data, 'remoteJid', 'chatId', 'conversationId')
    || pickString(key, 'remoteJid')
    || ''

  const contactDigits = normalizePhoneDigits(
    pickString(body, 'contact', 'phone', 'number')
    || pickString(data, 'contact', 'phone', 'number')
    || (rawConversationId ? rawConversationId.split('@')[0] : ''),
  )

  return {
    eventType: pickString(body, 'event', 'eventType', 'type') || pickString(data, 'eventType', 'type') || null,
    instanceName: pickString(body, 'instance', 'instanceName') || pickString(data, 'instance', 'instanceName') || null,
    conversationId: rawConversationId || buildRemoteJid(contactDigits),
    contactDigits,
    externalMessageId: pickString(body, 'messageId', 'externalId') || pickString(data, 'id', 'messageId') || pickString(key, 'id') || null,
    pushName: pickString(body, 'pushName') || pickString(data, 'pushName') || pickString(key, 'pushName') || null,
    fromMe: Boolean(body.fromMe ?? data?.fromMe ?? key?.fromMe ?? false),
    messageType: pickString(body, 'messageType') || pickString(data, 'messageType') || extracted.messageType,
    content: pickString(body, 'content') || pickString(data, 'content') || extracted.content,
    mimeType: pickString(body, 'mimeType') || pickString(data, 'mimeType') || extracted.mimeType,
    fileName: pickString(body, 'fileName') || pickString(data, 'fileName') || extracted.fileName,
    mediaUrl: pickString(body, 'mediaUrl') || pickString(data, 'mediaUrl') || extracted.mediaUrl,
    quoted: extracted.quoted,
    raw: body,
  }
}

async function findLeadByPhone(phoneDigits: string) {
  const result = await db.query<LeadRow>(
    `SELECT id, nome_lead, whatsapp_lead, resumo_conversa, ultima_mensagem, status, evolution_remote_jid, evolution_instance
       FROM leads_contabilidade
      WHERE regexp_replace(coalesce(whatsapp_lead, ''), '\\D', '', 'g') = $1
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1`,
    [phoneDigits],
  )

  return result.rows[0] ?? null
}

async function upsertLeadFromEvolutionEvent(event: NormalizedEvolutionEvent) {
  const phoneDigits = event.contactDigits
  if (!phoneDigits) return null

  const summary = event.content || (event.fileName ? `Arquivo: ${event.fileName}` : null)
  const existing = await findLeadByPhone(phoneDigits)
  const motivoContato = inferCanalFromInstance(event.instanceName) === 'renovacao'
    ? 'renovacao_clara'
    : 'whatsapp_evolution'

  if (existing) {
    const result = await db.query<LeadRow>(
      `UPDATE leads_contabilidade
          SET nome_lead = coalesce(nome_lead, $2),
              whatsapp_lead = coalesce($3, whatsapp_lead),
              resumo_conversa = CASE WHEN $4::text IS NULL OR $6::boolean THEN resumo_conversa ELSE $4 END,
              ultima_mensagem = coalesce($4, ultima_mensagem),
              motivo_contato = CASE WHEN $8::text IS NULL OR $6::boolean THEN motivo_contato ELSE $8 END,
              status = CASE WHEN $6::boolean THEN coalesce(status, 'conversando') ELSE 'conversando' END,
              evolution_remote_jid = coalesce($5, evolution_remote_jid),
              evolution_instance = coalesce($7, evolution_instance),
              updated_at = now()
        WHERE id = $1::uuid
      RETURNING id, nome_lead, whatsapp_lead, resumo_conversa, ultima_mensagem, status, evolution_remote_jid, evolution_instance`,
      [
        existing.id,
        event.pushName ?? null,
        phoneDigits,
        summary,
        event.conversationId ?? null,
        event.fromMe,
        event.instanceName ?? null,
        motivoContato,
      ],
    )

    return result.rows[0] ?? existing
  }

  if (event.fromMe) return null

  const created = await db.query<LeadRow>(
    `INSERT INTO leads_contabilidade
       (
         nome_lead,
         whatsapp_lead,
         motivo_contato,
         resumo_conversa,
         ultima_mensagem,
         status,
         evolution_remote_jid,
         evolution_instance,
         inicio_atendimento
       )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, nome_lead, whatsapp_lead, resumo_conversa, ultima_mensagem, status, evolution_remote_jid, evolution_instance`,
    [
      event.pushName ?? null,
      phoneDigits,
      motivoContato,
      summary,
      summary,
      'iniciou_conversa',
      event.conversationId ?? null,
      event.instanceName ?? null,
      new Date().toISOString(),
    ],
  )

  return created.rows[0] ?? null
}

async function testEvolutionConnection(input: EvolutionControlInput) {
  const baseUrl = cleanBaseUrl(asString(input.base_url))
  const apiToken = asString(input.api_token)
  const instanceName = asString(input.instance_name)

  if (!baseUrl || !apiToken || !instanceName) {
    return { status: 400, payload: { ok: false, error: 'base_url, api_token e instance_name sao obrigatorios.' } }
  }

  const endpoint = `${baseUrl}/instance/connectionState/${instanceName}`
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiToken,
    },
  })

  const payload = await response.json().catch(() => ({})) as JsonRecord
  const state = pickString(asRecord(payload.instance), 'state') || pickString(payload, 'state') || pickString(asRecord(payload.response), 'state') || 'desconhecido'
  const normalizedState = state.toLowerCase()
  const connectedStates = new Set(['open', 'opened', 'connected', 'online'])

  if (!response.ok) {
    const error = response.status === 404
      ? `Evolution retornou HTTP 404. Verifique a URL base e o nome exato da instância (${instanceName}). Endpoint testado: ${endpoint}`
      : `Evolution retornou HTTP ${response.status}`
    return { status: 502, payload: { ok: false, error, state, detail: payload } }
  }

  if (!connectedStates.has(normalizedState)) {
    return { status: 200, payload: { ok: false, state, error: `Estado da instância: ${state}` } }
  }

  return { status: 200, payload: { ok: true, state } }
}

async function configureEvolutionWebhook(input: EvolutionControlInput) {
  const baseUrl = cleanBaseUrl(asString(input.base_url))
  const apiToken = asString(input.api_token)
  const instanceName = asString(input.instance_name)
  const webhookUrl = asString(input.webhook_url)

  if (!baseUrl || !apiToken || !instanceName || !webhookUrl) {
    return { status: 400, payload: { ok: false, error: 'base_url, api_token, instance_name e webhook_url sao obrigatorios.' } }
  }

  const endpoint = `${baseUrl}/webhook/set/${instanceName}`
  const defaultEvents = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE']
  const attempts: JsonRecord[] = [
    {
      webhook: {
        url: webhookUrl,
        enabled: true,
        byEvents: false,
        base64: true,
        events: defaultEvents,
      },
    },
  ]

  const errors: string[] = []

  for (const body of attempts) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiToken,
      },
      body: JSON.stringify(body),
    })

    const payload = await response.json().catch(() => ({})) as JsonRecord
    if (response.ok) {
      return { status: 200, payload: { ok: true, webhook_url: webhookUrl, detail: payload } }
    }

    errors.push(`HTTP ${response.status}`)
  }

  return { status: 502, payload: { ok: false, error: `Falha ao configurar webhook na Evolution (${errors.join(', ') || 'sem resposta valida'}).` } }
}

async function forwardInboundToN8n(
  event: NormalizedEvolutionEvent,
  leadId: string | null,
  renovacaoRepo: RenovacaoRepository,
  linksRepo: LinksProdutosRepository,
) {
  if (!config.n8nWebhookUrl || event.fromMe) return { forwarded: false, error: null as string | null }

  const canal = inferCanalFromInstance(event.instanceName)
  let renovacao: RenovacaoRow | null = null
  let linkRenovacao: string | null = null

  if (canal === 'renovacao' && event.contactDigits) {
    renovacao = await renovacaoRepo.findLatestByPhone(event.contactDigits)
    if (renovacao?.tipo_certificado) {
      const linkProduto = await linksRepo.findBestByTipoCertificado(renovacao.tipo_certificado)
      linkRenovacao = linkProduto?.link_renovacao ?? null
    }
  }

  const customerName = renovacao?.razao_social ?? renovacao?.cliente ?? event.pushName ?? null
  const customerEmail = renovacao?.email ?? null
  const messageText = event.content ?? ''
  const context = {
    tipo_fluxo: canal === 'renovacao' ? 'renovacao' : 'atendimento',
    flow_type: canal === 'renovacao' ? 'renovacao' : 'atendimento',
    channel: 'whatsapp',
    source: 'evolution',
    conversation_id: event.conversationId,
    customer_phone: event.contactDigits,
    customer_name: customerName,
    customer_email: customerEmail,
    renovacao_id: renovacao?.id ?? null,
    pedido: renovacao?.pedido ?? null,
    protocolo: renovacao?.protocolo ?? null,
    tipo_certificado: renovacao?.tipo_certificado ?? null,
    data_vencimento: renovacao?.data_vencimento?.slice(0, 10) ?? null,
    dias_restantes: calculateDiasRestantes(renovacao?.data_vencimento),
    valor: renovacao?.valor ?? null,
    cpf: renovacao?.cpf ?? null,
    cnpj: renovacao?.cnpj ?? null,
    link_renovacao: linkRenovacao,
  }

  try {
    const response = await fetch(config.n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'evolution',
        channel: 'whatsapp',
        canal,
        event_type: event.eventType,
        conversation_id: event.conversationId,
        customer_phone: event.contactDigits,
        customer_name: customerName,
        customer_email: customerEmail,
        message_text: messageText,
        contact: event.contactDigits,
        lead_id: leadId,
        instance_name: event.instanceName,
        context,
        message: {
          id: event.externalMessageId,
          from_me: event.fromMe,
          type: event.messageType,
          content: event.content,
          mime_type: event.mimeType,
          file_name: event.fileName,
          media_url: event.mediaUrl,
          quoted: event.quoted,
          push_name: event.pushName,
        },
        payload: event.raw,
      }),
    })

    if (!response.ok) {
      return { forwarded: false, error: `N8N retornou HTTP ${response.status}` }
    }

    return { forwarded: true, error: null }
  } catch (error) {
    return { forwarded: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function handleWhatsappSendRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  integrationRepo: ExternalIntegrationRepository,
  renovacaoRepo: RenovacaoRepository,
  linksRepo: LinksProdutosRepository,
  corsOrigin: string,
): Promise<boolean> {
  const url = req.url ?? ''
  const method = req.method ?? ''

  if (method === 'POST' && url === '/api/evolution/connection/test') {
    const body = await readJson<EvolutionControlInput>(req)
    const result = await testEvolutionConnection(body)
    writeJson(res, result.status, result.payload, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/evolution/webhook/configure') {
    const body = await readJson<EvolutionControlInput>(req)
    const result = await configureEvolutionWebhook(body)
    writeJson(res, result.status, result.payload, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/webhooks/evolution') {
    const body = await readJson<JsonRecord>(req)
    const normalized = normalizeEvolutionEvent(body)

    if (normalized.conversationId && /@(g\.us|broadcast|newsletter)$/i.test(normalized.conversationId)) {
      writeJson(res, 200, { ok: true, skipped: true, reason: 'non-personal chat' }, corsOrigin)
      return true
    }

    const lead = normalized.eventType === 'messages.update'
      ? null
      : await upsertLeadFromEvolutionEvent(normalized)

    const payload: JsonRecord = {
      ...normalized.raw,
      content: normalized.content,
      fromMe: normalized.fromMe,
      messageId: normalized.externalMessageId,
      messageType: normalized.messageType,
      pushName: normalized.pushName,
      mimeType: normalized.mimeType,
      fileName: normalized.fileName,
      mediaUrl: normalized.mediaUrl,
      quoted: normalized.quoted,
      conversationId: normalized.conversationId,
      documentKey: normalized.contactDigits,
      instanceName: normalized.instanceName,
      instance_name: normalized.instanceName,
    }

    const eventRow = await communicationEventRepository.create({
      source: 'evolution',
      event_type: normalized.eventType ?? 'message_received',
      external_id: normalized.externalMessageId,
      conversation_id: normalized.conversationId,
      lead_id: lead?.id ?? null,
      contact: normalized.contactDigits,
      payload,
    })

    const forwarded = await forwardInboundToN8n(normalized, lead?.id ?? null, renovacaoRepo, linksRepo)

    writeJson(res, 200, {
      ok: true,
      conversation_id: eventRow.conversation_id,
      lead_id: lead?.id ?? null,
      forwarded_to_n8n: forwarded.forwarded,
      n8n_error: forwarded.error,
    }, corsOrigin)
    return true
  }

  if (method !== 'POST' || url !== '/api/whatsapp/send') return false

  const body = await readJson<SendWhatsAppInput>(req)
  if (!body?.phone || !body?.body) {
    writeJson(res, 400, { ok: false, error: 'phone e body sao obrigatorios' }, corsOrigin)
    return true
  }
  const destinationNumber = normalizePhoneDigits(body.phone)
  if (!destinationNumber) {
    writeJson(res, 400, { ok: false, error: 'phone invalido' }, corsOrigin)
    return true
  }

  const integrations = await integrationRepo.findActiveWhatsApp()
  let integration = chooseIntegrationByCanal(integrations, body.canal)

  if (body.instance_name) {
    const byInstance = integrations.find(i => i.instance_name === body.instance_name)
    if (byInstance) integration = byInstance
  }

  if (!integration?.base_url || !integration?.api_token || !integration?.instance_name) {
    writeJson(res, 422, { ok: false, error: 'Nenhuma integracao WhatsApp ativa configurada.' }, corsOrigin)
    return true
  }

  const baseUrl = integration.base_url.replace(/\/$/, '')
  const evolutionUrl = `${baseUrl}/message/sendText/${integration.instance_name}`

  try {
    const evRes = await fetch(evolutionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: integration.api_token,
      },
      body: JSON.stringify({ number: destinationNumber, text: body.body }),
    })

    const payload = await evRes.json().catch(() => ({ status: evRes.status })) as Record<string, unknown>

    if (!evRes.ok) {
      writeJson(res, 502, { ok: false, error: `Evolution retornou HTTP ${evRes.status}`, detail: payload }, corsOrigin)
      return true
    }

    const remoteJid = buildRemoteJid(destinationNumber)
    const messageId = parseMessageId(payload)
    const canal = body.canal ?? inferCanalFromInstance(integration.instance_name)

    await communicationEventRepository.create({
      source: 'evolution',
      event_type: 'message_sent',
      external_id: messageId,
      conversation_id: remoteJid,
      lead_id: null,
      contact: destinationNumber,
      payload: {
        content: body.body,
        fromMe: true,
        canal,
        messageId,
        messageType: 'conversation',
        pushName: integration.sender_name || integration.name || 'Operador',
        conversationId: remoteJid,
        documentKey: destinationNumber,
        instanceName: integration.instance_name,
        instance_name: integration.instance_name,
        provider_payload: payload,
      },
    })

    writeJson(res, 200, { ok: true, payload }, corsOrigin)
  } catch (err) {
    writeJson(res, 502, { ok: false, error: String(err) }, corsOrigin)
  }

  return true
}



