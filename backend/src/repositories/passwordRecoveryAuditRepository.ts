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
}
