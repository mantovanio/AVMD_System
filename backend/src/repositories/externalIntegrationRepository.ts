import type { AivenSqlClient } from '../db/aivenClient.js'

export interface ExternalIntegrationRow {
  id: string
  provider: string
  name: string
  description: string | null
  status: string
  base_url: string | null
  webhook_url: string | null
  api_token: string | null
  account_id: string | null
  inbox_id: string | null
  instance_name: string | null
  sender_name: string | null
  sender_email: string | null
  host: string | null
  port: number | null
  username: string | null
  metadata: Record<string, unknown>
  last_test_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export type CreateIntegrationInput = Omit<ExternalIntegrationRow, 'id' | 'created_at' | 'updated_at' | 'last_test_at' | 'last_error'>
export type UpdateIntegrationInput = Partial<Omit<ExternalIntegrationRow, 'id' | 'created_at'>>

export class ExternalIntegrationRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async findAll(): Promise<ExternalIntegrationRow[]> {
    const result = await this.db.query<ExternalIntegrationRow>(
      'SELECT * FROM external_integrations ORDER BY name ASC',
    )
    return result.rows
  }

  async findById(id: string): Promise<ExternalIntegrationRow | null> {
    const result = await this.db.query<ExternalIntegrationRow>(
      'SELECT * FROM external_integrations WHERE id = $1 LIMIT 1',
      [id],
    )
    return result.rows[0] ?? null
  }

  async findActiveWhatsApp(): Promise<ExternalIntegrationRow[]> {
    const result = await this.db.query<ExternalIntegrationRow>(
      `SELECT * FROM external_integrations
       WHERE status <> 'inativo'
         AND (provider = 'evolution' OR metadata->>'integration_family' = 'whatsapp_api')
       ORDER BY CASE status WHEN 'ativo' THEN 0 WHEN 'pendente' THEN 1 ELSE 2 END,
                updated_at DESC`,
    )
    return result.rows
  }

  async create(input: CreateIntegrationInput): Promise<ExternalIntegrationRow> {
    const result = await this.db.query<ExternalIntegrationRow>(
      `INSERT INTO external_integrations (
        provider, name, description, status,
        base_url, webhook_url, api_token, account_id, inbox_id,
        instance_name, sender_name, sender_email, host, port, username, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        input.provider, input.name, input.description ?? null, input.status ?? 'pendente',
        input.base_url ?? null, input.webhook_url ?? null, input.api_token ?? null,
        input.account_id ?? null, input.inbox_id ?? null,
        input.instance_name ?? null, input.sender_name ?? null, input.sender_email ?? null,
        input.host ?? null, input.port ?? null, input.username ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    )
    return result.rows[0]
  }

  async update(id: string, input: UpdateIntegrationInput): Promise<ExternalIntegrationRow | null> {
    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1

    const field = (col: string, val: unknown) => { sets.push(`${col} = $${idx++}`); params.push(val) }

    if (input.provider !== undefined)      field('provider', input.provider)
    if (input.name !== undefined)          field('name', input.name)
    if (input.description !== undefined)   field('description', input.description)
    if (input.status !== undefined)        field('status', input.status)
    if (input.base_url !== undefined)      field('base_url', input.base_url)
    if (input.webhook_url !== undefined)   field('webhook_url', input.webhook_url)
    if (input.api_token !== undefined)     field('api_token', input.api_token)
    if (input.account_id !== undefined)    field('account_id', input.account_id)
    if (input.inbox_id !== undefined)      field('inbox_id', input.inbox_id)
    if (input.instance_name !== undefined) field('instance_name', input.instance_name)
    if (input.sender_name !== undefined)   field('sender_name', input.sender_name)
    if (input.sender_email !== undefined)  field('sender_email', input.sender_email)
    if (input.host !== undefined)          field('host', input.host)
    if (input.port !== undefined)          field('port', input.port)
    if (input.username !== undefined)      field('username', input.username)
    if (input.metadata !== undefined)      field('metadata', JSON.stringify(input.metadata))
    if (input.last_test_at !== undefined)  field('last_test_at', input.last_test_at)
    if (input.last_error !== undefined)    field('last_error', input.last_error)

    if (sets.length === 0) return this.findById(id)

    sets.push('updated_at = NOW()')
    params.push(id)

    const result = await this.db.query<ExternalIntegrationRow>(
      `UPDATE external_integrations SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    )
    return result.rows[0] ?? null
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      'DELETE FROM external_integrations WHERE id = $1 RETURNING id',
      [id],
    )
    return result.rows.length > 0
  }
}
