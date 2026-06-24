import { randomUUID } from 'node:crypto'
import type { AivenSqlClient } from '../db/aivenClient.js'

export type CommercialSalesInput = {
  limit?: number
}

export type CommercialAgendaInput = {
  dataBase?: string | null
  status?: string | null
  agenteId?: string | null
}

export type UpdateCommercialSaleStatusInput = {
  id: string
  status: string
}

export type SaveCommercialAgendaInput = {
  agendaId?: string | null
  vendaId?: string | null
  cliente?: string
  telefone?: string | null
  servico?: string | null
  data_hora: string
  status: string
  observacoes?: string | null
  ponto_atendimento_id?: string | null
  agente_registro_id?: string | null
  tipo_atendimento?: string | null
}

export class CommercialRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async listSales(input: CommercialSalesInput = {}) {
    const limit = Math.min(Math.max(Number(input.limit || 50), 1), 200)
    const result = await this.db.query(`
      select
        v.*,
        case when cb.id is null then null else jsonb_build_object('nome', cb.nome, 'cpf_cnpj', cb.cpf_cnpj) end as cadastros_base,
        case when pa.id is null then null else jsonb_build_object('nome', pa.nome) end as pontos_atendimento
      from vendas_certificados v
      left join cadastros_base cb on cb.id = v.cadastro_base_id
      left join pontos_atendimento pa on pa.id = v.ponto_atendimento_id
      order by v.created_at desc
      limit $1
    `, [limit])
    return result.rows
  }

  async updateSaleStatus(input: UpdateCommercialSaleStatusInput) {
    const result = await this.db.query<{ id: string; status_venda: string }>(`
      update vendas_certificados
      set status_venda = $2,
          updated_at = now()
      where id = $1
      returning id, status_venda
    `, [input.id, input.status])
    const venda = result.rows[0] ?? null
    if (venda?.id) {
      await this.recordIntegrationEvent({
        eventType: 'commercial.sale.status.updated',
        entityType: 'vendas_certificados',
        entityId: venda.id,
        payload: { status_venda: venda.status_venda },
      })
    }
    return venda
  }

  async listSchedule(input: CommercialAgendaInput = {}) {
    const dataBase = input.dataBase?.trim() || new Date().toISOString().slice(0, 10)
    const params: unknown[] = [dataBase]
    const filters = [`(a.data_agendada >= $1::date or a.data_agendada is null)`]

    if (input.status) {
      params.push(input.status === 'aguardando' ? 'pendente' : input.status)
      filters.push(`a.status_agendamento = $${params.length}`)
    }

    if (input.agenteId) {
      params.push(input.agenteId)
      filters.push(`a.agente_registro_id = $${params.length}::uuid`)
    }

    const result = await this.db.query(`
      select
        a.id,
        a.created_at,
        a.data_agendada,
        a.status_agendamento,
        a.observacoes,
        a.tipo_atendimento,
        a.venda_certificado_id,
        a.ponto_atendimento_id,
        a.agente_registro_id,
        case when v.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
          'protocolo_numero', v.protocolo_numero,
          'tipo_produto', v.tipo_produto,
          'telefone_faturamento', v.telefone_faturamento,
          'nome_faturamento', v.nome_faturamento
        )) end as vendas_certificados,
        case when cb.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('nome', cb.nome)) end as cadastros_base,
        case when pa.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('nome', pa.nome)) end as pontos_atendimento
      from agendamentos_validacao a
      left join vendas_certificados v on v.id = a.venda_certificado_id
      left join cadastros_base cb on cb.id = a.cadastro_base_id
      left join pontos_atendimento pa on pa.id = a.ponto_atendimento_id
      where ${filters.join(' and ')}
      order by a.data_agendada asc nulls last, a.created_at asc
      limit 100
    `, params)
    return result.rows
  }

  async upsertAgenda(input: SaveCommercialAgendaInput) {
    const agendaId = input.agendaId?.trim() || randomUUID()
    const existing = await this.db.query<{ id: string }>(`select id from agendamentos where id = $1 limit 1`, [agendaId])

    if (existing.rows[0]?.id) {
      const result = await this.db.query(`
        update agendamentos
        set cliente = coalesce($2, cliente),
            telefone = coalesce($3, telefone),
            servico = coalesce($4, servico),
            data_hora = $5,
            status = $6,
            observacoes = $7,
            metadata = coalesce(metadata, '{}'::jsonb) ||
              jsonb_build_object(
                'agente_registro_id', $8::text,
                'ponto_atendimento_id', $9::text,
                'tipo_atendimento', $10::text
              ),
            updated_at = now()
        where id = $1
        returning id
      `, [agendaId, input.cliente ?? null, input.telefone ?? null, input.servico ?? null, input.data_hora, input.status, input.observacoes ?? null, input.agente_registro_id ?? null, input.ponto_atendimento_id ?? null, input.tipo_atendimento ?? null])
      return result.rows[0] ?? { id: agendaId }
    }

    const result = await this.db.query(`
      insert into agendamentos (
        id, cliente, telefone, servico, data_hora, status, observacoes, metadata, created_at, updated_at
      ) values (
        $1, coalesce($2, 'Agendamento'), $3, $4, $5, $6, $7,
        jsonb_build_object(
          'agente_registro_id', $8::text,
          'ponto_atendimento_id', $9::text,
          'tipo_atendimento', $10::text
        ),
        now(), now()
      ) returning id
    `, [agendaId, input.cliente ?? null, input.telefone ?? null, input.servico ?? null, input.data_hora, input.status, input.observacoes ?? null, input.agente_registro_id ?? null, input.ponto_atendimento_id ?? null, input.tipo_atendimento ?? null])
    return result.rows[0] ?? { id: agendaId }
  }

  async listCustomers() {
    const result = await this.db.query(`
      select *
      from cadastros_base
      where status = 'ativo'
      order by nome asc
      limit 200
    `)
    return result.rows
  }

  async searchCustomers(term: string) {
    const like = `%${term.trim().toLowerCase()}%`
    const result = await this.db.query(`
      select id, nome, nome_fantasia, cpf_cnpj, telefone, cidade, uf, status
      from cadastros_base
      where lower(coalesce(nome, '')) like $1
         or lower(coalesce(nome_fantasia, '')) like $1
         or lower(coalesce(cpf_cnpj, '')) like $1
         or lower(coalesce(telefone, '')) like $1
      order by nome asc
      limit 10
    `, [like])
    return result.rows
  }

  async listPoints() {
    const result = await this.db.query(`
      select *
      from pontos_atendimento
      where status = 'ativo'
      order by nome asc
    `)
    return result.rows
  }

  async saveCustomer(input: {
    id?: string | null
    tipo_cliente?: string | null
    tipo_cadastro?: string | null
    cpf_cnpj: string
    nome: string
    nome_fantasia?: string | null
    email?: string | null
    telefone?: string | null
    cidade?: string | null
    logradouro?: string | null
    numero?: string | null
    complemento?: string | null
    bairro?: string | null
    uf?: string | null
    cep?: string | null
    inscricao_municipal?: string | null
    inscricao_estadual?: string | null
    iss_retido?: boolean | null
    status?: string | null
    metadata?: Record<string, unknown> | null
  }) {
    const id = input.id?.trim() || randomUUID()
    const params = [
      id,
      input.tipo_cliente ?? 'pessoa_fisica',
      input.tipo_cadastro ?? 'cliente',
      input.cpf_cnpj,
      input.nome,
      input.nome_fantasia ?? null,
      input.email ?? null,
      input.telefone ?? null,
      input.cidade ?? null,
      input.logradouro ?? null,
      input.numero ?? null,
      input.complemento ?? null,
      input.bairro ?? null,
      input.uf ?? null,
      input.cep ?? null,
      input.inscricao_municipal ?? null,
      input.inscricao_estadual ?? null,
      input.iss_retido ?? false,
      input.status ?? 'ativo',
      input.metadata ? JSON.stringify(input.metadata) : '{}',
    ]

    const existing = input.id?.trim()
      ? await this.db.query<{ id: string }>(`select id from cadastros_base where id = $1 limit 1`, [input.id])
      : await this.db.query<{ id: string }>(`select id from cadastros_base where cpf_cnpj = $1 order by updated_at desc limit 1`, [input.cpf_cnpj])

    if (existing.rows[0]?.id) {
      const result = await this.db.query<{ id: string }>(`
        update cadastros_base
        set tipo_cliente = $2,
            tipo_cadastro = $3,
            cpf_cnpj = $4,
            nome = $5,
            nome_fantasia = $6,
            email = $7,
            telefone = $8,
            cidade = $9,
            logradouro = $10,
            numero = $11,
            complemento = $12,
            bairro = $13,
            uf = $14,
            cep = $15,
            inscricao_municipal = $16,
            inscricao_estadual = $17,
            iss_retido = $18,
            status = $19,
            metadata = coalesce(metadata, '{}'::jsonb) || $20::jsonb,
            updated_at = now()
        where id = $1
        returning id
      `, [existing.rows[0].id, ...params.slice(1)])
      const cliente = result.rows[0] ?? { id: existing.rows[0].id }
      await this.recordIntegrationEvent({
        eventType: 'commercial.customer.saved',
        entityType: 'cadastros_base',
        entityId: cliente.id,
        payload: { cpf_cnpj: input.cpf_cnpj, nome: input.nome },
      })
      return cliente
    }

    const result = await this.db.query<{ id: string }>(`
      insert into cadastros_base (
        id, tipo_cliente, tipo_cadastro, cpf_cnpj, nome, nome_fantasia, email, telefone,
        cidade, logradouro, numero, complemento, bairro, uf, cep,
        inscricao_municipal, inscricao_estadual, iss_retido, status, metadata, created_at, updated_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20::jsonb, now(), now()
      )
      returning id
    `, params)
    const cliente = result.rows[0] ?? { id }
    await this.recordIntegrationEvent({
      eventType: 'commercial.customer.saved',
      entityType: 'cadastros_base',
      entityId: cliente.id,
      payload: { cpf_cnpj: input.cpf_cnpj, nome: input.nome },
    })
    return cliente
  }

  async saveValidationAgenda(input: {
    agendaId?: string | null
    vendaId: string
    agente_registro_id: string
    ponto_atendimento_id: string
    data_agendada: string
    tipo_atendimento?: string | null
    observacoes?: string | null
    status_agendamento: string
  }) {
    const agendaId = input.agendaId?.trim() || randomUUID()
    const result = await this.db.query<{ id: string }>(`
      insert into agendamentos_validacao (
        id, venda_certificado_id, cadastro_base_id, empresa_id, titular_id, contador_id,
        agente_registro_id, ponto_atendimento_id, data_agendada,
        tipo_atendimento, observacoes, status_agendamento, metadata, created_at, updated_at
      )
      select
        $1,
        v.id,
        v.cadastro_base_id,
        v.empresa_id,
        v.titular_id,
        v.contador_id,
        $3::uuid,
        $4::uuid,
        $5::timestamptz,
        $6,
        $7,
        $8,
        jsonb_build_object('origem', 'comercial_aiven'),
        now(),
        now()
      from vendas_certificados v
      where v.id = $2
      on conflict (id) do update set
        agente_registro_id = excluded.agente_registro_id,
        ponto_atendimento_id = excluded.ponto_atendimento_id,
        data_agendada = excluded.data_agendada,
        tipo_atendimento = excluded.tipo_atendimento,
        observacoes = excluded.observacoes,
        status_agendamento = excluded.status_agendamento,
        metadata = coalesce(agendamentos_validacao.metadata, '{}'::jsonb) || excluded.metadata,
        updated_at = now()
      returning id
    `, [agendaId, input.vendaId, input.agente_registro_id, input.ponto_atendimento_id, input.data_agendada, input.tipo_atendimento ?? null, input.observacoes ?? null, input.status_agendamento])
    const agenda = result.rows[0] ?? { id: agendaId }
    await this.recordIntegrationEvent({
      eventType: 'commercial.validation_agenda.saved',
      entityType: 'agendamentos_validacao',
      entityId: agenda.id,
      payload: { venda_id: input.vendaId, status_agendamento: input.status_agendamento, data_agendada: input.data_agendada },
    })
    return agenda
  }

  async listAgents() {
    const result = await this.db.query(`
      select id, nome, perfil, status
      from profiles
      where perfil = 'agente_registro'
        and status = 'ativo'
      order by nome asc
    `)
    return result.rows
  }
  async listAllPoints() {
    const result = await this.db.query(`select * from pontos_atendimento order by nome asc`)
    return result.rows
  }

  async savePoint(input: {
    id?: string | null
    nome: string
    codigo?: string | null
    endereco?: string | null
    cidade?: string | null
    uf?: string | null
    status?: string | null
    metadata?: Record<string, unknown> | null
  }) {
    const id = input.id?.trim() || randomUUID()
    const result = await this.db.query<{ id: string }>(`
      insert into pontos_atendimento (id, nome, codigo, endereco, cidade, uf, status, metadata)
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      on conflict (id) do update set
        nome = excluded.nome, codigo = excluded.codigo, endereco = excluded.endereco,
        cidade = excluded.cidade, uf = excluded.uf, status = excluded.status,
        metadata = excluded.metadata, updated_at = now()
      returning id
    `, [id, input.nome, input.codigo ?? null, input.endereco ?? null,
        input.cidade ?? null, input.uf ?? null, input.status ?? 'ativo',
        JSON.stringify(input.metadata ?? {})])
    return result.rows[0] ?? { id }
  }

  async updatePointStatus(id: string, status: string) {
    await this.db.query(`update pontos_atendimento set status = $2, updated_at = now() where id = $1::uuid`, [id, status])
  }

  async listBancos() {
    const result = await this.db.query(`select * from bancos where ativo = true order by codigo asc`)
    return result.rows
  }

  async listCentrosCustos() {
    const result = await this.db.query(`select * from centros_custos where ativo = true order by nome asc`)
    return result.rows
  }

  async listActiveAgents() {
    const result = await this.db.query(`
      select id, nome, perfil, status from profiles
      where perfil in ('admin', 'vendedor', 'agente_registro') and status = 'ativo'
      order by nome asc
    `)
    return result.rows
  }

  async listParceiros() {
    const result = await this.db.query(`select * from parceiros order by created_at desc`)
    return result.rows
  }

  async saveParceiro(input: Record<string, unknown>) {
    const id = (input.id as string | null)?.trim() || randomUUID()
    const fields = [
      'codigo_parceiro','cpf_cnpj','nome','razao_social','nome_fantasia','responsavel',
      'id_local_atendimento','senha_acesso','email_acesso','ddd','telefone','email',
      'email_adicional_1','email_adicional_2','email_adicional_3',
      'cep','logradouro','numero','ibge','complemento','bairro','cidade','estado',
      'observacao','token','inscricao_municipal','inscricao_estadual','tipo_parceiro',
      'data_ativacao','data_desativacao',
      'bloquear_vendas_protocolos','nao_enviar_whatsapp_vendas','nao_enviar_email_vendas',
      'nao_enviar_renovacao_clientes','nao_quero_receber_whatsapp','nao_quero_receber_email',
      'gestor_1_id','gestor_2_id','gestor_3_id','gestor_4_id','gestor_5_id',
      'tipo_conta','banco_id','agencia','agencia_digito','conta','conta_digito','operacao',
      'cnpj_cpf_titular','titular_conta','chave_pix','centro_custo_id',
      'segmento','status','emissoes_mes','receita_mes','desde',
    ]
    const vals = fields.map(f => input[f] ?? null)
    const colList = fields.join(', ')
    const placeholders = fields.map((_, i) => `$${i + 2}`).join(', ')
    const updates = fields.map((f, i) => `${f} = excluded.${f}`).join(', ')
    const result = await this.db.query<{ id: string }>(`
      insert into parceiros (id, ${colList})
      values ($1, ${placeholders})
      on conflict (id) do update set ${updates}, updated_at = now()
      returning id
    `, [id, ...vals])
    return result.rows[0] ?? { id }
  }

  async updateParceiroStatus(id: string, updates: { status: string; segmento: string; data_desativacao: string | null }) {
    await this.db.query(`
      update parceiros set status = $2, segmento = $3, data_desativacao = $4, updated_at = now()
      where id = $1::uuid
    `, [id, updates.status, updates.segmento, updates.data_desativacao])
  }

  async deleteParceiro(id: string) {
    await this.db.query(`delete from parceiros where id = $1::uuid`, [id])
  }

  async countVinculosParceiro(id: string) {
    const result = await this.db.query<{ n: string }>(`
      select count(*)::text as n from vendas_certificados where parceiro_id = $1::uuid
    `, [id])
    return parseInt(result.rows[0]?.n ?? '0', 10)
  }

  async listParceiroAgentes() {
    const result = await this.db.query(`select * from parceiros_agentes_permitidos order by created_at asc`)
    return result.rows
  }

  async saveParceiroAgente(input: {
    parceiro_id: string
    agente_registro_id: string
    ponto_atendimento_id?: string | null
    ativo?: boolean
  }) {
    const result = await this.db.query<{ id: string }>(`
      insert into parceiros_agentes_permitidos (parceiro_id, agente_registro_id, ponto_atendimento_id, ativo, metadata)
      values ($1::uuid, $2::uuid, $3::uuid, $4, '{}'::jsonb)
      returning id
    `, [input.parceiro_id, input.agente_registro_id, input.ponto_atendimento_id ?? null, input.ativo ?? true])
    return result.rows[0]
  }

  async toggleParceiroAgente(id: string, ativo: boolean) {
    await this.db.query(`update parceiros_agentes_permitidos set ativo = $2, updated_at = now() where id = $1::uuid`, [id, ativo])
  }

  async deleteParceiroAgente(id: string) {
    await this.db.query(`delete from parceiros_agentes_permitidos where id = $1::uuid`, [id])
  }

  private async recordIntegrationEvent(input: {
    eventType: string
    entityType: string
    entityId: string
    payload?: Record<string, unknown>
    metadata?: Record<string, unknown>
  }) {
    await this.db.query(`
      insert into integration_events (
        domain, provider, direction, event_type, status,
        entity_type, entity_id, payload, metadata, created_at, updated_at
      ) values (
        'automation', 'n8n', 'outbound', $1, 'queued',
        $2, $3, $4::jsonb, $5::jsonb, now(), now()
      )
    `, [
      input.eventType,
      input.entityType,
      input.entityId,
      JSON.stringify(input.payload ?? {}),
      JSON.stringify(input.metadata ?? { origem: 'comercial_aiven' }),
    ])
  }
}




