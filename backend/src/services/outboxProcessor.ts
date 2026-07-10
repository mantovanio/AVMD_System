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
  return canal === 'renovacao'
    ? config.evolutionCertiid
    : config.evolutionAtendimento
}

export class OutboxProcessor {
  private intervalId: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly outboxRepo: CommunicationOutboxRepository,
    private readonly config: BackendConfig,
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
