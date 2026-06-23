import type { AivenSqlClient } from '../db/aivenClient.js'

export interface AutomationRuleRow {
  id: string
  rule_key: string
  label: string
  channel: string
  dias_antes: number | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export class AutomationRulesRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async findByKeys(keys: string[]): Promise<AutomationRuleRow[]> {
    if (keys.length === 0) return []
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(',')
    const result = await this.db.query<AutomationRuleRow>(
      `SELECT * FROM automation_rules WHERE rule_key IN (${placeholders}) ORDER BY rule_key`,
      keys,
    )
    return result.rows
  }

  async toggle(id: string, ativo: boolean): Promise<AutomationRuleRow | null> {
    const result = await this.db.query<AutomationRuleRow>(
      `UPDATE automation_rules SET ativo = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [ativo, id],
    )
    return result.rows[0] ?? null
  }
}
