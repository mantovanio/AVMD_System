import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCcw } from 'lucide-react'
import { getApiUrl } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

type PerfilFiltro = {
  id: string
  nome: string
  perfil: string
  parceiro_id: string | null
  vinculo_nome: string | null
  status: string
}

type LinhaRelatorio = {
  tipo: 'venda' | 'validacao'
  id: string
  data: string
  cliente_nome: string | null
  descricao: string | null
  status: string | null
  modo_operacao: string
  valor_bruto: number
  valor_receber: number
  desconto: number
  imposto_retido: number
}

type RelatorioComissao = {
  profile: {
    id: string
    nome: string
    perfil: string
    parceiro_id: string | null
    vinculo_nome: string | null
  } | null
  from: string
  to: string
  resumo: {
    vendas_quantidade: number
    validacoes_quantidade: number
    vendas_total_bruto: number
    vendas_total_receber: number
    validacoes_total_receber: number
    descontos_total: number
    imposto_retido_total: number
    total_receber: number
  }
  linhas: LinhaRelatorio[]
}

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR')
}

function startOfMonthInput() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
}

function todayInput() {
  return new Date().toISOString().slice(0, 10)
}

function SummaryCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'positive' | 'warning' }) {
  const toneClass = tone === 'positive'
    ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'warning'
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-slate-900 dark:text-white'

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <p className={cn('text-2xl font-bold', toneClass)}>{value}</p>
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mt-1">{label}</p>
    </div>
  )
}

