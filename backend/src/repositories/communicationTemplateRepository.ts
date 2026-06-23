import type { AivenSqlClient } from '../db/aivenClient.js'

export interface CommunicationTemplateRow {
  id: string
  name: string
  channel: 'whatsapp' | 'email'
  subject: string | null
  body: string
  template_key: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export type CreateTemplateInput = Omit<CommunicationTemplateRow, 'id' | 'created_at' | 'updated_at'>
export type UpdateTemplateInput = Partial<Omit<CommunicationTemplateRow, 'id' | 'created_at'>>

export class CommunicationTemplateRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async findAll(): Promise<CommunicationTemplateRow[]> {
    const result = await this.db.query<CommunicationTemplateRow>(
      `SELECT * FROM communication_templates ORDER BY created_at ASC`,
    )
    return result.rows
  }

  async findById(id: string): Promise<CommunicationTemplateRow | null> {
    const result = await this.db.query<CommunicationTemplateRow>(
      `SELECT * FROM communication_templates WHERE id = $1 LIMIT 1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  async create(input: CreateTemplateInput): Promise<CommunicationTemplateRow> {
    const key = input.template_key || input.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    const result = await this.db.query<CommunicationTemplateRow>(
      `INSERT INTO communication_templates (name, channel, subject, body, template_key, ativo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [input.name, input.channel, input.subject ?? null, input.body, key, input.ativo ?? true],
    )
    return result.rows[0]
  }

  async update(id: string, input: UpdateTemplateInput): Promise<CommunicationTemplateRow | null> {
    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1

    const field = (col: string, val: unknown) => { sets.push(`${col} = $${idx++}`); params.push(val) }

    if (input.name !== undefined)         field('name', input.name)
    if (input.channel !== undefined)      field('channel', input.channel)
    if (input.subject !== undefined)      field('subject', input.subject)
    if (input.body !== undefined)         field('body', input.body)
    if (input.template_key !== undefined) field('template_key', input.template_key)
    if (input.ativo !== undefined)        field('ativo', input.ativo)

    if (sets.length === 0) return this.findById(id)

    sets.push('updated_at = NOW()')
    params.push(id)

    const result = await this.db.query<CommunicationTemplateRow>(
      `UPDATE communication_templates SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    )
    return result.rows[0] ?? null
  }

  async clearAtivoByChannel(channel: string, excludeId?: string): Promise<void> {
    if (excludeId) {
      await this.db.query(
        `UPDATE communication_templates SET ativo = false, updated_at = NOW()
         WHERE channel = $1 AND id != $2`,
        [channel, excludeId],
      )
    } else {
      await this.db.query(
        `UPDATE communication_templates SET ativo = false, updated_at = NOW() WHERE channel = $1`,
        [channel],
      )
    }
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `DELETE FROM communication_templates WHERE id = $1 RETURNING id`,
      [id],
    )
    return result.rows.length > 0
  }
}
