import type { AivenSqlClient } from '../db/aivenClient.js'

export interface CommunicationEventRow {
  id: string
  source: string
  event_type: string | null
  external_id: string | null
  conversation_id: string | null
  lead_id: string | null
  contact: string | null
  payload: Record<string, unknown>
  created_at: string
}

export type CreateCommunicationEventInput = {
  source: string
  event_type?: string | null
  external_id?: string | null
  conversation_id?: string | null
  lead_id?: string | null
  contact?: string | null
  payload?: Record<string, unknown>
}

export class CommunicationEventRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async create(input: CreateCommunicationEventInput): Promise<CommunicationEventRow> {
    const result = await this.db.query<CommunicationEventRow>(
      `INSERT INTO communication_events
         (source, event_type, external_id, conversation_id, lead_id, contact, payload)
       VALUES ($1, $2, $3, $4, $5::uuid, $6, $7::jsonb)
       RETURNING *`,
      [
        input.source,
        input.event_type ?? null,
        input.external_id ?? null,
        input.conversation_id ?? null,
        input.lead_id ?? null,
        input.contact ?? null,
        JSON.stringify(input.payload ?? {}),
      ],
    )

    return result.rows[0]
  }

  async listByConversation(conversationId: string, limit = 200): Promise<CommunicationEventRow[]> {
    const result = await this.db.query<CommunicationEventRow>(
      `SELECT *
         FROM communication_events
        WHERE conversation_id = $1
        ORDER BY created_at ASC
        LIMIT $2`,
      [conversationId, limit],
    )

    return result.rows
  }
}
