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
  getCheckoutScheduleContext(input: CheckoutScheduleContextInput): Promise<{ agentes: AgendaAgent[]; pontos: AgendaPoint[]; slots: AgendaSlot[] }>
  findLatestActiveCustomerByDocument(documento: string): Promise<CheckoutExistingCustomerLookup | null>
  upsertCheckoutCustomer(payload: CheckoutSubmitRequest): Promise<{ id: string }>
  upsertCheckoutHolder(payload: CheckoutSubmitRequest): Promise<{ id: string | null }>
  createCheckoutSale(input: CreateCheckoutSaleInput): Promise<{ id: string; protocolo_numero: string | null }>
  createCheckoutSchedule(input: CreateCheckoutScheduleInput): Promise<void>
}
