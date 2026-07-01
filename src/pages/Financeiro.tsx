import { useState, useEffect, useCallback } from 'react'
import { PlusCircle, TrendingUp, TrendingDown, DollarSign, X, Zap, FileText, ArrowDownCircle, ArrowUpCircle, Wallet, Landmark, Search, Link as LinkIcon, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils'
import ModulePageShell from '@/components/ModulePageShell'
import { buildNfseDiscriminacaoFromLancamento } from '@/lib/nfse'
import { supabase } from '@/lib/supabase'
import type {
  CentroCusto, LancamentoV2, NfseEmitida, OrdemPagamento,
  TipoLancamento, StatusLancamento, ComissaoLancamento, StatusComissao,
  Banco, TipoContaBancaria,
} from '@/types'

type Tab = 'pagarReceber' | 'contas' | 'centros' | 'comissoes' | 'split' | 'fiscal'
type PeriodoFiltro = 'hoje' | 'este_mes' | 'mes_passado' | '3meses' | 'personalizado'
type TransactionStatusFilter = 'todos' | StatusLancamento
type SettlementFilter = 'todos' | 'com_cobranca' | 'sem_cobranca'

const TABS: { id: Tab; label: string }[] = [
  { id: 'pagarReceber', label: 'Pagar / Receber'  },
  { id: 'contas',       label: 'Contas Bancárias' },
  { id: 'centros',      label: 'Centro de Custos' },
  { id: 'comissoes',    label: 'Comissões'        },
  { id: 'split',        label: 'Extrato Split'    },
  { id: 'fiscal',       label: 'Fiscal'           },
]

const CATEGORIAS = ['Vendas', 'Repasses', 'Comissões', 'Operacional', 'SaaS', 'Outros']
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
const TRANSACTION_STATUS_LABELS: Record<TransactionStatusFilter, string> = { todos: 'Todos', pendente: 'Pendente', pago: 'Pago', recebido: 'Recebido', cancelado: 'Cancelado' }
const SETTLEMENT_LABELS: Record<SettlementFilter, string> = { todos: 'Todas', com_cobranca: 'Com cobrança', sem_cobranca: 'Sem cobrança' }

const PERIODO_LABELS: Record<PeriodoFiltro, string> = {
  hoje: 'Hoje', este_mes: 'Este mês', mes_passado: 'Mês passado',
  '3meses': 'Últimos 3 meses', personalizado: 'Personalizado',
}

type FormLancamento = {
  tipo: TipoLancamento
  descricao: string
  vencimento: string
  valor: number
  status: StatusLancamento
  categoria: string | null
  conta_bancaria_v2_id: string | null
  centro_custo_id: string | null
}

const EMPTY_LANC: FormLancamento = {
  tipo: 'receber', descricao: '', vencimento: '',
  valor: 0, status: 'pendente', categoria: null,
  conta_bancaria_v2_id: null, centro_custo_id: null,
}

type FormConta = {
  banco_id: string
  tipo_conta: TipoContaBancaria
  agencia: string
  conta: string
  digito: string
  nome_titular: string
  saldo_inicial: number
}

const EMPTY_CONTA: FormConta = {
  banco_id: '', tipo_conta: 'corrente',
  agencia: '', conta: '', digito: '', nome_titular: '', saldo_inicial: 0,
}

type ContaBancariaRow = {
  id: string
  banco_id: string
  tipo_conta: string
  agencia: string | null
  conta: string | null
  digito: string | null
  nome_titular: string | null
  saldo_inicial: number
  ativa: boolean
  gateway: string | null
  bancos?: { nome?: string | null; codigo?: string | null }[] | null
}

type ComissaoRow = ComissaoLancamento & { profiles: { nome: string } | null }

function getPeriodoRange(periodo: PeriodoFiltro, customFrom: string, customTo: string) {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  if (periodo === 'hoje') return { from: today, to: today }
  if (periodo === 'este_mes') {
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, to: today }
  }
  if (periodo === 'mes_passado') {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const last  = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) }
  }
  if (periodo === 'personalizado') return { from: customFrom || today, to: customTo || today }
  const from = new Date(now)
  from.setMonth(from.getMonth() - 3)
  return { from: from.toISOString().slice(0, 10), to: today }
}

