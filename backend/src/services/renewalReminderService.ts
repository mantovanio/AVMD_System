import type { AivenSqlClient } from '../db/aivenClient.js'
import type { CommunicationOutboxRepository } from '../repositories/communicationOutboxRepository.js'

const DEFAULT_REMINDER_BODY = 'Olá {{primeiro_nome}}! Seu certificado {{tipo_certificado}} vence em {{dias_restantes}} dias ({{data_vencimento}}). Podemos ajudar com a renovação?'
const DEFAULT_REMINDER_SUBJECT = 'Renovação do seu certificado {{tipo_certificado}}'

function extrairPrimeiroNome(nome: string | null | undefined): string {
  if (!nome) return 'Cliente'
  const partes = nome.trim().split(/\s+/)
  return partes[0] || 'Cliente'
}

function formatarDataBR(data: Date): string {
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function renderTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => String(values[key] ?? ''))
}

type RenewalRow = {
  id: string
  cliente: string
  email: string | null
  telefone: string | null
  tipo_certificado: string
  data_vencimento: string
  valor: number | null
  ultimo_lembrete: string | null
}

export class RenewalReminderService {
  private intervalId: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly db: AivenSqlClient,
    private readonly outboxRepo: CommunicationOutboxRepository,
  ) {}

  start(intervalMs = 3_600_000) {
    if (this.intervalId) return
    const tick = async () => {
      try {
        await this.processReminders()
      } catch (error) {
        console.error('[RenewalReminder] Erro no ciclo:', error)
      }
    }
    tick()
    this.intervalId = setInterval(tick, intervalMs)
    console.error(`[RenewalReminder] Iniciado a cada ${intervalMs / 60_000} minutos`)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.error('[RenewalReminder] Parado')
    }
  }

  async processReminders(): Promise<{ queued: number; skipped: number }> {
    const rows = await this.db.query<RenewalRow>(
      `SELECT id, cliente, email, telefone, tipo_certificado, data_vencimento, valor, ultimo_lembrete
       FROM renovacoes
       WHERE deleted_at IS NULL
         AND renovado = false
         AND status IN ('pendente', 'contatado')
         AND data_vencimento <= CURRENT_DATE + INTERVAL '30 days'
         AND data_vencimento >= CURRENT_DATE - INTERVAL '10 days'
         AND (ultimo_lembrete IS NULL OR ultimo_lembrete < NOW() - INTERVAL '20 hours')
       ORDER BY data_vencimento ASC
       LIMIT 50`,
    )

    if (rows.rows.length === 0) return { queued: 0, skipped: 0 }

    let queued = 0
    let skipped = 0

    for (const row of rows.rows) {
      const phone = row.telefone?.replace(/\D/g, '') ?? ''
      const email = row.email?.trim() ?? ''

      if (!phone && !email) {
        skipped++
        continue
      }

      const hoje = new Date()
      const rawDate: unknown = row.data_vencimento
      const dateStr = rawDate && typeof rawDate === 'object' && rawDate instanceof Date
        ? rawDate.toISOString().slice(0, 10)
        : String(rawDate ?? '').slice(0, 10)
      const vencimento = new Date(`${dateStr}T12:00:00-03:00`)
      const diasRestantes = Number.isNaN(vencimento.getTime()) ? 0 : Math.max(0, Math.ceil((vencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)))

      const primeiroNome = extrairPrimeiroNome(row.cliente)
      const tplValues: Record<string, string | number> = {
        primeiro_nome: primeiroNome,
        cliente: row.cliente,
        tipo_certificado: row.tipo_certificado,
        dias_restantes: diasRestantes,
        data_vencimento: formatarDataBR(vencimento),
        valor: row.valor ? `R$ ${Number(row.valor).toFixed(2).replace('.', ',')}` : '',
      }

      const whatsappBody = renderTemplate(DEFAULT_REMINDER_BODY, tplValues)
      const emailSubject = renderTemplate(DEFAULT_REMINDER_SUBJECT, tplValues)
      const emailBody = renderTemplate(DEFAULT_REMINDER_BODY, tplValues)

      if (phone) {
        await this.outboxRepo.create({
          channel: 'whatsapp',
          provider: 'evolution',
          to_address: phone,
          body: whatsappBody,
          payload: {
            renovacao_id: row.id,
            canal: 'renovacao',
            tipo: 'renovacao_followup_auto',
            followup_round: 1,
          },
        })
      }

      if (email) {
        await this.outboxRepo.create({
          channel: 'email',
          provider: 'email_smtp',
          to_address: email,
          subject: emailSubject,
          body: emailBody,
          payload: {
            renovacao_id: row.id,
            canal: 'renovacao',
            tipo: 'renovacao_followup_auto',
            followup_round: 1,
          },
        })
      }

      await this.db.query(
        `UPDATE renovacoes SET ultimo_lembrete = NOW(), status = 'contatado',
         enviou_whatsapp = enviou_whatsapp OR $2, enviou_email = enviou_email OR $3,
         updated_at = NOW() WHERE id = $1`,
        [row.id, !!phone, !!email],
      )

      queued++
    }

    if (queued > 0) {
      console.error(`[RenewalReminder] ${queued} lembretes enfileirados, ${skipped} ignorados (sem contato)`)
    }

    return { queued, skipped }
  }
}
