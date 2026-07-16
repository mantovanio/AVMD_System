import type { CheckoutPaymentMethodConfig, CheckoutRepository } from '../repositories/checkoutRepository.js'
import type { CommunicationOutboxRepository } from '../repositories/communicationOutboxRepository.js'
import { createHmac, timingSafeEqual } from 'node:crypto'

type FetchLike = typeof fetch

type ChargeRequestInput = {
  vendaId: string
  valor: number
  descricao: string
  comprador: {
    nome: string
    email: string
    telefone: string
    documento: string
  }
  fiscal: {
    cep: string
    logradouro: string
    numero: string
    bairro: string
    cidade: string
    uf: string
  }
  card?: {
    token: string
    payment_method_id: string
    payment_type_id: 'credit_card' | 'debit_card'
    installments: number
    identification_type: string
    identification_number: string
  } | null
}

type ChargeResult = {
  ok: boolean
  status: string
  externalId?: string | null
  chargeUrl?: string | null
  payload?: Record<string, unknown> | null
  error?: string | null
  mocked?: boolean
  details?: Record<string, unknown> | null
}

type PaymentFlowKind = 'pix' | 'boleto' | 'card' | 'link'

export class CheckoutPaymentService {
  constructor(
    private readonly repository: Pick<CheckoutRepository, 'getCheckoutPaymentMethodConfig' | 'getCheckoutPaymentMethodConfigByGateway' | 'findCommercialSalePaymentData' | 'attachPaymentChargeToSale' | 'applyPaymentWebhook'>,
    private readonly outboxRepository?: CommunicationOutboxRepository,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async createCommercialPaymentLink(input: { vendaId: string; profileId: string }): Promise<ChargeResult> {
    const sale = await this.repository.findCommercialSalePaymentData?.(input.vendaId, input.profileId)
    if (!sale) return { ok: false, status: 'error', error: 'Venda não encontrada ou acesso não autorizado.' }
    return this.createChargeForSale({
      vendaId: sale.id,
      formaPagamentoId: sale.forma_pagamento_id,
      valor: sale.valor,
      descricao: sale.descricao,
      comprador: { nome: sale.nome, email: sale.email, telefone: sale.telefone, documento: sale.documento },
      fiscal: { cep: sale.cep, logradouro: sale.logradouro, numero: sale.numero, bairro: sale.bairro, cidade: sale.cidade, uf: sale.uf },
    })
  }

  async createChargeForSale(input: {
    vendaId: string
    formaPagamentoId: string
    valor: number
    descricao: string
    comprador: {
      nome: string
      email: string
      telefone: string
      documento: string
    }
    fiscal: ChargeRequestInput['fiscal']
    card?: ChargeRequestInput['card']
  }): Promise<ChargeResult> {
    const config = await this.repository.getCheckoutPaymentMethodConfig(input.formaPagamentoId)
    if (!config) {
      return { ok: false, status: 'error', error: 'Forma de pagamento não encontrada.' }
    }

    const result = await this.createCharge(config, input)
    await this.repository.attachPaymentChargeToSale({
      vendaId: input.vendaId,
      gateway: config.gateway ?? 'manual',
      externalId: result.externalId ?? null,
      chargeUrl: result.chargeUrl ?? null,
      status: result.status,
      payload: result.payload ?? (result.error ? { error: result.error } : {}),
      details: result.details ?? null,
    })
    await this.queuePurchaseNotifications({
      saleId: input.vendaId,
      compradorNome: input.comprador.nome,
      email: input.comprador.email,
      telefone: input.comprador.telefone,
      linkPagamento: result.chargeUrl ?? this.pickPaymentLink(result.details),
      valor: input.valor,
      descricao: input.descricao,
      paymentStatus: result.status,
      mocked: Boolean(result.mocked),
    })
    return result
  }

  private inferMercadoPagoMethod(config: CheckoutPaymentMethodConfig): PaymentFlowKind {
    const source = [config.codigo, config.tipo, config.nome]
      .map(value => String(value ?? '').toLowerCase().trim())
      .filter(Boolean)
      .join(' ')

    if (/boleto|bill|ticket/.test(source)) return 'boleto'
    if (/pix/.test(source)) return 'pix'
    if (/card|cart|cr[eé]dito|debito|d[eé]bito/.test(source)) return 'card'
    return 'link'
  }

  async applyWebhook(input: {
    gateway: string
    payload: Record<string, unknown>
  }) {
    const normalized = this.normalizeWebhookPayload(input.payload)
    await this.repository.applyPaymentWebhook({
      vendaId: normalized.vendaId,
      externalId: normalized.externalId,
      gateway: input.gateway,
      status: normalized.status,
      paid: normalized.paid,
      payload: input.payload,
    })
    return normalized
  }

  private async createCharge(config: CheckoutPaymentMethodConfig, input: ChargeRequestInput): Promise<ChargeResult> {
    if (config.runtime.bloquear_integracoes_reais || !config.provider_api_token || !config.gateway) {
      return this.buildMockCharge(config, input)
    }

    try {
      if (config.gateway === 'safe2pay') return await this.createSafe2PayCharge(config, input)
      if (config.gateway === 'mercado_pago') return await this.createMercadoPagoCharge(config, input)
      return {
        ok: false,
        status: 'error',
        error: `Gateway ${config.gateway} ainda não possui integração de cobrança.`,
      }
    } catch (error) {
      return {
        ok: false,
        status: 'error',
        error: error instanceof Error ? error.message : 'Falha ao criar cobrança no gateway.',
      }
    }
  }

  private async createMercadoPagoCharge(config: CheckoutPaymentMethodConfig, input: ChargeRequestInput): Promise<ChargeResult> {
    const method = this.inferMercadoPagoMethod(config)
    if (method === 'pix' || method === 'boleto' || method === 'card') {
      return this.createMercadoPagoOrder(config, input, method)
    }

    const endpoint = `${(config.provider_base_url?.trim() || 'https://api.mercadopago.com').replace(/\/$/, '')}/checkout/preferences`
    const callbackUrl = this.resolveMercadoPagoCallbackUrl(config)
    const document = input.comprador.documento.replace(/\D/g, '')
    const phone = input.comprador.telefone.replace(/\D/g, '')
    const body = {
      items: [{
        id: input.vendaId,
        title: input.descricao,
        description: input.descricao,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: Number(input.valor.toFixed(2)),
      }],
      payer: {
        name: input.comprador.nome,
        email: input.comprador.email,
        phone: phone ? { area_code: phone.slice(0, 2), number: phone.slice(2) } : undefined,
        identification: document ? { type: document.length === 14 ? 'CNPJ' : 'CPF', number: document } : undefined,
      },
      external_reference: input.vendaId,
      notification_url: callbackUrl,
      metadata: { venda_id: input.vendaId, gateway: 'mercado_pago' },
    }

    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.provider_api_token}`,
        'X-Idempotency-Key': input.vendaId,
      },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(String(payload.message || payload.error || `Mercado Pago respondeu ${response.status}`))
    }

    return {
      ok: true,
      status: 'pending',
      externalId: this.pickString(payload, ['id']),
      chargeUrl: this.pickString(payload, config.ambiente === 'sandbox' ? ['sandbox_init_point', 'init_point'] : ['init_point']),
      payload,
    }
  }

  private async createMercadoPagoOrder(config: CheckoutPaymentMethodConfig, input: ChargeRequestInput, method: string): Promise<ChargeResult> {
    const endpoint = `${(config.provider_base_url?.trim() || 'https://api.mercadopago.com').replace(/\/$/, '')}/v1/orders`
    const amount = input.valor.toFixed(2)
    const isPix = method === 'pix'
    const isBoleto = method === 'boleto'
    if (!isPix && !isBoleto && !input.card?.token) {
      return { ok: false, status: 'error', error: 'Token seguro do cartão não informado.' }
    }
    const nameParts = input.comprador.nome.trim().split(/\s+/)
    const firstName = nameParts.shift() || input.comprador.nome
    const lastName = nameParts.join(' ') || firstName
    const paymentMethod = isPix
      ? { id: 'pix', type: 'bank_transfer' }
      : isBoleto
        ? { id: 'boleto', type: 'ticket' }
        : {
            id: input.card!.payment_method_id,
            type: input.card!.payment_type_id,
            token: input.card!.token,
            installments: Math.max(1, Number(input.card!.installments || 1)),
          }
    const payment: Record<string, unknown> = { amount, payment_method: paymentMethod }
    if (isPix) payment.expiration_time = 'P1D'
    if (isBoleto) payment.expiration_time = 'P3D'
    const payer: Record<string, unknown> = {
      email: input.comprador.email,
      first_name: firstName,
      last_name: lastName,
      identification: {
        type: input.card?.identification_type || (input.comprador.documento.replace(/\D/g, '').length === 14 ? 'CNPJ' : 'CPF'),
        number: input.card?.identification_number || input.comprador.documento.replace(/\D/g, ''),
      },
    }
    if (isBoleto) {
      payer.address = {
        street_name: input.fiscal.logradouro,
        street_number: input.fiscal.numero || 'S/N',
        zip_code: input.fiscal.cep.replace(/\D/g, ''),
        neighborhood: input.fiscal.bairro,
        state: input.fiscal.uf,
        city: input.fiscal.cidade,
      }
    }
    const body = {
      type: 'online',
      processing_mode: 'automatic',
      total_amount: amount,
      external_reference: input.vendaId,
      description: input.descricao,
      payer,
      transactions: { payments: [payment] },
    }
    const idempotencyKey = `avmd-${input.vendaId}-${isPix ? 'pix' : isBoleto ? 'boleto' : 'card'}`
    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.provider_api_token}`,
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error(String(payload.message || payload.error || `Mercado Pago respondeu ${response.status}`))
    const transaction = this.firstPayment(payload)
    const paymentMethodResponse = this.asObject(transaction.payment_method)
    const status = this.normalizeOrderStatus(payload, transaction)
    const details = {
      gateway: 'mercado_pago',
      order_id: this.pickString(payload, ['id']),
      payment_id: this.pickString(transaction, ['id']),
      kind: isPix ? 'pix' : isBoleto ? 'boleto' : 'card',
      ticket_url: this.pickString(paymentMethodResponse, ['ticket_url']),
      qr_code: this.pickString(paymentMethodResponse, ['qr_code']),
      qr_code_base64: this.pickString(paymentMethodResponse, ['qr_code_base64']),
      digitable_line: this.pickString(paymentMethodResponse, ['digitable_line']),
      barcode_content: this.pickString(paymentMethodResponse, ['barcode_content']),
    }
    return {
      ok: true,
      status,
      externalId: details.order_id,
      chargeUrl: details.ticket_url,
      payload,
      details,
    }
  }

