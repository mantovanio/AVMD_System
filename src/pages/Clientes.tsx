import { Fragment, useState, useEffect, useCallback } from 'react'
import { Search, X, ChevronDown, ChevronUp, Loader2, RefreshCcw, Plus, Pencil, MessageCircle, Mail, LifeBuoy, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { buscarCep } from '@/lib/cep'
import { openCentralChat } from '@/lib/chatNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { buildSafeIlikePattern, hasPerfil } from '@/lib/security'
import type { Agendamento, CommunicationOutbox, RenovacaoV2 } from '@/types'

type TipoCliente = 'pessoa_fisica' | 'pessoa_juridica'

interface Cliente {
  id: string
  tipo_cliente: TipoCliente
  cpf_cnpj: string
  nome: string
  nome_fantasia: string | null
  email: string | null
  telefone: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  inscricao_municipal: string | null
  inscricao_estadual: string | null
  iss_retido: boolean | null
  status: 'ativo' | 'inativo'
  created_at: string
}

interface VendaResumida {
  id: string
  protocolo_numero: string | null
  tipo_produto: string
  valor_venda: number | null
  status_venda: string
  data_inicio_validade: string | null
  data_vencimento: string | null
  validado_safeweb: boolean | null
  vendedor_id: string | null
  agente_registro_id: string | null
  created_at: string
}

interface RenovacaoResumo extends RenovacaoV2 {}

interface ContatoHistorico {
  id: string
  origem: 'outbox' | 'evento'
  canal: string
  destino: string
  status: string
  assunto: string | null
  corpo: string
  created_at: string
}

interface ClienteDetalhe {
  vendas: VendaResumida[]
  renovacoes: RenovacaoResumo[]
  contatos: ContatoHistorico[]
  agendamentos: Agendamento[]
}

interface ClienteComVendas extends Cliente {
  total_vendas: number
  valor_total: number
  ultimo_produto: string | null
  ultima_compra: string | null
  ultimo_agente_id: string | null
}

type ClienteFormState = {
  tipo_cliente: TipoCliente
  cpf_cnpj: string
  nome: string
  nome_fantasia: string
  email: string
  telefone: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  inscricao_municipal: string
  inscricao_estadual: string
  iss_retido: boolean
  status: 'ativo' | 'inativo'
}

type ClienteModalState = { mode: 'novo' | 'editar'; cliente?: ClienteComVendas } | null

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]

function emptyClienteForm(): ClienteFormState {
  return {
    tipo_cliente: 'pessoa_fisica',
    cpf_cnpj: '',
    nome: '',
    nome_fantasia: '',
    email: '',
    telefone: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    inscricao_municipal: '',
    inscricao_estadual: '',
    iss_retido: false,
    status: 'ativo',
  }
}

function formatDoc(v: string) {
  if (v.length === 11) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (v.length === 14) return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return v
}

function normalizeDigits(v: string | null | undefined) {
  return (v ?? '').replace(/\D/g, '')
}

