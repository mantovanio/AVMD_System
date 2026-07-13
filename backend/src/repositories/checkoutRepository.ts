import type {
  AgendaAgent,
  AgendaPoint,
  AgendaSlot,
  CheckoutExistingCustomerLookup,
  CheckoutPriceTable,
  CheckoutProduct,
  CheckoutStore,
  CheckoutSubmitRequest,
} from '../contracts/checkoutContract.js'

export type PaymentRuntimeSetting = {
  modo_teste_geral: boolean
  bloquear_integracoes_reais: boolean
  aviso_checkout: string
}

export type PaymentOptionRow = {
  id: string
  nome: string
  codigo: string | null
  tipo: string | null
  gateway?: string | null
  public_key?: string | null
}

export type CheckoutPaymentMethodConfig = {
  id: string
  nome: string
  codigo: string | null
  tipo: string | null
  gateway: string | null
  ambiente: 'sandbox' | 'producao'
  client_id: string | null
  secret_key: string | null
  webhook_url: string | null
  provider_base_url: string | null
  provider_api_token: string | null
  provider_metadata: Record<string, unknown>
  webhook_secret?: string | null
  runtime: PaymentRuntimeSetting
}

export type CheckoutScheduleContextInput = {
  tabelaPrecoId: string
  parceiroId?: string | null
}

export type CreateCheckoutSaleInput = {
  payload: CheckoutSubmitRequest
  loja: CheckoutStore
  item: CheckoutProduct
  tabela: CheckoutPriceTable | null
  cadastroBaseId: string
  titularId: string | null
}

export type CreateCheckoutScheduleInput = {
  payload: CheckoutSubmitRequest
  vendaId: string
  cadastroBaseId: string
  titularId: string | null
}

export interface CheckoutRepository {
  findMarketplaceStore(slug: string | null): Promise<CheckoutStore | null>
  findPriceTable(tabelaPrecoId: string): Promise<CheckoutPriceTable | null>
  findMarketplaceProducts(tabelaPrecoId: string): Promise<CheckoutProduct[]>
  findMarketplaceItem(itemId: string): Promise<CheckoutProduct | null>
  findActivePaymentMethods(): Promise<PaymentOptionRow[]>
  getPaymentRuntime(): Promise<PaymentRuntimeSetting>
  getCheckoutPaymentMethodConfig(formaPagamentoId: string): Promise<CheckoutPaymentMethodConfig | null>
  getCheckoutPaymentMethodConfigByGateway?(gateway: string): Promise<CheckoutPaymentMethodConfig | null>
  getCheckoutScheduleContext(input: CheckoutScheduleContextInput): Promise<{ agentes: AgendaAgent[]; pontos: AgendaPoint[]; slots: AgendaSlot[] }>
  findLatestActiveCustomerByDocument(documento: string): Promise<CheckoutExistingCustomerLookup | null>
  upsertCheckoutCustomer(payload: CheckoutSubmitRequest): Promise<{ id: string }>
  upsertCheckoutHolder(payload: CheckoutSubmitRequest): Promise<{ id: string | null }>
  createCheckoutSale(input: CreateCheckoutSaleInput): Promise<{ id: string; protocolo_numero: string | null }>
  attachPaymentChargeToSale(input: {
    vendaId: string
    gateway: string
    externalId?: string | null
    chargeUrl?: string | null
    status: string
    payload?: Record<string, unknown> | null
    details?: Record<string, unknown> | null
  }): Promise<void>
  applyPaymentWebhook(input: {
    vendaId?: string | null
    externalId?: string | null
    gateway: string
    status: string
    paid: boolean
    payload?: Record<string, unknown> | null
  }): Promise<void>
  createCheckoutSchedule(input: CreateCheckoutScheduleInput): Promise<void>
}
