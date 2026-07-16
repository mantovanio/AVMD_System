import { postJson, getCheckoutBackendUrl, useLegacySupabase } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import type { CadastroBase, Certificado, LojaMarketplace, TabelaPreco, TabelaPrecoItem } from '@/types'
import type {
  CheckoutContextApiResponse,
  CheckoutContextRequest,
  CheckoutLookupCustomerApiResponse,
  CheckoutLookupCustomerRequest,
  CheckoutSubmitRequest,
  CheckoutSubmitResponse,
} from '@/lib/checkoutContract'

export type LojaItemRow = TabelaPrecoItem & {
  certificados: Certificado | null
}

export type PaymentOption = {
  id: string
  nome: string
  codigo: string | null
  tipo: string | null
  gateway?: string | null
  public_key?: string | null
}

export type AgendaSlot = {
  agente_registro_id: string
  ponto_atendimento_id: string
  inicio: string
  fim: string
  capacidade_total: number
  vagas_restantes: number
  tipo_atendimento: string | null
  agente_nome: string
  ponto_nome: string
}

export type AgendaAgent = {
  id: string
  nome: string
}

export type AgendaPoint = {
  id: string
  nome: string
}

export type PaymentRuntime = {
  modo_teste_geral: boolean
  bloquear_integracoes_reais: boolean
  aviso_checkout: string
}

export type CheckoutContextResponse = {
  ok: boolean
  loja?: LojaMarketplace | null
  tabela?: TabelaPreco | null
  produtos?: LojaItemRow[]
  payment_runtime: PaymentRuntime
  pagamentos: PaymentOption[]
  agentes: AgendaAgent[]
  pontos: AgendaPoint[]
  slots: AgendaSlot[]
}

export type MarketplaceCheckoutContext = {
  loja: LojaMarketplace
  tabela: TabelaPreco | null
  produtos: LojaItemRow[]
  paymentRuntime: PaymentRuntime
  pagamentos: PaymentOption[]
  agentes: AgendaAgent[]
  pontos: AgendaPoint[]
  slots: AgendaSlot[]
}

export type CheckoutExistingCustomerLookup = Pick<
  CadastroBase,
  'tipo_cliente' | 'cpf_cnpj' | 'nome' | 'nome_fantasia' | 'email' | 'telefone' | 'cep' | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf'
>

function defaultPaymentRuntime(): PaymentRuntime {
  return {
    modo_teste_geral: false,
    bloquear_integracoes_reais: false,
    aviso_checkout: 'O atendimento sera liberado apos a confirmacao do pagamento.',
  }
}

async function fetchLegacyMarketplaceCheckoutContext(slug?: string | null): Promise<MarketplaceCheckoutContext> {
  let lojaQuery = supabase
    .from('lojas_marketplace')
    .select('*')
    .eq('ativo', true)

  if (slug) {
    lojaQuery = lojaQuery.eq('slug', slug)
  } else {
    lojaQuery = lojaQuery.eq('owner_tipo', 'institucional').order('created_at', { ascending: true }).limit(1)
  }

  const { data: lojaData, error: lojaErr } = await lojaQuery.maybeSingle()

  if (lojaErr) {
    throw new Error(lojaErr.message)
  }

  if (!lojaData) {
    throw new Error(slug ? 'Loja nao encontrada ou indisponivel no momento.' : 'Nenhuma loja institucional foi configurada ainda.')
  }

  const contextRequest: CheckoutContextRequest = { action: 'context', slug: slug ?? null }

  const [tabelaRes, itensRes, contextBody] = await Promise.all([
    supabase.from('tabelas_preco').select('*').eq('id', lojaData.tabela_preco_id).maybeSingle(),
    supabase
      .from('tabelas_preco_itens')
      .select('*, certificados(*)')
      .eq('tabela_preco_id', lojaData.tabela_preco_id)
      .eq('ativo', true)
      .order('created_at', { ascending: true }),
    postJson<CheckoutContextApiResponse>(getCheckoutBackendUrl('context'), contextRequest),
  ])

  const fetchErr = tabelaRes.error ?? itensRes.error
  if (fetchErr && !contextBody.ok) {
    throw new Error(fetchErr.message)
  }

  if (!contextBody.ok) {
    throw new Error(contextBody.error || 'Nao foi possivel carregar pagamento e agenda.')
  }

  const itensBrutos = Array.isArray(contextBody.produtos) && contextBody.produtos.length > 0
    ? contextBody.produtos
    : (itensRes.data ?? []) as unknown as LojaItemRow[]

  const certificadoIds = Array.from(new Set(itensBrutos.map(item => item.certificado_id).filter(Boolean)))
  let certificadosMap = new Map<string, Certificado>()

  if ((!Array.isArray(contextBody.produtos) || contextBody.produtos.length === 0) && certificadoIds.length > 0) {
    const { data: certificadosData } = await supabase
      .from('certificados')
      .select('*')
      .in('id', certificadoIds)

    certificadosMap = new Map(
      ((certificadosData ?? []) as Certificado[]).map(certificado => [certificado.id, certificado])
    )
  }

  const itensAtivos = itensBrutos.map(item => ({
    ...item,
    certificados: certificadosMap.get(item.certificado_id) ?? item.certificados ?? null,
  }))

  return {
    loja: lojaData as LojaMarketplace,
    tabela: (contextBody.tabela ?? tabelaRes.data ?? null) as TabelaPreco | null,
    produtos: itensAtivos,
    pagamentos: contextBody.pagamentos ?? [],
    agentes: contextBody.agentes ?? [],
    pontos: contextBody.pontos ?? [],
    slots: contextBody.slots ?? [],
    paymentRuntime: contextBody.payment_runtime ?? defaultPaymentRuntime(),
  }
}

