import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CommunicationOutboxRepository } from '../repositories/communicationOutboxRepository.js'
import type { ScheduleAutomationRepository, ScheduleEmailEventType } from '../repositories/scheduleAutomationRepository.js'
import { readJson, writeJson } from '../utils/http.js'

type ScheduleEmailWebhookBody = {
  source?: string | null
  mailbox?: string | null
  external_id?: string | null
  message_id?: string | null
  from?: string | null
  to?: string | null
  subject?: string | null
  body_text?: string | null
  body_html?: string | null
  received_at?: string | null
  parsed?: {
    event_type?: string | null
    customer_name?: string | null
    customer_email?: string | null
    customer_phone?: string | null
    customer_document?: string | null
    protocolo_numero?: string | null
    pedido_numero?: string | null
    data_agendada?: string | null
    observacoes?: string | null
    product_name?: string | null
    location_name?: string | null
    source_sender?: string | null
  } | null
  raw?: Record<string, unknown> | null
}

type ExtractedScheduleFields = {
  event_type?: ScheduleEmailEventType
  customer_name?: string | null
  customer_email?: string | null
  customer_phone?: string | null
  customer_document?: string | null
  protocolo_numero?: string | null
  pedido_numero?: string | null
  data_agendada?: string | null
  observacoes?: string | null
  product_name?: string | null
  location_name?: string | null
  source_sender?: string | null
}

const SOURCE_REPLY_MAP: Record<string, { brand: string; emailSubject: string }> = {
  certiid: { brand: 'CertiID', emailSubject: 'Agendamento recebido - CertiID' },
  certifast: { brand: 'Certifast', emailSubject: 'Agendamento recebido - Certifast' },
  certisign: { brand: 'Certifast', emailSubject: 'Agendamento recebido - Certifast' },
  unknown: { brand: 'Equipe de Validacao', emailSubject: 'Agendamento recebido' },
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim()
  return text || null
}

function onlyDigits(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits || null
}

function decodeHtml(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '')
}

