export type AgendaEligibilityLink = {
  tabela_preco_id: string
  agente_registro_id: string
  ponto_atendimento_id: string | null
  ativo: boolean
}

export type AgendaPartnerRestriction = {
  parceiro_id: string
  agente_registro_id: string
  ponto_atendimento_id: string | null
  ativo: boolean
}

export type AgendaAvailability = {
  agente_registro_id: string
  ponto_atendimento_id: string
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  intervalo_minutos: number
  capacidade_por_slot: number
  tipo_atendimento: string | null
  ativo: boolean
}

export type AgendaUnavailability = {
  agente_registro_id: string
  ponto_atendimento_id: string | null
  inicio_em: string
  fim_em: string
  ativo: boolean
}

export type AgendaBooking = {
  agente_registro_id: string | null
  ponto_atendimento_id: string | null
  data_hora: string
  status: 'pendente' | 'confirmado' | 'realizado' | 'cancelado'
}

export type AgendaGeneratedSlot = {
  agente_registro_id: string
  ponto_atendimento_id: string
  inicio: string
  fim: string
  capacidade_total: number
  vagas_restantes: number
  tipo_atendimento: string | null
}

type ResolveEligibilityArgs = {
  tabelaPrecoId: string
  vinculados: AgendaEligibilityLink[]
  parceiroId?: string | null
  parceirosAgentesPermitidos?: AgendaPartnerRestriction[]
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
}

function combineDateAndTime(baseDate: Date, hhmm: string) {
  const [hour, minute] = hhmm.split(':').map(Number)
  const next = new Date(baseDate)
  next.setHours(hour ?? 0, minute ?? 0, 0, 0)
  return next
}

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && startB < endA
}

export function resolveEligibleAgentsByTable({
  tabelaPrecoId,
  vinculados,
  parceiroId,
  parceirosAgentesPermitidos = [],
}: ResolveEligibilityArgs) {
  const elegiveisTabela = vinculados.filter(item => item.tabela_preco_id === tabelaPrecoId && item.ativo)
  if (!parceiroId) return elegiveisTabela

  const restricoesParceiro = parceirosAgentesPermitidos.filter(item => item.parceiro_id === parceiroId && item.ativo)
  if (restricoesParceiro.length === 0) return elegiveisTabela

  const combinacoes = new Map<string, AgendaEligibilityLink>()

  for (const vinculoTabela of elegiveisTabela) {
    const restricoesDoAgente = restricoesParceiro.filter(item => item.agente_registro_id === vinculoTabela.agente_registro_id)
    if (restricoesDoAgente.length === 0) continue

    for (const restricao of restricoesDoAgente) {
      const pontoTabela = vinculoTabela.ponto_atendimento_id
      const pontoParceiro = restricao.ponto_atendimento_id

      let pontoFinal: string | null = null
      if (pontoTabela && pontoParceiro && pontoTabela !== pontoParceiro) continue
      if (pontoTabela && pontoParceiro) pontoFinal = pontoTabela
      else if (pontoTabela) pontoFinal = pontoTabela
      else if (pontoParceiro) pontoFinal = pontoParceiro

      const key = `${vinculoTabela.agente_registro_id}:${pontoFinal ?? '*'}`
      combinacoes.set(key, {
        ...vinculoTabela,
        ponto_atendimento_id: pontoFinal,
      })
    }
  }

  return Array.from(combinacoes.values())
}

export function generateAgendaSlots({
  tabelaPrecoId,
  vinculados,
  parceiroId,
  parceirosAgentesPermitidos = [],
  disponibilidades,
  indisponibilidades,
  bookings,
  rangeDays = 14,
  limit = 20,
}: {
  tabelaPrecoId: string
  vinculados: AgendaEligibilityLink[]
  parceiroId?: string | null
  parceirosAgentesPermitidos?: AgendaPartnerRestriction[]
  disponibilidades: AgendaAvailability[]
  indisponibilidades: AgendaUnavailability[]
  bookings: AgendaBooking[]
  rangeDays?: number
  limit?: number
}) {
  const elegiveis = resolveEligibleAgentsByTable({
    tabelaPrecoId,
    vinculados,
    parceiroId,
    parceirosAgentesPermitidos,
  })

  const elegiveisSet = new Set(elegiveis.map(item => item.agente_registro_id))
  const pontosPermitidos = new Map<string, Set<string | null>>()

  for (const item of elegiveis) {
    const current = pontosPermitidos.get(item.agente_registro_id) ?? new Set<string | null>()
    current.add(item.ponto_atendimento_id)
    pontosPermitidos.set(item.agente_registro_id, current)
  }

  const now = new Date()
  now.setSeconds(0, 0)
  const slots: AgendaGeneratedSlot[] = []

  for (let offset = 0; offset < rangeDays; offset++) {
    const day = new Date(now)
    day.setDate(now.getDate() + offset)
    const weekday = day.getDay()

    for (const disp of disponibilidades) {
      if (!disp.ativo) continue
      if (!elegiveisSet.has(disp.agente_registro_id)) continue
      if (disp.dia_semana !== weekday) continue

      const pontosDoAgente = pontosPermitidos.get(disp.agente_registro_id)
      if (!pontosDoAgente || (!pontosDoAgente.has(null) && !pontosDoAgente.has(disp.ponto_atendimento_id))) continue

      let cursor = combineDateAndTime(day, disp.hora_inicio)
      const endWindow = combineDateAndTime(day, disp.hora_fim)

      while (cursor < endWindow) {
        const slotEnd = new Date(cursor.getTime() + disp.intervalo_minutos * 60_000)
        if (slotEnd > endWindow) break
        if (cursor <= now) {
          cursor = slotEnd
          continue
        }

        const blocked = indisponibilidades.some(item => {
          if (!item.ativo) return false
          if (item.agente_registro_id !== disp.agente_registro_id) return false
          if (item.ponto_atendimento_id && item.ponto_atendimento_id !== disp.ponto_atendimento_id) return false
          return overlaps(cursor, slotEnd, new Date(item.inicio_em), new Date(item.fim_em))
        })

        if (!blocked) {
          const ocupados = bookings.filter(item => {
            if (!item.agente_registro_id || !item.ponto_atendimento_id) return false
            if (item.status === 'cancelado') return false
            if (item.agente_registro_id !== disp.agente_registro_id) return false
            if (item.ponto_atendimento_id !== disp.ponto_atendimento_id) return false
            const bookedAt = new Date(item.data_hora)
            return sameDay(bookedAt, cursor)
              && bookedAt.getHours() === cursor.getHours()
              && bookedAt.getMinutes() === cursor.getMinutes()
          }).length

          const vagasRestantes = Math.max(0, disp.capacidade_por_slot - ocupados)
          if (vagasRestantes > 0) {
            slots.push({
              agente_registro_id: disp.agente_registro_id,
              ponto_atendimento_id: disp.ponto_atendimento_id,
              inicio: cursor.toISOString(),
              fim: slotEnd.toISOString(),
              capacidade_total: disp.capacidade_por_slot,
              vagas_restantes: vagasRestantes,
              tipo_atendimento: disp.tipo_atendimento,
            })
          }
        }

        cursor = slotEnd
      }
    }
  }

  return slots
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime())
    .slice(0, limit)
}
