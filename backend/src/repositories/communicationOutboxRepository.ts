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
    const tipo = typeof payload.tipo === 'string' ? payload.tipo : null
    const saleId = typeof payload.sale_id === 'string' ? payload.sale_id : null
    const renovacaoId = typeof payload.renovacao_id === 'string' ? payload.renovacao_id : null
    const followupRound = typeof payload.followup_round === 'number' ? payload.followup_round : null

    if (renovacaoId && tipo && tipo.startsWith('renovacao')) {
      const isFollowup = tipo === 'renovacao_followup_auto' && followupRound !== null
      const existing = await this.db.query<OutboxRow>(
        `SELECT *
           FROM communication_outbox
          WHERE channel = $1
            AND to_address = $2
            AND body = $3
            AND payload->>'renovacao_id' = $4
            AND payload->>'tipo' = $5
            ${isFollowup ? 'AND (payload->>\'followup_round\')::int = $6' : ''}
            AND status IN ('pending', 'sent')
            AND scheduled_for >= NOW() - INTERVAL '2 hours'
          ORDER BY created_at DESC
          LIMIT 1`,
        isFollowup
          ? [input.channel, input.to_address, input.body, renovacaoId, tipo, followupRound]
          : [input.channel, input.to_address, input.body, renovacaoId, tipo],
      )
      if (existing.rows[0]) return existing.rows[0]
    }

    if (saleId && tipo === 'checkout_payment_link') {
      const existing = await this.db.query<OutboxRow>(
        `SELECT *
           FROM communication_outbox
          WHERE channel = $1
            AND to_address = $2
            AND payload->>'sale_id' = $3
            AND payload->>'tipo' = $4
            AND status IN ('pending', 'sent')
            AND scheduled_for >= NOW() - INTERVAL '6 hours'
          ORDER BY created_at DESC
          LIMIT 1`,
        [input.channel, input.to_address, saleId, tipo],
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

  async listPending(limit = 10): Promise<OutboxRow[]> {
    const result = await this.db.query<OutboxRow>(
      `UPDATE communication_outbox
          SET status = 'processing',
              updated_at = NOW()
        WHERE id IN (
          SELECT id
            FROM communication_outbox
           WHERE status = 'pending'
             AND scheduled_for <= NOW()
           ORDER BY scheduled_for ASC
           LIMIT $1
             FOR UPDATE SKIP LOCKED
        )
        RETURNING *`,
      [limit],
    )
    return result.rows
  }

  async markProcessed(input: { id: string; status: string; error?: string | null; externalId?: string | null }): Promise<void> {
    await this.db.query(
      `UPDATE communication_outbox
          SET status = $2,
              sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
              error = $3,
              external_id = coalesce($4, external_id),
              updated_at = NOW()
        WHERE id = $1`,
      [input.id, input.status, input.error ?? null, input.externalId ?? null],
    )
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

  async cancelPendingFollowUpsByPhone(phoneDigits: string): Promise<number> {
    const result = await this.db.query<{ id: string }>(
      `DELETE FROM communication_outbox
       WHERE status = 'pending'
         AND payload->>'tipo' = 'renovacao_followup_auto'
         AND to_address LIKE '%' || $1 || '%'
         AND scheduled_for > NOW()
       RETURNING id`,
      [phoneDigits],
    )
    return result.rows.length
  }
}