async function fetchAivenMarketplaceCheckoutContext(slug?: string | null): Promise<MarketplaceCheckoutContext> {
  const request: CheckoutContextRequest = {
    action: 'context',
    slug: slug ?? null,
  }

  const response = await postJson<CheckoutContextApiResponse>(getCheckoutBackendUrl('context'), request)

  if (!response.ok || !response.loja) {
    throw new Error(response.error || 'Nao foi possivel carregar o checkout publico no backend do Aiven.')
  }

  return {
    loja: response.loja,
    tabela: response.tabela ?? null,
    produtos: response.produtos ?? [],
    pagamentos: response.pagamentos ?? [],
    agentes: response.agentes ?? [],
    pontos: response.pontos ?? [],
    slots: response.slots ?? [],
    paymentRuntime: response.payment_runtime ?? defaultPaymentRuntime(),
  }
}

async function fetchLegacyExistingCustomer(documento: string): Promise<CheckoutExistingCustomerLookup | null> {
  const candidatos = Array.from(new Set([documento, formatCpfCnpj(documento)]))

  const { data, error } = await supabase
    .from('cadastros_base')
    .select('tipo_cliente, cpf_cnpj, nome, nome_fantasia, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf')
    .eq('status', 'ativo')
    .in('cpf_cnpj', candidatos)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return data as CheckoutExistingCustomerLookup
}

async function fetchAivenExistingCustomer(documento: string): Promise<CheckoutExistingCustomerLookup | null> {
  const request: CheckoutLookupCustomerRequest = { action: 'lookup_customer', documento }
  const response = await postJson<CheckoutLookupCustomerApiResponse>(getCheckoutBackendUrl('context'), request)

  if (!response.ok) return null
  return response.cadastro ?? null
}

export async function loadMarketplaceCheckoutContext(slug?: string | null): Promise<MarketplaceCheckoutContext> {
  if (useLegacySupabase()) {
    return fetchLegacyMarketplaceCheckoutContext(slug)
  }
  return fetchAivenMarketplaceCheckoutContext(slug)
}

export async function submitMarketplaceCheckout(payload: CheckoutSubmitRequest) {
  return postJson<CheckoutSubmitResponse>(getCheckoutBackendUrl('submit'), payload)
}

export async function lookupExistingCheckoutCustomer(documento: string): Promise<CheckoutExistingCustomerLookup | null> {
  if (useLegacySupabase()) {
    return fetchLegacyExistingCustomer(documento)
  }
  return fetchAivenExistingCustomer(documento)
}

function formatCpfCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2')
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function maskEmail(email: string | null | undefined) {
  const value = String(email ?? '').trim()
  if (!value || !value.includes('@')) return null
  const [local, domain] = value.split('@')
  if (!local || !domain) return null
  const visibleLocal = local.slice(0, Math.min(2, local.length))
  return `${visibleLocal}${local.length > 2 ? '***' : '*'}@${domain}`
}
