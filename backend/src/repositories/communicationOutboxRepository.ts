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
        JSON.stringify(input.payload ?? {}),
        input.scheduled_for ?? new Date().toISOString(),
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
