import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, Download, Loader2, RefreshCcw, Search } from 'lucide-react'
import { getApiUrl } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

type ReportType = 'vendas' | 'validacoes'
type PeriodPreset = 'semana' | 'quinzena' | 'mes' | 'personalizado'
type Option = { id: string; nome: string; parceiro_id?: string | null }
type ReportFilters = { parceiros: Option[]; vendedores: Option[]; agentes: Option[] }
type ReportRow = {
  id: string
  data: string
  pedido: string | null
  protocolo: string | null
  cliente: string | null
  produto: string | null
  parceiro: string | null
  vendedor: string | null
  agente_registro: string | null
  status: string | null
  tipo_atendimento: string | null
  valor: number
}
type GroupRow = { nome: string; quantidade: number; valor: number }
type OperationalReport = {
  tipo: ReportType
  from: string
  to: string
  resumo: { quantidade: number; realizados: number; valor_total: number }
  agrupamentos: { parceiros: GroupRow[]; vendedores: GroupRow[]; agentes: GroupRow[] }
  linhas: ReportRow[]
}

const EMPTY_FILTERS: ReportFilters = { parceiros: [], vendedores: [], agentes: [] }

function localDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function presetDates(preset: Exclude<PeriodPreset, 'personalizado'>) {
  const end = new Date()
  const start = new Date(end)
  if (preset === 'semana') start.setDate(end.getDate() - 6)
  if (preset === 'quinzena') start.setDate(end.getDate() - 14)
  if (preset === 'mes') start.setDate(1)
  return { from: localDate(start), to: localDate(end) }
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR')
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Option[] }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <select value={value} onChange={event => onChange(event.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800">
        <option value="">Todos</option>
        {options.map(option => <option key={option.id} value={option.id}>{option.nome}</option>)}
      </select>
    </div>
  )
}

