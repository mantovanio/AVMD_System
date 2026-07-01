import type { AivenSqlClient } from '../db/aivenClient.js'

export interface LeadRow {
  id: string
  nome_lead: string | null
  whatsapp_lead: string | null
  motivo_contato: string | null
  resumo_conversa: string | null
  ultima_mensagem: string | null
  status: string | null
  horario_comercial: boolean | null
  data_agendamento: string | null
  agendamento_criado_em: string | null
  follow_up_1: string | null
  follow_up_2: string | null
  follow_up_3: string | null
  evolution_remote_jid: string | null
  evolution_instance: string | null
  inicio_atendimento: string | null
  anotacoes: string | null
  created_at: string
  updated_at: string
}

export type KanbanColumnRow = {
  id: string
  status_key: string
  label: string
  color: string
  bg: string
  border: string
  ordem: number
  ativo: boolean
}

export type CreateLeadInput = {
  nome_lead?: string | null
  whatsapp_lead?: string | null
  motivo_contato?: string | null
  resumo_conversa?: string | null
  ultima_mensagem?: string | null
  status?: string | null
  horario_comercial?: boolean | null
  data_agendamento?: string | null
  agendamento_criado_em?: string | null
  follow_up_1?: string | null
  follow_up_2?: string | null
  follow_up_3?: string | null
  evolution_remote_jid?: string | null
  evolution_instance?: string | null
  inicio_atendimento?: string | null
  anotacoes?: string | null
}

export class LeadRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async findById(id: string) {
    const result = await this.db.query<LeadRow>(
      `SELECT * FROM leads_contabilidade WHERE id = $1 LIMIT 1`, 
      [id],
    )

