import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import * as XLSX from 'xlsx'
import { cn } from '@/lib/utils'
import { generateAgendaSlotsPreview, resolveAgentesElegiveisPorTabela } from '@/lib/agenda'
import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  CreditCard,
  Download,
  Eye,
  Edit3,
  ExternalLink,
  FileText,
  List,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  PlusCircle,
  Receipt,
  RefreshCcw,
  Search,
  ShoppingBag,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  TrendingUp,
  Unlock,
  Upload,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react'
import NfseDocumentPreview from '@/components/NfseDocumentPreview'
import ModulePageShell from '@/components/ModulePageShell'
import { DEFAULT_AGENCY_CONFIG, fetchAgencyConfig, type AgencyConfig } from '@/lib/agencyConfig'
import {
  buildNfseDiscriminacaoFromVenda,
  DEFAULT_NFSE_AUTOMATION_SETTINGS,
  isNfseEmissionAllowed,
  normalizeNfseAutomationSettings,
  type NfseAutomationSettings,
} from '@/lib/nfse'
import { getEdgeFunctionUrl, getSupabaseAccessToken } from '@/lib/supabase'
import { getApiUrl } from '@/lib/api'
import { fetchAivenCommercialAgents, fetchAivenCommercialCustomers, fetchAivenCommercialPoints, fetchAivenCommercialSales, fetchAivenCommercialSchedule, searchAivenCommercialCustomers, saveAivenCommercialAgenda, saveAivenCommercialCustomer, saveAivenCommercialSale, getAivenCommercialSaleById, getAivenCommercialScheduleByVenda, saveAivenCommercialAgendaPendente, getAivenCommercialClientesByDocs, getAivenCommercialSafewebVendas, getAivenTitularByCpf, updateAivenCommercialSaleStatus } from '@/lib/commercialAiven'
import { queueEmailMessage, queueWhatsAppMessage, renderTemplate } from '@/lib/communication'
import { useAuth } from '@/contexts/AuthContext'
import { hasPerfil, isAdminProfile } from '@/lib/security'
import { buscarCep } from '@/lib/cep'
import type {
  Agendamento,
  AgenteTabelaPreco,
  AgenteDisponibilidade,
  AgenteIndisponibilidade,
  Certificado,
  FaixaComissao,
  FormaPagamentoV2,
  DocumentoFinanceiro,
  LancamentoV2,
  NfseConfiguracao,
  NfseEmitida,
  NovaFaixaComissao,
  NovoAgendamento,
  NovoCertificado,
  StatusAgendamento,
  CadastroBase,
  NovoCadastroBase,
  PontoAtendimento,
  StatusVendaCertificado,
  StatusAgendamentoValidacao,
  VendaCertificado,
  TabelaPreco,
  NovaTabelaPreco,
  TabelaPrecoItem,
  NovaTabelaPrecoItem,
  TabelaPrecoParticipante,
  NovaTabelaPrecoParticipante,
  TipoParticipanteTabelaPreco,
  TipoParceiro,
  PerfilAcesso,
  TipoCliente,
  AgendamentoValidacao,
  ParceiroAgentePermitido,
} from '@/types'


// ── local types ────────────────────────────────────────────────
type VendaRow = VendaCertificado & {
  cadastros_base: { nome: string; cpf_cnpj: string } | null
  pontos_atendimento: { nome: string } | null
}

type NfseValidationResult =
  | { ok: true }
  | { ok: false; message: string; detail: string; nextStep: string }

type LocalFormVenda = {
  cadastro_base_id: string
  empresa_id: string | null
  tipo_venda: string             // Balcão, Ecommerce, etc.
  tabela_preco_id: string
  tabela_preco_item_id: string
  certificado_id: string
  tipo_emissao: string
  forma_pagamento: string
  valor_venda: number
  desconto: number
  voucher_codigo: string
  data_vencimento: string
  observacoes: string | null
  contador_id: string | null     // parceiro que indicou
  ponto_atendimento_id: string
}

type ProtocoloForm = {
  cpf: string
  data_nascimento: string
  possui_cnh: boolean
  nome: string
  email: string
  ddd: string
  telefone: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  ibge: string
  cei: string
  caepf: string
  nis: string
  codigo_voucher: string
}

type ParceiroSimples = {
  id: string
  cpf_cnpj: string | null
  nome: string
  nome_fantasia: string | null
  tipo_parceiro: TipoParceiro | null
  gestor_1_id: string | null
  gestor_2_id: string | null
  gestor_3_id: string | null
  gestor_4_id: string | null
  gestor_5_id: string | null
}

type PagamentoForm = {
  nome: string
  codigo: string
  gateway: string
  ativo: boolean
}

type DisponibilidadeForm = {
  agente_registro_id: string
  ponto_atendimento_id: string
  hora_inicio: string
  hora_fim: string
  intervalo_minutos: number
  capacidade_por_slot: number
  tipo_atendimento: '' | 'presencial' | 'videoconferencia' | 'auto_atendimento'
  ativo: boolean
}

type IndisponibilidadeForm = {
  agente_registro_id: string
  ponto_atendimento_id: string
  inicio_em: string
  fim_em: string
  motivo: string
  ativo: boolean
}

type AgenteTabelaForm = {
  tabela_preco_id: string
  agente_registro_id: string
  ponto_atendimento_id: string
  ativo: boolean
}

type AgendaItem = {
  id: string
  origem: 'agenda_legada' | 'validacao_v2'
  venda_certificado_id: string | null
  cliente: string
  telefone: string | null
  servico: string
  data_hora: string
  status: 'aguardando' | 'confirmado' | 'cancelado' | 'realizado'
  observacoes: string | null
  ponto_atendimento_nome: string | null
  ponto_atendimento_id: string | null
  tipo_atendimento: string | null
  protocolo_numero: string | null
  agente_registro_id: string | null
}

type AgendamentoV2Form = {
  agenda_id: string
  venda_certificado_id: string
  agente_registro_id: string
  ponto_atendimento_id: string
  data_agendada: string
  tipo_atendimento: '' | 'presencial' | 'videoconferencia' | 'auto_atendimento'
  observacoes: string
}

type AgendamentoValidacaoRow = {
  id: string
  venda_certificado_id: string
  created_at?: string | null
  data_agendada: string | null
  status_agendamento: 'pendente' | 'confirmado' | 'realizado' | 'cancelado'
  observacoes: string | null
  tipo_atendimento: string | null
  agente_registro_id?: string | null
  ponto_atendimento_id?: string | null
  vendas_certificados?: Array<{
    protocolo_numero?: string | null
    tipo_produto?: string | null
    telefone_faturamento?: string | null
    nome_faturamento?: string | null
  }> | null
  cadastros_base?: Array<{ nome?: string | null }> | null
  pontos_atendimento?: Array<{ nome?: string | null }> | null
}

type FeatureNotice = {
  title: string
  description: string
  nextStep?: string | null
} | null

type VendaFinanceiroModal = {
  venda: VendaRow
  lancamentos: LancamentoV2[]
  documentos: DocumentoFinanceiro[]
} | null

type VendaNfseModal = {
  venda: VendaRow
  notas: NfseEmitida[]
} | null

type VendaAutomationSnapshot = {
  pago: boolean
  status_venda: StatusVendaCertificado
  protocolo_numero: string | null
}

type NfseOverrideModal = {
  vendas: VendaRow[]
  justificativa: string
  motivoPadrao: string
  lote: boolean
} | null

type PaymentMethodId = 'safe2pay' | 'mercado_pago' | 'itau' | 'inter' | 'c6'
type PaymentMethodConfig = {
  id: PaymentMethodId
  label: string
  enabled: boolean
  is_default: boolean
}

type PaymentRuntimeConfig = {
  modo_teste_geral: boolean
  bloquear_integracoes_reais: boolean
  aviso_checkout: string
}

const VENDA_WA_BOLETO_TPL = [
  'Olá, {{cliente}}.',
  'Recebemos sua compra do produto {{produto}} no valor de {{valor}}.',
  'Forma de pagamento: {{forma_pagamento}}.',
  'Seu pedido está aguardando pagamento.',
  'Vencimento: {{vencimento}}.',
  '{{ambiente}}',
].join('\n')

const VENDA_EMAIL_BOLETO_SUBJECT = 'Seu pedido foi registrado e aguarda pagamento'
const VENDA_EMAIL_BOLETO_TPL = [
  'Olá, {{cliente}}.',
  '',
  'Recebemos sua compra do produto {{produto}} no valor de {{valor}}.',
  'Forma de pagamento: {{forma_pagamento}}.',
  'No momento, o pedido está aguardando pagamento.',
  'Vencimento: {{vencimento}}.',
  '',
  '{{ambiente}}',
].join('\n')

const VENDA_WA_PAGAMENTO_IMEDIATO_TPL = [
  'Olá, {{cliente}}.',
  'Recebemos sua compra do produto {{produto}} no valor de {{valor}}.',
  'Forma de pagamento: {{forma_pagamento}}.',
  'Seu pedido foi registrado e o pagamento está em processamento/confirmação.',
  '{{ambiente}}',
].join('\n')

const VENDA_EMAIL_PAGAMENTO_IMEDIATO_SUBJECT = 'Recebemos seu pedido'
const VENDA_EMAIL_PAGAMENTO_IMEDIATO_TPL = [
  'Olá, {{cliente}}.',
  '',
  'Recebemos sua compra do produto {{produto}} no valor de {{valor}}.',
  'Forma de pagamento: {{forma_pagamento}}.',
  'Seu pedido foi registrado e o pagamento está em processamento/confirmação.',
  '',
  '{{ambiente}}',
].join('\n')

type PricingMatrixRule = {
  tabela_preco_id: string
  tabela_base_id: string
  ajuste_percentual: number
}

const DEFAULT_PAYMENT_RUNTIME: PaymentRuntimeConfig = {
  modo_teste_geral: false,
  bloquear_integracoes_reais: false,
  aviso_checkout: 'Ambiente de testes ativo para homologacao comercial.',
}

// ── tab definition ─────────────────────────────────────────────
type Tab = 'vendas' | 'agenda' | 'certificados' | 'tabelas' | 'comissoes' | 'pagamento' | 'importar'

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'vendas',       label: 'Lançar Vendas',    icon: TrendingUp  },
  { id: 'agenda',       label: 'Agenda',           icon: Calendar    },
  { id: 'pagamento',    label: 'Pagamentos',       icon: CreditCard  },
  { id: 'certificados', label: 'Certificados',     icon: ShoppingBag },
  { id: 'tabelas',      label: 'Tabelas de Preço', icon: Tag         },
  { id: 'comissoes',    label: 'Comissões',        icon: TrendingUp  },
  { id: 'importar',     label: 'Importações',      icon: Upload      },
]

const FALLBACK_CERTS = ['e-CPF A1', 'e-CPF A3', 'e-CNPJ A1', 'e-CNPJ A3', 'NF-e A1', 'SSL']

const STATUS_VENDA_LABEL: Record<StatusVendaCertificado, string> = {
  rascunho:     'Não Confirmada',
  vendido:      'Vendida',
  agendado:     'Agendada',
  em_validacao: 'Em Validação',
  emitido:      'Emitida',
  cancelado:    'Cancelada',
}

const TIPO_VENDA_OPTIONS = [
  { value: 'balcao',       label: 'Balcão'       },
  { value: 'ecommerce',    label: 'E-Commerce'   },
  { value: 'prepago',      label: 'Pré-pago'     },
  { value: 'voucher',      label: 'Voucher'       },
  { value: 'link_externo', label: 'Link Externo' },
]

const TIPO_PARCEIRO_OPTS: { value: TipoParceiro; label: string }[] = [
  { value: 'ar',               label: 'AR'               },
  { value: 'pa_controle_total', label: 'PA Controle Total' },
  { value: 'pa_emissor',       label: 'PA Emissor'       },
  { value: 'contador',         label: 'Contador'         },
  { value: 'vendedor',         label: 'Vendedor'         },
  { value: 'gestor',           label: 'Gestor'           },
  { value: 'ecommerce',        label: 'E-Commerce'       },
]

const PERFIL_OPTS: { value: PerfilAcesso; label: string }[] = [
  { value: 'admin',           label: 'Admin'           },
  { value: 'vendedor',        label: 'Vendedor'        },
  { value: 'agente_registro', label: 'Agente Registro' },
  { value: 'usuario',         label: 'Usuário'         },
]

const TIPO_EMISSAO_OPTIONS = [
  { value: 'presencial',       label: 'Presencial'        },
  { value: 'videoconferencia', label: 'Videoconferência'  },
  { value: 'auto_atendimento', label: 'Auto Atendimento'  },
  { value: 'online',           label: 'Online'            },
]

const STATUS_VENDA_V2_OPTIONS: StatusVendaCertificado[] = [
  'rascunho', 'vendido', 'agendado', 'em_validacao', 'emitido', 'cancelado',
]

const EMPTY_VENDA_V2: LocalFormVenda = {
  cadastro_base_id: '',
  empresa_id: null,
  tipo_venda: '',
  tabela_preco_id: '',
  tabela_preco_item_id: '',
  certificado_id: '',
  tipo_emissao: '',
  forma_pagamento: '',
  valor_venda: 0,
  desconto: 0,
  voucher_codigo: '',
  data_vencimento: '',
  observacoes: null,
  contador_id: null,
  ponto_atendimento_id: '',
}


const EMPTY_CLIENTE_BASE: NovoCadastroBase = {
  tipo_cliente: 'pessoa_fisica',
  tipo_cadastro: 'cliente',
  cpf_cnpj: '',
  nome: '',
  nome_fantasia: null,
  email: null,
  telefone: null,
  cidade: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  uf: null,
  cep: null,
  inscricao_municipal: null,
  inscricao_estadual: null,
  iss_retido: false,
  status: 'ativo',
  metadata: {},
}

const EMPTY_AGENDA: NovoAgendamento = {
  cliente: '', telefone: null, servico: 'e-CPF A1',
  data_hora: '', status: 'aguardando', observacoes: null,
}

const EMPTY_CERTIFICADO: NovoCertificado = {
  codigo: null, status_produto: 'Ativo', tipo: '', descricao: null, validade: '12 meses', validade_meses: 12,
  modelo: null, categoria: null, tipo_emissao_padrao: null, periodo_uso: null, descricao_produto: null,
  produto_vinculado_ac: null, preco_venda: 0, valor_custo_ac: 0, valor_custo: 0,
  agrupador: null, hash: null, estoque: 0, ativo: true,
}

const EMPTY_TABELA: NovaTabelaPreco = {
  nome: '', descricao: null, codigo_voucher: null,
  max_desconto_percentual: 0, max_desconto_valor: 0,
  comissao_venda_pct: 0, comissao_gestor_pct: 0, comissao_gestor_valor: 0,
  ativo: true,
}

const EMPTY_ITEM: NovaTabelaPrecoItem = {
  tabela_preco_id: '', certificado_id: '', valor: 0, valor_custo: 0, valor_repasse: 0, link_safeweb: null, ativo: true,
}

const EMPTY_PARTICIPANTE: NovaTabelaPrecoParticipante = {
  tabela_preco_id: '', tipo_participante: 'tipo_parceiro',
  parceiro_id: null, tipo_parceiro: null, perfil: null,
}

const EMPTY_PROTOCOLO: ProtocoloForm = {
  cpf: '', data_nascimento: '', possui_cnh: true,
  nome: '', email: '', ddd: '', telefone: '',
  cep: '', logradouro: '', numero: '', complemento: '',
  bairro: '', cidade: '', uf: '', ibge: '',
  cei: '', caepf: '', nis: '', codigo_voucher: '',
}

const EMPTY_COMISSAO: NovaFaixaComissao = {
  faixa: '', min_emissoes: 1, max_emissoes: null,
  percentual: 0, valor_exemplo: null, ordem: 1, ativo: true,
}

const EMPTY_PAGAMENTO: PagamentoForm = { nome: '', codigo: '', gateway: '', ativo: true }
const EMPTY_DISPONIBILIDADE: DisponibilidadeForm = {
  agente_registro_id: '',
  ponto_atendimento_id: '',
  hora_inicio: '09:00',
  hora_fim: '18:00',
  intervalo_minutos: 30,
  capacidade_por_slot: 1,
  tipo_atendimento: 'presencial',
  ativo: true,
}
const EMPTY_INDISPONIBILIDADE: IndisponibilidadeForm = {
  agente_registro_id: '',
  ponto_atendimento_id: '',
  inicio_em: '',
  fim_em: '',
  motivo: '',
  ativo: true,
}
const EMPTY_AGENTE_TABELA: AgenteTabelaForm = {
  tabela_preco_id: '',
  agente_registro_id: '',
  ponto_atendimento_id: '',
  ativo: true,
}
type VendaFilters = {
  filtroData:   string
  dataInicial:  string
  dataFinal:    string
  pedido:       string
  protocolo:    string
  cliente:      string
  status:       string
  pa:           string
}

type CertFilters = {
  busca:  string
  status: string
  categoria: string
}

const EMPTY_CERT_FILTERS: CertFilters = {
  busca: '',
  status: '',
  categoria: '',
}

const EMPTY_VENDA_FILTERS: VendaFilters = {
  filtroData:   'geral',
  dataInicial:  '',
  dataFinal:    '',
  pedido:       '',
  protocolo:    '',
  cliente:      '',
  status:       '',
  pa:           '',
}

const DIAS_SEMANA_OPTIONS = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sáb' },
] as const