  private resolveMercadoPagoCallbackUrl(config: CheckoutPaymentMethodConfig) {
    const metadataUrl = this.pickString(config.provider_metadata, ['public_webhook_url', 'notification_url'])
    if (metadataUrl) return metadataUrl
    if (config.webhook_url) return config.webhook_url
    return 'https://api.certiid.mantovan.com.br/api/checkout/webhook/mercado-pago'
  }

  private async fetchMercadoPagoPayment(config: CheckoutPaymentMethodConfig, paymentId: string) {
    const endpoint = `${(config.provider_base_url?.trim() || 'https://api.mercadopago.com').replace(/\/$/, '')}/v1/payments/${encodeURIComponent(paymentId)}`
    const response = await this.fetchImpl(endpoint, {
      headers: { 'Authorization': `Bearer ${config.provider_api_token}` },
    })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error(String(payload.message || payload.error || `Mercado Pago respondeu ${response.status}`))
    return payload
  }

  async applyMercadoPagoWebhook(payload: Record<string, unknown>) {
    const data = this.asObject(payload.data)
    const paymentId = this.pickString(data, ['id']) || this.pickString(payload, ['id'])
    if (!paymentId) return { externalId: null, vendaId: null, status: 'pending', paid: false }

    const config = await this.repository.getCheckoutPaymentMethodConfigByGateway?.('mercado_pago')
    if (!config?.provider_api_token) throw new Error('Credencial do Mercado Pago não configurada.')
    const payment = await this.fetchMercadoPagoPayment(config, paymentId)
    const normalized = this.normalizeWebhookPayload(payment)
    await this.repository.applyPaymentWebhook({
      vendaId: normalized.vendaId,
      externalId: normalized.externalId || paymentId,
      gateway: 'mercado_pago',
      status: normalized.status,
      paid: normalized.paid,
      payload: payment,
    })
    return normalized
  }