function buildPhoneCandidates(phone: string | null) {
  const digits = normalizeDigits(phone)
  if (!digits) return []

  const variants = new Set<string>([phone ?? '', digits])
  if (digits.length >= 10) variants.add(`+55${digits}`)
  if (digits.startsWith('55') && digits.length > 11) variants.add(`+${digits}`)
  return [...variants].filter(Boolean)
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(v: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  return d.toLocaleDateString('pt-BR')
}

function formatDateTime(v: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  return d.toLocaleString('pt-BR')
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  emitido:      { label: 'Emitido',      cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  vendido:      { label: 'Vendido',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelado:    { label: 'Cancelado',    cls: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400' },
  agendado:     { label: 'Agendado',     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  em_validacao: { label: 'Em validação', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' },
  rascunho:     { label: 'Rascunho',     cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
}

export default function Clientes() {
  const { profile } = useAuth()
  const canAccessChat = hasPerfil(profile, 'admin', 'agente_registro', 'usuario')
  const [clientes, setClientes] = useState<ClienteComVendas[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filterTipo, setFilterTipo] = useState<'' | TipoCliente>('')
  const [filterStatus, setFilterStatus] = useState<'' | 'ativo' | 'inativo'>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detalhes, setDetalhes] = useState<Record<string, ClienteDetalhe>>({})
  const [loadingDetalhe, setLoadingDetalhe] = useState<string | null>(null)
  const [profileNomes, setProfileNomes] = useState<Map<string, string>>(new Map())
  const [pageSize, setPageSize] = useState(50)
  const [clienteModal, setClienteModal] = useState<ClienteModalState>(null)
  const [clienteForm, setClienteForm] = useState<ClienteFormState>(emptyClienteForm())
  const [savingCliente, setSavingCliente] = useState(false)

  async function resolveProfiles(ids: string[]) {
    const unknown = ids.filter(id => !profileNomes.has(id))
    if (!unknown.length) return
    const { data } = await supabase.from('profiles').select('id, nome').in('id', unknown)
    if (data?.length) {
      setProfileNomes(prev => {
        const next = new Map(prev)
        for (const p of data) next.set(p.id as string, p.nome as string)
        return next
      })
    }
  }

  const fetchClientes = useCallback(async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('cadastros_base')
        .select('id, tipo_cliente, cpf_cnpj, nome, nome_fantasia, email, telefone, cep, logradouro, numero, complemento, bairro, cidade, uf, inscricao_municipal, inscricao_estadual, iss_retido, status, created_at', { count: 'exact' })
        .order('nome')
        .range(page * pageSize, page * pageSize + pageSize - 1)

      if (search) {
        const safeSearch = buildSafeIlikePattern(search)
        if (safeSearch) {
          q = q.or(`nome.ilike.${safeSearch},cpf_cnpj.ilike.${safeSearch},nome_fantasia.ilike.${safeSearch}`)
        }
      }
      if (filterTipo)   q = q.eq('tipo_cliente', filterTipo)
      if (filterStatus) q = q.eq('status', filterStatus)

      const { data, count, error } = await q
      if (error) { console.error(error); return }

      const ids = (data ?? []).map(c => c.id as string)
      setTotal(count ?? 0)

      if (ids.length === 0) { setClientes([]); return }

      const { data: vendasData } = await supabase
        .from('vendas_certificados')
        .select('cadastro_base_id, tipo_produto, valor_venda, created_at, vendedor_id, agente_registro_id')
        .in('cadastro_base_id', ids)

      const vendasPorCliente = new Map<string, {
        count: number; valor: number
        ultimo_produto: string | null; ultima: string | null
        ultimo_agente_id: string | null
      }>()

      const agentIds: string[] = []

      for (const v of vendasData ?? []) {
        const cid = v.cadastro_base_id as string
        const cur = vendasPorCliente.get(cid) ?? { count: 0, valor: 0, ultimo_produto: null, ultima: null, ultimo_agente_id: null }
        cur.count++
        cur.valor += (v.valor_venda as number) ?? 0
        if (!cur.ultima || (v.created_at as string) > cur.ultima) {
          cur.ultima = v.created_at as string
          cur.ultimo_produto = v.tipo_produto as string
          cur.ultimo_agente_id = (v.agente_registro_id ?? v.vendedor_id) as string | null
        }
        vendasPorCliente.set(cid, cur)
        if (v.vendedor_id) agentIds.push(v.vendedor_id as string)
        if (v.agente_registro_id) agentIds.push(v.agente_registro_id as string)
      }

      void resolveProfiles([...new Set(agentIds)])

      setClientes((data ?? []).map(c => {
        const res = vendasPorCliente.get(c.id as string)
        return {
          ...(c as Cliente),
          total_vendas:    res?.count ?? 0,
          valor_total:     res?.valor ?? 0,
          ultimo_produto:  res?.ultimo_produto ?? null,
          ultima_compra:   res?.ultima ?? null,
          ultimo_agente_id: res?.ultimo_agente_id ?? null,
        }
      }))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, search, filterTipo, filterStatus])

  useEffect(() => { void fetchClientes() }, [fetchClientes])

  async function toggleExpand(cliente: ClienteComVendas) {
    if (expandedId === cliente.id) { setExpandedId(null); return }
    setExpandedId(cliente.id)
    if (detalhes[cliente.id]) return

    setLoadingDetalhe(cliente.id)

    const doc = normalizeDigits(cliente.cpf_cnpj)
    const phoneCandidates = buildPhoneCandidates(cliente.telefone)
    const email = cliente.email?.trim() ?? null

    const vendasPromise = supabase
      .from('vendas_certificados')
      .select('id, protocolo_numero, tipo_produto, valor_venda, status_venda, data_inicio_validade, data_vencimento, validado_safeweb, vendedor_id, agente_registro_id, created_at')
      .eq('cadastro_base_id', cliente.id)
      .order('created_at', { ascending: false })
      .limit(20)

    const agendamentosPromise = phoneCandidates.length > 0
      ? supabase.from('agendamentos').select('*').in('telefone', phoneCandidates).order('data_hora', { ascending: false }).limit(20)
      : supabase.from('agendamentos').select('*').eq('cliente', cliente.nome).order('data_hora', { ascending: false }).limit(20)

    const contatosOutboxPromise = [email, ...phoneCandidates].filter(Boolean).length > 0
      ? supabase.from('communication_outbox').select('*').in('to_address', [email, ...phoneCandidates].filter(Boolean) as string[]).order('created_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null } as { data: CommunicationOutbox[]; error: null })

    const contatosEventosPromise = phoneCandidates.length > 0
      ? supabase.from('communication_events').select('id, source, event_type, conversation_id, contact, payload, created_at').in('contact', phoneCandidates).order('created_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null } as { data: Record<string, unknown>[]; error: null })

    const renovacaoOps = [
      supabase.from('renovacoes').select('*').eq('cadastro_base_id', cliente.id).is('deleted_at', null).order('data_vencimento', { ascending: true }).limit(20),
    ]

    if (doc) {
      if (doc.length === 11) renovacaoOps.push(supabase.from('renovacoes').select('*').eq('cpf', doc).is('deleted_at', null).order('data_vencimento', { ascending: true }).limit(20))
      if (doc.length === 14) renovacaoOps.push(supabase.from('renovacoes').select('*').eq('cnpj', doc).is('deleted_at', null).order('data_vencimento', { ascending: true }).limit(20))
    }
    if (email) renovacaoOps.push(supabase.from('renovacoes').select('*').eq('email', email).is('deleted_at', null).order('data_vencimento', { ascending: true }).limit(20))
    if (phoneCandidates.length > 0) renovacaoOps.push(supabase.from('renovacoes').select('*').in('telefone', phoneCandidates).is('deleted_at', null).order('data_vencimento', { ascending: true }).limit(20))

    const [
      { data: vendasData },
      { data: agendamentosData },
      { data: outboxData },
      { data: eventosData },
      renovacaoResults,
    ] = await Promise.all([
      vendasPromise,
      agendamentosPromise,
      contatosOutboxPromise,
      contatosEventosPromise,
      Promise.all(renovacaoOps),
    ])

    const ids: string[] = []
    for (const v of vendasData ?? []) {
      if (v.vendedor_id) ids.push(v.vendedor_id as string)
      if (v.agente_registro_id) ids.push(v.agente_registro_id as string)
    }
    void resolveProfiles([...new Set(ids)])

    const renovacoesMap = new Map<string, RenovacaoResumo>()
    for (const res of renovacaoResults) {
      for (const row of (res.data ?? []) as RenovacaoResumo[]) renovacoesMap.set(row.id, row)
    }

    const contatosOutbox = ((outboxData ?? []) as CommunicationOutbox[]).map(item => ({
      id: item.id,
      origem: 'outbox' as const,
      canal: item.channel,
      destino: item.to_address,
      status: item.status,
      assunto: item.subject,
      corpo: item.body,
      created_at: item.created_at,
    }))

    const contatosEventos = ((eventosData ?? []) as Record<string, unknown>[]).map(item => {
      const payload = (item.payload ?? {}) as Record<string, unknown>
      const data = (payload.data ?? {}) as Record<string, unknown>
      return {
        id: String(item.id ?? `${item.contact}-${item.created_at}`),
        origem: 'evento' as const,
        canal: String(item.source ?? 'chatwoot'),
        destino: String(item.contact ?? '—'),
        status: String(item.event_type ?? 'evento'),
        assunto: data.sender ? `Conversa ${item.conversation_id ?? ''}`.trim() : null,
        corpo: String(data.content ?? payload.content ?? 'Evento sem conteúdo textual'),
        created_at: String(item.created_at ?? ''),
      }
    })

    const contatos = [...contatosOutbox, ...contatosEventos]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 25)

    setDetalhes(prev => ({
      ...prev,
      [cliente.id]: {
        vendas: (vendasData ?? []) as VendaResumida[],
        renovacoes: [...renovacoesMap.values()].sort((a, b) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime()),
        contatos,
        agendamentos: (agendamentosData ?? []) as Agendamento[],
      },
    }))

    setLoadingDetalhe(null)
  }

  function openNewCliente() {
    setClienteModal({ mode: 'novo' })
    setClienteForm(emptyClienteForm())
  }

  function openEditCliente(cliente: ClienteComVendas) {
    setClienteModal({ mode: 'editar', cliente })
    setClienteForm({
      tipo_cliente: cliente.tipo_cliente,
      cpf_cnpj: cliente.cpf_cnpj,
      nome: cliente.nome,
      nome_fantasia: cliente.nome_fantasia ?? '',
      email: cliente.email ?? '',
      telefone: cliente.telefone ?? '',
      cep: cliente.cep ?? '',
      logradouro: cliente.logradouro ?? '',
      numero: cliente.numero ?? '',
      complemento: cliente.complemento ?? '',
      bairro: cliente.bairro ?? '',
      cidade: cliente.cidade ?? '',
      uf: cliente.uf ?? '',
      inscricao_municipal: cliente.inscricao_municipal ?? '',
      inscricao_estadual: cliente.inscricao_estadual ?? '',
      iss_retido: cliente.iss_retido ?? false,
      status: cliente.status,
    })
  }

  async function saveCliente() {
    setSavingCliente(true)
    const payload = {
      tipo_cliente: clienteForm.tipo_cliente,
      cpf_cnpj: clienteForm.cpf_cnpj.trim(),
      nome: clienteForm.nome.trim(),
      nome_fantasia: clienteForm.nome_fantasia.trim() || null,
      email: clienteForm.email.trim() || null,
      telefone: clienteForm.telefone.trim() || null,
      cep: clienteForm.cep.trim() || null,
      logradouro: clienteForm.logradouro.trim() || null,
      numero: clienteForm.numero.trim() || null,
      complemento: clienteForm.complemento.trim() || null,
      bairro: clienteForm.bairro.trim() || null,
      cidade: clienteForm.cidade.trim() || null,
      uf: clienteForm.uf.trim().toUpperCase() || null,
      inscricao_municipal: clienteForm.inscricao_municipal.trim() || null,
      inscricao_estadual: clienteForm.inscricao_estadual.trim() || null,
      iss_retido: clienteForm.iss_retido,
      status: clienteForm.status,
    }

    const query = clienteModal?.mode === 'editar' && clienteModal.cliente
      ? supabase.from('cadastros_base').update(payload).eq('id', clienteModal.cliente.id)
      : supabase.from('cadastros_base').insert([payload])

    const { error } = await query
    setSavingCliente(false)
    if (error) {
      alert('Erro ao salvar cliente.')
      return
    }
    setClienteModal(null)
    await fetchClientes()
  }

  async function ensureLeadForCliente(cliente: ClienteComVendas) {
    const phoneCandidates = buildPhoneCandidates(cliente.telefone)
    let existingLead: Record<string, unknown> | null = null

    if (phoneCandidates.length > 0) {
      const { data } = await supabase
        .from('leads_contabilidade')
        .select('id, nome_lead, whatsapp_lead, evolution_remote_jid, evolution_instance')
        .in('whatsapp_lead', phoneCandidates)
        .order('created_at', { ascending: false })
        .limit(1)
      existingLead = (data?.[0] as Record<string, unknown> | undefined) ?? null
    }

    if (!existingLead) {
      const { data } = await supabase
        .from('leads_contabilidade')
        .insert([{
          nome_lead: cliente.nome,
          whatsapp_lead: cliente.telefone ?? null,
          motivo_contato: cliente.ultimo_produto ?? (cliente.tipo_cliente === 'pessoa_juridica' ? 'Cliente PJ' : 'Cliente PF'),
          resumo_conversa: `Contato criado a partir da base de clientes em ${new Date().toLocaleString('pt-BR')}.`,
          ultima_mensagem: null,
          status: 'cliente',
        }])
        .select('id, nome_lead, whatsapp_lead, evolution_remote_jid, evolution_instance')
        .single()
      existingLead = (data as Record<string, unknown> | null) ?? null
    }

    return existingLead
  }

  async function openChatFromCliente(cliente: ClienteComVendas) {
    if (!canAccessChat) {
      alert('Somente administradores, agentes de registro e operadores podem acessar o chat.')
      return
    }
    const lead = await ensureLeadForCliente(cliente)
    const phone = (lead?.whatsapp_lead as string | null) ?? cliente.telefone
    if (!phone) {
      alert('Este cliente ainda nao possui telefone cadastrado para abrir conversa.')
      return
    }
    openCentralChat({
      phone,
      contactName: (lead?.nome_lead as string | null) ?? cliente.nome,
      context: {
        origem: 'clientes',
        cliente_id: cliente.id,
        lead_id: lead?.id ? String(lead.id) : '',
        tipo_cliente: cliente.tipo_cliente,
      },
    })
  }

  async function openKanbanFromCliente(cliente: ClienteComVendas) {
    if (!canAccessChat) {
      alert('Somente administradores, agentes de registro e operadores podem acessar o chat.')
      return
    }
    const lead = await ensureLeadForCliente(cliente)
    const phone = (lead?.whatsapp_lead as string | null) ?? cliente.telefone
    if (!phone) {
      alert('Este cliente ainda nao possui telefone cadastrado para abrir conversa.')
      return
    }
    openCentralChat({
      phone,
      contactName: (lead?.nome_lead as string | null) ?? cliente.nome,
      context: {
        origem: 'clientes',
        cliente_id: cliente.id,
        lead_id: lead?.id ? String(lead.id) : '',
        foco: 'kanban',
      },
    })
  }

  function applySearch() {
    setPage(0)
    setSearch(searchInput)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="flex flex-col h-full">
      {/* toolbar */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-wrap items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0 max-w-sm">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applySearch()}
              placeholder="Nome, CPF/CNPJ..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button type="button" onClick={applySearch}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
            Buscar
          </button>
          {search && (
            <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(0) }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={14} />
            </button>
          )}
        </div>

        <select value={filterTipo} onChange={e => { setFilterTipo(e.target.value as '' | TipoCliente); setPage(0) }}
          className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os tipos</option>
          <option value="pessoa_fisica">Pessoa Física</option>
          <option value="pessoa_juridica">Pessoa Jurídica</option>
        </select>

        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value as '' | 'ativo' | 'inativo'); setPage(0) }}
          className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </select>

        <button type="button" onClick={() => void fetchClientes()} title="Atualizar"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
          <RefreshCcw size={14} />
        </button>

        <button
          type="button"
          onClick={openNewCliente}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
        >
          <Plus size={14} /> Novo cliente
        </button>

        <span className="text-xs text-gray-400 ml-auto">{total.toLocaleString('pt-BR')} clientes</span>
      </div>

      {/* table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Carregando...
          </div>
        ) : clientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <p className="font-medium">Nenhum cliente encontrado.</p>
            {search && <p className="text-sm mt-1">Tente uma busca diferente.</p>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 dark:bg-gray-800/80 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">
                <th className="px-4 py-3 font-medium"></th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">CPF / CNPJ</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Cidade/UF</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Contato</th>
                <th className="px-4 py-3 font-medium text-center">Vendas</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Último produto</th>
                <th className="px-4 py-3 font-medium hidden xl:table-cell">Último atendimento</th>
                <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">Valor total</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {clientes.map(c => {
                const detalhe = detalhes[c.id]
                const contatoMaisRecente = detalhe?.contatos[0] ?? null
                const renovacoesAbertas = detalhe?.renovacoes.filter(r => r.status !== 'convertido' && r.status !== 'perdido').length ?? 0
                const agendamentosPendentes = detalhe?.agendamentos.filter(a => a.status === 'aguardando' || a.status === 'confirmado').length ?? 0

                return (
                <Fragment key={c.id}>
                  <tr key={c.id}
                    onClick={() => void toggleExpand(c)}
                    className={cn('hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors',
                      expandedId === c.id && 'bg-blue-50/50 dark:bg-blue-900/10')}>
                    <td className="px-4 py-3 text-gray-400">
                      {expandedId === c.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 dark:text-gray-100 truncate max-w-[200px]">{c.nome}</p>
                      {c.nome_fantasia && c.nome_fantasia !== c.nome && (
                        <p className="text-xs text-gray-400 truncate max-w-[200px]">{c.nome_fantasia}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">
                      {formatDoc(c.cpf_cnpj)}
                      <span className="ml-1.5 text-[10px] font-sans text-gray-400">
                        {c.tipo_cliente === 'pessoa_fisica' ? 'PF' : 'PJ'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {c.cidade ? `${c.cidade}${c.uf ? ` / ${c.uf}` : ''}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                      <p className="truncate max-w-[160px]">{c.email ?? '—'}</p>
                      {c.telefone && <p className="text-xs text-gray-400">{c.telefone}</p>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('text-sm font-semibold', c.total_vendas > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-300')}>
                        {c.total_vendas}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      <p className="truncate max-w-[140px]">{c.ultimo_produto ?? '—'}</p>
                      {c.ultima_compra && <p className="text-xs text-gray-400">{formatDate(c.ultima_compra)}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden xl:table-cell">
                      {c.ultimo_agente_id ? (profileNomes.get(c.ultimo_agente_id) ?? '—') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      {c.valor_total > 0
                        ? <span className="text-green-600 dark:text-green-400 font-medium">{formatCurrency(c.valor_total)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
                        c.status === 'ativo'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400')}>
                        {c.status === 'ativo' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>

                  {/* expanded: histórico de vendas */}
                  {expandedId === c.id && (
                    <tr key={`${c.id}-detail`} className="bg-blue-50/30 dark:bg-blue-900/5">
                      <td colSpan={10} className="px-6 pb-4 pt-2">
                        {loadingDetalhe === c.id ? (
                          <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                            <Loader2 size={12} className="animate-spin" /> Carregando dossiê do cliente...
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <ActionToolbarBtn icon={Pencil} label="Editar cliente" onClick={() => openEditCliente(c)} />
                              {canAccessChat && <ActionToolbarBtn icon={MessageCircle} label="Abrir chat" onClick={() => void openChatFromCliente(c)} />}
                              {canAccessChat && <ActionToolbarBtn icon={LifeBuoy} label="Ir para o Kanban" onClick={() => void openKanbanFromCliente(c)} />}
                              <ActionToolbarBtn
                                icon={Mail}
                                label="E-mail"
                                onClick={() => {
                                  if (!c.email) {
                                    alert('Este cliente ainda nao possui e-mail cadastrado.')
                                    return
                                  }
                                  window.location.href = `mailto:${c.email}`
                                }}
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                              <InfoMini label="Cadastro desde" value={formatDate(c.created_at)} />
                              <InfoMini label="Renovações em aberto" value={String(renovacoesAbertas)} />
                              <InfoMini label="Agendamentos pendentes" value={String(agendamentosPendentes)} />
                              <InfoMini label="Último contato" value={contatoMaisRecente ? formatDateTime(contatoMaisRecente.created_at) : '—'} />
                              <InfoMini label="Endereço" value={c.cidade ? `${c.cidade}${c.uf ? ` / ${c.uf}` : ''}` : 'Não informado'} />
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                              <div className="bg-white dark:bg-gray-900 rounded-xl border border-blue-100 dark:border-blue-900/20 overflow-hidden">
                                <SectionTitle title="Histórico de vendas" count={detalhe?.vendas.length ?? 0} />
                                {!(detalhe?.vendas.length) ? (
                                  <EmptySection label="Nenhuma venda registrada para este cliente." />
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-gray-400 uppercase tracking-wide">
                                          <th className="px-4 py-2 text-left font-medium">Protocolo</th>
                                          <th className="px-4 py-2 text-left font-medium">Produto</th>
                                          <th className="px-4 py-2 text-left font-medium">Valor</th>
                                          <th className="px-4 py-2 text-left font-medium">Status</th>
                                          <th className="px-4 py-2 text-left font-medium">Vendedor</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-blue-100 dark:divide-blue-900/20">
                                        {detalhe.vendas.map(v => {
                                          const st = STATUS_LABEL[v.status_venda] ?? { label: v.status_venda, cls: 'bg-gray-100 text-gray-500' }
                                          return (
                                            <tr key={v.id} className="text-gray-600 dark:text-gray-300">
                                              <td className="px-4 py-2 font-mono">{v.protocolo_numero ?? '—'}</td>
                                              <td className="px-4 py-2">{v.tipo_produto}</td>
                                              <td className="px-4 py-2 font-medium text-green-600 dark:text-green-400">{v.valor_venda ? formatCurrency(v.valor_venda) : '—'}</td>
                                              <td className="px-4 py-2"><span className={cn('px-1.5 py-0.5 rounded font-medium', st.cls)}>{st.label}</span></td>
                                              <td className="px-4 py-2 text-gray-500">{v.vendedor_id ? (profileNomes.get(v.vendedor_id) ?? '—') : '—'}</td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>

                              <div className="bg-white dark:bg-gray-900 rounded-xl border border-blue-100 dark:border-blue-900/20 overflow-hidden">
                                <SectionTitle title="Renovações" count={detalhe?.renovacoes.length ?? 0} />
                                {!(detalhe?.renovacoes.length) ? (
                                  <EmptySection label="Nenhuma renovação encontrada para este cliente." />
                                ) : (
                                  <div className="divide-y divide-blue-100 dark:divide-blue-900/20">
                                    {detalhe.renovacoes.slice(0, 8).map(r => (
                                      <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{r.tipo_certificado}</p>
                                          <p className="text-xs text-gray-500">
                                            Vence em {formatDate(r.data_vencimento)} · {r.telefone ?? r.email ?? 'Sem contato'}
                                          </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                                            r.status === 'convertido' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                                            r.status === 'perdido' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                                            r.status === 'contatado' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                                            r.status === 'pendente' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                                          )}>
                                            {r.status}
                                          </span>
                                          <p className="text-xs text-gray-400 mt-1">{r.valor ? formatCurrency(r.valor) : 'Sem valor'}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="bg-white dark:bg-gray-900 rounded-xl border border-blue-100 dark:border-blue-900/20 overflow-hidden">
                                <SectionTitle title="Histórico de contato" count={detalhe?.contatos.length ?? 0} />
                                {!(detalhe?.contatos.length) ? (
                                  <EmptySection label="Nenhum contato encontrado nas filas e eventos." />
                                ) : (
                                  <div className="divide-y divide-blue-100 dark:divide-blue-900/20">
                                    {detalhe.contatos.slice(0, 8).map(item => (
                                      <div key={item.id} className="px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{item.canal} · {item.status}</p>
                                          <span className="text-xs text-gray-400">{formatDateTime(item.created_at)}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">{item.destino}</p>
                                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">{item.assunto ? `${item.assunto} · ` : ''}{item.corpo}</p>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="bg-white dark:bg-gray-900 rounded-xl border border-blue-100 dark:border-blue-900/20 overflow-hidden">
                                <SectionTitle title="Agendamentos" count={detalhe?.agendamentos.length ?? 0} />
                                {!(detalhe?.agendamentos.length) ? (
                                  <EmptySection label="Nenhum agendamento encontrado para este cliente." />
                                ) : (
                                  <div className="divide-y divide-blue-100 dark:divide-blue-900/20">
                                    {detalhe.agendamentos.slice(0, 8).map(a => (
                                      <div key={a.id} className="px-4 py-3 flex items-start justify-between gap-4">
                                        <div>
                                          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{a.servico}</p>
                                          <p className="text-xs text-gray-500">{formatDateTime(a.data_hora)} · {a.telefone ?? 'Sem telefone'}</p>
                                        </div>
                                        <span className="text-xs text-gray-500 capitalize">{a.status}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )})}
            </tbody>
          </table>
        )}
      </div>

      {/* pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              Página {page + 1} de {totalPages} — {total.toLocaleString('pt-BR')} clientes
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Mostrar</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(0) }}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PAGE_SIZE_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400">por página</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Anterior
            </button>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Próxima
            </button>
          </div>
        </div>
      )}

      {clienteModal && (
        <ClienteEditorModal
          mode={clienteModal.mode}
          form={clienteForm}
          onClose={() => setClienteModal(null)}
          onSave={() => void saveCliente()}
          onChange={setClienteForm}
          saving={savingCliente}
        />
      )}
    </div>
  )
}

function InfoMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-blue-100 dark:border-blue-900/20 bg-white dark:bg-gray-900 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mt-1">{value}</p>
    </div>
  )
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="px-4 py-3 border-b border-blue-100 dark:border-blue-900/20 bg-blue-50/60 dark:bg-blue-900/10 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
      <span className="text-xs text-gray-400">{count}</span>
    </div>
  )
}

function EmptySection({ label }: { label: string }) {
  return <div className="px-4 py-6 text-sm text-gray-400">{label}</div>
}

function ActionToolbarBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Pencil
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-100 dark:border-blue-900/20 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-200 hover:border-blue-300 hover:text-blue-700 transition-colors"
    >
      <Icon size={14} />
      {label}
    </button>
  )
}

function ClienteEditorModal({
  mode,
  form,
  onClose,
  onSave,
  onChange,
  saving,
}: {
  mode: 'novo' | 'editar'
  form: ClienteFormState
  onClose: () => void
  onSave: () => void
  onChange: (next: ClienteFormState) => void
  saving: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[92vh] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{mode === 'novo' ? 'Novo cliente' : 'Editar cliente'}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Cadastre e ajuste o contato sem sair da tela de clientes.</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ModalField label="Tipo">
            <select
              value={form.tipo_cliente}
              onChange={e => onChange({ ...form, tipo_cliente: e.target.value as TipoCliente })}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm"
            >
              <option value="pessoa_fisica">Pessoa Física</option>
              <option value="pessoa_juridica">Pessoa Jurídica</option>
            </select>
          </ModalField>
          <ModalField label="CPF / CNPJ">
            <input value={form.cpf_cnpj} onChange={e => onChange({ ...form, cpf_cnpj: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Nome / Razão social">
            <input value={form.nome} onChange={e => onChange({ ...form, nome: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Nome fantasia">
            <input value={form.nome_fantasia} onChange={e => onChange({ ...form, nome_fantasia: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="E-mail">
            <input value={form.email} onChange={e => onChange({ ...form, email: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Telefone">
            <input value={form.telefone} onChange={e => onChange({ ...form, telefone: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="CEP">
            <input
              value={form.cep}
              onChange={e => onChange({ ...form, cep: e.target.value })}
              onBlur={async () => {
                const r = await buscarCep(form.cep)
                if (!r) return
                onChange({
                  ...form,
                  logradouro: r.logradouro || form.logradouro,
                  bairro: r.bairro || form.bairro,
                  cidade: r.localidade || form.cidade,
                  uf: r.uf || form.uf,
                })
              }}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm"
            />
          </ModalField>
          <ModalField label="Cidade">
            <input value={form.cidade} onChange={e => onChange({ ...form, cidade: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="UF">
            <input value={form.uf} onChange={e => onChange({ ...form, uf: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Inscrição Municipal">
            <input value={form.inscricao_municipal} onChange={e => onChange({ ...form, inscricao_municipal: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Inscrição Estadual">
            <input value={form.inscricao_estadual} onChange={e => onChange({ ...form, inscricao_estadual: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Logradouro" className="md:col-span-2">
            <input value={form.logradouro} onChange={e => onChange({ ...form, logradouro: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Número">
            <input value={form.numero} onChange={e => onChange({ ...form, numero: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Bairro">
            <input value={form.bairro} onChange={e => onChange({ ...form, bairro: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Complemento" className="md:col-span-2">
            <input value={form.complemento} onChange={e => onChange({ ...form, complemento: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Retém ISS?">
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-3 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={form.iss_retido}
                onChange={e => onChange({ ...form, iss_retido: e.target.checked })}
              />
              Marque quando o cliente tiver ISS retido
            </label>
          </ModalField>
          <ModalField label="Status">
            <select
              value={form.status}
              onChange={e => onChange({ ...form, status: e.target.value as 'ativo' | 'inativo' })}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm"
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </ModalField>
        </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
            Cancelar
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar cliente
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}
