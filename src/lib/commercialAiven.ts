import { getApiUrl, postJson } from '@/lib/api'
import type { AgendamentoValidacao, CadastroBase, PontoAtendimento, Profile, VendaCertificado } from '@/types'

export type AivenVendaRow = VendaCertificado & {
  cadastros_base: { nome?: string | null; cpf_cnpj?: string | null } | null
  pontos_atendimento: { nome?: string | null } | null
}

export type AivenAgendaRow = Pick<AgendamentoValidacao,
  'id' | 'created_at' | 'data_agendada' | 'status_agendamento' | 'observacoes' | 'tipo_atendimento' |
  'venda_certificado_id' | 'ponto_atendimento_id' | 'agente_registro_id'
> & {
  vendas_certificados?: Array<{ protocolo_numero?: string | null; tipo_produto?: string | null; telefone_faturamento?: string | null; nome_faturamento?: string | null }> | null
  cadastros_base?: Array<{ nome?: string | null }> | null
  pontos_atendimento?: Array<{ nome?: string | null }> | null
}

type ApiResponse<Key extends string, Value> = {
  ok: boolean
} & Record<Key, Value>

export async function fetchAivenCommercialSales(limit = 50, filters?: { dateFrom?: string | null; dateTo?: string | null }) {
  const response = await postJson<ApiResponse<'vendas', AivenVendaRow[]>>(getApiUrl('/comercial/vendas'), {
    limit,
    dateFrom: filters?.dateFrom ?? null,
    dateTo: filters?.dateTo ?? null,
  })
  return response.vendas ?? []
}

export async function fetchAivenCommercialSchedule(input: { dataBase?: string | null; status?: string | null; agenteId?: string | null }) {
  const response = await postJson<ApiResponse<'agenda', AivenAgendaRow[]>>(getApiUrl('/comercial/agenda'), input)
  return response.agenda ?? []
}

export async function fetchAivenCommercialCustomers() {
  const response = await postJson<ApiResponse<'clientes', CadastroBase[]>>(getApiUrl('/comercial/clientes'), {})
  return response.clientes ?? []
}

export async function searchAivenCommercialCustomers(term: string) {
  const response = await postJson<ApiResponse<'clientes', CadastroBase[]>>(getApiUrl('/comercial/clientes/buscar'), { term })
  return response.clientes ?? []
}

export async function fetchAivenCommercialPoints() {
  const response = await postJson<ApiResponse<'pontos', PontoAtendimento[]>>(getApiUrl('/comercial/pontos'), {})
  return response.pontos ?? []
}

export async function fetchAivenCommercialAgents() {
  const response = await postJson<ApiResponse<'agentes', Pick<Profile, 'id' | 'nome' | 'perfil' | 'status'>[]>>(getApiUrl('/comercial/agentes'), {})
  return response.agentes ?? []
}

export async function fetchAivenCommercialSaleProfiles() {
  const response = await fetch(getApiUrl('/comercial/relatorios/comissoes/perfis'))
  const data = await response.json() as ApiResponse<'perfis', Pick<Profile, 'id' | 'nome'>[]>
  return data.perfis ?? []
}

export async function updateAivenCommercialSaleStatus(id: string, status: string) {
  const response = await postJson<ApiResponse<'venda', { id: string; status_venda: string }>>(getApiUrl('/comercial/vendas/status'), { id, status })
  return response.venda ?? null
}

export async function updateAivenCommercialSalePaymentStatus(id: string, status: 'em_aberto' | 'pago' | 'recusado' | 'estornado' | 'cortesia') {
  const response = await postJson<ApiResponse<'venda', { id: string; status_pagamento: string }>>(getApiUrl('/comercial/vendas/pagamento'), { id, status })
  return response.venda ?? null
}

export async function saveAivenCommercialAgenda(payload: {
  agendaId?: string | null
  vendaId?: string | null
  cliente?: string
  telefone?: string | null
  servico?: string | null
  data_hora: string
  status: string
  observacoes?: string | null
  ponto_atendimento_id?: string | null
  agente_registro_id?: string | null
  tipo_atendimento?: string | null
}) {
  const response = await postJson<ApiResponse<'agenda', { id: string }>>(getApiUrl('/comercial/agenda/save'), payload)
  return response.agenda ?? null
}


export async function saveAivenCommercialSale(payload: Record<string, unknown>) {
  const response = await postJson<ApiResponse<'venda', VendaCertificado>>(getApiUrl('/comercial/vendas/criar'), payload)
  return response.venda ?? null
}

export async function getAivenCommercialSaleById(id: string) {
  const response = await postJson<ApiResponse<'venda', VendaCertificado & { cadastros_base: null; pontos_atendimento: null }>>(getApiUrl('/comercial/vendas/get'), { id })
  return response.venda ?? null
}

