import type { IncomingMessage, ServerResponse } from 'node:http'
import type { BackendConfig } from '../config/env.js'
import type { AivenSqlClient } from '../db/aivenClient.js'
import type { CommunicationEventRepository } from '../repositories/communicationEventRepository.js'
import type { ExternalIntegrationRepository } from '../repositories/externalIntegrationRepository.js'
import type { ConfigRepository } from '../repositories/configRepository.js'
import type { FileRepository } from '../repositories/fileRepository.js'
import type { LeadRepository } from '../repositories/leadRepository.js'
import { readJson, writeJson } from '../utils/http.js'
import { buildStoredPath, getStorageRoot, readFile, saveFile } from '../utils/storage.js'

type JsonRecord = Record<string, unknown>

type ViewerProfile = {
  id: string
  perfil: string
  tipo_vinculo: string | null
  parceiro_id: string | null
  nome: string | null
  vinculo_nome: string | null
  ponto_atendimento_id: string | null
}


type SendChatMessageInput = {
  lead_id?: string
  conversation_id?: string
  content?: string
  instance_name?: string
  sender_name?: string | null
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


function buildViewerNameMatchSql(columnExpression: string, viewerAlias = 'viewer') {
  return `(
    (${viewerAlias}.nome_norm <> '' AND lower(btrim(coalesce(${columnExpression}, ''))) = ${viewerAlias}.nome_norm)
    OR (${viewerAlias}.vinculo_nome_norm <> '' AND lower(btrim(coalesce(${columnExpression}, ''))) = ${viewerAlias}.vinculo_nome_norm)
  )`
}

function buildConversationDocumentMatchSql(conversationAlias: string, customerDocExpression: string, customerPhoneExpression: string) {
  const convCpf = `regexp_replace(coalesce(${conversationAlias}.cpf, ''), '\\D', '', 'g')`
  const convCnpj = `regexp_replace(coalesce(${conversationAlias}.cnpj, ''), '\\D', '', 'g')`
  const convPhone = `right(regexp_replace(coalesce(${conversationAlias}.telefone, ${conversationAlias}.document_key, ''), '\\D', '', 'g'), 11)`
  const targetDoc = `regexp_replace(coalesce(${customerDocExpression}, ''), '\\D', '', 'g')`
  const targetPhone = `right(regexp_replace(coalesce(${customerPhoneExpression}, ''), '\\D', '', 'g'), 11)`

  return `(
    (${targetDoc} <> '' AND ${targetDoc} IN (${convCpf}, ${convCnpj}))
    OR (${targetPhone} <> '' AND ${convPhone} <> '' AND ${targetPhone} = ${convPhone})
  )`
}

function buildConversationRenewalMatchSql(conversationAlias: string, renewalAlias: string) {
  const convCpf = `regexp_replace(coalesce(${conversationAlias}.cpf, ''), '\\D', '', 'g')`
  const convCnpj = `regexp_replace(coalesce(${conversationAlias}.cnpj, ''), '\\D', '', 'g')`
  const convPhone = `right(regexp_replace(coalesce(${conversationAlias}.telefone, ${conversationAlias}.document_key, ''), '\\D', '', 'g'), 11)`
  const renewalCpf = `regexp_replace(coalesce(${renewalAlias}.cpf, ''), '\\D', '', 'g')`
  const renewalCnpj = `regexp_replace(coalesce(${renewalAlias}.cnpj, ''), '\\D', '', 'g')`
  const renewalPhone = `right(regexp_replace(coalesce(${renewalAlias}.telefone, ''), '\\D', '', 'g'), 11)`

  return `(
    (${renewalCpf} <> '' AND ${renewalCpf} IN (${convCpf}, ${convCnpj}))
    OR (${renewalCnpj} <> '' AND ${renewalCnpj} IN (${convCpf}, ${convCnpj}))
    OR (${renewalPhone} <> '' AND ${convPhone} <> '' AND ${renewalPhone} = ${convPhone})
  )`
}

function buildConversationVisibilitySql(conversationAlias: string, viewerAlias = 'viewer') {
  const assignedToViewer = `EXISTS (
    SELECT 1
    FROM crm_chat_assignments ca
    WHERE ca.conversation_id = ${conversationAlias}.id::text
      AND ca.ativo = true
      AND ca.agent_id::text = ${viewerAlias}.id
  )`

  const vendaVinculada = `EXISTS (
    SELECT 1
    FROM vendas_certificados vc
    LEFT JOIN cadastros_base cb ON cb.id = vc.cadastro_base_id
    WHERE ${buildConversationDocumentMatchSql(conversationAlias, 'cb.cpf_cnpj', 'cb.telefone')}
      AND (
        vc.vendedor_id::text = ${viewerAlias}.id
        OR vc.agente_registro_id::text = ${viewerAlias}.id
        OR (${viewerAlias}.ponto_atendimento_id IS NOT NULL AND vc.ponto_atendimento_id::text = ${viewerAlias}.ponto_atendimento_id)
      )
  )`

  const agendamentoVinculado = `EXISTS (
    SELECT 1
    FROM agendamentos_validacao av
    LEFT JOIN cadastros_base cb ON cb.id = av.cadastro_base_id
    WHERE ${buildConversationDocumentMatchSql(conversationAlias, 'cb.cpf_cnpj', 'cb.telefone')}
      AND (
        av.agente_registro_id::text = ${viewerAlias}.id
        OR (${viewerAlias}.ponto_atendimento_id IS NOT NULL AND av.ponto_atendimento_id::text = ${viewerAlias}.ponto_atendimento_id)
        OR av.contador_id::text = ${viewerAlias}.id
      )
  )`

  const renovacaoVinculada = `EXISTS (
    SELECT 1
    FROM renovacoes r
    WHERE ${buildConversationRenewalMatchSql(conversationAlias, 'r')}
      AND (
        r.vendedor_fk_id::text = ${viewerAlias}.id
        OR r.agente_registro_fk_id::text = ${viewerAlias}.id
        OR r.contador_fk_id::text = ${viewerAlias}.id
        OR (${viewerAlias}.perfil = 'vendedor' AND ${buildViewerNameMatchSql('r.vendedor', viewerAlias)})
        OR ((${viewerAlias}.perfil = 'agente_registro' OR ${viewerAlias}.tipo_vinculo = 'agente_registro') AND ${buildViewerNameMatchSql('r.agr', viewerAlias)})
        OR (${viewerAlias}.tipo_vinculo = 'contador' AND ${buildViewerNameMatchSql('r.contador', viewerAlias)})
      )
  )`

  return `(
    ${viewerAlias}.perfil IN ('admin', 'superadmin')
    OR ${assignedToViewer}
    OR (
      ${viewerAlias}.perfil = 'vendedor'
      AND (${vendaVinculada} OR ${renovacaoVinculada})
    )
    OR (
      (${viewerAlias}.perfil IN ('agente_registro', 'atendente') OR ${viewerAlias}.tipo_vinculo = 'agente_registro')
      AND (${vendaVinculada} OR ${agendamentoVinculado} OR ${renovacaoVinculada})
    )
    OR (
      ${viewerAlias}.tipo_vinculo = 'parceiro'
      AND (${vendaVinculada} OR ${agendamentoVinculado})
    )
    OR (
      ${viewerAlias}.tipo_vinculo = 'contador'
      AND (${agendamentoVinculado} OR ${renovacaoVinculada})
    )
    OR (
      ${viewerAlias}.perfil = 'usuario'
      AND ${assignedToViewer}
    )
    OR EXISTS (
      SELECT 1 FROM user_conversation_access uca
      WHERE uca.user_id::text = ${viewerAlias}.id
        AND (${conversationAlias}.document_key = uca.telefone
             OR ${conversationAlias}.telefone = uca.telefone)
    )
  )`
}

async function loadViewerProfile(db: AivenSqlClient, viewerId: string): Promise<ViewerProfile | null> {
  const result = await db.query<ViewerProfile>(
    `SELECT
       id::text AS id,
       perfil,
       tipo_vinculo,
       parceiro_id::text AS parceiro_id,
       nome,
       vinculo_nome,
       ponto_atendimento_id::text AS ponto_atendimento_id
     FROM profiles
     WHERE id::text = $1 OR clerk_user_id = $1
     LIMIT 1`,
    [viewerId],
  )
  return result.rows[0] ?? null
}

async function canViewerAccessConversation(
  db: AivenSqlClient,
  viewerId: string,
  conversationId: string,
  documentKey: string,
) {
  const viewer = await loadViewerProfile(db, viewerId)
  if (!viewer) return false

  const result = await db.query<{ allowed: boolean }>(
    `WITH viewer AS (
       SELECT
         $1::text AS id,
         $2::text AS perfil,
         $3::text AS tipo_vinculo,
         $4::text AS parceiro_id,
         lower(btrim(coalesce($5::text, ''))) AS nome_norm,
         lower(btrim(coalesce($6::text, ''))) AS vinculo_nome_norm,
         $7::text AS ponto_atendimento_id
     )
     SELECT EXISTS (
       SELECT 1
       FROM crm_chat_admin_view conv
       CROSS JOIN viewer
       WHERE (conv.id::text = $8 OR conv.document_key = $9)
         AND ${buildConversationVisibilitySql('conv')}
     ) AS allowed`,
    [
      viewer.id,
      viewer.perfil,
      viewer.tipo_vinculo,
      viewer.parceiro_id,
      viewer.nome,
      viewer.vinculo_nome,
      viewer.ponto_atendimento_id,
      conversationId,
      documentKey,
    ],
  )

  return Boolean(result.rows[0]?.allowed)
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
  fileRepository: FileRepository,
  configRepository: ConfigRepository,
  db: AivenSqlClient,
  corsOrigin: string,
  config: BackendConfig,
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

  if (url === '/api/chat/crm/config') {
    if (method === 'GET') {
      const value = await configRepository.get('timeout_automation')
      writeJson(res, 200, { ok: true, ...value }, corsOrigin)
      return true
    }
    if (method === 'PUT') {
      const body = await readJson<Record<string, unknown>>(req)
      const enabled = Boolean(body.enabled)
      const minutes = Number(body.minutes) || 10
      const clara_webhook = String(body.clara_webhook ?? 'https://auto.mantovan.com.br/webhook/avmd-clara-inbound')
      await configRepository.set('timeout_automation', { enabled, minutes, clara_webhook })
      writeJson(res, 200, { ok: true }, corsOrigin)
      return true
    }
  }

  if (method === 'POST' && url === '/api/chat/crm/check-timeout') {
    const config = await configRepository.get('timeout_automation')
    if (!config.enabled) {
      writeJson(res, 200, { ok: true, triggered: 0, message: 'timeout desligado' }, corsOrigin)
      return true
    }
    const stale = await db.query<any>(
      `SELECT c.id, c.document_key, c.whatsapp_instance, c.cliente_nome, c.ultima_mensagem, c.ultima_interacao_em, c.fila,
              coalesce(cust.nome, c.cliente_nome) as nome_crm, cust.email as email_principal,
              (SELECT jsonb_agg(jsonb_build_object('role', m.direction, 'content', m.mensagem, 'sender', m.sender_name) ORDER BY m.created_at)
               FROM (SELECT * FROM crm_chat_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 20) m
              ) as ultimas_mensagens
       FROM crm_chat_conversations c
       LEFT JOIN crm_customers cust ON cust.id = c.crm_customer_id
       WHERE c.ultima_mensagem_direcao = 'incoming'
         AND c.ultima_interacao_em < NOW() - ($1 || ' minutes')::INTERVAL
         AND c.atendimento_humano = false
       ORDER BY c.ultima_interacao_em ASC`,
      [String(config.minutes)],
    )
    const triggered: string[] = []
    for (const conv of stale.rows) {
      try {
        const body = JSON.stringify({
          conversation_id: conv.id,
          document_key: conv.document_key,
          instance: conv.whatsapp_instance,
          cliente_nome: conv.nome_crm ?? conv.cliente_nome,
          fila: conv.fila,
          ultima_mensagem: conv.ultima_mensagem,
          historico: conv.ultimas_mensagens ?? [],
        })
        await fetch(config.clara_webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        triggered.push(conv.id)
      } catch (err) {
        process.stderr.write(`[check-timeout] erro clara para ${conv.id}: ${String(err)}\n`)
      }
    }
    writeJson(res, 200, { ok: true, triggered: triggered.length, conversation_ids: triggered }, corsOrigin)
    return true
  }

  if (method === 'GET' && url.startsWith('/api/chat/crm/conversations')) {
    const parsedUrl = new URL(url, 'http://localhost')
    const viewerId = parsedUrl.searchParams.get('profile_id') ?? ''

    if (!viewerId) {
      writeJson(res, 400, { ok: false, error: 'profile_id obrigatorio.' }, corsOrigin)
      return true
    }

    const viewer = await loadViewerProfile(db, viewerId)
    if (!viewer) {
      writeJson(res, 404, { ok: false, error: 'Perfil do usuario nao encontrado.' }, corsOrigin)
      return true
    }

    const result = await db.query<any>(
      `WITH viewer AS (
         SELECT
           $1::text AS id,
           $2::text AS perfil,
           $3::text AS tipo_vinculo,
           $4::text AS parceiro_id,
           lower(btrim(coalesce($5::text, ''))) AS nome_norm,
           lower(btrim(coalesce($6::text, ''))) AS vinculo_nome_norm,
           $7::text AS ponto_atendimento_id
       )
        SELECT conv.*,
               EXISTS (SELECT 1 FROM crm_chat_messages WHERE conversation_id = conv.id AND direction = 'outgoing') AS tem_resposta
        FROM crm_chat_admin_view conv
        CROSS JOIN viewer
        WHERE ${buildConversationVisibilitySql('conv')}
        ORDER BY conv.ultima_interacao_em DESC NULLS LAST`,
      [
        viewer.id,
        viewer.perfil,
        viewer.tipo_vinculo,
        viewer.parceiro_id,
        viewer.nome,
        viewer.vinculo_nome,
        viewer.ponto_atendimento_id,
      ],
    )
    writeJson(res, 200, { ok: true, data: result.rows }, corsOrigin)
    return true
  }

  if (method === 'GET' && url.startsWith('/api/chat/crm/messages')) {
    const parsedUrl = new URL(url, 'http://localhost')
    const conversationId = parsedUrl.searchParams.get('conversation_id') ?? ''
    const documentKey = parsedUrl.searchParams.get('document_key') ?? ''
    const viewerId = parsedUrl.searchParams.get('profile_id') ?? ''
    if (!conversationId && !documentKey) {
      writeJson(res, 400, { ok: false, error: 'conversation_id ou document_key obrigatorio.' }, corsOrigin)
      return true
    }
    if (!viewerId) {
      writeJson(res, 400, { ok: false, error: 'profile_id obrigatorio.' }, corsOrigin)
      return true
    }

    const allowed = await canViewerAccessConversation(db, viewerId, conversationId, documentKey)
    if (!allowed) {
      writeJson(res, 403, { ok: false, error: 'Sem permissao para acessar essa conversa.' }, corsOrigin)
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

  if (method === 'GET' && url.startsWith('/api/chat/leads')) {
    const parsedUrl = new URL(url, 'http://localhost')
    const from = parsedUrl.searchParams.get('from') ?? undefined
    const to = parsedUrl.searchParams.get('to') ?? undefined
    const leads = await leadRepository.findAll(from, to)
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
      pushName: body.sender_name || 'Operador',
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
        pushName: body.sender_name || 'Operador',
      },
    })

    writeJson(res, 200, { ok: true, event }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/chat/send-email') {
    const body = await readJson<Record<string, unknown>>(req)
    const to = asString(body.to)
    const subject = asString(body.subject)
    const textBody = asString(body.body)
    const conversationId = asString(body.conversation_id)
    const leadId = asString(body.lead_id)
    const fromName = asString(body.from_name) || 'Certifast'

    if (!to) {
      writeJson(res, 400, { ok: false, error: 'to (destinatario) obrigatorio.' }, corsOrigin)
      return true
    }
    if (!subject) {
      writeJson(res, 400, { ok: false, error: 'subject (assunto) obrigatorio.' }, corsOrigin)
      return true
    }
    if (!textBody) {
      writeJson(res, 400, { ok: false, error: 'body (corpo) obrigatorio.' }, corsOrigin)
      return true
    }

    const event = await communicationEventRepository.create({
      source: 'email',
      event_type: 'email_sent',
      conversation_id: conversationId || to,
      lead_id: leadId || null,
      contact: to,
      payload: {
        to,
        subject,
        body: textBody,
        fromName,
        conversation_id: conversationId || null,
      },
    })

    // Tenta enviar via n8n webhook (nao bloqueante)
    const n8nUrl = config.n8nEmailSendUrl
    let n8nSent = false
    let n8nError: string | null = null
    if (n8nUrl) {
      try {
        const n8nRes = await fetch(n8nUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to, subject, body: textBody, from_name: fromName }),
        })
        if (n8nRes.ok) n8nSent = true
        else n8nError = `n8n retornou HTTP ${n8nRes.status}`
      } catch (err) {
        n8nError = err instanceof Error ? err.message : String(err)
      }
    }

    writeJson(res, 200, {
      ok: true,
      event_id: event.id,
      n8n_sent: n8nSent,
      n8n_error: n8nError,
    }, corsOrigin)
    return true
  }

  // ── File upload / download ─────────────────────────────────────

  if (method === 'GET' && url === '/api/chat/files') {
    const parsedUrl = new URL(url, 'http://localhost')
    const conversationId = parsedUrl.searchParams.get('conversation_id') || ''
    if (!conversationId) {
      writeJson(res, 400, { ok: false, error: 'conversation_id obrigatorio.' }, corsOrigin)
      return true
    }
    const files = await fileRepository.listByConversation(conversationId)
    writeJson(res, 200, { ok: true, files }, corsOrigin)
    return true
  }

  {
    const fileMatch = url.match(/^\/api\/chat\/files\/([a-f0-9-]+)$/)
    if (method === 'GET' && fileMatch) {
      const fileId = fileMatch[1]
      const fileRecord = await fileRepository.findById(fileId)
      if (!fileRecord) {
        writeJson(res, 404, { ok: false, error: 'Arquivo nao encontrado.' }, corsOrigin)
        return true
      }
      const data = readFile(fileRecord.stored_path)
      if (!data) {
        writeJson(res, 404, { ok: false, error: 'Arquivo nao encontrado no disco.' }, corsOrigin)
        return true
      }
      const mime = fileRecord.mime_type || 'application/octet-stream'
      const disposition = `attachment; filename="${fileRecord.original_name}"`
      res.writeHead(200, {
        'Content-Type': mime,
        'Content-Disposition': disposition,
        'Content-Length': data.length.toString(),
        'Access-Control-Allow-Origin': corsOrigin,
      })
      res.end(data)
      return true
    }
  }

  if (method === 'POST' && url === '/api/chat/upload') {
    const body = await readJson<Record<string, unknown>>(req)
    const conversationId = asString(body.conversation_id)
    const fileName = asString(body.file_name)
    const mimeType = asString(body.mime_type) || 'application/octet-stream'
    const fileBase64 = asString(body.file_base64)
    const uploadedBy = asString(body.uploaded_by) || null

    if (!conversationId) {
      writeJson(res, 400, { ok: false, error: 'conversation_id obrigatorio.' }, corsOrigin)
      return true
    }
    if (!fileName) {
      writeJson(res, 400, { ok: false, error: 'file_name obrigatorio.' }, corsOrigin)
      return true
    }
    if (!fileBase64) {
      writeJson(res, 400, { ok: false, error: 'file_base64 obrigatorio.' }, corsOrigin)
      return true
    }

    let buffer: Buffer
    try {
      buffer = Buffer.from(fileBase64, 'base64')
    } catch {
      writeJson(res, 400, { ok: false, error: 'file_base64 invalido.' }, corsOrigin)
      return true
    }

    const maxBytes = 50 * 1024 * 1024
    if (buffer.length > maxBytes) {
      writeJson(res, 400, { ok: false, error: 'Arquivo excede o limite de 50MB.' }, corsOrigin)
      return true
    }

    const storedPath = buildStoredPath(conversationId, fileName)
    saveFile(storedPath, buffer)

    const fileRecord = await fileRepository.create({
      conversation_id: conversationId,
      original_name: fileName,
      stored_path: storedPath,
      mime_type: mimeType,
      size_bytes: buffer.length,
      uploaded_by: uploadedBy,
    })

    // Cria mensagem no timeline da conversa
    await db.query(
      `INSERT INTO crm_chat_messages (conversation_id, document_key, direction, sender_type, sender_name, mensagem, mime_type, file_name, media_url)
       VALUES ($1, $1, 'incoming', 'humano', 'Sistema', $2, $3, $4, $5)`,
      [
        conversationId,
        `📎 ${fileName} (${(buffer.length / 1024).toFixed(0)} KB)`,
        mimeType,
        fileName,
        `/api/chat/files/${fileRecord.id}`,
      ],
    )

    writeJson(res, 200, { ok: true, file: fileRecord }, corsOrigin)
    return true
  }

  // ── User conversation access grants (GET) ────────────────────────
  if (method === 'GET' && url === '/api/chat/user-conversation-access') {
    const accessUrl = new URL(url, 'http://localhost')
    const userId = accessUrl.searchParams.get('user_id') ?? ''
    if (!userId) {
      writeJson(res, 400, { ok: false, error: 'user_id obrigatorio.' }, corsOrigin)
      return true
    }
    const result = await db.query<any>(
      `SELECT id, user_id, telefone, created_by, created_at
       FROM user_conversation_access
       WHERE user_id::text = $1
       ORDER BY created_at DESC`,
      [userId],
    )
    writeJson(res, 200, { ok: true, data: result.rows }, corsOrigin)
    return true
  }

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
    const insertResult = await db.query<any>(
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
    const allowedFields = ['nome', 'telefone', 'email', 'contato_status', 'observacoes']
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
    const result = await db.query<any>(
      `INSERT INTO communication_events (source, event_type, conversation_id, contact, lead_id, payload, external_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [source, eventType, conversationId, contact, leadId, payload, externalId],
    )
    writeJson(res, 200, { ok: true, event_id: result.rows[0]?.id ?? null }, corsOrigin)
    return true
  }

  if (method === 'DELETE' && url.startsWith('/api/chat/crm/conversations/')) {
    const id = url.replace('/api/chat/crm/conversations/', '')
    if (!id) {
      writeJson(res, 400, { ok: false, error: 'ID da conversa obrigatorio.' }, corsOrigin)
      return true
    }
    await db.query('DELETE FROM crm_chat_messages WHERE conversation_id = $1', [id])
    await db.query('DELETE FROM crm_chat_assignments WHERE conversation_id::text = $1', [id])
    await db.query('DELETE FROM crm_chat_conversations WHERE id = $1', [id])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/chat/crm/customers') {
    const body = await readJson<JsonRecord>(req)
    const nome = asString(body.nome) || 'Contato sem nome'
    const telefone = asString(body.telefone)
    const email = asString(body.email)
    const observacoes = asString(body.observacoes)
    if (!telefone && !email) {
      writeJson(res, 400, { ok: false, error: 'telefone ou email obrigatorio.' }, corsOrigin)
      return true
    }

    const telefoneDigits = normalizePhoneDigits(telefone)
    const existing = await db.query<{ id: string }>(
      `SELECT id
         FROM crm_customers
        WHERE ($1::text is not null and regexp_replace(coalesce(telefone, ''), '\D', '', 'g') = $1)
           OR ($2::text is not null and lower(coalesce(email, '')) = lower($2))
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1`,
      [telefoneDigits, email || null],
    )

    let customerId = existing.rows[0]?.id ?? null
    if (customerId) {
      await db.query(
        `UPDATE crm_customers
            SET nome = coalesce($2, nome),
                telefone = coalesce($3, telefone),
                email = coalesce($4, email),
                observacoes = coalesce($5, observacoes),
                updated_at = now()
          WHERE id = $1::uuid`,
        [customerId, nome || null, telefone || null, email || null, observacoes || null],
      )
    } else {
      const result = await db.query<{ id: string }>(
        `INSERT INTO crm_customers (nome, telefone, email, observacoes)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [nome, telefone || null, email || null, observacoes || null],
      )
      customerId = result.rows[0]?.id ?? null
    }

    const conversationId = asString(body.conversation_id)
    if (conversationId && customerId) {
      await db.query(
        `UPDATE crm_chat_conversations
            SET crm_customer_id = $1,
                cliente_nome = coalesce($3, cliente_nome),
                telefone = coalesce($4, telefone),
                updated_at = now()
          WHERE id = $2`,
        [customerId, conversationId, nome || null, telefone || null],
      )
    }

    writeJson(res, 200, { ok: true, customer_id: customerId }, corsOrigin)
    return true
  }

  // ── User conversation access grants (POST/DELETE) ────────────────
  if (method === 'POST' && url === '/api/chat/user-conversation-access') {
    const body = await readJson<{ user_id?: string; telefone?: string }>(req)
    if (!body?.user_id || !body.telefone?.trim()) {
      writeJson(res, 400, { ok: false, error: 'user_id e telefone obrigatorios.' }, corsOrigin)
      return true
    }
    const accessUrl = new URL(url, 'http://localhost')
    const createdBy = accessUrl.searchParams.get('profile_id') ?? null
    try {
      const result = await db.query<any>(
        `INSERT INTO user_conversation_access (user_id, telefone, created_by)
         VALUES ($1, $2, $3) RETURNING id`,
        [body.user_id, body.telefone.trim(), createdBy],
      )
      writeJson(res, 200, { ok: true, id: result.rows[0]?.id }, corsOrigin)
    } catch (err: unknown) {
      const pgErr = err as { code?: string }
      if (pgErr?.code === '23505') {
        writeJson(res, 409, { ok: false, error: 'Este telefone ja foi adicionado para este usuario.' }, corsOrigin)
      } else {
        writeJson(res, 500, { ok: false, error: 'Erro ao adicionar acesso.' }, corsOrigin)
      }
    }
    return true
  }

  const deleteAccessMatch = url.match(/^\/api\/chat\/user-conversation-access\/([a-f0-9-]+)$/)
  if (method === 'DELETE' && deleteAccessMatch) {
    const id = deleteAccessMatch[1]
    await db.query('DELETE FROM user_conversation_access WHERE id::text = $1', [id])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // ── Catálogo IA (produtos para agente Clara) ──────────────────────────────
  const getAllCatalogo = req.method === 'GET' && url === '/api/chat/catalogo-ia/all'
  const getActiveCatalogo = req.method === 'GET' && url === '/api/chat/catalogo-ia'

  if (getActiveCatalogo || getAllCatalogo) {
    const sql = getAllCatalogo
      ? 'SELECT * FROM catalogo_ia ORDER BY tipo, modelo, periodo_uso, midia'
      : 'SELECT * FROM catalogo_ia WHERE ativo = true ORDER BY tipo, modelo, periodo_uso, midia'
    const result = await db.query(sql)
    writeJson(res, 200, { ok: true, data: result.rows }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/chat/catalogo-ia') {
    const body = await readJson<Record<string, unknown>>(req)
    const result = await db.query<{ id: string }>(
      `INSERT INTO catalogo_ia (produto, tipo, modelo, periodo_uso, midia, tipo_validacao, preco, gratuito, observacao, link_compra, ativo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [body.produto, body.tipo ?? 'e-CPF', body.modelo ?? 'A1', body.periodo_uso ?? '1 ano',
       body.midia ?? null, body.tipo_validacao ?? 'qualquer', body.preco ?? 0,
       body.gratuito ?? false, body.observacao ?? null, body.link_compra ?? null, body.ativo ?? true],
    )
    writeJson(res, 201, { ok: true, id: result.rows[0].id }, corsOrigin)
    return true
  }

  const catalogoUpdateMatch = req.method === 'PUT' ? url.match(/^\/api\/chat\/catalogo-ia\/([a-f0-9-]+)$/i) : null
  if (catalogoUpdateMatch) {
    const id = catalogoUpdateMatch[1]
    const body = await readJson<Record<string, unknown>>(req)
    const sets: string[] = []
    const values: unknown[] = []
    let idx = 1
    for (const [key, value] of Object.entries(body)) {
      if (['id', 'created_at', 'updated_at'].includes(key)) continue
      sets.push(`${key} = $${idx++}`)
      values.push(value)
    }
    if (sets.length > 0) {
      sets.push(`updated_at = NOW()`)
      values.push(id)
      await db.query(`UPDATE catalogo_ia SET ${sets.join(', ')} WHERE id = $${idx}`, values)
    }
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  const catalogoDeleteMatch = method === 'DELETE' && url.match(/^\/api\/chat\/catalogo-ia\/([a-f0-9-]+)$/i)
  if (catalogoDeleteMatch) {
    const id = catalogoDeleteMatch[1]
    await db.query('DELETE FROM catalogo_ia WHERE id::text = $1', [id])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // GET /api/chat/media-proxy?url=...&instance=...
  // Proxy para Evolution API media — o browser nao pode adicionar header apikey
  if (req.method === 'GET' && url.startsWith('/api/chat/media-proxy')) {
    const parsed = new URL(url, 'http://localhost')
    const mediaUrl = parsed.searchParams.get('url')
    const instanceName = parsed.searchParams.get('instance')
    if (!mediaUrl) {
      writeJson(res, 400, { error: 'url query param required' }, corsOrigin)
      return true
    }

    const instances = [config.evolutionAtendimento, config.evolutionCertiid].filter(Boolean)
    const matches = instanceName ? instances.filter(i => i.instanceName === instanceName) : instances
    let lastError: unknown

    for (const inst of matches) {
      if (!inst.apiToken) continue
      try {
        const mediaRes = await fetch(mediaUrl, { headers: { apikey: inst.apiToken } })
        if (!mediaRes.ok) {
          lastError = `HTTP ${mediaRes.status}`
          continue
        }

        const contentType = mediaRes.headers.get('content-type') || 'application/octet-stream'
        const contentLength = mediaRes.headers.get('content-length')

        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': contentLength ?? '',
          'Access-Control-Allow-Origin': corsOrigin,
          'Cache-Control': 'private, max-age=3600',
        })

        const reader = mediaRes.body?.getReader()
        if (!reader) {
          writeJson(res, 502, { error: 'no response body' }, corsOrigin)
          return true
        }

        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read()
            if (done) { res.end(); break }
            res.write(value)
          }
        }
        pump().catch(() => { res.end() })
        return true
      } catch (err) {
        lastError = err
        continue
      }
    }

    writeJson(res, 502, { error: `Evolution media fetch failed: ${lastError}` }, corsOrigin)
    return true
  }

  return false
}


