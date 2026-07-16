import { useState, useMemo, useEffect } from 'react'
import { CheckCircle2, X, Phone, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SelectField } from './SelectField'
import { FlowModal } from './FlowModal'
import { formatDayLabel, formatDateTime, formatTimeRange, buildSlotKey } from './SchedulingUtils'
import type { AgendaAgent, AgendaPoint, AgendaSlot } from '@/lib/checkout'

export interface SchedulingModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (slotKey: string) => void
  onSkip: () => void
  agentOptions: Array<{ id: string; nome: string }>
  pointOptionsForAgent: (agentId: string) => AgendaPoint[]
  slots: AgendaSlot[]
  initialSlotKey?: string
  initialAgentId?: string
  initialPointId?: string
}

export function SchedulingModal({
  open,
  onClose,
  onConfirm,
  onSkip,
  agentOptions,
  pointOptionsForAgent,
  slots,
  initialSlotKey = '',
  initialAgentId = '',
  initialPointId = '',
}: SchedulingModalProps) {
  const [draftAgentId, setDraftAgentId] = useState(initialAgentId)
  const [draftPointId, setDraftPointId] = useState(initialPointId)
  const [draftSlotKey, setDraftSlotKey] = useState(initialSlotKey)
  const [draftDay, setDraftDay] = useState('')

  useEffect(() => {
    if (!open) return
    setDraftAgentId(initialAgentId)
    setDraftPointId(initialPointId)
    setDraftSlotKey(initialSlotKey)
    setDraftDay('')
  }, [open, initialAgentId, initialPointId, initialSlotKey])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [open])

  const currentPoints = useMemo(
    () => draftAgentId ? pointOptionsForAgent(draftAgentId) : [],
    [pointOptionsForAgent, draftAgentId]
  )

  const filteredSlots = useMemo(() => {
    if (!draftAgentId || !draftPointId) return []
    return slots.filter(slot =>
      slot.agente_registro_id === draftAgentId
      && slot.ponto_atendimento_id === draftPointId
    )
  }, [draftAgentId, draftPointId, slots])

  const slotsByDay = useMemo(() => {
    const grouped = new Map<string, AgendaSlot[]>()
    for (const slot of filteredSlots) {
      const day = slot.inicio.slice(0, 10)
      const list = grouped.get(day) ?? []
      list.push(slot)
      grouped.set(day, list)
    }
    return Array.from(grouped.entries()).map(([day, daySlots]) => ({
      day,
      slots: daySlots.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()),
    }))
  }, [filteredSlots])

  useEffect(() => {
    if (slotsByDay.length === 0) { setDraftDay(''); return }
    const firstDay = slotsByDay[0]?.day ?? ''
    if (!draftDay || !slotsByDay.some(item => item.day === draftDay)) {
      setDraftDay(firstDay)
    }
  }, [draftDay, slotsByDay])

  const draftSlots = useMemo(
    () => slotsByDay.find(item => item.day === draftDay)?.slots ?? [],
    [draftDay, slotsByDay]
  )

  const draftSelectedSlot = useMemo(
    () => slots.find(slot => buildSlotKey(slot) === draftSlotKey) ?? null,
    [draftSlotKey, slots]
  )

  if (!open) return null

  return (
    <FlowModal
      open
      title="Agendamento da validação"
      subtitle="Escolha seu horário de atendimento. Você pode seguir sem agendar agora."
      onClose={onClose}
      contentClassName="sm:max-w-5xl max-h-[92vh] rounded-t-[28px] sm:rounded-[30px]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/80 p-5 space-y-4">
          <div className="rounded-[22px] border border-[#fde4cf] bg-[#fffaf4] p-4 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Sobre a validação</p>
            <p className="mt-2 leading-relaxed">
              Após a compensação do pagamento, nossa equipe realiza a validação dos seus documentos neste horário.
            </p>
          </div>

            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Passo 1 — Atendente</p>
              <SelectField
                label="Quem vai atender"
                value={draftAgentId}
                onChange={value => {
                  setDraftAgentId(value)
                  setDraftPointId('')
                  setDraftSlotKey('')
                }}
                options={[
                  { value: '', label: 'Selecione o atendente' },
                  ...agentOptions.map(agent => ({ value: agent.id, label: agent.nome })),
                ]}
              />
            </div>

            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Passo 2 — Local</p>
              <SelectField
                label="Onde será a validação"
                value={draftPointId}
                onChange={value => {
                  setDraftPointId(value)
                  setDraftSlotKey('')
                }}
                options={[
                  { value: '', label: draftAgentId ? 'Selecione o local' : 'Escolha primeiro o atendente' },
                  ...currentPoints.map(point => ({ value: point.id, label: point.nome })),
                ]}
                disabled={!draftAgentId}
              />
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Passo 3 — Data</p>
              <div className="mt-3 flex lg:flex-col gap-2 overflow-auto pb-1">
                {slotsByDay.map(({ day }) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setDraftDay(day)}
                    className={cn(
                      'rounded-2xl px-4 py-3 text-sm font-semibold text-left whitespace-nowrap',
                      draftDay === day
                        ? 'bg-[#17346b] text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                    )}
                  >
                    {formatDayLabel(day)}
                  </button>
                ))}
                {slotsByDay.length === 0 && (
                  <div className="rounded-2xl bg-white border border-slate-200 px-4 py-3 text-sm text-slate-500">
                    {draftAgentId && draftPointId
                      ? 'Sem horários liberados para esta combinação.'
                      : 'Escolha atendente e local para liberar os horários.'}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-5 sm:p-6 overflow-auto max-h-[68vh]">
            {!draftAgentId || !draftPointId ? (
              <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-600">
                Escolha primeiro o atendente e o local para liberar os dias e horários disponíveis.
              </div>
            ) : slotsByDay.length === 0 ? (
              <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-900">
                Nenhum horário está disponível para esta combinação agora. Você ainda pode concluir a compra e deixar o agendamento para depois.
              </div>
            ) : (
              <>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Horários de {draftDay ? formatDayLabel(draftDay) : 'seleção atual'}</p>
                    <p className="text-sm text-slate-500 mt-1">Agora basta escolher o melhor dia e horário. Se preferir, você também pode sair sem reservar agora.</p>
                  </div>
                  {draftSelectedSlot && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                      {formatDateTime(draftSelectedSlot.inicio)}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {draftSlots.map(slot => {
                    const active = draftSlotKey === buildSlotKey(slot)
                    return (
                      <button
                        key={buildSlotKey(slot)}
                        type="button"
                        onClick={() => setDraftSlotKey(buildSlotKey(slot))}
                        className={cn(
                          'rounded-[24px] border px-4 py-4 text-left transition-all',
                          active
                            ? 'border-[#ea7b18] bg-[#fff8f1] ring-2 ring-[#fde4cf]'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-slate-900">{formatTimeRange(slot.inicio, slot.fim)}</p>
                            <p className="text-xs text-slate-500 mt-2">
                              {slot.tipo_atendimento === 'videoconferencia' ? 'Validação por vídeo' : (slot.tipo_atendimento ?? 'Atendimento')}
                            </p>
                          </div>
                          {active && <CheckCircle2 size={18} className="text-[#ea7b18] shrink-0" />}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                            {slot.vagas_restantes} vaga(s)
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
      </div>
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex items-center justify-center rounded-2xl px-4 py-3 border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Seguir sem agendar
        </button>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-2xl px-4 py-3 border border-slate-300 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(draftSlotKey)}
            disabled={!draftSlotKey}
            className={cn(
              'inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition-colors',
              draftSlotKey
                ? 'bg-[#17346b] text-white hover:bg-[#102654]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            )}
          >
            {draftSlotKey ? 'Reservar horário' : 'Selecione um horário'}
          </button>
        </div>
      </div>
    </FlowModal>
  )
}
