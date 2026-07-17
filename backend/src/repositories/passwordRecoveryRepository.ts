import type { AivenSqlClient } from '../db/aivenClient.js'

export type PasswordRecoveryRow = {
  id: string
  profile_id: string
  email: string
  token_hash: string
  expires_at: string
  consumed_at: string | null
  created_at: string
  updated_at: string
}

export class PasswordRecoveryRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async create(input: {
    profileId: string
    email: string
    tokenHash: string
    expiresAt: string
  }): Promise<PasswordRecoveryRow> {
    const result = await this.db.query<PasswordRecoveryRow>(
      `INSERT INTO password_recovery_tokens (profile_id, email, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.profileId, input.email, input.tokenHash, input.expiresAt],
    )
    return result.rows[0]
  }

  async findValidByTokenHash(tokenHash: string): Promise<PasswordRecoveryRow | null> {
    const result = await this.db.query<PasswordRecoveryRow>(
      `SELECT *
         FROM password_recovery_tokens
        WHERE token_hash = $1
          AND consumed_at IS NULL
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1`,
      [tokenHash],
    )
    return result.rows[0] ?? null
  }

  async consume(id: string): Promise<void> {
    await this.db.query(
      `UPDATE password_recovery_tokens
          SET consumed_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [id],
    )
  }

  async purgeExpired(): Promise<number> {
    const result = await this.db.query<{ id: string }>(
      `DELETE FROM password_recovery_tokens
        WHERE expires_at < NOW() - INTERVAL '7 days'
        RETURNING id`,
      [],
    )
    return result.rows.length
  }
}
