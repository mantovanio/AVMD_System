import { useState, useEffect } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import { useDraggable } from '@dnd-kit/core'
import { MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { loadActiveWhatsAppIntegration } from '@/lib/whatsappIntegration'
import ChatPanel, { type EvolutionCfg } from '@/components/ChatPanel'
import type { Lead, StatusLead } from '@/types'

interface Column {
  id: StatusLead
  label: string
  color: string
  bg: string
  border: string
}

const COLUMNS: Column[] = [
  { id: 'iniciou_conversa',    label: 'Iniciou Conversa',    color: '#F59E0B', bg: 'bg-yellow-50 dark:bg-yellow-900/10', border: 'border-yellow-200 dark:border-yellow-800' },
  { id: 'conversando',         label: 'Conversando',         color: '#3B82F6', bg: 'bg-blue-50 dark:bg-blue-900/10',   border: 'border-blue-200 dark:border-blue-800' },
  { id: 'agendado',            label: 'Agendado',            color: '#10B981', bg: 'bg-green-50 dark:bg-green-900/10', border: 'border-green-200 dark:border-green-800' },
  { id: 'cliente',             label: 'Cliente',             color: '#8B5CF6', bg: 'bg-purple-50 dark:bg-purple-900/10', border: 'border-purple-200 dark:border-purple-800' },
  { id: 'follow_up',           label: 'Follow Up',           color: '#F97316', bg: 'bg-orange-50 dark:bg-orange-900/10', border: 'border-orange-200 dark:border-orange-800' },
  { id: 'cancelou_agendamento',label: 'Cancelou Agendamento',color: '#EF4444', bg: 'bg-red-50 dark:bg-red-900/10',   border: 'border-red-200 dark:border-red-800' },
  { id: 'perdido',             label: 'Perdido',             color: '#6B7280', bg: 'bg-gray-50 dark:bg-gray-800/30',  border: 'border-gray-200 dark:border-gray-700' },
]

export default function CRM() {
  const [leads, setLeads]         = useState<Lead[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [activeId, setActiveId]   = useState<string | null>(null)
  const [evolution, setEvolution] = useState<EvolutionCfg | null>(null)
  const [chatLead, setChatLead]   = useState<Lead | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  useEffect(() => {
    void fetchLeads()
    void loadEvolution()

    const channel = supabase
      .channel('leads-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads_contabilidade' }, payload => {
        if (payload.eventType === 'UPDATE') {
          setLeads(prev => prev.map(l => l.id === (payload.new as Lead).id ? payload.new as Lead : l))
        } else if (payload.eventType === 'INSERT') {
          setLeads(prev => [payload.new as Lead, ...prev])
        } else if (payload.eventType === 'DELETE') {
          setLeads(prev => prev.filter(l => l.id !== (payload.old as Lead).id))
        }
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [])

  async function loadEvolution() {
    try {
      const data = await loadActiveWhatsAppIntegration()
      if (!data) { logger.warn('CRM', 'nenhuma integração WhatsApp ativa encontrada'); return }
      if (!data.supportsEmbeddedChat) { logger.warn('CRM', 'integração WhatsApp ativa não suporta chat embutido', data.engine); return }
      if (data.base_url && data.api_token && data.instance_name) {
        setEvolution({
          base_url: data.base_url,
          api_token: data.api_token,
          instance_name: data.instance_name,
        })
      }
    } catch (error) {
      logger.error('CRM', 'erro ao buscar integração WhatsApp', String(error))
      return
    }
  }

  async function fetchLeads() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('leads_contabilidade')
      .select('id, nome_lead, whatsapp_lead, motivo_contato, status, created_at, horario_comercial, evolution_remote_jid, evolution_instance')
      .order('created_at', { ascending: false })

    if (err) { setError(err.message); setLoading(false); return }
    setLeads(data as Lead[])
    setLoading(false)
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return
    const newStatus = over.id as StatusLead
    const lead = leads.find(l => l.id === active.id)
    if (!lead || lead.status === newStatus) return

    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, status: newStatus } : l))
    await supabase.from('leads_contabilidade').update({ status: newStatus }).eq('id', lead.id)
  }

  const activeLead = leads.find(l => l.id === activeId)

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-gray-400 animate-pulse p-12">Carregando leads...</div>
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg p-4 text-sm">
          Erro ao carregar: {error}
        </div>
      </div>
    )
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="h-full overflow-x-auto p-6">
          <div className="flex gap-4 h-full" style={{ minWidth: `${COLUMNS.length * 296}px` }}>
            {COLUMNS.map(col => {
              const colLeads = leads.filter(l => l.status === col.id)
              return (
                <KanbanColumn
                  key={col.id}
                  column={col}
                  leads={colLeads}
                  evolution={evolution}
                  onOpenChat={lead => setChatLead(lead)}
                />
              )
            })}
          </div>
        </div>
        <DragOverlay>
          {activeLead
            ? <LeadCard lead={activeLead} color="#3b82f6" isDragging evolution={null} onOpenChat={() => {}} />
            : null
          }
        </DragOverlay>
      </DndContext>

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
    </>
  )
}

