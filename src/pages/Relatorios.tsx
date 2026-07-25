import { useCallback, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { BookmarkPlus, Download, Loader2, RefreshCcw, Search } from 'lucide-react'
import { getApiUrl } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { ConfigurableTable, type ConfigurableColumn } from '@/components/ConfigurableTable'

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
  status_validacao: string | null
  data_validacao: string | null
  pedido_status: string | null
  protocolo_status: string | null
  possui_validacao: boolean
  tipo_atendimento: string | null
  valor: number
}
type GroupRow = { nome: string; quantidade: number; valor: number }
type OperationalReport = {
  tipo: ReportType
  from: string
  to: string
  resumo: { quantidade: number; realizados: number; valor_total: number; com_validacao: number; validacoes_realizadas: number }
  agrupamentos: { parceiros: GroupRow[]; vendedores: GroupRow[]; agentes: GroupRow[] }
  linhas: ReportRow[]
}
type SavedReport = {
  id: string
  nome: string
  filters: {
    tipo: ReportType
    periodo: PeriodPreset
    from: string
    to: string
    parceiroId: string
    vendedorId: string
    agenteId: string
    pedido: string
    protocolo: string
    status: string
  }
}

const EMPTY_FILTERS: ReportFilters = { parceiros: [], vendedores: [], agentes: [] }
const SAVED_REPORTS_KEY = 'avmd:relatorios-operacionais:salvos'

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
  const [savedReports, setSavedReports] = useState<SavedReport[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(SAVED_REPORTS_KEY) ?? '[]') as SavedReport[]
    } catch {
      return []
    }
  })

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

  const detailColumns = useMemo<ConfigurableColumn<ReportRow>[]>(() => [
    { id: 'data', label: 'Data da Venda', width: 185, accessor: row => formatDate(row.data), className: 'whitespace-nowrap' },
    { id: 'pedido', label: 'Pedido', width: 115, accessor: row => row.pedido ?? '—' },
    { id: 'pedido_status', label: 'Status Pedido', width: 145, accessor: row => row.pedido_status?.replaceAll('_', ' ') ?? '—', className: 'capitalize' },
    { id: 'protocolo', label: 'Protocolo', width: 135, accessor: row => row.protocolo ?? '—' },
    { id: 'protocolo_status', label: 'Status Protocolo', width: 155, accessor: row => row.protocolo_status?.replaceAll('_', ' ') ?? '—', className: 'capitalize' },
    { id: 'cliente', label: 'Cliente', width: 250, accessor: row => row.cliente ?? '—' },
    { id: 'produto', label: 'Produto', width: 235, accessor: row => row.produto ?? '—' },
    { id: 'parceiro', label: 'Parceiro', width: 250, accessor: row => row.parceiro ?? '—' },
    { id: 'vendedor', label: 'Vendedor', width: 210, accessor: row => row.vendedor ?? '—' },
    { id: 'agente', label: 'Agente de Registro', width: 210, accessor: row => row.agente_registro ?? '—' },
    { id: 'status', label: 'Status Venda', width: 145, accessor: row => row.status?.replaceAll('_', ' ') ?? '—', className: 'capitalize' },
    { id: 'status_validacao', label: 'Status Validação', width: 155, accessor: row => row.status_validacao?.replaceAll('_', ' ') ?? '—', className: 'capitalize' },
    { id: 'data_validacao', label: 'Data Validação', width: 185, accessor: row => row.data_validacao ? formatDate(row.data_validacao) : '—', className: 'whitespace-nowrap' },
    {
      id: 'valor_atendimento',
      label: tipo === 'vendas' ? 'Valor' : 'Atendimento',
      width: 145,
      accessor: row => tipo === 'vendas' ? formatCurrency(row.valor) : row.tipo_atendimento ?? '—',
      className: 'whitespace-nowrap',
    },
  ], [tipo])

  function setPreset(value: PeriodPreset) {
    setPeriodo(value)
    if (value === 'personalizado') return
    const dates = presetDates(value)
    setFrom(dates.from)
    setTo(dates.to)
  }

  function exportCsv() {
    if (!report?.linhas.length) return
    const headers = ['Data da Venda', 'Pedido', 'Status do Pedido', 'Protocolo', 'Status do Protocolo', 'Cliente', 'Produto', 'Parceiro', 'Vendedor', 'Agente de Registro', 'Status da Venda', 'Status da Validação', 'Data da Validação', 'Tipo de Atendimento', 'Valor']
    const rows = report.linhas.map(row => [
      formatDate(row.data), row.pedido, row.pedido_status, row.protocolo, row.protocolo_status, row.cliente, row.produto, row.parceiro,
      row.vendedor, row.agente_registro, row.status, row.status_validacao,
      row.data_validacao ? formatDate(row.data_validacao) : '', row.tipo_atendimento, row.valor.toFixed(2),
    ])
    const content = '\uFEFF' + [headers, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `relatorio-${tipo}-${from}-a-${to}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function exportExcel(bookType: 'xlsx' | 'xls') {
    if (!report?.linhas.length) return
    const detailRows = report.linhas.map(row => ({
      Data: formatDate(row.data),
      Pedido: row.pedido ?? '',
      Protocolo: row.protocolo ?? '',
      Cliente: row.cliente ?? '',
      Produto: row.produto ?? '',
      Parceiro: row.parceiro ?? '',
      Vendedor: row.vendedor ?? '',
      'Agente de Registro': row.agente_registro ?? '',
      'Status da Venda': row.status?.replaceAll('_', ' ') ?? '',
      'Status da Validação': row.status_validacao?.replaceAll('_', ' ') ?? '',
      'Data da Validação': row.data_validacao ? formatDate(row.data_validacao) : '',
      'Status do Pedido': row.pedido_status?.replaceAll('_', ' ') ?? '',
      'Status do Protocolo': row.protocolo_status?.replaceAll('_', ' ') ?? '',
      'Tipo de Atendimento': row.tipo_atendimento ?? '',
      Valor: row.valor,
    }))
    const summaryRows = [
      { Indicador: tipo === 'vendas' ? 'Vendas encontradas' : 'Validações encontradas', Valor: report.resumo.quantidade },
      { Indicador: tipo === 'vendas' ? 'Emitidas' : 'Realizadas', Valor: report.resumo.realizados },
      { Indicador: 'Com pedido de validação', Valor: report.resumo.com_validacao },
      { Indicador: 'Validações realizadas', Valor: report.resumo.validacoes_realizadas },
      { Indicador: 'Valor total', Valor: report.resumo.valor_total },
      { Indicador: 'Período inicial', Valor: from },
      { Indicador: 'Período final', Valor: to },
    ]
    const workbook = XLSX.utils.book_new()
    const detailSheet = XLSX.utils.json_to_sheet(detailRows)
    detailSheet['!cols'] = Object.keys(detailRows[0] ?? {}).map(key => ({ wch: Math.min(40, Math.max(13, key.length + 2)) }))
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Resumo')
    XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalhamento')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.agrupamentos.parceiros), 'Por Parceiro')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.agrupamentos.vendedores), 'Por Vendedor')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.agrupamentos.agentes), 'Por Agente')
    XLSX.writeFile(workbook, `relatorio-${tipo}-${from}-a-${to}.${bookType}`, { bookType })
  }

  function saveCurrentReport() {
    const nome = window.prompt('Nome para esta configuração de relatório:')
    if (!nome?.trim()) return
    const saved: SavedReport = {
      id: crypto.randomUUID(),
      nome: nome.trim(),
      filters: { tipo, periodo, from, to, parceiroId, vendedorId, agenteId, pedido, protocolo, status },
    }
    const next = [...savedReports, saved]
    setSavedReports(next)
    localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(next))
  }

  function applySavedReport(id: string) {
    const saved = savedReports.find(item => item.id === id)
    if (!saved) return
    setTipo(saved.filters.tipo)
    setPeriodo(saved.filters.periodo)
    setFrom(saved.filters.from)
    setTo(saved.filters.to)
    setParceiroId(saved.filters.parceiroId)
    setVendedorId(saved.filters.vendedorId)
    setAgenteId(saved.filters.agenteId)
    setPedido(saved.filters.pedido)
    setProtocolo(saved.filters.protocolo)
    setStatus(saved.filters.status)
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
          <div className="flex items-center gap-2 flex-wrap">
            {savedReports.length > 0 && (
              <select defaultValue="" onChange={event => { applySavedReport(event.target.value); event.target.value = '' }} className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800">
                <option value="" disabled>Relatórios salvos</option>
                {savedReports.map(saved => <option key={saved.id} value={saved.id}>{saved.nome}</option>)}
              </select>
            )}
            <button type="button" onClick={saveCurrentReport} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 text-blue-600 text-sm">
              <BookmarkPlus size={15} /> Salvar filtros
            </button>
            <button type="button" onClick={() => exportExcel('xlsx')} disabled={!report?.linhas.length} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 text-sm disabled:opacity-40">
              <Download size={15} /> XLSX
            </button>
            <button type="button" onClick={() => exportExcel('xls')} disabled={!report?.linhas.length} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-200 text-emerald-700 text-sm disabled:opacity-40">
              <Download size={15} /> XLS
            </button>
            <button type="button" onClick={exportCsv} disabled={!report?.linhas.length} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm disabled:opacity-40">
              <Download size={15} /> CSV
            </button>
          </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"><p className="text-2xl font-bold">{report?.resumo.quantidade ?? 0}</p><p className="text-xs text-gray-500 mt-1">{tipo === 'vendas' ? 'Vendas encontradas' : 'Validações encontradas'}</p></div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"><p className="text-2xl font-bold text-emerald-600">{report?.resumo.realizados ?? 0}</p><p className="text-xs text-gray-500 mt-1">{tipo === 'vendas' ? 'Emitidas' : 'Realizadas'}</p></div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"><p className="text-2xl font-bold text-blue-600">{report?.resumo.com_validacao ?? 0}</p><p className="text-xs text-gray-500 mt-1">Com pedido de validação</p></div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"><p className="text-2xl font-bold">{formatCurrency(report?.resumo.valor_total ?? 0)}</p><p className="text-xs text-gray-500 mt-1">{tipo === 'vendas' ? 'Valor total das vendas' : 'Valor informativo'}</p></div>
        </div>

        <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-sm font-semibold">Detalhamento</h2>
            <button type="button" onClick={() => void loadReport()} className="text-gray-500 hover:text-blue-600"><RefreshCcw size={15} /></button>
          </div>
          {loading ? <div className="h-48 flex items-center justify-center text-gray-400"><Loader2 size={18} className="animate-spin mr-2" /> Gerando relatório...</div> : !report?.linhas.length ? <p className="py-12 text-center text-sm text-gray-400">Nenhum registro encontrado com os filtros informados.</p> : (
            <ConfigurableTable storageKey={`relatorios-operacionais-${tipo}`} columns={detailColumns} rows={report.linhas} rowKey={row => row.id} />
          )}
        </section>
      </main>
    </div>
  )
}
