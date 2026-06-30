import type { AivenSqlClient } from '../db/aivenClient.js'

export interface ConversationFileRow {
  id: string
  conversation_id: string
  original_name: string
  stored_path: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  created_at: string
}

export type CreateConversationFileInput = {
  conversation_id: string
  original_name: string
  stored_path: string
  mime_type?: string | null
  size_bytes?: number | null
  uploaded_by?: string | null
}

export class FileRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async create(input: CreateConversationFileInput): Promise<ConversationFileRow> {
    const result = await this.db.query<ConversationFileRow>(
      `INSERT INTO crm_conversation_files
         (conversation_id, original_name, stored_path, mime_type, size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.conversation_id,
        input.original_name,
        input.stored_path,
        input.mime_type ?? null,
        input.size_bytes ?? null,
        input.uploaded_by ?? null,
      ],
    )
    return result.rows[0]
  }

  async findById(id: string): Promise<ConversationFileRow | null> {
    const result = await this.db.query<ConversationFileRow>(
      `SELECT * FROM crm_conversation_files WHERE id = $1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  async listByConversation(conversationId: string): Promise<ConversationFileRow[]> {
    const result = await this.db.query<ConversationFileRow>(
      `SELECT * FROM crm_conversation_files WHERE conversation_id = $1 ORDER BY created_at ASC`,
      [conversationId],
    )
    return result.rows
  }
}