function KanbanColumn({
  column, leads, evolution, onOpenChat,
}: {
  column: Column
  leads: Lead[]
  evolution: EvolutionCfg | null
  onOpenChat: (lead: Lead) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-2xl border ${column.border} ${column.bg} transition-colors ${isOver ? 'ring-2 ring-blue-400' : ''}`}
      style={{ minWidth: 280, width: 280 }}
    >
      <div
        className="rounded-t-2xl px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: column.color }}
      >
        <span className="text-white font-semibold text-sm">{column.label}</span>
        <span className="bg-white/25 text-white text-xs font-bold px-2 py-0.5 rounded-full">
          {leads.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {leads.map(lead => (
          <DraggableCard
            key={lead.id}
            lead={lead}
            color={column.color}
            evolution={evolution}
            onOpenChat={onOpenChat}
          />
        ))}
        {leads.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">Nenhum lead</p>
        )}
      </div>
    </div>
  )
}

function DraggableCard({
  lead, color, evolution, onOpenChat,
}: {
  lead: Lead
  color: string
  evolution: EvolutionCfg | null
  onOpenChat: (lead: Lead) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={{ opacity: isDragging ? 0.4 : 1 }}>
      <LeadCard lead={lead} color={color} evolution={evolution} onOpenChat={onOpenChat} />
    </div>
  )
}

function LeadCard({
  lead, color, isDragging, evolution, onOpenChat,
}: {
  lead: Lead
  color: string
  isDragging?: boolean
  evolution: EvolutionCfg | null
  onOpenChat: (lead: Lead) => void
}) {
  const canChat = !!evolution && !!lead.whatsapp_lead

  return (
    <div
      className={`bg-white dark:bg-[#1E2535] rounded-xl p-3 shadow-sm border border-gray-100 dark:border-gray-700 cursor-grab hover:-translate-y-0.5 transition-transform ${isDragging ? 'shadow-lg cursor-grabbing' : ''}`}
      style={{ borderLeftWidth: 4, borderLeftColor: color }}
    >
      {/* Nome + ações */}
      <div className="flex items-start justify-between gap-1">
        <p className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate flex-1">
          {lead.nome_lead || 'Sem nome'}
        </p>
        <div className="flex items-center gap-1 shrink-0">
          {canChat && (
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); onOpenChat(lead) }}
              title="Abrir conversa"
              className="text-gray-400 hover:text-green-500 transition-colors"
            >
              <MessageCircle size={13} />
            </button>
          )}
        </div>
      </div>

      {lead.whatsapp_lead && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{lead.whatsapp_lead}</p>
      )}
      {lead.motivo_contato && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-2">{lead.motivo_contato}</p>
      )}
    </div>
  )
}
