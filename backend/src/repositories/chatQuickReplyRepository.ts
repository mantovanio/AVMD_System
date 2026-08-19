import type { AivenSqlClient } from '../db/aivenClient.js'

export interface QuickReplyAttachment {
  url: string
  filename: string
  mime_type: string
  size?: number
  base64?: string
}

export interface QuickReplyRow {
  id: string
  shortcut: string
  name: string
  body: string
  category: string | null
  attachments: QuickReplyAttachment[]
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface CreateQuickReplyInput {
  shortcut: string
  name: string
  body?: string
  category?: string | null
  attachments?: QuickReplyAttachment[]
}

export interface UpdateQuickReplyInput {
  shortcut?: string
  name?: string
  body?: string
  category?: string | null
  attachments?: QuickReplyAttachment[]
  ativo?: boolean
}

export class ChatQuickReplyRepository {
  constructor(private db: AivenSqlClient) {}

  async findAll(): Promise<QuickReplyRow[]> {
    const result = await this.db.query<QuickReplyRow>(
      `SELECT id, shortcut, name, body, category, attachments, ativo, created_at, updated_at
       FROM chat_quick_replies
       ORDER BY category NULLS LAST, name ASC`
    )
    return result.rows
  }

  async findActive(): Promise<QuickReplyRow[]> {
    const result = await this.db.query<QuickReplyRow>(
      `SELECT id, shortcut, name, body, category, attachments, ativo, created_at, updated_at
       FROM chat_quick_replies
       WHERE ativo = true
       ORDER BY category NULLS LAST, name ASC`
    )
    return result.rows
  }

  async findById(id: string): Promise<QuickReplyRow | null> {
    const result = await this.db.query<QuickReplyRow>(
      `SELECT id, shortcut, name, body, category, attachments, ativo, created_at, updated_at
       FROM chat_quick_replies
       WHERE id = $1 LIMIT 1`,
      [id]
    )
    return result.rows[0] ?? null
  }

  async findByShortcut(shortcut: string): Promise<QuickReplyRow | null> {
    const result = await this.db.query<QuickReplyRow>(
      `SELECT id, shortcut, name, body, category, attachments, ativo, created_at, updated_at
       FROM chat_quick_replies
       WHERE LOWER(shortcut) = LOWER($1) AND ativo = true
       LIMIT 1`,
      [shortcut]
    )
    return result.rows[0] ?? null
  }

  async search(term: string): Promise<QuickReplyRow[]> {
    const pattern = `%${term}%`
    const result = await this.db.query<QuickReplyRow>(
      `SELECT id, shortcut, name, body, category, attachments, ativo, created_at, updated_at
       FROM chat_quick_replies
       WHERE ativo = true
         AND (
           LOWER(shortcut) LIKE LOWER($1)
           OR LOWER(name) LIKE LOWER($1)
           OR LOWER(body) LIKE LOWER($1)
           OR LOWER(category) LIKE LOWER($1)
         )
       ORDER BY category NULLS LAST, name ASC
       LIMIT 20`,
      [pattern]
    )
    return result.rows
  }

  async create(input: CreateQuickReplyInput): Promise<QuickReplyRow> {
    const result = await this.db.query<QuickReplyRow>(
      `INSERT INTO chat_quick_replies (shortcut, name, body, category, attachments)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      [
        input.shortcut.trim(),
        input.name.trim(),
        (input.body ?? '').trim(),
        input.category ?? null,
        JSON.stringify(input.attachments ?? []),
      ]
    )
    return result.rows[0]
  }

  async update(id: string, input: UpdateQuickReplyInput): Promise<QuickReplyRow | null> {
    const fields: string[] = []
    const values: unknown[] = []
    let idx = 1

    if (input.shortcut !== undefined) {
      fields.push(`shortcut = $${idx++}`)
      values.push(input.shortcut.trim())
    }
    if (input.name !== undefined) {
      fields.push(`name = $${idx++}`)
      values.push(input.name.trim())
    }
    if (input.body !== undefined) {
      fields.push(`body = $${idx++}`)
      values.push(input.body.trim())
    }
    if (input.category !== undefined) {
      fields.push(`category = $${idx++}`)
      values.push(input.category ?? null)
    }
    if (input.attachments !== undefined) {
      fields.push(`attachments = $${idx++}::jsonb`)
      values.push(JSON.stringify(input.attachments))
    }
    if (input.ativo !== undefined) {
      fields.push(`ativo = $${idx++}`)
      values.push(input.ativo)
    }

    if (fields.length === 0) return this.findById(id)

    fields.push(`updated_at = NOW()`)
    values.push(id)

    const result = await this.db.query<QuickReplyRow>(
      `UPDATE chat_quick_replies SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )
    return result.rows[0] ?? null
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `DELETE FROM chat_quick_replies WHERE id = $1 RETURNING id`,
      [id]
    )
    return (result.rows?.length ?? 0) > 0
  }
}
