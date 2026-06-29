import type { AgendaSlot } from '@/lib/checkout'

export function buildSlotKey(slot: AgendaSlot | null | undefined) {
  if (!slot) return ''
  return `${slot.agente_registro_id}|${slot.ponto_atendimento_id}|${slot.inicio}`
}

export { formatDayLabel, formatDateTime, formatTimeRange } from './formatUtils'