export default function Relatorios() {
  const { profile } = useAuth()
  const initialPeriod = presetDates('mes')
  const [tipo, setTipo] = useState<ReportType>('vendas')
  const [periodo, setPeriodo] = useState<PeriodPreset>('mes')
  const [from, setFrom] = useState(initialPeriod.from)
  const [to, setTo] = useState(initialPeriod.to)
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS)
  const [parceiroId, setParceiroId] = useState('')
  const [vendedorId, setVendedorId] = useState('')
  const [agenteId, setAgenteId] = useState('')
  const [pedido, setPedido] = useState('')
  const [protocolo, setProtocolo] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<OperationalReport | null>(null)
  const [groupView, setGroupView] = useState<'parceiros' | 'vendedores' | 'agentes'>('parceiros')

  const loadFilters = useCallback(async () => {
    const response = await fetch(getApiUrl('/comercial/relatorios/operacionais/filtros'))
    const data = await response.json()
    if (response.ok) setFilters((data.filtros ?? EMPTY_FILTERS) as ReportFilters)
  }, [])

  const loadReport = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(getApiUrl('/comercial/relatorios/operacionais'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo,
          from: `${from}T00:00:00.000-03:00`,
          to: `${to}T23:59:59.999-03:00`,
          viewer_profile_id: profile.id,
          viewer_perfil: profile.perfil,
          parceiro_id: parceiroId || null,
          vendedor_id: vendedorId || null,
          agente_registro_id: agenteId || null,
          pedido: pedido.trim() || null,
          protocolo: protocolo.trim() || null,
          status: status || null,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Não foi possível gerar o relatório.')
      setReport((data.relatorio ?? null) as OperationalReport | null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível gerar o relatório.')
    } finally {
      setLoading(false)
    }
  }, [agenteId, from, parceiroId, pedido, profile, protocolo, status, tipo, to, vendedorId])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadFilters(), 0)
    return () => window.clearTimeout(timer)
  }, [loadFilters])
  useEffect(() => {
    if (!profile) return
    const timer = window.setTimeout(() => void loadReport(), 0)
    return () => window.clearTimeout(timer)
  }, [profile]) // eslint-disable-line react-hooks/exhaustive-deps

  const statusOptions = tipo === 'vendas'
    ? ['rascunho', 'vendido', 'agendado', 'em_validacao', 'emitido', 'cancelado']
    : ['pendente', 'confirmado', 'realizado', 'cancelado']

  const groupedRows = useMemo(() => report?.agrupamentos[groupView] ?? [], [groupView, report])

  function setPreset(value: PeriodPreset) {
    setPeriodo(value)
    if (value === 'personalizado') return
    const dates = presetDates(value)
    setFrom(dates.from)
    setTo(dates.to)
  }

  function exportCsv() {
    if (!report?.linhas.length) return
    const headers = ['Data', 'Pedido', 'Protocolo', 'Cliente', 'Produto', 'Parceiro', 'Vendedor', 'Agente de Registro', 'Status', 'Tipo de Atendimento', 'Valor']
    const rows = report.linhas.map(row => [
      formatDate(row.data), row.pedido, row.protocolo, row.cliente, row.produto, row.parceiro,
      row.vendedor, row.agente_registro, row.status, row.tipo_atendimento, row.valor.toFixed(2),
    ])
    const content = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `relatorio-${tipo}-${from}-a-${to}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (!profile) return <div className="flex items-center justify-center h-full text-gray-400">Carregando perfil...</div>

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Relatórios Operacionais</h1>
            <p className="text-xs text-gray-500 mt-1">Vendas e validações com filtros cruzados e detalhamento por responsável.</p>
          </div>
          <button type="button" onClick={exportCsv} disabled={!report?.linhas.length} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-40">
            <Download size={15} /> Exportar CSV
          </button>
        </div>

        <div className="flex gap-2 mt-4">
          {(['vendas', 'validacoes'] as ReportType[]).map(value => (
            <button key={value} type="button" onClick={() => { setTipo(value); setStatus('') }} className={cn('px-4 py-2 rounded-xl text-sm font-semibold', tipo === value ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300')}>
              {value === 'vendas' ? 'Relatório de Vendas' : 'Relatório de Validações'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mt-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Período rápido</label>
            <div className="flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
              {(['semana', 'quinzena', 'mes', 'personalizado'] as PeriodPreset[]).map(value => (
                <button key={value} type="button" onClick={() => setPreset(value)} className={cn('flex-1 px-2 py-1.5 rounded-lg text-xs capitalize', periodo === value ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500')}>
                  {value === 'mes' ? 'Mensal' : value}
                </button>
              ))}
            </div>
          </div>
          <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">De</label><input type="date" value={from} onChange={event => { setFrom(event.target.value); setPeriodo('personalizado') }} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800" /></div>
          <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Até</label><input type="date" value={to} onChange={event => { setTo(event.target.value); setPeriodo('personalizado') }} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800" /></div>
          <SelectFilter label="Parceiro" value={parceiroId} onChange={setParceiroId} options={filters.parceiros} />
          <SelectFilter label="Vendedor" value={vendedorId} onChange={setVendedorId} options={filters.vendedores} />
          <SelectFilter label="Agente de Registro" value={agenteId} onChange={setAgenteId} options={filters.agentes} />
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status</label>
            <select value={status} onChange={event => setStatus(event.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800">
              <option value="">Todos</option>
              {statusOptions.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Pedido</label><input value={pedido} onChange={event => setPedido(event.target.value)} placeholder="Número do pedido" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800" /></div>
          <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Protocolo</label><input value={protocolo} onChange={event => setProtocolo(event.target.value)} placeholder="Número do protocolo" className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800" /></div>
          <button type="button" onClick={() => void loadReport()} className="self-end inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Pesquisar
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6 space-y-5">
        {error && <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"><p className="text-2xl font-bold">{report?.resumo.quantidade ?? 0}</p><p className="text-xs text-gray-500 mt-1">{tipo === 'vendas' ? 'Vendas encontradas' : 'Validações encontradas'}</p></div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"><p className="text-2xl font-bold text-emerald-600">{report?.resumo.realizados ?? 0}</p><p className="text-xs text-gray-500 mt-1">{tipo === 'vendas' ? 'Emitidas' : 'Realizadas'}</p></div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"><p className="text-2xl font-bold">{formatCurrency(report?.resumo.valor_total ?? 0)}</p><p className="text-xs text-gray-500 mt-1">{tipo === 'vendas' ? 'Valor total das vendas' : 'Valor informativo'}</p></div>
        </div>

        <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <div className="flex items-center gap-2"><BarChart3 size={16} className="text-blue-600" /><h2 className="text-sm font-semibold">Resumo agrupado</h2></div>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              {(['parceiros', 'vendedores', 'agentes'] as const).map(value => <button key={value} onClick={() => setGroupView(value)} className={cn('px-3 py-1.5 rounded-md text-xs capitalize', groupView === value ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500')}>{value}</button>)}
            </div>
          </div>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            {groupedRows.slice(0, 12).map(row => <div key={row.nome} className="rounded-lg bg-gray-50 dark:bg-gray-800/60 px-3 py-2"><p className="text-sm font-medium truncate">{row.nome}</p><p className="text-xs text-gray-500">{row.quantidade} registros{tipo === 'vendas' ? ` · ${formatCurrency(row.valor)}` : ''}</p></div>)}
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-sm font-semibold">Detalhamento</h2>
            <button type="button" onClick={() => void loadReport()} className="text-gray-500 hover:text-blue-600"><RefreshCcw size={15} /></button>
          </div>
          {loading ? <div className="h-48 flex items-center justify-center text-gray-400"><Loader2 size={18} className="animate-spin mr-2" /> Gerando relatório...</div> : !report?.linhas.length ? <p className="py-12 text-center text-sm text-gray-400">Nenhum registro encontrado com os filtros informados.</p> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
                  {['Data', 'Pedido', 'Protocolo', 'Cliente', 'Produto', 'Parceiro', 'Vendedor', 'Agente de Registro', 'Status', tipo === 'vendas' ? 'Valor' : 'Atendimento'].map(label => <th key={label} className="px-3 py-3 whitespace-nowrap">{label}</th>)}
                </tr></thead>
                <tbody>{report.linhas.map(row => <tr key={row.id} className="border-b border-gray-100 dark:border-gray-800/70">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.data)}</td><td className="px-3 py-2">{row.pedido ?? '—'}</td><td className="px-3 py-2">{row.protocolo ?? '—'}</td><td className="px-3 py-2 whitespace-nowrap">{row.cliente ?? '—'}</td><td className="px-3 py-2">{row.produto ?? '—'}</td><td className="px-3 py-2">{row.parceiro ?? '—'}</td><td className="px-3 py-2">{row.vendedor ?? '—'}</td><td className="px-3 py-2">{row.agente_registro ?? '—'}</td><td className="px-3 py-2 capitalize">{row.status?.replaceAll('_', ' ') ?? '—'}</td><td className="px-3 py-2 whitespace-nowrap">{tipo === 'vendas' ? formatCurrency(row.valor) : row.tipo_atendimento ?? '—'}</td>
                </tr>)}</tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