export default function Relatorios() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [loadingPerfis, setLoadingPerfis] = useState(true)
  const [perfis, setPerfis] = useState<PerfilFiltro[]>([])
  const [from, setFrom] = useState(startOfMonthInput())
  const [to, setTo] = useState(todayInput())
  const [targetProfileId, setTargetProfileId] = useState('')
  const [relatorio, setRelatorio] = useState<RelatorioComissao | null>(null)
  const isAdmin = profile?.perfil === 'admin'

  const perfisVisiveis = useMemo(() => {
    if (!profile) return []
    if (isAdmin) return perfis
    return [{
      id: profile.id,
      nome: profile.nome,
      perfil: profile.perfil,
      parceiro_id: profile.parceiro_id,
      vinculo_nome: profile.vinculo_nome,
      status: profile.status,
    }]
  }, [isAdmin, perfis, profile])

  const loadPerfis = useCallback(async () => {
    if (!profile) return
    setLoadingPerfis(true)
    if (!isAdmin) {
      setTargetProfileId(profile.id)
      setLoadingPerfis(false)
      return
    }
    const response = await fetch(getApiUrl('/comercial/relatorios/comissoes/perfis'))
    const data = await response.json()
    const rows = (data.perfis ?? []) as PerfilFiltro[]
    setPerfis(rows)
    setTargetProfileId(prev => prev || rows[0]?.id || profile.id)
    setLoadingPerfis(false)
  }, [isAdmin, profile])

  const loadRelatorio = useCallback(async () => {
    if (!profile) return
    const viewerProfileId = profile.id
    const viewerPerfil = profile.perfil
    const alvo = isAdmin ? (targetProfileId || profile.id) : profile.id
    setLoading(true)
    const response = await fetch(getApiUrl('/comercial/relatorios/comissoes'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${from}T00:00:00.000Z`,
        to: `${to}T23:59:59.999Z`,
        viewer_profile_id: viewerProfileId,
        viewer_perfil: viewerPerfil,
        target_profile_id: alvo,
      }),
    })
    const data = await response.json()
    setRelatorio((data.relatorio ?? null) as RelatorioComissao | null)
    setLoading(false)
  }, [from, isAdmin, profile, targetProfileId, to])

  useEffect(() => { void loadPerfis() }, [loadPerfis])
  useEffect(() => {
    if (!profile) return
    if (loadingPerfis) return
    void loadRelatorio()
  }, [profile, loadingPerfis, loadRelatorio])

  if (!profile) {
    return <div className="flex items-center justify-center h-full text-gray-400">Carregando perfil...</div>
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Relatório de Comissões</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Vendas, validações, descontos, imposto retido e total a receber por perfil.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadRelatorio()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <RefreshCcw size={14} /> Atualizar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">De</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Até</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Parceiro / Perfil</label>
            {isAdmin ? (
              <select value={targetProfileId} onChange={e => setTargetProfileId(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {perfisVisiveis.map(item => (
                  <option key={item.id} value={item.id}>{item.nome} · {item.perfil === 'agente_registro' ? 'Agente' : item.perfil === 'vendedor' ? 'Vendedor' : 'Admin'}</option>
                ))}
              </select>
            ) : (
              <div className="w-full border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2.5 text-sm bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
                {profile.nome} · {profile.perfil === 'agente_registro' ? 'Agente' : profile.perfil === 'vendedor' ? 'Vendedor' : 'Administrador'}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400">
            <Loader2 size={18} className="animate-spin mr-2" /> Carregando relatório...
          </div>
        ) : relatorio ? (
          <>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <SummaryCard label="Vendas" value={String(relatorio.resumo.vendas_quantidade)} />
              <SummaryCard label="Validações" value={String(relatorio.resumo.validacoes_quantidade)} />
              <SummaryCard label="Descontos" value={formatCurrency(relatorio.resumo.descontos_total)} tone="warning" />
              <SummaryCard label="Total a receber" value={formatCurrency(relatorio.resumo.total_receber)} tone="positive" />
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <SummaryCard label="Bruto em vendas" value={formatCurrency(relatorio.resumo.vendas_total_bruto)} />
              <SummaryCard label="Receber vendas" value={formatCurrency(relatorio.resumo.vendas_total_receber)} />
              <SummaryCard label="Receber validações" value={formatCurrency(relatorio.resumo.validacoes_total_receber)} />
              <SummaryCard label="Imposto retido" value={formatCurrency(relatorio.resumo.imposto_retido_total)} tone="warning" />
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Detalhamento</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{relatorio.profile?.nome ?? 'Perfil'} · {formatDate(relatorio.from)} até {formatDate(relatorio.to)}</p>
                </div>
              </div>

              {relatorio.linhas.length === 0 ? (
                <p className="text-sm text-gray-400 py-8 text-center">Nenhum lançamento encontrado nesse período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-gray-800">
                        <th className="py-2 pr-3">Data</th>
                        <th className="py-2 pr-3">Tipo</th>
                        <th className="py-2 pr-3">Cliente</th>
                        <th className="py-2 pr-3">Produto</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Modelo</th>
                        <th className="py-2 pr-3 text-right">Bruto</th>
                        <th className="py-2 pr-3 text-right">Desconto</th>
                        <th className="py-2 pr-3 text-right">Imposto</th>
                        <th className="py-2 text-right">Receber</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatorio.linhas.map(linha => (
                        <tr key={`${linha.tipo}-${linha.id}`} className="border-b border-gray-100 dark:border-gray-800/70 text-gray-700 dark:text-gray-300">
                          <td className="py-2 pr-3 whitespace-nowrap">{formatDate(linha.data)}</td>
                          <td className="py-2 pr-3">{linha.tipo === 'venda' ? 'Venda' : 'Validação'}</td>
                          <td className="py-2 pr-3">{linha.cliente_nome ?? '—'}</td>
                          <td className="py-2 pr-3">{linha.descricao ?? '—'}</td>
                          <td className="py-2 pr-3">{linha.status ?? '—'}</td>
                          <td className="py-2 pr-3">{linha.modo_operacao === 'revenda' ? 'Revenda' : linha.modo_operacao === 'comissao' ? 'Comissão' : 'Validação'}</td>
                          <td className="py-2 pr-3 text-right">{formatCurrency(linha.valor_bruto)}</td>
                          <td className="py-2 pr-3 text-right">{formatCurrency(linha.desconto)}</td>
                          <td className="py-2 pr-3 text-right">{formatCurrency(linha.imposto_retido)}</td>
                          <td className="py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(linha.valor_receber)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-sm text-gray-400">Sem dados para mostrar.</div>
        )}
      </div>
    </div>
  )
}