function compactSpaces(value: string | null | undefined) {
  return String(value ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

function matchFirst(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return compactSpaces(match[1])
  }
  return null
}

function parsePtBrDateTime(value: string | null | undefined) {
  const text = normalizeText(value)
  if (!text) return null

  const normalized = text
    .replace(/às?/gi, ' ')
    .replace(/hs?/gi, '')
    .replace(/h(?![a-z])/gi, ':')
    .replace(/\s+/g, ' ')
    .trim()

  const match = normalized.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})(?::(\d{2}))?)?/) 
  if (!match) return null

  const day = match[1].padStart(2, '0')
  const month = match[2].padStart(2, '0')
  const year = match[3]
  const hour = (match[4] ?? '00').padStart(2, '0')
  const minute = (match[5] ?? '00').padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}:00-03:00`
}

function inferSource(body: ScheduleEmailWebhookBody) {
  const explicit = normalizeText(body.source)?.toLowerCase()
  if (explicit) return explicit

  const from = normalizeText(body.from)?.toLowerCase() ?? ''
  const to = normalizeText(body.to)?.toLowerCase() ?? ''
  const mailbox = normalizeText(body.mailbox)?.toLowerCase() ?? ''
  const subject = normalizeText(body.subject)?.toLowerCase() ?? ''
  const rawText = [mailbox, to, from, subject, body.body_text, body.body_html].join(' ').toLowerCase()

  if (from.includes('contato@certifast.com.br') || to.includes('contato@certifast.com.br') || mailbox.includes('contato@certifast.com.br')) return 'certifast'
  if (from.includes('contato@certiid.com.br') || to.includes('contato@certiid.com.br') || mailbox.includes('contato@certiid.com.br')) return 'certiid'
  if (rawText.includes('certifast')) return 'certifast'
  if (rawText.includes('certiid') || rawText.includes('ar certi id')) return 'certiid'
  if (rawText.includes('certisign')) return 'certisign'
  return 'unknown'
}

function inferEventType(body: ScheduleEmailWebhookBody, extracted?: ExtractedScheduleFields): ScheduleEmailEventType {
  const explicit = normalizeText(body.parsed?.event_type)?.toLowerCase()
  if (explicit?.includes('cancel')) return 'cancelamento'
  if (explicit?.includes('reag')) return 'reagendamento'
  if (explicit?.includes('novo')) return 'novo_agendamento'
  if (extracted?.event_type) return extracted.event_type

  const subject = normalizeText(body.subject)?.toLowerCase() ?? ''
  const joined = [subject, body.body_text, body.body_html].map(part => String(part ?? '').toLowerCase()).join(' ')

  if (subject.includes('novo pedido agendado')) return 'novo_agendamento'
  if (subject.includes('novo agendamento realizado')) return 'novo_agendamento'
  if (joined.includes('cancelado') || joined.includes('cancelamento') || joined.includes('agendamento cancelado')) return 'cancelamento'
  if (joined.includes('reagend')) return 'reagendamento'
  if (joined.includes('novo agendamento') || joined.includes('novo pedido agendado') || joined.includes('agendamento realizado')) return 'novo_agendamento'
  return 'unknown'
}

function extractCertifastFields(body: ScheduleEmailWebhookBody): ExtractedScheduleFields {
  const subject = normalizeText(body.subject) ?? ''
  const bodyText = compactSpaces(body.body_text)
  const content = `${subject}\n${bodyText}`
  const subjectLower = subject.toLowerCase()
  const bodyLower = bodyText.toLowerCase()
  const dateTimeText =
    matchFirst(content, [/Data e horário\s*:?\s*(.+?)(?:\s*(?:Nome completo|CNPJ \/ CPF|Telefone|E-?mail|Pedido|Código|Produto|Posto|$))/i])
    || matchFirst(content, [/Data e horário\s*(.+)/i])
    || null
  const date = matchFirst(content, [/Data:\s*(.+?)(?:\s*(?:Hora|Posto|Produto|Pedido|Código|$))/i])
  const hour = matchFirst(content, [/Hora:\s*(.+?)(?:\s*(?:Posto|Produto|Pedido|Código|$))/i])
  const dateTime = parsePtBrDateTime(dateTimeText ?? (date && hour ? `${date} ${hour}` : subject))
  const eventType = subjectLower.includes('cancel') || bodyLower.includes('cancel')
    ? 'cancelamento'
    : subjectLower.includes('reag') || bodyLower.includes('reag')
      ? 'reagendamento'
      : 'novo_agendamento'

  return {
    event_type: eventType,
    customer_name:
      matchFirst(content, [/Cliente:\s*(.+?)(?:\s*(?:CPF\/CNPJ|CNPJ\/CPF|Telefone|E-?mail|Pedido|Código|Produto|Posto|$))/i])
      || matchFirst(content, [/Nome completo\s*:?\s*(.+?)(?:\s*(?:CNPJ \/ CPF|Telefone|E-?mail|$))/i]),
    customer_document: matchFirst(content, [/(?:CPF\/CNPJ|CNPJ\/CPF):\s*(.+)/i]),
    customer_phone: matchFirst(content, [/Telefone(?:\s*Celular)?:\s*(.+?)(?:\s*(?:E-?mail|Email|Pedido|Código|Produto|Posto|$))/i]),
    customer_email: matchFirst(content, [/(?:E-?mail|Email):\s*([^\s]+@[^\s]+)/i]),
    pedido_numero: matchFirst(content, [/Pedido:\s*(.+?)(?:\s*(?:Código|Produto|Posto|Data|Hora|$))/i, /pedido código\s*(\d+)/i]),
    protocolo_numero: matchFirst(content, [/Código:\s*(.+?)(?:\s*(?:Produto|Posto|Data|Hora|$))/i]),
    product_name: matchFirst(content, [/Produto:\s*(.+?)(?:\s*(?:Data|Hora|Nome completo|CNPJ|CPF|Telefone|E-?mail|$))/i]),
    location_name: matchFirst(content, [/Posto:\s*(.+?)(?:\s*(?:Data|Hora|Nome completo|CNPJ|CPF|Telefone|E-?mail|$))/i]),
    data_agendada: dateTime,
    observacoes: compactSpaces([
      matchFirst(content, [/Produto:\s*(.+?)(?:\s*(?:Data|Hora|Nome completo|CNPJ|CPF|Telefone|E-?mail|$))/i]),
      matchFirst(content, [/Posto:\s*(.+?)(?:\s*(?:Data|Hora|Nome completo|CNPJ|CPF|Telefone|E-?mail|$))/i]),
    ].filter(Boolean).join(' | ')) || null,
    source_sender: normalizeText(body.from),
  }
}

function extractCertiidFields(body: ScheduleEmailWebhookBody): ExtractedScheduleFields {
  const text = compactSpaces(`${decodeHtml(body.body_html)}\n${body.body_text ?? ''}`)
  const subject = normalizeText(body.subject) ?? ''
  const joined = `${subject}\n${text}`
  const lowered = joined.toLowerCase()
  const dateTimeRaw = matchFirst(joined, [/Data e horário\s*([\d\/]{8,10}\s+às?\s*\d{1,2}h?\d{0,2})/i, /Data e horário\s*(.+)/i])

  return {
    event_type: lowered.includes('cancel') ? 'cancelamento' : lowered.includes('reag') ? 'reagendamento' : 'novo_agendamento',
    pedido_numero: matchFirst(joined, [/Pedido\s*(\d+)/i, /Pedido\s*:?\s*(.+)/i]),
    product_name: matchFirst(joined, [/Produto\s*:?\s*(.+?)\s*(?:Nome completo|CNPJ \/ CPF|Telefone|E-mail|$)/i]),
    customer_name: matchFirst(joined, [/Nome completo\s*:?\s*(.+?)\s*(?:CNPJ \/ CPF|Telefone|E-mail|$)/i]),
    customer_document: matchFirst(joined, [/CNPJ \/ CPF\s*:?\s*(.+?)\s*(?:Telefone|E-mail|$)/i]),
    customer_phone: matchFirst(joined, [/Telefone\s*:?\s*(.+?)\s*(?:E-mail|$)/i]),
    customer_email: matchFirst(joined, [/E-mail\s*:?\s*([^\s]+@[^\s]+)/i]),
    data_agendada: parsePtBrDateTime(dateTimeRaw),
    observacoes: compactSpaces([
      matchFirst(joined, [/Produto\s*:?\s*(.+?)\s*(?:Nome completo|CNPJ \/ CPF|Telefone|E-mail|$)/i]),
    ].filter(Boolean).join(' | ')) || null,
    source_sender: normalizeText(body.from),
  }
}

function extractFields(body: ScheduleEmailWebhookBody, source: string) {
  if (source === 'certifast' || source === 'certisign') return extractCertifastFields(body)
  if (source === 'certiid') return extractCertiidFields(body)
  return {} as ExtractedScheduleFields
}

function mergeParsed(body: ScheduleEmailWebhookBody, extracted: ExtractedScheduleFields) {
  const parsedDateTime = normalizeText(body.parsed?.data_agendada)
  return {
    event_type: normalizeText(body.parsed?.event_type) ?? extracted.event_type ?? null,
    customer_name: normalizeText(body.parsed?.customer_name) ?? extracted.customer_name ?? null,
    customer_email: normalizeText(body.parsed?.customer_email) ?? extracted.customer_email ?? null,
    customer_phone: normalizeText(body.parsed?.customer_phone) ?? extracted.customer_phone ?? null,
    customer_document: normalizeText(body.parsed?.customer_document) ?? extracted.customer_document ?? null,
    protocolo_numero: normalizeText(body.parsed?.protocolo_numero) ?? extracted.protocolo_numero ?? null,
    pedido_numero: normalizeText(body.parsed?.pedido_numero) ?? extracted.pedido_numero ?? null,
    data_agendada: parsePtBrDateTime(parsedDateTime) ?? parsedDateTime ?? extracted.data_agendada ?? null,
    observacoes: normalizeText(body.parsed?.observacoes) ?? extracted.observacoes ?? null,
    product_name: normalizeText(body.parsed?.product_name) ?? extracted.product_name ?? null,
    location_name: normalizeText(body.parsed?.location_name) ?? extracted.location_name ?? null,
    source_sender: normalizeText(body.parsed?.source_sender) ?? extracted.source_sender ?? null,
  }
}

function buildConfirmationMessages(input: {
  brand: string
  eventType: ScheduleEmailEventType
  customerName?: string | null
  dataAgendada?: string | null
  emailSubject: string
}) {
  const firstName = (input.customerName?.trim().split(/\s+/)[0] || 'cliente')
  const whenText = input.dataAgendada ? ` para ${new Date(input.dataAgendada).toLocaleString('pt-BR')}` : ''

  if (input.eventType === 'cancelamento') {
    return {
      whatsapp: `Olá, ${firstName}. Recebemos a informação de cancelamento do seu agendamento${whenText}. Se desejar um novo horário, fale com a equipe ${input.brand}.`,
      emailSubject: `${input.emailSubject} - cancelamento processado`,
      emailBody: `Olá, ${firstName}.\n\nRecebemos a atualização de cancelamento do seu agendamento${whenText}.\n\nSe quiser reagendar, responda este e-mail ou fale com a equipe ${input.brand}.`,
      docsWhatsapp: null,
      docsEmailSubject: null,
      docsEmailBody: null,
    }
  }

  const actionLabel = input.eventType === 'reagendamento' ? 'reagendamento' : 'agendamento'
  return {
    whatsapp: `Olá, ${firstName}. Recebemos seu ${actionLabel}${whenText}. A equipe ${input.brand} já está acompanhando sua validação.`,
    emailSubject: input.emailSubject,
    emailBody: `Olá, ${firstName}.\n\nRecebemos seu ${actionLabel}${whenText}.\n\nA equipe ${input.brand} já registrou sua validação e seguirá com o atendimento.`,
    docsWhatsapp: 'Para agilizar a etapa de validação, envie por este canal os documentos solicitados ou responda ao e-mail com os arquivos necessários antes do atendimento.',
    docsEmailSubject: `Documentos para validacao - ${input.brand}`,
    docsEmailBody: `Olá, ${firstName}.\n\nPara agilizar sua validação, encaminhe os documentos necessários antes do atendimento.\n\nSe preferir, responda este e-mail com os arquivos ou envie pelo WhatsApp.`,
  }
}

export async function handleScheduleAutomationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  scheduleRepository: ScheduleAutomationRepository,
  outboxRepository: CommunicationOutboxRepository,
  corsOrigin: string,
) {
  if (req.method !== 'POST' || req.url !== '/api/automation/schedule-email') {
    return false
  }

  const body = await readJson<ScheduleEmailWebhookBody>(req)
  const source = inferSource(body)
  const extracted = extractFields(body, source)
  const parsed = mergeParsed(body, extracted)
  const eventType = inferEventType(body, extracted)
  const replyProfile = SOURCE_REPLY_MAP[source] ?? SOURCE_REPLY_MAP.unknown
  const existing = await scheduleRepository.findExistingEvent({
    externalId: normalizeText(body.external_id),
    messageId: normalizeText(body.message_id),
  })

  if (existing) {
    writeJson(res, 200, {
      ok: true,
      duplicate: true,
      event_id: existing.id,
      matched_agendamento_id: existing.matched_agendamento_id,
      matched_venda_id: existing.matched_venda_id,
    }, corsOrigin)
    return true
  }

  const inboundEvent = await scheduleRepository.createInboundEvent({
    source,
    mailbox: normalizeText(body.mailbox ?? body.to),
    external_id: normalizeText(body.external_id),
    message_id: normalizeText(body.message_id),
    event_type: eventType,
    customer_name: parsed.customer_name,
    customer_email: parsed.customer_email,
    customer_phone: parsed.customer_phone,
    customer_document: parsed.customer_document,
    protocolo_numero: parsed.protocolo_numero,
    pedido_numero: parsed.pedido_numero,
    data_agendada: parsed.data_agendada,
    payload: {
      source,
      from: body.from ?? null,
      to: body.to ?? null,
      subject: body.subject ?? null,
      body_text: body.body_text ?? null,
      body_html: body.body_html ?? null,
      parsed,
      raw: body.raw ?? null,
      received_at: body.received_at ?? null,
    },
  })

  const match = await scheduleRepository.findBestScheduleMatch({
    protocoloNumero: parsed.protocolo_numero,
    pedidoNumero: parsed.pedido_numero,
    customerEmail: parsed.customer_email,
    customerPhoneDigits: onlyDigits(parsed.customer_phone),
    customerDocumentDigits: onlyDigits(parsed.customer_document),
  })

  if (!inboundEvent) {
    writeJson(res, 500, { ok: false, error: 'Falha ao registrar o evento de agendamento.' }, corsOrigin)
    return true
  }

  const inboxSync = await scheduleRepository.syncScheduleInbox({
    source,
    eventType,
    mailbox: normalizeText(body.mailbox ?? body.to),
    from: normalizeText(parsed.customer_email ?? body.from),
    subject: normalizeText(body.subject),
    bodyText: normalizeText(body.body_text),
    bodyHtml: normalizeText(body.body_html),
    customerName: parsed.customer_name ?? match?.titular_nome ?? match?.cadastro_nome,
    customerEmail: parsed.customer_email ?? match?.titular_email ?? match?.cadastro_email,
    customerPhone: parsed.customer_phone ?? match?.titular_telefone ?? match?.cadastro_telefone,
    customerDocument: parsed.customer_document ?? match?.titular_documento ?? match?.cadastro_documento,
    productName: parsed.product_name,
    pedidoNumero: parsed.pedido_numero ?? match?.pedido_numero,
    protocoloNumero: parsed.protocolo_numero ?? match?.protocolo_numero,
    dataAgendada: parsed.data_agendada ?? match?.agenda_data_agendada,
    locationName: parsed.location_name,
    sourceSender: parsed.source_sender,
    raw: body.raw ?? null,
  })

  if (!match) {
    await scheduleRepository.markEventStatus({
      id: inboundEvent.id,
      status: 'unmatched',
      processingNotes: 'Nenhuma venda/agendamento correspondente foi localizado com os dados informados.',
    })
    writeJson(res, 202, {
      ok: true,
      event_id: inboundEvent.id,
      matched: false,
      source,
      event_type: eventType,
      extracted: parsed,
      message: 'Evento recebido, mas sem correspondencia automatica.',
    }, corsOrigin)
    return true
  }

  const observacoesAutomacao = compactSpaces([
    parsed.observacoes,
    parsed.product_name ? `Produto: ${parsed.product_name}` : null,
    parsed.location_name ? `Posto: ${parsed.location_name}` : null,
    parsed.source_sender ? `Origem: ${parsed.source_sender}` : null,
  ].filter(Boolean).join(' | ')) || null

  const schedule = await scheduleRepository.upsertValidationSchedule({
    match,
    eventType,
    source,
    mailbox: normalizeText(body.mailbox ?? body.to),
    externalId: normalizeText(body.external_id),
    messageId: normalizeText(body.message_id),
    replyBrand: replyProfile.brand,
    dataAgendada: parsed.data_agendada ?? match.agenda_data_agendada,
    observacoes: observacoesAutomacao,
  })

  const nextSaleStatus = eventType === 'cancelamento' ? 'vendido' : 'agendado'
  await scheduleRepository.updateSaleStatus(match.venda_id, nextSaleStatus)

  const leadSync = await scheduleRepository.syncLeadKanban({
    phoneDigits: onlyDigits(parsed.customer_phone ?? match.titular_telefone ?? match.cadastro_telefone),
    customerName: parsed.customer_name ?? match.titular_nome ?? match.cadastro_nome,
    dataAgendada: parsed.data_agendada ?? match.agenda_data_agendada,
    eventType,
    replyBrand: replyProfile.brand,
  })

  const recipientEmail = parsed.customer_email ?? match.titular_email ?? match.cadastro_email
  const recipientPhone = parsed.customer_phone ?? match.titular_telefone ?? match.cadastro_telefone
  const customerName = parsed.customer_name ?? match.titular_nome ?? match.cadastro_nome
  const messages = buildConfirmationMessages({
    brand: replyProfile.brand,
    eventType,
    customerName,
    dataAgendada: parsed.data_agendada ?? match.agenda_data_agendada,
    emailSubject: replyProfile.emailSubject,
  })

  if (recipientPhone) {
    await outboxRepository.create({
      channel: 'whatsapp',
      provider: 'n8n',
      to_address: recipientPhone,
      body: messages.whatsapp,
      payload: {
        context: 'schedule_email_automation',
        venda_id: match.venda_id,
        agendamento_id: schedule.id,
        source,
        event_type: eventType,
      },
    })

    if (messages.docsWhatsapp) {
      await outboxRepository.create({
        channel: 'whatsapp',
        provider: 'n8n',
        to_address: recipientPhone,
        body: messages.docsWhatsapp,
        payload: {
          context: 'schedule_email_documents',
          venda_id: match.venda_id,
          agendamento_id: schedule.id,
          source,
          event_type: eventType,
        },
      })
    }
  }

  if (recipientEmail) {
    await outboxRepository.create({
      channel: 'email',
      provider: 'email_smtp',
      to_address: recipientEmail,
      subject: messages.emailSubject,
      body: messages.emailBody,
      payload: {
        context: 'schedule_email_automation',
        venda_id: match.venda_id,
        agendamento_id: schedule.id,
        source,
        event_type: eventType,
      },
    })

    if (messages.docsEmailSubject && messages.docsEmailBody) {
      await outboxRepository.create({
        channel: 'email',
        provider: 'email_smtp',
        to_address: recipientEmail,
        subject: messages.docsEmailSubject,
        body: messages.docsEmailBody,
        payload: {
          context: 'schedule_email_documents',
          venda_id: match.venda_id,
          agendamento_id: schedule.id,
          source,
          event_type: eventType,
        },
      })
    }
  }

  await scheduleRepository.markEventStatus({
    id: inboundEvent.id,
    status: 'processed',
    matchedAgendaId: schedule.id,
    matchedVendaId: match.venda_id,
    processingNotes: `Evento tratado automaticamente. Source=${source}. Tipo=${eventType}. Lead sync: ${leadSync.affected}.`,
  })

  writeJson(res, 200, {
    ok: true,
    event_id: inboundEvent.id,
    matched: true,
    source,
    event_type: eventType,
    extracted: parsed,
    venda_id: match.venda_id,
    agendamento_id: schedule.id,
    schedule_status: schedule.status,
    lead_sync: leadSync,
  }, corsOrigin)
  return true
}

