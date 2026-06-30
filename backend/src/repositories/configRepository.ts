import type { AivenSqlClient } from '../db/aivenClient.js'

export type ConfigValue = {
  enabled: boolean
  minutes: number
  clara_webhook: string
}

const DEFAULTS: Record<string, ConfigValue> = {
  timeout_automation: {
    enabled: true,
    minutes: 10,
    clara_webhook: 'https://auto.mantovan.com.br/webhook/avmd-clara-inbound',
  },
}

export class ConfigRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async get(key: string): Promise<ConfigValue> {
    const result = await this.db.query<{ value: ConfigValue }>(
      `SELECT value FROM crm_chat_config WHERE key = $1`,
      [key],
    )
    return result.rows[0]?.value ?? DEFAULTS[key]!
  }

  async set(key: string, value: ConfigValue): Promise<void> {
    await this.db.query(
      `INSERT INTO crm_chat_config (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
      [key, JSON.stringify(value)],
    )
  }
}