export async function getAivenCommercialScheduleByVenda(vendaId: string) {
  const response = await postJson<ApiResponse<'agenda', AivenAgendaRow | null>>(getApiUrl('/comercial/agenda/venda'), { vendaId })
  return response.agenda ?? null
}

export async function saveAivenCommercialAgendaPendente(payload: Record<string, unknown>) {
  const response = await postJson<ApiResponse<'agenda', {
    id: string
    agente_registro_id?: string | null
    ponto_atendimento_id?: string | null
    data_agendada?: string | null
    tipo_atendimento?: string | null
    observacoes?: string | null
  }>>(getApiUrl('/comercial/agenda/pendente'), payload)
  return response.agenda ?? null
}

export async function getAivenCommercialClientesByDocs(docs: string[]) {
  const response = await postJson<ApiResponse<'clientes', { id: string; cpf_cnpj: string }[]>>(getApiUrl('/comercial/clientes/ids'), { docs })
  return response.clientes ?? []
}

export async function getAivenCommercialSafewebVendas() {
  const response = await postJson<ApiResponse<'vendas', (VendaCertificado & { cadastros_base: { nome: string | null; cpf_cnpj: string | null } | null })[]>>(getApiUrl('/comercial/vendas/safeweb'), {})
  return response.vendas ?? []
}

export async function getAivenTitularByCpf(cpf: string) {
  const response = await postJson<ApiResponse<'titular', Record<string, unknown> | null>>(getApiUrl('/titulares/por-cpf'), { cpf })
  return response.titular ?? null
}

export type CancelamentoVendaInput = {
  venda_id: string
  motivo: string
  dentro_prazo_30d: boolean
  custo_operacional?: number
  observacoes?: string
  cancelado_por: string
}

export type CancelamentoVendaRow = {
  id: string
  venda_id: string
  motivo: string
  dentro_prazo_30d: boolean
  valor_reembolsado: number | null
  custo_operacional: number
  comissao_vendedor_revertida: number
  comissao_agente_revertida: number
  estorno_gateway_ref: string | null
  estorno_realizado: boolean
  observacoes: string | null
  cancelado_por: string | null
  created_at: string
}

export type UpdateVendaInput = {
  id: string
  tipo_produto?: string
  tipo_venda?: string
  tipo_emissao?: string
  tabela_preco_id?: string
  tabela_preco_item_id?: string
  forma_pagamento_id?: string
  valor_venda?: number
  desconto?: number
  observacoes?: string
  data_vencimento?: string
  vendedor_id?: string | null
  contador_id?: string | null
}

export async function updateVendaPaymentMethod(input: {
  id: string
  forma_pagamento_id: string
  admin_profile_id: string
  payment_installments?: number | null
}) {
  const response = await fetch(getApiUrl('/comercial/vendas/forma-pagamento'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await response.json() as ApiResponse<'venda', Record<string, unknown>> & {
    error?: string
    charge?: {
      ok?: boolean
      chargeUrl?: string | null
      error?: string | null
      details?: {
        kind?: string | null
        ticket_url?: string | null
        qr_code_base64?: string | null
        qr_code?: string | null
        digitable_line?: string | null
      } | null
    } | null
  }
  if (!response.ok || !data.ok) throw new Error(data.error ?? 'Não foi possível alterar a forma de pagamento.')
  return { venda: data.venda ?? null, charge: data.charge ?? null }
}

export async function updateVenda(input: UpdateVendaInput) {
  const response = await fetch(getApiUrl(`/comercial/vendas/${input.id}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const data = await response.json() as ApiResponse<'venda', Record<string, unknown>>
  return data.venda ?? null
}

export async function cancelarVenda(payload: CancelamentoVendaInput) {
  const response = await postJson<ApiResponse<'cancelamento', CancelamentoVendaRow>>(getApiUrl('/cancelamentos'), payload)
  return response.cancelamento ?? null
}

export async function saveAivenCommercialCustomer(payload: {
  id?: string | null
  tipo_cliente?: string | null
  tipo_cadastro?: string | null
  cpf_cnpj: string
  nome: string
  nome_fantasia?: string | null
  email?: string | null
  telefone?: string | null
  cidade?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  uf?: string | null
  cep?: string | null
  inscricao_municipal?: string | null
  inscricao_estadual?: string | null
  iss_retido?: boolean | null
  status?: string | null
  metadata?: Record<string, unknown> | null
}) {
  const response = await postJson<ApiResponse<'cliente', { id: string }>>(getApiUrl('/comercial/clientes/save'), payload)
  return response.cliente ?? null
}
