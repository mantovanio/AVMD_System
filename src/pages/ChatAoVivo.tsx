import React, { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import {
  MessageCircle,
  CalendarClock,
  Pencil,
  ArrowRightLeft,
  List,
  Columns,
  X,
  Phone,
  Mail,
  Clock3,
  Plus,
  Trash2,
  Settings2,
  Save,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Search,
  Send,
} from 'lucide-react'
import { getApiUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { isAdminProfile } from '@/lib/security'
import { loadActiveWhatsAppIntegration } from '@/lib/whatsappIntegration'
import ChatPanel, { type EvolutionCfg } from '@/components/ChatPanel'
import { logger } from '@/lib/logger'
import type { Lead, StatusLead } from '@/types'

interface ColumnConfig {
  id: string
  status_key: string
  label: string
  color: string
  bg: string
  border: string
  ordem: number
  ativo: boolean
}

type LeadFormState = {
  nome_lead: string
  whatsapp_lead: string
  motivo_contato: string
  resumo_conversa: string
  ultima_mensagem: string
  anotacoes: string
  data_agendamento: string
  status: StatusLead
}

type ColumnFormState = {
  id?: string
  status_key: string
  label: string
  color: string
  bg: string
  border: string
  ordem: number
  ativo: boolean
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: 'iniciou_conversa', status_key: 'iniciou_conversa', label: 'Iniciou Conversa', color: '#F59E0B', bg: 'bg-yellow-50 dark:bg-yellow-900/10', border: 'border-yellow-200 dark:border-yellow-800', ordem: 1, ativo: true },
  { id: 'conversando', status_key: 'conversando', label: 'Conversando', color: '#3B82F6', bg: 'bg-blue-50 dark:bg-blue-900/10', border: 'border-blue-200 dark:border-blue-800', ordem: 2, ativo: true },
  { id: 'agendado', status_key: 'agendado', label: 'Agendado', color: '#10B981', bg: 'bg-green-50 dark:bg-green-900/10', border: 'border-green-200 dark:border-green-800', ordem: 3, ativo: true },
  { id: 'cliente', status_key: 'cliente', label: 'Cliente', color: '#8B5CF6', bg: 'bg-purple-50 dark:bg-purple-900/10', border: 'border-purple-200 dark:border-purple-800', ordem: 4, ativo: true },
  { id: 'follow_up', status_key: 'follow_up', label: 'Follow Up', color: '#F97316', bg: 'bg-orange-50 dark:bg-orange-900/10', border: 'border-orange-200 dark:border-orange-800', ordem: 5, ativo: true },
  { id: 'cancelou_agendamento', status_key: 'cancelou_agendamento', label: 'Cancelou Agendamento', color: '#EF4444', bg: 'bg-red-50 dark:bg-red-900/10', border: 'border-red-200 dark:border-red-800', ordem: 6, ativo: true },
  { id: 'perdido', status_key: 'perdido', label: 'Perdido', color: '#6B7280', bg: 'bg-gray-50 dark:bg-gray-800/30', border: 'border-gray-200 dark:border-gray-700', ordem: 7, ativo: true },
  { id: 'resolvido', status_key: 'resolvido', label: 'Resolvido', color: '#059669', bg: 'bg-emerald-50 dark:bg-emerald-900/10', border: 'border-emerald-200 dark:border-emerald-800', ordem: 8, ativo: true },
  { id: 'arquivado', status_key: 'arquivado', label: 'Arquivado', color: '#64748B', bg: 'bg-slate-50 dark:bg-slate-800/40', border: 'border-slate-200 dark:border-slate-700', ordem: 9, ativo: true },
]

const STATUS_LABEL: Record<string, string> = Object.fromEntries(DEFAULT_COLUMNS.map(column => [column.id, column.label]))
const STATUS_ORDER = DEFAULT_COLUMNS.map(column => column.id)
const CLOSED_STATUS_KEYS = new Set(['cliente', 'perdido', 'cancelou_agendamento', 'resolvido', 'arquivado'])

type QuickModal = { lead: Lead; suggestedStatus: StatusLead } | null
type LeadModal = { mode: 'novo' | 'editar'; lead?: Lead } | null
type ColumnModal = { mode: 'novo' | 'editar'; column: ColumnConfig } | null

function emptyLeadForm(): LeadFormState {
  return {
    nome_lead: '',
    whatsapp_lead: '',
    motivo_contato: '',
    resumo_conversa: '',
    ultima_mensagem: '',
    anotacoes: '',
    data_agendamento: '',
    status: 'iniciou_conversa',
  }
}

function emptyColumnForm(): ColumnConfig {
  return {
    id: '',
    status_key: '',
    label: '',
    color: '#3B82F6',
    bg: 'bg-blue-50 dark:bg-blue-900/10',
    border: 'border-blue-200 dark:border-blue-800',
    ordem: 1,
    ativo: true,
  }
}

function withAlpha(hex: string, alpha: number) {
  const normalized = hex.replace('#', '').trim()
  if (normalized.length !== 6) return hex
  const r = parseInt(normalized.slice(0, 2), 16)
  const g = parseInt(normalized.slice(2, 4), 16)
  const b = parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function ChatAoVivo() {
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]
  const { profile } = useAuth()
  const isAdmin = isAdminProfile(profile)
  const [leads, setLeads] = useState<Lead[]>([])
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'kanban' | 'lista'>('kanban')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [quickModal, setQuickModal] = useState<QuickModal>(null)
  const [leadModal, setLeadModal] = useState<LeadModal>(null)
  const [columnModal, setColumnModal] = useState<ColumnModal>(null)
  const [savingQuick, setSavingQuick] = useState(false)
  const [savingLead, setSavingLead] = useState(false)
  const [savingColumn, setSavingColumn] = useState(false)
  const [reagendarEm, setReagendarEm] = useState('')
  const [reagendarObs, setReagendarObs] = useState('')
  const [leadForm, setLeadForm] = useState<LeadFormState>(emptyLeadForm())
  const [evolution, setEvolution] = useState<EvolutionCfg | null>(null)
  const [chatLead, setChatLead] = useState<Lead | null>(null)
  const [listSearch, setListSearch] = useState('')
  const [listStatusFilter, setListStatusFilter] = useState('todos')
  const [listSort, setListSort] = useState<{ col: string; asc: boolean }>({ col: 'created_at', asc: false })
  const [quickSendLead, setQuickSendLead] = useState<Lead | null>(null)
  const [quickSendText, setQuickSendText] = useState('')
  const [quickSendLoading, setQuickSendLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deletingBulk, setDeletingBulk] = useState(false)
  const [listPageSize, setListPageSize] = useState(25)
  const [listPage, setListPage] = useState(1)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    void loadAll()
    void loadEvolution()
    const interval = setInterval(() => {
      void loadLeads()
      void loadColumns()
    }, 4000)
    return () => { clearInterval(interval) }
  }, [])

  async function loadAll() {
    setLoading(true)
    setError(null)
    await Promise.all([loadLeads(), loadColumns()])
    setLoading(false)
  }

  async function loadLeads() {
    const res = await fetch(getApiUrl('/chat/leads')).catch(() => null)
    if (!res?.ok) {
      setError('Falha ao carregar contatos.')
      return
    }
    const data = await res.json() as { leads?: Lead[] }
    setLeads(data.leads ?? [])
  }

  async function loadColumns() {
    const res = await fetch(getApiUrl('/chat/kanban-columns')).catch(() => null)
    if (!res?.ok) return
    const data = await res.json() as { columns?: ColumnConfig[] }
    const cols = data.columns ?? []
    setColumns((cols.length > 0 ? cols : DEFAULT_COLUMNS).sort((a, b) => a.ordem - b.ordem))
  }

  async function persistColumnOrder(nextColumns: ColumnConfig[]) {
    if (!isAdmin) return
    setColumns(nextColumns)
    await fetch(getApiUrl('/chat/kanban-columns/reorder'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: nextColumns.map((c, i) => ({ id: c.id, ordem: i + 1 })) }),
    })
  }

  async function moveColumn(columnId: string, direction: -1 | 1) {
    if (!isAdmin) return
    const index = columns.findIndex(column => column.id === columnId)
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= columns.length) return
    const nextColumns = [...columns]
    const [moved] = nextColumns.splice(index, 1)
    nextColumns.splice(targetIndex, 0, moved)
    await persistColumnOrder(nextColumns.map((column, position) => ({ ...column, ordem: position + 1 })))
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const newStatus = String(over.id)
    const lead = leads.find(item => item.id === active.id)
    if (!lead || lead.status === newStatus) return
    setLeads(prev => prev.map(item => item.id === lead.id ? { ...item, status: newStatus } : item))
    const res = await fetch(getApiUrl(`/chat/leads/${lead.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) {
      await loadLeads()
      alert('Erro ao mover contato.')
    }
  }

  async function saveQuickAction() {
    if (!quickModal) return
    setSavingQuick(true)
    const updates: Record<string, unknown> = { status: quickModal.suggestedStatus }
    if (quickModal.suggestedStatus === 'agendado' && reagendarEm) {
      updates.data_agendamento = reagendarEm
      updates.agendamento_criado_em = new Date().toISOString()
      if (reagendarObs.trim()) updates.anotacoes = reagendarObs.trim()
    }
    const res = await fetch(getApiUrl(`/chat/leads/${quickModal.lead.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    setSavingQuick(false)
    if (!res.ok) {
      alert('Erro ao salvar.')
      return
    }
    setLeads(prev => prev.map(item => item.id === quickModal.lead.id ? { ...item, ...updates } as Lead : item))
    setQuickModal(null)
    setReagendarEm('')
    setReagendarObs('')
  }

  async function saveLead() {
    setSavingLead(true)
    const payload = {
      nome_lead: leadForm.nome_lead || null,
      whatsapp_lead: leadForm.whatsapp_lead || null,
      motivo_contato: leadForm.motivo_contato || null,
      resumo_conversa: leadForm.resumo_conversa || null,
      ultima_mensagem: leadForm.ultima_mensagem || null,
      anotacoes: leadForm.anotacoes || null,
      data_agendamento: leadForm.data_agendamento || null,
      status: leadForm.status,
    }

    const isEditing = leadModal?.mode === 'editar' && leadModal.lead
    const url = isEditing ? getApiUrl(`/chat/leads/${leadModal!.lead!.id}`) : getApiUrl('/chat/leads')
    const res = await fetch(url, {
      method: isEditing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSavingLead(false)
    if (!res.ok) {
      alert('Erro ao salvar contato.')
      return
    }
    const result = await res.json() as { lead?: Lead }
    const saved = result.lead

    if (isEditing && leadModal?.lead) {
      setLeads(prev => prev.map(item => item.id === leadModal.lead!.id ? (saved ?? { ...item, ...payload }) as Lead : item))
    } else if (saved) {
      setLeads(prev => [saved, ...prev])
    }

    setLeadModal(null)
    setLeadForm(emptyLeadForm())
  }

  async function deleteLead(lead: Lead) {
    if (!isAdmin) return
    if (!confirm(`Excluir o contato ${lead.nome_lead || 'sem nome'}?`)) return
    const res = await fetch(getApiUrl(`/chat/leads/${lead.id}`), { method: 'DELETE' })
    if (!res.ok) { alert('Erro ao excluir contato.'); return }
    setLeads(prev => prev.filter(item => item.id !== lead.id))
    setSelectedIds(prev => { const next = new Set(prev); next.delete(lead.id); return next })
  }

  async function deleteBulk() {
    if (!isAdmin || selectedIds.size === 0) return
    if (!confirm(`Excluir ${selectedIds.size} contato(s) selecionado(s)? Esta ação não pode ser desfeita.`)) return
    setDeletingBulk(true)
    const ids = [...selectedIds]
    const res = await fetch(getApiUrl('/chat/leads'), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    })
    setDeletingBulk(false)
    if (!res.ok) { alert('Erro ao excluir.'); return }
    setLeads(prev => prev.filter(item => !selectedIds.has(item.id)))
    setSelectedIds(new Set())
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredLeads.length && filteredLeads.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredLeads.map(l => l.id)))
    }
  }

  async function loadEvolution() {
    try {
      const data = await loadActiveWhatsAppIntegration()
      if (!data) { logger.warn('ChatAoVivo', 'nenhuma integração WhatsApp ativa encontrada'); return }
      if (!data.supportsEmbeddedChat) { logger.warn('ChatAoVivo', 'integração WhatsApp ativa sem chat embutido', data.engine); return }
      if (data.base_url && data.api_token && data.instance_name) {
        setEvolution({
          base_url: data.base_url,
          api_token: data.api_token,
          instance_name: data.instance_name,
          status: data.status,
          last_test_at: data.last_test_at,
          last_error: data.last_error,
        })
      }
    } catch (error) {
      logger.error('ChatAoVivo', 'erro ao buscar integração WhatsApp', String(error))
    }
  }

  function openWhatsApp(lead: Lead) {
    if (!evolution) {
      void loadEvolution()
    }
    setChatLead(lead)
  }

  function openQuickModal(lead: Lead, suggestedStatus: StatusLead) {
    setQuickModal({ lead, suggestedStatus })
    setReagendarEm(lead.data_agendamento ?? '')
    setReagendarObs(lead.anotacoes ?? '')
  }

  function openNewLead() {
    setLeadModal({ mode: 'novo' })
    setLeadForm(emptyLeadForm())
  }

  function openEditLead(lead: Lead) {
    setLeadModal({ mode: 'editar', lead })
    setLeadForm({
      nome_lead: lead.nome_lead || '',
      whatsapp_lead: lead.whatsapp_lead || '',
      motivo_contato: lead.motivo_contato || '',
      resumo_conversa: lead.resumo_conversa || '',
      ultima_mensagem: lead.ultima_mensagem || '',
      anotacoes: lead.anotacoes || '',
      data_agendamento: lead.data_agendamento || '',
      status: lead.status || 'iniciou_conversa',
    })
  }

  function openNewColumn() {
    setColumnModal({ mode: 'novo', column: emptyColumnForm() })
  }

  function openEditColumn(column: ColumnConfig) {
    setColumnModal({ mode: 'editar', column })
  }

  async function saveColumn() {
    if (!columnModal || !isAdmin) return
    setSavingColumn(true)
    const column = columnModal.column
    const payload = {
      status_key: column.status_key.trim(),
      label: column.label.trim(),
      color: column.color.trim(),
      bg: column.bg.trim(),
      border: column.border.trim(),
      ordem: Number(column.ordem) || 0,
      ativo: column.ativo,
    }

    const body = columnModal.mode === 'editar' && column.id ? { ...payload, id: column.id } : payload
    const res = await fetch(getApiUrl('/chat/kanban-columns'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSavingColumn(false)
    if (!res.ok) {
      alert('Erro ao salvar coluna.')
      return
    }
    setColumnModal(null)
    await loadColumns()
  }

  async function deleteColumn() {
    if (!columnModal?.column.id || !isAdmin) return
    const column = columnModal.column
    const inUse = leads.filter(lead => lead.status === column.status_key)
    const res = await fetch(getApiUrl(`/chat/kanban-columns/${column.id}`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fallbackStatusKey: 'iniciou_conversa' }),
    })
    if (!res.ok) {
      alert('Erro ao excluir coluna.')
      return
    }
    setColumnModal(null)
    await loadColumns()
    await loadLeads()
  }

  const activeLead = leads.find(item => item.id === activeId)
  const totalContatos = useMemo(() => leads.length, [leads])

  const filteredLeads = useMemo(() => {
    let list = [...leads]
    if (listStatusFilter && listStatusFilter !== 'todos') {
      if (listStatusFilter === 'atendidos') {
        list = list.filter(lead => ['cliente', 'agendado'].includes(lead.status))
      } else if (listStatusFilter === 'pendentes') {
        list = list.filter(lead => ['iniciou_conversa', 'conversando', 'follow_up'].includes(lead.status))
      } else if (listStatusFilter === 'atrasados') {
        const now = Date.now()
        list = list.filter(lead => {
          if (!lead.data_agendamento) return false
          const time = new Date(lead.data_agendamento).getTime()
          if (Number.isNaN(time)) return false
          return time < now && lead.status !== 'cliente'
        })
      } else {
        list = list.filter(l => l.status === listStatusFilter)
      }
    }
    if (listSearch.trim()) {
      const q = listSearch.trim().toLowerCase()
      list = list.filter(l =>
        (l.nome_lead ?? '').toLowerCase().includes(q) ||
        (l.whatsapp_lead ?? '').toLowerCase().includes(q) ||
        (l.motivo_contato ?? '').toLowerCase().includes(q) ||
        (l.ultima_mensagem ?? '').toLowerCase().includes(q),
      )
    }
    list.sort((a, b) => {
      const av = String((a as unknown as Record<string, unknown>)[listSort.col] ?? '')
      const bv = String((b as unknown as Record<string, unknown>)[listSort.col] ?? '')
      return listSort.asc ? av.localeCompare(bv) : bv.localeCompare(av)
    })
    return list
  }, [leads, listSearch, listStatusFilter, listSort])

  useEffect(() => {
    setListPage(1)
  }, [listSearch, listStatusFilter, listPageSize])

  const totalListPages = Math.max(1, Math.ceil(filteredLeads.length / listPageSize))
  const paginatedLeads = useMemo(() => {
    const start = (listPage - 1) * listPageSize
    return filteredLeads.slice(start, start + listPageSize)
  }, [filteredLeads, listPage, listPageSize])

  const statusCounters = useMemo(() => {
    const byStatus = columns.map(column => ({
      key: column.status_key,
      label: column.label,
      count: leads.filter(lead => lead.status === column.status_key).length,
      color: column.color,
    }))

    const now = Date.now()
    const pendentes = leads.filter(lead => ['iniciou_conversa', 'conversando', 'follow_up'].includes(lead.status)).length
    const atendidos = leads.filter(lead => ['cliente', 'agendado'].includes(lead.status)).length
    const atrasados = leads.filter(lead => {
      if (!lead.data_agendamento) return false
      const time = new Date(lead.data_agendamento).getTime()
      if (Number.isNaN(time)) return false
      return time < now && lead.status !== 'cliente'
    }).length

    return { byStatus, pendentes, atendidos, atrasados }
  }, [columns, leads])

  useEffect(() => {
    const focusLeadId = localStorage.getItem('crm_chat_focus_lead_id')
    if (!focusLeadId || leads.length === 0) return
    const lead = leads.find(item => item.id === focusLeadId)
    if (!lead) return
    setChatLead(lead)
    localStorage.removeItem('crm_chat_focus_lead_id')
  }, [leads])

  function toggleSort(col: string) {
    setListSort(prev => prev.col === col ? { col, asc: !prev.asc } : { col, asc: true })
  }

  async function sendQuickMessage() {
    if (!quickSendLead || !quickSendText.trim()) return
    setQuickSendLoading(true)
    if (evolution) {
      setChatLead(quickSendLead)
      setQuickSendLead(null)
      setQuickSendText('')
      setQuickSendLoading(false)
      return
    }
    const activeWhatsapp = await loadActiveWhatsAppIntegration().catch(() => null)
    const res = await fetch(getApiUrl('/communication/outbox'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'whatsapp', provider: activeWhatsapp?.provider ?? 'n8n',
        to_address: quickSendLead.whatsapp_lead,
        body: quickSendText.trim(),
        payload: {
          lead_id: quickSendLead.id,
          tipo: 'manual_lista',
          integration_id: activeWhatsapp?.id ?? null,
          whatsapp_engine: activeWhatsapp?.engine ?? null,
          instance_name: activeWhatsapp?.instance_name ?? null,
        },
        scheduled_for: new Date().toISOString(),
      }),
    })
    setQuickSendLoading(false)
    if (!res.ok) { alert('Erro ao enfileirar mensagem.'); return }
    setQuickSendLead(null)
    setQuickSendText('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-500 dark:text-gray-400">{loading ? '…' : `${totalContatos} contatos`}</span>
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button type="button" onClick={() => setView('kanban')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors', view === 'kanban' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')}>
              <Columns size={14} /> Kanban
            </button>
            <button type="button" onClick={() => setView('lista')} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors', view === 'lista' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300')}>
              <List size={14} /> Lista
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <button type="button" onClick={openNewLead} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium">
            <UserPlus size={14} /> Novo contato
          </button>
          <button type="button" onClick={openNewColumn} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-700">
            <Plus size={14} /> Coluna
          </button>
          <button type="button" onClick={() => openEditColumn(columns[0] ?? DEFAULT_COLUMNS[0])} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-xs font-medium hover:bg-gray-200 dark:hover:bg-gray-700">
            <Settings2 size={14} /> Colunas
          </button>
        </div>
      </div>

      {loading && <div className="flex-1 flex items-center justify-center text-gray-400 animate-pulse">Carregando contatos...</div>}
      {error && <div className="p-6"><div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 rounded-lg p-4 text-sm">Erro: {error}</div></div>}

      {!loading && !error && view === 'kanban' && (
        <DndContext sensors={sensors} onDragStart={event => setActiveId(event.active.id as string)} onDragEnd={handleDragEnd}>
          <div className="hidden flex-1 overflow-x-auto p-6 md:block">
            <div className="flex gap-4 h-full" style={{ minWidth: `${columns.length * 296}px` }}>
              {columns.map(column => {
                const colLeads = leads.filter(lead => lead.status === column.status_key)
                return (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    leads={colLeads}
                    hoveredId={hoveredId}
                    onHover={setHoveredId}
                    onOpenModal={openQuickModal}
                    onOpenEdit={openEditLead}
                    onDelete={deleteLead}
                    onOpenWhatsApp={openWhatsApp}
                    onEditColumn={openEditColumn}
                    onMoveColumn={moveColumn}
                    isAdmin={isAdmin}
                  />
                )
              })}
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 md:hidden">
            <div className="grid gap-3">
              {columns.map(column => {
                const colLeads = leads.filter(lead => lead.status === column.status_key)
                return (
                  <div key={column.id} className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{column.label}</p>
                        <p className="text-sm text-gray-500">{colLeads.length} contato(s)</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {colLeads.length === 0 ? (
                        <p className="text-xs text-gray-400">Sem contatos</p>
                      ) : colLeads.map(lead => (
                        <MobileLeadCard
                          key={lead.id}
                          lead={lead}
                          onOpenChat={() => openWhatsApp(lead)}
                          onEdit={() => openEditLead(lead)}
                          onMove={() => openQuickModal(lead, nextSuggestedStatus(lead.status))}
                          onDelete={() => deleteLead(lead)}
                          isAdmin={isAdmin}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
          <DragOverlay>
            {activeLead ? (
              <LeadCard
                lead={activeLead}
                color="#3b82f6"
                isDragging
                hovered={false}
                isAdmin={false}
                onQuickMessage={() => undefined}
                onQuickEdit={() => undefined}
                onSchedule={() => undefined}
                onEdit={() => undefined}
                onDelete={() => undefined}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {!loading && !error && view === 'lista' && (
        <div className="flex-1 overflow-auto flex flex-col">
          {/* Barra de filtros */}
          <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusQuickChip
                active={listStatusFilter === 'todos'}
                label="Todos"
                count={totalContatos}
                onClick={() => setListStatusFilter('todos')}
              />
              <StatusQuickChip
                active={listStatusFilter === 'atendidos'}
                label="Atendidos"
                count={statusCounters.atendidos}
                tone="emerald"
                onClick={() => {
                  if (statusCounters.atendidos === 0) return
                  setListStatusFilter(prev => prev === 'atendidos' ? 'todos' : 'atendidos')
                }}
              />
              <StatusQuickChip
                active={listStatusFilter === 'pendentes'}
                label="Pendentes"
                count={statusCounters.pendentes}
                tone="amber"
                onClick={() => {
                  if (statusCounters.pendentes === 0) return
                  setListStatusFilter(prev => prev === 'pendentes' ? 'todos' : 'pendentes')
                }}
              />
              <StatusQuickChip
                active={listStatusFilter === 'atrasados'}
                label="Em atraso"
                count={statusCounters.atrasados}
                tone="red"
                onClick={() => {
                  if (statusCounters.atrasados === 0) return
                  setListStatusFilter(prev => prev === 'atrasados' ? 'todos' : 'atrasados')
                }}
              />
              {statusCounters.byStatus.map(item => (
                <StatusQuickChip
                  key={item.key}
                  active={listStatusFilter === item.key}
                  label={item.label}
                  count={item.count}
                  customColor={item.color}
                  onClick={() => setListStatusFilter(prev => prev === item.key ? '' : item.key)}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar nome, WhatsApp, produto…"
                value={listSearch}
                onChange={e => setListSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <span className="text-xs text-gray-400">
              {filteredLeads.length} de {totalContatos}
              {listStatusFilter !== 'todos' && ` · filtro: ${statusLabelFromKey(listStatusFilter, statusCounters.byStatus)}`}
            </span>
            {isAdmin && selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => void deleteBulk()}
                disabled={deletingBulk}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium ml-auto"
              >
                <Trash2 size={13} />
                {deletingBulk ? 'Excluindo…' : `Excluir selecionados (${selectedIds.size})`}
              </button>
            )}
            </div>
          </div>

          {/* Tabela */}
          <div className="hidden flex-1 overflow-auto p-6 pt-4 md:block">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left select-none">
                    {isAdmin && (
                      <th className="pl-4 pr-2 py-3 w-8">
                        <input
                          type="checkbox"
                          aria-label="Selecionar todos"
                          checked={paginatedLeads.length > 0 && paginatedLeads.every(lead => selectedIds.has(lead.id))}
                          ref={el => {
                            if (el) {
                              const selectedVisible = paginatedLeads.filter(lead => selectedIds.has(lead.id)).length
                              el.indeterminate = selectedVisible > 0 && selectedVisible < paginatedLeads.length
                            }
                          }}
                          onChange={() => {
                            const visibleIds = paginatedLeads.map(lead => lead.id)
                            const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
                            if (allVisibleSelected) {
                              setSelectedIds(prev => {
                                const next = new Set(prev)
                                visibleIds.forEach(id => next.delete(id))
                                return next
                              })
                            } else {
                              setSelectedIds(prev => {
                                const next = new Set(prev)
                                visibleIds.forEach(id => next.add(id))
                                return next
                              })
                            }
                          }}
                          className="rounded border-gray-300 dark:border-gray-600 accent-red-600 cursor-pointer"
                        />
                      </th>
                    )}
                    {[
                      { col: 'nome_lead', label: 'Nome' },
                      { col: 'whatsapp_lead', label: 'WhatsApp' },
                      { col: 'motivo_contato', label: 'Produto' },
                      { col: 'ultima_mensagem', label: 'Última mensagem' },
                      { col: 'status', label: 'Status' },
                      { col: 'created_at', label: 'Criado em' },
                    ].map(({ col, label }) => (
                      <th
                        key={col}
                        className="px-4 py-3 cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 whitespace-nowrap"
                        onClick={() => toggleSort(col)}
                      >
                        {label}
                        {listSort.col === col && <span className="ml-1">{listSort.asc ? '↑' : '↓'}</span>}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {paginatedLeads.length === 0 ? (
                    <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400">Nenhum contato encontrado.</td></tr>
                  ) : paginatedLeads.map(lead => (
                    <tr
                      key={lead.id}
                      className={cn(
                        'hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors group',
                        selectedIds.has(lead.id) && 'bg-red-50 dark:bg-red-900/10',
                      )}
                    >
                      {isAdmin && (
                        <td className="pl-4 pr-2 py-3 w-8">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${lead.nome_lead ?? ''}`}
                            checked={selectedIds.has(lead.id)}
                            onChange={() => toggleSelect(lead.id)}
                            className="rounded border-gray-300 dark:border-gray-600 accent-red-600 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 max-w-[200px] truncate">
                        {lead.nome_lead || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {lead.whatsapp_lead || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 max-w-[220px] truncate" title={lead.motivo_contato ?? ''}>
                        {lead.motivo_contato || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-[200px] truncate" title={lead.ultima_mensagem ?? lead.resumo_conversa ?? ''}>
                        {lead.ultima_mensagem || lead.resumo_conversa || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusPill status={lead.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                        {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ActionBtn
                            title="Conversar no chat"
                            color="green"
                            icon={<MessageCircle size={13} />}
                            onClick={() => openWhatsApp(lead)}
                          />
                          <ActionBtn
                            title="Enviar mensagem rápida"
                            color="blue"
                            icon={<Send size={13} />}
                            onClick={() => { setQuickSendLead(lead); setQuickSendText('') }}
                          />
                          <ActionBtn
                            title="Mover etapa"
                            color="amber"
                            icon={<ArrowRightLeft size={13} />}
                            onClick={() => openQuickModal(lead, nextSuggestedStatus(lead.status))}
                          />
                          <ActionBtn
                            title="Editar contato"
                            color="gray"
                            icon={<Pencil size={13} />}
                            onClick={() => openEditLead(lead)}
                          />
                          {isAdmin && (
                            <ActionBtn
                              title="Excluir contato"
                              color="red"
                              icon={<Trash2 size={13} />}
                              onClick={() => deleteLead(lead)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">
                  Página {listPage} de {totalListPages} — {filteredLeads.length} contato(s)
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Mostrar</span>
                  <select
                    value={listPageSize}
                    onChange={e => setListPageSize(Number(e.target.value))}
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
                  onClick={() => setListPage(prev => Math.max(1, prev - 1))}
                  disabled={listPage === 1}
                  className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setListPage(prev => Math.min(totalListPages, prev + 1))}
                  disabled={listPage >= totalListPages}
                  className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Próxima
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 md:hidden">
            <div className="space-y-3">
              {paginatedLeads.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
                  Nenhum contato encontrado.
                </div>
              ) : paginatedLeads.map(lead => (
                <MobileLeadCard
                  key={lead.id}
                  lead={lead}
                  onOpenChat={() => openWhatsApp(lead)}
                  onEdit={() => openEditLead(lead)}
                  onMove={() => openQuickModal(lead, nextSuggestedStatus(lead.status))}
                  onDelete={() => deleteLead(lead)}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2">
              <button
                type="button"
                onClick={() => setListPage(prev => Math.max(1, prev - 1))}
                disabled={listPage === 1}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-xs text-gray-500">
                {listPage} / {totalListPages}
              </span>
              <button
                type="button"
                onClick={() => setListPage(prev => Math.min(totalListPages, prev + 1))}
                disabled={listPage >= totalListPages}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs disabled:opacity-40"
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      )}

      {quickModal && (
        <QuickActionModal
          quickModal={quickModal}
          onClose={() => setQuickModal(null)}
          onStatusChange={status => setQuickModal({ ...quickModal, suggestedStatus: status })}
          onSave={saveQuickAction}
          onOpenWhatsApp={() => openWhatsApp(quickModal.lead)}
          saving={savingQuick}
          reagendarEm={reagendarEm}
          setReagendarEm={setReagendarEm}
          reagendarObs={reagendarObs}
          setReagendarObs={setReagendarObs}
        />
      )}

      {leadModal && (
        <LeadEditorModal
          mode={leadModal.mode}
          lead={leadModal.lead}
          form={leadForm}
          setForm={setLeadForm}
          onClose={() => setLeadModal(null)}
          onSave={saveLead}
          onDelete={isAdmin && leadModal.mode === 'editar' && leadModal.lead ? () => deleteLead(leadModal.lead!) : undefined}
          saving={savingLead}
        />
      )}

      {columnModal && (
        <ColumnEditorModal
          mode={columnModal.mode}
          column={columnModal.column}
          onChange={next => setColumnModal({ ...columnModal, column: next })}
          onClose={() => setColumnModal(null)}
          onSave={saveColumn}
          onDelete={columnModal.mode === 'editar' ? deleteColumn : undefined}
          saving={savingColumn}
        />
      )}

      {chatLead && (
        <ChatPanel
          key={chatLead.id}
          contact={{
            id:                   chatLead.id,
            nome:                 chatLead.nome_lead,
            telefone:             chatLead.whatsapp_lead,
            id_conversa_chatwoot: null,
            evolution_remote_jid: chatLead.evolution_remote_jid,
            evolution_instance:   chatLead.evolution_instance,
            _table:               'leads_contabilidade',
          }}
          evolution={evolution}
          onClose={() => setChatLead(null)}
        />
      )}

      {quickSendLead && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Enviar mensagem</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{quickSendLead.nome_lead || 'Sem nome'} · {quickSendLead.whatsapp_lead || 'Sem WhatsApp'}</p>
              </div>
              <button type="button" onClick={() => setQuickSendLead(null)} aria-label="Fechar" className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <textarea
                rows={4}
                value={quickSendText}
                onChange={e => setQuickSendText(e.target.value)}
                placeholder="Digite a mensagem…"
                className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <p className="text-xs text-gray-400">
                {evolution ? 'Abre o chat para enviar pelo WhatsApp.' : 'A mensagem será enfileirada no canal WhatsApp configurado.'}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void sendQuickMessage()}
                  disabled={!quickSendText.trim() || quickSendLoading}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium flex items-center justify-center gap-2"
                >
                  <Send size={14} />
                  {quickSendLoading ? 'Enviando…' : evolution ? 'Abrir chat' : 'Enfileirar envio'}
                </button>
                <button type="button" onClick={() => setQuickSendLead(null)} className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function statusLabelFromKey(
  key: string,
  statuses: Array<{ key: string; label: string }>,
) {
  if (key === 'todos') return 'Todos'
  if (key === 'atendidos') return 'Atendidos'
  if (key === 'pendentes') return 'Pendentes'
  if (key === 'atrasados') return 'Em atraso'
  return statuses.find(item => item.key === key)?.label ?? key
}

function StatusQuickChip({
  active,
  label,
  count,
  onClick,
  tone = 'slate',
  customColor,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
  tone?: 'slate' | 'emerald' | 'amber' | 'red'
  customColor?: string
}) {
  const palette = {
    slate: {
      color: '#64748B',
      border: 'border-slate-200 dark:border-slate-700',
      bg: 'bg-slate-50/80 dark:bg-slate-900/30',
      text: 'text-slate-700 dark:text-slate-200',
      badge: 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-200',
      activeBg: 'bg-slate-100 dark:bg-slate-800/70',
    },
    emerald: {
      color: '#10B981',
      border: 'border-emerald-200 dark:border-emerald-800',
      bg: 'bg-emerald-50/80 dark:bg-emerald-950/20',
      text: 'text-emerald-700 dark:text-emerald-300',
      badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
      activeBg: 'bg-emerald-100 dark:bg-emerald-900/35',
    },
    amber: {
      color: '#F59E0B',
      border: 'border-amber-200 dark:border-amber-800',
      bg: 'bg-amber-50/80 dark:bg-amber-950/20',
      text: 'text-amber-700 dark:text-amber-300',
      badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
      activeBg: 'bg-amber-100 dark:bg-amber-900/35',
    },
    red: {
      color: '#EF4444',
      border: 'border-red-200 dark:border-red-800',
      bg: 'bg-red-50/80 dark:bg-red-950/20',
      text: 'text-red-700 dark:text-red-300',
      badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
      activeBg: 'bg-red-100 dark:bg-red-900/35',
    },
  } as const

  const current = palette[tone]
  const inlineColor = customColor ?? current.color

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all',
        current.border,
        current.bg,
        current.text,
        active ? `shadow-sm ${current.activeBg}` : 'hover:-translate-y-[1px] hover:shadow-sm',
      )}
      style={{
        borderLeftWidth: 4,
        borderLeftColor: inlineColor,
      }}
    >
      <span className="whitespace-nowrap">{label}</span>
      <span className={cn('min-w-6 rounded-full px-2 py-0.5 text-[11px] font-semibold text-center', current.badge)}>
        {count}
      </span>
    </button>
  )
}

const ACTION_COLORS = {
  green: 'bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400',
  blue:  'bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-400',
  amber: 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40 text-amber-700 dark:text-amber-400',
  gray:  'bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300',
  red:   'bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400',
}

function ActionBtn({ icon, title, color, onClick }: { icon: React.ReactNode; title: string; color: keyof typeof ACTION_COLORS; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={e => { e.stopPropagation(); onClick() }}
      className={cn('w-7 h-7 rounded-lg flex items-center justify-center transition-colors shrink-0', ACTION_COLORS[color])}
    >
      {icon}
    </button>
  )
}

function KanbanColumn({
  column,
  leads,
  hoveredId,
  onHover,
  onOpenModal,
  onOpenEdit,
  onDelete,
  onOpenWhatsApp,
  onEditColumn,
  onMoveColumn,
  isAdmin,
}: {
  column: ColumnConfig
  leads: Lead[]
  hoveredId: string | null
  onHover: (id: string | null) => void
  onOpenModal: (lead: Lead, status: StatusLead) => void
  onOpenEdit: (lead: Lead) => void
  onDelete: (lead: Lead) => void
  onOpenWhatsApp: (lead: Lead) => void
  onEditColumn: (column: ColumnConfig) => void
  onMoveColumn: (columnId: string, direction: -1 | 1) => void
  isAdmin: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status_key })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col rounded-2xl border bg-white dark:bg-[#111827] transition-colors',
        column.border,
        isOver && 'ring-2 ring-blue-400'
      )}
      style={{ minWidth: 280, width: 280 }}
    >
      <div
        className="rounded-t-2xl px-4 py-3 flex items-center justify-between gap-2 border-b"
        style={{
          backgroundColor: withAlpha(column.color, 0.1),
          borderColor: withAlpha(column.color, 0.24),
        }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate" style={{ color: column.color }}>{column.label}</span>
            <button type="button" onClick={() => onEditColumn(column)} title="Editar coluna" className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100">
              <Pencil size={13} />
            </button>
            <button type="button" onClick={() => onMoveColumn(column.id, -1)} title="Mover para a esquerda" className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100">
              <ChevronLeft size={13} />
            </button>
            <button type="button" onClick={() => onMoveColumn(column.id, 1)} title="Mover para a direita" className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100">
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full border"
          style={{
            color: column.color,
            backgroundColor: withAlpha(column.color, 0.08),
            borderColor: withAlpha(column.color, 0.16),
          }}
        >
          {leads.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {leads.map(lead => (
          <DraggableCard
            key={lead.id}
            lead={lead}
            color={column.color}
            hovered={hoveredId === lead.id}
            onHover={onHover}
            onOpenModal={onOpenModal}
            onOpenEdit={onOpenEdit}
            onDelete={onDelete}
            onOpenWhatsApp={onOpenWhatsApp}
            isAdmin={isAdmin}
          />
        ))}
        {leads.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Nenhum lead</p>}
      </div>
    </div>
  )
}

function DraggableCard({
  lead,
  color,
  hovered,
  onHover,
  onOpenModal,
  onOpenEdit,
  onDelete,
  onOpenWhatsApp,
  isAdmin,
}: {
  lead: Lead
  color: string
  hovered: boolean
  onHover: (id: string | null) => void
  onOpenModal: (lead: Lead, status: StatusLead) => void
  onOpenEdit: (lead: Lead) => void
  onDelete: (lead: Lead) => void
  onOpenWhatsApp: (lead: Lead) => void
  isAdmin: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })
  const nextStatus = nextSuggestedStatus(lead.status)
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onMouseEnter={() => onHover(lead.id)} onMouseLeave={() => onHover(null)} style={{ opacity: isDragging ? 0.4 : 1 }} className="relative">
      <LeadCard
        lead={lead}
        color={color}
        isDragging={isDragging}
        hovered={hovered}
        onQuickMessage={() => onOpenWhatsApp(lead)}
        onQuickEdit={() => onOpenModal(lead, nextStatus)}
        onSchedule={() => onOpenModal(lead, 'agendado')}
        onEdit={() => onOpenEdit(lead)}
        onDelete={() => onDelete(lead)}
        isAdmin={isAdmin}
      />
    </div>
  )
}

function LeadCard({
  lead,
  color,
  isDragging,
  hovered,
  onQuickMessage,
  onQuickEdit,
  onSchedule,
  onEdit,
  onDelete,
  isAdmin,
}: {
  lead: Lead
  color: string
  isDragging?: boolean
  hovered?: boolean
  onQuickMessage: () => void
  onQuickEdit: () => void
  onSchedule: () => void
  onEdit: () => void
  onDelete: () => void
  isAdmin?: boolean
}) {
  return (
    <div
      className={cn(
        'group bg-white dark:bg-[#1E2535] rounded-xl p-3 shadow-sm border border-gray-200 dark:border-gray-700 cursor-grab hover:-translate-y-0.5 transition-transform',
        isDragging && 'shadow-lg cursor-grabbing'
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: color }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{lead.nome_lead || 'Sem nome'}</p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{lead.whatsapp_lead || 'Sem WhatsApp'}</p>
        </div>
        <span
          className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
          style={{
            color,
            backgroundColor: withAlpha(color, 0.08),
            borderColor: withAlpha(color, 0.16),
          }}
        >
          {STATUS_LABEL[lead.status] ?? lead.status}
        </span>
      </div>

      <div className="mt-2 space-y-1.5">
        <InfoLine label="Produto" value={lead.motivo_contato || 'Não informado'} />
        <InfoLine label="Última msg" value={lead.ultima_mensagem || lead.resumo_conversa || 'Sem histórico'} />
        <InfoLine label="Atributos" value={buildAttributes(lead)} />
      </div>

      <div className={cn('mt-3 flex flex-wrap items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity', hovered && 'opacity-100')}>
        <QuickButton icon={<MessageCircle size={13} />} label="Chat" onClick={onQuickMessage} />
        <QuickButton icon={<ArrowRightLeft size={13} />} label="Etapa" onClick={onQuickEdit} />
        <QuickButton icon={<CalendarClock size={13} />} label="Retorno" onClick={onSchedule} />
        <QuickButton icon={<Pencil size={13} />} label="Editar" onClick={onEdit} />
        {isAdmin && <QuickButton icon={<Trash2 size={13} />} label="Excluir" onClick={onDelete} />}
      </div>
    </div>
  )
}

function QuickActionModal({
  quickModal,
  onClose,
  onStatusChange,
  onSave,
  onOpenWhatsApp,
  saving,
  reagendarEm,
  setReagendarEm,
  reagendarObs,
  setReagendarObs,
}: {
  quickModal: QuickModal
  onClose: () => void
  onStatusChange: (status: StatusLead) => void
  onSave: () => void
  onOpenWhatsApp: () => void
  saving: boolean
  reagendarEm: string
  setReagendarEm: (value: string) => void
  reagendarObs: string
  setReagendarObs: (value: string) => void
}) {
  if (!quickModal) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Ação rápida</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{quickModal.lead.nome_lead || 'Sem nome'}</p>
          </div>
          <button type="button" onClick={onClose} title="Fechar" aria-label="Fechar" className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <LeadPreview lead={quickModal.lead} />
          <div className="grid grid-cols-2 gap-2">
            {STATUS_ORDER.map(status => (
              <button key={status} type="button" onClick={() => onStatusChange(status)} className={cn('px-3 py-2 rounded-lg text-xs font-medium border transition-colors text-left', quickModal.suggestedStatus === status ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800')}>
                {STATUS_LABEL[status]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onOpenWhatsApp} className="px-3 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2">
              <MessageCircle size={14} /> Conversar
            </button>
            <button type="button" onClick={() => onStatusChange('agendado')} className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center gap-2">
              <CalendarClock size={14} /> Agendar retorno
            </button>
          </div>
          {quickModal.suggestedStatus === 'agendado' && (
            <div className="grid grid-cols-1 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">Data e hora do retorno</span>
                <input type="datetime-local" value={reagendarEm} onChange={e => setReagendarEm(e.target.value)} className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">Observação</span>
                <textarea value={reagendarObs} onChange={e => setReagendarObs(e.target.value)} rows={3} className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Ex: ligar após envio da proposta" />
              </label>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onSave} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium flex items-center justify-center gap-2">
              <Pencil size={14} /> {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LeadPreview({ lead }: { lead: Lead }) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-3 text-xs">
      <PreviewRow icon={<Phone size={12} />} label="WhatsApp" value={lead.whatsapp_lead || 'Não informado'} />
      <PreviewRow icon={<Mail size={12} />} label="Produto" value={lead.motivo_contato || 'Não informado'} />
      <PreviewRow icon={<Clock3 size={12} />} label="Última mensagem" value={lead.ultima_mensagem || lead.resumo_conversa || 'Sem histórico'} />
      <PreviewRow icon={<Pencil size={12} />} label="Atributos" value={buildAttributes(lead)} />
    </div>
  )
}

function PreviewRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-gray-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-gray-700 dark:text-gray-200 break-words">{value}</p>
      </div>
    </div>
  )
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-16 shrink-0 text-gray-400">{label}</span>
      <span className="min-w-0 text-gray-600 dark:text-gray-300 break-words">{value}</span>
    </div>
  )
}

function QuickButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors">
      {icon}
      {label}
    </button>
  )
}

function MobileLeadCard({
  lead,
  onOpenChat,
  onEdit,
  onMove,
  onDelete,
  isAdmin,
}: {
  lead: Lead
  onOpenChat: () => void
  onEdit: () => void
  onMove: () => void
  onDelete: () => void
  isAdmin: boolean
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{lead.nome_lead || 'Sem nome'}</p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{lead.whatsapp_lead || 'Sem WhatsApp'}</p>
        </div>
        <StatusPill status={lead.status} />
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
        {lead.ultima_mensagem || lead.resumo_conversa || 'Sem histórico'}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onOpenChat} className="rounded-xl bg-green-600 px-3 py-2 text-xs font-medium text-white">
          Chat
        </button>
        <button type="button" onClick={onEdit} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">
          Editar
        </button>
        <button type="button" onClick={onMove} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 dark:border-gray-700 dark:text-gray-200">
          Etapa
        </button>
        {isAdmin ? (
          <button type="button" onClick={onDelete} className="rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 dark:border-red-800 dark:text-red-400">
            Excluir
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}

function buildAttributes(lead: Lead) {
  const attrs = [
    lead.horario_comercial ? 'horario comercial' : null,
    lead.data_agendamento ? `retorno ${new Date(lead.data_agendamento).toLocaleDateString('pt-BR')}` : null,
    lead.evolution_instance ? `instância ${lead.evolution_instance}` : null,
  ].filter(Boolean)
  return attrs.length > 0 ? attrs.join(' · ') : 'Sem atributos'
}

function nextSuggestedStatus(status: StatusLead): StatusLead {
  const index = STATUS_ORDER.indexOf(status)
  return STATUS_ORDER[Math.min(index + 1, STATUS_ORDER.length - 1)] as StatusLead
}

function StatusPill({ status }: { status: StatusLead }) {
  const col = DEFAULT_COLUMNS.find(column => column.id === status)
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: col?.color ?? '#6B7280' }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function LeadEditorModal({
  mode,
  lead,
  form,
  setForm,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  mode: 'novo' | 'editar'
  lead?: Lead
  form: LeadFormState
  setForm: (next: LeadFormState) => void
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  saving: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{mode === 'novo' ? 'Novo contato' : 'Editar contato'}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{lead?.nome_lead || 'Preencha os dados principais'}</p>
          </div>
          <button type="button" onClick={onClose} title="Fechar" aria-label="Fechar" className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TextInput label="Nome" value={form.nome_lead} onChange={value => setForm({ ...form, nome_lead: value })} />
            <TextInput label="WhatsApp" value={form.whatsapp_lead} onChange={value => setForm({ ...form, whatsapp_lead: value })} />
            <TextInput label="Produto" value={form.motivo_contato} onChange={value => setForm({ ...form, motivo_contato: value })} />
            <SelectInput label="Etapa" value={form.status} onChange={value => setForm({ ...form, status: value as StatusLead })} options={DEFAULT_COLUMNS.map(column => ({ value: column.id, label: column.label }))} />
            <TextInput label="Última mensagem" value={form.ultima_mensagem} onChange={value => setForm({ ...form, ultima_mensagem: value })} className="md:col-span-2" />
            <TextInput label="Agendar retorno" type="datetime-local" value={form.data_agendamento} onChange={value => setForm({ ...form, data_agendamento: value })} />
            <TextInput label="Observações" value={form.anotacoes} onChange={value => setForm({ ...form, anotacoes: value })} className="md:col-span-2" />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onSave} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium flex items-center justify-center gap-2">
              <Save size={14} /> {saving ? 'Salvando...' : 'Salvar contato'}
            </button>
            {mode === 'editar' && onDelete && (
              <button type="button" onClick={onDelete} className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 flex items-center gap-2">
                <Trash2 size={14} /> Excluir
              </button>
            )}
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ColumnEditorModal({
  mode,
  column,
  onChange,
  onClose,
  onSave,
  onDelete,
  saving,
}: {
  mode: 'novo' | 'editar'
  column: ColumnConfig
  onChange: (next: ColumnConfig) => void
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  saving: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{mode === 'novo' ? 'Nova coluna' : 'Editar coluna'}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{column.status_key || 'Defina a chave da etapa'}</p>
          </div>
          <button type="button" onClick={onClose} title="Fechar" aria-label="Fechar" className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <TextInput label="Chave da etapa" value={column.status_key} onChange={value => onChange({ ...column, status_key: value })} />
          <TextInput label="Nome da coluna" value={column.label} onChange={value => onChange({ ...column, label: value })} />
          <TextInput label="Cor" value={column.color} onChange={value => onChange({ ...column, color: value })} />
          <TextInput label="Fundo" value={column.bg} onChange={value => onChange({ ...column, bg: value })} />
          <TextInput label="Borda" value={column.border} onChange={value => onChange({ ...column, border: value })} />
          <TextInput label="Ordem" type="number" value={String(column.ordem)} onChange={value => onChange({ ...column, ordem: Number(value) || 0 })} />
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={column.ativo} onChange={e => onChange({ ...column, ativo: e.target.checked })} />
            Ativa
          </label>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onSave} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium flex items-center justify-center gap-2">
              <Save size={14} /> {saving ? 'Salvando...' : 'Salvar coluna'}
            </button>
            {mode === 'editar' && onDelete && (
              <button type="button" onClick={onDelete} className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 flex items-center gap-2">
                <Trash2 size={14} /> Remover
              </button>
            )}
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
              Fechar
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            A coluna é persistida no banco e o status do lead agora é texto, então podemos criar, editar e remover etapas customizadas.
          </p>
        </div>
      </div>
    </div>
  )
}

function TextInput({ label, value, onChange, type = 'text', className }: { label: string; value: string; onChange: (value: string) => void; type?: string; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs text-gray-500">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </label>
  )
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

