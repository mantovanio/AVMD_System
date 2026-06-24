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

  async findByPhone(phoneDigits: string) {
    if (!phoneDigits) return null

    const result = await this.db.query<LeadRow>(
      `SELECT *
         FROM leads_contabilidade
        WHERE regexp_replace(coalesce(whatsapp_lead, ''), '\\D', '', 'g') = $1
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1`,
      [phoneDigits],
    )

    return result.rows[0] ?? null
  }

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

  async markHumanHandoff(input: {
    leadId?: string | null
    nomeLead?: string | null
    whatsappLead?: string | null
    motivoContato?: string | null
    anotacoes?: string | null
  }) {
    const now = new Date().toISOString()

    if (input.leadId) {
      const result = await this.db.query<LeadRow>(
        `UPDATE leads_contabilidade
            SET nome_lead = coalesce($2, nome_lead),
                whatsapp_lead = coalesce($3, whatsapp_lead),
                motivo_contato = coalesce($4, motivo_contato),
                status = 'conversando',
                anotacoes = concat_ws(E'\n', nullif(anotacoes, ''), $5),
                updated_at = now()
          WHERE id = $1::uuid
        RETURNING *`,
        [
          input.leadId,
          input.nomeLead ?? null,
          input.whatsappLead ?? null,
          input.motivoContato ?? null,
          input.anotacoes ?? null,
        ],
      )

      if (result.rows[0]) return result.rows[0]
    }

    return this.create({
      nome_lead: input.nomeLead ?? null,
      whatsapp_lead: input.whatsappLead ?? null,
      motivo_contato: input.motivoContato ?? 'atendimento_clara',
      status: 'conversando',
      inicio_atendimento: now,
      anotacoes: input.anotacoes ?? null,
    })
  }
}
