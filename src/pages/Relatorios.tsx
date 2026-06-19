import { useState, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { Loader2, RefreshCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

type Tab = 'vendas' | 'financeiro' | 'clientes' | 'batimento'

const TABS: { id: Tab; label: string }[] = [
  { id: 'vendas',    label: 'Vendas'            },
  { id: 'financeiro',label: 'Financeiro'        },
  { id: 'clientes',  label: 'Base de Clientes'  },
  { id: 'batimento', label: 'Batimento Safeweb' },
]

const PRODUCT_COLORS = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4','#EC4899','#84CC16']
const CANAL_COLORS: Record<string, string> = {
  balcao: '#3B82F6', ecommerce: '#8B5CF6', prepago: '#F97316',
  voucher: '#10B981', link_externo: '#EF4444',
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function mesLabel(iso: string) {
  const [y, m] = iso.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${months[parseInt(m) - 1]}/${y.slice(2)}`
}

function last12Months(): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

interface KPI { label: string; value: string; sub: string; color: string }

function KPICard({ label, value, sub, color }: KPI) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <p className={cn('text-2xl font-bold', color)}>{value}</p>
      <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-0.5">{label}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <h3 className="text-sm font-semibold mb-4 text-gray-700 dark:text-gray-300">{title}</h3>
      {children}
    </div>
  )
}

export default function Relatorios() {
  const [tab, setTab] = useState<Tab>('vendas')
  const [loading, setLoading] = useState(true)

  // raw data
  const [vendas, setVendas] = useState<{ mes: string; tipo_produto: string; tipo_venda: string | null; valor_venda: number | null }[]>([])
  const [totClientes, setTotClientes] = useState(0)
  const [novosClientes, setNovosClientes] = useState(0)
  const [totPF, setTotPF]  = useState(0)
  const [totPJ, setTotPJ]  = useState(0)
  const [clientesNovos12, setClientesNovos12] = useState<{ mes: string; total: number }[]>([])
  const [batimento, setBatimento] = useState({ validados: 0, nao_verificados: 0, divergentes: 0 })

  useEffect(() => { void fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const from12 = new Date(); from12.setFullYear(from12.getFullYear() - 1)
      const fromIso = from12.toISOString()

      const [vendasRes, clientesRes, batRes] = await Promise.all([
        supabase.from('vendas_certificados')
          .select('created_at, tipo_produto, tipo_venda, valor_venda, status_venda')
          .gte('created_at', fromIso)
          .neq('status_venda', 'cancelado'),
        supabase.from('cadastros_base')
          .select('tipo_cliente, created_at, status'),
        supabase.from('vendas_certificados')
          .select('validado_safeweb')
          .eq('status_venda', 'emitido'),
      ])

      // vendas
      const vRows = (vendasRes.data ?? []).map(r => ({
        mes: (r.created_at as string).slice(0, 7),
        tipo_produto: r.tipo_produto as string,
        tipo_venda: r.tipo_venda as string | null,
        valor_venda: r.valor_venda as number | null,
      }))
      setVendas(vRows)

      // clientes
      const cRows = clientesRes.data ?? []
      setTotClientes(cRows.length)
      setTotPF(cRows.filter(c => c.tipo_cliente === 'pessoa_fisica').length)
      setTotPJ(cRows.filter(c => c.tipo_cliente === 'pessoa_juridica').length)
      const thisMonth = new Date().toISOString().slice(0, 7)
      setNovosClientes(cRows.filter(c => (c.created_at as string).slice(0, 7) === thisMonth).length)

      const months = last12Months()
      setClientesNovos12(months.map(m => ({
        mes: mesLabel(m),
        total: cRows.filter(c => (c.created_at as string).slice(0, 7) === m).length,
      })))

      // batimento
      const bRows = batRes.data ?? []
      setBatimento({
        validados:      bRows.filter(r => r.validado_safeweb === true).length,
        nao_verificados: bRows.filter(r => r.validado_safeweb === null).length,
        divergentes:    bRows.filter(r => r.validado_safeweb === false).length,
      })
    } finally {
      setLoading(false)
    }
  }

  // ── derived: tendência mensal ──────────────────────────────────
  const months = last12Months()
  const tendencia = months.map(m => ({
    mes: mesLabel(m),
    emissoes: vendas.filter(v => v.mes === m).length,
    receita:  vendas.filter(v => v.mes === m).reduce((s, v) => s + (v.valor_venda ?? 0), 0),
  }))

  const mesAtual = new Date().toISOString().slice(0, 7)
  const mesAnterior = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 7)
  const emissoesMes    = vendas.filter(v => v.mes === mesAtual).length
  const emissoesAnt    = vendas.filter(v => v.mes === mesAnterior).length
  const mediaAnual     = emissoesMes > 0 || emissoesAnt > 0
    ? Math.round(vendas.length / months.filter(m => vendas.some(v => v.mes === m)).length || 1) : 0
  const receitaMes     = vendas.filter(v => v.mes === mesAtual).reduce((s, v) => s + (v.valor_venda ?? 0), 0)
  const receitaAnt     = vendas.filter(v => v.mes === mesAnterior).reduce((s, v) => s + (v.valor_venda ?? 0), 0)
  const receitaTotal12 = vendas.reduce((s, v) => s + (v.valor_venda ?? 0), 0)

  // por produto (top 8)
  const porProdutoMap = new Map<string, number>()
  for (const v of vendas) porProdutoMap.set(v.tipo_produto, (porProdutoMap.get(v.tipo_produto) ?? 0) + 1)
  const porProduto = [...porProdutoMap.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([name, value]) => ({ name, value }))

  // por canal
  const porCanalMap = new Map<string, number>()
  for (const v of vendas) {
    const canal = v.tipo_venda ?? 'sem_canal'
    porCanalMap.set(canal, (porCanalMap.get(canal) ?? 0) + 1)
  }
  const porCanal = [...porCanalMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([canal, emissoes]) => ({ canal, emissoes, fill: CANAL_COLORS[canal] ?? '#94A3B8' }))

  const canalTop = porCanal[0]?.canal ?? '—'
  const pctTop   = vendas.length ? Math.round((porCanal[0]?.emissoes ?? 0) / vendas.length * 100) : 0
  const varPct   = emissoesAnt ? Math.round((emissoesMes - emissoesAnt) / emissoesAnt * 100) : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <Loader2 size={20} className="animate-spin mr-2" /> Carregando relatórios...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-6 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-x-auto shrink-0">
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={cn('px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-colors',
              tab === t.id
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800')}>
            {t.label}
          </button>
        ))}
        <button type="button" onClick={() => void fetchAll()} title="Atualizar"
          className="ml-auto w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
          <RefreshCcw size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-6 space-y-6">

        {/* ── VENDAS ──────────────────────────────────────────────── */}
        {tab === 'vendas' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard label="Emissões este mês"  value={String(emissoesMes)} sub={varPct !== 0 ? `${varPct > 0 ? '+' : ''}${varPct}% vs mês anterior` : 'Sem variação'} color={varPct >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-500'} />
              <KPICard label="Mês anterior"        value={String(emissoesAnt)} sub={mesLabel(mesAnterior)} color="text-gray-700 dark:text-gray-300" />
              <KPICard label="Total 12 meses"      value={String(vendas.length)} sub="excluindo canceladas" color="text-green-600 dark:text-green-400" />
              <KPICard label="Canal principal"     value={canalTop} sub={`${pctTop}% das emissões`} color="text-purple-600 dark:text-purple-400" />
            </div>

            <Section title="Tendência Mensal de Emissões (12 meses)">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={tendencia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="emissoes" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Emissões" />
                </LineChart>
              </ResponsiveContainer>
            </Section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Section title="Emissões por Canal (12 meses)">
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={porCanal}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="canal" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="emissoes" radius={[4,4,0,0]} name="Emissões">
                      {porCanal.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Section>

              <Section title="Mix por Tipo de Certificado (12 meses)">
                {porProduto.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Sem dados de produto.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={porProduto} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75}
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                        {porProduto.map((_, i) => <Cell key={i} fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip /><Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Section>
            </div>
          </>
        )}

        {/* ── FINANCEIRO ──────────────────────────────────────────── */}
        {tab === 'financeiro' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <KPICard label="Receita este mês"  value={formatCurrency(receitaMes)}  sub={receitaAnt ? `${receitaMes >= receitaAnt ? '+' : ''}${formatCurrency(receitaMes - receitaAnt)} vs mês ant.` : '—'} color="text-green-600 dark:text-green-400" />
              <KPICard label="Mês anterior"       value={formatCurrency(receitaAnt)}  sub={mesLabel(mesAnterior)} color="text-gray-700 dark:text-gray-300" />
              <KPICard label="Receita 12 meses"   value={formatCurrency(receitaTotal12)} sub="emissões não canceladas" color="text-blue-600 dark:text-blue-400" />
            </div>

            <Section title="Receita Bruta por Mês (R$)">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={tendencia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                  <Bar dataKey="receita" fill="#10B981" radius={[4,4,0,0]} name="Receita" />
                </BarChart>
              </ResponsiveContainer>
            </Section>
          </>
        )}

        {/* ── CLIENTES ────────────────────────────────────────────── */}
        {tab === 'clientes' && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard label="Total de clientes" value={totClientes.toLocaleString('pt-BR')} sub="base ativa + inativa"    color="text-blue-600 dark:text-blue-400" />
              <KPICard label="Novos este mês"    value={String(novosClientes)}                sub="cadastros do mês atual" color="text-green-600 dark:text-green-400" />
              <KPICard label="Pessoa Física"     value={totPF.toLocaleString('pt-BR')}        sub={`${totClientes ? Math.round(totPF/totClientes*100) : 0}% da base`} color="text-purple-600 dark:text-purple-400" />
              <KPICard label="Pessoa Jurídica"   value={totPJ.toLocaleString('pt-BR')}        sub={`${totClientes ? Math.round(totPJ/totClientes*100) : 0}% da base`} color="text-orange-500" />
            </div>

            <Section title="Novos Clientes por Mês (12 meses)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={clientesNovos12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="total" fill="#8B5CF6" radius={[4,4,0,0]} name="Novos clientes" />
                </BarChart>
              </ResponsiveContainer>
            </Section>
          </>
        )}

        {/* ── BATIMENTO SAFEWEB ───────────────────────────────────── */}
        {tab === 'batimento' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-5 text-center">
                <p className="text-3xl font-bold text-green-700 dark:text-green-400">{batimento.validados}</p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">Validados pela Safeweb</p>
                <p className="text-xs text-gray-400 mt-0.5">emitidos com batimento OK</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 p-5 text-center">
                <p className="text-3xl font-bold text-amber-700 dark:text-amber-400">{batimento.nao_verificados}</p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">Não verificados</p>
                <p className="text-xs text-gray-400 mt-0.5">emitidos sem importar Safeweb</p>
              </div>
              <div className={cn('rounded-xl border p-5 text-center', batimento.divergentes > 0
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700')}>
                <p className={cn('text-3xl font-bold', batimento.divergentes > 0 ? 'text-red-600' : 'text-gray-400')}>{batimento.divergentes}</p>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-1">Divergentes</p>
                <p className="text-xs text-gray-400 mt-0.5">no CRM mas não na Safeweb</p>
              </div>
            </div>

            {batimento.nao_verificados > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-400">
                Existem <strong>{batimento.nao_verificados}</strong> emissão(ões) ainda não cruzadas com a planilha Safeweb.
                Acesse <strong>Comercial → Importar Safeweb</strong> para realizar o batimento do mês.
              </div>
            )}

            {batimento.divergentes > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
                <strong>{batimento.divergentes}</strong> venda(s) com status "emitido" não foram encontradas na última importação Safeweb.
                Revise manualmente na aba Lançar Vendas.
              </div>
            )}

            <Section title="Resumo do batimento">
              {(batimento.validados + batimento.nao_verificados + batimento.divergentes) === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nenhuma emissão registrada ainda.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                      data={[
                        { name: 'Validados',      value: batimento.validados,      fill: '#10B981' },
                        { name: 'Não verificados', value: batimento.nao_verificados, fill: '#F59E0B' },
                        { name: 'Divergentes',    value: batimento.divergentes,    fill: '#EF4444' },
                      ].filter(d => d.value > 0)}>
                      {[batimento.validados, batimento.nao_verificados, batimento.divergentes]
                        .filter(v => v > 0)
                        .map((_, i) => <Cell key={i} fill={['#10B981','#F59E0B','#EF4444'][i]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Section>
          </>
        )}

      </div>
    </div>
  )
}