    return result.rows[0] ?? null
  }

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
         (
           nome_lead,
           whatsapp_lead,
           motivo_contato,
           resumo_conversa,
           ultima_mensagem,
           status,
           horario_comercial,
           data_agendamento,
           agendamento_criado_em,
           follow_up_1,
           follow_up_2,
           follow_up_3,
           evolution_remote_jid,
           evolution_instance,
           inicio_atendimento,
           anotacoes
         )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        input.nome_lead ?? null,
        input.whatsapp_lead ?? null,
        input.motivo_contato ?? null,
        input.resumo_conversa ?? null,
        input.ultima_mensagem ?? null,
        input.status ?? 'iniciou_conversa',
        input.horario_comercial ?? null,
        input.data_agendamento ?? null,
        input.agendamento_criado_em ?? null,
        input.follow_up_1 ?? null,
        input.follow_up_2 ?? null,
        input.follow_up_3 ?? null,
        input.evolution_remote_jid ?? null,
        input.evolution_instance ?? null,
        input.inicio_atendimento ?? new Date().toISOString(),
        input.anotacoes ?? null,
      ],
    )
    return result.rows[0]
  }

  async upsertFromEvolutionEvent(input: {
    phoneDigits: string
    conversationId?: string | null
    instanceName?: string | null
    pushName?: string | null
    content?: string | null
    fromMe?: boolean
  }) {
    const existing = await this.findByPhone(input.phoneDigits)
    const summary = input.content ?? null

    if (existing) {
      const result = await this.db.query<LeadRow>(
        `UPDATE leads_contabilidade
            SET nome_lead = coalesce(nome_lead, $2),
                whatsapp_lead = coalesce($3, whatsapp_lead),
                resumo_conversa = CASE WHEN $4::text IS NULL OR $6::boolean THEN resumo_conversa ELSE $4 END,
                ultima_mensagem = coalesce($4, ultima_mensagem),
                status = CASE WHEN $6::boolean THEN coalesce(status, 'conversando') ELSE 'conversando' END,
                evolution_remote_jid = coalesce($5, evolution_remote_jid),
                evolution_instance = coalesce($7, evolution_instance),
                updated_at = now()
          WHERE id = $1::uuid
        RETURNING *`,
        [
          existing.id,
          input.pushName ?? null,
          input.phoneDigits,
          summary,
          input.conversationId ?? null,
          Boolean(input.fromMe),
          input.instanceName ?? null,
        ],
      )

      return result.rows[0] ?? existing
    }

    if (input.fromMe) return null

    return this.create({
      nome_lead: input.pushName ?? null,
      whatsapp_lead: input.phoneDigits,
      motivo_contato: 'whatsapp_evolution',
      resumo_conversa: summary,
      ultima_mensagem: summary,
      status: 'iniciou_conversa',
      evolution_remote_jid: input.conversationId ?? null,
      evolution_instance: input.instanceName ?? null,
      inicio_atendimento: new Date().toISOString(),
    })
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

  async findAll(from?: string, to?: string): Promise<LeadRow[]> {
    let sql = `SELECT * FROM leads_contabilidade`
    const params: string[] = []
    const clauses: string[] = []
    if (from) { params.push(from); clauses.push(`created_at >= $${params.length}`) }
    if (to)   { params.push(to);   clauses.push(`created_at < $${params.length}`) }
    if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`
    sql += ` ORDER BY created_at DESC`
    const result = await this.db.query<LeadRow>(sql, params)
    return result.rows
  }

  async update(id: string, fields: Partial<Omit<LeadRow, 'id' | 'created_at' | 'updated_at'>>): Promise<LeadRow | null> {
    const keys = Object.keys(fields)
    if (!keys.length) return null
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
    const vals = keys.map(k => (fields as Record<string, unknown>)[k])
    const result = await this.db.query<LeadRow>(
      `UPDATE leads_contabilidade SET ${sets}, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, ...vals],
    )
    return result.rows[0] ?? null
  }

  async deleteById(id: string): Promise<void> {
    await this.db.query(`DELETE FROM leads_contabilidade WHERE id = $1`, [id])
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (!ids.length) return
    await this.db.query(
      `DELETE FROM leads_contabilidade WHERE id = ANY($1::uuid[])`,
      [ids],
    )
  }

  async getKanbanColumns(): Promise<KanbanColumnRow[]> {
    const result = await this.db.query<KanbanColumnRow>(
      `SELECT * FROM chat_kanban_columns ORDER BY ordem ASC`,
    )
    return result.rows
  }

  async saveKanbanColumn(input: Omit<KanbanColumnRow, 'id'> & { id?: string }): Promise<KanbanColumnRow> {
    if (input.id) {
      const result = await this.db.query<KanbanColumnRow>(
        `UPDATE chat_kanban_columns SET status_key=$2, label=$3, color=$4, bg=$5, border=$6, ordem=$7, ativo=$8 WHERE id=$1 RETURNING *`,
        [input.id, input.status_key, input.label, input.color, input.bg, input.border, input.ordem, input.ativo],
      )
      return result.rows[0]
    }
    const result = await this.db.query<KanbanColumnRow>(
      `INSERT INTO chat_kanban_columns (status_key, label, color, bg, border, ordem, ativo) VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (status_key) DO UPDATE SET label=$2, color=$3, bg=$4, border=$5, ordem=$6, ativo=$7 RETURNING *`,
      [input.status_key, input.label, input.color, input.bg, input.border, input.ordem, input.ativo],
    )
    return result.rows[0]
  }

  async updateKanbanOrders(items: { id: string; ordem: number }[]): Promise<void> {
    await Promise.all(items.map(item =>
      this.db.query(`UPDATE chat_kanban_columns SET ordem=$2 WHERE id=$1`, [item.id, item.ordem]),
    ))
  }

  async deleteKanbanColumn(id: string, fallbackStatusKey: string): Promise<void> {
    await this.db.query(
      `UPDATE leads_contabilidade SET status=$2 WHERE status = (SELECT status_key FROM chat_kanban_columns WHERE id=$1)`,
      [id, fallbackStatusKey],
    )
    await this.db.query(`DELETE FROM chat_kanban_columns WHERE id=$1`, [id])
  }
}