  private buildMockCharge(config: CheckoutPaymentMethodConfig, input: ChargeRequestInput): ChargeResult {
    const base = (config.webhook_url || 'https://pagamento.exemplo.local').replace(/\/$/, '')
    const method = this.inferMercadoPagoMethod(config)
    const isPix = method === 'pix'
    const isBoleto = method === 'boleto'
    const isCard = method === 'card' || method.includes('cart')
    const kind = isPix ? 'pix' : isBoleto ? 'boleto' : isCard ? 'card' : 'link'
    const paymentId = `mock_${input.vendaId}_${kind}`
    return {
      ok: true,
      status: 'pending',
      externalId: paymentId,
      chargeUrl: `${base}/pay/${input.vendaId}`,
      payload: {
        mocked: true,
        gateway: config.gateway ?? 'manual',
        ambiente: config.ambiente,
      },
      mocked: true,
      details: {
        gateway: config.gateway ?? 'manual',
        order_id: paymentId,
        payment_id: paymentId,
        kind,
        ticket_url: `${base}/pay/${input.vendaId}`,
        qr_code: isPix ? `PIX-MOCK-${input.vendaId}` : null,
        digitable_line: isBoleto ? `34191.79001 01043.510047 91020.150008 7 ${String(input.vendaId).slice(0, 4)}` : null,
        barcode_content: isBoleto ? `34197.${String(input.vendaId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}` : null,
      },
    }
  }

