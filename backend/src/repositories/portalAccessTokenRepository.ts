import type { AivenSqlClient } from '../db/aivenClient.js'

export type PortalAccessTokenRow = {
  id: string
  email: string
  token_hash: string
  expires_at: string
  consumed_at: string | null
  created_at: string
  updated_at: string
}

export class PortalAccessTokenRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async create(input: { email: string; tokenHash: string; expiresAt: string }): Promise<PortalAccessTokenRow> {
    const result = await this.db.query<PortalAccessTokenRow>(
      `INSERT INTO portal_access_tokens (email, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.email, input.tokenHash, input.expiresAt],
    )
    return result.rows[0]
  }

  async findValidByEmailAndTokenHash(email: string, tokenHash: string): Promise<PortalAccessTokenRow | null> {
    const result = await this.db.query<PortalAccessTokenRow>(
      `SELECT *
         FROM portal_access_tokens
        WHERE email = $1
          AND token_hash = $2
          AND consumed_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1`,
      [email, tokenHash],
    )
    return result.rows[0] ?? null
  }

  async consume(id: string): Promise<void> {
    await this.db.query(
      `UPDATE portal_access_tokens
          SET consumed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [id],
    )
  }

  async purgeExpired(): Promise<number> {
    const result = await this.db.query<{ id: string }>(
      `DELETE FROM portal_access_tokens
        WHERE expires_at < NOW() - INTERVAL '7 days'
        RETURNING id`,
      [],
    )
    return result.rows.length
  }
}
