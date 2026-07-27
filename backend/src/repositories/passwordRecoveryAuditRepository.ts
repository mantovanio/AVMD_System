import type { AivenSqlClient } from '../db/aivenClient.js'

export type PasswordRecoveryAuditRow = {
  id: number
  profile_id: string | null
  email: string
  action: string
  status: string
  reason: string | null
  source: string | null
  ip_address: string | null
  user_agent: string | null
  clerk_user_id: string | null
  approved_by_profile_id: string | null
  approved_at: string | null
  decision_note: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export class PasswordRecoveryAuditRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async create(input: {
    profileId?: string | null
    email: string
    action: 'request' | 'verify'
    status: 'allowed' | 'blocked' | 'requires_confirmation' | 'sent' | 'verified'
    reason?: string | null
    source?: string | null
    ipAddress?: string | null
    userAgent?: string | null
    clerkUserId?: string | null
    metadata?: Record<string, unknown>
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO password_recovery_audit (
         profile_id, email, action, status, reason, source, ip_address, user_agent, clerk_user_id, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        input.profileId ?? null,
        input.email,
        input.action,
        input.status,
        input.reason ?? null,
        input.source ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        input.clerkUserId ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    )
  }

  async listPending(limit = 50, offset = 0): Promise<PasswordRecoveryAuditRow[]> {
    const result = await this.db.query<PasswordRecoveryAuditRow>(
      `SELECT *
         FROM password_recovery_audit
        WHERE status = 'requires_confirmation'
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset],
    )
    return result.rows
  }

  async findById(id: number): Promise<PasswordRecoveryAuditRow | null> {
    const result = await this.db.query<PasswordRecoveryAuditRow>(
      'SELECT * FROM password_recovery_audit WHERE id = $1 LIMIT 1',
      [id],
    )
    return result.rows[0] ?? null
  }

  async approve(input: { id: number; approvedByProfileId: string; decisionNote?: string | null }): Promise<void> {
    await this.db.query(
      `UPDATE password_recovery_audit
          SET status = 'allowed',
              approved_by_profile_id = $2::uuid,
              approved_at = now(),
              decision_note = $3,
              updated_at = now()
        WHERE id = $1`,
      [input.id, input.approvedByProfileId, input.decisionNote ?? null],
    )
  }

  async reject(input: { id: number; rejectedByProfileId: string; decisionNote?: string | null }): Promise<void> {
    await this.db.query(
      `UPDATE password_recovery_audit
          SET status = 'blocked',
              approved_by_profile_id = $2::uuid,
              approved_at = now(),
              decision_note = $3,
              updated_at = now()
        WHERE id = $1`,
      [input.id, input.rejectedByProfileId, input.decisionNote ?? null],
    )
  }
}