  private async createSafe2PayCharge(config: CheckoutPaymentMethodConfig, input: ChargeRequestInput): Promise<ChargeResult> {
    const endpoint = this.resolveSafe2PayChargeUrl(config)
    const callbackUrl = this.resolveSafe2PayCallbackUrl(config)
    const body = {
      reference: input.vendaId,
      amount: Number(input.valor.toFixed(2)),
      description: input.descricao,
      customer: {
        name: input.comprador.nome,
        email: input.comprador.email,
        phone: input.comprador.telefone,
        document: input.comprador.documento,
      },
      payment_method: config.codigo || config.tipo || 'pix',
      callback_url: callbackUrl,
      metadata: {
        venda_id: input.vendaId,
        gateway: 'safe2pay',
      },
    }

    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.provider_api_token}`,
        'x-api-key': config.provider_api_token ?? undefined,
      },
      body: JSON.stringify(body),
    })

    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(String(payload.error || payload.message || `Gateway respondeu ${response.status}`))
    }

    return {
      ok: true,
      status: this.normalizeChargeStatus(payload),
      externalId: this.pickString(payload, ['id', 'Id', 'payment_id', 'paymentId', 'invoice_id', 'InvoiceNumber']),
      chargeUrl: this.pickString(payload, ['payment_url', 'PaymentUrl', 'invoice_url', 'InvoiceUrl', 'url', 'Url', 'link', 'Link']),
      payload,
    }
  }

  private resolveSafe2PayChargeUrl(config: CheckoutPaymentMethodConfig) {
    const metadataUrl = this.pickString(config.provider_metadata, ['charge_url'])
    if (metadataUrl) return metadataUrl
    const baseUrl = config.provider_base_url?.trim() || (config.ambiente === 'sandbox' ? 'https://sandbox.safe2pay.com.br' : 'https://api.safe2pay.com.br')
    if (/\/v\d+/i.test(baseUrl) || /payment/i.test(baseUrl)) return baseUrl
    return `${baseUrl.replace(/\/$/, '')}/v2/payment`
  }

  private resolveSafe2PayCallbackUrl(config: CheckoutPaymentMethodConfig) {
    const metadataUrl = this.pickString(config.provider_metadata, ['public_webhook_url', 'callback_url'])
    if (metadataUrl) return metadataUrl
    if (config.webhook_url) return config.webhook_url
    return 'https://crm.certiid.mantovan.com.br/api/checkout/webhook/safe2pay'
  }

  private normalizeWebhookPayload(payload: Record<string, unknown>) {
    const externalId = this.pickString(payload, ['external_id', 'payment_id', 'id', 'transaction_id', 'TransactionId'])
    const vendaId = this.pickString(payload, ['reference', 'external_reference', 'reference_id', 'order_id', 'venda_id'])
      || this.pickString(this.asObject(payload.metadata), ['venda_id', 'sale_id'])
    const status = this.normalizeChargeStatus(payload)
    const paidStatuses = new Set(['paid', 'approved', 'completed', 'success', 'available', 'confirmado', 'compensado'])
    return {
      externalId,
      vendaId,
      status,
      paid: paidStatuses.has(status),
    }
  }

  private normalizeChargeStatus(payload: Record<string, unknown>) {
    const raw = String(
      this.pickString(payload, ['status', 'Status', 'payment_status', 'paymentStatus'])
      || this.pickString(this.asObject(payload.response), ['status', 'Status'])
      || 'pending'
    ).trim().toLowerCase()

    if (['paid', 'approved', 'completed', 'success', 'available', 'confirmado', 'compensado'].includes(raw)) return 'paid'
    if (['failed', 'error', 'denied', 'cancelled', 'canceled', 'refused'].includes(raw)) return 'failed'
    return 'pending'
  }

  async applyMercadoPagoOrderWebhook(input: {
    payload: Record<string, unknown>
    dataId: string
    xSignature: string
    xRequestId: string
  }) {
    const orderId = input.dataId || this.pickString(this.asObject(input.payload.data), ['id'])
    if (!orderId) throw new Error('Webhook sem identificador da order.')
    const config = await this.repository.getCheckoutPaymentMethodConfigByGateway?.('mercado_pago')
    if (!config?.provider_api_token) throw new Error('Credencial do Mercado Pago não configurada.')
    if (!config.webhook_secret) throw new Error('Chave secreta do webhook do Mercado Pago não configurada.')
    if (!this.validateWebhookSignature({ ...input, dataId: orderId, secret: config.webhook_secret })) {
      const error = new Error('Assinatura do webhook inválida.') as Error & { statusCode?: number }
      error.statusCode = 401
      throw error
    }
    const endpoint = `${(config.provider_base_url?.trim() || 'https://api.mercadopago.com').replace(/\/$/, '')}/v1/orders/${encodeURIComponent(orderId)}`
    const response = await this.fetchImpl(endpoint, { headers: { 'Authorization': `Bearer ${config.provider_api_token}` } })
    const order = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error(String(order.message || order.error || `Mercado Pago respondeu ${response.status}`))
    const payment = this.firstPayment(order)
    const normalizedStatus = this.normalizeOrderStatus(order, payment)
    const vendaId = this.pickString(order, ['external_reference'])
    const paymentId = this.pickString(payment, ['id'])
    await this.repository.applyPaymentWebhook({
      vendaId,
      externalId: orderId,
      gateway: 'mercado_pago',
      status: normalizedStatus,
      paid: normalizedStatus === 'paid',
      payload: order,
    })
    return { orderId, paymentId, vendaId, status: normalizedStatus, paid: normalizedStatus === 'paid' }
  }

  private validateWebhookSignature(input: { dataId: string; xSignature: string; xRequestId: string; secret: string }) {
    let ts = ''
    let hash = ''
    for (const part of input.xSignature.split(',')) {
      const [key, value] = part.split('=', 2).map(item => item.trim())
      if (key === 'ts') ts = value || ''
      if (key === 'v1') hash = value || ''
    }
    if (!ts || !hash) return false
    const parts = [`id:${input.dataId.toLowerCase()}`]
    if (input.xRequestId) parts.push(`request-id:${input.xRequestId}`)
    parts.push(`ts:${ts}`)
    const computed = createHmac('sha256', input.secret).update(`${parts.join(';')};`).digest('hex')
    const computedBuffer = Buffer.from(computed)
    const hashBuffer = Buffer.from(hash)
    return computedBuffer.length === hashBuffer.length && timingSafeEqual(computedBuffer, hashBuffer)
  }

  private firstPayment(payload: Record<string, unknown>) {
    const transactions = this.asObject(payload.transactions)
    const payments = Array.isArray(transactions.payments) ? transactions.payments : []
    return this.asObject(payments[0])
  }

  private normalizeOrderStatus(payload: Record<string, unknown>, payment = this.firstPayment(payload)) {
    const status = String(payment.status || payload.status || '').toLowerCase()
    const detail = String(payment.status_detail || payload.status_detail || '').toLowerCase()
    if (status === 'processed' && detail === 'accredited') return 'paid'
    if (['failed', 'rejected', 'cancelled', 'canceled', 'expired', 'charged_back'].includes(status)) return 'failed'
    return 'pending'
  }

  private pickString(source: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = source[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number') return String(value)
    }
    return null
  }

  private asObject(value: unknown): Record<string, unknown> {
    if (!value) return {}
    return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  }

  private pickPaymentLink(details: Record<string, unknown> | null | undefined) {
    if (!details) return null
    const link = typeof details.ticket_url === 'string' ? details.ticket_url.trim() : ''
    return link || null
  }

  private async queuePurchaseNotifications(input: {
    saleId: string
    compradorNome: string
    email: string
    telefone: string
    linkPagamento: string | null
    valor: number
    descricao: string
    paymentStatus: string
    mocked: boolean
  }) {
    if (!this.outboxRepository) return
    const link = input.linkPagamento
    const body = [
      `Olá, ${input.compradorNome}.`,
      `Recebemos sua compra${input.mocked ? ' em ambiente de teste' : ''}: ${input.descricao}.`,
      `Valor: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(input.valor)}.`,
      link ? `Link de pagamento: ${link}` : 'Seu pagamento foi registrado e segue em processamento.',
      `Status: ${input.paymentStatus}.`,
    ].join(' ')
    const payload = {
      sale_id: input.saleId,
      tipo: 'checkout_payment_link',
      canal: 'checkout',
      payment_status: input.paymentStatus,
      mocked: input.mocked,
      link_pagamento: link,
    }

    const jobs: Array<Promise<unknown>> = []
    if (input.email.trim()) {
      jobs.push(this.outboxRepository.create({
        channel: 'email',
        provider: 'email_smtp',
        to_address: input.email.trim(),
        subject: link ? 'Seu link de pagamento' : 'Sua compra foi recebida',
        body,
        payload,
      }))
    }
    if (input.telefone.trim()) {
      jobs.push(this.outboxRepository.create({
        channel: 'whatsapp',
        provider: 'evolution',
        to_address: input.telefone.trim(),
        body,
        payload,
      }))
    }

    await Promise.allSettled(jobs)
  }
}
