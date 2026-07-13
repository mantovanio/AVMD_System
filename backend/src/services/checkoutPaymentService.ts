import type { CheckoutPaymentMethodConfig, CheckoutRepository } from '../repositories/checkoutRepository.js'

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
}

type ChargeResult = {
  ok: boolean
  status: string
  externalId?: string | null
  chargeUrl?: string | null
  payload?: Record<string, unknown> | null
  error?: string | null
  mocked?: boolean
}

export class CheckoutPaymentService {
  constructor(
    private readonly repository: Pick<CheckoutRepository, 'getCheckoutPaymentMethodConfig' | 'getCheckoutPaymentMethodConfigByGateway' | 'attachPaymentChargeToSale' | 'applyPaymentWebhook'>,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

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
    })
    return result
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
    if (config.runtime.bloquear_integracoes_reais || config.runtime.modo_teste_geral || !config.provider_api_token || !config.gateway) {
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
    return {
      ok: true,
      status: 'pending',
      externalId: `mock_${input.vendaId}`,
      chargeUrl: `${base}/pay/${input.vendaId}`,
      payload: {
        mocked: true,
        gateway: config.gateway ?? 'manual',
        ambiente: config.ambiente,
      },
      mocked: true,
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
}
