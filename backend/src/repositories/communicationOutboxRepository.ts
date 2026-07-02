import type { AivenSqlClient } from '../db/aivenClient.js'

export interface OutboxRow {
  id: string
  channel: string
  provider: string
  to_address: string
  subject: string | null
  body: string
  status: string
  payload: Record<string, unknown>
  scheduled_for: string
  sent_at: string | null
  error: string | null
  created_at: string
  updated_at: string
}

export type CreateOutboxInput = {
  channel: string
  provider: string
  to_address: string
  subject?: string | null
  body: string
  payload?: Record<string, unknown>
  scheduled_for?: string
}

export class CommunicationOutboxRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async create(input: CreateOutboxInput): Promise<OutboxRow> {
    const payload = input.payload ?? {}
    const scheduledFor = input.scheduled_for ?? new Date().toISOString()
    const renovacaoId = typeof payload.renovacao_id === 'string' ? payload.renovacao_id : null
    const tipo = typeof payload.tipo === 'string' ? payload.tipo : null

    if (renovacaoId && tipo && tipo.startsWith('renovacao')) {
      const existing = await this.db.query<OutboxRow>(
        `SELECT *
           FROM communication_outbox
          WHERE channel = $1
            AND to_address = $2
            AND body = $3
            AND payload->>'renovacao_id' = $4
            AND payload->>'tipo' = $5
            AND status IN ('pending', 'sent')
            AND scheduled_for >= NOW() - INTERVAL '2 hours'
          ORDER BY created_at DESC
          LIMIT 1`,
        [input.channel, input.to_address, input.body, renovacaoId, tipo],
      )
      if (existing.rows[0]) return existing.rows[0]
    }

    const result = await this.db.query<OutboxRow>(
      `INSERT INTO communication_outbox
         (channel, provider, to_address, subject, body, payload, scheduled_for)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.channel,
        input.provider,
        input.to_address,
        input.subject ?? null,
        input.body,
        JSON.stringify(payload),
        scheduledFor,
      ],
    )
    return result.rows[0]
  }

  async cancelPendingByRenovacaoId(renovacaoId: string, tipo: string): Promise<number> {
    const result = await this.db.query<{ id: string }>(
      `DELETE FROM communication_outbox
       WHERE status = 'pending'
         AND payload->>'renovacao_id' = $1
         AND payload->>'tipo' = $2
         AND scheduled_for > NOW()
       RETURNING id`,
      [renovacaoId, tipo],
    )
    return result.rows.length
  }
}
