import type { IncomingMessage, ServerResponse } from 'node:http'
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

export async function handleClaraAutomationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
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

  writeJson(res, 200, {
    ok: true,
    lead_id: lead.id,
    lead_status: lead.status,
    transferido_em: transferidoEm,
    conversation_id: normalizeText(body.conversation_id),
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
