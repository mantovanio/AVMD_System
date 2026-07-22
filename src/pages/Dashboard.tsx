import { useState, useEffect, useCallback } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { RefreshCw, TrendingUp, Users, MessageCircle, AlertTriangle } from 'lucide-react'
import DateFilter, { buildRange } from '@/components/DateFilter'
import { getApiUrl } from '@/lib/api'
import type { DateFilterOption, DateRange, Lead } from '@/types'
import { cn } from '@/lib/utils'

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

const EMISSOES_CANAL = [
  { canal: 'E-Commerce', valor: 234, fill: '#8B5CF6' },
  { canal: 'Balcão',     valor: 188, fill: '#3B82F6' },
  { canal: 'Pré-pago',   valor: 51,  fill: '#F97316' },
  { canal: 'Vouchers',   valor: 0,   fill: '#10B981' },
  { canal: 'Ext.',       valor: 0,   fill: '#EF4444' },
]

export default function Dashboard() {
  const [filter, setFilter]   = useState<DateFilterOption>('este_mes')
  const [range, setRange]     = useState<DateRange>(buildRange('este_mes'))
  const [leads, setLeads]     = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const fetchLeads = useCallback(async (r: DateRange) => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({
        from: r.from.toISOString(),
        to: r.to.toISOString(),
      })
      const response = await fetch(getApiUrl(`/chat/leads?${params.toString()}`))
      const payload = await response.json().catch(() => null) as { leads?: Lead[]; error?: string } | null
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível carregar os leads.')
      setLeads(payload?.leads ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os leads.')
      setLeads([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeads(range) }, [range, fetchLeads])

  function handleFilter(opt: DateFilterOption, r: DateRange) { setFilter(opt); setRange(r) }

  // Métricas IA leads
  const totalLeads   = leads.length
  const agendamentos = leads.filter(l => l.agendamento_criado_em !== null).length
  const conversando  = leads.filter(l => l.status === 'conversando').length
  const foraHorario  = leads.filter(l => l.horario_comercial === false).length

  // Leads por dia
  const leadsByDay = (() => {
    const map: Record<string, number> = {}
    leads.forEach(l => { const d = l.created_at.split('T')[0]; map[d] = (map[d] || 0) + 1 })
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date: date.slice(5), count }))
  })()

  // Leads por dia da semana
  const leadsByDow = (() => {
    const map: Record<number, number> = { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 }
    leads.forEach(l => { map[new Date(l.created_at).getDay()]++ })
    return DAYS.map((name, i) => ({ name, count: map[i] }))
  })()

  // Horário comercial
  const inHours  = leads.filter(l => l.horario_comercial === true).length
  const outHours = leads.filter(l => l.horario_comercial === false).length
  const horarioPie = [
    { name: 'Dentro do Horário', value: inHours  },
    { name: 'Fora do Horário',   value: outHours },
  ]

  return (
    <div className="flex flex-col h-full">
      {/* Banner CertiID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 px-6 pt-5">
        {[
          { label: 'Renovações Pendentes', value: '173',           sub: 'certificados',     icon: <RefreshCw  size={18}/>, color: 'bg-red-500'    },
          { label: 'Valor Potencial',      value: 'R$ 29.386,56',  sub: 'em renovações',    icon: <TrendingUp size={18}/>, color: 'bg-green-500'  },
          { label: 'Emissões Mai/2026',    value: '51',            sub: '⚠ -77% vs Abr',    icon: <AlertTriangle size={18}/>, color: 'bg-yellow-500' },
          { label: 'Total Emissões Acum.', value: '473',           sub: 'no período',       icon: <Users      size={18}/>, color: 'bg-blue-500'   },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex items-center gap-4">
            <div className={cn('text-white rounded-lg p-2.5 shrink-0', k.color)}>{k.icon}</div>
            <div>
              <p className="text-xl font-bold leading-tight">{k.value}</p>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{k.label}</p>
              <p className="text-xs text-gray-400">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Emissões por Canal */}
      <div className="px-6 pt-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold mb-4 text-gray-700 dark:text-gray-300">Emissões por Canal — Mai/2026</h3>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={EMISSOES_CANAL} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="canal" tick={{ fontSize: 11 }} width={72} />
              <Tooltip />
              <Bar dataKey="valor" radius={[0, 4, 4, 0]} name="Emissões">
                {EMISSOES_CANAL.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Divisor — Agente IA */}
      <div className="flex items-center gap-3 px-6 pt-5 pb-0">
        <MessageCircle size={16} className="text-blue-500" />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Agente IA — Leads CertiID</span>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
      </div>

      <DateFilter value={filter} onChange={handleFilter} />

      <div className="flex-1 overflow-auto px-6 pb-6 space-y-5 pt-5">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg p-4 text-sm">
            Erro ao carregar dados: {error}
          </div>
        )}

        {/* KPI Leads IA */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total de Leads',   value: totalLeads,   color: 'bg-blue-500'   },
            { label: 'Agendamentos',     value: agendamentos, color: 'bg-green-500'  },
            { label: 'Conversando',      value: conversando,  color: 'bg-purple-500' },
            { label: 'Fora do Horário',  value: foraHorario,  color: 'bg-orange-500' },
          ].map(k => (
            <div key={k.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-3">
              <div className={cn('w-2 h-8 rounded-full shrink-0', k.color)} />
              <div>
                <p className="text-xl font-bold">{loading ? '—' : k.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{k.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Gráfico Leads por Dia */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <h3 className="text-sm font-semibold mb-4 text-gray-700 dark:text-gray-300">Leads por Dia</h3>
          {loading ? (
            <div className="h-52 flex items-center justify-center text-gray-400 animate-pulse">Carregando...</div>
          ) : (
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={leadsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} name="Leads" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Gráficos linha 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold mb-4 text-gray-700 dark:text-gray-300">Leads por Dia da Semana</h3>
            {loading ? <div className="h-44 flex items-center justify-center text-gray-400 animate-pulse">Carregando...</div> : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={leadsByDow}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Leads" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <h3 className="text-sm font-semibold mb-4 text-gray-700 dark:text-gray-300">Horário Comercial</h3>
            {loading ? <div className="h-44 flex items-center justify-center text-gray-400 animate-pulse">Carregando...</div> : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={horarioPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70}
                    label={({ name, percent }) => `${name ?? ''} ${(((percent as number) ?? 0) * 100).toFixed(0)}%`}>
                    <Cell fill="#3b82f6" /><Cell fill="#f97316" />
                  </Pie>
                  <Tooltip /><Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Lista de Leads */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Últimos Leads</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">
                  {['Nome','WhatsApp','Motivo do Contato','Status'].map(h => <th key={h} className="px-5 py-3">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400 animate-pulse">Carregando...</td></tr>
                ) : leads.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Nenhum lead no período.</td></tr>
                ) : leads.slice(0, 10).map(l => (
                  <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-5 py-3 font-medium">{l.nome_lead || '—'}</td>
                    <td className="px-5 py-3 text-gray-500">{l.whatsapp_lead || '—'}</td>
                    <td className="px-5 py-3 text-gray-500 max-w-xs truncate">{l.motivo_contato || '—'}</td>
                    <td className="px-5 py-3"><StatusBadge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  iniciou_conversa:     { label: 'Iniciou Conversa', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  conversando:          { label: 'Conversando',      cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  agendado:             { label: 'Agendado',         cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  cliente:              { label: 'Cliente',          cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  follow_up:            { label: 'Follow Up',        cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  cancelou_agendamento: { label: 'Cancelou',         cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  perdido:              { label: 'Perdido',          cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={cn('inline-flex px-2 py-0.5 text-xs font-medium rounded-full', cfg.cls)}>{cfg.label}</span>
}
