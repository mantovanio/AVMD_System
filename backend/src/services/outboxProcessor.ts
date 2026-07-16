import type { AivenSqlClient } from '../db/aivenClient.js'
import type { BackendConfig } from '../config/env.js'
import type { CommunicationOutboxRepository } from '../repositories/communicationOutboxRepository.js'
import { sendEvolutionMessage } from '../integrations/evolutionAdapter.js'

export type OutboxProcessorResult = {
  processed: number
  sent: number
  failed: number
}

function pickInstance(config: BackendConfig, payload: Record<string, unknown>) {
  const canal = String(payload.canal ?? 'atendimento').trim()
  return canal === 'renovacao' || canal === 'checkout'
    ? config.evolutionCertiid
    : config.evolutionAtendimento
}

function normalizePhoneBR(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return value
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

const MAX_FOLLOWUP_ROUNDS = 3

export class OutboxProcessor {
  private intervalId: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly outboxRepo: CommunicationOutboxRepository,
    private readonly config: BackendConfig,
    private readonly db?: AivenSqlClient,
  ) {}

  start(intervalMs = 5_000) {
    if (this.intervalId) return
    const tick = async () => {
      try {
        await this.processPending()
      } catch (error) {
        console.error('[OutboxProcessor] Erro no ciclo:', error)
      }
    }
    tick()
    this.intervalId = setInterval(tick, intervalMs)
    console.error(`[OutboxProcessor] Iniciado a cada ${intervalMs}ms`)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.error('[OutboxProcessor] Parado')
    }
  }

  async processPending(limit = 10): Promise<OutboxProcessorResult> {
    const items = await this.outboxRepo.listPending(limit)
    if (items.length === 0) return { processed: 0, sent: 0, failed: 0 }

    let sent = 0
    let failed = 0

    for (const item of items) {
      try {
        if (item.channel === 'whatsapp') {
          await this.sendWhatsApp(item)
        } else if (item.channel === 'email') {
          await this.sendEmail(item)
        } else {
          await this.outboxRepo.markProcessed({
            id: item.id,
            status: 'failed',
            error: `Canal desconhecido: ${item.channel}`,
          })
          failed++
          continue
        }
        sent++
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido'
        await this.outboxRepo.markProcessed({
          id: item.id,
          status: 'failed',
          error: message,
        })
        failed++
      }
    }

    return { processed: items.length, sent, failed }
  }

  private async sendWhatsApp(item: {
    id: string
    to_address: string
    body: string
    payload: Record<string, unknown>
  }) {
    const instance = pickInstance(this.config, item.payload)
    const result = await sendEvolutionMessage(instance, item.to_address, item.body)
    await this.outboxRepo.markProcessed({
      id: item.id,
      status: result.ok ? 'sent' : 'failed',
      error: result.error ?? null,
      externalId: result.external_id ?? null,
    })

    if (result.ok) {
      await this.logOutgoingMessage(item, result.external_id ?? null)
      await this.scheduleNextFollowUpIfNeeded(item)
    }
  }

  private async logOutgoingMessage(item: { to_address: string; body: string; payload: Record<string, unknown> }, externalId: string | null) {
    if (!this.db) return
    try {
      const phoneDigits = normalizePhoneBR(item.to_address)
      const canal = String(item.payload.canal ?? 'atendimento').trim()
      const tipo = String(item.payload.tipo ?? '').trim()
      const senderName = tipo.includes('renovacao') ? 'Clara (IA)' : 'Sistema'

      const convResult = await this.db.query<{ id: string }>(
        `SELECT id FROM crm_chat_conversations WHERE document_key = $1 LIMIT 1`,
        [phoneDigits],
      )
      let convId = convResult.rows[0]?.id ?? null

      if (!convId) {
        const insertConv = await this.db.query<{ id: string }>(
          `INSERT INTO crm_chat_conversations (document_key, telefone, whatsapp_instance, fila, ultima_mensagem, ultima_mensagem_direcao, ultima_interacao_em, kanban_status)
           VALUES ($1, $1, $2, $3, $4, 'outgoing', NOW(), 'conversando')
           RETURNING id`,
          [phoneDigits, canal === 'renovacao' ? 'CertiID' : 'atendimento', canal, item.body],
        )
        convId = insertConv.rows[0]?.id ?? null
      }

      if (!convId) return

      await this.db.query(
        `INSERT INTO crm_chat_messages (conversation_id, document_key, external_message_id, direction, sender_type, sender_name, mensagem)
         VALUES ($1, $2, $3, 'outgoing', 'automation', $4, $5)`,
        [convId, phoneDigits, externalId, senderName, item.body],
      )

      await this.db.query(
        `UPDATE crm_chat_conversations SET ultima_mensagem = $1, ultima_mensagem_direcao = 'outgoing', ultima_interacao_em = NOW() WHERE id = $2`,
        [item.body, convId],
      )
    } catch (err) {
      console.error('[OutboxProcessor] Erro ao registrar mensagem no CRM chat:', err)
    }
  }

  private async scheduleNextFollowUpIfNeeded(item: { to_address: string; payload: Record<string, unknown> }) {
    const tipo = typeof item.payload.tipo === 'string' ? item.payload.tipo : ''
    if (tipo !== 'renovacao_followup_auto') return
    const currentRound = typeof item.payload.followup_round === 'number' ? item.payload.followup_round : 1
    if (currentRound >= MAX_FOLLOWUP_ROUNDS) return
    const renovacaoId = typeof item.payload.renovacao_id === 'string' ? item.payload.renovacao_id : null
    if (!renovacaoId) return
    const nextRound = currentRound + 1
    const delayMs = nextRound * 24 * 3600 * 1000
    try {
      await this.outboxRepo.create({
        channel: 'whatsapp',
        provider: String(item.payload.provider ?? 'evolution'),
        to_address: item.to_address,
        body: 'Olá! Ainda aguardamos sua resposta sobre a renovação do seu certificado. Podemos ajudar?',
        payload: {
          renovacao_id: renovacaoId,
          canal: 'renovacao',
          tipo: 'renovacao_followup_auto',
          followup_round: nextRound,
          instance_name: item.payload.instance_name ?? null,
          integration_id: item.payload.integration_id ?? null,
          whatsapp_engine: item.payload.whatsapp_engine ?? null,
        },
        scheduled_for: new Date(Date.now() + delayMs).toISOString(),
      })
    } catch (err) {
      console.error('[OutboxProcessor] Erro ao agendar proximo follow-up:', err)
    }
  }

  private async sendEmail(item: {
    id: string
    to_address: string
    subject: string | null
    body: string
    payload: Record<string, unknown>
  }) {
    const url = this.config.n8nEmailSendUrl
    if (!url) {
      await this.outboxRepo.markProcessed({
        id: item.id,
        status: 'failed',
        error: 'n8nEmailSendUrl nao configurada',
      })
      return
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: item.to_address,
        subject: item.subject ?? 'Sem assunto',
        body: item.body,
        payload: item.payload,
      }),
    })

    const ok = response.ok
    await this.outboxRepo.markProcessed({
      id: item.id,
      status: ok ? 'sent' : 'failed',
      error: ok ? null : `Email n8n retornou HTTP ${response.status}`,
    })
  }
}