export default function Financeiro() {
  const [tab, setTab]             = useState<Tab>('pagarReceber')
  const [lancs, setLancs]         = useState<LancamentoV2[]>([])
  const [contas, setContas]       = useState<ContaBancariaRow[]>([])
  const [centros, setCentros]     = useState<CentroCusto[]>([])
  const [comissoes, setComissoes] = useState<ComissaoRow[]>([])
  const [ordens, setOrdens]       = useState<OrdemPagamento[]>([])
  const [nfse, setNfse]           = useState<NfseEmitida[]>([])
  const [bancos, setBancos]       = useState<Banco[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [msg, setMsg]             = useState<{ text: string; ok: boolean } | null>(null)

  const [periodo, setPeriodo]       = useState<PeriodoFiltro>('este_mes')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | TipoLancamento>('todos')
  const [statusFiltro, setStatusFiltro] = useState<TransactionStatusFilter>('todos')
  const [settlementFilter, setSettlementFilter] = useState<SettlementFilter>('todos')
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroComissao, setFiltroComissao] = useState<StatusComissao | 'todos'>('todos')
  const [lancPageSize, setLancPageSize] = useState(25)
  const [lancPage, setLancPage] = useState(1)
  const [comissoesPageSize, setComissoesPageSize] = useState(25)
  const [comissoesPage, setComissoesPage] = useState(1)
  const [splitPageSize, setSplitPageSize] = useState(25)
  const [splitPage, setSplitPage] = useState(1)
  const [nfsePageSize, setNfsePageSize] = useState(25)
  const [nfsePage, setNfsePage] = useState(1)
  const [selectedLancamentoId, setSelectedLancamentoId] = useState<string | null>(null)

  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState<FormLancamento>(EMPTY_LANC)
  const [salvando, setSalvando]   = useState(false)

  const [showContaForm, setShowContaForm] = useState(false)
  const [formConta, setFormConta]         = useState<FormConta>(EMPTY_CONTA)
  const [salvandoConta, setSalvandoConta] = useState(false)

  function showMsg(text: string, ok = true) {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 4000)
  }

  const fetchLancs = useCallback(async () => {
    const { from, to } = getPeriodoRange(periodo, customFrom, customTo)
    const { data, error: err } = await supabase
      .from('lancamentos_financeiros')
      .select('*')
      .gte('vencimento', from)
      .lte('vencimento', to)
      .order('vencimento', { ascending: true })
    if (err) { setError(err.message); return }
    setLancs((data ?? []) as LancamentoV2[])
  }, [periodo, customFrom, customTo])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [
      { data: c,  error: e1 },
      { data: ct, error: e2 },
      { data: cm, error: e3 },
      { data: or, error: e4 },
      { data: nf, error: e5 },
      { data: bk, error: e6 },
    ] = await Promise.all([
      supabase.from('contas_bancarias_v2')
        .select('id, banco_id, tipo_conta, agencia, conta, digito, nome_titular, saldo_inicial, ativa, gateway, bancos(nome, codigo)')
        .eq('ativa', true).order('created_at', { ascending: true }),
      supabase.from('centros_custos').select('*').eq('ativo', true).order('nome', { ascending: true }),
      supabase.from('comissoes_lancamentos').select('*, profiles(nome)').order('created_at', { ascending: false }).limit(200),
      supabase.from('ordens_pagamento').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('nfse_emitidas').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('bancos').select('id, codigo, nome').eq('ativo', true).order('nome', { ascending: true }).limit(300),
    ])
    const firstErr = e1 ?? e2 ?? e3 ?? e4 ?? e5 ?? e6
    if (firstErr) { setError(firstErr.message); setLoading(false); return }
    setContas((c  ?? []) as ContaBancariaRow[])
    setCentros((ct ?? []) as CentroCusto[])
    setComissoes((cm ?? []) as ComissaoRow[])
    setOrdens((or ?? []) as OrdemPagamento[])
    setNfse((nf ?? []) as NfseEmitida[])
    setBancos((bk ?? []) as Banco[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { fetchLancs() }, [fetchLancs])
  useEffect(() => { setLancPage(1) }, [periodo, customFrom, customTo, tipoFiltro, statusFiltro, settlementFilter, searchTerm, lancPageSize])
  useEffect(() => { setComissoesPage(1) }, [filtroComissao, comissoesPageSize])
  useEffect(() => { setSplitPage(1) }, [splitPageSize])
  useEffect(() => { setNfsePage(1) }, [nfsePageSize])
  useEffect(() => {
    if (!selectedLancamentoId && lancs[0]?.id) setSelectedLancamentoId(lancs[0].id)
    if (selectedLancamentoId && !lancs.some(item => item.id === selectedLancamentoId)) setSelectedLancamentoId(lancs[0]?.id ?? null)
  }, [lancs, selectedLancamentoId])

  async function salvarLancamento() {
    if (!form.descricao.trim() || !form.vencimento || form.valor <= 0) {
      showMsg('Preencha descrição, vencimento e valor.', false)
      return
    }
    setSalvando(true)
    const { error: err } = await supabase.from('lancamentos_financeiros').insert([form])
    setSalvando(false)
    if (err) { showMsg('Erro: ' + err.message, false); return }
    setShowForm(false); setForm(EMPTY_LANC)
    showMsg('Lançamento salvo.')
    fetchLancs()
  }

  async function atualizarStatusLanc(id: string, status: StatusLancamento) {
    await supabase.from('lancamentos_financeiros').update({ status }).eq('id', id)
    setLancs(prev => prev.map(l => l.id === id ? { ...l, status } : l))
  }

  async function aprovarComissao(id: string) {
    const { error: err } = await supabase.from('comissoes_lancamentos').update({ status: 'aprovada' }).eq('id', id)
    if (err) { showMsg('Erro ao aprovar: ' + err.message, false); return }
    setComissoes(prev => prev.map(c => c.id === id ? { ...c, status: 'aprovada' as StatusComissao } : c))
    showMsg('Comissão aprovada.')
  }

  async function salvarConta() {
    if (!formConta.banco_id || !formConta.conta) {
      showMsg('Banco e número da conta são obrigatórios.', false)
      return
    }
    setSalvandoConta(true)
    const { error: err } = await supabase.from('contas_bancarias_v2').insert([{
      banco_id: formConta.banco_id,
      tipo_conta: formConta.tipo_conta,
      agencia: formConta.agencia || null,
      conta: formConta.conta,
      digito: formConta.digito || null,
      nome_titular: formConta.nome_titular || null,
      saldo_inicial: formConta.saldo_inicial,
      ativa: true,
      metadata: {},
    }])
    setSalvandoConta(false)
    if (err) { showMsg('Erro: ' + err.message, false); return }
    setShowContaForm(false); setFormConta(EMPTY_CONTA)
    showMsg('Conta bancária salva.')
    fetchData()
  }

  async function gerarCobranca(l: LancamentoV2) {
    const { error: err } = await supabase
      .from('lancamentos_financeiros')
      .update({ cobranca_gateway: 'mock', cobranca_link: `mock://certiid/${l.id}`, cobranca_id_externo: `mock_${l.id}` })
      .eq('id', l.id)
    if (err) { showMsg('Erro ao gerar cobrança: ' + err.message, false); return }
    setLancs(prev => prev.map(x => x.id === l.id
      ? { ...x, cobranca_gateway: 'mock', cobranca_link: `mock://certiid/${l.id}`, cobranca_id_externo: `mock_${l.id}` }
      : x))
    showMsg('Cobrança gerada (modo mock).')
  }

  async function emitirNfse(l: LancamentoV2) {
    const numeroMock = 'MOCK-' + Date.now().toString(36).toUpperCase()
    const discriminacaoServicos = buildNfseDiscriminacaoFromLancamento(l)
    const { error: err } = await supabase.from('nfse_emitidas').insert([{
      lancamento_financeiro_id: l.id,
      status_nf: 'pendente',
      numero_nf: numeroMock,
      valor_servico: l.valor,
      data_emissao: new Date().toISOString(),
      payload_envio: {
        modo: 'mock',
        discriminacao_servicos: discriminacaoServicos,
      },
      payload_retorno: {},
      metadata: {
        modo: 'mock',
        discriminacao_servicos: discriminacaoServicos,
      },
    }])
    if (err) { showMsg('Erro ao emitir NFS-e: ' + err.message, false); return }
    showMsg(`NFS-e ${numeroMock} registrada (modo mock).`)
    fetchData()
  }

  const filtrados = lancs.filter(l => {
    const matchesTipo = tipoFiltro === 'todos' || l.tipo === tipoFiltro
    const matchesStatus = statusFiltro === 'todos' || l.status === statusFiltro
    const hasCobranca = Boolean(l.cobranca_gateway || l.cobranca_link || l.cobranca_id_externo)
    const matchesSettlement = settlementFilter === 'todos' || (settlementFilter === 'com_cobranca' && hasCobranca) || (settlementFilter === 'sem_cobranca' && !hasCobranca)
    const haystack = `${l.descricao} ${l.categoria ?? ''} ${l.cobranca_gateway ?? ''} ${l.cobranca_id_externo ?? ''}`.toLowerCase()
    const matchesSearch = !searchTerm.trim() || haystack.includes(searchTerm.trim().toLowerCase())
    return matchesTipo && matchesStatus && matchesSettlement && matchesSearch
  })
  const totalLancPages = Math.max(1, Math.ceil(filtrados.length / lancPageSize))
  const lancamentosPaginados = filtrados.slice((lancPage - 1) * lancPageSize, lancPage * lancPageSize)
  const selectedLancamento = lancs.find(item => item.id === selectedLancamentoId) ?? lancamentosPaginados[0] ?? null
  const aReceber  = lancs.filter(l => l.tipo === 'receber' && l.status === 'pendente').reduce((s, l) => s + Number(l.valor), 0)
  const aPagar    = lancs.filter(l => l.tipo === 'pagar'   && l.status === 'pendente').reduce((s, l) => s + Number(l.valor), 0)
  const entradasRecebidas = lancs.filter(l => l.tipo === 'receber' && l.status === 'recebido').reduce((s, l) => s + Number(l.valor), 0)
  const saidasPagas = lancs.filter(l => l.tipo === 'pagar' && l.status === 'pago').reduce((s, l) => s + Number(l.valor), 0)
  const liquidado = lancs.filter(l => l.status === 'recebido' || l.status === 'pago').reduce((s, l) => s + Number(l.valor), 0)
  const saldoTotal = contas.reduce((s, c) => s + Number(c.saldo_inicial ?? 0), 0)
  const saldoProjetado = saldoTotal + aReceber - aPagar
  const ordensPendentes = ordens.filter(o => o.status_integracao === 'pendente' || o.status_integracao === 'processando').length
  const ordensPagas = ordens.filter(o => o.status_integracao === 'pago').reduce((sum, o) => sum + Number(o.valor_pagamento ?? 0), 0)
  const nfseEmitidasQtd = nfse.filter(n => n.status_nf === 'emitida').length
  const nfseErroQtd = nfse.filter(n => n.status_nf === 'erro').length
  const comissoesFiltradas = filtroComissao === 'todos' ? comissoes : comissoes.filter(c => c.status === filtroComissao)
  const totalComissoesPages = Math.max(1, Math.ceil(comissoesFiltradas.length / comissoesPageSize))
  const comissoesPaginadas = comissoesFiltradas.slice((comissoesPage - 1) * comissoesPageSize, comissoesPage * comissoesPageSize)
  const totalSplitPages = Math.max(1, Math.ceil(ordens.length / splitPageSize))
  const ordensPaginadas = ordens.slice((splitPage - 1) * splitPageSize, splitPage * splitPageSize)
  const totalNfsePages = Math.max(1, Math.ceil(nfse.length / nfsePageSize))
  const nfsePaginadas = nfse.slice((nfsePage - 1) * nfsePageSize, nfsePage * nfsePageSize)

  const centrosComTotais = centros.map(centro => {
    const rel = lancs.filter(l => l.centro_custo_id === centro.id)
    return { ...centro, qtd: rel.length, total: rel.reduce((s, l) => s + Number(l.valor ?? 0), 0) }
  })

  return (
    <ModulePageShell
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
      storageKey="module-submenu-financeiro"
      menuLabel="Financeiro"
    >
      {msg && (
        <div className={cn('fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white',
          msg.ok ? 'bg-green-600' : 'bg-red-600')}>
          {msg.text}
        </div>
      )}

      <div className="space-y-5">
        {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-600 rounded-lg p-4 text-sm">{error}</div>}

        {/* PAGAR / RECEBER */}
        {tab === 'pagarReceber' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SaldoCard label="A Receber" value={aReceber} icon={<TrendingUp size={18} />} colorCls="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-900/20" loading={loading} />
              <SaldoCard label="A Pagar"   value={aPagar}   icon={<TrendingDown size={18}/>} colorCls="text-red-600 dark:text-red-400"   bg="bg-red-50 dark:bg-red-900/20"   loading={loading} />
              <SaldoCard label="Liquidado (período)" value={liquidado} icon={<DollarSign size={18}/>} colorCls="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/20" loading={loading} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                {(Object.keys(PERIODO_LABELS) as PeriodoFiltro[]).map(p => (
                  <button key={p} type="button" onClick={() => setPeriodo(p)}
                    className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                      periodo === p ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500')}>
                    {PERIODO_LABELS[p]}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                {(['todos', 'receber', 'pagar'] as const).map(v => (
                  <button key={v} type="button" onClick={() => setTipoFiltro(v)}
                    className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                      tipoFiltro === v ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500')}>
                    {v === 'todos' ? 'Todos' : v === 'receber' ? 'A Receber' : 'A Pagar'}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              <button type="button" onClick={() => setShowForm(v => !v)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                <PlusCircle size={13} /> Novo Lançamento
              </button>
            </div>

            {periodo === 'personalizado' && (
              <div className="flex items-center gap-3">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800" />
                <span className="text-xs text-gray-400">até</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800" />
              </div>
            )}

            {showForm && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Novo Lançamento</h3>
                  <button type="button" title="Fechar" onClick={() => setShowForm(false)}><X size={16} className="text-gray-400" /></button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Tipo</span>
                    <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as TipoLancamento }))}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="receber">A Receber</option>
                      <option value="pagar">A Pagar</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 col-span-2">
                    <span className="text-xs text-gray-500">Descrição *</span>
                    <input type="text" value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Vencimento *</span>
                    <input type="date" value={form.vencimento} onChange={e => setForm(p => ({ ...p, vencimento: e.target.value }))}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Valor (R$) *</span>
                    <input type="number" min="0" step="0.01" value={form.valor || ''}
                      onChange={e => setForm(p => ({ ...p, valor: parseFloat(e.target.value) || 0 }))}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Categoria</span>
                    <select value={form.categoria ?? ''} onChange={e => setForm(p => ({ ...p, categoria: e.target.value || null }))}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Selecionar —</option>
                      {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Conta Bancária</span>
                    <select value={form.conta_bancaria_v2_id ?? ''} onChange={e => setForm(p => ({ ...p, conta_bancaria_v2_id: e.target.value || null }))}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Nenhuma —</option>
                      {contas.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.bancos?.[0]?.nome ?? 'Banco'} · {c.conta}{c.digito ? `-${c.digito}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Centro de Custo</span>
                    <select value={form.centro_custo_id ?? ''} onChange={e => setForm(p => ({ ...p, centro_custo_id: e.target.value || null }))}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Nenhum —</option>
                      {centros.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </label>
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={salvarLancamento} disabled={salvando}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {salvando ? 'Salvando…' : 'Salvar'}
                  </button>
                  <button type="button" onClick={() => setShowForm(false)}
                    className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">
                    {['Tipo', 'Descrição', 'Vencimento', 'Categoria', 'Valor', 'Status', ''].map(h => <th key={h} className="px-4 py-3">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {loading ? (
                    <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400 animate-pulse">Carregando…</td></tr>
                  ) : filtrados.length === 0 ? (
                    <tr><td colSpan={7} className="px-5 py-8 text-center text-gray-400">Nenhum lançamento no período.</td></tr>
                  ) : lancamentosPaginados.map(l => (
                    <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1 text-xs font-semibold',
                          l.tipo === 'receber' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                          {l.tipo === 'receber' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {l.tipo === 'receber' ? 'Receber' : 'Pagar'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium">{l.descricao}</td>
                      <td className="px-4 py-3 text-gray-500">{new Date(l.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                      <td className="px-4 py-3 text-gray-500">{l.categoria ?? '—'}</td>
                      <td className={cn('px-4 py-3 font-semibold',
                        l.tipo === 'receber' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400')}>
                        {l.tipo === 'pagar' ? '– ' : '+ '}R$ {Number(l.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <select value={l.status}
                          onChange={e => atualizarStatusLanc(l.id, e.target.value as StatusLancamento)}
                          className={cn('px-2 py-0.5 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none', statusCls(l.status))}>
                          {(['pendente', 'pago', 'recebido', 'cancelado'] as StatusLancamento[]).map(s => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {l.tipo === 'receber' && l.status === 'pendente' && (
                          <div className="flex items-center gap-1">
                            <button type="button" title={l.cobranca_gateway ? 'Cobrança já gerada' : 'Gerar Cobrança'}
                              onClick={() => gerarCobranca(l)}
                              disabled={!!l.cobranca_gateway}
                              className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors',
                                l.cobranca_gateway
                                  ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 cursor-default'
                                  : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50')}>
                              <Zap size={11} />
                              {l.cobranca_gateway ? 'Cobrado' : 'Cobrar'}
                            </button>
                            <button type="button" title="Emitir NFS-e (Mock)"
                              onClick={() => emitirNfse(l)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors">
                              <FileText size={11} />
                              NFS-e
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">
                  Página {Math.min(lancPage, totalLancPages)} de {totalLancPages} — {filtrados.length} lançamento(s)
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Mostrar</span>
                  <select
                    value={lancPageSize}
                    onChange={e => setLancPageSize(Number(e.target.value))}
                    className="text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {PAGE_SIZE_OPTIONS.map(option => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-400">por página</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLancPage(prev => Math.max(1, prev - 1))}
                  disabled={lancPage === 1}
                  className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setLancPage(prev => Math.min(totalLancPages, prev + 1))}
                  disabled={lancPage >= totalLancPages}
                  className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}

        {/* CONTAS BANCÁRIAS */}
        {tab === 'contas' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 dark:text-gray-200">Contas Bancárias</h2>
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Saldo inicial total: <span className="text-green-600 dark:text-green-400">R$ {saldoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </span>
                <button type="button" onClick={() => setShowContaForm(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700">
                  <PlusCircle size={13} /> Nova Conta
                </button>
              </div>
            </div>

            {showContaForm && (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Nova Conta Bancária</h3>
                  <button type="button" title="Fechar" onClick={() => setShowContaForm(false)}><X size={16} className="text-gray-400" /></button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <label className="flex flex-col gap-1 md:col-span-2">
                    <span className="text-xs text-gray-500">Banco *</span>
                    <select value={formConta.banco_id} onChange={e => setFormConta(p => ({ ...p, banco_id: e.target.value }))}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">— Selecionar —</option>
                      {bancos.map(b => <option key={b.id} value={b.id}>{b.codigo} — {b.nome}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Tipo</span>
                    <select value={formConta.tipo_conta} onChange={e => setFormConta(p => ({ ...p, tipo_conta: e.target.value as TipoContaBancaria }))}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="corrente">Corrente</option>
                      <option value="poupanca">Poupança</option>
                      <option value="pagamento">Pagamento</option>
                      <option value="outro">Outro</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Agência</span>
                    <input type="text" value={formConta.agencia} onChange={e => setFormConta(p => ({ ...p, agencia: e.target.value }))}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Conta *</span>
                    <input type="text" value={formConta.conta} onChange={e => setFormConta(p => ({ ...p, conta: e.target.value }))}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Dígito</span>
                    <input type="text" maxLength={1} value={formConta.digito} onChange={e => setFormConta(p => ({ ...p, digito: e.target.value }))}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="flex flex-col gap-1 col-span-2">
                    <span className="text-xs text-gray-500">Titular</span>
                    <input type="text" value={formConta.nome_titular} onChange={e => setFormConta(p => ({ ...p, nome_titular: e.target.value }))}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Saldo inicial (R$)</span>
                    <input type="number" min="0" step="0.01" value={formConta.saldo_inicial || ''}
                      onChange={e => setFormConta(p => ({ ...p, saldo_inicial: parseFloat(e.target.value) || 0 }))}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </label>
                </div>
                <div className="flex gap-2 mt-4">
                  <button type="button" onClick={salvarConta} disabled={salvandoConta}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                    {salvandoConta ? 'Salvando…' : 'Salvar'}
                  </button>
                  <button type="button" onClick={() => setShowContaForm(false)}
                    className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {loading ? (
                <p className="text-gray-400 animate-pulse col-span-3">Carregando…</p>
              ) : contas.length === 0 ? (
                <EmptyState title="Nenhuma conta bancária" subtitle="Clique em Nova Conta para cadastrar." />
              ) : contas.map(c => (
                <div key={c.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{c.tipo_conta}</p>
                  <p className="font-bold text-lg mt-1">{c.bancos?.[0]?.nome ?? 'Banco não identificado'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.bancos?.[0]?.codigo ? `Banco ${c.bancos[0].codigo}` : ''}
                    {c.agencia ? ` · Ag. ${c.agencia}` : ''}
                    {c.conta ? ` · Conta ${c.conta}${c.digito ? `-${c.digito}` : ''}` : ''}
                  </p>
                  {c.nome_titular && <p className="text-xs text-gray-400 mt-1">{c.nome_titular}</p>}
                  <p className="text-xs text-gray-400 mt-3">Saldo inicial</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    R$ {Number(c.saldo_inicial ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CENTRO DE CUSTOS */}
        {tab === 'centros' && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-800 dark:text-gray-200">Centro de Custos</h2>
            {centrosComTotais.length === 0 ? (
              <EmptyState
                title="Nenhum centro de custo encontrado"
                subtitle="Cadastre centros em Configurações ou aplique a migration V2 completa para começar a classificar os lançamentos."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {centrosComTotais.map(c => (
                  <div key={c.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-sm text-gray-800 dark:text-gray-200">{c.nome}</p>
                        <p className="text-xs text-gray-400">{c.codigo ?? 'Sem código'}</p>
                      </div>
                      <span className={cn('text-[11px] px-2 py-1 rounded-full font-medium',
                        c.ativo ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400')}>
                        {c.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <div className="mt-4 space-y-1">
                      <p className="text-xs text-gray-500">Lançamentos vinculados (período)</p>
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{c.qtd}</p>
                    </div>
                    <div className="mt-3">
                      <p className="text-xs text-gray-500">Total movimentado (período)</p>
                      <p className="text-base font-semibold text-gray-800 dark:text-gray-200">
                        R$ {c.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* COMISSÕES */}
        {tab === 'comissoes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 dark:text-gray-200">Comissões</h2>
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                {(['todos', 'pendente', 'aprovada', 'paga', 'cancelada'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setFiltroComissao(s as StatusComissao | 'todos')}
                    className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors capitalize',
                      filtroComissao === s ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500')}>
                    {s === 'todos' ? 'Todos' : s}
                  </button>
                ))}
              </div>
            </div>

            {comissoesFiltradas.length === 0 ? (
              <EmptyState
                title="Nenhuma comissão encontrada"
                subtitle="As comissões são geradas automaticamente a partir das vendas de certificados."
              />
            ) : (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">
                        {['Colaborador', 'Papel', 'Competência', 'Base', '%', 'Valor', 'Status', ''].map(h => <th key={h} className="px-4 py-3">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {comissoesPaginadas.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                          <td className="px-4 py-3 font-medium">{c.profiles?.nome ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-500 capitalize">{c.papel}</td>
                          <td className="px-4 py-3 text-gray-500">{c.competencia}</td>
                          <td className="px-4 py-3 text-gray-500">R$ {Number(c.base_valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-gray-500">{c.percentual != null ? `${c.percentual}%` : '—'}</td>
                          <td className="px-4 py-3 font-semibold text-green-600 dark:text-green-400">
                            R$ {Number(c.valor_comissao).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', statusComissaoCls(c.status))}>
                              {c.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {c.status === 'pendente' && (
                              <button type="button" onClick={() => aprovarComissao(c.id)}
                                className="px-2 py-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50">
                                Aprovar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">
                      Página {Math.min(comissoesPage, totalComissoesPages)} de {totalComissoesPages} — {comissoesFiltradas.length} comissão(ões)
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Mostrar</span>
                      <select
                        value={comissoesPageSize}
                        onChange={e => setComissoesPageSize(Number(e.target.value))}
                        className="text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {PAGE_SIZE_OPTIONS.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                      <span className="text-xs text-gray-400">por página</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setComissoesPage(prev => Math.max(1, prev - 1))}
                      disabled={comissoesPage === 1}
                      className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setComissoesPage(prev => Math.min(totalComissoesPages, prev + 1))}
                      disabled={comissoesPage >= totalComissoesPages}
                      className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      Próxima
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* EXTRATO SPLIT */}
        {tab === 'split' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SaldoCard label="Ordens pendentes/processando" value={ordensPendentes} icon={<TrendingDown size={18} />} colorCls="text-yellow-600 dark:text-yellow-400" bg="bg-yellow-50 dark:bg-yellow-900/20" loading={loading} />
              <SaldoCard label="Total pago" value={ordensPagas} icon={<DollarSign size={18} />} colorCls="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-900/20" loading={loading} />
            </div>
            {ordens.length === 0 ? (
              <EmptyState
                title="Nenhuma ordem de pagamento encontrada"
                subtitle="Essa aba ganha vida assim que começarmos a gerar ordens de split/repasses na V2."
              />
            ) : (
              <SimpleTable
                headers={['Favorecido', 'Provider', 'Valor', 'Status', 'Solicitado em']}
                rows={ordensPaginadas.map(o => [
                  o.favorecido_nome,
                  o.provider,
                  `R$ ${Number(o.valor_pagamento ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                  o.status_integracao,
                  formatDateTime(o.created_at),
                ])}
                page={splitPage}
                totalPages={totalSplitPages}
                totalItems={ordens.length}
                pageSize={splitPageSize}
                onPageChange={setSplitPage}
                onPageSizeChange={setSplitPageSize}
              />
            )}
          </div>
        )}

        {/* FISCAL */}
        {tab === 'fiscal' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SaldoCard label="NFS-e emitidas" value={nfseEmitidasQtd} icon={<TrendingUp size={18} />} colorCls="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-900/20" loading={loading} />
              <SaldoCard label="NFS-e com erro" value={nfseErroQtd} icon={<TrendingDown size={18} />} colorCls="text-red-600 dark:text-red-400" bg="bg-red-50 dark:bg-red-900/20" loading={loading} />
            </div>
            {nfse.length === 0 ? (
              <EmptyState
                title="Nenhuma NFS-e encontrada"
                subtitle="A estrutura fiscal já existe na V2, mas ainda não está alimentada automaticamente pelo fluxo de pagamento."
              />
            ) : (
              <SimpleTable
                headers={['Número', 'Status', 'Emissão', 'Valor Serviço', 'Valor ISS']}
                rows={nfsePaginadas.map(item => [
                  item.numero_nf ?? '—',
                  item.status_nf,
                  item.data_emissao ? formatDateTime(item.data_emissao) : '—',
                  `R$ ${Number(item.valor_servico ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                  `R$ ${Number(item.valor_iss ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                ])}
                page={nfsePage}
                totalPages={totalNfsePages}
                totalItems={nfse.length}
                pageSize={nfsePageSize}
                onPageChange={setNfsePage}
                onPageSizeChange={setNfsePageSize}
              />
            )}
          </div>
        )}
      </div>
    </ModulePageShell>
  )
}


function RealtimeCard({ label, value, subtitle, icon }: { label: string; value: number; subtitle: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="p-2 rounded-xl bg-white/10 text-white">{icon}</div>
      </div>
      <p className="mt-4 text-sm text-slate-300">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{formatMoney(value)}</p>
      <p className="mt-2 text-xs text-slate-400">{subtitle}</p>
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-800 dark:text-gray-200 break-words">{value}</p>
    </div>
  )
}

function CashFlowRow({ label, value, tone }: { label: string; value: number; tone: 'positive' | 'negative' | 'neutral' | 'info' }) {
  const cls = {
    positive: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
    negative: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300',
    neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    info: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
  }[tone]
  return <div className={cn('rounded-2xl px-4 py-3 flex items-center justify-between', cls)}><span className="text-sm font-medium">{label}</span><span className="text-sm font-semibold">{formatMoney(value)}</span></div>
}

function formatMoney(value: number) {
  return `R$ ${Number(value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function SaldoCard({ label, value, icon, colorCls, bg, loading }: {
  label: string; value: number; icon: React.ReactNode; colorCls: string; bg: string; loading: boolean
}) {
  return (
    <div className={cn('rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex items-center gap-4', bg)}>
      <div className={cn('p-2 rounded-lg bg-white/60 dark:bg-gray-900/40', colorCls)}>{icon}</div>
      <div>
        <p className={cn('text-xl font-bold', colorCls)}>
          {loading ? '…' : `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
    </div>
  )
}

function statusCls(s: StatusLancamento) {
  const m: Record<StatusLancamento, string> = {
    recebido: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    pago:     'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    pendente: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    cancelado:'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }
  return m[s]
}

function statusComissaoCls(s: StatusComissao) {
  const m: Record<StatusComissao, string> = {
    pendente:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    aprovada:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    paga:      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    cancelada: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }
  return m[s]
}

function formatDateTime(v: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400 border border-dashed border-gray-200 dark:border-gray-800 rounded-xl bg-white dark:bg-gray-900">
      <DollarSign size={40} className="mb-3 opacity-30" />
      <p className="font-medium">{title}</p>
      <p className="text-sm mt-1 max-w-xl text-center px-6">{subtitle}</p>
    </div>
  )
}

function SimpleTable({
  headers,
  rows,
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  headers: string[]
  rows: string[][]
  page?: number
  totalPages?: number
  totalItems?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">
              {headers.map(h => <th key={h} className="px-4 py-3">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                {row.map((cell, ci) => (
                  <td key={`${idx}-${ci}`} className="px-4 py-3 text-gray-700 dark:text-gray-300">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {page && totalPages && totalItems != null && pageSize && onPageChange && onPageSizeChange && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              Página {Math.min(page, totalPages)} de {totalPages} — {totalItems} registro(s)
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Mostrar</span>
              <select
                value={pageSize}
                onChange={e => onPageSizeChange(Number(e.target.value))}
                className="text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PAGE_SIZE_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400">por página</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