export default function Comercial() {
  const { profile } = useAuth()
  const isAdmin = isAdminProfile(profile)
  const canManageAgenda = hasPerfil(profile, 'admin', 'agente_registro')
  const [tab, setTab] = useState<Tab>('vendas')

  // ── V2 vendas state ──────────────────────────────────────────
  const [vendasV2, setVendasV2]         = useState<VendaRow[]>([])
  const [clientes, setClientes]         = useState<CadastroBase[]>([])
  const [pontos, setPontos]             = useState<PontoAtendimento[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loadingV, setLoadingV]         = useState(true)
  const [vendedorNomes, setVendedorNomes] = useState<Map<string, string>>(new Map())
  const [showFormV, setShowFormV]       = useState(false)
  const [formV2, setFormV2]             = useState<LocalFormVenda>(EMPTY_VENDA_V2)
  const [contadorSearch, setContadorSearch] = useState('')
  const [contadorDropdownOpen, setContadorDropdownOpen] = useState(false)
  const [contadorStepHandled, setContadorStepHandled] = useState(false)
  const [showClienteForm, setShowClienteForm] = useState(false)
  const [editingClienteId, setEditingClienteId] = useState<string | null>(null)
  const [clienteSearch, setClienteSearch]     = useState('')
  const [clienteResultados, setClienteResultados] = useState<CadastroBase[]>([])
  const [clienteBuscando, setClienteBuscando]     = useState(false)
  const [clienteDropdownOpen, setClienteDropdownOpen] = useState(false)
  const [clienteSelecionadoObj, setClienteSelecionadoObj] = useState<CadastroBase | null>(null)
  const [formCliente, setFormCliente]   = useState<NovoCadastroBase>(EMPTY_CLIENTE_BASE)
  const [salvandoV, setSalvandoV]       = useState(false)
  const [salvandoCliente, setSalvandoCliente] = useState(false)
  const [vendaFilters, setVendaFilters] = useState<VendaFilters>(EMPTY_VENDA_FILTERS)
  const [showVendaFiltrosExtras, setShowVendaFiltrosExtras] = useState(false)
  const [showVendaAcoesExtras, setShowVendaAcoesExtras] = useState(false)
  const [selectedIds, setSelectedIds]           = useState<Set<string>>(new Set())
  const [nfseAutomationSettings, setNfseAutomationSettings] = useState<NfseAutomationSettings>(DEFAULT_NFSE_AUTOMATION_SETTINGS)
  const vendaAutomationSnapshotRef = useRef<Map<string, VendaAutomationSnapshot>>(new Map())
  const agendaAutomationSnapshotRef = useRef<Record<string, StatusAgendamentoValidacao | null>>({})
  const nfseAutoProcessingRef = useRef<Set<string>>(new Set())
  const [agendamentoStatusPorVenda, setAgendamentoStatusPorVenda] = useState<Record<string, StatusAgendamentoValidacao | null>>({})
  const [emitindoNfseLote, setEmitindoNfseLote] = useState(false)
  const [itensPorPagina, setItensPorPagina]     = useState(50)
  const [paginaAtual, setPaginaAtual]           = useState(1)

  // ── agenda state ─────────────────────────────────────────────
  const [agenda, setAgenda]             = useState<AgendaItem[]>([])
  const [loadingA, setLoadingA]         = useState(true)
  const [showFormA, setShowFormA]       = useState(false)
  const [formA, setFormA]               = useState<NovoAgendamento>(EMPTY_AGENDA)
  const [salvandoA, setSalvandoA]       = useState(false)
  const [showAgendaV2Panel, setShowAgendaV2Panel] = useState(false)
  const [formAgendaV2, setFormAgendaV2] = useState<AgendamentoV2Form | null>(null)
  const [salvandoAgendaV2, setSalvandoAgendaV2] = useState(false)
  const [agentesRegistro, setAgentesRegistro] = useState<Array<{ id: string; nome: string }>>([])
  const [disponibilidades, setDisponibilidades] = useState<AgenteDisponibilidade[]>([])
  const [indisponibilidades, setIndisponibilidades] = useState<AgenteIndisponibilidade[]>([])
  const [showFormDisp, setShowFormDisp] = useState(false)
  const [formDisp, setFormDisp] = useState<DisponibilidadeForm>(EMPTY_DISPONIBILIDADE)
  const [diasSelecionadosDisp, setDiasSelecionadosDisp] = useState<number[]>([1])
  const [filtroDataAgenda, setFiltroDataAgenda] = useState(() => new Date().toISOString().split('T')[0])
  const [filtroStatusAgenda, setFiltroStatusAgenda] = useState('')
  const [erroAgendaV2, setErroAgendaV2] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [showFormIndisp, setShowFormIndisp] = useState(false)
  const [formIndisp, setFormIndisp] = useState<IndisponibilidadeForm>(EMPTY_INDISPONIBILIDADE)
  const [salvandoDisp, setSalvandoDisp] = useState(false)
  const [salvandoIndisp, setSalvandoIndisp] = useState(false)

  // ── catalog state ────────────────────────────────────────────
  const [certificados, setCertificados]       = useState<Certificado[]>([])
  const [tabelasPreco, setTabelasPreco]       = useState<TabelaPreco[]>([])
  const [tabelaItens, setTabelaItens]         = useState<TabelaPrecoItem[]>([])
  const [tabelaParticipantes, setTabelaParticipantes] = useState<TabelaPrecoParticipante[]>([])
  const [agentesTabelaPreco, setAgentesTabelaPreco] = useState<AgenteTabelaPreco[]>([])
  const [parceirosAgentesPermitidos, setParceirosAgentesPermitidos] = useState<ParceiroAgentePermitido[]>([])
  const [parceiros, setParceiros]             = useState<ParceiroSimples[]>([])
  const [comissoes, setComissoes]             = useState<FaixaComissao[]>([])
  const [pagamentos, setPagamentos]           = useState<FormaPagamentoV2[]>([])
  const [paymentMethods, setPaymentMethods]   = useState<PaymentMethodConfig[]>([])
  const [paymentRuntime, setPaymentRuntime]   = useState<PaymentRuntimeConfig>(DEFAULT_PAYMENT_RUNTIME)
  const [pricingMatrixRules, setPricingMatrixRules] = useState<PricingMatrixRule[]>([])
  const [loadingCatalogo, setLoadingCatalogo] = useState(true)
  const [catalogoErro, setCatalogoErro]       = useState<string | null>(null)
  const [agendaSchemaWarning, setAgendaSchemaWarning] = useState<string | null>(null)
  const [salvandoCatalogo, setSalvandoCatalogo] = useState(false)
  // certificados form
  const [showFormCert, setShowFormCert]         = useState(false)
  const [editingCertId, setEditingCertId]       = useState<string | null>(null)
  const [formCert, setFormCert]                 = useState<NovoCertificado>(EMPTY_CERTIFICADO)
  const [importando, setImportando]             = useState(false)
  const [certFilters, setCertFilters]           = useState<CertFilters>(EMPTY_CERT_FILTERS)
  const [selectedCertIds, setSelectedCertIds]   = useState<Set<string>>(new Set())
  const [selectedItemIds, setSelectedItemIds]   = useState<Set<string>>(new Set())
  const clienteSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const importInputRef                          = useRef<HTMLInputElement>(null)
  const importItensRef                          = useRef<HTMLInputElement>(null)
  const importSafewebRef                        = useRef<HTMLInputElement>(null)
  const importClientesRef                       = useRef<HTMLInputElement>(null)
  const tabelaProdutosSectionRef                = useRef<HTMLDivElement | null>(null)
  const tabelaAgentesSectionRef                 = useRef<HTMLDivElement | null>(null)
  const [importandoSafeweb, setImportandoSafeweb] = useState(false)
  const [importandoClientes, setImportandoClientes] = useState(false)
  const [resultSafeweb, setResultSafeweb] = useState<{ clientes: number; novos: number; atualizados: number; divergentes: number } | null>(null)
  const [resultClientes, setResultClientes] = useState<{ inseridos: number; atualizados: number } | null>(null)
  const [safewebVendas, setSafewebVendas] = useState<VendaRow[]>([])
  const [loadingSafewebVendas, setLoadingSafewebVendas] = useState(false)
  const [safewebViewerOpen, setSafewebViewerOpen] = useState(false)
  // tabelas form
  const [selectedTabelaId, setSelectedTabelaId]   = useState<string | null>(null)
  const [showFormTabela, setShowFormTabela]         = useState(false)
  const [editingTabelaId, setEditingTabelaId]       = useState<string | null>(null)
  const [formTabela, setFormTabela]                 = useState<NovaTabelaPreco>(EMPTY_TABELA)
  const [showFormItem, setShowFormItem]             = useState(false)
  const [editingItemId, setEditingItemId]           = useState<string | null>(null)
  const [formItem, setFormItem]                     = useState<NovaTabelaPrecoItem>(EMPTY_ITEM)
  const [showFormParticipante, setShowFormParticipante] = useState(false)
  const [formParticipante, setFormParticipante]         = useState<NovaTabelaPrecoParticipante>(EMPTY_PARTICIPANTE)
  const [showFormAgenteTabela, setShowFormAgenteTabela] = useState(false)
  const [formAgenteTabela, setFormAgenteTabela]         = useState<AgenteTabelaForm>(EMPTY_AGENTE_TABELA)
  const [slotPreviewParceiroId, setSlotPreviewParceiroId] = useState<string>('')
  const [pricingMatrixForm, setPricingMatrixForm] = useState<{ tabela_base_id: string; ajuste_percentual: number }>({
    tabela_base_id: '',
    ajuste_percentual: 0,
  })
  // comissoes / pagamentos form
  const [showFormComissao, setShowFormComissao]   = useState(false)
  const [editingComissaoId, setEditingComissaoId] = useState<string | null>(null)
  const [formComissao, setFormComissao]           = useState<NovaFaixaComissao>(EMPTY_COMISSAO)
  const [showFormPagamento, setShowFormPagamento]   = useState(false)
  const [editingPagamentoId, setEditingPagamentoId] = useState<string | null>(null)
  const [formPagamento, setFormPagamento]           = useState<PagamentoForm>(EMPTY_PAGAMENTO)
  const [selectedBaseCertIds, setSelectedBaseCertIds] = useState<Set<string>>(new Set())
  const [showCatalogoBasePopup, setShowCatalogoBasePopup] = useState(false)
  const [tabelaCertBusca, setTabelaCertBusca] = useState('')
  const [tabelaCertCategoria, setTabelaCertCategoria] = useState('')
  const [featureNotice, setFeatureNotice]           = useState<FeatureNotice>(null)
  const [loadingVendaFinanceiro, setLoadingVendaFinanceiro] = useState(false)
  const [vendaFinanceiroModal, setVendaFinanceiroModal]     = useState<VendaFinanceiroModal>(null)
  const [loadingVendaNfse, setLoadingVendaNfse]             = useState(false)
  const [vendaNfseModal, setVendaNfseModal]                 = useState<VendaNfseModal>(null)
  const [showVendaNfsePreviewTelaCheia, setShowVendaNfsePreviewTelaCheia] = useState(false)
  const [agencyConfig, setAgencyConfig] = useState<AgencyConfig>(DEFAULT_AGENCY_CONFIG)
  const [nfseConfiguracaoAtiva, setNfseConfiguracaoAtiva] = useState<NfseConfiguracao | null>(null)
  const [nfseOverrideModal, setNfseOverrideModal] = useState<NfseOverrideModal>(null)
  // protocolo modal
  const [showProtocolo, setShowProtocolo]         = useState(false)
  const [protocoloVenda, setProtocoloVenda]       = useState<VendaRow | null>(null)
  const [protocoloStep, setProtocoloStep]         = useState<'validate' | 'form'>('validate')
  const [formProtocolo, setFormProtocolo]         = useState<ProtocoloForm>(EMPTY_PROTOCOLO)
  const [validandoProtocolo, setValidandoProtocolo] = useState(false)
  const [emitindoProtocolo, setEmitindoProtocolo]   = useState(false)

  // ── derived ──────────────────────────────────────────────────
  const certificadosAtivos = useMemo(() => certificados.filter(c => c.ativo), [certificados])
  const pagamentosAtivos   = useMemo(() => pagamentos.filter(p => p.ativo), [pagamentos])
  const formasPagamento    = useMemo(() => {
    const catalogo = pagamentosAtivos.map(p => p.nome)
    const meiosHabilitados = paymentMethods.filter(p => p.enabled).map(p => p.label)
    const fallback = ['PIX', 'Cartão de Crédito', 'Dinheiro', 'Boleto']
    return Array.from(new Set((catalogo.length || meiosHabilitados.length) ? [...catalogo, ...meiosHabilitados] : fallback))
  }, [pagamentosAtivos, paymentMethods])
  const certificadoById    = useMemo(() => new Map(certificados.map(c => [c.id, c])), [certificados])
  const tabelasAtivas      = useMemo(() => tabelasPreco.filter(t => t.ativo), [tabelasPreco])

  const pontosAtivos       = useMemo(() => pontos.filter(p => p.status === 'ativo'), [pontos])
  const tabelaById         = useMemo(() => new Map(tabelasPreco.map(t => [t.id, t])), [tabelasPreco])

  const preflightProblemas = useMemo(() => {
    if (!showFormV) return []
    const p: Array<{ titulo: string; descricao: string; onde: string }> = []
    if (pontosAtivos.length === 0) {
      p.push({
        titulo: 'Nenhum ponto de atendimento ativo',
        descricao: 'O sistema exige ao menos um ponto de atendimento cadastrado e ativo para registrar vendas.',
        onde: 'Comercial → aba Agentes → Pontos de Atendimento → Novo ponto',
      })
    }
    const tabelasComItens = tabelasAtivas.filter(t =>
      tabelaItens.some(i => i.tabela_preco_id === t.id && i.ativo)
    )
    if (tabelasAtivas.length === 0) {
      p.push({
        titulo: 'Nenhuma tabela de preço ativa',
        descricao: 'É necessário ter ao menos uma tabela de preço ativa com produtos configurados.',
        onde: 'Comercial → aba Tabelas → Nova tabela',
      })
    } else if (tabelasComItens.length === 0) {
      p.push({
        titulo: 'Tabelas sem produtos configurados',
        descricao: 'As tabelas existem, mas nenhuma tem itens ativos. A venda não conseguirá listar produtos.',
        onde: 'Comercial → aba Tabelas → selecione a tabela → adicionar itens',
      })
    }
    if (profile?.perfil === 'agente_registro' && currentUserId) {
      const tabelasDoAgente = agentesTabelaPreco.filter(a => a.agente_registro_id === currentUserId && a.ativo)
      if (tabelasDoAgente.length === 0) {
        p.push({
          titulo: 'Seu usuário não está vinculado a nenhuma tabela de preço',
          descricao: 'Agentes de registro precisam ter ao menos uma tabela liberada para lançar vendas.',
          onde: 'Peça ao administrador: Comercial → aba Agentes → Tabelas por Agente → vincule seu nome',
        })
      }
    }
    return p
  }, [showFormV, pontosAtivos, tabelasAtivas, tabelaItens, profile?.perfil, currentUserId, agentesTabelaPreco])
  const vendaAgendaAtual = useMemo(
    () => formAgendaV2 ? vendasV2.find(v => v.id === formAgendaV2.venda_certificado_id) ?? null : null,
    [formAgendaV2, vendasV2]
  )
  const agentesElegiveisAgendaAtual = useMemo(() => {
    if (!vendaAgendaAtual?.tabela_preco_id) return [] as AgenteTabelaPreco[]
    return resolveAgentesElegiveisPorTabela({
      tabelaPrecoId: vendaAgendaAtual.tabela_preco_id,
      vinculados: agentesTabelaPreco.filter(item => item.ativo),
      parceiroId: vendaAgendaAtual.contador_id ?? null,
      parceirosAgentesPermitidos,
    })
  }, [vendaAgendaAtual, agentesTabelaPreco, parceirosAgentesPermitidos])
  const pontosElegiveisAgendaAtual = useMemo(() => {
    const pontoIds = new Set(
      agentesElegiveisAgendaAtual
        .filter(item => item.agente_registro_id === formAgendaV2?.agente_registro_id)
        .map(item => item.ponto_atendimento_id)
        .filter((id): id is string => !!id)
    )

    if (pontoIds.size === 0) {
      return pontosAtivos
    }

    return pontosAtivos.filter(p => pontoIds.has(p.id))
  }, [agentesElegiveisAgendaAtual, formAgendaV2?.agente_registro_id, pontosAtivos])
  const pricingRuleByTabelaId = useMemo(
    () => new Map(pricingMatrixRules.map(rule => [rule.tabela_preco_id, rule])),
    [pricingMatrixRules]
  )
  const parceiroSelecionadoVenda = useMemo(
    () => parceiros.find(parceiro => parceiro.id === formV2.contador_id) ?? null,
    [formV2.contador_id, parceiros]
  )

  const tabelasDisponiveisVenda = useMemo(() => {
    const tipoEmissaoSelecionado = normalizeTipoEmissao(formV2.tipo_emissao)
    const tabelasBase = tabelasAtivas.filter(t =>
      tabelaItens.some(item => item.tabela_preco_id === t.id && item.ativo)
    )

    const tabelasPorPonto =
      profile?.perfil === 'agente_registro' && currentUserId
        ? (() => {
            const tabelaIds = new Set(
              agentesTabelaPreco
                .filter(item =>
                  item.ativo &&
                  item.agente_registro_id === currentUserId &&
                  (!formV2.ponto_atendimento_id || item.ponto_atendimento_id === formV2.ponto_atendimento_id)
                )
                .map(item => item.tabela_preco_id)
            )
            return tabelasBase.filter(t => tabelaIds.has(t.id))
          })()
        : tabelasBase

    return tabelasPorPonto.filter(tabela => {
      const participantesTabela = tabelaParticipantes.filter(item => item.tabela_preco_id === tabela.id)
      if (parceiroSelecionadoVenda && participantesTabela.length > 0) {
        const parceiroCompativel = participantesTabela.some(item => {
          if (item.tipo_participante === 'parceiro') {
            return item.parceiro_id === parceiroSelecionadoVenda.id
          }
          if (item.tipo_participante === 'tipo_parceiro') {
            return !!parceiroSelecionadoVenda.tipo_parceiro && item.tipo_parceiro === parceiroSelecionadoVenda.tipo_parceiro
          }
          return false
        })
        if (!parceiroCompativel) return false
      }

      if (!tipoEmissaoSelecionado) return true
      return tabelaItens.some(item => {
        if (item.tabela_preco_id !== tabela.id || !item.ativo) return false
        const cert = certificadoById.get(item.certificado_id)
        if (!cert) return false
        const tipoPadrao = normalizeTipoEmissao(cert.tipo_emissao_padrao)
        return !tipoPadrao || tipoPadrao === tipoEmissaoSelecionado
      })
    })
  }, [
    agentesTabelaPreco,
    certificadoById,
    currentUserId,
    formV2.ponto_atendimento_id,
    formV2.tipo_emissao,
    parceiroSelecionadoVenda,
    tabelaParticipantes,
    profile?.perfil,
    tabelaItens,
    tabelasAtivas,
  ])

  const tabelaSelecionadaVenda = useMemo(
    () => tabelaById.get(formV2.tabela_preco_id) ?? null,
    [formV2.tabela_preco_id, tabelaById]
  )

  // itens da tabela selecionada no form de venda
  const itensTabelaTodos = useMemo(() =>
    tabelaItens.filter(i => i.tabela_preco_id === formV2.tabela_preco_id),
    [tabelaItens, formV2.tabela_preco_id]
  )
  const itensTabela = useMemo(() =>
    itensTabelaTodos.filter(i => i.ativo),
    [itensTabelaTodos]
  )

  const certsDaTabelaBruta = useMemo(() =>
    itensTabela.map(item => {
      const cert = certificadoById.get(item.certificado_id)
      return cert ? { item, cert } : null
    }).filter(Boolean) as { item: TabelaPrecoItem; cert: Certificado }[],
    [itensTabela, certificadoById]
  )
  const certsDaTabela = useMemo(() => {
    const tipoEmissaoSelecionado = normalizeTipoEmissao(formV2.tipo_emissao)
    return certsDaTabelaBruta.filter(({ cert }) => {
      const tipoPadrao = normalizeTipoEmissao(cert.tipo_emissao_padrao)
      if (!tipoEmissaoSelecionado) return true
      if (!tipoPadrao) return true
      return tipoPadrao === tipoEmissaoSelecionado
    })
  }, [certsDaTabelaBruta, formV2.tipo_emissao])
  const motivoSemCertificados = useMemo(() => {
    if (!formV2.tipo_emissao) return 'Selecione primeiro o tipo de emissão.'
    if (!formV2.ponto_atendimento_id) return 'Selecione primeiro o ponto de atendimento.'
    if (!formV2.tabela_preco_id) return 'Selecione primeiro uma tabela de venda.'
    if (itensTabelaTodos.length === 0) return 'Esta tabela ainda não possui produtos vinculados em Produtos e Preços.'
    if (itensTabela.length === 0) return 'Esta tabela possui produtos vinculados, mas todos estão inativos.'
    if (certsDaTabela.length === 0) return `Nenhum certificado desta tabela está compatível com o tipo de emissão "${capitalize(formV2.tipo_emissao)}".`
    return null
  }, [formV2.ponto_atendimento_id, formV2.tabela_preco_id, formV2.tipo_emissao, itensTabelaTodos.length, itensTabela.length, certsDaTabela.length])

  const itemTabelaSelecionado = useMemo(
    () => itensTabela.find(item => item.id === formV2.tabela_preco_item_id) ?? null,
    [formV2.tabela_preco_item_id, itensTabela]
  )
  const certificadoSelecionadoVenda = useMemo(
    () => certificadoById.get(formV2.certificado_id) ?? null,
    [certificadoById, formV2.certificado_id]
  )
  const validadeSelecionadaVenda = certificadoSelecionadoVenda?.validade?.trim() ?? ''
  const validadeSelecionadaMeses = useMemo(() => {
    if (!validadeSelecionadaVenda) return ''
    const meses = validadeEmMeses(validadeSelecionadaVenda)
    return meses ? `${meses} meses` : validadeSelecionadaVenda
  }, [validadeSelecionadaVenda])
  const valorBaseProduto = Number(itemTabelaSelecionado?.valor ?? 0)
  const descontoCalculadoVenda = useMemo(() => {
    if (!valorBaseProduto || formV2.valor_venda >= valorBaseProduto) return 0
    return Number((valorBaseProduto - formV2.valor_venda).toFixed(2))
  }, [formV2.valor_venda, valorBaseProduto])
  const descontoMaximoPermitido = useMemo(() => {
    if (!tabelaSelecionadaVenda || !valorBaseProduto) return 0
    const limites: number[] = []
    if (Number(tabelaSelecionadaVenda.max_desconto_percentual) > 0) {
      limites.push(Number((valorBaseProduto * Number(tabelaSelecionadaVenda.max_desconto_percentual) / 100).toFixed(2)))
    }
    if (Number(tabelaSelecionadaVenda.max_desconto_valor) > 0) {
      limites.push(Number(tabelaSelecionadaVenda.max_desconto_valor))
    }
    if (limites.length === 0) return 0
    return Number(Math.min(...limites).toFixed(2))
  }, [tabelaSelecionadaVenda, valorBaseProduto])
  const voucherAplicadoValido = useMemo(() => {
    if (!formV2.voucher_codigo.trim()) return true
    const codigoTabela = tabelaSelecionadaVenda?.codigo_voucher?.trim()
    if (!codigoTabela) return false
    return codigoTabela.toLowerCase() === formV2.voucher_codigo.trim().toLowerCase()
  }, [formV2.voucher_codigo, tabelaSelecionadaVenda])
  const descontoDentroDoLimite = useMemo(() => {
    if (descontoCalculadoVenda <= 0) return true
    return descontoCalculadoVenda <= descontoMaximoPermitido
  }, [descontoCalculadoVenda, descontoMaximoPermitido])
  const vendaStepStatus = useMemo(() => {
    const tipoVendaOk = !!formV2.tipo_venda
    const clienteOk = tipoVendaOk && !!formV2.cadastro_base_id
    const parceiroOk = clienteOk && (contadorStepHandled || !!formV2.contador_id)
    const emissaoOk = parceiroOk && !!formV2.tipo_emissao
    const pontoOk = emissaoOk && !!formV2.ponto_atendimento_id
    const produtoOk = pontoOk && !!formV2.tabela_preco_id && !!formV2.tabela_preco_item_id && !!formV2.certificado_id
    const pagamentoOk = produtoOk
      && !!formV2.forma_pagamento
      && !!formV2.data_vencimento
      && formV2.valor_venda > 0
      && descontoDentroDoLimite
      && voucherAplicadoValido
    return { tipoVendaOk, clienteOk, parceiroOk, emissaoOk, pontoOk, produtoOk, pagamentoOk }
  }, [
    contadorStepHandled,
    descontoDentroDoLimite,
    formV2.cadastro_base_id,
    formV2.certificado_id,
    formV2.contador_id,
    formV2.data_vencimento,
    formV2.forma_pagamento,
    formV2.ponto_atendimento_id,
    formV2.tabela_preco_id,
    formV2.tabela_preco_item_id,
    formV2.tipo_emissao,
    formV2.tipo_venda,
    formV2.valor_venda,
    voucherAplicadoValido,
  ])
  const vendaSteps = useMemo(() => {
    const steps = [
      { key: 'tipo_venda', label: '1. Tipo de venda', done: vendaStepStatus.tipoVendaOk },
      { key: 'cliente', label: '2. Cliente', done: vendaStepStatus.clienteOk },
      { key: 'parceiro', label: '3. Parceiro vendedor', done: vendaStepStatus.parceiroOk },
      { key: 'emissao', label: '4. Tipo de emissão', done: vendaStepStatus.emissaoOk },
      { key: 'ponto', label: '5. Ponto de atendimento', done: vendaStepStatus.pontoOk },
      { key: 'produto', label: '6. Tabela e produto', done: vendaStepStatus.produtoOk },
      { key: 'pagamento', label: '7. Pagamento e desconto', done: vendaStepStatus.pagamentoOk },
    ] as const
    const currentStepIndex = steps.findIndex(step => !step.done)
    return {
      steps,
      currentStepIndex: currentStepIndex === -1 ? steps.length - 1 : currentStepIndex,
    }
  }, [vendaStepStatus])
  const parceiroIdsPermitidosAgente = useMemo(() => {
    if (profile?.perfil !== 'agente_registro' || !currentUserId) return new Set<string>()
    return new Set(
      parceirosAgentesPermitidos
        .filter(item => item.ativo && item.agente_registro_id === currentUserId)
        .map(item => item.parceiro_id)
    )
  }, [currentUserId, parceirosAgentesPermitidos, profile?.perfil])

  const parceirosVinculadosAoUsuario = useMemo(() => {
    if (isAdmin) return parceiros
    if (!currentUserId) return [] as ParceiroSimples[]

    if (profile?.perfil === 'agente_registro') {
      return parceiros.filter(parceiro => parceiroIdsPermitidosAgente.has(parceiro.id))
    }

    if (profile?.perfil === 'vendedor') {
      return parceiros.filter(parceiro => (
        [
          parceiro.gestor_1_id,
          parceiro.gestor_2_id,
          parceiro.gestor_3_id,
          parceiro.gestor_4_id,
          parceiro.gestor_5_id,
        ].includes(currentUserId)
      ))
    }

    return parceiros
  }, [currentUserId, isAdmin, parceiroIdsPermitidosAgente, parceiros, profile?.perfil])

  const parceirosVinculadosTabelaSelecionada = useMemo(() => {
    if (!formV2.tabela_preco_id) return parceirosVinculadosAoUsuario

    const participantesTabela = tabelaParticipantes.filter(item => item.tabela_preco_id === formV2.tabela_preco_id)
    if (participantesTabela.length === 0) return parceirosVinculadosAoUsuario

    return parceirosVinculadosAoUsuario.filter(parceiro => participantesTabela.some(item => {
      if (item.tipo_participante === 'parceiro') {
        return item.parceiro_id === parceiro.id
      }
      if (item.tipo_participante === 'tipo_parceiro') {
        return !!parceiro.tipo_parceiro && item.tipo_parceiro === parceiro.tipo_parceiro
      }
      return false
    }))
  }, [formV2.tabela_preco_id, parceirosVinculadosAoUsuario, tabelaParticipantes])

  const parceirosParaContador = useMemo(() => {
    const origem = parceirosVinculadosTabelaSelecionada
    const q = contadorSearch.trim().toLowerCase()

    if (!q) return origem.slice(0, 20)

    return origem
      .filter(p =>
        p.nome.toLowerCase().includes(q) ||
        (p.cpf_cnpj ?? '').includes(q) ||
        (p.nome_fantasia ?? '').toLowerCase().includes(q)
      )
      .slice(0, 20)
  }, [contadorSearch, parceirosVinculadosTabelaSelecionada])

  function showMsg(msg: string, type: 'ok' | 'err' = 'err') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  function validadeEmMeses(val: string): number | null {
    const puroNumero = String(val ?? '').trim().match(/^(\d+)$/)
    if (puroNumero) return parseInt(puroNumero[1])
    const anos = val.match(/(\d+)\s*[Aa]no/)
    if (anos) return parseInt(anos[1]) * 12
    const meses = val.match(/(\d+)\s*[Mm](?:ês|es)?/)
    if (meses) return parseInt(meses[1])
    return null
  }

  function formatarValidadeMeses(val: string | null | undefined) {
    const raw = String(val ?? '').trim()
    if (!raw) return '—'
    const meses = validadeEmMeses(raw)
    return meses ? String(meses) : raw
  }

  function normalizeStatusProduto(value: string | null | undefined, ativoFallback = true) {
    const raw = String(value ?? '').trim()
    if (raw) return raw
    return ativoFallback ? 'Ativo' : 'Inativo'
  }

  function normalizeCategoriaCertificado(value: string | null | undefined) {
    return String(value ?? '')
      .trim()
      .replace(/[\u2010-\u2015\u2212]/g, '-')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  }

  function normalizeTipoEmissao(value: string | null | undefined) {
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z]+/g, '_')
      .replace(/^_+|_+$/g, '')

    if (!normalized) return ''
    if (
      ['video_conferencia', 'videoconferencia', 'videochamada', 'video_chamada'].includes(normalized)
      || normalized.includes('videoconferencia')
      || normalized.includes('video_conferencia')
      || normalized.includes('video')
    ) {
      return 'videoconferencia'
    }
    if (
      ['auto_atendimento', 'autoatendimento', 'auto_atend', 'autoatend'].includes(normalized)
      || normalized.includes('auto_atendimento')
      || normalized.includes('autoatendimento')
    ) {
      return 'auto_atendimento'
    }
    if (
      ['presencial', 'presenca'].includes(normalized)
      || normalized.includes('presencial')
    ) {
      return 'presencial'
    }
    if (
      ['online', 'on_line', 'remoto'].includes(normalized)
      || normalized.includes('online')
      || normalized.includes('remoto')
    ) {
      return 'online'
    }

    return normalized
  }

  function resolveFormaPagamentoSelection(nomeForma: string) {
    const nomeNormalizado = nomeForma.trim().toLowerCase()
    if (!nomeNormalizado) {
      return {
        formaPagamentoId: null as string | null,
        paymentMethod: null as PaymentMethodConfig | null,
      }
    }

    const formaCatalogo = pagamentosAtivos.find(item => item.nome.trim().toLowerCase() === nomeNormalizado) ?? null
    const paymentMethod = paymentMethods.find(item => item.label.trim().toLowerCase() === nomeNormalizado) ?? null

    return {
      formaPagamentoId: formaCatalogo?.id ?? null,
      paymentMethod,
    }
  }

  function classifyPaymentFlow(formaPagamento: string) {
    const normalized = String(formaPagamento ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')

    if (normalized.includes('boleto')) return 'boleto'
    if (normalized.includes('pix')) return 'pix'
    if (normalized.includes('cartao') || normalized.includes('credito') || normalized.includes('debito')) return 'cartao'
    return 'outro'
  }

  async function dispararComunicacaoAutomaticaVenda(input: {
    vendaId: string
    clienteNome: string | null
    produtoNome: string
    valorVenda: number
    formaPagamento: string
    vencimento: string | null
    telefone: string | null
    email: string | null
  }) {
    const paymentFlow = classifyPaymentFlow(input.formaPagamento)
    const ambiente = paymentRuntime.modo_teste_geral
      ? 'Ambiente de testes ativo. Esta comunicação se refere a uma operação de homologação.'
      : 'Em breve você receberá as próximas atualizações do pedido.'
    const values = {
      cliente: input.clienteNome ?? 'Cliente',
      produto: input.produtoNome || 'Produto',
      valor: formatCurrency(input.valorVenda ?? 0),
      forma_pagamento: input.formaPagamento || 'Não informada',
      vencimento: input.vencimento ? new Date(`${input.vencimento}T00:00:00`).toLocaleDateString('pt-BR') : 'Não informado',
      ambiente,
    }

    const isBoleto = paymentFlow === 'boleto'
    const waBody = renderTemplate(
      isBoleto ? VENDA_WA_BOLETO_TPL : VENDA_WA_PAGAMENTO_IMEDIATO_TPL,
      values
    )
    const emailSubject = renderTemplate(
      isBoleto ? VENDA_EMAIL_BOLETO_SUBJECT : VENDA_EMAIL_PAGAMENTO_IMEDIATO_SUBJECT,
      values
    )
    const emailBody = renderTemplate(
      isBoleto ? VENDA_EMAIL_BOLETO_TPL : VENDA_EMAIL_PAGAMENTO_IMEDIATO_TPL,
      values
    )

    const ops: Promise<{ error: string | null }>[] = []
    if (input.telefone?.trim()) {
      ops.push(queueWhatsAppMessage({
        to: input.telefone.trim(),
        body: waBody,
        payload: {
          venda_id: input.vendaId,
          tipo: 'venda_pos_compra',
          payment_flow: paymentFlow,
        },
      }))
    }
    if (input.email?.trim()) {
      ops.push(queueEmailMessage({
        to: input.email.trim(),
        subject: emailSubject,
        body: emailBody,
        payload: {
          venda_id: input.vendaId,
          tipo: 'venda_pos_compra',
          payment_flow: paymentFlow,
        },
      }))
    }

    if (!ops.length) return { sent: 0, failed: 0 }
    const results = await Promise.all(ops)
    return {
      sent: results.filter(item => !item.error).length,
      failed: results.filter(item => !!item.error).length,
    }
  }

  const vendasFiltradas = useMemo(() => {
    return vendasV2.filter(v => {
      const criado = new Date(v.created_at)
      const dataInicialOk = !vendaFilters.dataInicial || criado >= new Date(`${vendaFilters.dataInicial}T00:00:00`)
      const dataFinalOk   = !vendaFilters.dataFinal   || criado <= new Date(`${vendaFilters.dataFinal}T23:59:59`)
      const pedido    = (v.pedido_numero ?? '').toLowerCase()
      const protocolo = (v.protocolo_numero ?? '').toLowerCase()
      const cliente   = ((v.cadastros_base as { nome?: string } | null)?.nome ?? v.nome_faturamento ?? '').toLowerCase()
      const documento = ((v.cadastros_base as { cpf_cnpj?: string } | null)?.cpf_cnpj ?? v.documento_faturamento ?? '').toLowerCase()
      const paNome    = ((v.pontos_atendimento as { nome?: string } | null)?.nome ?? '').toLowerCase()
      const termoCliente = vendaFilters.cliente.trim().toLowerCase()
      return dataInicialOk
        && dataFinalOk
        && (!vendaFilters.pedido    || pedido.includes(vendaFilters.pedido.trim().toLowerCase()))
        && (!vendaFilters.protocolo || protocolo.includes(vendaFilters.protocolo.trim().toLowerCase()))
        && (!termoCliente           || cliente.includes(termoCliente) || documento.includes(termoCliente))
        && (!vendaFilters.status    || v.status_venda === vendaFilters.status)
        && (!vendaFilters.pa        || paNome.includes(vendaFilters.pa.trim().toLowerCase()))
    })
  }, [vendasV2, vendaFilters])

  const certificadosFiltrados = useMemo(() => {
    const categoriaSelecionada = normalizeCategoriaCertificado(certFilters.categoria)
    return certificados.filter(c => {
      const termo = certFilters.busca.trim().toLowerCase()
      if (termo) {
        const matchNome   = (c.tipo ?? '').toLowerCase().includes(termo)
        const matchCodigo = (c.codigo?.toString() ?? '').includes(termo)
        const matchHash   = (c.hash ?? '').toLowerCase().includes(termo)
        const matchAC     = (c.produto_vinculado_ac ?? '').toLowerCase().includes(termo)
        if (!matchNome && !matchCodigo && !matchHash && !matchAC) return false
      }
      if (certFilters.status === 'ativo' && !c.ativo) return false
      if (certFilters.status === 'inativo' && c.ativo) return false
      if (categoriaSelecionada && normalizeCategoriaCertificado(c.categoria) !== categoriaSelecionada) return false
      return true
    })
  }, [certificados, certFilters])

  const categoriasDisponiveis = useMemo(() => {
    const categoriasMap = new Map<string, string>()
    for (const certificado of certificados) {
      const categoriaOriginal = String(certificado.categoria ?? '').trim()
      if (!categoriaOriginal) continue
      const categoriaNormalizada = normalizeCategoriaCertificado(categoriaOriginal)
      if (!categoriaNormalizada) continue
      if (!categoriasMap.has(categoriaNormalizada)) {
        categoriasMap.set(categoriaNormalizada, categoriaOriginal.replace(/\s+/g, ' '))
      }
    }

    return Array.from(categoriasMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }))
  }, [certificados])

  const totalFiltrado  = useMemo(() => vendasFiltradas.reduce((s, v) => s + (v.valor_venda ?? 0), 0), [vendasFiltradas])
  const totalPaginas   = Math.max(1, Math.ceil(vendasFiltradas.length / itensPorPagina))
  const vendasPaginadas = useMemo(() => {
    const start = (paginaAtual - 1) * itensPorPagina
    return vendasFiltradas.slice(start, start + itensPorPagina)
  }, [vendasFiltradas, paginaAtual, itensPorPagina])

  // ── fetch V2 ─────────────────────────────────────────────────
  const fetchVendasV2 = useCallback(async () => {
    setLoadingV(true)
    const rows = await fetchAivenCommercialSales(50) as VendaRow[]
    setVendasV2(rows)
    const vendaIds = rows.map(v => v.id)
    if (vendaIds.length > 0) {
      const agendaRows = await fetchAivenCommercialSchedule({ dataBase: null })
      const statusMap: Record<string, StatusAgendamentoValidacao | null> = {}
      for (const item of agendaRows) {
        if (!item.venda_certificado_id || !vendaIds.includes(item.venda_certificado_id)) continue
        if (!(item.venda_certificado_id in statusMap)) {
          statusMap[item.venda_certificado_id] = item.status_agendamento
        }
      }
      setAgendamentoStatusPorVenda(statusMap)
    } else {
      setAgendamentoStatusPorVenda({})
    }
    setVendedorNomes(new Map())
    setLoadingV(false)
  }, [])

  const fetchClientes = useCallback(async () => {
    const data = await fetchAivenCommercialCustomers()
    setClientes(data as CadastroBase[])
  }, [])

  useEffect(() => {
    void fetchAgencyConfig().then(({ data }) => setAgencyConfig(data))
  }, [])

  const fetchPontos = useCallback(async () => {
    const data = await fetchAivenCommercialPoints()
    setPontos(data as PontoAtendimento[])
  }, [])

  const fetchAgentesRegistro = useCallback(async () => {
    const data = await fetchAivenCommercialAgents()
    setAgentesRegistro((data ?? []) as Array<{ id: string; nome: string }>)
  }, [])

  async function buscarClientes(term: string) {
    const t = term.trim()
    if (t.length < 3) { setClienteResultados([]); setClienteDropdownOpen(false); return }
    setClienteBuscando(true)
    const data = await searchAivenCommercialCustomers(t)
    setClienteResultados(data as CadastroBase[])
    setClienteDropdownOpen(data.length > 0)
    setClienteBuscando(false)
  }

  const fetchAgenda = useCallback(async () => {
    setLoadingA(true)
    const dataBase = filtroDataAgenda || new Date().toISOString().split('T')[0]
    const isAgente = profile?.perfil === 'agente_registro'
    const agenteId = isAgente ? profile?.id ?? null : null
    const statusV2 = filtroStatusAgenda === 'aguardando' ? 'pendente' : (filtroStatusAgenda || null)
    const agendaV2 = await fetchAivenCommercialSchedule({ dataBase, status: statusV2, agenteId })

    const agendaNormalizada: AgendaItem[] = (agendaV2 as AgendamentoValidacaoRow[]).map(item => {
      const venda = item.vendas_certificados?.[0] ?? null
      const cadastro = item.cadastros_base?.[0] ?? null
      const ponto = item.pontos_atendimento?.[0] ?? null
      return {
        id: item.id,
        origem: 'validacao_v2' as const,
        venda_certificado_id: item.venda_certificado_id ?? null,
        cliente: cadastro?.nome ?? venda?.nome_faturamento ?? 'Cliente não identificado',
        telefone: venda?.telefone_faturamento ?? null,
        servico: venda?.tipo_produto ?? 'Validação',
        data_hora: item.data_agendada ?? item.created_at ?? new Date().toISOString(),
        status: (item.status_agendamento === 'pendente' ? 'aguardando' : item.status_agendamento) as AgendaItem['status'],
        observacoes: item.observacoes,
        ponto_atendimento_nome: ponto?.nome ?? null,
        ponto_atendimento_id: item.ponto_atendimento_id ?? null,
        tipo_atendimento: item.tipo_atendimento ?? null,
        protocolo_numero: venda?.protocolo_numero ?? null,
        agente_registro_id: item.agente_registro_id ?? null,
      }
    }).sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime())

    setAgenda(agendaNormalizada)
    setLoadingA(false)
  }, [profile?.id, profile?.perfil, filtroDataAgenda, filtroStatusAgenda])

  const fetchDisponibilidades = useCallback(async () => {
    if (!canManageAgenda) return
    const resp = await fetch(getApiUrl('/comercial/disponibilidade'))
    const data = await resp.json()
    let rows = (data.disponibilidades ?? []) as AgenteDisponibilidade[]
    if (!isAdmin && profile?.id) rows = rows.filter(d => d.agente_registro_id === profile.id)
    rows.sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio))
    setDisponibilidades(rows)
  }, [canManageAgenda, isAdmin, profile?.id])

  const fetchIndisponibilidades = useCallback(async () => {
    if (!canManageAgenda) return
    const resp = await fetch(getApiUrl('/comercial/indisponibilidade'))
    const data = await resp.json()
    let rows = (data.indisponibilidades ?? []) as AgenteIndisponibilidade[]
    if (!isAdmin && profile?.id) rows = rows.filter(d => d.agente_registro_id === profile.id && d.ativo)
    else rows = rows.filter(d => d.ativo)
    rows.sort((a, b) => new Date(a.inicio_em).getTime() - new Date(b.inicio_em).getTime())
    setIndisponibilidades(rows)
  }, [canManageAgenda, isAdmin, profile?.id])

  const fetchCatalogo = useCallback(async () => {
    setLoadingCatalogo(true)
    setCatalogoErro(null)
    setAgendaSchemaWarning(null)
    try {
      const [catalogRes, settingsRes] = await Promise.all([
        fetch(getApiUrl('/catalog')).then(r => r.json()),
        fetch(getApiUrl('/app-settings?keys=payment_methods,payment_runtime,pricing_matrix_rules,nfse_automation_settings')).then(r => r.json()),
      ])
      if (!catalogRes.ok) throw new Error(catalogRes.error ?? 'Erro ao carregar catálogo')
      setCertificados((catalogRes.certificados ?? []) as Certificado[])
      setTabelasPreco((catalogRes.tabelas ?? []) as TabelaPreco[])
      setTabelaItens((catalogRes.itens ?? []) as TabelaPrecoItem[])
      setTabelaParticipantes((catalogRes.participantes ?? []) as TabelaPrecoParticipante[])
      setAgentesTabelaPreco((catalogRes.agentesTabelaPreco ?? []) as AgenteTabelaPreco[])
      setParceirosAgentesPermitidos((catalogRes.parceirosAgentes ?? []) as ParceiroAgentePermitido[])
      setComissoes((catalogRes.comissoes ?? []) as FaixaComissao[])
      setPagamentos((catalogRes.pagamentos ?? []) as FormaPagamentoV2[])
      setParceiros((catalogRes.parceiros ?? []) as ParceiroSimples[])
      if (settingsRes.ok) {
        const s = settingsRes.settings ?? {}
        setPaymentMethods(Array.isArray(s.payment_methods?.methods) ? s.payment_methods.methods as PaymentMethodConfig[] : [])
        const rv = s.payment_runtime
        setPaymentRuntime({
          modo_teste_geral: rv?.modo_teste_geral ?? DEFAULT_PAYMENT_RUNTIME.modo_teste_geral,
          bloquear_integracoes_reais: rv?.bloquear_integracoes_reais ?? DEFAULT_PAYMENT_RUNTIME.bloquear_integracoes_reais,
          aviso_checkout: rv?.aviso_checkout ?? DEFAULT_PAYMENT_RUNTIME.aviso_checkout,
        })
        setPricingMatrixRules(Array.isArray(s.pricing_matrix_rules?.rules) ? s.pricing_matrix_rules.rules as PricingMatrixRule[] : [])
        setNfseAutomationSettings(normalizeNfseAutomationSettings(s.nfse_automation_settings as Partial<NfseAutomationSettings> | undefined))
      }
    } catch (e) {
      setCatalogoErro(e instanceof Error ? e.message : 'Erro ao carregar catálogo')
    } finally {
      setLoadingCatalogo(false)
    }
  }, [])

  // ── effects ──────────────────────────────────────────────────
  useEffect(() => { void fetchVendasV2() }, [fetchVendasV2])
  useEffect(() => { void fetchClientes()  }, [fetchClientes])
  useEffect(() => { void fetchPontos()    }, [fetchPontos])
  useEffect(() => { void fetchAgentesRegistro() }, [fetchAgentesRegistro])
  useEffect(() => {
    if (tab === 'agenda') {
      void fetchAgenda()
    }
  }, [tab, fetchAgenda])
  useEffect(() => {
    if (tab === 'agenda') {
      void fetchDisponibilidades()
    }
  }, [tab, fetchDisponibilidades])
  useEffect(() => {
    if (tab === 'agenda') {
      void fetchIndisponibilidades()
    }
  }, [tab, fetchIndisponibilidades])
  useEffect(() => { void fetchCatalogo()  }, [fetchCatalogo])

  useEffect(() => {
    const previous = vendaAutomationSnapshotRef.current
    if (previous.size === 0) {
      vendaAutomationSnapshotRef.current = new Map(vendasV2.map(v => [v.id, { pago: Boolean(v.pago), status_venda: v.status_venda, protocolo_numero: v.protocolo_numero ?? null }]))
      return
    }

    for (const venda of vendasV2) {
      const anterior = previous.get(venda.id) ?? null
      if (podeDispararAutomacaoPorMudanca(venda, anterior)) {
        void tentarEmitirNfseAutomaticamente(venda, 'mudança automática da venda')
      }
    }

    vendaAutomationSnapshotRef.current = new Map(vendasV2.map(v => [v.id, { pago: Boolean(v.pago), status_venda: v.status_venda, protocolo_numero: v.protocolo_numero ?? null }]))
  }, [vendasV2, nfseAutomationSettings.gatilho_emissao])

  useEffect(() => {
    const previous = agendaAutomationSnapshotRef.current
    if (!Object.keys(previous).length) {
      agendaAutomationSnapshotRef.current = { ...agendamentoStatusPorVenda }
      return
    }

    if (nfseAutomationSettings.gatilho_emissao === 'apos_agendamento') {
      for (const [vendaId, status] of Object.entries(agendamentoStatusPorVenda)) {
        const anterior = previous[vendaId] ?? null
        const ficouElegivel = anterior !== 'confirmado' && anterior !== 'realizado' && (status === 'confirmado' || status === 'realizado')
        if (!ficouElegivel) continue
        const venda = vendasV2.find(item => item.id === vendaId)
        if (venda) void tentarEmitirNfseAutomaticamente(venda, 'agendamento confirmado')
      }
    }

    if (nfseAutomationSettings.gatilho_emissao === 'apos_validacao') {
      for (const [vendaId, status] of Object.entries(agendamentoStatusPorVenda)) {
        const anterior = previous[vendaId] ?? null
        const ficouElegivel = anterior !== 'realizado' && status === 'realizado'
        if (!ficouElegivel) continue
        const venda = vendasV2.find(item => item.id === vendaId)
        if (venda) void tentarEmitirNfseAutomaticamente(venda, 'validação realizada')
      }
    }

    agendaAutomationSnapshotRef.current = { ...agendamentoStatusPorVenda }
  }, [agendamentoStatusPorVenda, vendasV2, nfseAutomationSettings.gatilho_emissao])

  useEffect(() => {
    setCurrentUserId(profile?.id ?? null)
  }, [profile?.id])

  useEffect(() => {
    if (!formV2.certificado_id) return
    const certificadoAindaCompativel = certsDaTabela.some(({ cert }) => cert.id === formV2.certificado_id)
    if (!certificadoAindaCompativel) {
      setFormV2(prev => ({ ...prev, certificado_id: '', tabela_preco_item_id: '', valor_venda: 0, desconto: 0 }))
    }
  }, [formV2.certificado_id, certsDaTabela])

  useEffect(() => {
    if (!formV2.tabela_preco_id) return
    const tabelaAindaDisponivel = tabelasDisponiveisVenda.some(tabela => tabela.id === formV2.tabela_preco_id)
    if (!tabelaAindaDisponivel) {
      setFormV2(prev => ({
        ...prev,
        tabela_preco_id: '',
        tabela_preco_item_id: '',
        certificado_id: '',
        valor_venda: 0,
        desconto: 0,
        voucher_codigo: '',
      }))
    }
  }, [formV2.tabela_preco_id, tabelasDisponiveisVenda])

  useEffect(() => {
    setFormV2(prev => {
      if (prev.desconto === descontoCalculadoVenda) return prev
      return { ...prev, desconto: descontoCalculadoVenda }
    })
  }, [descontoCalculadoVenda])

  useEffect(() => {
    if (canManageAgenda) {
      setFormDisp(prev => ({
        ...prev,
        agente_registro_id: prev.agente_registro_id || (isAdmin ? '' : (profile?.id ?? '')),
        ponto_atendimento_id: prev.ponto_atendimento_id || (pontosAtivos[0]?.id ?? ''),
      }))
      setFormIndisp(prev => ({
        ...prev,
        agente_registro_id: prev.agente_registro_id || (isAdmin ? '' : (profile?.id ?? '')),
      }))
    }
  }, [canManageAgenda, isAdmin, profile?.id, pontosAtivos])

  useEffect(() => {
    if (!showFormDisp) return
    setDiasSelecionadosDisp(prev => prev.length > 0 ? prev : [1])
  }, [showFormDisp])

  useEffect(() => {
    if (!showFormIndisp) return
    const now = new Date()
    const plusOneHour = new Date(now.getTime() + 60 * 60 * 1000)
    const toLocalInput = (value: Date) => {
      const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
      return local.toISOString().slice(0, 16)
    }
    setFormIndisp(prev => ({
      ...prev,
      agente_registro_id: prev.agente_registro_id || (isAdmin ? '' : (profile?.id ?? '')),
      inicio_em: prev.inicio_em || toLocalInput(now),
      fim_em: prev.fim_em || toLocalInput(plusOneHour),
    }))
  }, [showFormIndisp, isAdmin, profile?.id])

  useEffect(() => {
    setSlotPreviewParceiroId('')
  }, [selectedTabelaId])

  useEffect(() => {
    setSelectedBaseCertIds(new Set())
    setShowCatalogoBasePopup(false)
  }, [selectedTabelaId])

  useEffect(() => {
    if (!selectedTabelaId) {
      setPricingMatrixForm({ tabela_base_id: '', ajuste_percentual: 0 })
      return
    }
    const currentRule = pricingRuleByTabelaId.get(selectedTabelaId)
    setPricingMatrixForm({
      tabela_base_id: currentRule?.tabela_base_id ?? '',
      ajuste_percentual: currentRule?.ajuste_percentual ?? 0,
    })
  }, [selectedTabelaId, pricingRuleByTabelaId])

  useEffect(() => {
    if (!formAgendaV2) return
    const agenteValido = agentesElegiveisAgendaAtual.some(item => item.agente_registro_id === formAgendaV2.agente_registro_id)
    if (!agenteValido && formAgendaV2.agente_registro_id) {
      setFormAgendaV2(prev => prev ? { ...prev, agente_registro_id: '', ponto_atendimento_id: '' } : prev)
      return
    }

    if (formAgendaV2.ponto_atendimento_id && !pontosElegiveisAgendaAtual.some(p => p.id === formAgendaV2.ponto_atendimento_id)) {
      setFormAgendaV2(prev => prev ? { ...prev, ponto_atendimento_id: '' } : prev)
    }
  }, [formAgendaV2, agentesElegiveisAgendaAtual, pontosElegiveisAgendaAtual])

  // pre-fill protocolo CPF when client changes
  useEffect(() => {
    if (clienteSelecionadoObj) {
      setFormProtocolo(p => ({ ...p, cpf: clienteSelecionadoObj.cpf_cnpj }))
    }
  }, [clienteSelecionadoObj])

  // ── V2 mutations ─────────────────────────────────────────────
  function fecharFormVenda() {
    setShowFormV(false)
    setClienteSelecionadoObj(null)
    setClienteSearch('')
    setContadorSearch('')
    setContadorDropdownOpen(false)
    setContadorStepHandled(false)
  }

  async function salvarVendaV2() {
    if (!formV2.tipo_venda) { showMsg('Selecione o tipo de venda.'); return }
    if (!formV2.cadastro_base_id) { showMsg('Selecione um cliente.'); return }
    if (!vendaStepStatus.parceiroOk) { showMsg('Confirme a etapa do parceiro vendedor antes de seguir.'); return }
    if (!formV2.tipo_emissao) { showMsg('Selecione o tipo de emissão.'); return }
    if (!formV2.ponto_atendimento_id) { showMsg('Selecione o ponto de atendimento.'); return }
    if (!formV2.tabela_preco_id) { showMsg('Selecione uma tabela de venda compatível.'); return }
    if (!formV2.certificado_id) { showMsg('Selecione o produto.'); return }
    if (formV2.valor_venda <= 0) { showMsg('Informe o valor da venda.'); return }
    if (!descontoDentroDoLimite) {
      showMsg(`O desconto aplicado excede o limite da tabela. Máximo permitido: ${formatCurrency(descontoMaximoPermitido)}.`)
      return
    }
    if (!voucherAplicadoValido) {
      showMsg('O cupom informado não corresponde ao voucher configurado na tabela selecionada.')
      return
    }
    if (!formV2.forma_pagamento) { showMsg('Selecione a forma de pagamento.'); return }
    if (!formV2.data_vencimento) { showMsg('Selecione o vencimento da forma de pagamento.'); return }
    if (!currentUserId) { showMsg('Usuário não autenticado.'); return }
    setSalvandoV(true)

    try {
      const cli = clienteSelecionadoObj
      const cert = certificadoById.get(formV2.certificado_id)
      const tabela = tabelaById.get(formV2.tabela_preco_id)
      const pagamentoSelecionado = resolveFormaPagamentoSelection(formV2.forma_pagamento)
      const pontoAtendimentoId = formV2.ponto_atendimento_id

      const payload = {
        cadastro_base_id:        formV2.cadastro_base_id,
        empresa_id:              formV2.empresa_id,
        titular_id:              null,
        certificado_id:          formV2.certificado_id || null,
        tabela_preco_id:         formV2.tabela_preco_id || null,
        tabela_preco_item_id:    formV2.tabela_preco_item_id || null,
        tipo_produto:            cert?.tipo ?? '',
        tipo_venda:              formV2.tipo_venda,
        tipo_emissao:            formV2.tipo_emissao,
        tabela_preco:            tabela?.nome ?? null,
        forma_pagamento_id:      pagamentoSelecionado.formaPagamentoId,
        valor_venda:             formV2.valor_venda,
        desconto:                formV2.desconto || 0,
        valor_custo:             null,
        pago:                    false,
        data_pagamento:          null,
        data_vencimento:         formV2.data_vencimento || null,
        contador_id:             formV2.contador_id || null,
        documento_faturamento:   cli?.cpf_cnpj ?? null,
        nome_faturamento:        cli?.nome ?? null,
        email_faturamento:       cli?.email ?? null,
        telefone_faturamento:    cli?.telefone ?? null,
        logradouro:              cli?.logradouro ?? null,
        numero:                  cli?.numero ?? null,
        complemento:             cli?.complemento ?? null,
        bairro:                  cli?.bairro ?? null,
        cidade:                  cli?.cidade ?? null,
        uf:                      cli?.uf ?? null,
        cep:                     cli?.cep ?? null,
        inscricao_municipal:     cli?.inscricao_municipal ?? null,
        inscricao_estadual:      cli?.inscricao_estadual ?? null,
        iss_retido:              cli?.iss_retido ?? false,
        vendedor_id:             currentUserId,
        agente_registro_id:      null,
        ponto_atendimento_id:    pontoAtendimentoId,
        pedido_numero:           null,
        pedido_status:           'nao_gerado',
        protocolo_numero:        null,
        protocolo_status:        'nao_gerado',
        certificadora:           null,
        voucher_codigo:          formV2.voucher_codigo.trim() || null,
        voucher_percentual:      formV2.voucher_codigo.trim() ? Number(tabela?.max_desconto_percentual ?? 0) : null,
        voucher_valor:           formV2.desconto > 0 ? formV2.desconto : null,
        api_payload_pedido:      {},
        api_payload_protocolo:   {},
        comissao_vendedor_tipo:  null,
        comissao_vendedor_valor: null,
        comissao_agente_tipo:    null,
        comissao_agente_valor:   null,
        status_venda:            'vendido' as const,
        observacoes:             formV2.observacoes,
        metadata:                {
          forma_pagamento: formV2.forma_pagamento,
          voucher_codigo: formV2.voucher_codigo.trim() || null,
          desconto_calculado: formV2.desconto || 0,
          valor_base_produto: valorBaseProduto || null,
          parceiro_indicador_id: formV2.contador_id || null,
          ponto_atendimento_id: pontoAtendimentoId,
          payment_method_id: pagamentoSelecionado.paymentMethod?.id ?? null,
          payment_method_label: pagamentoSelecionado.paymentMethod?.label ?? null,
          payment_runtime: paymentRuntime,
          ambiente_teste: paymentRuntime.modo_teste_geral,
        },
      }

      const vendaCriada = await saveAivenCommercialSale(payload as Record<string, unknown>)
      if (!vendaCriada) { showMsg('Erro ao criar venda'); return }

      let comunicacaoResumo = 'sem contato do cliente para disparo automático'
      const pontoSelecionado = pontos.find(item => item.id === pontoAtendimentoId) ?? null
      const vendaParaLista: VendaRow = {
        ...(vendaCriada as VendaCertificado),
        cadastros_base: cli ? { nome: cli.nome, cpf_cnpj: cli.cpf_cnpj } : null,
        pontos_atendimento: pontoSelecionado ? { nome: pontoSelecionado.nome } : null,
      }
      setVendasV2(prev => [vendaParaLista, ...prev.filter(item => item.id !== vendaParaLista.id)])
      setPaginaAtual(1)

      try {
        const comunicacaoResult = await dispararComunicacaoAutomaticaVenda({
          vendaId: vendaCriada.id,
          clienteNome: cli?.nome ?? vendaCriada.nome_faturamento ?? null,
          produtoNome: cert?.tipo ?? vendaCriada.tipo_produto ?? 'Produto',
          valorVenda: formV2.valor_venda,
          formaPagamento: formV2.forma_pagamento,
          vencimento: formV2.data_vencimento || null,
          telefone: cli?.telefone ?? vendaCriada.telefone_faturamento ?? null,
          email: cli?.email ?? vendaCriada.email_faturamento ?? null,
        })
        comunicacaoResumo = comunicacaoResult.sent > 0
          ? `${comunicacaoResult.sent} comunicação(ões) enfileirada(s)`
          : 'sem contato do cliente para disparo automático'
      } catch {
        comunicacaoResumo = 'comunicação não enviada'
      }

      const agendamentoPayload = {
        venda_certificado_id: vendaCriada.id,
        cadastro_base_id: vendaCriada.cadastro_base_id,
        empresa_id: vendaCriada.empresa_id,
        titular_id: vendaCriada.titular_id,
        contador_id: vendaCriada.contador_id,
        agente_registro_id: null,
        ponto_atendimento_id: null,
        data_agendada: null,
        tipo_atendimento: null,
        status_agendamento: 'pendente' as const,
        observacoes: vendaCriada.observacoes ?? null,
        metadata: {
          origem: 'venda_comercial',
          status_inicial: 'aguardando_agendamento',
        },
      }

      const agendaResp = await fetch(getApiUrl('/comercial/agenda/save'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agendamentoPayload),
      })
      if (!agendaResp.ok) {
        showMsg('Venda salva. O agendamento automático não pôde ser criado — crie-o manualmente na aba Agenda.')
      }

      if (nfseAutomationSettings.gatilho_emissao === 'antes_pagamento') {
        void tentarEmitirNfseAutomaticamente(vendaParaLista, 'venda criada antes do pagamento')
      }
      fecharFormVenda()
      setFormV2({ ...EMPTY_VENDA_V2 })
      setVendaFilters(EMPTY_VENDA_FILTERS)
      setSelectedIds(new Set())
      showMsg(`Venda salva com sucesso! ${comunicacaoResumo}.`, 'ok')
      void fetchVendasV2()
      void fetchAgenda()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('Falha ao criar venda', { error, formV2 })
      showMsg(`Erro ao salvar venda: ${message}`, 'err')
    } finally {
      setSalvandoV(false)
    }
  }

  async function salvarCliente() {
    if (!formCliente.cpf_cnpj.trim() || !formCliente.nome.trim()) return
    setSalvandoCliente(true)
    const payload = {
      ...formCliente,
      id: editingClienteId,
      cpf_cnpj: formCliente.cpf_cnpj.trim(),
      nome: formCliente.nome.trim(),
      nome_fantasia: formCliente.nome_fantasia?.trim() || null,
      email: formCliente.email?.trim() || null,
      telefone: formCliente.telefone?.trim() || null,
    }

    let savedId: string | null = null
    try {
      const saved = await saveAivenCommercialCustomer(payload)
      savedId = saved?.id ?? null
    } catch (error) {
      setSalvandoCliente(false)
      showMsg(error instanceof Error ? error.message : 'Não foi possível salvar o cliente.')
      return
    }

    setSalvandoCliente(false)
    setFormCliente({ ...EMPTY_CLIENTE_BASE })
    setShowClienteForm(false)
    setEditingClienteId(null)
    await fetchClientes()
    if (savedId) {
      setFormV2(p => ({ ...p, cadastro_base_id: savedId }))
      setClienteSelecionadoObj({ ...payload, id: savedId } as CadastroBase)
    }
  }
  function abrirNovoCliente() {
    setEditingClienteId(null)
    setFormCliente({ ...EMPTY_CLIENTE_BASE })
    setShowClienteForm(true)
  }

  function abrirEditarCliente(cadastroId: string) {
    const cliente = clientes.find(c => c.id === cadastroId)
    if (!cliente) return
    setEditingClienteId(cliente.id)
    setFormCliente({
      tipo_cliente: cliente.tipo_cliente,
      tipo_cadastro: cliente.tipo_cadastro,
      cpf_cnpj: cliente.cpf_cnpj,
      nome: cliente.nome,
      nome_fantasia: cliente.nome_fantasia,
      email: cliente.email,
      telefone: cliente.telefone,
      cidade: cliente.cidade,
      logradouro: cliente.logradouro,
      numero: cliente.numero,
      complemento: cliente.complemento,
      bairro: cliente.bairro,
      uf: cliente.uf,
      cep: cliente.cep,
      inscricao_municipal: cliente.inscricao_municipal,
      inscricao_estadual: cliente.inscricao_estadual,
      iss_retido: cliente.iss_retido,
      status: cliente.status,
      metadata: cliente.metadata ?? {},
    })
    setContadorSearch('')
    setContadorDropdownOpen(false)
    setContadorStepHandled(false)
    setShowFormV(true)
    setShowClienteForm(true)
  }

  function prepararNovaVendaParaCliente(cadastroId: string) {
    setFormV2(p => ({ ...p, cadastro_base_id: cadastroId }))
    const c = clientes.find(x => x.id === cadastroId)
    setClienteSelecionadoObj(c ?? null)
    setContadorSearch('')
    setContadorDropdownOpen(false)
    setContadorStepHandled(false)
    setShowFormV(true)
    setShowClienteForm(false)
  }

  async function garantirAgendamentoPendente(venda: VendaRow) {
    const existente = await getAivenCommercialScheduleByVenda(venda.id)
    if (existente) return existente

    const payload = {
      venda_certificado_id: venda.id,
      cadastro_base_id: venda.cadastro_base_id,
      empresa_id: venda.empresa_id,
      titular_id: venda.titular_id,
      contador_id: venda.contador_id,
      agente_registro_id: null,
      ponto_atendimento_id: null,
      data_agendada: null,
      tipo_atendimento: null,
      status_agendamento: 'pendente',
      observacoes: venda.observacoes ?? null,
      metadata: { origem: 'acao_manual_venda', status_inicial: 'aguardando_agendamento' },
    }

    const criado = await saveAivenCommercialAgendaPendente(payload)
    if (!criado) {
      showMsg('Não foi possível criar o agendamento pendente')
      return null
    }
    return criado
  }

  async function prepararAgendamento(venda: VendaRow) {
    const agendamento = await garantirAgendamentoPendente(venda)
    if (!agendamento) return

    setFormAgendaV2({
      agenda_id: agendamento.id,
      venda_certificado_id: venda.id,
      agente_registro_id: agendamento.agente_registro_id ?? '',
      ponto_atendimento_id: agendamento.ponto_atendimento_id ?? '',
      data_agendada: agendamento.data_agendada
        ? new Date(new Date(agendamento.data_agendada).getTime() - new Date(agendamento.data_agendada).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
        : '',
      tipo_atendimento: (agendamento.tipo_atendimento ?? '') as AgendamentoV2Form['tipo_atendimento'],
      observacoes: agendamento.observacoes ?? venda.observacoes ?? '',
    })
    setShowAgendaV2Panel(true)
    setTab('agenda')
    void fetchAgenda()
  }

  async function atualizarStatusVendaV2(id: string, status: StatusVendaCertificado) {
    const vendaAtual = vendasV2.find(v => v.id === id) ?? null
    const updated = await updateAivenCommercialSaleStatus(id, status)
    if (updated) {
      const vendaAtualizada = vendaAtual ? { ...vendaAtual, status_venda: status } : null
      setVendasV2(prev => prev.map(v => v.id === id ? { ...v, status_venda: status } : v))
      if (vendaAtualizada && podeDispararAutomacaoPorMudanca(vendaAtualizada as VendaRow, vendaAtual ? { pago: Boolean(vendaAtual.pago), status_venda: vendaAtual.status_venda, protocolo_numero: vendaAtual.protocolo_numero ?? null } : null)) {
        void tentarEmitirNfseAutomaticamente(vendaAtualizada as VendaRow, 'mudança de status da venda')
      }
    }
  }

  async function salvarAgendamentoValidacaoV2() {
    if (!formAgendaV2) return
    if (!formAgendaV2.data_agendada || !formAgendaV2.agente_registro_id || !formAgendaV2.ponto_atendimento_id) {
      setErroAgendaV2('Preencha data/hora, agente e ponto para confirmar o agendamento.')
      return
    }
    setErroAgendaV2(null)
    setSalvandoAgendaV2(true)
    const dataAgendada = new Date(formAgendaV2.data_agendada)
    const payload = {
      agendaId: formAgendaV2.agenda_id,
      vendaId: formAgendaV2.venda_certificado_id,
      agente_registro_id: formAgendaV2.agente_registro_id,
      ponto_atendimento_id: formAgendaV2.ponto_atendimento_id,
      data_hora: dataAgendada.toISOString(),
      tipo_atendimento: formAgendaV2.tipo_atendimento || null,
      observacoes: formAgendaV2.observacoes.trim() || null,
      status: 'confirmado',
    }

    let agendaErr: { message?: string } | null = null
    const vendaErr: { message?: string } | null = null
    try {
      const updated = await saveAivenCommercialAgenda(payload)
      if (!updated) throw new Error('Falha ao salvar agendamento.')
      await updateAivenCommercialSaleStatus(formAgendaV2.venda_certificado_id, 'agendado')
    } catch (error) {
      agendaErr = { message: error instanceof Error ? error.message : 'Erro desconhecido' }
    }
    setSalvandoAgendaV2(false)

    if (agendaErr ?? vendaErr) {
      setErroAgendaV2(`Erro ao salvar: ${(agendaErr ?? vendaErr)?.message ?? 'desconhecido'}`)
      setSalvandoAgendaV2(false)
      return
    }

    setShowAgendaV2Panel(false)
    setFormAgendaV2(null)
    setErroAgendaV2(null)
    setAgendamentoStatusPorVenda(prev => ({ ...prev, [formAgendaV2.venda_certificado_id]: 'confirmado' }))
    const vendaRelacionada = vendasV2.find(v => v.id === formAgendaV2.venda_certificado_id) ?? null
    if (vendaRelacionada && nfseAutomationSettings.gatilho_emissao === 'apos_agendamento') {
      void tentarEmitirNfseAutomaticamente(vendaRelacionada, 'agendamento confirmado')
    }
    void fetchAgenda()
    void fetchVendasV2()
  }

  async function abrirPainelAgendamentoV2(item: AgendaItem) {
    if (item.origem !== 'validacao_v2' || !item.venda_certificado_id) return
    let venda = vendasV2.find(v => v.id === item.venda_certificado_id) ?? null
    if (!venda) {
      const data = await getAivenCommercialSaleById(item.venda_certificado_id)
      if (data) {
        venda = { ...(data as VendaCertificado), cadastros_base: null, pontos_atendimento: null }
        setVendasV2(prev => [...prev, venda!])
      }
    }
    if (!venda) {
      setErroAgendaV2('Venda vinculada não encontrada no sistema.')
      return
    }
    setErroAgendaV2(null)

    setFormAgendaV2({
      agenda_id: item.id,
      venda_certificado_id: item.venda_certificado_id,
      agente_registro_id: item.agente_registro_id ?? '',
      ponto_atendimento_id: item.ponto_atendimento_id ?? '',
      data_agendada: item.data_hora
        ? new Date(new Date(item.data_hora).getTime() - new Date(item.data_hora).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
        : '',
      tipo_atendimento: (item.tipo_atendimento ?? '') as AgendamentoV2Form['tipo_atendimento'],
      observacoes: item.observacoes ?? venda.observacoes ?? '',
    })
    setShowAgendaV2Panel(true)
  }

  // ── agenda mutations ─────────────────────────────────────────
  async function salvarAgendamento() {
    if (!formA.cliente.trim() || !formA.data_hora) return
    setSalvandoA(true)
    try {
      const saved = await saveAivenCommercialAgenda({
        cliente: formA.cliente.trim(),
        telefone: formA.telefone || null,
        servico: formA.servico || null,
        data_hora: new Date(formA.data_hora).toISOString(),
        status: formA.status,
        observacoes: formA.observacoes || null,
      })
      if (!saved) throw new Error('Falha ao salvar agendamento.')
    } catch (error) {
      showMsg(error instanceof Error ? error.message : 'Falha ao salvar agendamento.')
      setSalvandoA(false)
      return
    }
    setSalvandoA(false)
    setShowFormA(false)
    setFormA({ ...EMPTY_AGENDA, servico: certificados[0]?.tipo ?? 'e-CPF A1' })
    void fetchAgenda()
  }

  async function atualizarStatusAgenda(id: string, status: StatusAgendamento) {
    const item = agenda.find(a => a.id === id)
    if (!item) return

    if (item.origem === 'validacao_v2') {
      const statusV2 = status === 'aguardando' ? 'pendente' : status
      await saveAivenCommercialAgenda({
        agendaId: id,
        vendaId: item.venda_certificado_id ?? null,
        data_hora: new Date(item.data_hora).toISOString(),
        status: statusV2,
        observacoes: item.observacoes ?? null,
        agente_registro_id: item.agente_registro_id ?? null,
        ponto_atendimento_id: item.ponto_atendimento_id ?? null,
        tipo_atendimento: item.tipo_atendimento ?? null,
      })
      if (item.venda_certificado_id) {
        setAgendamentoStatusPorVenda(prev => ({ ...prev, [item.venda_certificado_id!]: statusV2 as StatusAgendamentoValidacao }))
      }
    } else {
      await saveAivenCommercialAgenda({
        agendaId: id,
        cliente: item.cliente,
        telefone: item.telefone ?? null,
        servico: item.servico ?? null,
        data_hora: new Date(item.data_hora).toISOString(),
        status,
        observacoes: item.observacoes ?? null,
      })
    }

    setAgenda(prev => prev.map(a => a.id === id ? { ...a, status } : a))
  }

  async function salvarDisponibilidade() {
    const agenteId = isAdmin ? formDisp.agente_registro_id : (profile?.id ?? '')
    if (!agenteId || !formDisp.ponto_atendimento_id || !formDisp.hora_inicio || !formDisp.hora_fim) {
      showMsg('Preencha agente, ponto e faixa de horário.')
      return
    }
    if (diasSelecionadosDisp.length === 0) {
      showMsg('Selecione pelo menos um dia da semana.')
      return
    }

    setSalvandoDisp(true)
    const payload = diasSelecionadosDisp.map(dia => ({
      agente_registro_id: agenteId,
      ponto_atendimento_id: formDisp.ponto_atendimento_id,
      dia_semana: dia,
      hora_inicio: formDisp.hora_inicio,
      hora_fim: formDisp.hora_fim,
      intervalo_minutos: formDisp.intervalo_minutos,
      capacidade_por_slot: formDisp.capacidade_por_slot,
      tipo_atendimento: formDisp.tipo_atendimento || null,
      ativo: formDisp.ativo,
      metadata: {},
    }))

    const rDisp = await fetch(getApiUrl('/comercial/disponibilidade'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    setSalvandoDisp(false)
    if (!rDisp.ok) { showMsg('Erro ao salvar disponibilidade'); return }

    setShowFormDisp(false)
    setFormDisp({
      ...EMPTY_DISPONIBILIDADE,
      agente_registro_id: isAdmin ? '' : (profile?.id ?? ''),
      ponto_atendimento_id: pontosAtivos[0]?.id ?? '',
    })
    setDiasSelecionadosDisp([1])
    void fetchDisponibilidades()
  }

  async function toggleDisponibilidade(item: AgenteDisponibilidade) {
    await fetch(getApiUrl(`/comercial/disponibilidade/${item.id}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: !item.ativo }),
    })
    setDisponibilidades(prev => prev.map(d => d.id === item.id ? { ...d, ativo: !d.ativo } : d))
  }

  async function salvarIndisponibilidade() {
    const agenteId = isAdmin ? formIndisp.agente_registro_id : (profile?.id ?? '')
    if (!agenteId || !formIndisp.inicio_em || !formIndisp.fim_em) {
      showMsg('Preencha agente, início e fim do bloqueio.')
      return
    }

    const inicio = new Date(formIndisp.inicio_em)
    const fim = new Date(formIndisp.fim_em)
    if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || fim <= inicio) {
      showMsg('Informe um período válido para o bloqueio.')
      return
    }

    setSalvandoIndisp(true)
    const payload = {
      agente_registro_id: agenteId,
      ponto_atendimento_id: formIndisp.ponto_atendimento_id || null,
      inicio_em: inicio.toISOString(),
      fim_em: fim.toISOString(),
      motivo: formIndisp.motivo.trim() || null,
      ativo: formIndisp.ativo,
      metadata: {},
    }

    const rIndisp = await fetch(getApiUrl('/comercial/indisponibilidade'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    setSalvandoIndisp(false)
    if (!rIndisp.ok) { showMsg('Erro ao salvar bloqueio'); return }

    setShowFormIndisp(false)
    setFormIndisp({
      ...EMPTY_INDISPONIBILIDADE,
      agente_registro_id: isAdmin ? '' : (profile?.id ?? ''),
    })
    void fetchIndisponibilidades()
  }

  async function toggleIndisponibilidade(item: AgenteIndisponibilidade) {
    await fetch(getApiUrl(`/comercial/indisponibilidade/${item.id}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: !item.ativo }),
    })
    setIndisponibilidades(prev => prev.map(d => d.id === item.id ? { ...d, ativo: !d.ativo } : d))
  }

  function abrirNovoAgenteTabela(tabelaId: string) {
    setFormAgenteTabela({
      ...EMPTY_AGENTE_TABELA,
      tabela_preco_id: tabelaId,
      ponto_atendimento_id: pontosAtivos[0]?.id ?? '',
    })
    setShowFormAgenteTabela(true)
  }

  async function salvarAgenteTabela() {
    if (!formAgenteTabela.tabela_preco_id || !formAgenteTabela.agente_registro_id) {
      showMsg('Selecione a tabela e o agente.')
      return
    }

    setSalvandoCatalogo(true)
    const payload = {
      tabela_preco_id: formAgenteTabela.tabela_preco_id,
      agente_registro_id: formAgenteTabela.agente_registro_id,
      ponto_atendimento_id: formAgenteTabela.ponto_atendimento_id || null,
      ativo: formAgenteTabela.ativo,
      metadata: {},
    }
    const rAT = await fetch(getApiUrl('/catalog/agentes-tabelas'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    setSalvandoCatalogo(false)
    if (!rAT.ok) { showMsg('Erro ao vincular agente à tabela'); return }
    setShowFormAgenteTabela(false)
    setFormAgenteTabela(EMPTY_AGENTE_TABELA)
    void fetchCatalogo()
  }

  async function toggleAgenteTabela(item: AgenteTabelaPreco) {
    await fetch(getApiUrl(`/catalog/agentes-tabelas/${item.id}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: !item.ativo }),
    })
    setAgentesTabelaPreco(prev => prev.map(v => v.id === item.id ? { ...v, ativo: !v.ativo } : v))
  }

  async function excluirAgenteTabela(id: string) {
    await fetch(getApiUrl(`/catalog/agentes-tabelas/${id}`), { method: 'DELETE' })
    setAgentesTabelaPreco(prev => prev.filter(v => v.id !== id))
  }

  // ── catalog mutations ────────────────────────────────────────
  function abrirNovoCertificado() { setEditingCertId(null); setFormCert({ ...EMPTY_CERTIFICADO }); setShowFormCert(true) }

  function editarCertificado(c: Certificado) {
    setEditingCertId(c.id)
    setFormCert({
      codigo: c.codigo, status_produto: c.status_produto ?? (c.ativo ? 'Ativo' : 'Inativo'), tipo: c.tipo, descricao: c.descricao, validade: c.validade, validade_meses: c.validade_meses ?? validadeEmMeses(c.validade),
      modelo: c.modelo, categoria: c.categoria, tipo_emissao_padrao: c.tipo_emissao_padrao, periodo_uso: c.periodo_uso ?? null,
      descricao_produto: c.descricao_produto, produto_vinculado_ac: c.produto_vinculado_ac,
      preco_venda: c.preco_venda, valor_custo_ac: c.valor_custo_ac, valor_custo: c.valor_custo,
      agrupador: c.agrupador, hash: c.hash, estoque: c.estoque, ativo: c.ativo,
    })
    setShowFormCert(true)
  }

  async function salvarCertificado() {
    if (!formCert.tipo.trim() || !formCert.validade.trim()) return
    setSalvandoCatalogo(true)
    const validadeNormalizada = formCert.validade.trim()
    const validadeMeses = formCert.validade_meses && formCert.validade_meses > 0
      ? formCert.validade_meses
      : validadeEmMeses(validadeNormalizada)
    const statusProduto = normalizeStatusProduto(formCert.status_produto, formCert.ativo)
    const payload = {
      ...formCert,
      tipo: formCert.tipo.trim(),
      validade: validadeNormalizada,
      validade_meses: validadeMeses ?? null,
      status_produto: statusProduto,
      ativo: /^ativo$/i.test(statusProduto),
    }
    const rC = await fetch(getApiUrl('/catalog/certificados'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingCertId ? { ...payload, id: editingCertId } : payload),
    })
    setSalvandoCatalogo(false)
    if (!rC.ok) { showMsg('Erro ao salvar certificado'); return }
    setShowFormCert(false); setEditingCertId(null); setFormCert({ ...EMPTY_CERTIFICADO }); void fetchCatalogo()
  }

  async function toggleCertificado(certificado: Certificado) {
    await fetch(getApiUrl(`/catalog/certificados/${certificado.id}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: !certificado.ativo }),
    })
    setCertificados(prev => prev.map(c => c.id === certificado.id ? {
      ...c,
      ativo: !c.ativo,
      status_produto: !c.ativo ? 'Ativo' : 'Inativo',
    } : c))
  }

  async function excluirCertificado(id: string) {
    if (!confirm('Excluir este certificado do catálogo? Esta ação não pode ser desfeita.')) return
    const rD = await fetch(getApiUrl(`/catalog/certificados/${id}`), { method: 'DELETE' })
    if (!rD.ok) { showMsg('Erro ao excluir certificado'); return }
    setCertificados(prev => prev.filter(c => c.id !== id))
    setSelectedCertIds(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  async function excluirCertificadosSelecionados() {
    if (!selectedCertIds.size) return
    if (!confirm(`Excluir ${selectedCertIds.size} certificado(s) selecionado(s)? Esta ação não pode ser desfeita.`)) return
    const ids = [...selectedCertIds]
    const rBD = await fetch(getApiUrl('/catalog/certificados'), {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    })
    if (!rBD.ok) { showMsg('Erro ao excluir certificados'); return }
    setCertificados(prev => prev.filter(c => !selectedCertIds.has(c.id)))
    setSelectedCertIds(new Set())
  }

  function lerPlanilha(file: File): Promise<Record<string, string>[]> {
    if (file.size > 5 * 1024 * 1024) return Promise.reject(new Error('Arquivo muito grande. O limite para importação é 5 MB.'))
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer)
          const wb = XLSX.read(data, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const normalize = (h: string) =>
            String(h ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
          const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
          const rows = json.map(r => {
            const out: Record<string, string> = {}
            Object.entries(r).forEach(([k, v]) => { out[normalize(k)] = String(v ?? '') })
            return out
          })
          resolve(rows)
        } catch (err) { reject(err) }
      }
      reader.onerror = reject
      reader.readAsArrayBuffer(file)
    })
  }

  async function importarPlanilha(file: File) {
    setImportando(true)
    try {
      const rows = await lerPlanilha(file)
      if (!rows.length) { showMsg('Planilha sem dados.'); return }
      const parseNum = (v: string) => parseFloat((v ?? '').replace(/[R$\s]/g, '').replace(',', '.')) || 0
      const normalizeValidadeImport = (value: string) => {
        const raw = String(value ?? '').trim()
        if (!raw) return ''
        if (/^\d+$/.test(raw)) return `${raw} meses`
        return raw
      }
      const records = rows.filter(r => Object.values(r).some(v => v)).map(row => ({
        codigo:               row['codigo'] ? parseInt(row['codigo']) : null,
        status_produto:       normalizeStatusProduto(row['status_do_produto'] ?? row['status'] ?? null, true),
        tipo:                 row['nome'] || '',
        descricao:            row['descricao'] || null,
        validade:             normalizeValidadeImport(row['validade_meses'] ?? row['validade_em_meses'] ?? row['validade'] ?? ''),
        validade_meses:       validadeEmMeses(String(row['validade_meses'] ?? row['validade_em_meses'] ?? row['validade'] ?? '')),
        modelo:               row['modelo'] || null,
        categoria:            row['tipo'] || null,
        tipo_emissao_padrao:  row['tipo_emissao'] || row['tipo_de_emissao'] || row['semissao'] || null,
        descricao_produto:    row['descricao_do_produto'] || row['descricao_produto'] || null,
        produto_vinculado_ac: row['produto_vinculado_na_ac'] || row['produto_vinculado_ac'] || row['produto_ac'] || null,
        preco_venda:          parseNum(row['preco_de_venda'] ?? row['preco_venda'] ?? row['preco'] ?? '0'),
        valor_custo_ac:       parseNum(row['valor_custo_ac'] ?? row['custo_ac'] ?? '0'),
        valor_custo:          parseNum(row['valor_custo_ar'] ?? row['valor_custo'] ?? row['custo'] ?? '0'),
        agrupador:            row['agrupador'] || row['agrupador_utilizado_no_e_commerce'] || null,
        hash:                 row['hash_produto'] || row['hash'] || null,
        estoque:              0,
        ativo:                /^ativo$/i.test(normalizeStatusProduto(row['status_do_produto'] ?? row['status'] ?? null, true)),
      }))
      const existResp = await fetch(getApiUrl('/catalog/certificados'))
      const existData = await existResp.json()
      const existMap = new Map(
        ((existData.certificados ?? []) as Certificado[]).filter(e => e.codigo != null).map(e => [e.codigo as number, e.id])
      )
      const toInsert = records.filter(r => r.codigo == null || !existMap.has(r.codigo))
      const toUpdate = records.filter(r => r.codigo != null && existMap.has(r.codigo!))
        .map(r => ({ ...r, id: existMap.get(r.codigo!)! }))
      const allItems = [...toInsert, ...toUpdate]
      const rBI = await fetch(getApiUrl('/catalog/certificados/bulk'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: allItems }),
      })
      if (!rBI.ok) { showMsg('Erro ao importar certificados'); return }
      showMsg(`${records.length} certificado(s) importado(s)/atualizado(s).`, 'ok')
      void fetchCatalogo()
    } finally {
      setImportando(false)
    }
  }

  // ── tabelas de preço mutations ────────────────────────────────
  function abrirNovaTabela() { setEditingTabelaId(null); setFormTabela({ ...EMPTY_TABELA }); setShowFormTabela(true) }
  function editarTabela(t: TabelaPreco) {
    setEditingTabelaId(t.id)
    setFormTabela({
      nome: t.nome, descricao: t.descricao, codigo_voucher: t.codigo_voucher,
      max_desconto_percentual: t.max_desconto_percentual, max_desconto_valor: t.max_desconto_valor,
      comissao_venda_pct: t.comissao_venda_pct, comissao_gestor_pct: t.comissao_gestor_pct,
      comissao_gestor_valor: t.comissao_gestor_valor, ativo: t.ativo,
    })
    setShowFormTabela(true)
  }

  async function criarVinculosBaseDaTabela(tabelaId: string, certificadosFonte?: Certificado[]) {
    const certificadosSelecionados = (certificadosFonte ?? certificados).filter(cert => cert.ativo)
    if (!certificadosSelecionados.length) return { inserted: 0, error: null as string | null }

    const certificadosJaVinculados = new Set(
      tabelaItens
        .filter(item => item.tabela_preco_id === tabelaId)
        .map(item => item.certificado_id)
    )

    const records: NovaTabelaPrecoItem[] = certificadosSelecionados
      .filter(cert => !certificadosJaVinculados.has(cert.id))
      .map(cert => ({
        tabela_preco_id: tabelaId,
        certificado_id: cert.id,
        valor: cert.preco_venda ?? 0,
        valor_custo: cert.valor_custo ?? 0,
        valor_repasse: 0,
        link_safeweb: null,
        ativo: true,
      }))

    if (!records.length) return { inserted: 0, error: null as string | null }

    const rBI2 = await fetch(getApiUrl('/catalog/itens/bulk'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: records }),
    })
    const biData = await rBI2.json().catch(() => null)
    return {
      inserted: records.length,
      error: rBI2.ok ? null : (biData?.error ?? 'Erro ao inserir itens'),
    }
  }

  async function salvarTabela() {
    if (!formTabela.nome.trim()) return
    setSalvandoCatalogo(true)
    const payload = { ...formTabela, nome: formTabela.nome.trim() }
    const rT = await fetch(getApiUrl('/catalog/tabelas'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingTabelaId ? { ...payload, id: editingTabelaId } : payload),
    })
    if (!rT.ok) { setSalvandoCatalogo(false); showMsg('Erro ao salvar tabela'); return }
    const data = await rT.json().then(d => d.tabela).catch(() => null)
    let produtosAutoVinculados = 0
    if (!editingTabelaId && data?.id) {
      const autoLinkRes = await criarVinculosBaseDaTabela(data.id, certificadosAtivos)
      if (autoLinkRes.error) {
        setSalvandoCatalogo(false)
        showMsg('Tabela criada, mas houve erro ao vincular os produtos automaticamente: ' + autoLinkRes.error)
        return
      }
      produtosAutoVinculados = autoLinkRes.inserted
    }
    setSalvandoCatalogo(false)
    setShowFormTabela(false); setEditingTabelaId(null)
    if (!editingTabelaId && data) setSelectedTabelaId(data.id)
    if (!editingTabelaId && data) {
      showMsg(`Tabela criada com ${produtosAutoVinculados} produto(s) vinculados automaticamente. Os preços passam a herdar do cadastro do certificado.`, 'ok')
    }
    void fetchCatalogo()
  }
  async function toggleTabela(t: TabelaPreco) {
    await fetch(getApiUrl(`/catalog/tabelas/${t.id}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: !t.ativo }),
    })
    setTabelasPreco(prev => prev.map(x => x.id === t.id ? { ...x, ativo: !x.ativo } : x))
  }

  async function excluirTabela(tabela: TabelaPreco) {
    if (!confirm(`Excluir a tabela "${tabela.nome}" e todos os vinculos de produtos/participantes relacionados?`)) return
    const rDT = await fetch(getApiUrl(`/catalog/tabelas/${tabela.id}`), { method: 'DELETE' })
    if (!rDT.ok) { showMsg('Erro ao excluir tabela'); return }
    setTabelasPreco(prev => prev.filter(item => item.id !== tabela.id))
    setTabelaItens(prev => prev.filter(item => item.tabela_preco_id !== tabela.id))
    setTabelaParticipantes(prev => prev.filter(item => item.tabela_preco_id !== tabela.id))
    setAgentesTabelaPreco(prev => prev.filter(item => item.tabela_preco_id !== tabela.id))
    if (selectedTabelaId === tabela.id) setSelectedTabelaId(null)
    showMsg('Tabela excluída com sucesso.', 'ok')
  }

  async function vincularCertificadosBaseNaTabela(tabelaId: string) {
    const certificadosSelecionados = certificados
      .filter(cert => selectedBaseCertIds.has(cert.id))
      .filter(cert => cert.ativo)

    if (!certificadosSelecionados.length) {
      showMsg('Selecione pelo menos um certificado do catálogo base.')
      return
    }

    setSalvandoCatalogo(true)
    const result = await criarVinculosBaseDaTabela(tabelaId, certificadosSelecionados)
    setSalvandoCatalogo(false)

    if (result.error) {
      showMsg('Erro ao vincular produtos na tabela: ' + result.error)
      return
    }

    if (!result.inserted) {
      showMsg('Os certificados selecionados já estão vinculados nesta tabela.')
      return
    }

    setSelectedBaseCertIds(new Set())
    showMsg(`${result.inserted} produto(s) vinculado(s) à tabela.`, 'ok')
    void fetchCatalogo()
  }

  async function vincularTodosCertificadosBaseNaTabela(tabelaId: string) {
    setSalvandoCatalogo(true)
    const result = await criarVinculosBaseDaTabela(tabelaId, certificadosAtivos)
    setSalvandoCatalogo(false)

    if (result.error) {
      showMsg('Erro ao repor os produtos do catálogo base: ' + result.error)
      return
    }

    if (!result.inserted) {
      showMsg('Todos os produtos ativos do catálogo base já estão vinculados nesta tabela.')
      return
    }

    showMsg(`${result.inserted} produto(s) foram recolocados automaticamente nesta tabela.`, 'ok')
    void fetchCatalogo()
  }

  function scrollToSection(ref: { current: HTMLDivElement | null }) {
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  function abrirEdicaoPrecosTabela(tabelaId: string) {
    setSelectedTabelaId(tabelaId)
    scrollToSection(tabelaProdutosSectionRef)
  }

  function abrirAssociacaoAgenteTabela(tabelaId: string) {
    setSelectedTabelaId(tabelaId)
    abrirNovoAgenteTabela(tabelaId)
    scrollToSection(tabelaAgentesSectionRef)
  }

  function abrirProdutosDaTabela(tabelaId: string) {
    setSelectedTabelaId(tabelaId)
    setShowFormV(false)
    setTab('tabelas')
    scrollToSection(tabelaProdutosSectionRef)
  }

  async function salvarPricingMatrixRule(tabelaId: string) {
    if (!pricingMatrixForm.tabela_base_id) {
      showMsg('Selecione a tabela matriz para salvar a regra.')
      return
    }
    if (pricingMatrixForm.tabela_base_id === tabelaId) {
      showMsg('A tabela matriz precisa ser diferente da tabela atual.')
      return
    }

    const nextRules = [
      ...pricingMatrixRules.filter(rule => rule.tabela_preco_id !== tabelaId),
      {
        tabela_preco_id: tabelaId,
        tabela_base_id: pricingMatrixForm.tabela_base_id,
        ajuste_percentual: pricingMatrixForm.ajuste_percentual,
      },
    ]

    setSalvandoCatalogo(true)
    const rDel = await fetch(getApiUrl('/app-settings'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'pricing_matrix_rules', value: { rules: nextRules } }),
    })
    setSalvandoCatalogo(false)

    if (!rDel.ok) {
      showMsg('Erro ao remover regra da matriz')
      return
    }

    setPricingMatrixRules(nextRules)
    showMsg('Regra de preço em relação à matriz salva com sucesso.', 'ok')
  }

  async function aplicarPricingMatrixRule(tabelaId: string) {
    if (!pricingMatrixForm.tabela_base_id) {
      showMsg('Selecione a tabela matriz antes de aplicar a regra.')
      return
    }
    if (pricingMatrixForm.tabela_base_id === tabelaId) {
      showMsg('A tabela matriz precisa ser diferente da tabela atual.')
      return
    }

    const itensBase = tabelaItens.filter(item => item.tabela_preco_id === pricingMatrixForm.tabela_base_id)
    const itensDestino = tabelaItens.filter(item => item.tabela_preco_id === tabelaId)
    if (!itensBase.length) {
      showMsg('A tabela matriz escolhida não possui produtos para servir de base.')
      return
    }
    if (!itensDestino.length) {
      showMsg('A tabela atual ainda não possui produtos vinculados para receber o reajuste.')
      return
    }

    const baseByCertificado = new Map(itensBase.map(item => [item.certificado_id, item]))
    const percentual = Number(pricingMatrixForm.ajuste_percentual) || 0
    const fator = 1 + percentual / 100
    const updates = itensDestino
      .map(item => {
        const itemBase = baseByCertificado.get(item.certificado_id)
        if (!itemBase) return null
        const novoValor = Math.round((Number(itemBase.valor) * fator + Number.EPSILON) * 100) / 100
        return {
          id: item.id,
          valor: novoValor,
        }
      })
      .filter((item): item is { id: string; valor: number } => item !== null)

    if (!updates.length) {
      showMsg('Nenhum produto da tabela atual encontrou correspondência na tabela matriz.')
      return
    }

    setSalvandoCatalogo(true)
    const newRules = [
      ...pricingMatrixRules.filter(rule => rule.tabela_preco_id !== tabelaId),
      { tabela_preco_id: tabelaId, tabela_base_id: pricingMatrixForm.tabela_base_id, ajuste_percentual: percentual },
    ]
    const [saveRuleRes, updatePricesRes] = await Promise.all([
      fetch(getApiUrl('/app-settings'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'pricing_matrix_rules', value: { rules: newRules } }),
      }),
      fetch(getApiUrl('/catalog/itens/bulk-prices'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      }),
    ])
    setSalvandoCatalogo(false)

    if (!saveRuleRes.ok || !updatePricesRes.ok) {
      showMsg('Erro ao aplicar a regra da matriz de preços.')
      return
    }

    setPricingMatrixRules(prev => [
      ...prev.filter(rule => rule.tabela_preco_id !== tabelaId),
      {
        tabela_preco_id: tabelaId,
        tabela_base_id: pricingMatrixForm.tabela_base_id,
        ajuste_percentual: percentual,
      },
    ])
    showMsg(`${updates.length} produto(s) atualizados com base na tabela matriz.`, 'ok')
    void fetchCatalogo()
  }

  // tabela itens
  function abrirNovoItem(tabelaId: string) {
    const certificadoId = certificadosAtivos[0]?.id ?? ''
    const certificado = certificadoById.get(certificadoId)
    setEditingItemId(null)
    setFormItem({
      ...EMPTY_ITEM,
      tabela_preco_id: tabelaId,
      certificado_id: certificadoId,
      valor: certificado?.preco_venda ?? 0,
    })
    setShowFormItem(true)
  }
  function editarItem(item: TabelaPrecoItem) {
    const certificado = certificadoById.get(item.certificado_id)
    setEditingItemId(item.id)
    setFormItem({
      tabela_preco_id: item.tabela_preco_id, certificado_id: item.certificado_id,
      valor: certificado?.preco_venda ?? item.valor, valor_custo: item.valor_custo, valor_repasse: item.valor_repasse,
      link_safeweb: item.link_safeweb, ativo: item.ativo,
    })
    setShowFormItem(true)
  }
  async function salvarItem() {
    if (!formItem.certificado_id) return
    setSalvandoCatalogo(true)
    const rI = await fetch(getApiUrl('/catalog/itens'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingItemId ? { ...formItem, id: editingItemId } : formItem),
    })
    setSalvandoCatalogo(false)
    if (!rI.ok) { showMsg('Erro ao salvar item'); return }
    setShowFormItem(false); setEditingItemId(null); void fetchCatalogo()
  }
  async function excluirItem(id: string) {
    if (!confirm('Remover este item da tabela?')) return
    await fetch(getApiUrl(`/catalog/itens/${id}`), { method: 'DELETE' })
    setTabelaItens(prev => prev.filter(x => x.id !== id))
    setSelectedItemIds(prev => { const s = new Set(prev); s.delete(id); return s })
  }

  async function excluirItensSelecionados() {
    if (!selectedItemIds.size) return
    if (!confirm(`Remover ${selectedItemIds.size} produto(s) selecionado(s) da tabela?`)) return
    const ids = [...selectedItemIds]
    const rBI3 = await fetch(getApiUrl('/catalog/itens'), {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    })
    if (!rBI3.ok) { showMsg('Erro ao remover itens'); return }
    setTabelaItens(prev => prev.filter(x => !selectedItemIds.has(x.id)))
    setSelectedItemIds(new Set())
  }
  async function toggleItem(item: TabelaPrecoItem) {
    await fetch(getApiUrl(`/catalog/itens/${item.id}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: !item.ativo }),
    })
    setTabelaItens(prev => prev.map(x => x.id === item.id ? { ...x, ativo: !x.ativo } : x))
  }

  async function importarItensTabelaFile(file: File, tabelaId: string) {
    setImportando(true)
    try {
      const rows = await lerPlanilha(file)
      if (!rows.length) { showMsg('Planilha sem dados.'); return }
      const parseVal = (v: string) => parseFloat((v ?? '0').replace(/[R$\s]/g, '').replace(',', '.')) || 0
      const normalizeText = (value: string) =>
        String(value ?? '')
          .trim()
          .toUpperCase()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim()
      const normalizeCode = (value: string) =>
        String(value ?? '')
          .trim()
          .toUpperCase()
          .replace(/\s+/g, '')
      const firstFilled = (row: Record<string, string>, keys: string[]) =>
        keys.map(key => row[key]).find(value => String(value ?? '').trim().length > 0) ?? ''
      const certsAllResp = await fetch(getApiUrl('/catalog/certificados'))
      const certsAll = await certsAllResp.json().then(d => ({ data: (d.certificados ?? []) as Certificado[] }))
      const certById = new Map((certsAll.data ?? []).map(c => [String(c.id), c.id as string]))
      const certByHash = new Map(
        (certsAll.data ?? [])
          .filter(c => c.hash)
          .map(c => [String(c.hash).trim(), c.id as string])
      )
      const certByCode = new Map<string, Array<{ id: string; tipo: string; validade: string | null; categoria: string | null; descricao_produto: string | null }>>()
      for (const cert of (certsAll.data ?? [])) {
        const codigoNormalizado = normalizeCode(String(cert.codigo ?? ''))
        if (!codigoNormalizado) continue
        const arr = certByCode.get(codigoNormalizado) ?? []
        arr.push({
          id: cert.id as string,
          tipo: cert.tipo as string,
          validade: cert.validade as string | null,
          categoria: cert.categoria as string | null,
          descricao_produto: cert.descricao_produto as string | null,
        })
        certByCode.set(codigoNormalizado, arr)
      }
      const certByName = new Map((certsAll.data ?? []).map(c => [normalizeText(c.tipo as string), c.id as string]))
      const certByDescricaoProduto = new Map(
        (certsAll.data ?? [])
          .filter(c => c.descricao_produto)
          .map(c => [normalizeText(c.descricao_produto as string), c.id as string])
      )
      const unresolvedRows: number[] = []
      const records = rows.filter(r => Object.values(r).some(v => v)).map(row => {
        const uuidRaw = firstFilled(row, ['certificado_id', 'uuid', 'id', 'produto_id'])
        const codigoRaw = firstFilled(row, ['codigo', 'cod', 'codigo_voucher'])
        const nomeRaw = firstFilled(row, ['nome', 'produto', 'descricao'])
        const descricaoProdutoRaw = firstFilled(row, ['descricao_produto', 'produto_ac', 'produto_vinculado_ac', 'titulo'])
        const validadeRaw = firstFilled(row, ['validade', 'meses', 'prazo'])
        const categoriaRaw = firstFilled(row, ['categoria', 'tipo'])
        let certId = ''

        if (uuidRaw && certById.has(uuidRaw.trim())) {
          certId = certById.get(uuidRaw.trim()) ?? ''
        }
        if (!certId && uuidRaw && certByHash.has(uuidRaw.trim())) {
          certId = certByHash.get(uuidRaw.trim()) ?? ''
        }

        if (!certId && codigoRaw) {
          const codigoNormalizado = normalizeCode(codigoRaw)
          const candidatos = certByCode.get(codigoNormalizado) ?? []
          if (candidatos.length === 1) {
            certId = candidatos[0].id
          } else if (candidatos.length > 1) {
            const nomeNormalizado = normalizeText(nomeRaw)
            const descricaoNormalizada = normalizeText(descricaoProdutoRaw)
            const validadeNormalizada = normalizeText(validadeRaw)
            const categoriaNormalizada = normalizeText(categoriaRaw)
            const melhorCandidato = candidatos.find(cert =>
              !!descricaoNormalizada && normalizeText(cert.descricao_produto ?? '') === descricaoNormalizada
            ) ?? candidatos.find(cert =>
              !!nomeNormalizado && normalizeText(cert.tipo) === nomeNormalizado
            ) ?? candidatos.find(cert => {
              const tipoOk = nomeNormalizado && normalizeText(cert.tipo).includes(nomeNormalizado)
              const descricaoOk = descricaoNormalizada && normalizeText(cert.descricao_produto ?? '').includes(descricaoNormalizada)
              const validadeOk = validadeNormalizada && normalizeText(cert.validade ?? '').includes(validadeNormalizada)
              const categoriaOk = categoriaNormalizada && normalizeText(cert.categoria ?? '').includes(categoriaNormalizada)
              return !!descricaoOk || !!tipoOk || (!!validadeOk && !!categoriaOk)
            })
            certId = melhorCandidato?.id ?? ''
          }
        }

        if (!certId && descricaoProdutoRaw) {
          certId = certByDescricaoProduto.get(normalizeText(descricaoProdutoRaw)) ?? ''
        }

        if (!certId && nomeRaw) {
          certId = certByName.get(normalizeText(nomeRaw)) ?? ''
        }

        if (!certId) {
          unresolvedRows.push(unresolvedRows.length + 1)
          return null
        }
        return {
          tabela_preco_id: tabelaId,
          certificado_id:  certId,
          valor:           parseVal(row['preco_venda'] ?? row['valor'] ?? row['preco'] ?? '0'),
          valor_custo:     parseVal(row['valor_custo'] ?? row['custo'] ?? '0'),
          valor_repasse:   parseVal(row['valor_repasse'] ?? row['repasse'] ?? '0'),
          link_safeweb:    (row['link_safeweb'] ?? row['link'] ?? '') || null,
          ativo:           true,
        }
      }).filter((r): r is NovaTabelaPrecoItem => r !== null)
      if (!records.length) {
        const totalCerts = certsAll.data.length
        if (totalCerts === 0) {
          showMsg('Nenhum certificado cadastrado no catálogo. Importe os certificados primeiro na aba "Certificados", depois volte para importar esta tabela.')
        } else {
          showMsg(`Nenhum produto da planilha correspondeu aos ${totalCerts} certificados cadastrados. Verifique as colunas: Código (ou Nome), Preço Venda, Valor Custo, Valor Repasse.`)
        }
        return
      }
      const existResp2 = await fetch(getApiUrl(`/catalog/itens`))
      const existData2 = await existResp2.json()
      const existMap = new Map(
        ((existData2.itens ?? []) as { id: string; certificado_id: string; tabela_preco_id: string }[])
          .filter(e => e.tabela_preco_id === tabelaId)
          .map(e => [e.certificado_id, e.id])
      )
      const allItems2 = records.map(r => existMap.has(r.certificado_id) ? { ...r, id: existMap.get(r.certificado_id)! } : r)
      const rBulk = await fetch(getApiUrl('/catalog/itens/bulk'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: allItems2 }),
      })
      if (!rBulk.ok) { showMsg('Erro ao importar itens da tabela'); return }
      if (unresolvedRows.length > 0) {
        showMsg(`${records.length} produto(s) importado(s)/atualizado(s). ${unresolvedRows.length} linha(s) ficaram sem vínculo automático e precisam de conferência.` , 'ok')
      } else {
        showMsg(`${records.length} produto(s) importado(s)/atualizado(s) na tabela.`, 'ok')
      }
      void fetchCatalogo()
    } finally {
      setImportando(false)
    }
  }

  // ── importar relatório Safeweb — batimento mensal ────────────
  async function importarRelatorioSafeweb(file: File) {
    setImportandoSafeweb(true)
    setResultSafeweb(null)
    try {
      const rows = await lerPlanilha(file)
      if (!rows.length) { showMsg('Planilha sem dados.'); return }
      const parseNum = (v: string) => parseFloat((v ?? '').replace(/[R$\s.]/g, '').replace(',', '.')) || 0
      const cleanDoc = (v: string) => (v ?? '').replace(/\D/g, '')
      // converte DD/MM/YYYY ou DD/MM/YYYY HH:MM:SS → YYYY-MM-DD
      const parseDate = (v: string): string | null => {
        const s = (v ?? '').trim()
        if (!s) return null
        const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
        if (m) return `${m[3]}-${m[2]}-${m[1]}`
        // já está em ISO ou outro formato que o postgres aceita
        return s.split(' ')[0] || null
      }
      const BATCH = 100

      // 1. upsert clientes
      const clientePayloads = rows.map(r => {
        const doc = cleanDoc(r['documento'] ?? r['cnpj_cpf'] ?? '')
        const nome = (r['nome'] ?? r['nome_razao_social'] ?? '').trim()
        if (!doc || !nome) return null
        const tipo: TipoCliente = doc.length === 11 ? 'pessoa_fisica' : 'pessoa_juridica'
        return {
          cpf_cnpj:     doc,
          nome,
          tipo_cliente: tipo,
          tipo_cadastro: 'cliente' as const,
          email:        (r['e_mail_do_titular'] ?? r['email_do_titular'] ?? r['email'] ?? '').trim() || null,
          telefone:     (r['telefone_do_titular'] ?? r['telefone'] ?? '').trim() || null,
          iss_retido:   false,
          status:       'ativo' as const,
          metadata:     {} as Record<string, unknown>,
        }
      }).filter((x): x is NonNullable<typeof x> => x !== null)

      const clientesUniq = [...new Map(clientePayloads.map(c => [c.cpf_cnpj, c])).values()]
      const rBCI = await fetch(getApiUrl('/comercial/clientes/batch-import'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payloads: clientesUniq }),
      })
      if (!rBCI.ok) { showMsg('Erro ao importar clientes'); return }

      // 2. busca IDs de clientes para vincular às vendas
      const allDocs = clientesUniq.map(c => c.cpf_cnpj)
      const cadastrosData = await getAivenCommercialClientesByDocs(allDocs)
      const idByDoc = new Map(cadastrosData.map(c => [c.cpf_cnpj, c.id]))

      // 3. monta payloads de venda COM validado_safeweb = true
      const vendasPayloads = rows.map(r => {
        const protocolo = (r['protocolo'] ?? r['numero_protocolo'] ?? '').trim()
        if (!protocolo) return null
        const doc = cleanDoc(r['documento'] ?? r['cnpj_cpf'] ?? '')
        return {
          protocolo_numero:       protocolo,
          cadastro_base_id:       idByDoc.get(doc) ?? null,
          tipo_produto:           (r['produto'] ?? '').trim() || null,
          tipo_emissao:           (r['tipo_de_emissao_realizada'] ?? r['tipo_emissao'] ?? '').trim() || null,
          valor_venda:            parseNum(r['valor_do_boleto'] ?? r['valor_boleto'] ?? r['valor'] ?? '0'),
          status_venda:           'emitido' as StatusVendaCertificado,
          pago:                   true,
          validado_safeweb:       true,
          data_vencimento:        parseDate(r['data_fim_validade'] ?? r['data_vencimento'] ?? ''),
          data_inicio_validade:   parseDate(r['data_inicio_validade'] ?? r['data_inicio'] ?? ''),
          numero_serie:           (r['numero_de_serie'] ?? r['numero_serie'] ?? '').trim() || null,
          voucher_codigo:         (r['vouchercodigo'] ?? r['voucher_codigo'] ?? r['vouchercod'] ?? '').trim() || null,
          voucher_percentual:     parseNum(r['voucherpercentual'] ?? r['voucher_percentual'] ?? '0') || null,
          voucher_valor:          parseNum(r['vouchervalor'] ?? r['voucher_valor'] ?? '0') || null,
          nome_ar:                (r['nome_da_autoridade_de_registro'] ?? r['nome_ar'] ?? '').trim() || null,
          nome_local_atendimento: (r['nome_do_local_de_atendimento'] ?? r['nome_local'] ?? '').trim() || null,
          status_certificado:     (r['status_do_certificado'] ?? r['status_certificado'] ?? '').trim() || null,
          nome_parceiro_safeweb:  (r['nome_do_parceiro'] ?? r['nome_parceiro'] ?? '').trim() || null,
          observacoes:            (r['observacao'] ?? r['observacoes'] ?? '').trim() || null,
        }
      }).filter((x): x is NonNullable<typeof x> => x !== null)

      // 4. separa registros que já existem no CRM dos que são só da Safeweb
      const protocolos = vendasPayloads.map(v => v.protocolo_numero)
      const existResp3 = await fetch(getApiUrl('/comercial/vendas/protocolos'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ protocolos }),
      })
      const existData3 = await existResp3.json()
      const existSet = new Set((existData3.protocolos ?? []) as string[])
      const paraAtualizar = vendasPayloads.filter(v =>  existSet.has(v.protocolo_numero))
      const novos         = vendasPayloads.filter(v => !existSet.has(v.protocolo_numero)).length

      // 5. atualiza apenas os que já existem (INSERT violaria NOT NULL de vendedor_id, etc.)
      for (let i = 0; i < paraAtualizar.length; i += BATCH) {
        const batch = paraAtualizar.slice(i, i + BATCH)
        const rBVU = await fetch(getApiUrl('/comercial/vendas/batch-update'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: batch }),
        })
        if (!rBVU.ok) { showMsg('Erro ao importar vendas'); return }
      }

      // 6. conta divergentes: vendas emitidas sem validado_safeweb
      const divResp = await fetch(getApiUrl('/comercial/vendas/count-sem-validacao'))
      const divData = await divResp.json()
      const divergentes = divData.count ?? 0

      setResultSafeweb({ clientes: clientesUniq.length, novos, atualizados: paraAtualizar.length, divergentes })
    } finally {
      setImportandoSafeweb(false)
    }
  }

  // ── importar clientes (formato sistema antigo) ────────────────
  async function importarClientes(file: File) {
    setImportandoClientes(true)
    setResultClientes(null)
    try {
      const rows = await lerPlanilha(file)
      if (!rows.length) { showMsg('Planilha sem dados.'); return }
      const cleanDoc = (v: string) => (v ?? '').replace(/\D/g, '')

      const payloads = rows.map(r => {
        const doc = cleanDoc(r['cnpj_cpf'] ?? r['cpf_cnpj'] ?? r['documento'] ?? '')
        const nome = r['nome_razao_social'] ?? r['nome'] ?? ''
        if (!doc || !nome) return null
        const tipo: TipoCliente = doc.length === 11 ? 'pessoa_fisica' : 'pessoa_juridica'
        const ddd = (r['ddd'] ?? '').replace(/\D/g, '')
        const tel = (r['telefone'] ?? '').replace(/\D/g, '')
        const telefone = ddd && tel ? `(${ddd}) ${tel}` : (tel || null)
        return {
          cpf_cnpj: doc,
          nome,
          nome_fantasia:       (r['nome_fantasia'] ?? '').trim() || null,
          tipo_cliente:        tipo,
          tipo_cadastro:       'cliente' as const,
          email:               (r['e_mail'] ?? r['email'] ?? '').trim() || null,
          telefone,
          cep:                 (r['cep'] ?? '').replace(/\D/g, '') || null,
          logradouro:          (r['endereco'] ?? r['logradouro'] ?? '').trim() || null,
          numero:              (r['numero'] ?? '').trim() || null,
          complemento:         (r['complemento'] ?? '').trim() || null,
          bairro:              (r['bairro'] ?? '').trim() || null,
          cidade:              (r['cidade'] ?? '').trim() || null,
          uf:                  (r['uf'] ?? '').trim().toUpperCase() || null,
          inscricao_estadual:  (r['ie'] ?? r['inscricao_estadual'] ?? '').trim() || null,
          inscricao_municipal: (r['im'] ?? r['inscricao_municipal'] ?? '').trim() || null,
          iss_retido: false,
          status: 'ativo' as const,
          metadata: { contador: (r['contador'] ?? '').trim() || null } as Record<string, unknown>,
        }
      }).filter((x): x is NonNullable<typeof x> => x !== null)

      // check existing to count inserts vs updates
      const docs = payloads.map(p => p.cpf_cnpj)
      const existRespL = await fetch(getApiUrl('/comercial/clientes/batch-import'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payloads, dryRunCheckOnly: true }),
      })
      const existDataL = await existRespL.json()
      const existSet = new Set((existDataL.existing ?? []) as string[])
      const inseridos = payloads.filter(p => !existSet.has(p.cpf_cnpj)).length
      const atualizados = payloads.filter(p => existSet.has(p.cpf_cnpj)).length

      const rLeads = await fetch(getApiUrl('/comercial/clientes/batch-import'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payloads }),
      })
      if (!rLeads.ok) { showMsg('Erro ao importar clientes'); return }

      setResultClientes({ inseridos, atualizados })
    } finally {
      setImportandoClientes(false)
    }
  }

  async function carregarSafewebVendas() {
    setLoadingSafewebVendas(true)
    const data = await getAivenCommercialSafewebVendas()
    setSafewebVendas(data as VendaRow[])
    setLoadingSafewebVendas(false)
  }

  // tabela participantes
  function abrirNovoParticipante(tabelaId: string) {
    setFormParticipante({ ...EMPTY_PARTICIPANTE, tabela_preco_id: tabelaId })
    setShowFormParticipante(true)
  }
  async function salvarParticipante() {
    if (!formParticipante.tabela_preco_id) return
    const payload = {
      ...formParticipante,
      parceiro_id:   formParticipante.tipo_participante === 'parceiro'      ? formParticipante.parceiro_id   : null,
      tipo_parceiro: formParticipante.tipo_participante === 'tipo_parceiro' ? formParticipante.tipo_parceiro : null,
      perfil:        formParticipante.tipo_participante === 'perfil'         ? formParticipante.perfil         : null,
    }
    setSalvandoCatalogo(true)
    const rPart = await fetch(getApiUrl('/catalog/participantes'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    setSalvandoCatalogo(false)
    if (!rPart.ok) { showMsg('Erro ao salvar participante'); return }
    setShowFormParticipante(false); void fetchCatalogo()
  }
  async function excluirParticipante(id: string) {
    await fetch(getApiUrl(`/catalog/participantes/${id}`), { method: 'DELETE' })
    setTabelaParticipantes(prev => prev.filter(x => x.id !== id))
  }

  function abrirNovaComissao() { setEditingComissaoId(null); setFormComissao({ ...EMPTY_COMISSAO, ordem: comissoes.length + 1 }); setShowFormComissao(true) }

  function editarComissao(comissao: FaixaComissao) {
    setEditingComissaoId(comissao.id)
    setFormComissao({ faixa: comissao.faixa, min_emissoes: comissao.min_emissoes, max_emissoes: comissao.max_emissoes, percentual: comissao.percentual, valor_exemplo: comissao.valor_exemplo, ordem: comissao.ordem, ativo: comissao.ativo })
    setShowFormComissao(true)
  }

  async function salvarComissao() {
    if (!formComissao.faixa.trim() || formComissao.percentual < 0) return
    setSalvandoCatalogo(true)
    const payload = { ...formComissao, faixa: formComissao.faixa.trim() }
    const rCom = await fetch(getApiUrl('/catalog/faixas-comissao'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingComissaoId ? { ...payload, id: editingComissaoId } : payload),
    })
    setSalvandoCatalogo(false)
    if (!rCom.ok) { showMsg('Erro ao salvar faixa de comissão'); return }
    setShowFormComissao(false); setEditingComissaoId(null); setFormComissao({ ...EMPTY_COMISSAO }); void fetchCatalogo()
  }

  async function toggleComissao(comissao: FaixaComissao) {
    await fetch(getApiUrl(`/catalog/faixas-comissao/${comissao.id}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: !comissao.ativo }),
    })
    setComissoes(prev => prev.map(c => c.id === comissao.id ? { ...c, ativo: !c.ativo } : c))
  }

  function abrirNovoPagamento() {
    setEditingPagamentoId(null)
    setFormPagamento({ ...EMPTY_PAGAMENTO })
    setShowFormPagamento(true)
  }

  function editarPagamento(pagamento: FormaPagamentoV2) {
    setEditingPagamentoId(pagamento.id)
    setFormPagamento({
      nome: pagamento.nome,
      codigo: pagamento.codigo ?? '',
      gateway: pagamento.gateway ?? '',
      ativo: pagamento.ativo,
    })
    setShowFormPagamento(true)
  }

  async function salvarPagamento() {
    if (!formPagamento.nome.trim()) return
    setSalvandoCatalogo(true)
    const payload = {
      nome: formPagamento.nome.trim(),
      codigo: formPagamento.codigo.trim() || null,
      gateway: formPagamento.gateway.trim() || null,
      ativo: formPagamento.ativo,
    }
    const rPag = await fetch(getApiUrl('/catalog/formas-pagamento'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingPagamentoId ? { ...payload, id: editingPagamentoId } : payload),
    })
    setSalvandoCatalogo(false)
    if (!rPag.ok) { showMsg('Erro ao salvar forma de pagamento'); return }
    setShowFormPagamento(false); setEditingPagamentoId(null); setFormPagamento({ ...EMPTY_PAGAMENTO }); void fetchCatalogo()
  }

  async function togglePagamento(pagamento: FormaPagamentoV2) {
    await fetch(getApiUrl(`/catalog/formas-pagamento/${pagamento.id}`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: !pagamento.ativo }),
    })
    setPagamentos(prev => prev.map(p => p.id === pagamento.id ? { ...p, ativo: !p.ativo } : p))
  }

  function openFeatureNotice(title: string, description: string, nextStep?: string | null) {
    setFeatureNotice({ title, description, nextStep: nextStep ?? null })
  }

  function resolveMarketplaceLink(link?: string | null) {
    return link?.trim() || null
  }

  async function copiarMarketplaceLink(link?: string | null, contexto = 'Link do marketplace') {
    const finalLink = resolveMarketplaceLink(link)
    if (!finalLink) {
      openFeatureNotice(
        'Marketplace próprio pendente',
        'Este produto ainda não possui link de compra configurado no seu sistema. O exemplo de marketplace externo foi removido para não depender de plataforma de terceiros.',
        'Próximo passo: cadastrar a URL do seu marketplace próprio em Configurações ou por produto/tabela.'
      )
      return
    }
    await navigator.clipboard.writeText(finalLink)
    showMsg(`${contexto} copiado!`, 'ok')
  }

  function abrirMarketplaceLink(link?: string | null) {
    const finalLink = resolveMarketplaceLink(link)
    if (!finalLink) {
      openFeatureNotice(
        'Marketplace próprio pendente',
        'Ainda não existe URL de compra configurada para este produto no seu sistema.',
        'Quando o seu marketplace próprio estiver pronto, este botão abrirá o link correto.'
      )
      return
    }
    try {
      const parsed = new URL(finalLink)
      if (!['http:', 'https:'].includes(parsed.protocol)) return
    } catch {
      return
    }
    window.open(finalLink, '_blank', 'noopener,noreferrer')
  }

  async function abrirFaturaVenda(venda: VendaRow) {
    setLoadingVendaFinanceiro(false)
    setVendaFinanceiroModal({
      venda,
      lancamentos: [] as LancamentoV2[],
      documentos: [] as DocumentoFinanceiro[],
    })
  }

  async function abrirNfseVenda(venda: VendaRow) {
    setLoadingVendaNfse(true)
    setVendaNfseModal(null)

    const [nfseResp, configuracaoFiscal] = await Promise.all([
      fetch(getApiUrl(`/nfse/venda/${venda.id}`)).then(r => r.json()).catch(() => ({ notas: [] })),
      fetchConfiguracaoFiscalAtiva(),
    ])

    const data = nfseResp.notas ?? []
    setLoadingVendaNfse(false)
    setNfseConfiguracaoAtiva(configuracaoFiscal)

    if (false) {
      openFeatureNotice(
        'Visualização de NFS-e',
        'NFS-e não disponível neste ambiente.',
        null
      )
      return
    }

    setVendaNfseModal({
      venda,
      notas: (data ?? []) as NfseEmitida[],
    })
  }

  function resolveProdutoResumoNfse(venda: VendaRow) {
    const item = venda.tabela_preco_item_id
      ? tabelaItens.find(entry => entry.id === venda.tabela_preco_item_id)
      : null
    const cert = venda.certificado_id
      ? certificados.find(entry => entry.id === venda.certificado_id)
      : null

    return {
      tipo: cert?.tipo?.trim()
        || venda.tipo_produto?.trim()
        || item?.link_safeweb?.trim()
        || 'certificado digital',
      modelo: cert?.modelo?.trim() || null,
      validade: cert?.validade?.trim() || null,
      tipoEmissao: venda.tipo_emissao?.trim() || cert?.tipo_emissao_padrao?.trim() || null,
    }
  }

  function buildVendaTomadorSnapshot(venda: VendaRow) {
    const endereco = [
      venda.logradouro?.trim(),
      venda.numero?.trim(),
      venda.bairro?.trim(),
      venda.cep?.trim() ? `CEP ${venda.cep.trim()}` : '',
    ].filter(Boolean).join(', ')

    return {
      nome: venda.nome_faturamento?.trim() || venda.cadastros_base?.nome?.trim() || '',
      documento: venda.documento_faturamento?.trim() || venda.cadastros_base?.cpf_cnpj?.trim() || '',
      inscricao_municipal: venda.inscricao_municipal?.trim() || '',
      telefone: venda.telefone_faturamento?.trim() || '',
      email: venda.email_faturamento?.trim() || '',
      endereco,
      complemento: venda.complemento?.trim() || '',
      municipio: [venda.cidade?.trim(), venda.uf?.trim()].filter(Boolean).join(' - '),
    }
  }

  function buildEmitenteSnapshot(config: Partial<NfseConfiguracao> | null | undefined) {
    const payload = (config?.payload_reforma_tributaria ?? {}) as Record<string, unknown>
    const nomeEmitente = String(payload.razao_social ?? payload.nome_emitente ?? '').trim()
      || agencyConfig.nome_agencia
      || config?.identificador
      || 'Emitente nao configurado'
    const municipioEmitente = String(payload.municipio ?? '').trim()
      || config?.municipio_nome?.trim()
      || agencyConfig.cidade
      || ''
    return {
      nome: nomeEmitente,
      documento: config?.cnpj_emitente?.trim() || '',
      inscricao_municipal: config?.inscricao_municipal?.trim() || '',
      telefone: String(payload.telefone ?? agencyConfig.telefone ?? ''),
      email: String(payload.email ?? ''),
      endereco: String(payload.endereco ?? ''),
      complemento: String(payload.complemento ?? ''),
      municipio: municipioEmitente,
    }
  }

  function validarCamposObrigatoriosNfse(venda: VendaRow, configuracaoFiscal: NfseConfiguracao): NfseValidationResult {
    const payloadFiscal = (configuracaoFiscal.payload_reforma_tributaria ?? {}) as Record<string, unknown>
    const adapterMunicipal = String(payloadFiscal.municipal_adapter ?? '').trim()
    const emitente = buildEmitenteSnapshot(configuracaoFiscal)
    const tomador = buildVendaTomadorSnapshot(venda)
    const produtoResumo = resolveProdutoResumoNfse(venda)
    const faltantes: string[] = []

    const registrarFalta = (
      label: string,
      value: unknown,
      options?: { invalidValues?: string[] }
    ) => {
      const normalized = String(value ?? '').trim()
      const invalidValues = (options?.invalidValues ?? []).map(item => item.trim().toLowerCase())
      if (!normalized || invalidValues.includes(normalized.toLowerCase())) {
        faltantes.push(label)
      }
    }

    registrarFalta('CNPJ do emitente', configuracaoFiscal.cnpj_emitente)
    registrarFalta('nome ou razão social do emitente', emitente.nome, { invalidValues: ['emitente nao configurado'] })
    registrarFalta('inscrição municipal do emitente', configuracaoFiscal.inscricao_municipal)
    registrarFalta('endereço do emitente', emitente.endereco)
    registrarFalta('município do emitente', emitente.municipio)
    registrarFalta('telefone do emitente', emitente.telefone)
    registrarFalta('e-mail do emitente', emitente.email)
    registrarFalta('nome do tomador', tomador.nome)
    registrarFalta('CPF/CNPJ do tomador', tomador.documento)
    registrarFalta('e-mail do tomador', tomador.email)
    registrarFalta('telefone do tomador', tomador.telefone)
    registrarFalta('logradouro do tomador', venda.logradouro)
    registrarFalta('número do tomador', venda.numero)
    registrarFalta('bairro do tomador', venda.bairro)
    registrarFalta('cidade do tomador', venda.cidade)
    registrarFalta('UF do tomador', venda.uf)
    registrarFalta('CEP do tomador', venda.cep)
    registrarFalta('tipo de emissão da venda', produtoResumo.tipoEmissao)
    registrarFalta('código do serviço', configuracaoFiscal.codigo_servico_municipio)

    if ((venda.valor_venda ?? 0) <= 0) {
      faltantes.push('valor do serviço da venda')
    }

    if (configuracaoFiscal.provedor === 'gissonline') {
      registrarFalta('usuário da prefeitura', configuracaoFiscal.usuario_prefeitura)
      registrarFalta('senha da prefeitura', configuracaoFiscal.senha_prefeitura)
      registrarFalta('certificado A1', configuracaoFiscal.certificado_pfx_path)
      registrarFalta('senha do certificado', configuracaoFiscal.certificado_senha)
    }

    if (configuracaoFiscal.provedor === 'municipal' && adapterMunicipal === 'nota_joseense') {
      registrarFalta('código IBGE do município', configuracaoFiscal.municipio_codigo_ibge)
      registrarFalta('CNAE do emitente', configuracaoFiscal.cnae)
      registrarFalta('certificado A1', configuracaoFiscal.certificado_pfx_path)
      registrarFalta('senha do certificado', configuracaoFiscal.certificado_senha)
    }

    if (!faltantes.length) {
      return { ok: true }
    }

    return {
      ok: false,
      message: 'Emissão bloqueada. Corrija os dados obrigatórios antes de emitir a NFS-e.',
      detail: `A nota não foi enviada porque ainda faltam estes dados: ${faltantes.join(', ')}.`,
      nextStep: `Preencha os campos pendentes da empresa, do tomador ou da configuração fiscal: ${faltantes.join(', ')}.`,
    }
  }

  function isNfseMock(nota: NfseEmitida | null | undefined) {
    return String((nota?.metadata as Record<string, unknown> | null)?.modo ?? '').trim() === 'mock'
  }

  function buildNfsePreviewProps(venda: VendaRow, nota?: NfseEmitida | null) {
    const produtoResumo = resolveProdutoResumoNfse(venda)
    return {
      configuracao: nfseConfiguracaoAtiva,
      nota: nota ?? null,
      venda,
      fallbackDiscriminacao: buildNfseDiscriminacaoFromVenda(venda, {
        produtoDescricao: produtoResumo.tipo,
        produtoModelo: produtoResumo.modelo,
        validade: produtoResumo.validade,
        tipoEmissao: produtoResumo.tipoEmissao,
      }),
      agency: agencyConfig,
      logoUrl: agencyConfig.logo_interna_url || agencyConfig.logo_url,
    }
  }

  function openNfsePrintWindow(venda: VendaRow, nota: NfseEmitida) {
    const popup = window.open('', '_blank', 'width=1320,height=960')
    if (!popup) {
      showMsg('Libere a abertura de pop-up para gerar o PDF da nota.', 'err')
      return
    }

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(node => node.outerHTML)
      .join('\n')
    const markup = renderToStaticMarkup(
      <NfseDocumentPreview
        {...buildNfsePreviewProps(venda, nota)}
        className="mx-auto w-[1180px]"
      />
    )

    popup.document.open()
    popup.document.write(`<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>NFS-e ${nota.numero_nf ?? 'sem-numero'}</title>
    ${styles}
    <style>
      body { margin: 0; padding: 24px; background: #f3f4f6; }
      @media print {
        body { padding: 0; background: #ffffff; }
      }
    </style>
  </head>
  <body>
    ${markup}
    <script>
      window.onload = function () {
        setTimeout(function () { window.print(); }, 250);
      };
    </script>
  </body>
</html>`)
    popup.document.close()
    showMsg('A visualização da nota foi aberta para salvar em PDF.', 'ok')
  }

  function baixarNfsePdf(venda: VendaRow, nota: NfseEmitida) {
    if (nota.pdf_url?.trim()) {
      const link = document.createElement('a')
      link.href = nota.pdf_url
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.download = `nfse_${nota.numero_nf ?? nota.id}.pdf`
      link.click()
      showMsg('Download do PDF iniciado.', 'ok')
      return
    }
    openNfsePrintWindow(venda, nota)
  }

  async function encaminharNfsePorEmail(venda: VendaRow, nota: NfseEmitida) {
    const email = venda.email_faturamento?.trim()
    if (!email) {
      showMsg('Informe o e-mail do tomador antes de encaminhar a nota.', 'err')
      return
    }

    const values = {
      cliente: venda.nome_faturamento?.trim() || venda.cadastros_base?.nome?.trim() || 'Cliente',
      numero_nf: nota.numero_nf ?? 'em processamento',
      valor: formatCurrency(nota.valor_servico ?? venda.valor_venda ?? 0),
      codigo_verificacao: nota.codigo_verificacao ?? 'aguardando',
      link_documento: nota.pdf_url?.trim() || nota.xml_url?.trim() || 'Documento sem link público no momento.',
    }

    const subject = renderTemplate('Sua NFS-e {{numero_nf}} da CertiID', values)
    const body = renderTemplate(
      'Olá, {{cliente}}.\n\nSua NFS-e {{numero_nf}} foi registrada no valor de {{valor}}.\nCódigo de verificação: {{codigo_verificacao}}.\nAcesse o documento por aqui: {{link_documento}}\n\nAtenciosamente,\nEquipe CertiID',
      values
    )

    const { error } = await queueEmailMessage({
      to: email,
      subject,
      body,
      payload: {
        venda_id: venda.id,
        nfse_id: nota.id,
        tipo: 'nfse_encaminhamento',
      },
    })

    if (error) {
      showMsg(`Não foi possível encaminhar a nota por e-mail: ${error}`, 'err')
      return
    }

    showMsg('A nota foi encaminhada para a fila de e-mail.', 'ok')
  }

  async function encaminharNfsePorWhatsApp(venda: VendaRow, nota: NfseEmitida) {
    const telefone = venda.telefone_faturamento?.trim()
    if (!telefone) {
      showMsg('Informe o telefone com WhatsApp do tomador antes de encaminhar a nota.', 'err')
      return
    }

    const body = renderTemplate(
      'Olá, {{cliente}}. Sua NFS-e {{numero_nf}} foi registrada no valor de {{valor}}. Código de verificação: {{codigo_verificacao}}. Acesse o documento aqui: {{link_documento}}',
      {
        cliente: venda.nome_faturamento?.trim() || venda.cadastros_base?.nome?.trim() || 'Cliente',
        numero_nf: nota.numero_nf ?? 'em processamento',
        valor: formatCurrency(nota.valor_servico ?? venda.valor_venda ?? 0),
        codigo_verificacao: nota.codigo_verificacao ?? 'aguardando',
        link_documento: nota.pdf_url?.trim() || nota.xml_url?.trim() || 'Documento sem link público no momento.',
      }
    )

    const { error } = await queueWhatsAppMessage({
      to: telefone,
      body,
      payload: {
        venda_id: venda.id,
        nfse_id: nota.id,
        tipo: 'nfse_encaminhamento',
      },
    })

    if (error) {
      showMsg(`Não foi possível encaminhar a nota por WhatsApp: ${error}`, 'err')
      return
    }

    showMsg('A nota foi encaminhada para a fila de WhatsApp.', 'ok')
  }

  async function excluirRegistroNfse(venda: VendaRow, nota: NfseEmitida) {
    const deletavel = isNfseMock(nota) || nota.status_nf === 'pendente' || nota.status_nf === 'erro'
    if (!deletavel) {
      openFeatureNotice(
        'Exclusão bloqueada',
        'Esta NFS-e já possui status fiscal relevante. Para notas emitidas ou canceladas, use o fluxo de cancelamento fiscal em vez de excluir o registro.',
        'Você ainda pode excluir notas pendentes, com erro ou geradas em modo mock.'
      )
      return
    }

    const confirmado = window.confirm(`Deseja excluir o registro da NFS-e ${nota.numero_nf ?? 'sem número'}?`)
    if (!confirmado) return

    const rNfseD = await fetch(getApiUrl(`/nfse/${nota.id}`), { method: 'DELETE' })
    if (!rNfseD.ok && rNfseD.status !== 501) {
      showMsg('Erro ao excluir registro NFS-e', 'err')
      return
    }

    showMsg('Registro da NFS-e excluído com sucesso.', 'ok')
    if (vendaNfseModal?.venda.id === venda.id) {
      setVendaNfseModal(prev => prev
        ? { ...prev, notas: prev.notas.filter(item => item.id !== nota.id) }
        : prev)
    }
  }

  async function fetchConfiguracaoFiscalAtiva() {
    const r = await fetch(getApiUrl('/nfse/configuracao')).catch(() => null)
    const data = r?.ok ? await r.json().then(d => d.configuracao) : null
    return (data ?? null) as NfseConfiguracao | null
  }

  function validarEtapaEmissaoNfse(venda: VendaRow) {
    return isNfseEmissionAllowed({
      gatilho: nfseAutomationSettings.gatilho_emissao,
      venda,
      agendamentoStatus: agendamentoStatusPorVenda[venda.id] ?? null,
    })
  }

  async function fetchNotasNfseVenda(vendaId: string) {
    const response = await fetch(getApiUrl(`/nfse/venda/${vendaId}`)).catch(() => null)
    if (!response?.ok) return [] as NfseEmitida[]
    const data = await response.json().catch(() => ({ notas: [] }))
    return (data.notas ?? []) as NfseEmitida[]
  }

  async function vendaPossuiNfseAtiva(vendaId: string) {
    const notas = await fetchNotasNfseVenda(vendaId)
    return notas.some(nota => ['pendente', 'emitida'].includes(String(nota.status_nf ?? '').toLowerCase()))
  }

  function podeDispararAutomacaoPorMudanca(venda: VendaRow, anterior: VendaAutomationSnapshot | null) {
    switch (nfseAutomationSettings.gatilho_emissao) {
      case 'manual':
        return false
      case 'antes_pagamento':
        return !anterior && !venda.pago
      case 'apos_pagamento':
        return Boolean(!anterior?.pago && venda.pago)
      case 'apos_protocolo':
        return Boolean(!(anterior?.protocolo_numero ?? '').trim() && (venda.protocolo_numero ?? '').trim())
      case 'apos_emissao_certificado':
        return anterior?.status_venda !== 'emitido' && venda.status_venda === 'emitido'
      default:
        return false
    }
  }

  async function tentarEmitirNfseAutomaticamente(venda: VendaRow, origem: string) {
    if (nfseAutomationSettings.gatilho_emissao === 'manual') return
    if (nfseAutoProcessingRef.current.has(venda.id)) return

    const validacao = validarEtapaEmissaoNfse(venda)
    if (!validacao.allowed) return

    nfseAutoProcessingRef.current.add(venda.id)
    try {
      const jaExiste = await vendaPossuiNfseAtiva(venda.id)
      if (jaExiste) return
      await emitirNfseParaVenda(venda, { silent: true })
      showMsg(`NFS-e emitida automaticamente: ${origem}.`, 'ok')
    } catch {
      // mantém silencioso para não poluir a operação; a emissão manual continua disponível
    } finally {
      nfseAutoProcessingRef.current.delete(venda.id)
    }
  }

  async function emitirNfseViaGissOnline(venda: VendaRow) {
    const accessToken = await getSupabaseAccessToken()
    const response = await fetch(getEdgeFunctionUrl('nfse-gissonline-emit'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        venda_certificado_id: venda.id,
        justificativa_fora_etapa: (venda.metadata as Record<string, unknown> | null)?.nfse_justificativa_fora_etapa ?? null,
      }),
      signal: AbortSignal.timeout(45000),
    })

    const data = await response.json() as {
      ok: boolean
      error?: string
      stage?: string
      numero_lote?: string
      protocolo?: string
      nota_id?: string
      message?: string
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.error ?? 'Não foi possível emitir a NFS-e no GISSONLINE.')
    }

    return data
  }

  async function emitirNfseViaNotaJoseense(venda: VendaRow) {
    const produtoResumo = resolveProdutoResumoNfse(venda)
    const accessToken = await getSupabaseAccessToken()
    const response = await fetch(getEdgeFunctionUrl('nfse-nota-joseense-emit'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        venda_certificado_id: venda.id,
        justificativa_fora_etapa: (venda.metadata as Record<string, unknown> | null)?.nfse_justificativa_fora_etapa ?? null,
        produto_tipo: produtoResumo.tipo,
        produto_modelo: produtoResumo.modelo,
        produto_validade: produtoResumo.validade,
        tipo_emissao: produtoResumo.tipoEmissao,
      }),
      signal: AbortSignal.timeout(45000),
    })

    const data = await response.json() as {
      ok: boolean
      error?: string
      stage?: string
      nota_id?: string
      numero_nf?: string
      codigo_verificacao?: string
      message?: string
    }

    if (!response.ok || !data.ok) {
      throw new Error(data.error ?? 'Não foi possível emitir a NFS-e na Nota Joseense.')
    }

    return data
  }

  async function emitirNfseMock(venda: VendaRow, options?: { silent?: boolean }) {
    const numeroMock = 'MOCK-' + Date.now().toString(36).toUpperCase()
    const configuracaoFiscal = await fetchConfiguracaoFiscalAtiva()
    const produtoResumo = resolveProdutoResumoNfse(venda)
    const discriminacaoServicos = buildNfseDiscriminacaoFromVenda(venda, {
      produtoDescricao: produtoResumo.tipo,
      produtoModelo: produtoResumo.modelo,
      validade: produtoResumo.validade,
      tipoEmissao: produtoResumo.tipoEmissao,
    })
    const tomador = buildVendaTomadorSnapshot(venda)
    const emitente = buildEmitenteSnapshot(configuracaoFiscal)
    const nfsePayload = {
      venda_certificado_id: venda.id,
      cadastro_base_tomador_id: venda.cadastro_base_id,
      status_nf: 'pendente',
      numero_nf: numeroMock,
      valor_servico: venda.valor_venda ?? 0,
      data_emissao: new Date().toISOString(),
      payload_envio: {
        modo: 'mock',
        discriminacao_servicos: discriminacaoServicos,
        produto_descricao: produtoResumo.tipo,
        codigo_servico_municipio: configuracaoFiscal?.codigo_servico_municipio ?? null,
        tomador,
        emitente,
      },
      payload_retorno: {},
      metadata: {
        modo: 'mock',
        discriminacao_servicos: discriminacaoServicos,
        fiscal: {
          municipio_nome: configuracaoFiscal?.municipio_nome ?? null,
          local_prestacao: configuracaoFiscal?.municipio_nome ?? null,
          codigo_servico_municipio: configuracaoFiscal?.codigo_servico_municipio ?? null,
          natureza_operacao: configuracaoFiscal?.natureza_operacao ?? null,
          regime_especial: configuracaoFiscal?.regime_especial ?? null,
          aliquota_iss: configuracaoFiscal?.aliquota_iss ?? null,
        },
      },
    }
    const rNfseM = await fetch(getApiUrl('/nfse'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nfsePayload),
    })
    if (!rNfseM.ok && rNfseM.status !== 501) { if (!options?.silent) showMsg('Erro ao criar NFS-e', 'err'); return }
    const nova = rNfseM.ok ? await rNfseM.json().then(d => d.nfse) : null
    if (!options?.silent) showMsg(`NFS-e ${numeroMock} registrada (modo mock).`, 'ok')
    setVendaNfseModal(prev => prev && nova
      ? { ...prev, notas: [nova as NfseEmitida, ...prev.notas] }
      : prev)
  }

  async function emitirNfseParaVenda(venda: VendaRow, options?: { silent?: boolean; ignoreStageRule?: boolean; justificativaForaEtapa?: string | null }) {
    try {
      const validacao = validarEtapaEmissaoNfse(venda)
      if (!validacao.allowed && !options?.ignoreStageRule) {
        if (nfseAutomationSettings.permitir_emissao_manual_fora_etapa) {
          setNfseOverrideModal({
            vendas: [venda],
            justificativa: '',
            motivoPadrao: validacao.reason,
            lote: false,
          })
          return
        }
        if (!options?.silent) showMsg(validacao.reason, 'err')
        return
      }

      const configuracaoFiscal = await fetchConfiguracaoFiscalAtiva()
      if (!configuracaoFiscal) {
        throw new Error('Nenhuma configuração fiscal ativa foi encontrada para emitir a nota.')
      }

      const validacaoCampos = validarCamposObrigatoriosNfse(venda, configuracaoFiscal)
      if (!validacaoCampos.ok) {
        if (!options?.silent) {
          showMsg(validacaoCampos.message, 'err')
          openFeatureNotice('Emissão bloqueada por dados obrigatórios', validacaoCampos.detail, validacaoCampos.nextStep)
        }
        if (options?.silent) {
          throw new Error(validacaoCampos.message)
        }
        return
      }

      if (configuracaoFiscal.provedor === 'gissonline') {
        const result = await emitirNfseViaGissOnline({
          ...venda,
          metadata: {
            ...(venda.metadata ?? {}),
            nfse_justificativa_fora_etapa: options?.justificativaForaEtapa ?? null,
          },
        } as VendaRow)
        if (!options?.silent) {
          showMsg(result.message ?? `NFS-e enviada ao GISSONLINE. Protocolo ${result.protocolo ?? result.numero_lote ?? 'em processamento'}.`, 'ok')
        }
        await abrirNfseVenda(venda)
        return
      }

      const payloadFiscal = (configuracaoFiscal.payload_reforma_tributaria ?? {}) as Record<string, unknown>
      if (configuracaoFiscal.provedor === 'municipal' && String(payloadFiscal.municipal_adapter ?? '').trim() === 'nota_joseense') {
        const result = await emitirNfseViaNotaJoseense({
          ...venda,
          metadata: {
            ...(venda.metadata ?? {}),
            nfse_justificativa_fora_etapa: options?.justificativaForaEtapa ?? null,
          },
        } as VendaRow)
        if (!options?.silent) {
          showMsg(result.message ?? `NFS-e enviada à Nota Joseense. Número ${result.numero_nf ?? 'em processamento'}.`, 'ok')
        }
        await abrirNfseVenda(venda)
        return
      }

      const vendaComJustificativa = options?.justificativaForaEtapa
        ? {
            ...venda,
            metadata: {
              ...(venda.metadata ?? {}),
              nfse_justificativa_fora_etapa: options.justificativaForaEtapa,
            },
          }
        : venda

      await emitirNfseMock(vendaComJustificativa as VendaRow, options)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível emitir a NFS-e.'
      if (!options?.silent) {
        showMsg(message, 'err')
        return
      }
      throw error instanceof Error ? error : new Error(message)
    }
  }

  async function emitirNfseSelecionadas() {
    if (!selectedIds.size) {
      showMsg('Selecione pelo menos uma venda para emitir NFS-e em lote.', 'err')
      return
    }
    setEmitindoNfseLote(true)

    const selecionadas = vendasV2.filter(v => selectedIds.has(v.id))
    const bloqueadasPorEtapa = selecionadas.filter(v => !validarEtapaEmissaoNfse(v).allowed)
    if (bloqueadasPorEtapa.length > 0 && nfseAutomationSettings.permitir_emissao_manual_fora_etapa) {
      setEmitindoNfseLote(false)
      setNfseOverrideModal({
        vendas: selecionadas,
        justificativa: '',
        motivoPadrao: `Existem ${bloqueadasPorEtapa.length} venda(s) fora da etapa automática. Você pode emitir assim mesmo com justificativa.`,
        lote: true,
      })
      return
    }

    let emitidas = 0
    let bloqueadas = 0
    let falhas = 0

    for (const venda of selecionadas) {
      const validacao = validarEtapaEmissaoNfse(venda)
      if (!validacao.allowed) {
        bloqueadas += 1
        continue
      }
      try {
        await emitirNfseParaVenda(venda, { silent: true })
        emitidas += 1
      } catch {
        falhas += 1
      }
    }

    setEmitindoNfseLote(false)
    setSelectedIds(new Set())
    void fetchVendasV2()
    showMsg(`Lote concluído. Emitidas: ${emitidas}. Bloqueadas pela etapa: ${bloqueadas}. Falhas: ${falhas}.`, falhas === 0 ? 'ok' : 'err')
  }

  async function confirmarEmissaoForaDaEtapa() {
    if (!nfseOverrideModal) return
    const justificativa = nfseOverrideModal.justificativa.trim()
    if (nfseAutomationSettings.exigir_justificativa_fora_etapa && !justificativa) {
      showMsg('Informe a justificativa para emitir a NFS-e fora da etapa definida.', 'err')
      return
    }

    setEmitindoNfseLote(true)
    let emitidas = 0
    let falhas = 0
    for (const venda of nfseOverrideModal.vendas) {
      try {
        await emitirNfseParaVenda(venda, {
          silent: true,
          ignoreStageRule: true,
          justificativaForaEtapa: justificativa || null,
        })
        emitidas += 1
      } catch {
        falhas += 1
      }
    }
    setEmitindoNfseLote(false)
    setNfseOverrideModal(null)
    setSelectedIds(new Set())
    void fetchVendasV2()
    showMsg(`Emissão fora da etapa concluída. Emitidas: ${emitidas}. Falhas: ${falhas}.`, falhas === 0 ? 'ok' : 'err')
  }


  // ── paginação: reset ao mudar filtros ────────────────────────
  useEffect(() => { setPaginaAtual(1) }, [vendaFilters])

  // ── catalog mutations ────────────────────────────────────────
  function aplicarPresetData(preset: string) {
    const hoje = new Date()
    const fmt = (d: Date) => d.toISOString().split('T')[0]
    if (preset === 'hoje') {
      setVendaFilters(p => ({ ...p, filtroData: preset, dataInicial: fmt(hoje), dataFinal: fmt(hoje) }))
    } else if (preset === 'semana') {
      const ini = new Date(hoje); ini.setDate(hoje.getDate() - hoje.getDay())
      setVendaFilters(p => ({ ...p, filtroData: preset, dataInicial: fmt(ini), dataFinal: fmt(hoje) }))
    } else if (preset === 'mes') {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
      setVendaFilters(p => ({ ...p, filtroData: preset, dataInicial: fmt(ini), dataFinal: fmt(hoje) }))
    } else {
      setVendaFilters(p => ({ ...p, filtroData: 'geral', dataInicial: '', dataFinal: '' }))
    }
  }

  function exportarCSV() {
    const header = ['Pedido', 'Protocolo', 'Cliente', 'Documento', 'Produto', 'Emissão', 'Tipo Venda', 'PA', 'Valor', 'Status', 'Forma Pgto', 'Data Venda', 'Observação']
    const rows = vendasFiltradas.map(v => [
      v.pedido_numero ?? '',
      v.protocolo_numero ?? '',
      ((v.cadastros_base as { nome?: string } | null)?.nome ?? v.nome_faturamento ?? ''),
      ((v.cadastros_base as { cpf_cnpj?: string } | null)?.cpf_cnpj ?? v.documento_faturamento ?? ''),
      v.tipo_produto,
      v.tipo_emissao ?? '',
      v.tipo_venda ?? '',
      ((v.pontos_atendimento as { nome?: string } | null)?.nome ?? ''),
      String(v.valor_venda ?? 0),
      STATUS_VENDA_LABEL[v.status_venda],
      ((v.metadata as { forma_pagamento?: string })?.forma_pagamento ?? ''),
      new Date(v.created_at).toLocaleDateString('pt-BR'),
      (v.observacoes ?? ''),
    ])
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `vendas_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  async function excluirVenda(id: string) {
    if (!confirm('Excluir esta venda? Esta ação não pode ser desfeita.')) return
    await fetch(getApiUrl(`/comercial/vendas/${id}`), { method: 'DELETE' })
    setVendasV2(prev => prev.filter(v => v.id !== id))
  }

  function abrirProtocolo(v: VendaRow) {
    if (v.protocolo_numero) { showMsg('Esta venda já possui protocolo: ' + v.protocolo_numero); return }
    const cpfComprador = (v.cadastros_base as { cpf_cnpj?: string } | null)?.cpf_cnpj ?? ''
    setProtocoloVenda(v)
    setFormProtocolo({ ...EMPTY_PROTOCOLO, cpf: cpfComprador })
    setProtocoloStep('validate')
    setShowProtocolo(true)
  }

  async function validarTitular() {
    if (!formProtocolo.cpf.trim() || !formProtocolo.data_nascimento) {
      showMsg('Preencha CPF e data de nascimento do titular.')
      return
    }
    setValidandoProtocolo(true)
    // Busca dados do titular já cadastrado pelo CPF
    const titular = await getAivenTitularByCpf(formProtocolo.cpf.trim())
    if (titular) {
      const t = titular as { nome?: string; email?: string; telefone?: string }
      setFormProtocolo(p => ({
        ...p,
        nome:     t.nome ?? '',
        email:    t.email ?? '',
        telefone: t.telefone ?? '',
      }))
    }
    setValidandoProtocolo(false)
    setProtocoloStep('form')
  }

  async function confirmarProtocolo() {
    if (!protocoloVenda) return
    if (!formProtocolo.nome.trim() || !formProtocolo.cpf.trim()) {
      showMsg('Preencha nome e CPF do titular.')
      return
    }
    setEmitindoProtocolo(true)

    // Upsert do titular
    const titularPayload = {
      nome:            formProtocolo.nome.trim(),
      cpf:             formProtocolo.cpf.trim(),
      email:           formProtocolo.email || null,
      telefone:        `${formProtocolo.ddd}${formProtocolo.telefone}`.trim() || null,
      data_nascimento: formProtocolo.data_nascimento || null,
      metadata:        {
        cep: formProtocolo.cep, logradouro: formProtocolo.logradouro, numero: formProtocolo.numero,
        complemento: formProtocolo.complemento, bairro: formProtocolo.bairro,
        cidade: formProtocolo.cidade, uf: formProtocolo.uf, ibge: formProtocolo.ibge,
        cei: formProtocolo.cei, caepf: formProtocolo.caepf, nis: formProtocolo.nis,
        possui_cnh: formProtocolo.possui_cnh, codigo_voucher: formProtocolo.codigo_voucher,
      },
    }
    const rTit = await fetch(getApiUrl('/titulares'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(titularPayload),
    })
    const titularData = rTit.ok ? await rTit.json().then(d => d.titular) : null

    if (!rTit.ok || !titularData) {
      showMsg('Erro ao salvar titular')
      setEmitindoProtocolo(false)
      return
    }

    // Busca link_safeweb da tabela
    const item = protocoloVenda.tabela_preco_item_id
      ? tabelaItens.find(i => i.id === protocoloVenda.tabela_preco_item_id)
      : null

    // Atualiza a venda com o titular e gera número de protocolo temporário
    const proto = `PROT${Date.now().toString().slice(-8)}`
    const rVenda = await fetch(getApiUrl(`/comercial/vendas/${protocoloVenda.id}/titular`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titular_id: titularData.id,
        protocolo_numero: proto,
        protocolo_status: 'gerado',
        pedido_status: 'gerado',
        api_payload_protocolo: { link_safeweb: item?.link_safeweb ?? null, dados_titular: formProtocolo },
      }),
    })

    setEmitindoProtocolo(false)
    if (!rVenda.ok) { showMsg('Erro ao atualizar venda'); return }

    if (item?.link_safeweb) {
      // Abre o link da Safeweb em nova aba
      window.open(item.link_safeweb, '_blank')
    }

    setShowProtocolo(false)
    setVendasV2(prev => prev.map(r =>
      r.id === protocoloVenda.id ? { ...r, protocolo_numero: proto, protocolo_status: 'gerado' } : r
    ))
    showMsg(`Protocolo ${proto} emitido. Titular cadastrado.`, 'ok')
  }

  async function liberarEmissao(v: VendaRow) {
    const rLib = await fetch(getApiUrl(`/comercial/vendas/${v.id}/status`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status_venda: 'emitido' }),
    })
    if (!rLib.ok) { showMsg('Erro ao liberar emissão'); return }
    setVendasV2(prev => prev.map(r => r.id === v.id ? { ...r, status_venda: 'emitido' } : r))
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll() {
    if (selectedIds.size === vendasPaginadas.length && vendasPaginadas.length > 0)
      setSelectedIds(new Set())
    else
      setSelectedIds(new Set(vendasPaginadas.map(v => v.id)))
  }

  // ── render ───────────────────────────────────────────────────
  return (
    <ModulePageShell
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      storageKey="module-submenu-comercial"
      menuLabel="Comercial"
    >
      <div>
        {/* ── VENDAS ─────────────────────────────────────────── */}
        {tab === 'vendas' && (
          <div className="space-y-4">
            {paymentRuntime.modo_teste_geral && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300">
                <AlertCircle size={15} className="shrink-0" />
                <p className="font-medium">Ambiente de testes ativo.</p>
                <p className="text-xs opacity-90">{paymentRuntime.aviso_checkout}</p>
              </div>
            )}

            {pontosAtivos.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                <AlertCircle size={16} />
                Nenhum ponto de atendimento cadastrado. Configure em <strong className="mx-1">Configurações → Pontos de Atendimento</strong>.
              </div>
            )}

            {showFormV && createPortal(
              <div
                className="fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4 sm:p-6"
                onClick={fecharFormVenda}
              >
                <div className="w-full max-w-5xl my-auto" onClick={e => e.stopPropagation()}>
              <Panel title="Nova Venda" onClose={fecharFormVenda}>
                {/* ── Aviso de pré-requisitos ausentes ── */}
                {preflightProblemas.length > 0 && (
                  <div className="mb-5 rounded-xl border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/20 p-3 space-y-2">
                    <p className="text-xs font-bold text-red-700 dark:text-red-300">Configuração incompleta — resolva antes de salvar</p>
                    {preflightProblemas.map((prob, i) => (
                      <div key={i} className={cn('pt-2', i > 0 && 'border-t border-red-200 dark:border-red-800/40')}>
                        <p className="text-xs font-semibold text-red-700 dark:text-red-300">{prob.titulo}</p>
                        <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">{prob.descricao}</p>
                        <p className="text-[11px] text-red-500 dark:text-red-500 mt-1">
                          Onde corrigir: <strong>{prob.onde}</strong>
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {/* indicadores de passo */}
                <div className="flex flex-wrap gap-1.5 mb-5">
                  {vendaSteps.steps.map((step, index) => (
                    <div key={step.key} className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
                      step.done
                        ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/30 dark:bg-green-950/20 dark:text-green-300'
                        : index === vendaSteps.currentStepIndex
                          ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300'
                          : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-500'
                    )}>
                      {step.done && <span className="text-green-600 dark:text-green-400">✓</span>}
                      {step.label}
                    </div>
                  ))}
                </div>

                {/* ── FORMULÁRIO DE NOVA VENDA ─────────────────── */}
                <div className="space-y-4">

                  {/* 1. Cliente */}
                  <div className="grid grid-cols-1 md:grid-cols-[160px_1fr_auto] gap-3">
                    <SelectInput label="Tipo Venda" value={formV2.tipo_venda}
                      onChange={v => setFormV2(p => ({ ...p, tipo_venda: v }))}
                      options={[{ value: '', label: 'Selecione' }, ...TIPO_VENDA_OPTIONS]} />
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Cliente *</label>
                      <div className="relative flex gap-2">
                        <div className="relative flex-1">
                          <input
                            value={formV2.cadastro_base_id && clienteSelecionadoObj
                              ? `${clienteSelecionadoObj.cpf_cnpj} · ${clienteSelecionadoObj.nome}`
                              : clienteSearch}
                            onChange={e => {
                              const v = e.target.value
                              setClienteSearch(v)
                              if (formV2.cadastro_base_id) {
                                setFormV2(p => ({ ...p, cadastro_base_id: '' }))
                                setClienteSelecionadoObj(null)
                              }
                              if (clienteSearchTimerRef.current) clearTimeout(clienteSearchTimerRef.current)
                              clienteSearchTimerRef.current = setTimeout(() => void buscarClientes(v), 300)
                            }}
                            onFocus={() => { if (clienteResultados.length > 0) setClienteDropdownOpen(true) }}
                            onBlur={() => setTimeout(() => setClienteDropdownOpen(false), 150)}
                            disabled={!formV2.tipo_venda}
                            placeholder="Nome, CPF, CNPJ ou telefone (mín. 3 caracteres)"
                            className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 pr-8 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-900/60" />
                          {clienteBuscando && (
                            <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400 pointer-events-none" />
                          )}
                          {clienteDropdownOpen && clienteResultados.length > 0 && (
                            <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                              {clienteResultados.map(c => (
                                <button key={c.id} type="button"
                                  onMouseDown={e => e.preventDefault()}
                                  onClick={() => {
                                    setFormV2(p => ({ ...p, cadastro_base_id: c.id, contador_id: null }))
                                    setClienteSelecionadoObj(c)
                                    setClienteSearch('')
                                    setClienteDropdownOpen(false)
                                    setClienteResultados([])
                                    setContadorSearch('')
                                    setContadorStepHandled(false)
                                  }}
                                  className="w-full text-left px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0 transition-colors">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">{c.nome}</p>
                                      {c.nome_fantasia && <p className="text-xs text-gray-400 truncate">{c.nome_fantasia}</p>}
                                    </div>
                                    <div className="text-right shrink-0">
                                      <p className="text-xs text-gray-500 font-mono">{c.cpf_cnpj}</p>
                                      {c.telefone && <p className="text-xs text-gray-400">{c.telefone}</p>}
                                      {(c.cidade || c.uf) && <p className="text-xs text-gray-400">{[c.cidade, c.uf].filter(Boolean).join('/')}</p>}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                          {clienteDropdownOpen && !clienteBuscando && clienteResultados.length === 0 && clienteSearch.length >= 3 && (
                            <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl px-4 py-3 text-sm text-gray-400">
                              Nenhum cliente encontrado para "{clienteSearch}"
                            </div>
                          )}
                        </div>
                        {formV2.cadastro_base_id && (
                          <button type="button" title="Limpar cliente"
                            onClick={() => {
                              setFormV2(p => ({ ...p, cadastro_base_id: '', contador_id: null, tipo_emissao: '', ponto_atendimento_id: '', tabela_preco_id: '', tabela_preco_item_id: '', certificado_id: '', valor_venda: 0, desconto: 0, voucher_codigo: '', forma_pagamento: '', data_vencimento: '' }))
                              setClienteSearch('')
                              setClienteSelecionadoObj(null)
                              setContadorSearch('')
                              setContadorStepHandled(false)
                            }}
                            className="px-2 text-gray-400 hover:text-gray-600">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-end">
                      <button type="button" onClick={() => {
                        if (showClienteForm) { setShowClienteForm(false); setEditingClienteId(null); setFormCliente({ ...EMPTY_CLIENTE_BASE }) }
                        else abrirNovoCliente()
                      }}
                        className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium whitespace-nowrap">
                        {showClienteForm ? '← Fechar' : '+ Novo Cliente'}
                      </button>
                    </div>
                  </div>

                  {showClienteForm && (
                    <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 bg-gray-50 dark:bg-gray-900/40">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-200">
                          {editingClienteId ? 'Editar Pessoa / Empresa' : 'Cadastro de Pessoa / Empresa'}
                        </h4>
                        <button type="button" onClick={() => {
                          setShowClienteForm(false)
                          setEditingClienteId(null)
                          setFormCliente({ ...EMPTY_CLIENTE_BASE })
                        }} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Fechar</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <SelectInput label="Tipo" value={formCliente.tipo_cliente}
                          onChange={v => setFormCliente(p => ({ ...p, tipo_cliente: v as NovoCadastroBase['tipo_cliente'] }))}
                          options={[{ value: 'pessoa_fisica', label: 'Pessoa Física' }, { value: 'pessoa_juridica', label: 'Pessoa Jurídica' }]} />
                        <TextInput label="CPF / CNPJ *" value={formCliente.cpf_cnpj}
                          onChange={v => setFormCliente(p => ({ ...p, cpf_cnpj: v }))} />
                        <TextInput label="Nome / Razão Social *" value={formCliente.nome}
                          onChange={v => setFormCliente(p => ({ ...p, nome: v }))} className="md:col-span-2" />
                        <TextInput label="Nome Fantasia" value={formCliente.nome_fantasia ?? ''}
                          onChange={v => setFormCliente(p => ({ ...p, nome_fantasia: v || null }))} className="md:col-span-2" />
                        <TextInput label="E-mail" type="email" value={formCliente.email ?? ''}
                          onChange={v => setFormCliente(p => ({ ...p, email: v || null }))} />
                        <TextInput label="Telefone" value={formCliente.telefone ?? ''}
                          onChange={v => setFormCliente(p => ({ ...p, telefone: v || null }))} />
                        <TextInput label="CEP" value={formCliente.cep ?? ''}
                          onChange={v => setFormCliente(p => ({ ...p, cep: v || null }))}
                          onBlur={async () => {
                            const r = await buscarCep(formCliente.cep ?? '')
                            if (!r) return
                            setFormCliente(p => ({
                              ...p,
                              logradouro: r.logradouro || p.logradouro,
                              bairro:     r.bairro     || p.bairro,
                              cidade:     r.localidade || p.cidade,
                              uf:         r.uf         || p.uf,
                            }))
                          }} />
                        <TextInput label="Cidade" value={formCliente.cidade ?? ''}
                          onChange={v => setFormCliente(p => ({ ...p, cidade: v || null }))} />
                        <TextInput label="UF" value={formCliente.uf ?? ''}
                          onChange={v => setFormCliente(p => ({ ...p, uf: v || null }))} />
                        <TextInput label="Inscrição Municipal" value={formCliente.inscricao_municipal ?? ''}
                          onChange={v => setFormCliente(p => ({ ...p, inscricao_municipal: v || null }))} />
                        <TextInput label="Inscrição Estadual" value={formCliente.inscricao_estadual ?? ''}
                          onChange={v => setFormCliente(p => ({ ...p, inscricao_estadual: v || null }))} />
                        <TextInput label="Logradouro" value={formCliente.logradouro ?? ''}
                          onChange={v => setFormCliente(p => ({ ...p, logradouro: v || null }))} className="md:col-span-2" />
                        <TextInput label="Número" value={formCliente.numero ?? ''}
                          onChange={v => setFormCliente(p => ({ ...p, numero: v || null }))} />
                        <TextInput label="Complemento" value={formCliente.complemento ?? ''}
                          onChange={v => setFormCliente(p => ({ ...p, complemento: v || null }))} className="md:col-span-2" />
                        <TextInput label="Bairro" value={formCliente.bairro ?? ''}
                          onChange={v => setFormCliente(p => ({ ...p, bairro: v || null }))} />
                        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                          <input type="checkbox" checked={formCliente.iss_retido}
                            onChange={e => setFormCliente(p => ({ ...p, iss_retido: e.target.checked }))} />
                          ISS retido
                        </label>
                      </div>
                      <div className="mt-4 flex justify-end gap-2">
                        <button type="button" onClick={() => {
                          setShowClienteForm(false)
                          setEditingClienteId(null)
                          setFormCliente({ ...EMPTY_CLIENTE_BASE })
                        }}
                          className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm">Cancelar</button>
                        <button type="button" onClick={() => void salvarCliente()} disabled={salvandoCliente}
                          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50">
                          {salvandoCliente ? 'Salvando...' : editingClienteId ? 'Salvar alterações' : 'Salvar cliente'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 3. Parceiro vendedor */}
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
                    <div>
                      <label className="block text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Parceiro vendedor / indicador da venda</label>
                      <div className="relative">
                        <input
                          value={formV2.contador_id
                            ? (() => { const p = parceiros.find(x => x.id === formV2.contador_id); return p ? `${p.cpf_cnpj ?? ''} - ${(p.tipo_parceiro ?? '').toUpperCase()} - ${p.nome}` : '' })()
                            : contadorSearch}
                          onChange={e => {
                            const v = e.target.value
                            if (formV2.contador_id) setFormV2(p => ({ ...p, contador_id: null }))
                            setContadorSearch(v)
                            setContadorDropdownOpen(true)
                            setContadorStepHandled(false)
                          }}
                          onFocus={() => setContadorDropdownOpen(true)}
                          onBlur={() => setTimeout(() => setContadorDropdownOpen(false), 150)}
                          disabled={!formV2.cadastro_base_id}
                          placeholder={!formV2.cadastro_base_id ? 'Selecione o cliente primeiro' : 'Busque um parceiro vendedor'}
                          className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-900/60" />
                        {contadorDropdownOpen && parceirosParaContador.length > 0 && (
                          <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {parceirosParaContador.map(p => (
                              <button key={p.id} type="button"
                                onMouseDown={e => e.preventDefault()}
                                onClick={() => {
                                  setFormV2(prev => ({ ...prev, contador_id: p.id }))
                                  setContadorStepHandled(true)
                                  setContadorSearch('')
                                  setContadorDropdownOpen(false)
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                                {p.cpf_cnpj ?? ''} - {(p.tipo_parceiro ?? '').toUpperCase()} - {p.nome}{p.nome_fantasia ? ` - ${p.nome_fantasia}` : ''}
                              </button>
                            ))}
                          </div>
                        )}
                        {contadorDropdownOpen && parceirosParaContador.length === 0 && (
                          <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                            {contadorSearch.trim() ? 'Nenhum parceiro vinculado corresponde a esta busca.' : 'Nenhum parceiro vinculado foi encontrado para o seu usuário.'}
                          </div>
                        )}
                        {formV2.contador_id && (
                          <button type="button" onClick={() => { setFormV2(p => ({ ...p, contador_id: null })); setContadorSearch(''); setContadorDropdownOpen(false); setContadorStepHandled(false) }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={14} /></button>
                        )}
                      </div>
                    </div>
                    <button type="button"
                      onClick={() => { setFormV2(p => ({ ...p, contador_id: null })); setContadorSearch(''); setContadorDropdownOpen(false); setContadorStepHandled(true) }}
                      disabled={!formV2.cadastro_base_id}
                      className={cn(
                        'px-3 py-2 text-xs rounded-lg border transition-colors whitespace-nowrap',
                        vendaStepStatus.parceiroOk && !formV2.contador_id
                          ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/30 dark:bg-green-950/20 dark:text-green-300'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50'
                      )}>
                      Seguir sem parceiro vendedor
                    </button>
                  </div>

                  {/* 4. Emissão e ponto */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <SelectInput label="Tipo Emissão *" value={formV2.tipo_emissao}
                      onChange={v => setFormV2(p => ({
                        ...p,
                        tipo_emissao: v,
                        tabela_preco_id: '',
                        tabela_preco_item_id: '',
                        certificado_id: '',
                        valor_venda: 0,
                        desconto: 0,
                        voucher_codigo: '',
                      }))}
                      disabled={!vendaStepStatus.parceiroOk}
                      options={[{ value: '', label: vendaStepStatus.parceiroOk ? 'Selecione' : 'Confirme o parceiro primeiro' }, ...TIPO_EMISSAO_OPTIONS]} />
                    <SelectInput label="Ponto de Atendimento *" value={formV2.ponto_atendimento_id}
                      onChange={v => setFormV2(p => ({
                        ...p,
                        ponto_atendimento_id: v,
                        tabela_preco_id: '',
                        tabela_preco_item_id: '',
                        certificado_id: '',
                        valor_venda: 0,
                        desconto: 0,
                        voucher_codigo: '',
                      }))}
                      disabled={!vendaStepStatus.emissaoOk}
                      options={[
                        { value: '', label: !vendaStepStatus.emissaoOk ? 'Selecione o tipo de emissão primeiro' : pontosAtivos.length ? 'Selecione' : 'Cadastre um ponto primeiro' },
                        ...pontosAtivos.map(ponto => ({
                          value: ponto.id,
                          label: [ponto.nome, ponto.cidade, ponto.uf].filter(Boolean).join(' · '),
                        })),
                      ]} />
                  </div>

                  {/* 5. Tabela */}
                  <div>
                    <SelectInput label="Tabela de Preço *" value={formV2.tabela_preco_id}
                      onChange={v => setFormV2(p => ({ ...p, tabela_preco_id: v, certificado_id: '', tabela_preco_item_id: '', valor_venda: 0, desconto: 0, voucher_codigo: '' }))}
                      disabled={!vendaStepStatus.pontoOk}
                      options={[
                        { value: '', label: !vendaStepStatus.pontoOk ? 'Selecione o ponto primeiro' : 'Selecione a tabela' },
                        ...tabelasDisponiveisVenda.map(t => ({ value: t.id, label: t.nome })),
                      ]} />
                  </div>

                  {/* 6. Produto */}
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
                    <SelectInput label="Produto *" value={formV2.tabela_preco_item_id}
                      onChange={v => {
                        const item = itensTabela.find(i => i.id === v)
                        setFormV2(p => ({
                          ...p,
                          tabela_preco_item_id: v,
                          certificado_id: item?.certificado_id ?? '',
                          valor_venda: item?.valor ?? 0,
                          desconto: 0,
                          voucher_codigo: '',
                        }))
                      }}
                      disabled={!formV2.tabela_preco_id}
                      options={[
                        { value: '', label: formV2.tabela_preco_id ? 'Selecione o produto' : 'Selecione a tabela primeiro' },
                        ...certsDaTabela.map(({ item, cert }) => {
                          const label = cert
                            ? `${cert.tipo}${cert.modelo ? ' · ' + cert.modelo : ''}${cert.validade ? ' · ' + cert.validade : ''} — ${item.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                            : item.id
                          return { value: item.id, label }
                        }),
                      ]} />
                    <TextInput
                      label="Validade (Meses)"
                      value={validadeSelecionadaMeses}
                      onChange={() => {}}
                      disabled
                      placeholder="Será preenchida pelo produto"
                    />
                  </div>

                  {motivoSemCertificados && vendaStepStatus.pontoOk && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                      {motivoSemCertificados}
                    </div>
                  )}

                  {/* 7. Pagamento / Desconto */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <NumberInput label="Valor Final (R$) *" value={formV2.valor_venda}
                      onChange={v => setFormV2(p => ({ ...p, valor_venda: v }))}
                      disabled={!vendaStepStatus.produtoOk} />
                    <SelectInput label="Forma de Pagamento *" value={formV2.forma_pagamento}
                      onChange={v => setFormV2(p => ({ ...p, forma_pagamento: v }))}
                      disabled={!vendaStepStatus.produtoOk}
                      options={[{ value: '', label: 'Selecione' }, ...formasPagamento.map(n => ({ value: n, label: n }))]} />
                    <TextInput label="Vencimento *" type="date" value={formV2.data_vencimento}
                      onChange={v => setFormV2(p => ({ ...p, data_vencimento: v }))}
                      disabled={!vendaStepStatus.produtoOk} />
                    <TextInput label="Cupom / Voucher" value={formV2.voucher_codigo}
                      onChange={v => setFormV2(p => ({ ...p, voucher_codigo: v }))}
                      disabled={!vendaStepStatus.produtoOk}
                      placeholder={tabelaSelecionadaVenda?.codigo_voucher ? `Tabela aceita: ${tabelaSelecionadaVenda.codigo_voucher}` : 'Opcional'} />
                  </div>

                  <div>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">Observações</span>
                      <textarea rows={2} value={formV2.observacoes ?? ''}
                        onChange={e => setFormV2(p => ({ ...p, observacoes: e.target.value || null }))}
                        className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                    </label>
                  </div>

                  {vendaStepStatus.produtoOk && (
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/40 p-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Preço base</p>
                        <p className="mt-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{formatCurrency(valorBaseProduto)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Desconto aplicado</p>
                        <p className={cn('mt-1 text-sm font-semibold', descontoDentroDoLimite ? 'text-gray-700 dark:text-gray-200' : 'text-red-600 dark:text-red-400')}>
                          {formatCurrency(formV2.desconto || 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Limite da tabela</p>
                        <p className="mt-1 text-sm font-semibold text-gray-700 dark:text-gray-200">{formatCurrency(descontoMaximoPermitido)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Voucher configurado</p>
                        <p className={cn('mt-1 text-sm font-semibold', voucherAplicadoValido ? 'text-gray-700 dark:text-gray-200' : 'text-red-600 dark:text-red-400')}>
                          {tabelaSelecionadaVenda?.codigo_voucher ?? 'Nenhum'}
                        </p>
                      </div>
                    </div>
                  )}

                  {vendaStepStatus.produtoOk && (!descontoDentroDoLimite || !voucherAplicadoValido) && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-300">
                      {!descontoDentroDoLimite && <p>O desconto atual ultrapassa o limite permitido pela tabela.</p>}
                      {!voucherAplicadoValido && <p>O cupom informado não corresponde ao voucher configurado para esta tabela.</p>}
                    </div>
                  )}

                  {/* 8. Ações */}
                  <div className="flex justify-end border-t border-gray-100 dark:border-gray-800 pt-4">
                    <FormActions
                      onSave={salvarVendaV2}
                      onCancel={fecharFormVenda}
                      saving={salvandoV}
                      disabled={!vendaStepStatus.pagamentoOk}
                    />
                  </div>

                </div>

              </Panel>
                </div>
              </div>,
              document.body
            )}

            {/* ── PAINEL DE FILTROS ─────────────────────────── */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <TextInput label="Cliente / Documento" value={vendaFilters.cliente}
                  onChange={v => setVendaFilters(p => ({ ...p, cliente: v }))} className="flex-1 min-w-[280px]" />
                <SelectInput label="Status" value={vendaFilters.status}
                  onChange={v => setVendaFilters(p => ({ ...p, status: v }))}
                  options={[{ value: '', label: 'Todos' }, ...STATUS_VENDA_V2_OPTIONS.map(s => ({ value: s, label: STATUS_VENDA_LABEL[s] }))]}
                  className="min-w-[200px]"
                />
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500">Período</span>
                  <select value={vendaFilters.filtroData} onChange={e => aplicarPresetData(e.target.value)}
                    className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[140px]">
                    <option value="geral">Geral</option>
                    <option value="hoje">Hoje</option>
                    <option value="semana">Esta semana</option>
                    <option value="mes">Este mês</option>
                  </select>
                </label>
                <div className="flex flex-wrap gap-2 ml-auto">
                  <button type="button" onClick={() => setShowVendaFiltrosExtras(prev => !prev)}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    {showVendaFiltrosExtras ? 'Ocultar filtros' : 'Mais filtros'}
                  </button>
                  <button type="button" onClick={() => setShowVendaAcoesExtras(prev => !prev)}
                    className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    {showVendaAcoesExtras ? 'Ocultar ações' : 'Ações rápidas'}
                  </button>
                  <button type="button" onClick={() => void fetchVendasV2()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                    <Search size={14} /> Pesquisar
                  </button>
                  <button type="button" onClick={() => {
                    if (showFormV) { fecharFormVenda(); return }
                    setFormV2({ ...EMPTY_VENDA_V2 })
                    setClienteSelecionadoObj(null)
                    setClienteSearch('')
                    setContadorSearch('')
                    setContadorDropdownOpen(false)
                    setContadorStepHandled(false)
                    setShowClienteForm(false)
                    setShowFormV(true)
                  }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm shadow-blue-600/20 transition-all">
                    <PlusCircle size={16} /> Nova Venda
                  </button>
                </div>
              </div>

              {showVendaFiltrosExtras && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <TextInput label="Data Inicial" type="date" value={vendaFilters.dataInicial}
                    onChange={v => setVendaFilters(p => ({ ...p, dataInicial: v, filtroData: 'personalizado' }))} />
                  <TextInput label="Data Final" type="date" value={vendaFilters.dataFinal}
                    onChange={v => setVendaFilters(p => ({ ...p, dataFinal: v, filtroData: 'personalizado' }))} />
                  <TextInput label="PA/Emissor" value={vendaFilters.pa}
                    onChange={v => setVendaFilters(p => ({ ...p, pa: v }))} />
                  <TextInput label="Pedido" value={vendaFilters.pedido}
                    onChange={v => setVendaFilters(p => ({ ...p, pedido: v }))} />
                  <TextInput label="Protocolo" value={vendaFilters.protocolo}
                    onChange={v => setVendaFilters(p => ({ ...p, protocolo: v }))} />
                  <div className="flex items-end gap-2">
                    <button type="button" onClick={() => setTab('agenda')}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">
                      <Calendar size={14} /> Agenda
                    </button>
                    <button type="button" onClick={() => setVendaFilters(EMPTY_VENDA_FILTERS)}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700">
                      <X size={12} /> Limpar
                    </button>
                  </div>
                </div>
              )}

              {showVendaAcoesExtras && (
                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                  {nfseAutomationSettings.permitir_emissao_lote_comercial && (
                    <VendaActionBtn
                      icon={FileText}
                      label={emitindoNfseLote ? 'Emitindo lote...' : `Emitir NFS-e${selectedIds.size ? ` (${selectedIds.size})` : ''}`}
                      onClick={() => void emitirNfseSelecionadas()}
                    />
                  )}
                  <VendaActionBtn icon={RefreshCcw} label="Atualizar Faturas"   onClick={() => openFeatureNotice('Atualização de faturas', 'O módulo de cobrança ainda não está fechado ponta a ponta. Esta ação será conectada quando o fluxo de pagamentos/webhook estiver pronto.', 'Próximo bloco: criar cobrança + webhook + conciliação.')} />
                  <VendaActionBtn icon={List}       label="Protocolos em Lote"  onClick={() => openFeatureNotice('Protocolos em lote', 'A emissão unitária já existe, mas o processamento em lote ainda precisa de regras de validação e fila operacional.', 'Próximo bloco: desenhar fila segura para operações em massa.')} />
                  <VendaActionBtn icon={UserCheck}  label="Consulta CPF PSBio"  onClick={() => openFeatureNotice('Consulta CPF PSBio', 'Essa ação depende de integração externa específica. O botão foi mantido como referência operacional do fluxo.', 'Entrará na fase de integrações externas reais.')} />
                  <VendaActionBtn icon={Download}   label="Exportar CSV"        onClick={exportarCSV} />
                </div>
              )}
            </div>

            {/* ── LEGENDA ──────────────────────────────────────── */}
            <p className="text-xs text-gray-400 dark:text-gray-500 px-1 leading-relaxed">
              (<Bell size={10} className="inline mb-0.5" />) Notifica Eventos ·
              (<ClipboardList size={10} className="inline mb-0.5" />) Emitir Protocolo ·
              (<Calendar size={10} className="inline mb-0.5" />) Agendar ·
              (<Upload size={10} className="inline mb-0.5" />) Upload Documentos ·
              (<Receipt size={10} className="inline mb-0.5" />) Fatura ·
              (<Trash2 size={10} className="inline mb-0.5" />) Excluir ·
              (<FileText size={10} className="inline mb-0.5" />) Emitir / Ver NF-e ·
              (<XCircle size={10} className="inline mb-0.5" />) Cancelar NF-e ·
              (<Unlock size={10} className="inline mb-0.5" />) Liberar Emissão
            </p>

            {nfseAutomationSettings.permitir_emissao_lote_comercial && selectedIds.size > 0 && (
              <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/70 dark:bg-indigo-950/20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                    {selectedIds.size} venda(s) selecionada(s) para emissão de NFS-e.
                  </p>
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1">
                    O lote respeita a etapa configurada em Fiscal / NFS-e antes de enviar a nota.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void emitirNfseSelecionadas()}
                  disabled={emitindoNfseLote}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-medium transition-colors"
                >
                  {emitindoNfseLote ? 'Emitindo lote...' : 'Emitir NFS-e selecionadas'}
                </button>
              </div>
            )}

            {/* ── TABELA ───────────────────────────────────────── */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1600px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left border-b border-gray-200 dark:border-gray-800">
                      <th className="px-3 py-3 w-8">
                        <input type="checkbox"
                          checked={selectedIds.size > 0 && selectedIds.size === vendasPaginadas.length}
                          onChange={toggleAll}
                          className="rounded cursor-pointer" />
                      </th>
                      <th className="px-3 py-3">Ações</th>
                      {['Pedido','Protocolo','Tipo Emissão','Tipo Venda','Status Venda','Data Status','Forma Pagamento','Valor Venda','Produto','Doc. Cliente','Cliente','PA','Data Venda','Vendedor','Observação'].map(h => (
                        <th key={h} className="px-3 py-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {loadingV ? (
                      <LoadingRow colSpan={17} />
                    ) : vendasPaginadas.length === 0 ? (
                      <EmptyRow colSpan={17} label="Nenhuma venda encontrada com esses filtros." />
                    ) : vendasPaginadas.map(v => (
                      <tr key={v.id} className={cn(
                        'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors',
                        selectedIds.has(v.id) && 'bg-blue-50 dark:bg-blue-900/10',
                      )}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selectedIds.has(v.id)}
                            onChange={() => toggleSelected(v.id)} className="rounded cursor-pointer" />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-0.5">
                            <VendaIconBtn title="Notifica Eventos"  icon={Bell}          color="blue"    onClick={() => openFeatureNotice('Notificações de eventos', 'A central de notificações dessa venda ainda não foi conectada aos eventos operacionais.', 'Pode ser ligada depois ao histórico de contato e automações.')} />
                            <VendaIconBtn title="Emitir Protocolo"  icon={ClipboardList} color="purple"  onClick={() => abrirProtocolo(v)} />
                            <VendaIconBtn title="Agendar"           icon={Calendar}      color="emerald" onClick={() => prepararAgendamento(v)} />
                            <VendaIconBtn title="Upload Documentos" icon={Upload}        color="orange"  onClick={() => openFeatureNotice('Upload de documentos', 'A estrutura de documentos financeiros existe, mas o fluxo de upload desta tela ainda não foi conectado.', 'Próximo bloco: ligar `documentos_financeiros` a esta venda.')} />
                            <VendaIconBtn title="Fatura"            icon={Receipt}       color="teal"    onClick={() => void abrirFaturaVenda(v)} />
                            <VendaIconBtn title="Excluir"           icon={Trash2}        color="red"     onClick={() => void excluirVenda(v.id)} />
                            {nfseAutomationSettings.permitir_emissao_manual_rapida && (
                              <VendaIconBtn title="Emitir NFS-e"      icon={FileText}      color="gray"    onClick={() => void emitirNfseParaVenda(v)} />
                            )}
                            <VendaIconBtn title="Ver NF-e"          icon={Eye}           color="gray"    onClick={() => void abrirNfseVenda(v)} />
                            <VendaIconBtn title="Cancelar NF-e"     icon={XCircle}       color="red"     onClick={() => openFeatureNotice('Cancelamento de NFS-e', 'O cancelamento fiscal ainda não foi implementado porque depende da integração municipal final.', 'Entrará na fase fiscal após homologação da emissão.')} />
                            <VendaIconBtn title="Liberar Emissão"   icon={Unlock}        color="green"   onClick={() => void liberarEmissao(v)} />
                          </div>
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{v.pedido_numero ?? '—'}</td>
                        <td className="px-3 py-2 text-blue-600 dark:text-blue-400 whitespace-nowrap">{v.protocolo_numero ?? '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{v.tipo_emissao ? capitalize(v.tipo_emissao.replace(/_/g, ' ')) : '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{v.tipo_venda ? capitalize(v.tipo_venda) : '—'}</td>
                        <td className="px-3 py-2">
                          <select
                            title="Status da venda"
                            value={v.status_venda}
                            onChange={e => atualizarStatusVendaV2(v.id, e.target.value as StatusVendaCertificado)}
                            className={cn('px-2 py-0.5 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none whitespace-nowrap', statusVendaV2Cls(v.status_venda))}>
                            {STATUS_VENDA_V2_OPTIONS.map(s => (
                              <option key={s} value={s}>{STATUS_VENDA_LABEL[s]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(v.updated_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                          {(v.metadata as { forma_pagamento?: string })?.forma_pagamento ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">
                          {formatCurrency(v.valor_venda ?? 0)}
                        </td>
                        <td className="px-3 py-2 text-gray-500 max-w-[180px] truncate">{v.tipo_produto}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                          {(v.cadastros_base as { cpf_cnpj?: string } | null)?.cpf_cnpj ?? v.documento_faturamento ?? '—'}
                        </td>
                        <td className="px-3 py-2 font-medium max-w-[160px] truncate">
                          {(v.cadastros_base as { nome?: string } | null)?.nome ?? v.nome_faturamento ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                          {(v.pontos_atendimento as { nome?: string } | null)?.nome ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(v.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                          {v.vendedor_id ? (vendedorNomes.get(v.vendedor_id) ?? '—') : '—'}
                        </td>
                        <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{v.observacoes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── RODAPÉ: totalizador + paginação ── */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Total: {formatCurrency(totalFiltrado)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {vendasFiltradas.length === 0
                      ? 'Nenhum registro'
                      : `Exibindo ${(paginaAtual - 1) * itensPorPagina + 1}–${Math.min(paginaAtual * itensPorPagina, vendasFiltradas.length)} de ${vendasFiltradas.length}`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span>Itens/página:</span>
                    <select value={itensPorPagina}
                      onChange={e => { setItensPorPagina(Number(e.target.value)); setPaginaAtual(1) }}
                      className="border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-xs bg-white dark:bg-gray-800">
                      {[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={paginaAtual === 1}
                      onClick={() => setPaginaAtual(p => p - 1)}
                      className="w-7 h-7 rounded flex items-center justify-center disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-xs text-gray-500 px-1">{paginaAtual} / {totalPaginas}</span>
                    <button type="button" disabled={paginaAtual >= totalPaginas}
                      onClick={() => setPaginaAtual(p => p + 1)}
                      className="w-7 h-7 rounded flex items-center justify-center disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── AGENDA ─────────────────────────────────────────── */}
        {tab === 'agenda' && (
          <div className="space-y-5">
            <SectionHeader
              title={`Agenda - ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}`}
              actionLabel={profile?.perfil === 'agente_registro' ? 'Minha disponibilidade' : 'Novo Agendamento'}
              onAction={() => profile?.perfil === 'agente_registro' ? setShowFormDisp(v => !v) : setShowFormA(v => !v)}
            />

            <div className="rounded-xl border border-blue-100 dark:border-blue-900/20 bg-blue-50/50 dark:bg-blue-950/10 px-4 py-3">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {isAdmin
                  ? 'Visão administrativa: você enxerga a agenda operacional completa e pode preparar a disponibilidade dos agentes.'
                  : profile?.perfil === 'agente_registro'
                    ? 'Visão do agente: você enxerga apenas seus agendamentos V2 e pode ajustar seus horários de atendimento.'
                    : 'Visão comercial: você enxerga a agenda operacional e pode preparar agendamentos legados.'}
              </p>
            </div>

            {showFormA && profile?.perfil !== 'agente_registro' && (
              <Panel title="Novo Agendamento" onClose={() => setShowFormA(false)}>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <ClienteSearchInput
                    value={formA.cliente}
                    onChange={v => setFormA(p => ({ ...p, cliente: v }))}
                    onSelect={(nome, tel) => setFormA(p => ({ ...p, cliente: nome, telefone: tel ?? p.telefone }))}
                    className="col-span-2"
                  />
                  <TextInput label="Telefone" value={formA.telefone ?? ''} onChange={v => setFormA(p => ({ ...p, telefone: v || null }))} />
                  <SelectInput label="Serviço" value={formA.servico} onChange={v => setFormA(p => ({ ...p, servico: v }))}
                    options={certificados.map(c => ({ value: c.tipo, label: c.tipo }))} />
                  <TextInput label="Data e Hora *" type="datetime-local" value={formA.data_hora} onChange={v => setFormA(p => ({ ...p, data_hora: v }))} />
                </div>
                <FormActions onSave={salvarAgendamento} onCancel={() => setShowFormA(false)} saving={salvandoA} />
              </Panel>
            )}

            {showAgendaV2Panel && formAgendaV2 && (
              <Panel title="Agendar Validação da Venda" onClose={() => { setShowAgendaV2Panel(false); setFormAgendaV2(null); setErroAgendaV2(null) }}>
                {erroAgendaV2 && (
                  <div className="mb-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/80 dark:bg-red-950/20 px-4 py-3">
                    <p className="text-sm text-red-700 dark:text-red-300">{erroAgendaV2}</p>
                  </div>
                )}
                <div className="mb-4 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/80 dark:bg-emerald-950/20 px-4 py-3">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    Este agendamento já nasce vinculado à venda.
                  </p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                    O agente e o ponto abaixo já respeitam a tabela de preço e, quando existir, a restrição do parceiro/contador da venda.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <TextInput
                    label="Data e Hora *"
                    type="datetime-local"
                    value={formAgendaV2.data_agendada}
                    onChange={v => setFormAgendaV2(prev => prev ? { ...prev, data_agendada: v } : prev)}
                  />
                  <SelectInput
                    label="Agente *"
                    value={formAgendaV2.agente_registro_id}
                    onChange={v => setFormAgendaV2(prev => prev ? { ...prev, agente_registro_id: v, ponto_atendimento_id: '' } : prev)}
                    options={[
                      { value: '', label: 'Selecione' },
                      ...agentesRegistro
                        .filter(agente => agentesElegiveisAgendaAtual.some(item => item.agente_registro_id === agente.id))
                        .map(agente => ({ value: agente.id, label: agente.nome })),
                    ]}
                  />
                  <SelectInput
                    label="Ponto *"
                    value={formAgendaV2.ponto_atendimento_id}
                    onChange={v => setFormAgendaV2(prev => prev ? { ...prev, ponto_atendimento_id: v } : prev)}
                    options={[
                      { value: '', label: 'Selecione' },
                      ...pontosElegiveisAgendaAtual.map(ponto => ({ value: ponto.id, label: ponto.nome })),
                    ]}
                  />
                  <SelectInput
                    label="Tipo de atendimento"
                    value={formAgendaV2.tipo_atendimento}
                    onChange={v => setFormAgendaV2(prev => prev ? { ...prev, tipo_atendimento: v as AgendamentoV2Form['tipo_atendimento'] } : prev)}
                    options={[
                      { value: '', label: 'Selecione' },
                      { value: 'presencial', label: 'Presencial' },
                      { value: 'videoconferencia', label: 'Videoconferência' },
                      { value: 'auto_atendimento', label: 'Auto Atendimento' },
                    ]}
                  />
                  <TextInput
                    label="Observações"
                    value={formAgendaV2.observacoes}
                    onChange={v => setFormAgendaV2(prev => prev ? { ...prev, observacoes: v } : prev)}
                    className="md:col-span-2"
                  />
                </div>
                <FormActions
                  onSave={salvarAgendamentoValidacaoV2}
                  onCancel={() => { setShowAgendaV2Panel(false); setFormAgendaV2(null) }}
                  saving={salvandoAgendaV2}
                />
              </Panel>
            )}

            {canManageAgenda && showFormDisp && (
              <Panel title="Disponibilidade do Agente" onClose={() => setShowFormDisp(false)}>
                <div className="mb-4 rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/80 dark:bg-blue-950/20 px-4 py-3">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    Manhã e tarde são cadastradas em blocos separados.
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Exemplo: crie um horário de `08:00 às 12:00` e depois outro de `13:00 às 18:00` para respeitar o almoço.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setFormDisp(p => ({ ...p, hora_inicio: '08:00', hora_fim: '12:00' }))}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-white/80 dark:hover:bg-blue-900/20"
                    >
                      Preencher manhã
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormDisp(p => ({ ...p, hora_inicio: '13:00', hora_fim: '18:00' }))}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-white/80 dark:hover:bg-blue-900/20"
                    >
                      Preencher tarde
                    </button>
                  </div>
                </div>
                <div className="mb-4 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 bg-gray-50/70 dark:bg-gray-800/30">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Dias da semana</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">Selecione todos os dias que devem receber este mesmo bloco de horário.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setDiasSelecionadosDisp([1, 2, 3, 4, 5])}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-900"
                      >
                        Seg a Sex
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiasSelecionadosDisp([0, 1, 2, 3, 4, 5, 6])}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-900"
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setDiasSelecionadosDisp([])}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-white dark:hover:bg-gray-900"
                      >
                        Limpar
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {DIAS_SEMANA_OPTIONS.map(dia => {
                      const ativo = diasSelecionadosDisp.includes(dia.value)
                      return (
                        <button
                          key={dia.value}
                          type="button"
                          onClick={() => setDiasSelecionadosDisp(prev =>
                            prev.includes(dia.value)
                              ? prev.filter(item => item !== dia.value)
                              : [...prev, dia.value].sort((a, b) => a - b)
                          )}
                          className={cn(
                            'px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors',
                            ativo
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-900',
                          )}
                        >
                          {dia.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {isAdmin && (
                    <SelectInput
                      label="Agente *"
                      value={formDisp.agente_registro_id}
                      onChange={v => setFormDisp(p => ({ ...p, agente_registro_id: v }))}
                      options={[{ value: '', label: 'Selecione' }, ...agentesRegistro.map(a => ({ value: a.id, label: a.nome }))]}
                    />
                  )}
                  <SelectInput
                    label="Ponto *"
                    value={formDisp.ponto_atendimento_id}
                    onChange={v => setFormDisp(p => ({ ...p, ponto_atendimento_id: v }))}
                    options={[{ value: '', label: 'Selecione' }, ...pontosAtivos.map(p => ({ value: p.id, label: p.nome }))]}
                  />
                  <SelectInput
                    label="Tipo"
                    value={formDisp.tipo_atendimento}
                    onChange={v => setFormDisp(p => ({ ...p, tipo_atendimento: v as DisponibilidadeForm['tipo_atendimento'] }))}
                    options={[
                      { value: '', label: 'Todos' },
                      { value: 'presencial', label: 'Presencial' },
                      { value: 'videoconferencia', label: 'Videoconferência' },
                      { value: 'auto_atendimento', label: 'Auto Atendimento' },
                    ]}
                  />
                  <TextInput label="Início" type="time" value={formDisp.hora_inicio} onChange={v => setFormDisp(p => ({ ...p, hora_inicio: v }))} />
                  <TextInput label="Fim" type="time" value={formDisp.hora_fim} onChange={v => setFormDisp(p => ({ ...p, hora_fim: v }))} />
                  <NumberInput label="Intervalo (min)" value={formDisp.intervalo_minutos} onChange={v => setFormDisp(p => ({ ...p, intervalo_minutos: v }))} step={1} />
                  <NumberInput label="Capacidade" value={formDisp.capacidade_por_slot} onChange={v => setFormDisp(p => ({ ...p, capacidade_por_slot: v }))} step={1} />
                </div>
                <FormActions onSave={salvarDisponibilidade} onCancel={() => setShowFormDisp(false)} saving={salvandoDisp} />
              </Panel>
            )}

            {canManageAgenda && showFormIndisp && (
              <Panel title="Bloqueio e Indisponibilidade" onClose={() => setShowFormIndisp(false)}>
                <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/20 px-4 py-3">
                  <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                    Use este bloco para exceções da agenda.
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Exemplos: almoço especial, ausência, reunião interna, férias, feriado ou treinamento.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <button
                      type="button"
                      onClick={() => setFormIndisp(p => ({ ...p, motivo: 'Almoço / pausa operacional' }))}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-white/80 dark:hover:bg-amber-900/20"
                    >
                      Almoço
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormIndisp(p => ({ ...p, motivo: 'Férias' }))}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-white/80 dark:hover:bg-amber-900/20"
                    >
                      Férias
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormIndisp(p => ({ ...p, motivo: 'Ausência / compromisso externo' }))}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-white/80 dark:hover:bg-amber-900/20"
                    >
                      Ausência
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {isAdmin && (
                    <SelectInput
                      label="Agente *"
                      value={formIndisp.agente_registro_id}
                      onChange={v => setFormIndisp(p => ({ ...p, agente_registro_id: v }))}
                      options={[{ value: '', label: 'Selecione' }, ...agentesRegistro.map(a => ({ value: a.id, label: a.nome }))]}
                    />
                  )}
                  <SelectInput
                    label="Ponto opcional"
                    value={formIndisp.ponto_atendimento_id}
                    onChange={v => setFormIndisp(p => ({ ...p, ponto_atendimento_id: v }))}
                    options={[{ value: '', label: 'Todos os pontos do agente' }, ...pontosAtivos.map(p => ({ value: p.id, label: p.nome }))]}
                  />
                  <ActiveSelect value={formIndisp.ativo} onChange={v => setFormIndisp(p => ({ ...p, ativo: v }))} />
                  <TextInput label="Início *" type="datetime-local" value={formIndisp.inicio_em} onChange={v => setFormIndisp(p => ({ ...p, inicio_em: v }))} />
                  <TextInput label="Fim *" type="datetime-local" value={formIndisp.fim_em} onChange={v => setFormIndisp(p => ({ ...p, fim_em: v }))} />
                  <TextInput label="Motivo" value={formIndisp.motivo} onChange={v => setFormIndisp(p => ({ ...p, motivo: v }))} className="md:col-span-1" />
                </div>
                <FormActions onSave={salvarIndisponibilidade} onCancel={() => setShowFormIndisp(false)} saving={salvandoIndisp} />
              </Panel>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">A partir de</label>
                <input
                  type="date"
                  value={filtroDataAgenda}
                  onChange={e => setFiltroDataAgenda(e.target.value)}
                  className="h-9 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Status</label>
                <select
                  value={filtroStatusAgenda}
                  onChange={e => setFiltroStatusAgenda(e.target.value)}
                  className="h-9 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todos os status</option>
                  <option value="aguardando">Aguardando</option>
                  <option value="confirmado">Confirmado</option>
                  <option value="realizado">Realizado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => { setFiltroDataAgenda(new Date().toISOString().split('T')[0]); setFiltroStatusAgenda('') }}
                className="h-9 px-4 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Hoje
              </button>
            </div>

            {loadingA ? (
              <p className="text-gray-400 animate-pulse text-sm">Carregando...</p>
            ) : agenda.length === 0 ? (
              <p className="text-gray-400 text-sm">Nenhum agendamento encontrado para este filtro.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <InfoCardMini label="Total na agenda" value={String(agenda.length)} />
                  <InfoCardMini label="Aguardando" value={String(agenda.filter(a => a.status === 'aguardando').length)} />
                  <InfoCardMini label="Confirmados" value={String(agenda.filter(a => a.status === 'confirmado').length)} />
                  <InfoCardMini label="Validação V2" value={String(agenda.filter(a => a.origem === 'validacao_v2').length)} />
                </div>

                <div className="space-y-2">
                {agenda.map(a => {
                  const dt = new Date(a.data_hora)
                  return (
                    <div key={a.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-4">
                      <div className="w-20 text-center shrink-0">
                        <span className="text-lg font-bold text-blue-600 dark:text-blue-400 block">{dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-xs text-gray-400">{dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{a.cliente}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {a.servico}
                          {a.telefone ? ` · ${a.telefone}` : ''}
                          {a.ponto_atendimento_nome ? ` · ${a.ponto_atendimento_nome}` : ''}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-1">
                          {a.origem === 'validacao_v2' ? 'Agenda V2' : 'Agenda legada'}
                          {a.tipo_atendimento ? ` · ${capitalize(a.tipo_atendimento.replace(/_/g, ' '))}` : ''}
                          {a.protocolo_numero ? ` · Protocolo ${a.protocolo_numero}` : ''}
                        </p>
                      </div>
                      {a.origem === 'validacao_v2' && a.venda_certificado_id && (
                        <button
                          type="button"
                          onClick={() => void abrirPainelAgendamentoV2(a)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium"
                        >
                          {a.status === 'confirmado' ? 'Reagendar' : 'Agendar validação'}
                        </button>
                      )}
                      <select
                        title="Status do agendamento"
                        value={a.status}
                        onChange={e => atualizarStatusAgenda(a.id, e.target.value as StatusAgendamento)}
                        className={cn('px-2 py-0.5 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none', statusAgendaCls(a.status))}>
                        {(['confirmado', 'aguardando', 'cancelado', 'realizado'] as StatusAgendamento[]).map(s => (
                          <option key={s} value={s}>{capitalize(s)}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
                </div>
              </div>
            )}

            {canManageAgenda && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Disponibilidade configurada</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Você pode cadastrar mais de um bloco no mesmo dia, como manhã e tarde.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFormDisp(v => !v)}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {showFormDisp ? 'Fechar cadastro' : 'Adicionar horário'}
                  </button>
                </div>
                {disponibilidades.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhuma disponibilidade cadastrada ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {disponibilidades.map(item => {
                      const agenteNome = agentesRegistro.find(a => a.id === item.agente_registro_id)?.nome ?? 'Agente'
                      const pontoNome = pontos.find(p => p.id === item.ponto_atendimento_id)?.nome ?? 'Ponto'
                      const diaNome = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][item.dia_semana] ?? 'Dia'
                      return (
                        <div key={item.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{agenteNome} · {pontoNome}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {diaNome} · {item.hora_inicio.slice(0, 5)} às {item.hora_fim.slice(0, 5)} · {item.intervalo_minutos} min · capacidade {item.capacidade_por_slot}
                              {item.tipo_atendimento ? ` · ${capitalize(item.tipo_atendimento.replace(/_/g, ' '))}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusPill active={item.ativo} />
                            <button type="button" title={item.ativo ? 'Desativar' : 'Ativar'} onClick={() => void toggleDisponibilidade(item)}
                              className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                                item.ativo ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800')}>
                              {item.ativo ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {canManageAgenda && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Bloqueios e exceções</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Aqui entram férias, almoço especial, ausências, feriados e outros períodos sem atendimento.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFormIndisp(v => !v)}
                    className="px-3 py-2 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {showFormIndisp ? 'Fechar bloqueio' : 'Novo bloqueio'}
                  </button>
                </div>
                {indisponibilidades.length === 0 ? (
                  <p className="text-sm text-gray-400">Nenhum bloqueio cadastrado ainda.</p>
                ) : (
                  <div className="space-y-2">
                    {indisponibilidades.map(item => {
                      const agenteNome = agentesRegistro.find(a => a.id === item.agente_registro_id)?.nome ?? 'Agente'
                      const pontoNome = item.ponto_atendimento_id
                        ? (pontos.find(p => p.id === item.ponto_atendimento_id)?.nome ?? 'Ponto')
                        : 'Todos os pontos'
                      return (
                        <div key={item.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{agenteNome} · {pontoNome}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(item.inicio_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              {' até '}
                              {new Date(item.fim_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-1">{item.motivo ?? 'Sem motivo informado'}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <StatusPill active={item.ativo} />
                            <button type="button" title={item.ativo ? 'Desativar' : 'Ativar'} onClick={() => void toggleIndisponibilidade(item)}
                              className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                                item.ativo ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800')}>
                              {item.ativo ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}


        {/* ── CERTIFICADOS ───────────────────────────────────── */}
        {tab === 'certificados' && (
          <div className="space-y-5">
            {/* header com dois botões */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-semibold text-gray-800 dark:text-gray-200">Catálogo de Certificados</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedCertIds.size > 0 && (
                  <button type="button" onClick={excluirCertificadosSelecionados}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors">
                    <Trash2 size={13} /> Excluir selecionados ({selectedCertIds.size})
                  </button>
                )}
                <input ref={importInputRef} type="file" accept=".csv,.tsv,.txt,.xls,.xlsx" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) void importarPlanilha(f); e.target.value = '' }} />
                <button type="button" onClick={() => importInputRef.current?.click()} disabled={importando}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50">
                  <Upload size={13} /> {importando ? 'Importando...' : 'Importar Planilha'}
                </button>
                <button type="button" onClick={abrirNovoCertificado}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
                  <PlusCircle size={14} /> Novo Certificado
                </button>
              </div>
            </div>

            {loadingCatalogo && <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 size={16} className="animate-spin" /> Carregando...</div>}
            {catalogoErro && <div className="text-red-600 text-sm">{catalogoErro}</div>}


            {/* ── FILTROS ── */}
            <div className="flex flex-wrap items-end gap-3">
              <TextInput label="Buscar" value={certFilters.busca}
                onChange={v => setCertFilters(p => ({ ...p, busca: v }))}
                className="flex-1 min-w-[200px]" placeholder="Nome, código, hash, produto AC..." />
              <SelectInput label="Status" value={certFilters.status}
                onChange={v => setCertFilters(p => ({ ...p, status: v }))}
                options={[
                  { value: '', label: 'Todos' },
                  { value: 'ativo', label: 'Ativo' },
                  { value: 'inativo', label: 'Inativo' },
                ]}
                className="min-w-[140px]" />
              <SelectInput label="Categoria" value={certFilters.categoria}
                onChange={v => setCertFilters(p => ({ ...p, categoria: v }))}
                options={[
                  { value: '', label: 'Todas' },
                  ...categoriasDisponiveis,
                ]}
                className="min-w-[160px]" />
              {certFilters.busca || certFilters.status || certFilters.categoria ? (
                <button type="button" onClick={() => setCertFilters(EMPTY_CERT_FILTERS)}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700">
                  <X size={12} /> Limpar
                </button>
              ) : null}
            </div>


            {(() => {
              const allIds = certificadosFiltrados.map(c => c.id)
              const allSelected = allIds.length > 0 && allIds.every(id => selectedCertIds.has(id))
              const toggleAll = () => setSelectedCertIds(allSelected ? new Set() : new Set(allIds))
              const toggleOne = (id: string) => setSelectedCertIds(prev => {
                const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
              })
              return (
                <DataTable headers={['', 'Status', 'Tipo emissão', 'Código', 'Nome', 'Validade (meses)', 'Tipo', 'Produto vinculado na AC', 'Preço de venda', 'Valor Custo AC', 'Valor Custo AR', 'Agrupador', 'Hash', 'Ações']}>
                  {certificados.length === 0 ? (
                    <EmptyRow colSpan={14} label="Nenhum certificado cadastrado. Use 'Importar Planilha' ou 'Novo Certificado'." />
                  ) : certificadosFiltrados.length === 0 ? (
                    <EmptyRow colSpan={14} label="Nenhum certificado encontrado com os filtros aplicados." />
                  ) : (
                    <>
                      <tr className="bg-gray-50 dark:bg-gray-800/50">
                        <td className="px-4 py-2" colSpan={14}>
                          <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500 select-none">
                            <input type="checkbox" checked={allSelected} onChange={toggleAll}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" />
                            {allSelected ? 'Desmarcar todos' : `Selecionar todos (${certificadosFiltrados.length})`}
                          </label>
                        </td>
                      </tr>
                      {certificadosFiltrados.map(c => (
                        <tr key={c.id} className={cn('hover:bg-gray-50 dark:hover:bg-gray-800/50', !c.ativo && 'opacity-50', selectedCertIds.has(c.id) && 'bg-blue-50 dark:bg-blue-900/10')}>
                          <td className="px-4 py-3">
                            <input type="checkbox" checked={selectedCertIds.has(c.id)} onChange={() => toggleOne(c.id)}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" />
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              'inline-flex rounded-full px-2 py-1 text-[11px] font-medium',
                              c.ativo
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
                            )}>
                              {normalizeStatusProduto(c.status_produto, c.ativo)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">{c.tipo_emissao_padrao ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-400">{c.codigo ?? '—'}</td>
                          <td className="px-4 py-3 font-medium text-sm">{c.tipo || '—'}</td>
                          <td className="px-4 py-3 text-sm">{formatarValidadeMeses(c.validade)}</td>
                          <td className="px-4 py-3 text-xs">{c.categoria ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-400 max-w-[140px] truncate" title={c.produto_vinculado_ac ?? ''}>{c.produto_vinculado_ac ?? '—'}</td>
                          <td className="px-4 py-3 text-sm font-semibold">{c.preco_venda ? <span className="text-green-600 dark:text-green-400">{formatCurrency(c.preco_venda)}</span> : <span className="text-gray-400">—</span>}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{c.valor_custo_ac ? formatCurrency(c.valor_custo_ac) : '—'}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{c.valor_custo ? formatCurrency(c.valor_custo) : '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate" title={c.agrupador ?? ''}>{c.agrupador ?? '—'}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate" title={c.hash ?? ''}>{c.hash ?? '—'}</td>
                          <td className="px-4 py-3"><RowActions active={c.ativo} onEdit={() => editarCertificado(c)} onToggle={() => toggleCertificado(c)} onDelete={() => excluirCertificado(c.id)} /></td>
                        </tr>
                      ))}
                    </>
                  )}
                </DataTable>
              )
            })()}
          </div>
        )}

        {/* ── TABELAS DE PREÇO ───────────────────────────────── */}
        {tab === 'tabelas' && (
          <div className="space-y-6">
            {loadingCatalogo && <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 size={16} className="animate-spin" /> Carregando...</div>}
            {catalogoErro && <div className="text-red-600 text-sm">{catalogoErro}</div>}
            {agendaSchemaWarning && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900/30 bg-amber-50/80 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                {agendaSchemaWarning}
              </div>
            )}

            {/* Lista de tabelas */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-gray-800 dark:text-gray-200">Tabelas de Preço</h2>
                <button type="button" onClick={abrirNovaTabela}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                  <PlusCircle size={13} /> Nova Tabela
                </button>
              </div>

              {showFormTabela && (
                <Panel title={editingTabelaId ? 'Editar Tabela' : 'Nova Tabela de Preço'} onClose={() => setShowFormTabela(false)}>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <TextInput label="Nome *" value={formTabela.nome} onChange={v => setFormTabela(p => ({ ...p, nome: v }))} className="md:col-span-2" />
                    <TextInput label="Código Voucher" value={formTabela.codigo_voucher ?? ''} onChange={v => setFormTabela(p => ({ ...p, codigo_voucher: v || null }))} />
                    <ActiveSelect value={formTabela.ativo} onChange={v => setFormTabela(p => ({ ...p, ativo: v }))} />
                    <NumberInput label="% Máx. Desconto" value={formTabela.max_desconto_percentual} onChange={v => setFormTabela(p => ({ ...p, max_desconto_percentual: v }))} />
                    <NumberInput label="Valor Máx. Desconto (R$)" value={formTabela.max_desconto_valor} onChange={v => setFormTabela(p => ({ ...p, max_desconto_valor: v }))} />
                    <NumberInput label="% Comissão Venda" value={formTabela.comissao_venda_pct} onChange={v => setFormTabela(p => ({ ...p, comissao_venda_pct: v }))} />
                    <NumberInput label="% Comissão Gestor" value={formTabela.comissao_gestor_pct} onChange={v => setFormTabela(p => ({ ...p, comissao_gestor_pct: v }))} />
                    <NumberInput label="Valor Comissão Gestor (R$)" value={formTabela.comissao_gestor_valor} onChange={v => setFormTabela(p => ({ ...p, comissao_gestor_valor: v }))} />
                    <TextInput label="Descrição" value={formTabela.descricao ?? ''} onChange={v => setFormTabela(p => ({ ...p, descricao: v || null }))} className="md:col-span-3" />
                  </div>
                  <FormActions onSave={salvarTabela} onCancel={() => setShowFormTabela(false)} saving={salvandoCatalogo} />
                </Panel>
              )}

              <DataTable headers={['Sel.', 'Tabela', 'Voucher', 'Produtos', 'Participantes', 'Desconto R$', 'Desconto %', '% Comissão', 'Status', 'Ações']}>
                {tabelasPreco.length === 0 ? (
                  <EmptyRow colSpan={10} label="Nenhuma tabela cadastrada." />
                ) : (
                  tabelasPreco.map(t => {
                    const totalProdutos = tabelaItens.filter(i => i.tabela_preco_id === t.id).length
                    const totalParticipantes = tabelaParticipantes.filter(p => p.tabela_preco_id === t.id).length
                    const ativaSelecionada = t.id === selectedTabelaId
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedTabelaId(t.id === selectedTabelaId ? null : t.id)}
                        className={cn(
                          'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50',
                          ativaSelecionada && 'bg-blue-50 dark:bg-blue-900/10',
                          !t.ativo && 'opacity-60'
                        )}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            readOnly
                            checked={ativaSelecionada}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-sm text-gray-800 dark:text-gray-100">{t.nome}</p>
                            {t.descricao && <p className="text-[11px] text-gray-400 mt-0.5">{t.descricao}</p>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{t.codigo_voucher ?? '—'}</td>
                        <td className="px-4 py-3 text-sm">{totalProdutos}</td>
                        <td className="px-4 py-3 text-sm">{totalParticipantes}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{formatCurrency(t.max_desconto_valor)}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{Number(t.max_desconto_percentual).toLocaleString('pt-BR')}%</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{Number(t.comissao_venda_pct).toLocaleString('pt-BR')}%</td>
                        <td className="px-4 py-3"><StatusPill active={t.ativo} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              title="Editar tabela"
                              onClick={() => { setSelectedTabelaId(t.id); editarTabela(t) }}
                              className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-600 flex items-center justify-center transition-colors"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              type="button"
                              title="Editar preços"
                              onClick={() => abrirEdicaoPrecosTabela(t.id)}
                              className="w-8 h-8 rounded-lg text-gray-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600 flex items-center justify-center transition-colors"
                            >
                              <Receipt size={14} />
                            </button>
                            <button
                              type="button"
                              title="Associar agente"
                              onClick={() => abrirAssociacaoAgenteTabela(t.id)}
                              className="w-8 h-8 rounded-lg text-gray-400 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-600 flex items-center justify-center transition-colors"
                            >
                              <UserCheck size={14} />
                            </button>
                            <button
                              type="button"
                              title="Excluir tabela"
                              onClick={() => void excluirTabela(t)}
                              className="w-8 h-8 rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 flex items-center justify-center transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </DataTable>
            </div>

            {/* Detalhe da tabela selecionada */}
            {selectedTabelaId && (() => {
              const tabela = tabelaById.get(selectedTabelaId)
              if (!tabela) return null
              const itens = tabelaItens.filter(i => i.tabela_preco_id === selectedTabelaId)
              const parts = tabelaParticipantes.filter(p => p.tabela_preco_id === selectedTabelaId)
              const agentesPermitidos = agentesTabelaPreco.filter(a => a.tabela_preco_id === selectedTabelaId)
              const pricingRule = pricingRuleByTabelaId.get(selectedTabelaId) ?? null
              const certificadosDisponiveisBase = certificadosFiltrados.filter(cert => !itens.some(item => item.certificado_id === cert.id))
              const certificadosDisponiveisBaseFiltrados = certificadosDisponiveisBase.filter(cert => {
                const termo = tabelaCertBusca.trim().toLowerCase()
                if (termo) {
                  const matchNome   = (cert.tipo ?? '').toLowerCase().includes(termo)
                  const matchCodigo = (cert.codigo?.toString() ?? '').includes(termo)
                  const matchHash   = (cert.hash ?? '').toLowerCase().includes(termo)
                  if (!matchNome && !matchCodigo && !matchHash) return false
                }
                if (tabelaCertCategoria && cert.categoria !== tabelaCertCategoria) return false
                return true
              })
              const parceiroPreview = parceiros.find(p => p.id === slotPreviewParceiroId) ?? null
              const restricoesParceiroPreview = parceiroPreview
                ? parceirosAgentesPermitidos.filter(item => item.parceiro_id === parceiroPreview.id && item.ativo)
                : []
              const proximosSlots = generateAgendaSlotsPreview({
                tabelaPrecoId: selectedTabelaId,
                vinculados: agentesTabelaPreco.filter(a => a.ativo),
                parceiroId: parceiroPreview?.id ?? null,
                parceirosAgentesPermitidos,
                disponibilidades: disponibilidades.filter(d => d.ativo),
                indisponibilidades,
                bookings: agenda
                  .filter(a => a.origem === 'validacao_v2')
                  .map(a => ({
                    id: a.id,
                    agente_registro_id: a.agente_registro_id,
                    ponto_atendimento_id: a.ponto_atendimento_id,
                    data_hora: a.data_hora,
                    status: a.status,
                  })),
                rangeDays: 14,
                limit: 10,
              })
              return (
                <div className="space-y-5 border-t border-gray-200 dark:border-gray-700 pt-5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="font-semibold text-blue-600 dark:text-blue-400">Tabela: {tabela.nome}</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Primeiro você vincula produtos do catálogo base. Depois edita os preços somente desta tabela.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => editarTabela(tabela)}
                        className="px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        Editar tabela
                      </button>
                      <button type="button" onClick={() => abrirAssociacaoAgenteTabela(selectedTabelaId)}
                        className="px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                        Associar agente
                      </button>
                      <button type="button" onClick={() => void excluirTabela(tabela)}
                        className="px-3 py-2 text-xs rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/30 dark:hover:bg-red-950/20">
                        Excluir tabela
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Estratégia de preço pela tabela matriz</h4>
                        <p className="text-xs text-gray-400 mt-0.5">Defina um percentual acima ou abaixo da tabela matriz e aplique em massa. Depois você ainda pode ajustar itens manualmente.</p>
                      </div>
                      {pricingRule && (
                        <span className="text-[11px] px-2 py-1 rounded-full bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300">
                          Regra salva: {pricingRule.ajuste_percentual > 0 ? '+' : ''}{pricingRule.ajuste_percentual.toLocaleString('pt-BR')}% sobre {tabelaById.get(pricingRule.tabela_base_id)?.nome ?? 'tabela matriz'}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <SelectInput
                        label="Tabela Matriz"
                        value={pricingMatrixForm.tabela_base_id}
                        onChange={v => setPricingMatrixForm(prev => ({ ...prev, tabela_base_id: v }))}
                        options={[
                          { value: '', label: 'Selecione a tabela base' },
                          ...tabelasPreco
                            .filter(item => item.id !== selectedTabelaId && item.ativo)
                            .map(item => ({ value: item.id, label: item.nome })),
                        ]}
                      />
                      <NumberInput
                        label="% sobre a matriz"
                        value={pricingMatrixForm.ajuste_percentual}
                        onChange={v => setPricingMatrixForm(prev => ({ ...prev, ajuste_percentual: v }))}
                      />
                      <div className="flex items-end gap-2">
                        <button
                          type="button"
                          onClick={() => void salvarPricingMatrixRule(selectedTabelaId)}
                          disabled={salvandoCatalogo}
                          className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
                        >
                          Salvar regra
                        </button>
                        <button
                          type="button"
                          onClick={() => void aplicarPricingMatrixRule(selectedTabelaId)}
                          disabled={salvandoCatalogo}
                          className="px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-60"
                        >
                          Aplicar na tabela
                        </button>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Exemplo: `-15` deixa esta tabela 15% abaixo da matriz. `10` aplica 10% acima. A regra atua nos produtos já vinculados a esta tabela.
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Catálogo base da tabela</h4>
                        <p className="text-xs text-gray-400 mt-0.5">A tela principal mostra só os produtos que realmente ficaram nesta tabela. Para agregar ou recolocar produtos, filtre e use os botões abaixo.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setShowCatalogoBasePopup(true)}
                          className="px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700"
                        >
                          Abrir catálogo base
                        </button>
                        <button
                          type="button"
                          onClick={() => void vincularTodosCertificadosBaseNaTabela(selectedTabelaId)}
                          disabled={salvandoCatalogo}
                          className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60"
                        >
                          Repor todos do catálogo
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const selecionados = certificadosDisponiveisBaseFiltrados
                            if (!selecionados.length) { showMsg('Nenhum certificado disponível com os filtros atuais.'); return }
                            setSalvandoCatalogo(true)
                            void criarVinculosBaseDaTabela(selectedTabelaId, selecionados).then(result => {
                              setSalvandoCatalogo(false)
                              if (result.error) { showMsg('Erro ao adicionar filtrados: ' + result.error); return }
                              if (!result.inserted) { showMsg('Os certificados já estão vinculados nesta tabela.'); return }
                              showMsg(`${result.inserted} certificado(s) adicionados à tabela.`, 'ok')
                              void fetchCatalogo()
                            })
                          }}
                          disabled={salvandoCatalogo || !certificadosDisponiveisBaseFiltrados.length}
                          className="px-3 py-2 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-60"
                        >
                          Adicionar filtrados ({certificadosDisponiveisBaseFiltrados.length})
                        </button>
                      </div>
                    </div>

                    {/* ── Filtros inline ── */}
                    <div className="flex flex-wrap items-end gap-3">
                      <TextInput label="Buscar" value={tabelaCertBusca}
                        onChange={setTabelaCertBusca}
                        className="flex-1 min-w-[180px]" placeholder="Nome, código, hash..." />
                      <SelectInput label="Categoria" value={tabelaCertCategoria}
                        onChange={setTabelaCertCategoria}
                        options={[
                          { value: '', label: 'Todas' },
                          ...categoriasDisponiveis,
                        ]}
                        className="min-w-[150px]" />
                      {(tabelaCertBusca || tabelaCertCategoria) ? (
                        <button type="button" onClick={() => { setTabelaCertBusca(''); setTabelaCertCategoria('') }}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700">
                          <X size={12} /> Limpar
                        </button>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Produtos na tabela</p>
                        <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-100">{itens.length}</p>
                      </div>
                      <div className="rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Disponíveis para recolocar</p>
                        <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-100">{certificadosDisponiveisBase.length}</p>
                      </div>
                      <div className="rounded-lg border border-gray-100 dark:border-gray-800 px-3 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-gray-400">Seleção atual no popup</p>
                        <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-100">{selectedBaseCertIds.size}</p>
                      </div>
                    </div>
                  </div>

                  {showCatalogoBasePopup && (
                    <Panel title="Catálogo Base da Tabela" onClose={() => setShowCatalogoBasePopup(false)}>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div>
                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Selecione os produtos que deseja agregar ou recolocar</p>
                            <p className="text-xs text-gray-400 mt-0.5">Somente os produtos marcados serão adicionados de volta na tabela. O que já está na tabela permanece visível apenas na grade principal.</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedBaseCertIds(new Set(certificadosDisponiveisBaseFiltrados.map(cert => cert.id)))}
                              className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              Selecionar todos
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedBaseCertIds(new Set())}
                              className="px-3 py-2 border border-gray-200 dark:border-gray-700 text-xs rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              Limpar seleção
                            </button>
                            <button
                              type="button"
                              onClick={() => void vincularCertificadosBaseNaTabela(selectedTabelaId).then(() => setShowCatalogoBasePopup(false))}
                              disabled={salvandoCatalogo || selectedBaseCertIds.size === 0}
                              className="px-3 py-2 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-60"
                            >
                              Agregar selecionados ({selectedBaseCertIds.size})
                            </button>
                          </div>
                        </div>
                        {certificadosDisponiveisBase.length === 0 ? (
                          <p className="text-sm text-gray-400">Todos os certificados disponíveis já estão presentes nesta tabela.</p>
                        ) : certificadosDisponiveisBaseFiltrados.length === 0 ? (
                          <p className="text-sm text-gray-400">Nenhum certificado encontrado com os filtros aplicados.</p>
                        ) : (
                          <div className="max-h-[520px] overflow-y-auto pr-1 rounded-lg border border-gray-100 dark:border-gray-800">
                            <div className="divide-y divide-gray-100 dark:divide-gray-800">
                              {certificadosDisponiveisBaseFiltrados.map(cert => (
                                <label key={cert.id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={selectedBaseCertIds.has(cert.id)}
                                    onChange={() => setSelectedBaseCertIds(prev => {
                                      const next = new Set(prev)
                                      next.has(cert.id) ? next.delete(cert.id) : next.add(cert.id)
                                      return next
                                    })}
                                    className="mt-0.5 w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{cert.tipo}</p>
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                      {[cert.validade || null, cert.tipo_emissao_padrao || null, cert.preco_venda ? formatCurrency(cert.preco_venda) : null].filter(Boolean).join(' · ')}
                                    </p>
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Panel>
                  )}

                  {/* Itens (certificados + preços) */}
                  <div ref={tabelaProdutosSectionRef} className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Produtos e Preços</h4>
                      <div className="flex items-center gap-2 flex-wrap">
                        {selectedItemIds.size > 0 && (
                          <button type="button" onClick={excluirItensSelecionados}
                            className="flex items-center gap-1 px-2 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700">
                            <Trash2 size={12} /> Excluir selecionados ({selectedItemIds.size})
                          </button>
                        )}
                        <input ref={importItensRef} type="file" accept=".csv,.tsv,.txt,.xls,.xlsx" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) void importarItensTabelaFile(f, selectedTabelaId); e.target.value = '' }} />
                        <button type="button" onClick={() => importItensRef.current?.click()} disabled={importando}
                          className="flex items-center gap-1 px-2 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs rounded-lg hover:bg-gray-200 disabled:opacity-50">
                          <Upload size={12} /> {importando ? 'Importando...' : 'Importar Planilha'}
                        </button>
                        <button type="button" onClick={() => abrirNovoItem(selectedTabelaId)}
                          className="flex items-center gap-1 px-2 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                          <PlusCircle size={12} /> Adicionar
                        </button>
                      </div>
                    </div>

                    {showFormItem && (
                      <Panel title={editingItemId ? 'Editar Item' : 'Novo Item'} onClose={() => setShowFormItem(false)}>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="md:col-span-4">
                            <SelectInput label="Certificado *" value={formItem.certificado_id}
                              onChange={v => setFormItem(p => ({ ...p, certificado_id: v, valor: certificadoById.get(v)?.preco_venda ?? 0 }))}
                              options={certificadosAtivos.map(c => ({ value: c.id, label: `${c.codigo ? c.codigo + ' · ' : ''}${c.tipo}${c.validade ? ' · ' + c.validade : ''}` }))} />
                          </div>
                          <div className="space-y-1">
                            <span className="text-xs text-gray-500">Preço de Venda Herdado</span>
                            <div className="h-11 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 flex items-center text-sm font-semibold text-green-600 dark:text-green-400">
                              {formatCurrency(certificadoById.get(formItem.certificado_id)?.preco_venda ?? 0)}
                            </div>
                          </div>
                          <NumberInput label="Valor Custo (R$)" value={formItem.valor_custo} onChange={v => setFormItem(p => ({ ...p, valor_custo: v }))} />
                          <NumberInput label="Valor Repasse (R$)" value={formItem.valor_repasse} onChange={v => setFormItem(p => ({ ...p, valor_repasse: v }))} />
                          <ActiveSelect value={formItem.ativo} onChange={v => setFormItem(p => ({ ...p, ativo: v }))} />
                          <TextInput label="Link Safeweb" value={formItem.link_safeweb ?? ''} onChange={v => setFormItem(p => ({ ...p, link_safeweb: v || null }))} className="md:col-span-4" />
                        </div>
                        <FormActions onSave={salvarItem} onCancel={() => setShowFormItem(false)} saving={salvandoCatalogo} />
                      </Panel>
                    )}

                    {(() => {
                      const allItemIds = itens.map(i => i.id)
                      const allItemsSel = allItemIds.length > 0 && allItemIds.every(id => selectedItemIds.has(id))
                      const toggleAllItems = () => setSelectedItemIds(allItemsSel ? new Set() : new Set(allItemIds))
                      const toggleOneItem = (id: string) => setSelectedItemIds(prev => {
                        const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s
                      })
                      return (
                        <DataTable headers={['', 'Cód', 'Certificado', 'Validade', 'Preço Venda', 'Custo', 'Repasse', 'Marketplace', 'Status', 'Ações']}>
                          {itens.length === 0
                            ? <EmptyRow colSpan={10} label="Nenhum produto nesta tabela." />
                            : (
                              <>
                                <tr className="bg-gray-50 dark:bg-gray-800/50">
                                  <td className="px-4 py-2" colSpan={10}>
                                    <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-500 select-none">
                                      <input type="checkbox" checked={allItemsSel} onChange={toggleAllItems}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" />
                                      {allItemsSel ? 'Desmarcar todos' : `Selecionar todos (${itens.length})`}
                                    </label>
                                  </td>
                                </tr>
                                {itens.map(item => {
                                  const cert = certificadoById.get(item.certificado_id)
                                  return (
                                    <tr key={item.id} className={cn('hover:bg-gray-50 dark:hover:bg-gray-800/50', !item.ativo && 'opacity-50', selectedItemIds.has(item.id) && 'bg-blue-50 dark:bg-blue-900/10')}>
                                      <td className="px-4 py-3">
                                        <input type="checkbox" checked={selectedItemIds.has(item.id)} onChange={() => toggleOneItem(item.id)}
                                          className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer" />
                                      </td>
                                      <td className="px-4 py-3 text-xs text-gray-400">{cert?.codigo ?? '—'}</td>
                                      <td className="px-4 py-3 font-medium text-sm">{cert?.tipo ?? 'Cert. removido'}</td>
                                      <td className="px-4 py-3 text-sm text-gray-500">{cert?.validade ?? '—'}</td>
                                      <td className="px-4 py-3 text-green-600 dark:text-green-400 font-semibold">{formatCurrency(cert?.preco_venda ?? item.valor)}</td>
                                      <td className="px-4 py-3 text-sm text-gray-500">{formatCurrency(item.valor_custo)}</td>
                                      <td className="px-4 py-3 text-sm text-gray-500">{formatCurrency(item.valor_repasse)}</td>
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => abrirMarketplaceLink(item.link_safeweb)}
                                            title="Abrir marketplace"
                                            className="p-1 text-emerald-500 hover:text-emerald-700"
                                          >
                                            <ExternalLink size={13} />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => { void copiarMarketplaceLink(item.link_safeweb, 'Link do produto') }}
                                            title="Copiar link"
                                            className="p-1 text-emerald-500 hover:text-emerald-700"
                                          >
                                            <Copy size={13} />
                                          </button>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3"><StatusPill active={item.ativo} /></td>
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-1">
                                          <button type="button" onClick={() => editarItem(item)} title="Editar" className="p-1 text-gray-400 hover:text-blue-600"><Edit3 size={13} /></button>
                                          <button type="button" onClick={() => toggleItem(item)} title={item.ativo ? 'Inativar' : 'Ativar'} className="p-1 text-gray-400 hover:text-amber-600">
                                            {item.ativo ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                                          </button>
                                          <button type="button" onClick={() => excluirItem(item.id)} title="Excluir" className="p-1 text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                                        </div>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </>
                            )
                          }
                        </DataTable>
                      )
                    })()}
                  </div>

                  {/* Agentes permitidos */}
                  <div ref={tabelaAgentesSectionRef} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Agentes de Registro Permitidos</h4>
                        <p className="text-xs text-gray-400 mt-0.5">Esses agentes poderão aparecer para o cliente no agendamento desta tabela.</p>
                      </div>
                      <button type="button" onClick={() => abrirAssociacaoAgenteTabela(selectedTabelaId)}
                        className="flex items-center gap-1 px-2 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                        <PlusCircle size={12} /> Vincular Agente
                      </button>
                    </div>

                    {showFormAgenteTabela && formAgenteTabela.tabela_preco_id === selectedTabelaId && (
                      <Panel title="Vincular Agente à Tabela" onClose={() => setShowFormAgenteTabela(false)}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <SelectInput
                            label="Agente *"
                            value={formAgenteTabela.agente_registro_id}
                            onChange={v => setFormAgenteTabela(p => ({ ...p, agente_registro_id: v }))}
                            options={[{ value: '', label: 'Selecione' }, ...agentesRegistro.map(a => ({ value: a.id, label: a.nome }))]}
                          />
                          <SelectInput
                            label="Ponto Preferencial"
                            value={formAgenteTabela.ponto_atendimento_id}
                            onChange={v => setFormAgenteTabela(p => ({ ...p, ponto_atendimento_id: v }))}
                            options={[{ value: '', label: 'Sem ponto fixo' }, ...pontosAtivos.map(p => ({ value: p.id, label: p.nome }))]}
                          />
                          <ActiveSelect value={formAgenteTabela.ativo} onChange={v => setFormAgenteTabela(p => ({ ...p, ativo: v }))} />
                        </div>
                        <FormActions onSave={salvarAgenteTabela} onCancel={() => setShowFormAgenteTabela(false)} saving={salvandoCatalogo} />
                      </Panel>
                    )}

                    {agentesPermitidos.length === 0 ? (
                      <p className="text-sm text-gray-400">Nenhum agente vinculado ainda. Sem isso o cliente não terá lista controlada de atendimento.</p>
                    ) : (
                      <div className="space-y-2">
                        {agentesPermitidos.map(item => {
                          const agente = agentesRegistro.find(a => a.id === item.agente_registro_id)
                          const ponto = pontos.find(p => p.id === item.ponto_atendimento_id)
                          return (
                            <div key={item.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between gap-4">
                              <div>
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{agente?.nome ?? item.agente_registro_id}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {ponto ? `Ponto preferencial: ${ponto.nome}` : 'Sem ponto preferencial fixado'}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <StatusPill active={item.ativo} />
                                <button type="button" title={item.ativo ? 'Desativar' : 'Ativar'} onClick={() => void toggleAgenteTabela(item)}
                                  className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                                    item.ativo ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800')}>
                                  {item.ativo ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                </button>
                                <button type="button" title="Excluir vínculo" onClick={() => void excluirAgenteTabela(item.id)}
                                  className="w-8 h-8 rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 flex items-center justify-center transition-colors">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Prévia de Slots para o Cliente</h4>
                      <p className="text-xs text-gray-400 mt-0.5">Simulação dos próximos horários livres considerando tabela, parceiro, disponibilidade, bloqueios e ocupação.</p>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-4">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Simular parceiro, vendedor ou contador</span>
                        <select
                          value={slotPreviewParceiroId}
                          onChange={e => setSlotPreviewParceiroId(e.target.value)}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Sem filtro de parceiro</option>
                          {parceiros.map(p => (
                            <option key={p.id} value={p.id}>
                              {`${p.nome}${p.tipo_parceiro ? ` · ${(p.tipo_parceiro ?? '').toUpperCase()}` : ''}${p.cpf_cnpj ? ` · ${p.cpf_cnpj}` : ''}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-4 py-3 bg-gray-50/70 dark:bg-gray-800/30">
                        {parceiroPreview ? (
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                              Filtro ativo: {parceiroPreview.nome}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {restricoesParceiroPreview.length > 0
                                ? `Este parceiro possui ${restricoesParceiroPreview.length} vínculo(s) ativo(s) com agentes. A lista abaixo já está limitada por essa regra.`
                                : 'Este parceiro ainda não possui vínculo específico com agentes. A prévia está usando apenas a regra da tabela.'}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Selecione um parceiro para validar exatamente quais agentes e pontos aparecerão para ele no fluxo de compra e pós-compra.
                          </p>
                        )}
                      </div>
                    </div>
                    {proximosSlots.length === 0 ? (
                      <p className="text-sm text-gray-400">Nenhum slot disponível encontrado para esta combinação nos próximos 14 dias.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {proximosSlots.map(slot => {
                          const agente = agentesRegistro.find(a => a.id === slot.agente_registro_id)
                          const ponto = pontos.find(p => p.id === slot.ponto_atendimento_id)
                          return (
                            <div key={`${slot.agente_registro_id}-${slot.ponto_atendimento_id}-${slot.inicio}`} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
                              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{agente?.nome ?? 'Agente'}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{ponto?.nome ?? 'Ponto não definido'}</p>
                              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                                {new Date(slot.inicio).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · {new Date(slot.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {slot.tipo_atendimento ? capitalize(slot.tipo_atendimento.replace(/_/g, ' ')) : 'Tipo livre'} · {slot.vagas_restantes}/{slot.capacidade_total} vaga(s)
                              </p>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Participantes */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Participantes (quem acessa esta tabela)</h4>
                      <button type="button" onClick={() => abrirNovoParticipante(selectedTabelaId)}
                        className="flex items-center gap-1 px-2 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">
                        <PlusCircle size={12} /> Adicionar
                      </button>
                    </div>

                    {showFormParticipante && (
                      <Panel title="Adicionar Participante" onClose={() => setShowFormParticipante(false)}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <SelectInput label="Tipo" value={formParticipante.tipo_participante}
                            onChange={v => setFormParticipante(p => ({ ...p, tipo_participante: v as TipoParticipanteTabelaPreco, parceiro_id: null, tipo_parceiro: null, perfil: null }))}
                            options={[
                              { value: 'parceiro',      label: 'Parceiro individual' },
                              { value: 'tipo_parceiro', label: 'Tipo de parceiro'    },
                              { value: 'perfil',        label: 'Perfil de usuário'   },
                            ]} />
                          {formParticipante.tipo_participante === 'tipo_parceiro' && (
                            <SelectInput label="Tipo de Parceiro" value={formParticipante.tipo_parceiro ?? ''}
                              onChange={v => setFormParticipante(p => ({ ...p, tipo_parceiro: v as TipoParceiro }))}
                              options={TIPO_PARCEIRO_OPTS} />
                          )}
                          {formParticipante.tipo_participante === 'perfil' && (
                            <SelectInput label="Perfil" value={formParticipante.perfil ?? ''}
                              onChange={v => setFormParticipante(p => ({ ...p, perfil: v as PerfilAcesso }))}
                              options={PERFIL_OPTS} />
                          )}
                          {formParticipante.tipo_participante === 'parceiro' && (
                            <SelectInput label="Parceiro" value={formParticipante.parceiro_id ?? ''}
                              onChange={v => setFormParticipante(p => ({ ...p, parceiro_id: v }))}
                              options={parceiros.map(p => ({ value: p.id, label: `${p.cpf_cnpj ?? ''} - ${p.nome}` }))} />
                          )}
                        </div>
                        <FormActions onSave={salvarParticipante} onCancel={() => setShowFormParticipante(false)} saving={salvandoCatalogo} />
                      </Panel>
                    )}

                    {parts.length === 0
                      ? <p className="text-sm text-gray-400">Nenhum participante cadastrado. Sem participantes todos têm acesso.</p>
                      : (
                        <div className="flex flex-wrap gap-2">
                          {parts.map(p => (
                            <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs">
                              <span>
                                {p.tipo_participante === 'tipo_parceiro' && `Tipo: ${p.tipo_parceiro}`}
                                {p.tipo_participante === 'perfil' && `Perfil: ${p.perfil}`}
                                {p.tipo_participante === 'parceiro' && (() => { const parc = parceiros.find(x => x.id === p.parceiro_id); return parc ? parc.nome : p.parceiro_id })()}
                              </span>
                              <button type="button" onClick={() => excluirParticipante(p.id)} className="text-gray-400 hover:text-red-500"><X size={11} /></button>
                            </div>
                          ))}
                        </div>
                      )
                    }
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── COMISSÕES ──────────────────────────────────────── */}
        {tab === 'comissoes' && (
          <CatalogSection title="Faixas de Comissão" actionLabel="Nova Faixa" onAction={abrirNovaComissao} loading={loadingCatalogo} error={catalogoErro}>
            {showFormComissao && (
              <Panel title={editingComissaoId ? 'Editar Faixa' : 'Nova Faixa'} onClose={() => setShowFormComissao(false)}>
                <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <TextInput label="Faixa *" value={formComissao.faixa} onChange={v => setFormComissao(p => ({ ...p, faixa: v }))} className="md:col-span-2" />
                  <NumberInput label="Mín." value={formComissao.min_emissoes} onChange={v => setFormComissao(p => ({ ...p, min_emissoes: v }))} step={1} />
                  <NumberInput label="Máx." value={formComissao.max_emissoes ?? 0} onChange={v => setFormComissao(p => ({ ...p, max_emissoes: v || null }))} step={1} />
                  <NumberInput label="% Comissão" value={formComissao.percentual} onChange={v => setFormComissao(p => ({ ...p, percentual: v }))} />
                  <ActiveSelect value={formComissao.ativo} onChange={v => setFormComissao(p => ({ ...p, ativo: v }))} />
                  <NumberInput label="Valor ex. (R$)" value={formComissao.valor_exemplo ?? 0} onChange={v => setFormComissao(p => ({ ...p, valor_exemplo: v || null }))} />
                  <NumberInput label="Ordem" value={formComissao.ordem} onChange={v => setFormComissao(p => ({ ...p, ordem: v }))} step={1} />
                </div>
                <FormActions onSave={salvarComissao} onCancel={() => setShowFormComissao(false)} saving={salvandoCatalogo} />
              </Panel>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {comissoes.length === 0 ? (
                <EmptyBlock label="Nenhuma faixa cadastrada." />
              ) : comissoes.map(c => (
                <div key={c.id} className={cn('bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5', !c.ativo && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{c.faixa}</p>
                      <p className="text-4xl font-bold text-blue-600 dark:text-blue-400 mt-2">{Number(c.percentual).toLocaleString('pt-BR')}%</p>
                    </div>
                    <RowActions active={c.ativo} onEdit={() => editarComissao(c)} onToggle={() => toggleComissao(c)} />
                  </div>
                  <p className="text-xs text-gray-400 mt-2">{c.valor_exemplo ? `${formatCurrency(c.valor_exemplo)}/cert.` : 'Sem valor exemplo'}</p>
                </div>
              ))}
            </div>
          </CatalogSection>
        )}

        {/* ── PAGAMENTO ──────────────────────────────────────── */}
        {tab === 'pagamento' && (
          <CatalogSection title="Formas de Pagamento Aceitas" actionLabel="Nova Forma" onAction={abrirNovoPagamento} loading={loadingCatalogo} error={catalogoErro}>
            {showFormPagamento && (
              <Panel title={editingPagamentoId ? 'Editar Forma de Pagamento' : 'Nova Forma de Pagamento'} onClose={() => setShowFormPagamento(false)}>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <TextInput label="Nome *" value={formPagamento.nome} onChange={v => setFormPagamento(p => ({ ...p, nome: v }))} />
                  <TextInput label="Código" value={formPagamento.codigo} onChange={v => setFormPagamento(p => ({ ...p, codigo: v }))} />
                  <TextInput label="Gateway" value={formPagamento.gateway} onChange={v => setFormPagamento(p => ({ ...p, gateway: v }))} />
                  <ActiveSelect value={formPagamento.ativo} onChange={v => setFormPagamento(p => ({ ...p, ativo: v }))} />
                </div>
                <FormActions onSave={salvarPagamento} onCancel={() => setShowFormPagamento(false)} saving={salvandoCatalogo} />
              </Panel>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {pagamentos.length === 0 ? (
                <EmptyBlock label="Nenhuma forma cadastrada." />
              ) : pagamentos.map(p => (
                <div key={p.id} className={cn('bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3', !p.ativo && 'opacity-60')}>
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <CreditCard size={16} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.nome}</p>
                    <p className="text-[11px] text-gray-400 truncate">
                      {p.gateway ?? 'manual'}{p.codigo ? ` · código ${p.codigo}` : ''}
                    </p>
                  </div>
                  <RowActions active={p.ativo} onEdit={() => editarPagamento(p)} onToggle={() => togglePagamento(p)} />
                </div>
              ))}
            </div>
          </CatalogSection>
        )}

        {featureNotice && (
          <Panel title={featureNotice.title} onClose={() => setFeatureNotice(null)}>
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{featureNotice.description}</p>
              {featureNotice.nextStep && (
                <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Próximo passo previsto</p>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">{featureNotice.nextStep}</p>
                </div>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setFeatureNotice(null)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Entendi
                </button>
              </div>
            </div>
          </Panel>
        )}

        {loadingVendaFinanceiro && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" />
            Carregando fatura da venda...
          </div>
        )}

        {vendaFinanceiroModal && (
          <Panel title={`Fatura da venda ${vendaFinanceiroModal.venda.protocolo_numero ?? vendaFinanceiroModal.venda.pedido_numero ?? ''}`.trim()} onClose={() => setVendaFinanceiroModal(null)}>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <InfoCardMini label="Cliente" value={(vendaFinanceiroModal.venda.cadastros_base as { nome?: string } | null)?.nome ?? vendaFinanceiroModal.venda.nome_faturamento ?? '—'} />
                <InfoCardMini label="Valor da venda" value={formatCurrency(vendaFinanceiroModal.venda.valor_venda ?? 0)} />
                <InfoCardMini label="Pagamento" value={vendaFinanceiroModal.venda.pago ? 'Pago' : 'Pendente'} />
                <InfoCardMini label="Forma" value={(vendaFinanceiroModal.venda.metadata as { forma_pagamento?: string } | null)?.forma_pagamento ?? '—'} />
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Lançamentos financeiros vinculados</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        <th className="px-4 py-3">Descrição</th>
                        <th className="px-4 py-3">Tipo</th>
                        <th className="px-4 py-3">Vencimento</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {vendaFinanceiroModal.lancamentos.length === 0 ? (
                        <EmptyRow colSpan={5} label="Nenhum lançamento financeiro vinculado a esta venda." />
                      ) : vendaFinanceiroModal.lancamentos.map(lanc => (
                        <tr key={lanc.id}>
                          <td className="px-4 py-3">{lanc.descricao}</td>
                          <td className="px-4 py-3 capitalize">{lanc.tipo}</td>
                          <td className="px-4 py-3 text-gray-500">{new Date(lanc.vencimento).toLocaleDateString('pt-BR')}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                              {capitalize(lanc.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium">{formatCurrency(lanc.valor ?? 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Documentos vinculados</h4>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {vendaFinanceiroModal.documentos.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-gray-400">Nenhum documento financeiro vinculado a esta venda.</div>
                  ) : vendaFinanceiroModal.documentos.map(doc => (
                    <div key={doc.id} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{doc.nome_original}</p>
                        <p className="text-xs text-gray-500">
                          {doc.tipo_documento.replace(/_/g, ' ')} · {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 truncate">{doc.bucket}/{doc.storage_path}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>
        )}

        {loadingVendaNfse && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" />
            Carregando NFS-e da venda...
          </div>
        )}

        {vendaNfseModal && (
          <Panel title={`NFS-e da venda ${vendaNfseModal.venda.protocolo_numero ?? vendaNfseModal.venda.pedido_numero ?? ''}`.trim()} onClose={() => setVendaNfseModal(null)}>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <InfoCardMini label="Cliente" value={(vendaNfseModal.venda.cadastros_base as { nome?: string } | null)?.nome ?? vendaNfseModal.venda.nome_faturamento ?? '—'} />
                <InfoCardMini label="Status venda" value={STATUS_VENDA_LABEL[vendaNfseModal.venda.status_venda]} />
                <InfoCardMini label="Valor venda" value={formatCurrency(vendaNfseModal.venda.valor_venda ?? 0)} />
                <InfoCardMini label="Notas encontradas" value={String(vendaNfseModal.notas.length)} />
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">
                        <th className="px-4 py-3">Número</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Emissão</th>
                        <th className="px-4 py-3">Valor</th>
                        <th className="px-4 py-3">Verificação</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {vendaNfseModal.notas.length === 0 ? (
                        <EmptyRow colSpan={6} label="Nenhuma NFS-e vinculada a esta venda." />
                      ) : vendaNfseModal.notas.map(nota => (
                        <tr key={nota.id}>
                          <td className="px-4 py-3 font-medium">{nota.numero_nf ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              'px-2 py-0.5 rounded-full text-xs font-medium',
                              nota.status_nf === 'emitida' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                              nota.status_nf === 'erro' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                              nota.status_nf === 'cancelada' && 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
                              nota.status_nf === 'pendente' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                            )}>
                              {capitalize(nota.status_nf)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{nota.data_emissao ? new Date(nota.data_emissao).toLocaleString('pt-BR') : '—'}</td>
                          <td className="px-4 py-3">{formatCurrency(nota.valor_servico ?? 0)}</td>
                          <td className="px-4 py-3 text-gray-500">{nota.codigo_verificacao ?? '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => baixarNfsePdf(vendaNfseModal.venda, nota)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700"
                              >
                                <Download size={12} />
                                PDF
                              </button>
                              {nota.pdf_url && (
                                <button type="button" onClick={() => window.open(nota.pdf_url!, '_blank')}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                                  Abrir PDF
                                </button>
                              )}
                              {nota.xml_url && (
                                <button type="button" onClick={() => window.open(nota.xml_url!, '_blank')}
                                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
                                  XML
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void encaminharNfsePorEmail(vendaNfseModal.venda, nota)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                              >
                                <Mail size={12} />
                                E-mail
                              </button>
                              <button
                                type="button"
                                onClick={() => void encaminharNfsePorWhatsApp(vendaNfseModal.venda, nota)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                              >
                                <MessageCircle size={12} />
                                WhatsApp
                              </button>
                              <button
                                type="button"
                                onClick={() => void excluirRegistroNfse(vendaNfseModal.venda, nota)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-950/20"
                              >
                                <Trash2 size={12} />
                                Excluir
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Prévia do corpo da nota</h4>
                    <button
                      type="button"
                      onClick={() => setShowVendaNfsePreviewTelaCheia(true)}
                      className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Abrir nota em tela cheia
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto bg-gray-50 dark:bg-gray-950 p-4">
                  <NfseDocumentPreview
                    {...buildNfsePreviewProps(vendaNfseModal.venda, vendaNfseModal.notas[0] ?? null)}
                    className="min-w-[820px]"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button type="button"
                  onClick={() => emitirNfseMock(vendaNfseModal.venda)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition-colors">
                  <FileText size={13} />
                  Emitir NFS-e (Mock)
                </button>
              </div>
            </div>
          </Panel>
        )}

        {nfseOverrideModal && (
          <Panel
            title={nfseOverrideModal.lote ? 'Emitir NFS-e fora da etapa em lote' : 'Emitir NFS-e fora da etapa'}
            onClose={() => { if (!emitindoNfseLote) setNfseOverrideModal(null) }}
          >
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/20 px-4 py-3">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  {nfseOverrideModal.motivoPadrao}
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  Você pode seguir manualmente sem travar a operação. Essa decisão ficará registrada no histórico fiscal.
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 bg-gray-50 dark:bg-gray-900/40">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {nfseOverrideModal.lote
                    ? `${nfseOverrideModal.vendas.length} venda(s) selecionada(s) para emissão excepcional.`
                    : `Venda selecionada: ${nfseOverrideModal.vendas[0]?.nome_faturamento ?? nfseOverrideModal.vendas[0]?.cadastros_base?.nome ?? 'cliente'}.`}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Justificativa da exceção {nfseAutomationSettings.exigir_justificativa_fora_etapa ? '*' : ''}
                </label>
                <textarea
                  value={nfseOverrideModal.justificativa}
                  onChange={e => setNfseOverrideModal(prev => prev ? { ...prev, justificativa: e.target.value } : prev)}
                  rows={4}
                  placeholder="Ex: cliente pagou e precisa da nota agora, mas a validação será realizada depois."
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNfseOverrideModal(null)}
                  disabled={emitindoNfseLote}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmarEmissaoForaDaEtapa()}
                  disabled={emitindoNfseLote}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-60"
                >
                  {emitindoNfseLote ? 'Emitindo...' : 'Emitir mesmo assim'}
                </button>
              </div>
            </div>
          </Panel>
        )}

        {showVendaNfsePreviewTelaCheia && vendaNfseModal && (
          <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm p-4">
            <div className="h-full w-full rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col">
              <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Prévia da NFS-e</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Visualização ampliada da nota vinculada à venda.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVendaNfsePreviewTelaCheia(false)}
                  className="w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
                  title="Fechar"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-950 p-5">
                <NfseDocumentPreview
                  {...buildNfsePreviewProps(vendaNfseModal.venda, vendaNfseModal.notas[0] ?? null)}
                  className="min-w-[1100px] mx-auto"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── IMPORTAR ───────────────────────────────────────── */}
        {tab === 'importar' && (
          <div className="space-y-6">

            {/* Relatório Safeweb */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Upload size={18} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-100">Relatório Mensal Safeweb</h3>
                  <p className="text-xs text-gray-500">Importa clientes e vendas do relatório XLS/XLSX recebido mensalmente da Safeweb.</p>
                </div>
              </div>

              <div className="mt-4 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p className="font-medium text-gray-700 dark:text-gray-300">Colunas esperadas (separadas por ponto-e-vírgula ou tabela XLS):</p>
                <p>Protocolo · Nome · Documento · Produto · Tipo de Emissão Realizada · Valor do Boleto</p>
                <p>Data Inicio Validade · Data Fim Validade · Numero de Série · VoucherCodigo · VoucherPercentual · VoucherValor</p>
                <p>Nome da Autoridade de Registro · Nome do Local de Atendimento · Status do Certificado · Nome do Parceiro</p>
                <p>E-mail do Titular · Telefone do Titular</p>
              </div>

              {resultSafeweb && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
                      <Check size={16} /> Batimento concluído
                    </div>
                    <button type="button" onClick={() => setResultSafeweb(null)}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline">
                      Concluir
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{resultSafeweb.clientes}</p>
                      <p className="text-xs text-gray-500 mt-1">Clientes processados</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-green-700 dark:text-green-400">{resultSafeweb.atualizados}</p>
                      <p className="text-xs text-gray-500 mt-1">Batidos (já no CRM)</p>
                    </div>
                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{resultSafeweb.novos}</p>
                      <p className="text-xs text-gray-500 mt-1">Novos (só na Safeweb)</p>
                    </div>
                    <div className={cn('rounded-xl p-3 text-center', resultSafeweb.divergentes > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-gray-50 dark:bg-gray-800')}>
                      <p className={cn('text-2xl font-bold', resultSafeweb.divergentes > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-400')}>{resultSafeweb.divergentes}</p>
                      <p className="text-xs text-gray-500 mt-1">No CRM sem validação</p>
                    </div>
                  </div>
                  {resultSafeweb.divergentes > 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Existem <strong>{resultSafeweb.divergentes}</strong> venda(s) com status "emitido" no CRM que não foram encontradas na planilha Safeweb.
                      Acesse a aba <strong>Lançar Vendas</strong> e filtre por "Não validadas" para revisar e ajustar manualmente.
                    </p>
                  )}
                </div>
              )}

              <div className="mt-5 flex items-center gap-3">
                <input ref={importSafewebRef} type="file" accept=".xls,.xlsx,.csv,.tsv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) void importarRelatorioSafeweb(f); e.target.value = '' }} />
                <button type="button" onClick={() => importSafewebRef.current?.click()} disabled={importandoSafeweb}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                  {importandoSafeweb ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {importandoSafeweb ? 'Importando...' : 'Selecionar arquivo'}
                </button>
                <span className="text-xs text-gray-400">Suporta XLS, XLSX, CSV</span>
              </div>

              <p className="mt-4 text-xs text-amber-600 dark:text-amber-400">
                Antes de importar, aplique a migration <code className="font-mono bg-amber-50 dark:bg-amber-900/20 px-1 rounded">20260522_vendas_safeweb_campos.sql</code> no Supabase.
              </p>
            </div>

            {/* Importar Clientes (sistema antigo) */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <UserCheck size={18} className="text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-100">Importar Base de Clientes</h3>
                  <p className="text-xs text-gray-500">Importa o cadastro de clientes exportado do sistema antigo (CSV/XLS com campos de endereço).</p>
                </div>
              </div>

              <div className="mt-4 bg-gray-50 dark:bg-gray-800 rounded-xl p-4 text-xs text-gray-500 dark:text-gray-400 space-y-1">
                <p className="font-medium text-gray-700 dark:text-gray-300">Colunas esperadas:</p>
                <p>Tipo · CNPJ/CPF · Nome/Razão Social · Nome Fantasia · E-mail · DDD · Telefone</p>
                <p>CEP · Endereço · Número · Complemento · Bairro · Cidade · UF · IE · IM · Contador</p>
              </div>

              {resultClientes && (
                <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-sm text-green-700 dark:text-green-400">
                  <Check size={16} />
                  <span>Importação concluída: <strong>{resultClientes.inseridos}</strong> novo(s) · <strong>{resultClientes.atualizados}</strong> atualizado(s).</span>
                </div>
              )}

              <div className="mt-5 flex items-center gap-3">
                <input ref={importClientesRef} type="file" accept=".xls,.xlsx,.csv,.tsv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) void importarClientes(f); e.target.value = '' }} />
                <button type="button" onClick={() => importClientesRef.current?.click()} disabled={importandoClientes}
                  className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                  {importandoClientes ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  {importandoClientes ? 'Importando...' : 'Selecionar arquivo'}
                </button>
                <span className="text-xs text-gray-400">Suporta XLS, XLSX, CSV</span>
              </div>
            </div>

            {/* Dados importados da Safeweb */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                    <List size={18} className="text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 dark:text-gray-100">Dados Importados da Safeweb</h3>
                    <p className="text-xs text-gray-500">Visualize as vendas validadas pelo relatório Safeweb (validado_safeweb = true).</p>
                  </div>
                </div>
                <button type="button"
                  onClick={() => {
                    const next = !safewebViewerOpen
                    setSafewebViewerOpen(next)
                    if (next) void carregarSafewebVendas()
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-xl transition-colors">
                  {safewebViewerOpen ? 'Fechar' : 'Ver registros'}
                </button>
              </div>

              {safewebViewerOpen && (
                <div className="mt-4">
                  {loadingSafewebVendas ? (
                    <div className="flex items-center gap-2 text-gray-400 text-sm py-4"><Loader2 size={16} className="animate-spin" /> Carregando...</div>
                  ) : safewebVendas.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4">Nenhum registro importado da Safeweb encontrado.</p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500 mb-3">{safewebVendas.length} registro(s) encontrado(s)</p>
                      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                        <table className="w-full text-xs min-w-[1400px]">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left border-b border-gray-200 dark:border-gray-800">
                              {['Protocolo', 'Cliente', 'CPF/CNPJ', 'Produto', 'Valor', 'Início Validade', 'Vencimento', 'Nº Série', 'Voucher', 'AR', 'Parceiro Safeweb', 'Status Cert.'].map(h => (
                                <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {safewebVendas.map(v => (
                              <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className="px-3 py-2 font-mono text-blue-600 dark:text-blue-400 whitespace-nowrap">{v.protocolo_numero ?? '—'}</td>
                                <td className="px-3 py-2 max-w-[160px] truncate">{(v.cadastros_base as { nome?: string } | null)?.nome ?? v.nome_faturamento ?? '—'}</td>
                                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{(v.cadastros_base as { cpf_cnpj?: string } | null)?.cpf_cnpj ?? v.documento_faturamento ?? '—'}</td>
                                <td className="px-3 py-2 text-gray-600 dark:text-gray-300 max-w-[140px] truncate">{v.tipo_produto ?? '—'}</td>
                                <td className="px-3 py-2 text-right font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">{v.valor_venda ? formatCurrency(v.valor_venda) : '—'}</td>
                                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{(v as any).data_inicio_validade ? new Date((v as any).data_inicio_validade).toLocaleDateString('pt-BR') : '—'}</td>
                                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{v.data_vencimento ? new Date(v.data_vencimento).toLocaleDateString('pt-BR') : '—'}</td>
                                <td className="px-3 py-2 text-gray-500 font-mono max-w-[120px] truncate">{(v as any).numero_serie ?? '—'}</td>
                                <td className="px-3 py-2 text-gray-500">{(v as any).voucher_codigo ?? '—'}</td>
                                <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{(v as any).nome_ar ?? '—'}</td>
                                <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{(v as any).nome_parceiro_safeweb ?? '—'}</td>
                                <td className="px-3 py-2">
                                  {(v as any).status_certificado
                                    ? <span className="px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 whitespace-nowrap">{(v as any).status_certificado}</span>
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

          </div>
        )}

      </div>

      {/* ── MODAL EMITIR PROTOCOLO ─────────────────────────── */}
      {showProtocolo && protocoloVenda && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gray-800 rounded-t-2xl">
              <h2 className="text-white font-semibold">Emitir Protocolo</h2>
              <button type="button" onClick={() => setShowProtocolo(false)} className="text-gray-400 hover:text-white"><X size={18} /></button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* info da venda */}
              <div>
                <p className="text-xs text-gray-500">Comprador:</p>
                <p className="text-blue-600 dark:text-blue-400 font-medium">
                  {(protocoloVenda.cadastros_base as { nome?: string } | null)?.nome ?? protocoloVenda.nome_faturamento ?? '—'}
                </p>
              </div>
              <div className="flex gap-8 pt-2 border-t border-gray-100 dark:border-gray-800">
                <div>
                  <p className="text-xs text-gray-500">Pedido:</p>
                  <p className="text-blue-600 font-medium">{protocoloVenda.pedido_numero ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Certificado:</p>
                  <p className="text-blue-600 font-medium">
                    {protocoloVenda.certificado_id ? (certificadoById.get(protocoloVenda.certificado_id)?.tipo ?? '—') : protocoloVenda.tipo_produto}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                {/* step 1: CPF + nascimento */}
                <div className="flex flex-wrap items-end gap-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">CPF do Titular:</span>
                    <input value={formProtocolo.cpf} onChange={e => setFormProtocolo(p => ({ ...p, cpf: e.target.value }))}
                      readOnly={protocoloStep === 'form'}
                      placeholder="000.000.000-00"
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 w-40 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Data Nascimento:</span>
                    <input type="date" value={formProtocolo.data_nascimento} onChange={e => setFormProtocolo(p => ({ ...p, data_nascimento: e.target.value }))}
                      readOnly={protocoloStep === 'form'}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 w-40 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 pb-2">
                    <input type="checkbox" checked={formProtocolo.possui_cnh}
                      onChange={e => setFormProtocolo(p => ({ ...p, possui_cnh: e.target.checked }))} />
                    Possui CNH
                  </label>
                  {protocoloStep === 'validate' && (
                    <button type="button" onClick={() => void validarTitular()} disabled={validandoProtocolo}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                      <Check size={14} /> {validandoProtocolo ? 'Validando...' : 'Validar'}
                    </button>
                  )}
                </div>

                {/* step 2: dados do titular */}
                {protocoloStep === 'form' && (
                  <div className="mt-5 space-y-4">
                    <p className="text-blue-600 dark:text-blue-400 text-sm font-medium">Informe os dados para emissão do protocolo:</p>

                    <div className="grid grid-cols-1 gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Nome:</span>
                        <input value={formProtocolo.nome} onChange={e => setFormProtocolo(p => ({ ...p, nome: e.target.value }))}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[1fr_80px_150px] gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Email:</span>
                        <input type="email" value={formProtocolo.email} onChange={e => setFormProtocolo(p => ({ ...p, email: e.target.value }))}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">DDD:</span>
                        <input value={formProtocolo.ddd} onChange={e => setFormProtocolo(p => ({ ...p, ddd: e.target.value }))} maxLength={3}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Telefone:</span>
                        <input value={formProtocolo.telefone} onChange={e => setFormProtocolo(p => ({ ...p, telefone: e.target.value }))}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">CEP:</span>
                        <input value={formProtocolo.cep} onChange={e => setFormProtocolo(p => ({ ...p, cep: e.target.value }))}
                          onBlur={async e => {
                            const r = await buscarCep(e.target.value)
                            if (!r) return
                            setFormProtocolo(p => ({
                              ...p,
                              logradouro: r.logradouro || p.logradouro,
                              bairro:     r.bairro     || p.bairro,
                              cidade:     r.localidade || p.cidade,
                              uf:         r.uf         || p.uf,
                              ibge:       r.ibge       || p.ibge,
                            }))
                          }}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                      <label className="flex flex-col gap-1 md:col-span-2">
                        <span className="text-xs text-gray-500">Logradouro:</span>
                        <input value={formProtocolo.logradouro} onChange={e => setFormProtocolo(p => ({ ...p, logradouro: e.target.value }))}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Número:</span>
                        <input value={formProtocolo.numero} onChange={e => setFormProtocolo(p => ({ ...p, numero: e.target.value }))}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Complemento:</span>
                        <input value={formProtocolo.complemento} onChange={e => setFormProtocolo(p => ({ ...p, complemento: e.target.value }))}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Bairro:</span>
                        <input value={formProtocolo.bairro} onChange={e => setFormProtocolo(p => ({ ...p, bairro: e.target.value }))}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Cidade:</span>
                        <input value={formProtocolo.cidade} onChange={e => setFormProtocolo(p => ({ ...p, cidade: e.target.value }))}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">UF:</span>
                        <input value={formProtocolo.uf} onChange={e => setFormProtocolo(p => ({ ...p, uf: e.target.value }))} maxLength={2}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">IBGE:</span>
                        <input value={formProtocolo.ibge} onChange={e => setFormProtocolo(p => ({ ...p, ibge: e.target.value }))}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">CEI:</span>
                        <input value={formProtocolo.cei} onChange={e => setFormProtocolo(p => ({ ...p, cei: e.target.value }))}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">CAEPF do responsável:</span>
                        <input value={formProtocolo.caepf} onChange={e => setFormProtocolo(p => ({ ...p, caepf: e.target.value }))}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Número NIS:</span>
                        <input value={formProtocolo.nis} onChange={e => setFormProtocolo(p => ({ ...p, nis: e.target.value }))}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                    </div>

                    <div>
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-2">Se possuir um voucher de desconto informe o código abaixo:</p>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500">Código do Voucher:</span>
                        <input value={formProtocolo.codigo_voucher} onChange={e => setFormProtocolo(p => ({ ...p, codigo_voucher: e.target.value }))}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </label>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800">
                      <button type="button" onClick={() => setShowProtocolo(false)}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                        <XCircle size={14} /> Cancelar
                      </button>
                      <button type="button" onClick={() => void confirmarProtocolo()} disabled={emitindoProtocolo}
                        className="flex items-center gap-2 px-5 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                        <ClipboardList size={14} /> {emitindoProtocolo ? 'Emitindo...' : 'Emitir Protocolo'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal flutuante de edição de certificado */}
      {showFormCert && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowFormCert(false)} />
          <div className="relative z-[10000] w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {editingCertId ? 'Editar Certificado' : 'Novo Certificado'}
              </h3>
              <button type="button" title="Fechar" onClick={() => setShowFormCert(false)}>
                <X size={16} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <NumberInput label="Código" value={formCert.codigo ?? 0} onChange={v => setFormCert(p => ({ ...p, codigo: v || null }))} step={1} />
                <SelectInput
                  label="Status"
                  value={normalizeStatusProduto(formCert.status_produto, formCert.ativo)}
                  onChange={v => setFormCert(p => ({ ...p, status_produto: v, ativo: /^ativo$/i.test(v) }))}
                  options={[
                    { value: 'Ativo', label: 'Ativo' },
                    { value: 'Inativo', label: 'Inativo' },
                  ]}
                />
                <TextInput label="Nome *" value={formCert.tipo} onChange={v => setFormCert(p => ({ ...p, tipo: v }))} className="md:col-span-3" />
                <TextInput label="Tipo Emissão" value={formCert.tipo_emissao_padrao ?? ''} onChange={v => setFormCert(p => ({ ...p, tipo_emissao_padrao: v || null }))} />
                <NumberInput label="Validade (meses) *" value={formCert.validade_meses ?? 0} onChange={v => setFormCert(p => ({ ...p, validade_meses: v || null, validade: v ? `${v} meses` : '' }))} step={1} min={0} />
                <TextInput label="Período de Uso (Fast)" value={formCert.periodo_uso ?? ''} onChange={v => setFormCert(p => ({ ...p, periodo_uso: v || null }))} />
                <TextInput label="Tipo" value={formCert.categoria ?? ''} onChange={v => setFormCert(p => ({ ...p, categoria: v || null }))} />
                <TextInput label="Modelo" value={formCert.modelo ?? ''} onChange={v => setFormCert(p => ({ ...p, modelo: v || null }))} />
                <TextInput label="Agrupador (e-commerce)" value={formCert.agrupador ?? ''} onChange={v => setFormCert(p => ({ ...p, agrupador: v || null }))} className="md:col-span-2" />
                <TextInput label="Produto Vinculado na AC" value={formCert.produto_vinculado_ac ?? ''} onChange={v => setFormCert(p => ({ ...p, produto_vinculado_ac: v || null }))} className="md:col-span-3" />
                <TextInput label="Hash" value={formCert.hash ?? ''} onChange={v => setFormCert(p => ({ ...p, hash: v || null }))} className="md:col-span-2" />
                <NumberInput label="Preço de Venda (R$)" value={formCert.preco_venda} onChange={v => setFormCert(p => ({ ...p, preco_venda: v }))} />
                <NumberInput label="Valor Custo AC (R$)" value={formCert.valor_custo_ac} onChange={v => setFormCert(p => ({ ...p, valor_custo_ac: v }))} />
                <NumberInput label="Valor Custo AR (R$)" value={formCert.valor_custo} onChange={v => setFormCert(p => ({ ...p, valor_custo: v }))} />
                <TextInput label="Descrição" value={formCert.descricao ?? ''} onChange={v => setFormCert(p => ({ ...p, descricao: v || null }))} className="md:col-span-6" />
              </div>
              <label className="flex flex-col gap-1 mt-3">
                <span className="text-xs text-gray-500">Descrição do Produto</span>
                <textarea rows={2} value={formCert.descricao_produto ?? ''} onChange={e => setFormCert(p => ({ ...p, descricao_produto: e.target.value || null }))}
                  className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </label>
              <FormActions onSave={salvarCertificado} onCancel={() => setShowFormCert(false)} saving={salvandoCatalogo} />
            </div>
          </div>
        </div>,
        document.body
      )}

      {toast && createPortal(
        <div className={cn(
          'fixed bottom-6 right-6 z-[99999] flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium',
          toast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
        )}>
          {toast.msg}
          <button type="button" title="Fechar" onClick={() => setToast(null)} className="ml-1 opacity-80 hover:opacity-100">
            <X size={14} />
          </button>
        </div>,
        document.body
      )}
    </ModulePageShell>
  )
}

// ── shared UI components ───────────────────────────────────────

function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="font-semibold text-gray-800 dark:text-gray-200">{title}</h2>
      <button type="button" onClick={onAction}
        className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
        <PlusCircle size={14} /> {actionLabel}
      </button>
    </div>
  )
}

function CatalogSection({ title, actionLabel, onAction, loading, error, children }: {
  title: string; actionLabel: string; onAction: () => void; loading: boolean; error: string | null; children: React.ReactNode
}) {
  if (loading) return <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 size={16} className="animate-spin" /> Carregando catálogo...</div>

  if (error) {
    const missingMarketplaceTable = error.includes("public.lojas_marketplace")
    return (
      <div className="space-y-4">
        <SectionHeader title={title} actionLabel={actionLabel} onAction={onAction} />
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg p-4 text-sm">
          {missingMarketplaceTable
            ? <>Erro ao carregar catálogo comercial: {error}. Execute o arquivo <strong>sql/marketplace_lojas_fix.sql</strong> no Supabase ou aplique as migrations de marketplace de 23/05/2026.</>
            : <>Erro ao carregar catálogo comercial: {error}. Verifique as migrations comerciais do projeto no Supabase.</>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionHeader title={title} actionLabel={actionLabel} onAction={onAction} />
      {children}
    </div>
  )
}

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</h3>
        <button type="button" title="Fechar" onClick={onClose}><X size={16} className="text-gray-400" /></button>
      </div>
      {children}
    </div>
  )
}

function FormActions({ onSave, onCancel, saving, disabled = false }: {
  onSave: () => void; onCancel: () => void; saving: boolean; disabled?: boolean
}) {
  return (
    <div className="flex gap-2 mt-4">
      <button type="button" onClick={onSave} disabled={saving || disabled}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        {saving ? 'Salvando...' : 'Salvar'}
      </button>
      <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancelar</button>
    </div>
  )
}

function TextInput({ label, value, onChange, onBlur, type = 'text', className, disabled = false, placeholder }: {
  label: string; value: string; onChange: (value: string) => void; onBlur?: () => void; type?: string; className?: string; disabled?: boolean; placeholder?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs text-gray-500">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} onBlur={onBlur} disabled={disabled} placeholder={placeholder}
        className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-900/60" />
    </label>
  )
}

function NumberInput({ label, value, onChange, step = 0.01, disabled = false, min = 0 }: {
  label: string; value: number; onChange: (value: number) => void; step?: number; disabled?: boolean; min?: number
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <input type="number" min={min} step={step} value={value || ''} onChange={e => onChange(parseFloat(e.target.value) || 0)} disabled={disabled}
        className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-900/60" />
    </label>
  )
}

function SelectInput({ label, value, onChange, options, className, disabled = false }: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
  disabled?: boolean
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs text-gray-500">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
        className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400 dark:disabled:bg-gray-900/60">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

function ClienteSearchInput({ value, onChange, onSelect, className }: {
  value: string
  onChange: (v: string) => void
  onSelect: (nome: string, telefone: string | null) => void
  className?: string
}) {
  const [resultados, setResultados] = useState<Pick<CadastroBase, 'id' | 'nome' | 'cpf_cnpj' | 'telefone'>[]>([])
  const [buscando, setBuscando] = useState(false)
  const [aberto, setAberto] = useState(false)
  const justSelected = useRef(false)

  useEffect(() => {
    if (justSelected.current) { justSelected.current = false; return }
    if (value.length < 3) { setResultados([]); setAberto(false); return }
    const t = setTimeout(async () => {
      setBuscando(true)
      const data = await searchAivenCommercialCustomers(value)
      setBuscando(false)
      setResultados(data as Pick<CadastroBase, 'id' | 'nome' | 'cpf_cnpj' | 'telefone'>[])
      setAberto(data.length > 0)
    }, 300)
    return () => { clearTimeout(t); setBuscando(false) }
  }, [value])

  return (
    <label className={cn('flex flex-col gap-1 relative', className)}>
      <span className="text-xs text-gray-500">Cliente *</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder="Digite nome ou CPF/CNPJ…"
        className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {buscando && <span className="absolute right-3 top-8 text-xs text-gray-400">buscando…</span>}
      {aberto && resultados.length > 0 && (
        <ul className="absolute top-full left-0 right-0 z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg mt-1 overflow-hidden">
          {resultados.map(r => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={() => { justSelected.current = true; onSelect(r.nome, r.telefone ?? null); setAberto(false); setResultados([]) }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
              >
                <span className="font-medium">{r.nome}</span>
                {r.cpf_cnpj && <span className="text-xs text-gray-400 ml-2">{r.cpf_cnpj}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  )
}

function ActiveSelect({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-500">Status</span>
      <select value={value ? 'ativo' : 'inativo'} onChange={e => onChange(e.target.value === 'ativo')}
        className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
        <option value="ativo">Ativo</option>
        <option value="inativo">Inativo</option>
      </select>
    </label>
  )
}

function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">
            {headers.map(h => <th key={h} className="px-5 py-3">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">{children}</tbody>
      </table>
    </div>
  )
}

function RowActions({ active, onEdit, onToggle, onDelete }: { active: boolean; onEdit: () => void; onToggle: () => void; onDelete?: () => void }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button type="button" title="Editar" onClick={onEdit}
        className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 flex items-center justify-center transition-colors">
        <Edit3 size={14} />
      </button>
      <button type="button" title={active ? 'Desativar' : 'Ativar'} onClick={onToggle}
        className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
          active ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800')}>
        {active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
      </button>
      {onDelete && (
        <button type="button" title="Excluir" onClick={onDelete}
          className="w-8 h-8 rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 flex items-center justify-center transition-colors">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  )
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
      active ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400')}>
      {active ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function LoadingRow({ colSpan }: { colSpan: number }) {
  return <tr><td colSpan={colSpan} className="px-5 py-8 text-center text-gray-400 animate-pulse">Carregando...</td></tr>
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return <tr><td colSpan={colSpan} className="px-5 py-8 text-center text-gray-400">{label}</td></tr>
}

function EmptyBlock({ label }: { label: string }) {
  return <div className="col-span-full text-center py-10 text-gray-400 text-sm">{label}</div>
}

function InfoCardMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 bg-gray-50/70 dark:bg-gray-800/30">
      <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mt-1">{value}</p>
    </div>
  )
}

function statusVendaV2Cls(s: StatusVendaCertificado) {
  const m: Record<StatusVendaCertificado, string> = {
    rascunho:     'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    vendido:      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    agendado:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    em_validacao: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    emitido:      'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    cancelado:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }
  return m[s]
}

function statusAgendaCls(s: StatusAgendamento) {
  const m: Record<StatusAgendamento, string> = {
    confirmado: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    aguardando: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    realizado:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    cancelado:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }
  return m[s]
}

function formatCurrency(value: number) {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function VendaActionBtn({ icon: Icon, label, onClick }: {
  icon: React.ComponentType<{ size?: number }>; label: string; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">
      <Icon size={12} /> {label}
    </button>
  )
}

const VENDA_ICON_COLORS = {
  blue:    'text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20',
  purple:  'text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20',
  emerald: 'text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20',
  orange:  'text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20',
  teal:    'text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20',
  red:     'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20',
  gray:    'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800',
  green:   'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20',
} as const

function VendaIconBtn({ icon: Icon, title, onClick, color }: {
  icon: React.ComponentType<{ size?: number }>; title: string
  onClick: () => void; color: keyof typeof VENDA_ICON_COLORS
}) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={cn('w-6 h-6 rounded flex items-center justify-center transition-colors', VENDA_ICON_COLORS[color])}>
      <Icon size={12} />
    </button>
  )
}






