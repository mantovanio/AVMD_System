import type { AivenSqlClient } from '../db/aivenClient.js'
import type { IntegrationEventEnvelope, IntegrationEventStatus } from '../integrations/contracts.js'

export type IntegrationEventRecord = IntegrationEventEnvelope & {
  id: string
  status: IntegrationEventStatus
  external_id?: string | null
  error_message?: string | null
}

export class IntegrationEventRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async create(event: IntegrationEventEnvelope) {
    const result = await this.db.query<{ id: string }>(`
      insert into integration_events (
        domain, provider, direction, event_type, status,
        entity_type, entity_id, correlation_id, payload, metadata, received_at
      ) values (
        $1, $2, $3, $4, coalesce($5::text, 'queued'),
        $6, $7, $8, $9::jsonb, $10::jsonb,
        case when $3 = 'inbound' then now() else null end
      )
      returning id
    `, [
      event.domain,
      event.provider,
      event.direction,
      event.event_type,
      event.status ?? 'queued',
      event.entity_type ?? null,
      event.entity_id ?? null,
      event.correlation_id ?? null,
      JSON.stringify(event.payload ?? {}),
      JSON.stringify(event.metadata ?? {}),
    ])
    return result.rows[0] ?? null
  }

  async listQueued(limit = 10) {
    const safeLimit = Math.min(Math.max(Number(limit || 10), 1), 50)
    const result = await this.db.query<IntegrationEventRecord>(`
      update integration_events
      set status = 'processing',
          updated_at = now()
      where id in (
        select id
        from integration_events
        where status = 'queued'
          and direction = 'outbound'
        order by created_at asc
        limit $1
        for update skip locked
      )
      returning id, domain, provider, direction, event_type, status, entity_type, entity_id, correlation_id, external_id, payload, metadata, error_message
    `, [safeLimit])
    return result.rows
  }

  async markProcessed(input: { id: string; status: IntegrationEventStatus; externalId?: string | null; error?: string | null; payload?: Record<string, unknown> | null }) {
    const result = await this.db.query<{ id: string }>(`
      update integration_events
      set status = $2,
          external_id = coalesce($3, external_id),
          error_message = $4,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('result_payload', $5::jsonb),
          processed_at = now(),
          updated_at = now()
      where id = $1
      returning id
    `, [input.id, input.status, input.externalId ?? null, input.error ?? null, JSON.stringify(input.payload ?? {})])
    return result.rows[0] ?? null
  }
}
