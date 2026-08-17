import type { CommunicationOutboxRepository, OutboxRow } from '../repositories/communicationOutboxRepository.js'

export type ClaraWhatsappAutomationType =
  | 'renovacao_aviso'
  | 'compra_realizada'
  | 'pagamento_pendente'
  | 'agendamento_lembrete'
  | 'documentos_validacao'
  | 'nota_fiscal_copia'
  | 'reagendamento_link'

export type ClaraWhatsappAutomationInput = {
  type: ClaraWhatsappAutomationType
  phone: string
  name?: string | null
  entity_id?: string | null
  entity_type?: string | null
  event_key?: string | null
  scheduled_for?: string | null
  payload?: Record<string, unknown> | null
}

function text(value: unknown) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function firstName(value: string | null | undefined) {
  return text(value)?.split(/\s+/)[0] ?? 'cliente'
}

function currency(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number)
}

function dateTime(value: unknown) {
  const raw = text(value)
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date)
}

function paymentInstruction(payload: Record<string, unknown>) {
  const paymentMethod = text(payload.payment_method ?? payload.forma_pagamento ?? payload.tipo_pagamento)?.toLowerCase() ?? ''
  const link = text(payload.payment_link ?? payload.link_pagamento ?? payload.charge_url)
  const pixCode = text(payload.pix_code ?? payload.qr_code ?? payload.copia_cola)
  const digitableLine = text(payload.digitable_line ?? payload.linha_digitavel ?? payload.barcode_content)

  if (paymentMethod.includes('pix')) {
    return [
      link ? `Link do Pix: ${link}` : null,
      pixCode ? `Pix copia e cola: ${pixCode}` : null,
      !link && !pixCode ? 'Seu Pix foi gerado e pode ser consultado no portal Minhas Compras.' : null,
    ].filter(Boolean).join('\n')
  }

  if (paymentMethod.includes('boleto')) {
    return [
      link ? `Boleto: ${link}` : null,
      digitableLine ? `Linha digitável: ${digitableLine}` : null,
      !link && !digitableLine ? 'Seu boleto foi gerado e pode ser consultado no portal Minhas Compras.' : null,
    ].filter(Boolean).join('\n')
  }

  return link
    ? `Link de pagamento: ${link}`
    : 'O pagamento pode ser acessado pelo portal Minhas Compras.'
}

function buildMessage(input: ClaraWhatsappAutomationInput) {
  const payload = input.payload ?? {}
  const name = firstName(input.name ?? text(payload.customer_name ?? payload.nome_cliente))
  const product = text(payload.product_name ?? payload.produto ?? payload.descricao) ?? 'certificado digital'
  const order = text(payload.order_number ?? payload.pedido_numero ?? payload.pedido)
  const protocol = text(payload.protocol ?? payload.protocolo_numero ?? payload.protocolo)
  const value = currency(payload.amount ?? payload.valor ?? payload.valor_venda)
  const schedule = dateTime(payload.scheduled_at ?? payload.data_agendada ?? payload.agendamento)
  const portalUrl = text(payload.portal_url) ?? 'https://portal.certiid.com.br'
  const invoiceUrl = text(payload.invoice_url ?? payload.nota_fiscal_url ?? payload.nf_url)
  const rescheduleUrl = text(payload.reschedule_url ?? payload.link_reagendamento)
  const orderText = order ? `Pedido ${order}` : 'Seu pedido'

  if (input.type === 'renovacao_aviso') {
    const expiration = dateTime(payload.expires_at ?? payload.data_vencimento)
    return [
      `Olá, ${name}. Aqui é a Clara da CertiID.`,
      `Seu ${product}${expiration ? ` vence em ${expiration}` : ' está no período de renovação'}.`,
      'Posso te ajudar a renovar de forma simples, sem perder prazo e sem interromper o uso do certificado.',
      text(payload.renewal_link ?? payload.link_renovacao) ? `Para seguir agora: ${text(payload.renewal_link ?? payload.link_renovacao)}` : `Se preferir, acesse: ${portalUrl}`,
    ].join('\n\n')
  }

  if (input.type === 'compra_realizada' || input.type === 'pagamento_pendente') {
    return [
      `Olá, ${name}. Recebemos sua compra na CertiID.`,
      `${orderText}: ${product}${value ? ` no valor de ${value}` : ''}.`,
      paymentInstruction(payload),
      'Assim que o pagamento for confirmado, o próximo passo é a validação do certificado.',
      `Você também pode acompanhar tudo pelo portal: ${portalUrl}`,
    ].join('\n\n')
  }

  if (input.type === 'agendamento_lembrete') {
    return [
      `Olá, ${name}. Passando para lembrar seu agendamento de validação${schedule ? ` em ${schedule}` : ''}.`,
      `${orderText}${protocol ? ` | Protocolo ${protocol}` : ''}: ${product}.`,
      'Para evitar atraso, deixe separado o documento pessoal e, se for certificado de empresa, o contrato social ou documento societário atualizado.',
      rescheduleUrl ? `Se precisar reagendar, use este link: ${rescheduleUrl}` : `Se precisar reagendar, acesse: ${portalUrl}`,
    ].join('\n\n')
  }

  if (input.type === 'documentos_validacao') {
    return [
      `Olá, ${name}. Para seguir com a validação do seu ${product}, precisamos receber os documentos pelo WhatsApp.`,
      'Envie por aqui uma foto nítida do documento pessoal. Para e-CNPJ, envie também o contrato social ou documento societário atualizado.',
      'Se já enviou, pode desconsiderar esta mensagem.',
    ].join('\n\n')
  }

  if (input.type === 'nota_fiscal_copia') {
    return [
      `Olá, ${name}. A cópia da nota fiscal do seu pedido está disponível.`,
      invoiceUrl ? `Acesse aqui: ${invoiceUrl}` : `Consulte pelo portal Minhas Compras: ${portalUrl}`,
      'Se precisar de ajuda para localizar a nota, me responda por aqui.',
    ].join('\n\n')
  }

  return [
    `Olá, ${name}. Você pode reagendar sua validação por este link:`,
    rescheduleUrl ?? portalUrl,
    'Escolha o melhor horário disponível e acompanhe a atualização pelo portal Minhas Compras.',
  ].join('\n\n')
}

export class ClaraWhatsappAutomationService {
  constructor(private readonly outboxRepository: CommunicationOutboxRepository) {}

  async queue(input: ClaraWhatsappAutomationInput): Promise<OutboxRow> {
    const payload = input.payload ?? {}
    const eventKey = text(input.event_key)
      ?? text(payload.event_key)
      ?? [
        'clara_whatsapp',
        input.type,
        input.entity_type ?? text(payload.entity_type) ?? 'manual',
        input.entity_id ?? text(payload.entity_id) ?? text(payload.sale_id) ?? text(payload.renovacao_id) ?? text(payload.agendamento_id) ?? input.phone,
      ].join(':')

    return this.outboxRepository.create({
      channel: 'whatsapp',
      provider: 'evolution',
      to_address: input.phone,
      subject: null,
      body: buildMessage(input),
      scheduled_for: input.scheduled_for ?? undefined,
      payload: {
        ...payload,
        event_key: eventKey,
        tipo: input.type,
        canal: text(payload.canal) ?? 'atendimento',
        source: 'clara',
        clara_mode: 'automation',
        clara_intent: input.type,
        entity_id: input.entity_id ?? text(payload.entity_id),
        entity_type: input.entity_type ?? text(payload.entity_type),
      },
    })
  }
}
