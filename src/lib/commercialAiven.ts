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

export async function fetchAivenCommercialSales(limit = 50) {
  const response = await postJson<ApiResponse<'vendas', AivenVendaRow[]>>(getApiUrl('/comercial/vendas'), { limit })
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

export async function updateAivenCommercialSaleStatus(id: string, status: string) {
  const response = await postJson<ApiResponse<'venda', { id: string; status_venda: string }>>(getApiUrl('/comercial/vendas/status'), { id, status })
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
