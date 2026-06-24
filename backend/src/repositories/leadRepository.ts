import type { AivenSqlClient } from '../db/aivenClient.js'

export interface LeadRow {
  id: string
  nome_lead: string | null
  whatsapp_lead: string | null
  motivo_contato: string | null
  status: string | null
  ultima_mensagem?: string | null
  inicio_atendimento: string | null
  anotacoes: string | null
  responsavel_profile_id?: string | null
  responsavel_nome?: string | null
  transferido_em?: string | null
  transferido_por?: string | null
  evolution_instance?: string | null
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
        WHERE regexp_replace(coalesce(whatsapp_lead, ''), '\D', '', 'g') = $1
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1`,
      [phoneDigits],
    )

    return result.rows[0] ?? null
  }

  async create(input: CreateLeadInput): Promise<LeadRow> {
    const result = await this.db.query<LeadRow>(
      `INSERT INTO leads_contabilidade
         (nome_lead, whatsapp_lead, motivo_contato, status, ultima_mensagem, inicio_atendimento, anotacoes, responsavel_profile_id, responsavel_nome, transferido_em, transferido_por, evolution_instance)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid, $9, $10::timestamptz, $11, $12)
       RETURNING *`,
      [
        input.nome_lead ?? null,
        input.whatsapp_lead ?? null,
        input.motivo_contato ?? null,
        input.status ?? 'iniciou_conversa',
        input.ultima_mensagem ?? null,
        input.inicio_atendimento ?? new Date().toISOString(),
        input.anotacoes ?? null,
        input.responsavel_profile_id ?? null,
        input.responsavel_nome ?? null,
        input.transferido_em ?? null,
        input.transferido_por ?? null,
        input.evolution_instance ?? null,
      ],
    )
    return result.rows[0]
  }

  async markHumanHandoff(input: {
    leadId?: string | null
    nomeLead?: string | null
    whatsappLead?: string | null
    motivoContato?: string | null
    ultimaMensagem?: string | null
    anotacoes?: string | null
    transferidoPor?: string | null
    responsavelProfileId?: string | null
    responsavelNome?: string | null
    evolutionInstance?: string | null
  }) {
    const now = new Date().toISOString()

    if (input.leadId) {
      const result = await this.db.query<LeadRow>(
        `UPDATE leads_contabilidade
            SET nome_lead = coalesce($2, nome_lead),
                whatsapp_lead = coalesce($3, whatsapp_lead),
                motivo_contato = coalesce($4, motivo_contato),
                status = 'conversando',
                ultima_mensagem = coalesce($5, ultima_mensagem),
                anotacoes = concat_ws(E'\n', nullif(anotacoes, ''), $6),
                transferido_em = $7::timestamptz,
                transferido_por = $8,
                responsavel_profile_id = coalesce($9::uuid, responsavel_profile_id),
                responsavel_nome = coalesce($10, responsavel_nome),
                evolution_instance = coalesce($11, evolution_instance),
                updated_at = now()
          WHERE id = $1::uuid
        RETURNING *`,
        [
          input.leadId,
          input.nomeLead ?? null,
          input.whatsappLead ?? null,
          input.motivoContato ?? null,
          input.ultimaMensagem ?? null,
          input.anotacoes ?? null,
          now,
          input.transferidoPor ?? 'IA Clara',
          input.responsavelProfileId ?? null,
          input.responsavelNome ?? null,
          input.evolutionInstance ?? null,
        ],
      )

      if (result.rows[0]) return result.rows[0]
    }

    return this.create({
      nome_lead: input.nomeLead ?? null,
      whatsapp_lead: input.whatsappLead ?? null,
      motivo_contato: input.motivoContato ?? 'atendimento_clara',
      status: 'conversando',
      ultima_mensagem: input.ultimaMensagem ?? null,
      inicio_atendimento: now,
      anotacoes: input.anotacoes ?? null,
      responsavel_profile_id: input.responsavelProfileId ?? null,
      responsavel_nome: input.responsavelNome ?? null,
      transferido_em: now,
      transferido_por: input.transferidoPor ?? 'IA Clara',
      evolution_instance: input.evolutionInstance ?? null,
    })
  }
}
