import type { AivenSqlClient } from '../db/aivenClient.js'

export type TimeoutAutomationConfig = {
  enabled: boolean
  minutes: number
  clara_webhook: string
}

export type AIControlConfig = {
  enabled: boolean
  atendimento_ia_enabled: boolean
  renovacao_ia_enabled: boolean
  description?: string
}

const DEFAULTS: Record<string, TimeoutAutomationConfig | AIControlConfig> = {
  timeout_automation: {
    enabled: true,
    minutes: 10,
    clara_webhook: 'https://auto.mantovan.com.br/webhook/avmd-clara-inbound',
  },
  ai_control: {
    enabled: true,
    atendimento_ia_enabled: false,
    renovacao_ia_enabled: true,
    description: 'Controla se a IA (Clara/N8N) responde automaticamente. atendimento_ia_enabled=false desliga IA no canal Atendimento; renovacao_ia_enabled controla canal Renovacoes.',
  },
}

export class ConfigRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async get<T>(key: string): Promise<T> {
    const result = await this.db.query<{ value: T }>(
      `SELECT value FROM crm_chat_config WHERE key = $1`,
      [key],
    )
    return result.rows[0]?.value ?? DEFAULTS[key] as T
  }

  async set(key: string, value: TimeoutAutomationConfig | AIControlConfig): Promise<void> {
    await this.db.query(
      `INSERT INTO crm_chat_config (key, value, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
      [key, JSON.stringify(value)],
    )
  }
}
