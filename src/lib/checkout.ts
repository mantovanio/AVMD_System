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
import { normalizeText } from '@/lib/utils'

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

export type ProductProfile = {
  kind: string
  certificateClass: string
  validity: string
  displayName: string
  details: string
  commercialDescription: string
}

function dedupeParts(parts: Array<string | null | undefined>) {
  const normalized = parts.map(part => (part ?? '').trim()).filter(Boolean)
  return normalized.filter((part, index) => normalized.findIndex(other => other.toLowerCase() === part.toLowerCase()) === index)
}

function getProductKindFromText(raw: string) {
  if (raw.includes('combo')) return 'Combo'
  if (/safeid|nuvem|cloud/.test(raw)) return 'SafeID'
  if (/token|cartao|cartão|leitora|validacao domiciliar/.test(raw) && !/e-cpf|e-pf|e-cnpj|e-pj|safeid|nuvem|cloud/.test(raw)) return 'Mídias e serviços'
  if (/\bnf-e\b|\bnfe\b|nota fiscal|e-pj/.test(raw)) return 'e-PJ'
  if (/e-cnpj|\bmei\b/.test(raw)) return 'e-CNPJ'
  if (/e-medico|emedico|medico|e-juridico|ejuridico|e-engenheiro|eengenheiro|engenheiro|e-saude|esaude|saude|e-arquiteto|earquiteto|arquiteto|e-cpf|e-pf/.test(raw)) return 'e-CPF'
  return 'Outros'
}

function formatValidityFromText(raw: string) {
  const totalMonths = raw.match(/validade(?: total)?(?: de)? (\d+) meses?/)?.[1]
  if (totalMonths) return `${Number(totalMonths)} meses`
  if (/validade (?:de )?2 anos|validade 2 anos/.test(raw)) return '24 meses'
  if (/4 meses|degustacao/.test(raw)) return '4 meses'
  if (/12 meses|1 ano/.test(raw)) return '12 meses'
  return 'Não informada'
}

function normalizeValidityToMonthsLabel(value: string) {
  const raw = value.trim()
  if (!raw) return ''
  const normalized = normalizeText(raw)
  const numeric = normalized.match(/^(\d+)$/)?.[1]
  if (numeric) return `${Number(numeric)} meses`
  const months = normalized.match(/(\d+)\s*m(?:es|eses)?/)?.[1]
  if (months) return `${Number(months)} meses`
  const years = normalized.match(/(\d+)\s*ano/)?.[1]
  if (years) return `${Number(years) * 12} meses`
  return raw
}

function formatValidityLabel(validity: string) {
  const value = validity.trim()
  if (!value || value === 'Não informada') return 'prazo não informado'
  return value.toLowerCase()
}

function sanitizeProductComplement(value: string) {
  return value
    .replace(/^certificado(?:\s+digital)?\s+[^-–—,.;:]+(?:[-–—]\s*)?/i, ' ')
    .replace(/\([^)]*(?:valida[cç][aã]o|videoconfer|presencial|fast|renova)[^)]*\)/gi, ' ')
    .replace(/\bnecess[aá]ri[ao]s?\s+valida[cç][aã]o\b.*$/gi, ' ')
    .replace(/\bvalida[cç][aã]o\s+(?:por\s+)?(?:videoconfer[eê]ncia|presencial|fast|online|on-line)\b/gi, ' ')
    .replace(/\bvalidade(?:\s+total)?(?:\s+de)?\s+\d+\s*(?:m[eê]s|meses|anos?|ano)\b/gi, ' ')
    .replace(/\bper[ií]odo\s+de\s+uso(?:\s+de)?\s+\d+\s*(?:m[eê]s|meses|anos?|ano)\b/gi, ' ')
    .replace(/\b(?:a1|a3)\b/gi, ' ')
    .replace(/\s*[-–—]\s*$/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function normalizeProductName(name: string, certificateClass: string) {
  const cleaned = name
    .replace(/^certificado(?:\s+digital)?\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-–—]\s*/g, ' - ')
    .trim()
  if (!certificateClass || certificateClass === 'Não informado') return cleaned
  const classPattern = new RegExp(`\\s*[-–—]?\\s*\\b${certificateClass}\\b`, 'i')
  return classPattern.test(cleaned)
    ? cleaned.replace(classPattern, ` ${certificateClass}`).replace(/\s{2,}/g, ' ').trim()
    : `${cleaned} ${certificateClass}`
}

