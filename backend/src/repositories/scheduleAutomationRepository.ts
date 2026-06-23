import type { AivenSqlClient } from '../db/aivenClient.js'

export type ScheduleEmailEventType = 'novo_agendamento' | 'reagendamento' | 'cancelamento' | 'unknown'

export type ScheduleEmailInboundInput = {
  source: string
  mailbox?: string | null
  external_id?: string | null
  message_id?: string | null
  event_type: ScheduleEmailEventType
  customer_name?: string | null
  customer_email?: string | null
  customer_phone?: string | null
  customer_document?: string | null
  protocolo_numero?: string | null
  pedido_numero?: string | null
  data_agendada?: string | null
  payload: Record<string, unknown>
}

export type ScheduleMatchRow = {
  agenda_id: string | null
  agenda_status: string | null
  agenda_data_agendada: string | null
  venda_id: string
  venda_status: string | null
  protocolo_numero: string | null
  pedido_numero: string | null
  cadastro_base_id: string
  cadastro_nome: string | null
  cadastro_email: string | null
  cadastro_telefone: string | null
  cadastro_documento: string | null
  titular_id: string | null
  titular_nome: string | null
  titular_email: string | null
  titular_telefone: string | null
  titular_documento: string | null
}

export class ScheduleAutomationRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async findExistingEvent(input: { externalId?: string | null; messageId?: string | null }) {
    if (!input.externalId && !input.messageId) return null
    const result = await this.db.query<{ id: string; status: string; matched_agendamento_id: string | null; matched_venda_id: string | null }>(`
      select id, status, matched_agendamento_id, matched_venda_id
      from schedule_email_events
      where ($1::text is not null and external_id = $1)
         or ($2::text is not null and message_id = $2)
      order by created_at desc
      limit 1
    `, [input.externalId ?? null, input.messageId ?? null])
    return result.rows[0] ?? null
  }

  async createInboundEvent(input: ScheduleEmailInboundInput) {
    const result = await this.db.query<{ id: string }>(`
      insert into schedule_email_events (
        source, mailbox, external_id, message_id, event_type,
        customer_name, customer_email, customer_phone, customer_document,
        protocolo_numero, pedido_numero, data_agendada, payload
      ) values (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12::timestamptz, $13::jsonb
      )
      returning id
    `, [
      input.source,
      input.mailbox ?? null,
      input.external_id ?? null,
      input.message_id ?? null,
      input.event_type,
      input.customer_name ?? null,
      input.customer_email ?? null,
      input.customer_phone ?? null,
      input.customer_document ?? null,
      input.protocolo_numero ?? null,
      input.pedido_numero ?? null,
      input.data_agendada ?? null,
      JSON.stringify(input.payload ?? {}),
    ])
    return result.rows[0] ?? null
  }

  async markEventStatus(input: {
    id: string
    status: string
    matchedAgendaId?: string | null
    matchedVendaId?: string | null
    processingNotes?: string | null
  }) {
    await this.db.query(`
      update schedule_email_events
      set status = $2,
          matched_agendamento_id = coalesce($3::uuid, matched_agendamento_id),
          matched_venda_id = coalesce($4::uuid, matched_venda_id),
          processing_notes = $5,
          updated_at = now()
      where id = $1
    `, [
      input.id,
      input.status,
      input.matchedAgendaId ?? null,
      input.matchedVendaId ?? null,
      input.processingNotes ?? null,
    ])
  }

  async findBestScheduleMatch(input: {
    protocoloNumero?: string | null
    pedidoNumero?: string | null
    customerEmail?: string | null
    customerPhoneDigits?: string | null
    customerDocumentDigits?: string | null
  }) {
    const result = await this.db.query<ScheduleMatchRow>(`
      select
        a.id as agenda_id,
        a.status_agendamento as agenda_status,
        a.data_agendada as agenda_data_agendada,
        v.id as venda_id,
        v.status_venda as venda_status,
        v.protocolo_numero,
        v.pedido_numero,
        cb.id as cadastro_base_id,
        cb.nome as cadastro_nome,
        cb.email as cadastro_email,
        cb.telefone as cadastro_telefone,
        cb.cpf_cnpj as cadastro_documento,
        t.id as titular_id,
        t.nome as titular_nome,
        t.email as titular_email,
        t.telefone as titular_telefone,
        t.cpf as titular_documento
      from vendas_certificados v
      inner join cadastros_base cb on cb.id = v.cadastro_base_id
      left join titulares_certificado t on t.id = v.titular_id
      left join agendamentos_validacao a on a.venda_certificado_id = v.id
      where
        ($1::text is not null and v.protocolo_numero = $1)
        or ($2::text is not null and v.pedido_numero = $2)
        or ($3::text is not null and lower(coalesce(t.email, '')) = lower($3))
        or ($3::text is not null and lower(coalesce(cb.email, '')) = lower($3))
        or ($4::text is not null and regexp_replace(coalesce(t.telefone, ''), '\\D', '', 'g') = $4)
        or ($4::text is not null and regexp_replace(coalesce(cb.telefone, ''), '\\D', '', 'g') = $4)
        or ($5::text is not null and regexp_replace(coalesce(t.cpf, ''), '\\D', '', 'g') = $5)
        or ($5::text is not null and regexp_replace(coalesce(cb.cpf_cnpj, ''), '\\D', '', 'g') = $5)
      order by
        case
          when $1::text is not null and v.protocolo_numero = $1 then 1
          when $2::text is not null and v.pedido_numero = $2 then 2
          when $5::text is not null and regexp_replace(coalesce(t.cpf, ''), '\\D', '', 'g') = $5 then 3
          when $5::text is not null and regexp_replace(coalesce(cb.cpf_cnpj, ''), '\\D', '', 'g') = $5 then 4
          when $3::text is not null and lower(coalesce(t.email, '')) = lower($3) then 5
          when $3::text is not null and lower(coalesce(cb.email, '')) = lower($3) then 6
          when $4::text is not null and regexp_replace(coalesce(t.telefone, ''), '\\D', '', 'g') = $4 then 7
          when $4::text is not null and regexp_replace(coalesce(cb.telefone, ''), '\\D', '', 'g') = $4 then 8
          else 99
        end,
        coalesce(a.updated_at, v.updated_at) desc
      limit 1
    `, [
      input.protocoloNumero ?? null,
      input.pedidoNumero ?? null,
      input.customerEmail ?? null,
      input.customerPhoneDigits ?? null,
      input.customerDocumentDigits ?? null,
    ])
    return result.rows[0] ?? null
  }

  async upsertValidationSchedule(input: {
    match: ScheduleMatchRow
    eventType: ScheduleEmailEventType
    source: string
    mailbox?: string | null
    externalId?: string | null
    messageId?: string | null
    replyBrand: string
    dataAgendada?: string | null
    observacoes?: string | null
  }) {
    const status = input.eventType === 'cancelamento' ? 'cancelado' : 'confirmado'
    const result = await this.db.query<{ id: string }>(`
      insert into agendamentos_validacao (
        id, venda_certificado_id, cadastro_base_id, titular_id,
        data_agendada, status_agendamento, observacoes, metadata, created_at, updated_at
      )
      values (
        coalesce($1::uuid, gen_random_uuid()),
        $2::uuid,
        $3::uuid,
        $4::uuid,
        case
          when $5::text is null and $1::uuid is not null then (select data_agendada from agendamentos_validacao where id = $1::uuid)
          else $5::timestamptz
        end,
        $6,
        $7,
        jsonb_build_object(
          'origem', 'schedule_email_automation',
          'schedule_source', $8,
          'schedule_mailbox', $9,
          'schedule_external_id', $10,
          'schedule_message_id', $11,
          'schedule_last_event_type', $12,
          'schedule_reply_brand', $13,
          'schedule_updated_at', now()
        ),
        now(),
        now()
      )
      on conflict (id) do update set
        data_agendada = case
          when $5::text is null then agendamentos_validacao.data_agendada
          else excluded.data_agendada
        end,
        status_agendamento = excluded.status_agendamento,
        observacoes = coalesce(excluded.observacoes, agendamentos_validacao.observacoes),
        metadata = coalesce(agendamentos_validacao.metadata, '{}'::jsonb) || excluded.metadata,
        updated_at = now()
      returning id
    `, [
      input.match.agenda_id,
      input.match.venda_id,
      input.match.cadastro_base_id,
      input.match.titular_id,
      input.dataAgendada ?? null,
      status,
      input.observacoes ?? null,
      input.source,
      input.mailbox ?? null,
      input.externalId ?? null,
      input.messageId ?? null,
      input.eventType,
      input.replyBrand,
    ])
    return { id: result.rows[0]?.id ?? input.match.agenda_id ?? null, status }
  }

  async updateSaleStatus(vendaId: string, status: string) {
    await this.db.query(`
      update vendas_certificados
      set status_venda = $2,
          updated_at = now()
      where id = $1::uuid
    `, [vendaId, status])
  }

  async syncLeadKanban(input: {
    phoneDigits?: string | null
    customerName?: string | null
    dataAgendada?: string | null
    eventType: ScheduleEmailEventType
    replyBrand: string
  }) {
    const nextStatus = input.eventType === 'cancelamento' ? 'cancelou_agendamento' : 'agendado'
    const note = input.eventType === 'cancelamento'
      ? `Agendamento removido automaticamente apos cancelamento recebido por e-mail. Responsavel: ${input.replyBrand}.`
      : `Agendamento atualizado automaticamente a partir de e-mail recebido. Responsavel: ${input.replyBrand}.`

    const result = await this.db.query<{ id: string }>(`
      update leads_contabilidade
      set
        status = $1,
        data_agendamento = case when $2 = 'cancelamento' then null else $3::timestamptz end,
        agendamento_criado_em = case
          when $2 = 'cancelamento' then agendamento_criado_em
          when agendamento_criado_em is null then now()
          else agendamento_criado_em
        end,
        anotacoes = concat_ws(E'\\n', nullif(anotacoes, ''), $4),
        updated_at = now()
      where
        ($5::text is not null and regexp_replace(coalesce(whatsapp_lead, ''), '\\D', '', 'g') = $5)
        or ($6::text is not null and lower(coalesce(nome_lead, '')) = lower($6))
      returning id
    `, [
      nextStatus,
      input.eventType,
      input.dataAgendada ?? null,
      note,
      input.phoneDigits ?? null,
      input.customerName ?? null,
    ])
    return { status: nextStatus, affected: result.rows.length }
  }
}
