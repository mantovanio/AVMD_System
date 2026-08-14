import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AivenSqlClient } from '../db/aivenClient.js'
import type { LeadRepository } from '../repositories/leadRepository.js'
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

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function onlyDigits(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits || null
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

  const conversation = await db.query<{ id: string; document_key: string }>(
    `select id, document_key
       from crm_chat_conversations
      where ($1::text is not null and id::text = $1)
         or ($1::text is not null and document_key = $1)
         or ($2::text is not null and regexp_replace(coalesce(telefone, document_key, ''), '\\D', '', 'g') = $2)
      order by updated_at desc
      limit 1`,
    [normalizeText(input.conversationId), input.phoneDigits ?? null],
  )

  const row = conversation.rows[0]
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
    'Clara transferiu esta conversa para atendimento humano.',
    input.messageText ? `Ultima mensagem do cliente: ${input.messageText}` : null,
  ].filter(Boolean).join('\n')

  await db.query(
    `insert into crm_chat_messages
       (conversation_id, document_key, direction, sender_type, sender_name, mensagem)
     select $1::uuid, $2, 'outgoing', 'ia', 'IA Clara', $3
     where not exists (
       select 1
         from crm_chat_messages
        where conversation_id = $1::uuid
          and sender_type = 'ia'
          and sender_name = 'IA Clara'
          and mensagem = $3
          and created_at > now() - interval '5 minutes'
     )`,
    [row.id, row.document_key, message],
  )

  return { conversationId: row.id, updated: true }
}

export async function handleClaraAutomationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  db: AivenSqlClient,
  leadRepository: LeadRepository,
  corsOrigin: string,
) {
  if (req.method !== 'POST' || req.url !== '/api/automation/clara-handoff') {
    return false
  }

  const body = await readJson<ClaraHandoffBody>(req)
  const phoneDigits = onlyDigits(body.customer_phone)
  const existingLead = phoneDigits ? await leadRepository.findByPhone(phoneDigits) : null
  const flowType = normalizeText(body.context?.tipo_fluxo ?? body.context?.flow_type) ?? 'atendimento'
  const source = normalizeText(body.context?.source ?? body.source) ?? 'clara'
  const motivoContato = flowType === 'agendamento'
    ? 'agendamento_clara'
    : flowType === 'renovacao'
      ? 'renovacao_clara'
      : 'atendimento_clara'
  const noteParts = [
    'Transferido automaticamente da IA Clara para atendimento humano.',
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
