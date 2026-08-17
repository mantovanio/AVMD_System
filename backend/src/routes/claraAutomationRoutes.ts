import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AivenSqlClient } from '../db/aivenClient.js'
import type { LeadRepository } from '../repositories/leadRepository.js'
import type { CommunicationOutboxRepository } from '../repositories/communicationOutboxRepository.js'
import type { ConfigRepository } from '../repositories/configRepository.js'
import { ClaraWhatsappAutomationService, type ClaraWhatsappAutomationInput } from '../services/claraWhatsappAutomationService.js'
import { readJson, writeJson } from '../utils/http.js'

type ClaraHandoffBody = {
  conversation_id?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  customer_email?: string | null
  message_text?: string | null
  message_id?: string | null
  source?: string | null
  intent?: string | null
  route_target?: string | null
  reply_text?: string | null
  reply_subject?: string | null
  event_type?: string | null
  entity_type?: string | null
  context?: {
    tipo_fluxo?: string | null
    flow_type?: string | null
    source?: string | null
    renovacao_id?: string | null
    agendamento_id?: string | null
    customer_email?: string | null
  } | null
}

type ClaraMessageLogBody = ClaraHandoffBody & {
  status?: 'sent' | 'error' | 'handoff' | 'skipped' | string | null
  confidence?: number | string | null
  handoff?: boolean | null
  error_text?: string | null
  error?: string | null
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function onlyDigits(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits || null
}

async function findConversationForClara(
  db: AivenSqlClient,
  input: { conversationId?: string | null; phoneDigits?: string | null },
) {
  const result = await db.query<{ id: string; document_key: string }>(
    `select id, document_key
       from crm_chat_conversations
      where ($1::text is not null and id::text = $1)
         or ($1::text is not null and document_key = $1)
         or ($2::text is not null and regexp_replace(coalesce(telefone, document_key, ''), '\\D', '', 'g') = $2)
      order by updated_at desc
      limit 1`,
    [normalizeText(input.conversationId), input.phoneDigits ?? null],
  )
  return result.rows[0] ?? null
}

async function markConversationAsHuman(
  db: AivenSqlClient,
  input: {
    conversationId?: string | null
    phoneDigits?: string | null
    customerName?: string | null
    flowType?: string | null
    messageText?: string | null
  },
) {
  const fila = input.flowType === 'renovacao'
    ? 'renovacao'
    : input.flowType === 'agendamento'
      ? 'agendamento'
      : 'atendimento'

  const row = await findConversationForClara(db, input)
  if (!row) return { conversationId: null as string | null, updated: false }

  await db.query(
    `update crm_chat_conversations
        set atendimento_humano = true,
            agente_nome = coalesce(agente_nome, 'Aguardando atendente'),
            fila = coalesce(nullif(fila, ''), $2),
            kanban_status = case
              when kanban_status in ('arquivado', 'arquivada', 'resolvido', 'resolvida') then 'conversando'
              else coalesce(kanban_status, 'conversando')
            end,
            cliente_nome = coalesce($3, cliente_nome),
            updated_at = now()
      where id = $1::uuid`,
    [row.id, fila, normalizeText(input.customerName)],
  )

  const message = [
    'Transferido para atendimento humano.',
    input.messageText ? `Ultima mensagem do cliente: ${input.messageText}` : null,
  ].filter(Boolean).join('\n')

  await db.query(
    `insert into crm_chat_messages
       (conversation_id, document_key, direction, sender_type, sender_name, mensagem)
     select $1::uuid, $2, 'outgoing', 'automation', 'Sistema', $3
     where not exists (
       select 1
         from crm_chat_messages
        where conversation_id = $1::uuid
          and sender_type = 'automation'
          and sender_name = 'Sistema'
          and mensagem = $3
          and created_at > now() - interval '5 minutes'
     )`,
    [row.id, row.document_key, message],
  )

  return { conversationId: row.id, updated: true }
}

async function handleClaraMessageLog(
  db: AivenSqlClient,
  body: ClaraMessageLogBody,
) {
  const phoneDigits = onlyDigits(body.customer_phone)
  const flowType = normalizeText(body.context?.tipo_fluxo ?? body.context?.flow_type) ?? 'atendimento'
  const status = normalizeText(body.status) ?? (body.handoff ? 'handoff' : body.error_text || body.error ? 'error' : 'sent')
  const replyText = normalizeText(body.reply_text)
  const errorText = normalizeText(body.error_text ?? body.error)
  const intent = normalizeText(body.intent)
  const routeTarget = normalizeText(body.route_target)
  const confidence = body.confidence === null || body.confidence === undefined || body.confidence === ''
    ? null
    : Number(body.confidence)
  const shouldHandoff = Boolean(body.handoff) || status === 'handoff'

  const row = await findConversationForClara(db, {
    conversationId: body.conversation_id,
    phoneDigits,
  })

  const canvasText = errorText
    ? [
        'Tentativa de resposta automatizada falhou.',
        `Erro: ${errorText}`,
        intent ? `Intencao: ${intent}` : null,
      ].filter(Boolean).join('\n')
    : replyText

  let messageInserted = false
  if (row && canvasText) {
    const result = await db.query<{ id: string }>(
      `insert into crm_chat_messages
         (conversation_id, document_key, external_message_id, direction, sender_type, sender_name, mensagem)
       select $1::uuid, $2, $3, 'outgoing', 'automation', 'Sistema', $4
       where not exists (
         select 1
           from crm_chat_messages
          where conversation_id = $1::uuid
            and sender_type = 'automation'
            and sender_name = 'Sistema'
            and mensagem = $4
            and created_at > now() - interval '5 minutes'
       )
       returning id`,
      [row.id, row.document_key, normalizeText(body.message_id), canvasText],
    )
    messageInserted = Boolean(result.rows[0]?.id)

    if (!errorText && replyText) {
      await db.query(
        `update crm_chat_conversations
            set ultima_mensagem = $2,
                ultima_mensagem_direcao = 'outgoing',
                ultima_interacao_em = now(),
                updated_at = now()
          where id = $1::uuid`,
        [row.id, replyText],
      )
    }
  }

  let handoff: { conversationId: string | null; updated: boolean } = { conversationId: row?.id ?? null, updated: false }
  if (shouldHandoff) {
    handoff = await markConversationAsHuman(db, {
      conversationId: row?.id ?? body.conversation_id,
      phoneDigits,
      customerName: body.customer_name,
      flowType,
      messageText: body.message_text,
    })
  }

  const event = await db.query<{ id: string }>(
    `insert into communication_events
       (source, event_type, conversation_id, contact, payload, external_id)
     values ('clara', $1, $2, $3, $4::jsonb, $5)
     returning id`,
    [
      status === 'error' ? 'clara.error' : shouldHandoff ? 'clara.handoff' : 'clara.reply',
      row?.id ?? normalizeText(body.conversation_id),
      phoneDigits ?? normalizeText(body.customer_phone),
      JSON.stringify({
        status,
        intent,
        route_target: routeTarget,
        confidence: Number.isFinite(confidence) ? confidence : null,
        handoff: shouldHandoff,
        reply_text: replyText,
        error_text: errorText,
        customer_name: normalizeText(body.customer_name),
        customer_phone: phoneDigits,
        customer_email: normalizeText(body.customer_email ?? body.context?.customer_email),
        message_text: normalizeText(body.message_text),
        source: normalizeText(body.source ?? body.context?.source),
        context: body.context ?? null,
      }),
      normalizeText(body.message_id),
    ],
  )

  return {
    eventId: event.rows[0]?.id ?? null,
    conversationId: handoff.conversationId ?? row?.id ?? normalizeText(body.conversation_id),
    conversationFound: Boolean(row),
    messageInserted,
    handoffUpdated: handoff.updated,
  }
}

export async function handleClaraAutomationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  db: AivenSqlClient,
  leadRepository: LeadRepository,
  outboxRepository: CommunicationOutboxRepository,
  corsOrigin: string,
  configRepository?: ConfigRepository,
) {
  if (configRepository) {
    const aiControl = await configRepository.get<{ enabled: boolean }>('ai_control')
    if (!aiControl.enabled) {
      if (req.method === 'POST' && req.url === '/api/automation/clara-whatsapp') {
        writeJson(res, 200, { ok: true, skipped: true, reason: 'ai_disabled' }, corsOrigin)
        return true
      }
      if (req.method === 'POST' && (req.url === '/api/automation/clara-message-log' || req.url === '/api/automation/clara-handoff')) {
        writeJson(res, 200, { ok: true, skipped: true, reason: 'ai_disabled' }, corsOrigin)
        return true
      }
    }
  }
  if (req.method === 'POST' && req.url === '/api/automation/clara-whatsapp') {
    const body = await readJson<ClaraWhatsappAutomationInput>(req)
    if (!body?.type || !body?.phone) {
      writeJson(res, 400, { ok: false, error: 'type e phone são obrigatórios.' }, corsOrigin)
      return true
    }

    const service = new ClaraWhatsappAutomationService(outboxRepository)
    const outbox = await service.queue(body)
    writeJson(res, 201, { ok: true, outbox }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/automation/clara-message-log') {
    const body = await readJson<ClaraMessageLogBody>(req)
    const result = await handleClaraMessageLog(db, body)
    writeJson(res, 200, { ok: true, ...result }, corsOrigin)
    return true
  }

  if (req.method !== 'POST' || req.url !== '/api/automation/clara-handoff') {
    return false
  }

  const body = await readJson<ClaraHandoffBody>(req)
  const phoneDigits = onlyDigits(body.customer_phone)
  const existingLead = phoneDigits ? await leadRepository.findByPhone(phoneDigits) : null
  const flowType = normalizeText(body.context?.tipo_fluxo ?? body.context?.flow_type) ?? 'atendimento'
  const source = normalizeText(body.context?.source ?? body.source) ?? 'clara'
  const motivoContato = flowType === 'agendamento'
    ? 'agendamento_automacao'
    : flowType === 'renovacao'
      ? 'renovacao_automacao'
      : 'atendimento_automacao'
  const noteParts = [
    'Transferido automaticamente para atendimento humano.',
    'Fluxo: ' + flowType + '.',
    'Origem: ' + source + '.',
    body.context?.renovacao_id ? 'Renovacao: ' + body.context.renovacao_id + '.' : null,
    body.context?.agendamento_id ? 'Agendamento: ' + body.context.agendamento_id + '.' : null,
    body.conversation_id ? 'Conversa: ' + body.conversation_id + '.' : null,
    body.message_text ? 'Ultima mensagem: ' + body.message_text + '.' : null,
  ].filter(Boolean)

  const transferidoEm = new Date().toISOString()
  const lead = await leadRepository.markHumanHandoff({
    leadId: existingLead?.id ?? null,
    nomeLead: normalizeText(body.customer_name),
    whatsappLead: phoneDigits,
    motivoContato,
    anotacoes: noteParts.join(' '),
  })
  const conversationUpdate = await markConversationAsHuman(db, {
    conversationId: body.conversation_id,
    phoneDigits,
    customerName: body.customer_name,
    flowType,
    messageText: body.message_text,
  })

  writeJson(res, 200, {
    ok: true,
    lead_id: lead.id,
    lead_status: lead.status,
    transferido_em: transferidoEm,
    conversation_id: conversationUpdate.conversationId ?? normalizeText(body.conversation_id),
    conversation_updated: conversationUpdate.updated,
    customer_name: normalizeText(body.customer_name),
    customer_phone: phoneDigits,
    customer_email: normalizeText(body.customer_email ?? body.context?.customer_email),
    message_text: normalizeText(body.message_text),
    message_id: normalizeText(body.message_id),
    source: normalizeText(body.source),
    intent: normalizeText(body.intent),
    route_target: normalizeText(body.route_target),
    reply_text: normalizeText(body.reply_text),
    reply_subject: normalizeText(body.reply_subject),
    event_type: normalizeText(body.event_type),
    entity_type: normalizeText(body.entity_type),
    context: body.context ?? null,
  }, corsOrigin)
  return true
}