function buildCommercialDescription(
  cert: Pick<Certificado, 'tipo' | 'descricao' | 'descricao_produto' | 'validade' | 'periodo_uso'>,
  validity: string,
  certificateClass: string,
  isSafeIdLike: boolean,
) {
  const rawName = cert.tipo?.trim() || 'Certificado digital'
  const productName = normalizeProductName(rawName, certificateClass)
  const validityLabel = formatValidityLabel(validity)
  const complement = sanitizeProductComplement(cert.descricao_produto?.trim() || cert.descricao?.trim() || '')

  if (isSafeIdLike) {
    const usage = normalizeValidityToMonthsLabel(cert.periodo_uso?.trim() || validity)
    const totalValidity = normalizeValidityToMonthsLabel(cert.validade?.trim() || validity)
    return `Certificado Digital (Nuvem) ${productName} - período de uso ${formatValidityLabel(usage)} e validade total de ${formatValidityLabel(totalValidity)}.`
  }

  const validityPart = validityLabel !== 'prazo não informado' ? ` - Validade ${validityLabel}` : ''
  const complementPart = complement ? `, ${complement.replace(/\.$/, '')}` : ''
  return `Certificado Digital ${productName}${validityPart}${complementPart}.`
}

export function getProductProfile(cert: Pick<Certificado, 'tipo' | 'descricao' | 'validade' | 'modelo' | 'categoria' | 'tipo_emissao_padrao' | 'periodo_uso' | 'descricao_produto'> | null | undefined): ProductProfile {
  if (!cert) {
    return {
      kind: 'Outros',
      certificateClass: 'Não informado',
      validity: 'Não informada',
      displayName: 'Produto',
      details: '—',
      commercialDescription: 'Produto digital para validação segura da compra.',
    }
  }
  const kindText = normalizeText([cert.tipo, cert.descricao_produto, cert.descricao, cert.modelo, cert.categoria].filter(Boolean).join(' '))
  const kind = getProductKindFromText(kindText)

  const modelText = normalizeText(cert.modelo ?? '')
  const classText = normalizeText([cert.tipo, cert.modelo, cert.categoria].filter(Boolean).join(' '))
  const isSafeIdLike = /safeid|nuvem|cloud/.test(classText)
  const certificateClass = /\ba3\b/.test(modelText) || (!/\ba1\b/.test(modelText) && /\ba3\b/.test(classText)) || isSafeIdLike
    ? 'A3'
    : (/\ba1\b/.test(modelText) || /\ba1\b/.test(classText) ? 'A1' : 'Não informado')

  const validitySource = isSafeIdLike
    ? (cert.periodo_uso?.trim() || cert.validade?.trim() || '')
    : (cert.validade?.trim() || '')
  const validity = validitySource
    ? normalizeValidityToMonthsLabel(validitySource)
    : formatValidityFromText(normalizeText([cert.tipo, cert.descricao_produto, cert.descricao].filter(Boolean).join(' ')))

  const displayName = cert.tipo?.trim() || 'Produto'

  const details = isSafeIdLike
    ? dedupeParts([
        cert.periodo_uso?.trim() ? `Uso: ${normalizeValidityToMonthsLabel(cert.periodo_uso.trim())}` : null,
        validity && validity !== 'Não informada' ? `Validade total: ${validity}` : null,
      ]).join(' · ') || '—'
    : (validity && validity !== 'Não informada' ? `Validade: ${validity}` : '—')

  const commercialDescription = buildCommercialDescription(cert, validity, certificateClass, isSafeIdLike)

  return { kind, certificateClass, validity, displayName, details, commercialDescription }
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
