import { useEffect, useMemo, useState } from 'react'
import { Edit3, PlusCircle, RefreshCw, Search, Trash2, X, Link, Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CatalogoItem {
  id: string
  produto: string
  tipo: string
  modelo: string
  periodo_uso: string
  midia: string | null
  tipo_validacao: string
  preco: number
  gratuito: boolean
  observacao: string | null
  link_compra: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

type NovoItem = Omit<CatalogoItem, 'id' | 'created_at' | 'updated_at'>

const EMPTY: NovoItem = {
  produto: '',
  tipo: 'e-CPF',
  modelo: 'A1',
  periodo_uso: '1 ano',
  midia: 'sem mídia',
  tipo_validacao: 'qualquer',
  preco: 0,
  gratuito: false,
  observacao: null,
  link_compra: null,
  ativo: true,
}

const TIPO_OPTIONS = ['e-CPF', 'e-CNPJ', 'e-PF', 'e-PJ', 'Serviço']
const MODELO_OPTIONS = ['A1', 'A3', 'Nuvem', '—']
const PERIODO_OPTIONS = ['4 meses', '12 meses', '1 ano', '2 anos', '3 anos', 'por visita']
const MIDIA_OPTIONS = ['sem mídia', 'cartão', 'token', 'nuvem', 'domiciliar']
const VALIDACAO_OPTIONS = ['qualquer', 'fast', 'videoconferencia', 'presencial', 'online']

const TIPO_BADGE: Record<string, string> = {
  'e-CPF':  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  'e-CNPJ': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  'e-PF':   'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  'e-PJ':   'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  'Serviço':'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CatalogoIA() {
  const [lista, setLista] = useState<CatalogoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<NovoItem>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function fetchLista() {
    setLoading(true)
    setErro(null)
    const { data, error } = await supabase
      .from('catalogo_ia')
      .select('*')
      .order('tipo')
      .order('modelo')
      .order('periodo_uso')
      .order('midia')
    if (error) { setErro(error.message); setLoading(false); return }
    setLista(data ?? [])
    setLoading(false)
  }

  useEffect(() => { void fetchLista() }, [])

  const filtrado = useMemo(() => {
    let items = lista
    if (filtroTipo !== 'todos') items = items.filter(i => i.tipo === filtroTipo)
    if (busca.trim()) {
      const b = busca.toLowerCase()
      items = items.filter(i =>
        i.produto.toLowerCase().includes(b) ||
        i.tipo.toLowerCase().includes(b) ||
        i.modelo.toLowerCase().includes(b) ||
        (i.observacao ?? '').toLowerCase().includes(b)
      )
    }
    return items
  }, [lista, filtroTipo, busca])

  function abrirNovo() {
    setForm(EMPTY)
    setEditingId(null)
    setShowForm(true)
  }

  function abrirEditar(item: CatalogoItem) {
    setForm({
      produto: item.produto,
      tipo: item.tipo,
      modelo: item.modelo,
      periodo_uso: item.periodo_uso,
      midia: item.midia,
      tipo_validacao: item.tipo_validacao,
      preco: item.preco,
      gratuito: item.gratuito,
      observacao: item.observacao,
      link_compra: item.link_compra,
      ativo: item.ativo,
    })
    setEditingId(item.id)
    setShowForm(true)
  }

  function fecharForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY)
  }

  function upd<K extends keyof NovoItem>(key: K, value: NovoItem[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function salvar() {
    if (!form.produto.trim()) return
    setSaving(true)
    setErro(null)
    const payload = {
      ...form,
      produto: form.produto.trim(),
      midia: form.midia || null,
      observacao: form.observacao?.trim() || null,
      link_compra: form.link_compra?.trim() || null,
      preco: form.gratuito ? 0 : form.preco,
    }
    const { error } = editingId
      ? await supabase.from('catalogo_ia').update(payload).eq('id', editingId)
      : await supabase.from('catalogo_ia').insert([payload])
    if (error) { setErro(error.message); setSaving(false); return }
    setSaving(false)
    fecharForm()
    void fetchLista()
  }

  async function confirmarDelete() {
    if (!confirmDeleteId) return
    setDeleting(true)
    await supabase.from('catalogo_ia').delete().eq('id', confirmDeleteId)
    setDeleting(false)
    setConfirmDeleteId(null)
    void fetchLista()
  }

  async function toggleAtivo(item: CatalogoItem) {
    await supabase.from('catalogo_ia').update({ ativo: !item.ativo }).eq('id', item.id)
    void fetchLista()
  }

  // stats
  const totalAtivos = lista.filter(i => i.ativo).length
  const totalGratuitos = lista.filter(i => i.gratuito && i.ativo).length
  const semLink = lista.filter(i => i.ativo && !i.link_compra).length

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-full">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Catálogo IA</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Produtos e preços usados pelos agentes de IA</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchLista()}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Recarregar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={abrirNovo}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
          >
            <PlusCircle size={16} />
            Novo produto
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{totalAtivos}</p>
          <p className="text-xs text-gray-500 mt-0.5">Produtos ativos</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{totalGratuitos}</p>
          <p className="text-xs text-gray-500 mt-0.5">Gratuitos</p>
        </div>
        <div className={cn(
          'rounded-xl border p-3 text-center',
          semLink > 0
            ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
            : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
        )}>
          <p className={cn('text-2xl font-bold', semLink > 0 ? 'text-amber-600' : 'text-gray-400')}>{semLink}</p>
          <p className="text-xs text-gray-500 mt-0.5">Sem link de compra</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="w-full pl-9 pr-3 h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {busca && (
            <button type="button" onClick={() => setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={12} />
            </button>
          )}
        </div>
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="todos">Todos os tipos</option>
          {TIPO_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {erro && (
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
          {erro}
        </div>
      )}

      {/* Formulário */}
      {showForm && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 dark:text-white">
              {editingId ? 'Editar produto' : 'Novo produto'}
            </h2>
            <button type="button" onClick={fecharForm} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-3">
              <TextField label="Nome do produto" value={form.produto} onChange={v => upd('produto', v)} placeholder="Ex: e-CPF A1 — 1 ano" />
            </div>

            <SelectField label="Tipo" value={form.tipo} onChange={v => upd('tipo', v)}
              options={TIPO_OPTIONS.map(t => ({ value: t, label: t }))} />
            <SelectField label="Modelo" value={form.modelo} onChange={v => upd('modelo', v)}
              options={MODELO_OPTIONS.map(t => ({ value: t, label: t }))} />
            <SelectField label="Período de uso" value={form.periodo_uso} onChange={v => upd('periodo_uso', v)}
              options={PERIODO_OPTIONS.map(t => ({ value: t, label: t }))} />
            <SelectField label="Mídia" value={form.midia ?? ''} onChange={v => upd('midia', v || null)}
              options={[{ value: '', label: '—' }, ...MIDIA_OPTIONS.map(t => ({ value: t, label: t }))]} />
            <SelectField label="Tipo de validação" value={form.tipo_validacao} onChange={v => upd('tipo_validacao', v)}
              options={VALIDACAO_OPTIONS.map(t => ({ value: t, label: t }))} />

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Preço (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.preco}
                onChange={e => upd('preco', parseFloat(e.target.value) || 0)}
                disabled={form.gratuito}
                className="h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
              />
            </div>

            <div className="lg:col-span-3">
              <TextField label="Link de compra" value={form.link_compra ?? ''} onChange={v => upd('link_compra', v || null)} placeholder="https://parceiro.gestaoar.shop/..." />
            </div>

            <div className="lg:col-span-3">
              <TextAreaField label="Observação" value={form.observacao ?? ''} onChange={v => upd('observacao', v || null)} />
            </div>

            <div className="flex gap-4">
              <CheckboxField label="Gratuito" checked={form.gratuito} onChange={v => upd('gratuito', v)} />
              <CheckboxField label="Ativo" checked={form.ativo} onChange={v => upd('ativo', v)} />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <button type="button" onClick={fecharForm} className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={saving || !form.produto.trim()}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar produto'}
            </button>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400 animate-pulse">Carregando catálogo...</div>
        ) : filtrado.length === 0 ? (
          <div className="p-8 text-center">
            <Package size={32} className="mx-auto text-gray-300 dark:text-gray-700 mb-2" />
            <p className="text-sm text-gray-400">Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Produto</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Modelo / Período</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Validação</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Preço</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Link</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtrado.map(item => (
                  <tr key={item.id} className={cn('hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors', !item.ativo && 'opacity-50')}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                      {item.produto}
                      {item.observacao && (
                        <p className="text-xs text-gray-400 font-normal mt-0.5">{item.observacao}</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', TIPO_BADGE[item.tipo] ?? TIPO_BADGE['Serviço'])}>
                        {item.tipo}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-600 dark:text-gray-300">
                      <span className="font-medium">{item.modelo}</span>
                      <span className="text-gray-400 mx-1">·</span>
                      {item.periodo_uso}
                      {item.midia && item.midia !== 'sem mídia' && (
                        <span className="ml-1 text-xs text-gray-400">({item.midia})</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400 capitalize">
                      {item.tipo_validacao === 'qualquer' ? '—' : item.tipo_validacao}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">
                      {item.gratuito
                        ? <span className="text-green-600 font-bold">GRÁTIS</span>
                        : `R$ ${item.preco.toFixed(2).replace('.', ',')}`
                      }
                    </td>
                    <td className="px-3 py-3 text-center">
                      {item.link_compra ? (
                        <a href={item.link_compra} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                          title={item.link_compra}>
                          <Link size={13} />
                        </a>
                      ) : (
                        <span className="text-amber-400 text-xs font-medium">sem link</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => void toggleAtivo(item)}
                        className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                          item.ativo
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 hover:bg-gray-200'
                        )}
                      >
                        {item.ativo ? 'Ativo' : 'Inativo'}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => abrirEditar(item)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                          <Edit3 size={13} />
                        </button>
                        <button type="button" onClick={() => setConfirmDeleteId(item.id)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400">
          {filtrado.length} de {lista.length} produto{lista.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Modal confirmação delete */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 dark:text-white">Confirmar exclusão</h3>
              <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Este produto será removido permanentemente do catálogo da IA. Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDeleteId(null)}
                className="px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button type="button" onClick={() => void confirmarDelete()} disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors disabled:opacity-50">
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Field components ──────────────────────────────────────────────────────────

function TextField({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-300 dark:placeholder:text-gray-600"
      />
    </div>
  )
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

function TextAreaField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={2}
        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
    </div>
  )
}

function CheckboxField({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300 select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      {label}
    </label>
  )
}
