import type { AivenSqlClient } from '../db/aivenClient.js'

export interface LeadRow {
  id: string
  nome_lead: string | null
  whatsapp_lead: string | null
  motivo_contato: string | null
  status: string | null
  inicio_atendimento: string | null
  anotacoes: string | null
  created_at: string
  updated_at: string
}

export type CreateLeadInput = Omit<LeadRow, 'id' | 'created_at' | 'updated_at'>

export class LeadRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async create(input: CreateLeadInput): Promise<LeadRow> {
    const result = await this.db.query<LeadRow>(
      `INSERT INTO leads_contabilidade
         (nome_lead, whatsapp_lead, motivo_contato, status, inicio_atendimento, anotacoes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.nome_lead ?? null,
        input.whatsapp_lead ?? null,
        input.motivo_contato ?? null,
        input.status ?? 'iniciou_conversa',
        input.inicio_atendimento ?? new Date().toISOString(),
        input.anotacoes ?? null,
      ],
    )
    return result.rows[0]
  }
}
