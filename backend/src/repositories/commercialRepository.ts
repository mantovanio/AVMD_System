import { randomUUID } from 'node:crypto'
import type { AivenSqlClient } from '../db/aivenClient.js'

export type CommercialSalesInput = {
  limit?: number
  dateFrom?: string | null
  dateTo?: string | null
  documento?: string | null
  viewer_profile_id?: string | null
  viewer_perfil?: string | null
}

export type CommercialAgendaInput = {
  dataBase?: string | null
  status?: string | null
  agenteId?: string | null
  viewer_profile_id?: string | null
  viewer_perfil?: string | null
}

export type UpdateCommercialSaleStatusInput = {
  id: string
  status: string
}

export type UpdateCommercialSalePaymentStatusInput = {
  id: string
  status: 'em_aberto' | 'pago' | 'recusado' | 'estornado' | 'cortesia'
}

export type UpdateCommercialSalePaymentMethodInput = {
  id: string
  forma_pagamento_id: string
  admin_profile_id: string
  payment_installments?: number | null
}

export type UpdateVendaInput = {
  id: string
  tipo_produto?: string
  tipo_venda?: string
  tipo_emissao?: string
  tabela_preco_id?: string
  tabela_preco_item_id?: string
  forma_pagamento_id?: string
  valor_venda?: number
  desconto?: number
  observacoes?: string
  data_vencimento?: string
  vendedor_id?: string | null
  contador_id?: string | null
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


type VendaRemuneracaoContext = {
  valor_venda: number | null
  cpf_cnpj: string | null
  metadata: Record<string, unknown> | null
}

type RemuneracaoSnapshot = {
  regra_id: string
  escopo: string
  tipo_calculo: 'fixa' | 'percentual'
  documento_tipo: 'geral' | 'cpf' | 'cnpj'
  valor_regra: number
  valor_calculado: number
  base_calculo: number
}

export class CommercialRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async listSales(input: CommercialSalesInput = {}) {
    const limit = Math.min(Math.max(Number(input.limit || 2000), 1), 5000)
    const params: unknown[] = []
    const where: string[] = []
    const documento = String(input.documento ?? '').replace(/\D/g, '')
    if (input.dateFrom) {
      params.push(input.dateFrom)
      where.push(`coalesce(v.data_inicio_validade::date, v.created_at::date) >= $${params.length}::date`)
    }
    if (input.dateTo) {
      params.push(input.dateTo)
      where.push(`coalesce(v.data_inicio_validade::date, v.created_at::date) <= $${params.length}::date`)
    }
    if (documento) {
      params.push(documento)
      where.push(`(
        regexp_replace(coalesce(v.documento_faturamento, ''), '\\D', '', 'g') = $${params.length}
        or regexp_replace(coalesce(cb.cpf_cnpj, ''), '\\D', '', 'g') = $${params.length}
        or regexp_replace(coalesce(v.metadata->'safeweb_financeiro'->>'documento', ''), '\\D', '', 'g') = $${params.length}
      )`)
    }
    const viewerId = input.viewer_profile_id
    const viewerPerfil = input.viewer_perfil
    if (viewerId && viewerPerfil && !['admin', 'superadmin'].includes(viewerPerfil)) {
      params.push(viewerId)
      where.push(`(v.vendedor_id::text = $${params.length} OR v.agente_registro_id::text = $${params.length})`)
    }
    params.push(limit)
    const result = await this.db.query(`
      select
        v.*,
        case when cb.id is null then null else jsonb_build_object('nome', cb.nome, 'cpf_cnpj', cb.cpf_cnpj) end as cadastros_base,
        case when pa.id is null then null else jsonb_build_object('nome', pa.nome) end as pontos_atendimento
      from vendas_certificados v
      left join cadastros_base cb on cb.id = v.cadastro_base_id
      left join pontos_atendimento pa on pa.id = v.ponto_atendimento_id
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by coalesce(v.data_inicio_validade::date, v.created_at::date) desc, v.created_at desc
      limit $${params.length}
    `, params)
    return result.rows
  }

  async listSalesByDocumento(documento: string, input: { viewer_profile_id?: string | null; viewer_perfil?: string | null; limit?: number } = {}) {
    return this.listSales({
      documento,
      viewer_profile_id: input.viewer_profile_id ?? null,
      viewer_perfil: input.viewer_perfil ?? null,
      limit: input.limit ?? 500,
    })
  }

  async getSaleById(id: string) {
    const result = await this.db.query(`
      select
        v.*,
        case when cb.id is null then null else jsonb_build_object('nome', cb.nome, 'cpf_cnpj', cb.cpf_cnpj) end as cadastros_base,
        case when pa.id is null then null else jsonb_build_object('nome', pa.nome) end as pontos_atendimento
      from vendas_certificados v
      left join cadastros_base cb on cb.id = v.cadastro_base_id
      left join pontos_atendimento pa on pa.id = v.ponto_atendimento_id
      where v.id = $1::uuid
      limit 1
    `, [id])
    return result.rows[0] ?? null
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

  async updateSalePaymentStatus(input: UpdateCommercialSalePaymentStatusInput) {
    const result = await this.db.query<{ id: string; status_pagamento: string }>(`
      update vendas_certificados
      set status_pagamento = $2,
          updated_at = now()
      where id = $1
      returning id, status_pagamento
    `, [input.id, input.status])
    const venda = result.rows[0] ?? null
    if (venda?.id) {
      await this.recordIntegrationEvent({
        eventType: 'commercial.sale.payment_status.updated',
        entityType: 'vendas_certificados',
        entityId: venda.id,
        payload: { status_pagamento: venda.status_pagamento },
      })
    }
    return venda
  }

  async updateSalePaymentMethod(input: UpdateCommercialSalePaymentMethodInput) {
    const admin = await this.db.query<{ id: string }>(`
      select id from profiles
      where id = $1::uuid and perfil = 'admin' and status = 'ativo'
      limit 1
    `, [input.admin_profile_id])
    if (!admin.rows[0]) throw new Error('Apenas administradores podem alterar a forma de pagamento.')

    const currentSale = await this.db.query<{ pago: boolean | null; status_pagamento: string | null }>(`
      select pago, status_pagamento
      from vendas_certificados
      where id = $1::uuid
      limit 1
    `, [input.id])
    const sale = currentSale.rows[0] ?? null
    if (!sale) throw new Error('Venda não encontrada.')
    if (sale.pago || sale.status_pagamento === 'pago') {
      throw new Error('Não é possível alterar a forma de pagamento de uma venda já paga.')
    }

    const settings = await this.db.query<{ gateway: string | null }>(`
      select coalesce(s.value->>'default_method_id', method->>'id') as gateway
      from app_settings s
      left join lateral jsonb_array_elements(coalesce(s.value->'methods', '[]'::jsonb)) method
        on method->>'is_default' = 'true'
      where s.key = 'payment_methods'
      limit 1
    `)
    const gateway = settings.rows[0]?.gateway ?? null
    const installments = input.payment_installments
      ? Math.max(1, Math.min(12, Number(input.payment_installments)))
      : null

    const result = await this.db.query<Record<string, unknown>>(`
      update vendas_certificados venda
      set forma_pagamento_id = forma.id,
          status_pagamento = 'em_aberto',
          pago = false,
          data_pagamento = null,
          metadata = coalesce(venda.metadata, '{}'::jsonb) || jsonb_build_object(
            'forma_pagamento', forma.nome,
            'payment_method_id', forma.gateway,
            'payment_method_label', forma.nome,
            'payment_installments',
              case
                when $5::int is null then null
                else $5::int
              end,
            'forma_pagamento_alterada_por', $3::uuid,
            'forma_pagamento_alterada_em', now(),
            'payment_charge_history',
              case
                when venda.metadata->'payment_charge' is null then coalesce(venda.metadata->'payment_charge_history', '[]'::jsonb)
                else coalesce(venda.metadata->'payment_charge_history', '[]'::jsonb)
                  || jsonb_build_array(
                    (venda.metadata->'payment_charge') || jsonb_build_object(
                      'status', 'substituido',
                      'substituido_em', now(),
                      'substituido_por', $3::uuid,
                      'nova_forma_pagamento_id', $2::text
                    )
                  )
              end,
            'payment_charge',
              case
                when venda.metadata->'payment_charge' is null then null
                else (venda.metadata->'payment_charge') || jsonb_build_object(
                  'status', 'substituido',
                  'substituido_em', now(),
                  'substituido_por', $3::uuid,
                  'nova_forma_pagamento_id', $2::text
                )
              end
          ),
          updated_at = now()
      from formas_pagamento_v2 forma
      where venda.id = $1::uuid
        and forma.id = $2::uuid
        and forma.ativo = true
        and ($4::text is null or forma.gateway = $4::text)
      returning venda.*
    `, [input.id, input.forma_pagamento_id, input.admin_profile_id, gateway, installments])
    const venda = result.rows[0] ?? null
    if (venda) {
      await this.recordIntegrationEvent({
        eventType: 'commercial.sale.payment_method.updated',
        entityType: 'vendas_certificados',
        entityId: String(venda.id),
        payload: {
          forma_pagamento_id: input.forma_pagamento_id,
          admin_profile_id: input.admin_profile_id,
          status_pagamento: 'em_aberto',
        },
      })
    }
    return venda
  }

  async updateVenda(input: UpdateVendaInput) {
    const allowedFields = [
      'tipo_produto', 'tipo_venda', 'tipo_emissao',
      'tabela_preco_id', 'tabela_preco_item_id', 'forma_pagamento_id',
      'valor_venda', 'desconto', 'observacoes', 'data_vencimento',
      'vendedor_id', 'contador_id',
    ] as const
    const setClauses: string[] = []
    const params: unknown[] = [input.id]
    let idx = 2
    for (const field of allowedFields) {
      const value = (input as Record<string, unknown>)[field]
      if (value !== undefined) {
        setClauses.push(`${field} = $${idx}`)
        params.push(value)
        idx++
      }
    }
    if (setClauses.length === 0) throw new Error('Nenhum campo para atualizar.')
    setClauses.push('updated_at = now()')
    const result = await this.db.query<Record<string, unknown>>(
      `update vendas_certificados set ${setClauses.join(', ')} where id = $1 returning *`,
      params,
    )
    return result.rows[0] ?? null
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

    const viewerId = input.viewer_profile_id
    const viewerPerfil = input.viewer_perfil
    if (viewerId && viewerPerfil && !['admin', 'superadmin'].includes(viewerPerfil)) {
      params.push(viewerId)
      filters.push(`a.agente_registro_id::text = $${params.length}`)
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

  async listCustomers(input?: {
    page?: number
    pageSize?: number
    search?: string
    filterTipo?: string | null
    filterStatus?: string | null
    viewer_profile_id?: string | null
    viewer_perfil?: string | null
  }) {
    const page = Math.max(0, Number(input?.page ?? 0) || 0)
    const rawPageSize = Number(input?.pageSize ?? 50) || 50
    const pageSize = Math.min(200, Math.max(1, rawPageSize))
    const offset = page * pageSize
    const search = String(input?.search ?? '').trim().toLowerCase()
    const filterTipo = String(input?.filterTipo ?? '').trim()
    const filterStatus = String(input?.filterStatus ?? '').trim()

    const where: string[] = []
    const params: unknown[] = []

    const viewerId = input?.viewer_profile_id
    const viewerPerfil = input?.viewer_perfil
    if (viewerId && viewerPerfil && !['admin', 'superadmin'].includes(viewerPerfil)) {
      params.push(viewerId)
      where.push(`cb_sub.id IN (
        SELECT DISTINCT vc.cadastro_base_id
        FROM vendas_certificados vc
        WHERE vc.cadastro_base_id IS NOT NULL
          AND (vc.vendedor_id::text = $${params.length} OR vc.agente_registro_id::text = $${params.length})
      )`)
    }

    if (search) {
      params.push(`%${search}%`)
      const p = `$${params.length}`
      where.push(`(
        lower(coalesce(cb_sub.nome, '')) like ${p}
        or lower(coalesce(cb_sub.cpf_cnpj, '')) like ${p}
        or lower(coalesce(cb_sub.nome_fantasia, '')) like ${p}
      )`)
    }

    if (filterTipo) {
      params.push(filterTipo)
      where.push(`cb_sub.tipo_cliente = $${params.length}`)
    }

    if (filterStatus) {
      params.push(filterStatus)
      where.push(`cb_sub.status = $${params.length}`)
    }

    const whereSql = where.length ? `where ${where.join(' and ')}` : ''

    const countResult = await this.db.query<{ total: string }>(
      `select count(*)::text as total
       from cadastros_base cb_sub
       ${whereSql}`,
      params,
    )

    const listParams = [...params, pageSize, offset]
    const limitPlaceholder = `$${listParams.length - 1}`
    const offsetPlaceholder = `$${listParams.length}`
    const result = await this.db.query(
      `select cb_sub.*
       from cadastros_base cb_sub
       ${whereSql}
       order by cb_sub.nome asc
       limit ${limitPlaceholder}
       offset ${offsetPlaceholder}`,
      listParams,
    )

    return {
      clientes: result.rows,
      total: Number(countResult.rows[0]?.total ?? '0'),
    }
  }

  async importCustomers(items: Array<{
    tipo_cliente?: string | null
    data_nascimento?: string | null
    tipo_cadastro?: string | null
    documento?: string | null
    documento_titular?: string | null
    cpf_cnpj?: string | null
    cpf?: string | null
    cnpj?: string | null
    nome?: string | null
    razao_social?: string | null
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
    pedido?: string | null
    protocolo?: string | null
    produto?: string | null
    tipo?: string | null
    validade?: string | null
    vencimento?: string | null
    atendente?: string | null
    ponto?: string | null
    vendedor?: string | null
    status_pedido?: string | null
    valor_compra?: string | number | null
    ar?: string | null
    iss_retido?: boolean | null
    status?: string | null
  }>) {
    type CompraHistoricoItem = {
      imported_at: string
      documento_titular: string | null
      pedido: string | null
      protocolo: string | null
      produto: string | null
      tipo: string | null
      validade: string | null
      vencimento: string | null
      atendente: string | null
      ponto: string | null
      vendedor: string | null
      status_pedido: string | null
      valor_compra: number | null
      ar: string | null
      import_key: string
    }

    const parseDate = (value: unknown): string | null => {
      const raw = String(value ?? '').trim().replace(/^"|"$/g, '')
      if (!raw) return null

      // ISO com ou sem hora: 2026-07-02 ou 2026-07-02 18:58:14
      const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
      if (isoMatch) {
        const [, y, m, d] = isoMatch
        return `${y}-${m}-${d}`
      }

      // BR/legado com separador / ou - e opcional hora: 11/02/2025 18:58:14
      const brMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/)
      if (brMatch) {
        const [, d, m, y] = brMatch
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
      }

      // Formato observado em erro: 2025 18:58:14-11-02
      const weirdMatch = raw.match(/^(\d{4})\s+\d{1,2}:\d{2}:\d{2}-(\d{1,2})-(\d{1,2})$/)
      if (weirdMatch) {
        const [, y, m, d] = weirdMatch
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
      }

      // Serial do Excel (dias desde 1899-12-30)
      const serial = Number(raw)
      if (!Number.isNaN(serial) && serial > 40000 && serial < 60000) {
        return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
      }

      // Evita quebrar INSERT/UPDATE DATE com string inválida.
      return null
    }

    const parseCurrency = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') return null
      if (typeof value === 'number') return Number.isFinite(value) ? value : null
      const raw = String(value).trim()
      if (!raw) return null
      const normalized = raw.includes(',')
        ? raw.replace(/\./g, '').replace(',', '.')
        : raw
      const parsed = Number(normalized)
      return Number.isFinite(parsed) ? parsed : null
    }

    const pick = (current: string | null, next: string | null) => next ?? current
    const firstNonEmpty = (...values: Array<unknown>) => {
      for (const value of values) {
        const text = String(value ?? '').trim()
        if (text) return text
      }
      return ''
    }

    const normalizeKeyPart = (value: unknown) => String(value ?? '').trim().toLowerCase()

    const buildCompraImportKey = (item: {
      documento_titular?: string | null
      pedido?: string | null
      protocolo?: string | null
      produto?: string | null
      tipo?: string | null
      validade?: string | null
      vencimento?: string | null
      valor_compra?: number | null
    }) => {
      const valor = item.valor_compra === null || item.valor_compra === undefined
        ? ''
        : Number(item.valor_compra).toFixed(2)
      return [
        normalizeKeyPart(item.documento_titular),
        normalizeKeyPart(item.pedido),
        normalizeKeyPart(item.protocolo),
        normalizeKeyPart(item.produto),
        normalizeKeyPart(item.tipo),
        normalizeKeyPart(item.validade),
        normalizeKeyPart(item.vencimento),
        normalizeKeyPart(valor),
      ].join('|')
    }

    const buildImportMetadata = (payload: {
      cpf_cnpj: string
      data_nascimento: string | null
      documento_titular: string | null
      pedido: string | null
      protocolo: string | null
      produto: string | null
      tipo: string | null
      validade: string | null
      vencimento: string | null
      atendente: string | null
      ponto: string | null
      vendedor: string | null
      status_pedido: string | null
      valor_compra: number | null
      ar: string | null
      compras_historico: CompraHistoricoItem[]
    }) => JSON.stringify({
      imported_via: 'clientes.import',
      imported_at: new Date().toISOString(),
      data_nascimento: payload.data_nascimento,
      documento_principal: payload.cpf_cnpj,
      documento_titular: payload.documento_titular,
      pedido: payload.pedido,
      protocolo: payload.protocolo,
      produto: payload.produto,
      tipo: payload.tipo,
      validade: payload.validade,
      vencimento: payload.vencimento,
      atendente: payload.atendente,
      ponto: payload.ponto,
      vendedor: payload.vendedor,
      status_pedido: payload.status_pedido,
      valor_compra: payload.valor_compra,
      ar: payload.ar,
      compras_historico: payload.compras_historico,
    })

    const erros: { linha: number; motivo: string; cpf_cnpj?: string; nome?: string }[] = []
    let ignoradosSemDocumento = 0
    let ignoradosSemNome = 0
    let ignoradosDuplicidadeHistorico = 0
    const byDoc = new Map<string, {
      tipo_cliente: string
      tipo_cadastro: string
      cpf_cnpj: string
      nome: string
      data_nascimento: string | null
      razao_social: string | null
      nome_fantasia: string | null
      email: string | null
      telefone: string | null
      cidade: string | null
      logradouro: string | null
      numero: string | null
      complemento: string | null
      bairro: string | null
      uf: string | null
      cep: string | null
      inscricao_municipal: string | null
      inscricao_estadual: string | null
      iss_retido: boolean
      status: string
      metadata: string
      pedido: string | null
      protocolo: string | null
      produto: string | null
      tipo: string | null
      validade: string | null
      vencimento: string | null
      atendente: string | null
      ponto: string | null
      vendedor: string | null
      status_pedido: string | null
      valor_compra: number | null
      ar: string | null
      documento_titular: string | null
      compras_historico: CompraHistoricoItem[]
      compras_historico_keys: Set<string>
    }>()

    for (let i = 0; i < items.length; i++) {
      const item = items[i] ?? {}
      const docPrincipal = firstNonEmpty(item.documento, item.cpf_cnpj, item.cpf, item.cnpj).replace(/\D/g, '')
      const docTitular = firstNonEmpty(item.documento_titular).replace(/\D/g, '')
      const doc = docPrincipal
      const nome = String(item.nome ?? item.razao_social ?? '').trim()
      if (!doc) {
        ignoradosSemDocumento++
        erros.push({ linha: i + 1, motivo: 'CPF/CNPJ ausente', nome: nome || undefined })
        continue
      }
      if (!nome) {
        ignoradosSemNome++
        erros.push({ linha: i + 1, motivo: 'Nome ausente', cpf_cnpj: doc })
        continue
      }

      const tipoClienteRaw = String(item.tipo_cliente ?? '').toLowerCase()
      const tipo_cliente = tipoClienteRaw.includes('jur') || tipoClienteRaw === 'pj' || doc.length === 14
        ? 'pessoa_juridica'
        : 'pessoa_fisica'
      const data_nascimento = parseDate(item.data_nascimento)

      const pedido = String(item.pedido ?? '').trim() || null
      const protocolo = String(item.protocolo ?? '').trim() || null
      const produto = String(item.produto ?? '').trim() || null
      const tipo = String(item.tipo ?? '').trim() || null
      const validade = parseDate(item.validade)
      const vencimento = parseDate(item.vencimento)
      const atendente = String(item.atendente ?? '').trim() || null
      const ponto = String(item.ponto ?? '').trim() || null
      const vendedor = String(item.vendedor ?? '').trim() || null
      const status_pedido = String(item.status_pedido ?? '').trim() || null
      const valor_compra = parseCurrency(item.valor_compra)
      const ar = String(item.ar ?? '').trim() || null

      const compraBase = {
        documento_titular: docTitular || (doc.length === 11 ? doc : null),
        pedido,
        protocolo,
        produto,
        tipo,
        validade,
        vencimento,
        valor_compra,
      }
      const compraImportKey = buildCompraImportKey(compraBase)
      const compraEvento: CompraHistoricoItem = {
        imported_at: new Date().toISOString(),
        ...compraBase,
        pedido,
        protocolo,
        produto,
        tipo,
        validade,
        vencimento,
        atendente,
        ponto,
        vendedor,
        status_pedido,
        valor_compra,
        ar,
        import_key: compraImportKey,
      }

      const existente = byDoc.get(doc)
      if (existente) {
        existente.nome = pick(existente.nome, nome) ?? existente.nome
        existente.data_nascimento = pick(existente.data_nascimento, data_nascimento)
        existente.razao_social = pick(existente.razao_social, String(item.razao_social ?? '').trim() || null)
        existente.nome_fantasia = pick(existente.nome_fantasia, String(item.nome_fantasia ?? '').trim() || null)
        existente.email = pick(existente.email, String(item.email ?? '').trim() || null)
        existente.telefone = pick(existente.telefone, String(item.telefone ?? '').trim() || null)
        existente.cidade = pick(existente.cidade, String(item.cidade ?? '').trim() || null)
        existente.logradouro = pick(existente.logradouro, String(item.logradouro ?? '').trim() || null)
        existente.numero = pick(existente.numero, String(item.numero ?? '').trim() || null)
        existente.complemento = pick(existente.complemento, String(item.complemento ?? '').trim() || null)
        existente.bairro = pick(existente.bairro, String(item.bairro ?? '').trim() || null)
        existente.uf = pick(existente.uf, String(item.uf ?? '').trim().toUpperCase() || null)
        existente.cep = pick(existente.cep, String(item.cep ?? '').trim() || null)
        existente.inscricao_municipal = pick(existente.inscricao_municipal, String(item.inscricao_municipal ?? '').trim() || null)
        existente.inscricao_estadual = pick(existente.inscricao_estadual, String(item.inscricao_estadual ?? '').trim() || null)
        existente.status = pick(existente.status, String(item.status ?? '').trim() || null) ?? existente.status
        existente.pedido = pick(existente.pedido, pedido)
        existente.protocolo = pick(existente.protocolo, protocolo)
        existente.produto = pick(existente.produto, produto)
        existente.tipo = pick(existente.tipo, tipo)
        existente.validade = pick(existente.validade, validade)
        existente.vencimento = pick(existente.vencimento, vencimento)
        existente.atendente = pick(existente.atendente, atendente)
        existente.ponto = pick(existente.ponto, ponto)
        existente.vendedor = pick(existente.vendedor, vendedor)
        existente.status_pedido = pick(existente.status_pedido, status_pedido)
        existente.valor_compra = valor_compra ?? existente.valor_compra
        existente.ar = pick(existente.ar, ar)
        existente.documento_titular = pick(existente.documento_titular, docTitular || null)
        const hasData = compraEvento.pedido || compraEvento.protocolo || compraEvento.produto || compraEvento.vencimento || compraEvento.valor_compra !== null
        if (hasData && !existente.compras_historico_keys.has(compraImportKey)) {
          existente.compras_historico.push(compraEvento)
          existente.compras_historico_keys.add(compraImportKey)
        } else if (hasData) {
          ignoradosDuplicidadeHistorico++
        }
        continue
      }

      const hasData = compraEvento.pedido || compraEvento.protocolo || compraEvento.produto || compraEvento.vencimento || compraEvento.valor_compra !== null
      const comprasHistorico = hasData ? [compraEvento] : []
      const comprasHistoricoKeys = new Set<string>(hasData ? [compraImportKey] : [])

      byDoc.set(doc, {
        tipo_cliente,
        tipo_cadastro: String(item.tipo_cadastro ?? 'cliente').trim() || 'cliente',
        cpf_cnpj: doc,
        nome,
        data_nascimento,
        razao_social: String(item.razao_social ?? '').trim() || null,
        nome_fantasia: String(item.nome_fantasia ?? '').trim() || null,
        email: String(item.email ?? '').trim() || null,
        telefone: String(item.telefone ?? '').trim() || null,
        cidade: String(item.cidade ?? '').trim() || null,
        logradouro: String(item.logradouro ?? '').trim() || null,
        numero: String(item.numero ?? '').trim() || null,
        complemento: String(item.complemento ?? '').trim() || null,
        bairro: String(item.bairro ?? '').trim() || null,
        uf: String(item.uf ?? '').trim().toUpperCase() || null,
        cep: String(item.cep ?? '').trim() || null,
        inscricao_municipal: String(item.inscricao_municipal ?? '').trim() || null,
        inscricao_estadual: String(item.inscricao_estadual ?? '').trim() || null,
        iss_retido: Boolean(item.iss_retido),
        status: String(item.status ?? 'ativo').trim() || 'ativo',
        metadata: buildImportMetadata({
          cpf_cnpj: doc,
          data_nascimento,
          documento_titular: docTitular || (doc.length === 11 ? doc : null),
          pedido,
          protocolo,
          produto,
          tipo,
          validade,
          vencimento,
          atendente,
          ponto,
          vendedor,
          status_pedido,
          valor_compra,
          ar,
          compras_historico: comprasHistorico,
        }),
        pedido,
        protocolo,
        produto,
        tipo,
        validade,
        vencimento,
        atendente,
        ponto,
        vendedor,
        status_pedido,
        valor_compra,
        ar,
        documento_titular: docTitular || (doc.length === 11 ? doc : null),
        compras_historico: comprasHistorico,
        compras_historico_keys: comprasHistoricoKeys,
      })
    }

    for (const payload of byDoc.values()) {
      payload.metadata = buildImportMetadata(payload)
    }

    const payloads = [...byDoc.values()]
    if (!payloads.length) {
      return { criados: 0, atualizados: 0, ignorados: erros.length, erros }
    }

    const docs = payloads.map(p => p.cpf_cnpj)
    const existingResult = await this.db.query<{ cpf_cnpj: string; metadata: unknown }>(
      `select cpf_cnpj, metadata from cadastros_base where cpf_cnpj = any($1::text[])`,
      [docs],
    )
    const existingSet = new Set(existingResult.rows.map(r => r.cpf_cnpj))
    const criados = payloads.filter(p => !existingSet.has(p.cpf_cnpj)).length
    const atualizados = payloads.length - criados

    const existingPayloads = payloads.filter(p => existingSet.has(p.cpf_cnpj))
    const newPayloads = payloads.filter(p => !existingSet.has(p.cpf_cnpj))

    const existingCompraKeysByDoc = new Map<string, Set<string>>()
    for (const row of existingResult.rows) {
      const metadata = this.asObject(row.metadata)
      const compras = Array.isArray(metadata.compras_historico) ? metadata.compras_historico : []
      const keys = new Set<string>()
      for (const compra of compras) {
        if (!compra || typeof compra !== 'object') continue
        const entry = compra as Record<string, unknown>
        const key = String(entry.import_key ?? '').trim() || buildCompraImportKey({
          documento_titular: typeof entry.documento_titular === 'string' ? entry.documento_titular : null,
          pedido: typeof entry.pedido === 'string' ? entry.pedido : null,
          protocolo: typeof entry.protocolo === 'string' ? entry.protocolo : null,
          produto: typeof entry.produto === 'string' ? entry.produto : null,
          tipo: typeof entry.tipo === 'string' ? entry.tipo : null,
          validade: typeof entry.validade === 'string' ? entry.validade : null,
          vencimento: typeof entry.vencimento === 'string' ? entry.vencimento : null,
          valor_compra: typeof entry.valor_compra === 'number' ? entry.valor_compra : parseCurrency(entry.valor_compra),
        })
        keys.add(key)
      }
      existingCompraKeysByDoc.set(row.cpf_cnpj, keys)
    }

    for (const item of existingPayloads) {
      const existingKeys = existingCompraKeysByDoc.get(item.cpf_cnpj) ?? new Set<string>()
      const beforeCount = item.compras_historico.length
      item.compras_historico = item.compras_historico.filter(compra => {
        const key = compra.import_key || buildCompraImportKey(compra)
        if (!key || existingKeys.has(key)) return false
        existingKeys.add(key)
        return true
      })
      ignoradosDuplicidadeHistorico += beforeCount - item.compras_historico.length
      item.compras_historico_keys = existingKeys
      item.metadata = buildImportMetadata(item)
    }

    for (const item of existingPayloads) {
      await this.db.query(
        `update cadastros_base
         set tipo_cliente = $1,
             tipo_cadastro = $2,
             nome = $4,
             nome_fantasia = $5,
             email = $6,
             telefone = $7,
             cidade = $8,
             logradouro = $9,
             numero = $10,
             complemento = $11,
             bairro = $12,
             uf = $13,
             cep = $14,
             inscricao_municipal = $15,
             inscricao_estadual = $16,
             iss_retido = $17,
             status = $18,
             metadata =
               (coalesce(metadata, '{}'::jsonb) - 'compras_historico')
               || ($19::jsonb - 'compras_historico')
               || jsonb_build_object(
                 'compras_historico',
                 coalesce(metadata -> 'compras_historico', '[]'::jsonb)
                 || coalesce($19::jsonb -> 'compras_historico', '[]'::jsonb)
               ),
             updated_at = now()
         where cpf_cnpj = $3`,
        [
          item.tipo_cliente,
          item.tipo_cadastro,
          item.cpf_cnpj,
          item.nome,
          item.nome_fantasia,
          item.email,
          item.telefone,
          item.cidade,
          item.logradouro,
          item.numero,
          item.complemento,
          item.bairro,
          item.uf,
          item.cep,
          item.inscricao_municipal,
          item.inscricao_estadual,
          item.iss_retido,
          item.status,
          item.metadata,
        ],
      )
    }

    const chunkSize = 300
    for (let start = 0; start < newPayloads.length; start += chunkSize) {
      const chunk = newPayloads.slice(start, start + chunkSize)
      const params: unknown[] = []
      const valuesSql: string[] = []

      for (const item of chunk) {
        const base = params.length
        params.push(
          randomUUID(),
          item.tipo_cliente,
          item.tipo_cadastro,
          item.cpf_cnpj,
          item.nome,
          item.nome_fantasia,
          item.email,
          item.telefone,
          item.cidade,
          item.logradouro,
          item.numero,
          item.complemento,
          item.bairro,
          item.uf,
          item.cep,
          item.inscricao_municipal,
          item.inscricao_estadual,
          item.iss_retido,
          item.status,
          item.metadata,
        )
        const placeholders = Array.from({ length: 20 }, (_, i) => `$${base + i + 1}`).join(', ')
        valuesSql.push(`(${placeholders})`)
      }

      await this.db.query(
        `insert into cadastros_base (
          id, tipo_cliente, tipo_cadastro, cpf_cnpj, nome, nome_fantasia, email, telefone,
          cidade, logradouro, numero, complemento, bairro, uf, cep,
          inscricao_municipal, inscricao_estadual, iss_retido, status, metadata
        ) values ${valuesSql.join(', ')}`,
        params,
      )
    }

    for (const item of payloads) {
      const dataVencimento = item.vencimento ?? item.validade
      const tipoCertificado = item.produto ?? item.tipo ?? 'Não especificado'
      const precisaUpsertRenovacao = Boolean(item.protocolo || item.pedido || dataVencimento || item.produto || item.valor_compra)
      if (!precisaUpsertRenovacao || !dataVencimento) continue

      const existingRenovacao = await this.db.query<{ id: string }>(
        `select id
         from renovacoes
         where deleted_at is null
           and (
             ($1::text is not null and protocolo = $1)
             or ($2::text is not null and pedido = $2)
             or ((cpf = $3 and $3 <> '') or (cnpj = $3 and $3 <> '')) and data_vencimento = $4::date
           )
         order by
           case
             when $1::text is not null and protocolo = $1 then 0
             when $2::text is not null and pedido = $2 then 1
             when ((cpf = $3 and $3 <> '') or (cnpj = $3 and $3 <> '')) and data_vencimento = $4::date then 2
             else 3
           end,
           updated_at desc
         limit 1`,
        [item.protocolo, item.pedido, item.cpf_cnpj, dataVencimento],
      )

      const snapshot = JSON.stringify({
        status_pedido: item.status_pedido,
        atendente: item.atendente,
        ponto: item.ponto,
        ar: item.ar,
          documento_titular: item.documento_titular,
      })

      if (existingRenovacao.rows[0]?.id) {
        await this.db.query(
          `update renovacoes
           set pedido = $2,
               protocolo = coalesce(nullif($3, ''), protocolo),
               data_vencimento = coalesce($4::date, data_vencimento),
               cliente = coalesce(nullif($5, ''), cliente),
               email = coalesce(nullif($6, ''), email),
               telefone = coalesce(nullif($7, ''), telefone),
               tipo_certificado = coalesce(nullif($8, ''), tipo_certificado),
               valor = coalesce($9, valor),
               cpf = case when length($16) = 11 then $16 when length($10) = 11 then $10 else cpf end,
               cnpj = case when length($10) = 14 then $10 else cnpj end,
               razao_social = coalesce(nullif($11, ''), razao_social),
               agr = coalesce(nullif($12, ''), nullif($13, ''), agr),
               vendedor = coalesce(nullif($14, ''), vendedor),
               snapshot_json = coalesce(snapshot_json, '{}'::jsonb) || $15::jsonb,
               updated_at = now()
           where id = $1::uuid`,
          [
            existingRenovacao.rows[0].id,
            item.pedido,
            item.protocolo,
            dataVencimento,
            item.nome,
            item.email,
            item.telefone,
            tipoCertificado,
            item.valor_compra,
            item.cpf_cnpj,
            item.razao_social,
            item.ar,
            item.ponto,
            item.vendedor,
            snapshot,
            item.documento_titular,
          ],
        )
      } else {
        await this.db.query(
          `insert into renovacoes (
            id, pedido, protocolo, data_vencimento, cliente, email, telefone,
            tipo_certificado, valor, status, renovado, observacoes,
            cpf, cnpj, razao_social, agr, vendedor, contador, snapshot_json
          ) values (
            $1::uuid, $2, $3, $4::date, $5, $6, $7,
            $8, $9, 'pendente', false, null,
            $10, $11, $12, $13, $14, $15, $16::jsonb
          )`,
          [
            randomUUID(),
            item.pedido,
            item.protocolo,
            dataVencimento,
            item.nome,
            item.email,
            item.telefone,
            tipoCertificado,
            item.valor_compra,
            item.documento_titular?.length === 11 ? item.documento_titular : (item.cpf_cnpj.length === 11 ? item.cpf_cnpj : null),
            item.cpf_cnpj.length === 14 ? item.cpf_cnpj : null,
            item.razao_social,
            item.ar ?? item.ponto,
            item.vendedor,
            item.atendente,
            snapshot,
          ],
        )
      }
    }

    return {
      criados,
      atualizados,
      ignorados: erros.length,
      ignorados_duplicidade: ignoradosDuplicidadeHistorico,
      resumo_ignorados: {
        sem_documento: ignoradosSemDocumento,
        sem_nome: ignoradosSemNome,
        duplicidade_historico: ignoradosDuplicidadeHistorico,
      },
      erros,
    }
  }

  async getCustomerPortalAccess(customerId: string) {
    const result = await this.db.query<{
      profile_id: string
      clerk_user_id: string | null
      nome: string
      email: string | null
      status: string
      tipo_vinculo: string | null
    }>(`
      select
        p.id::text as profile_id,
        p.clerk_user_id,
        p.nome,
        p.email,
        p.status,
        p.tipo_vinculo
      from cadastros_base cb
      join profiles p on p.tipo_vinculo = 'cliente_portal'
       and (
         (cb.email is not null and lower(coalesce(p.email, '')) = lower(cb.email))
         or regexp_replace(coalesce(p.documento, ''), '\D', '', 'g') = regexp_replace(coalesce(cb.cpf_cnpj, ''), '\D', '', 'g')
         or right(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g'), 11) = right(regexp_replace(coalesce(cb.telefone, ''), '\D', '', 'g'), 11)
       )
      where cb.id = $1::uuid
      order by
        case when cb.email is not null and lower(coalesce(p.email, '')) = lower(cb.email) then 0 else 1 end,
        case when regexp_replace(coalesce(p.documento, ''), '\D', '', 'g') = regexp_replace(coalesce(cb.cpf_cnpj, ''), '\D', '', 'g') then 0 else 1 end
      limit 1
    `, [customerId])
    return result.rows[0] ?? null
  }

  async setCustomerPortalAccessStatus(customerId: string, status: string) {
    const access = await this.getCustomerPortalAccess(customerId)
    if (!access) return null
    const result = await this.db.query<{ profile_id: string; status: string }>(`
      update profiles
      set status = $2, updated_at = now()
      where id = $1::uuid
      returning id::text as profile_id, status
    `, [access.profile_id, status])
    return result.rows[0] ?? null
  }

  async searchCustomers(term: string, viewerProfileId?: string | null, viewerPerfil?: string | null) {
    const like = `%${term.trim().toLowerCase()}%`
    const params: unknown[] = [like]
    let accessFilter = ''
    if (viewerProfileId && viewerPerfil && !['admin', 'superadmin'].includes(viewerPerfil)) {
      params.push(viewerProfileId)
      accessFilter = `AND cb.id IN (
        SELECT DISTINCT vc.cadastro_base_id
        FROM vendas_certificados vc
        WHERE vc.cadastro_base_id IS NOT NULL
          AND (vc.vendedor_id::text = $2 OR vc.agente_registro_id::text = $2)
      )`
    }
    const result = await this.db.query(`
      select cb.id, cb.nome, cb.nome_fantasia, cb.cpf_cnpj, cb.telefone, cb.cidade, cb.uf, cb.status
      from cadastros_base cb
      where (lower(coalesce(cb.nome, '')) like $1
         or lower(coalesce(cb.nome_fantasia, '')) like $1
         or lower(coalesce(cb.cpf_cnpj, '')) like $1
         or lower(coalesce(cb.telefone, '')) like $1)
        ${accessFilter}
      order by cb.nome asc
      limit 10
    `, params)
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
    const vendaContext = await this.getVendaRemuneracaoContext(input.vendaId)
    const documentoTipo = this.resolveDocumentoTipo(vendaContext?.cpf_cnpj ?? null)
    const snapshotValidacao = await this.resolveRemuneracaoSnapshot({
      profileId: input.agente_registro_id,
      pontoId: input.ponto_atendimento_id,
      escopo: 'validacao',
      documentoTipo,
      baseCalculo: this.resolveBaseComissaoVenda(vendaContext),
    })
    const snapshotVenda = await this.resolveRemuneracaoSnapshot({
      profileId: input.agente_registro_id,
      pontoId: input.ponto_atendimento_id,
      escopo: 'venda',
      documentoTipo,
      baseCalculo: this.resolveBaseComissaoVenda(vendaContext),
    })
    let estruturaAtualizadaVenda: Record<string, unknown> | null = null
    if (snapshotValidacao && vendaContext?.metadata) {
      const vendaMetadata = this.asObject(vendaContext.metadata)
      const estruturaAtual = this.asObject(vendaMetadata.estrutura_comercial)
      if (Object.keys(estruturaAtual).length > 0) {
        const repasseAnterior = this.asObject(estruturaAtual.repasse_validacao)
        const saldoAtual = Number(estruturaAtual.saldo_estrutura ?? 0)
        const saldoAntesValidacao = Number(
          estruturaAtual.saldo_estrutura_antes_validacao
          ?? (saldoAtual + Number(repasseAnterior.valor_calculado ?? 0)),
        )
        const novoSaldo = Number((saldoAntesValidacao - snapshotValidacao.valor_calculado).toFixed(2))
        if (novoSaldo < 0) {
          throw new Error(
            `Agendamento bloqueado: a comissão de validação de R$ ${snapshotValidacao.valor_calculado.toFixed(2)} excede o saldo disponível de R$ ${saldoAntesValidacao.toFixed(2)}.`,
          )
        }
        estruturaAtualizadaVenda = {
          ...estruturaAtual,
          saldo_estrutura_antes_validacao: saldoAntesValidacao,
          repasse_validacao: { ...snapshotValidacao, profile_id: input.agente_registro_id },
          saldo_estrutura: novoSaldo,
          liquido_revendedor: estruturaAtual.modo_operacao === 'revenda' ? novoSaldo : estruturaAtual.liquido_revendedor,
          margem_revenda: estruturaAtual.modo_operacao === 'revenda' ? novoSaldo : estruturaAtual.margem_revenda,
          valor_certifast: estruturaAtual.modo_operacao === 'revenda' ? estruturaAtual.valor_certifast : novoSaldo,
        }
      }
    }
    const metadata = JSON.stringify({
      origem: 'comercial_aiven',
      remuneracao_validacao: snapshotValidacao,
      remuneracao_venda: snapshotVenda,
    })

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
        $9::jsonb,
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
        metadata = excluded.metadata,
        updated_at = now()
      returning id
    `, [agendaId, input.vendaId, input.agente_registro_id, input.ponto_atendimento_id, input.data_agendada, input.tipo_atendimento ?? null, input.observacoes ?? null, input.status_agendamento, metadata])
    const agenda = result.rows[0] ?? { id: agendaId }

    if (estruturaAtualizadaVenda) {
      await this.db.query(
        `update vendas_certificados
         set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{estrutura_comercial}', $2::jsonb, true),
             updated_at = now()
         where id = $1`,
        [input.vendaId, JSON.stringify(estruturaAtualizadaVenda)],
      )
    }

    if (snapshotVenda) {
      await this.db.query(
        `update vendas_certificados
         set agente_registro_id = $2::uuid,
             comissao_agente_tipo = $3,
             comissao_agente_valor = $4,
             updated_at = now()
         where id = $1`,
        [input.vendaId, input.agente_registro_id, snapshotVenda.tipo_calculo, snapshotVenda.valor_calculado],
      )
    } else {
      await this.db.query(
        `update vendas_certificados
         set agente_registro_id = $2::uuid,
             updated_at = now()
         where id = $1`,
        [input.vendaId, input.agente_registro_id],
      )
    }

    await this.recordIntegrationEvent({
      eventType: 'commercial.validation_agenda.saved',
      entityType: 'agendamentos_validacao',
      entityId: agenda.id,
      payload: {
        venda_id: input.vendaId,
        status_agendamento: input.status_agendamento,
        data_agendada: input.data_agendada,
        remuneracao_validacao: snapshotValidacao,
        remuneracao_venda: snapshotVenda,
      },
    })
    return agenda
  }

  private async getVendaRemuneracaoContext(vendaId: string): Promise<VendaRemuneracaoContext | null> {
    const result = await this.db.query<VendaRemuneracaoContext>(
      `select v.valor_venda, v.metadata, cb.cpf_cnpj
       from vendas_certificados v
       left join cadastros_base cb on cb.id = v.cadastro_base_id
       where v.id = $1
       limit 1`,
      [vendaId],
    )
    return result.rows[0] ?? null
  }

  private resolveBaseComissaoVenda(venda: VendaRemuneracaoContext | null): number {
    if (!venda) return 0
    const metadata = this.asObject(venda.metadata)
    const estrutura = this.asObject(metadata.estrutura_comercial)
    const snapshotBase = Number(estrutura.base_calculo_comissoes)
    if (Number.isFinite(snapshotBase) && snapshotBase >= 0) return snapshotBase
    const valorVenda = Number(venda.valor_venda ?? 0)
    const aliquota = Number(estrutura.aliquota_imposto ?? 9)
    return Number((valorVenda - (valorVenda * aliquota / 100)).toFixed(2))
  }

  private resolveDocumentoTipo(documento: string | null): 'geral' | 'cpf' | 'cnpj' {
    const digits = String(documento ?? '').replace(/\D/g, '')
    if (digits.length === 11) return 'cpf'
    if (digits.length === 14) return 'cnpj'
    return 'geral'
  }

  private async resolveRemuneracaoSnapshot(input: {
    profileId: string
    pontoId: string
    escopo: 'validacao' | 'venda'
    documentoTipo: 'geral' | 'cpf' | 'cnpj'
    baseCalculo: number
  }): Promise<RemuneracaoSnapshot | null> {
    const result = await this.db.query<{
      id: string
      escopo: string
      tipo_calculo: 'fixa' | 'percentual'
      documento_tipo: 'geral' | 'cpf' | 'cnpj'
      valor: number
    }>(
      `select id, escopo, tipo_calculo, documento_tipo, valor
       from agente_remuneracao_regras
       where profile_id = $1
         and escopo = $2
         and ativo = true
         and (ponto_atendimento_id = $3 or ponto_atendimento_id is null)
         and (documento_tipo = $4 or documento_tipo = 'geral')
       order by
         case when ponto_atendimento_id = $3 then 0 else 1 end,
         case when documento_tipo = $4 then 0 else 1 end,
         created_at desc
       limit 1`,
      [input.profileId, input.escopo, input.pontoId, input.documentoTipo],
    )

    const row = result.rows[0]
    if (!row) return null

    const baseCalculo = Number(input.baseCalculo || 0)
    const valorRegra = Number(row.valor || 0)
    const valorCalculado = row.tipo_calculo === 'percentual'
      ? Number(((baseCalculo * valorRegra) / 100).toFixed(2))
      : valorRegra

    return {
      regra_id: row.id,
      escopo: row.escopo,
      tipo_calculo: row.tipo_calculo,
      documento_tipo: row.documento_tipo,
      valor_regra: valorRegra,
      valor_calculado: valorCalculado,
      base_calculo: baseCalculo,
    }
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

  async importParceiros(items: Array<Record<string, unknown>>) {
    if (items.length === 0) return { inseridos: 0, atualizados: 0, ignorados: 0 }
    if (items.length > 2000) throw new Error('Limite de 2.000 parceiros por importação.')
    const documents = items
      .map(item => String(item.cpf_cnpj ?? '').replace(/\D/g, ''))
      .filter(Boolean)
    const duplicatedDocuments = documents.filter((document, index) => documents.indexOf(document) !== index)
    if (duplicatedDocuments.length > 0) {
      throw new Error(`Importação bloqueada: há CPF/CNPJ repetido no arquivo (${[...new Set(duplicatedDocuments)].join(', ')}).`)
    }

    return this.db.transaction(async trx => {
      let inseridos = 0
      let atualizados = 0
      let ignorados = 0

      for (const item of items) {
        const nome = String(item.nome ?? item.razao_social ?? '').trim()
        const documento = String(item.cpf_cnpj ?? '').trim()
        if (!nome || !documento) {
          ignorados += 1
          continue
        }

        const existing = await trx.query<{ id: string }>(`
          select id from parceiros
          where regexp_replace(coalesce(cpf_cnpj, ''), '[^0-9]', '', 'g')
              = regexp_replace($1, '[^0-9]', '', 'g')
          limit 1
        `, [documento])
        const id = existing.rows[0]?.id ?? randomUUID()
        const isUpdate = existing.rows.length > 0

        await trx.query(`
          insert into parceiros (
            id, codigo_parceiro, cpf_cnpj, nome, razao_social, nome_fantasia,
            ddd, telefone, email, cep, logradouro, numero, ibge, complemento,
            bairro, cidade, estado, observacao, tipo_parceiro, data_ativacao,
            data_desativacao, bloquear_vendas_protocolos, segmento, status,
            desde, metadata
          ) values (
            $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
            $14, $15, $16, $17, $18, $19, $20::date, $21::date, $22, $23,
            $24, $20::date, $25::jsonb
          )
          on conflict (id) do update set
            codigo_parceiro = excluded.codigo_parceiro,
            cpf_cnpj = excluded.cpf_cnpj,
            nome = excluded.nome,
            razao_social = excluded.razao_social,
            nome_fantasia = excluded.nome_fantasia,
            ddd = excluded.ddd,
            telefone = excluded.telefone,
            email = excluded.email,
            cep = excluded.cep,
            logradouro = excluded.logradouro,
            numero = excluded.numero,
            ibge = excluded.ibge,
            complemento = excluded.complemento,
            bairro = excluded.bairro,
            cidade = excluded.cidade,
            estado = excluded.estado,
            observacao = excluded.observacao,
            tipo_parceiro = excluded.tipo_parceiro,
            data_ativacao = excluded.data_ativacao,
            data_desativacao = excluded.data_desativacao,
            bloquear_vendas_protocolos = excluded.bloquear_vendas_protocolos,
            segmento = excluded.segmento,
            status = excluded.status,
            desde = excluded.desde,
            metadata = coalesce(parceiros.metadata, '{}'::jsonb) || excluded.metadata,
            updated_at = now()
        `, [
          id,
          item.codigo_parceiro ?? null,
          documento,
          nome,
          item.razao_social ?? nome,
          item.nome_fantasia ?? null,
          item.ddd ?? null,
          item.telefone ?? null,
          item.email ?? null,
          item.cep ?? null,
          item.logradouro ?? null,
          item.numero ?? null,
          item.ibge ?? null,
          item.complemento ?? null,
          item.bairro ?? null,
          item.cidade ?? null,
          item.estado ?? null,
          item.observacao ?? null,
          item.tipo_parceiro ?? null,
          item.data_ativacao ?? null,
          item.data_desativacao ?? null,
          Boolean(item.bloquear_vendas_protocolos),
          item.segmento ?? 'baixo',
          item.status === 'inativo' ? 'inativo' : 'ativo',
          JSON.stringify(item.metadata ?? {}),
        ])

        if (isUpdate) atualizados += 1
        else inseridos += 1
      }

      return { inseridos, atualizados, ignorados }
    })
  }

  async saveParceiro(input: Record<string, unknown>) {
    const id = (input.id as string | null)?.trim() || randomUUID()
    const dataAtivacao = typeof input.data_ativacao === 'string' && input.data_ativacao.trim()
      ? input.data_ativacao.trim()
      : typeof input.desde === 'string' && input.desde.trim()
        ? input.desde.trim()
        : null
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
      'segmento','status','emissoes_mes','receita_mes','desde','metadata',
    ]
    const vals = fields.map(f => {
      if (f === 'metadata') return JSON.stringify(input[f] ?? {})
      if (f === 'data_ativacao' || f === 'desde') return dataAtivacao
      return input[f] ?? null
    })
    const colList = fields.join(', ')
    const placeholders = fields.map((field, i) => `$${i + 2}${field === 'metadata' ? '::jsonb' : ''}`).join(', ')
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

  async listCommissionReportProfiles() {
    const result = await this.db.query<{
      id: string
      nome: string
      perfil: string
      parceiro_id: string | null
      vinculo_nome: string | null
      status: string
    }>(`
      select id, nome, perfil, parceiro_id, vinculo_nome, status
      from profiles
      where perfil in ('agente_registro', 'vendedor', 'admin')
        and status = 'ativo'
      order by nome asc
    `)
    return result.rows
  }

  async listOperationalReportFilters() {
    const [parceiros, vendedores, agentes] = await Promise.all([
      this.db.query(`
        with nomes_brutos as (
          select distinct nullif(trim(nome_parceiro_safeweb), '') as nome from vendas_certificados
          union
          select distinct nullif(trim(nome), '') as nome from parceiros where status = 'ativo'
        ),
        nomes as (
          select distinct case
            when lower(nome) like '%isabella de oliveira vidal%' then 'Isabella Vidal'
            when lower(nome) like '%ingrid braz%' then 'Ingrid Braz Pinto'
            when lower(nome) like '%alice maciel%' then 'Alice Maciel'
            when lower(nome) like '%daniel%mantovan%' then 'Daniel Mantovan'
            when lower(nome) like '%rogério carlos ribeiro%'
              or lower(nome) like '%rogerio carlos ribeiro%' then 'Rogério Carlos Ribeiro'
            else nome
          end as nome
          from nomes_brutos
          where nome is not null
        ),
        canonicos as (
          select distinct coalesce((
            select menor.nome
            from nomes menor
            where lower(nomes.nome) = lower(menor.nome)
               or lower(nomes.nome) like lower(menor.nome) || ' - %'
            order by length(menor.nome), menor.nome
            limit 1
          ), nomes.nome) as nome
          from nomes
          where nomes.nome is not null
        )
        select nome as id, nome
        from canonicos
        order by nome asc
      `),
      this.db.query(`
        select nome as id, nome
        from (
          select distinct case
            when lower(trim(metadata->>'vendedor_importado')) in ('isabella de oliveira vidal - isabella', 'isabella de oliveira vidal') then 'Isabella Vidal'
            when lower(trim(metadata->>'vendedor_importado')) in ('ingrid braz pinto - vendedor - ingrid braz pinto', 'ingrid braz pinto - certi id - ingrid braz') then 'Ingrid Braz Pinto'
            when lower(trim(metadata->>'vendedor_importado')) in ('alice maciel', 'alice maciel miranda xavier', 'alice maciel miranda xavier - alice maciel') then 'Alice Maciel'
            when lower(trim(metadata->>'vendedor_importado')) in ('daniel mantovan', 'daniel morgado mantovan', 'daniel mantovan - certi id - daniel') then 'Daniel Mantovan'
            when lower(trim(metadata->>'vendedor_importado')) in ('renata mantovan', 'renata mantovan - certi id - renata') then 'Renata Mantovan'
            else nullif(trim(metadata->>'vendedor_importado'), '')
          end as nome from vendas_certificados
          union
          select distinct case
            when lower(trim(p.nome)) in ('isabella de oliveira vidal', 'isabella vidal') then 'Isabella Vidal'
            when lower(trim(p.nome)) in ('ingrid braz', 'ingrid braz pinto') then 'Ingrid Braz Pinto'
            when lower(trim(p.nome)) in ('alice maciel', 'alice maciel miranda xavier') then 'Alice Maciel'
            when lower(trim(p.nome)) in ('daniel mantovan', 'daniel morgado mantovan') then 'Daniel Mantovan'
            when lower(trim(p.nome)) = 'renata mantovan' then 'Renata Mantovan'
            else nullif(trim(p.nome), '')
          end as nome
          from profiles p
          where (p.perfil = 'vendedor' or p.tipo_vinculo in ('vendedor', 'contador'))
            and p.status = 'ativo'
        ) source where nome is not null order by nome asc
      `),
      this.db.query(`
        select nome as id, nome
        from (
          select distinct case
            when lower(trim(metadata->>'agente_registro_importado')) in ('isabella de oliveira vidal', 'isabella vidal') then 'Isabella Vidal'
            when lower(trim(metadata->>'agente_registro_importado')) in ('ingrid braz', 'ingrid braz pinto') then 'Ingrid Braz Pinto'
            when lower(trim(metadata->>'agente_registro_importado')) in ('alice maciel', 'alice maciel miranda xavier', 'alice maciel miranda xavier - alice maciel') then 'Alice Maciel'
            when lower(trim(metadata->>'agente_registro_importado')) in ('daniel mantovan', 'daniel morgado mantovan', 'daniel mantovan - certi id - daniel') then 'Daniel Mantovan'
            when lower(trim(metadata->>'agente_registro_importado')) in ('renata mantovan', 'renata mantovan - certi id - renata') then 'Renata Mantovan'
            else nullif(trim(metadata->>'agente_registro_importado'), '')
          end as nome from vendas_certificados
          union
          select distinct case
            when lower(trim(p.nome)) in ('isabella de oliveira vidal', 'isabella vidal') then 'Isabella Vidal'
            when lower(trim(p.nome)) in ('ingrid braz', 'ingrid braz pinto') then 'Ingrid Braz Pinto'
            when lower(trim(p.nome)) in ('alice maciel', 'alice maciel miranda xavier') then 'Alice Maciel'
            when lower(trim(p.nome)) in ('daniel mantovan', 'daniel morgado mantovan') then 'Daniel Mantovan'
            when lower(trim(p.nome)) = 'renata mantovan' then 'Renata Mantovan'
            else nullif(trim(p.nome), '')
          end as nome
          from profiles p
          where (p.perfil = 'agente_registro' or p.tipo_vinculo = 'agente_registro')
            and p.status = 'ativo'
        ) source where nome is not null order by nome asc
      `),
    ])
    return {
      parceiros: parceiros.rows,
      vendedores: vendedores.rows,
      agentes: agentes.rows,
    }
  }

  async getOperationalReport(input: {
    tipo?: 'vendas' | 'validacoes'
    from?: string | null
    to?: string | null
    viewer_profile_id: string
    viewer_perfil: string
    parceiro_id?: string | null
    vendedor_id?: string | null
    agente_registro_id?: string | null
    pedido?: string | null
    protocolo?: string | null
    status?: string | null
  }) {
    const tipo = input.tipo === 'validacoes' ? 'validacoes' : 'vendas'
    const from = input.from?.trim() || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const to = input.to?.trim() || new Date().toISOString()
    const params: unknown[] = [from, to]
    const where: string[] = []
    const addFilter = (sql: string, value?: string | null) => {
      if (!value?.trim()) return
      params.push(value.trim())
      where.push(sql.replace('?', `$${params.length}`))
    }
    const sellerName = `case
      when lower(trim(v.metadata->>'vendedor_importado')) in ('isabella de oliveira vidal - isabella', 'isabella de oliveira vidal') then 'Isabella Vidal'
      when lower(trim(v.metadata->>'vendedor_importado')) in ('ingrid braz pinto - vendedor - ingrid braz pinto', 'ingrid braz pinto - certi id - ingrid braz') then 'Ingrid Braz Pinto'
      when lower(trim(v.metadata->>'vendedor_importado')) in ('alice maciel', 'alice maciel miranda xavier', 'alice maciel miranda xavier - alice maciel') then 'Alice Maciel'
      when lower(trim(v.metadata->>'vendedor_importado')) in ('daniel mantovan', 'daniel morgado mantovan', 'daniel mantovan - certi id - daniel') then 'Daniel Mantovan'
      when lower(trim(v.metadata->>'vendedor_importado')) in ('renata mantovan', 'renata mantovan - certi id - renata') then 'Renata Mantovan'
      else coalesce(nullif(trim(v.metadata->>'vendedor_importado'), ''), vendedor.nome, 'Não informado')
    end`
    const agentName = `case
      when lower(trim(v.metadata->>'agente_registro_importado')) in ('isabella de oliveira vidal', 'isabella vidal') then 'Isabella Vidal'
      when lower(trim(v.metadata->>'agente_registro_importado')) in ('ingrid braz', 'ingrid braz pinto') then 'Ingrid Braz Pinto'
      when lower(trim(v.metadata->>'agente_registro_importado')) in ('alice maciel', 'alice maciel miranda xavier', 'alice maciel miranda xavier - alice maciel') then 'Alice Maciel'
      when lower(trim(v.metadata->>'agente_registro_importado')) in ('daniel mantovan', 'daniel morgado mantovan', 'daniel mantovan - certi id - daniel') then 'Daniel Mantovan'
      when lower(trim(v.metadata->>'agente_registro_importado')) in ('renata mantovan', 'renata mantovan - certi id - renata') then 'Renata Mantovan'
      else coalesce(nullif(trim(v.metadata->>'agente_registro_importado'), ''), agente.nome, 'Não informado')
    end`
    const partnerName = `case
      when lower(trim(v.nome_parceiro_safeweb)) like '%isabella de oliveira vidal%' then 'Isabella Vidal'
      when lower(trim(v.nome_parceiro_safeweb)) like '%ingrid braz%' then 'Ingrid Braz Pinto'
      when lower(trim(v.nome_parceiro_safeweb)) like '%alice maciel%' then 'Alice Maciel'
      when lower(trim(v.nome_parceiro_safeweb)) like '%daniel%mantovan%' then 'Daniel Mantovan'
      when lower(trim(v.nome_parceiro_safeweb)) like '%rogério carlos ribeiro%'
        or lower(trim(v.nome_parceiro_safeweb)) like '%rogerio carlos ribeiro%' then 'Rogério Carlos Ribeiro'
      else coalesce(nullif(trim(v.nome_parceiro_safeweb), ''), 'Não informado')
    end`

    addFilter(`${partnerName} = ?`, input.parceiro_id)
    addFilter(`${sellerName} = ?`, input.vendedor_id)
    addFilter(`${agentName} = ?`, input.agente_registro_id)
    addFilter('coalesce(v.pedido_numero, \'\') ilike (\'%\' || ?::text || \'%\')', input.pedido)
    addFilter('coalesce(v.protocolo_numero, \'\') ilike (\'%\' || ?::text || \'%\')', input.protocolo)
    const hasValidation = `(coalesce(nullif(trim(v.metadata->>'agente_registro_importado'), ''), agente.nome) is not null)`
    const validationStatus = `case
      when not ${hasValidation} then 'sem_solicitacao'
      else coalesce(a.status_agendamento, case
        when v.status_venda = 'emitido' then 'realizado'
        when v.status_venda = 'em_validacao' then 'confirmado'
        when v.status_venda = 'cancelado' then 'cancelado'
        else 'pendente'
      end)
    end`
    addFilter(tipo === 'vendas' ? 'v.status_venda = ?' : `${validationStatus} = ?`, input.status)

    if (!['admin', 'superadmin'].includes(input.viewer_perfil)) {
      params.push(input.viewer_profile_id)
      where.push(`(v.vendedor_id = $${params.length}::uuid or coalesce(a.agente_registro_id, v.agente_registro_id) = $${params.length}::uuid)`)
    }

    const importedStatusDate = `case when nullif(v.metadata->>'data_status', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then (v.metadata->>'data_status')::date end`
    const importedAgendaDate = `case when nullif(v.metadata->>'data_agenda', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then (v.metadata->>'data_agenda')::date end`
    const dateExpression = tipo === 'vendas'
      ? `coalesce(${importedStatusDate}, v.created_at)`
      : `coalesce(a.data_agendada, ${importedAgendaDate}, ${importedStatusDate}, v.created_at)`
    const agendaJoin = `left join lateral (
          select av.id, av.agente_registro_id, av.status_agendamento, av.data_agendada, av.created_at, av.tipo_atendimento
          from agendamentos_validacao av
          where av.venda_certificado_id = v.id
          order by coalesce(av.data_agendada, av.created_at) desc
          limit 1
        ) a on true`
    const baseWhere = [
      `${dateExpression} >= $1::timestamptz`,
      `${dateExpression} <= $2::timestamptz`,
      ...(tipo === 'validacoes'
        ? [`coalesce(nullif(trim(v.metadata->>'agente_registro_importado'), ''), agente.nome) is not null`]
        : []),
      ...where,
    ]

    const result = await this.db.query<{
      id: string
      tipo: string
      data: string
      pedido: string | null
      protocolo: string | null
      cliente: string | null
      produto: string | null
      parceiro_id: string | null
      parceiro: string | null
      vendedor_id: string | null
      vendedor: string | null
      agente_registro_id: string | null
      agente_registro: string | null
      status: string | null
      status_validacao: string | null
      data_validacao: string | null
      pedido_status: string | null
      protocolo_status: string | null
      possui_validacao: boolean
      tipo_atendimento: string | null
      valor: number | null
    }>(`
      select
        ${tipo === 'vendas' ? 'v.id' : 'coalesce(a.id, v.id)'} as id,
        '${tipo}' as tipo,
        ${dateExpression} as data,
        v.pedido_numero as pedido,
        v.protocolo_numero as protocolo,
        coalesce(v.nome_faturamento, cb.nome, cb.nome_fantasia) as cliente,
        v.tipo_produto as produto,
        null::uuid as parceiro_id,
        coalesce(nullif(trim(v.nome_parceiro_safeweb), ''), 'Não informado') as parceiro,
        v.vendedor_id,
        ${sellerName} as vendedor,
        coalesce(a.agente_registro_id, v.agente_registro_id) as agente_registro_id,
        ${agentName} as agente_registro,
        ${tipo === 'vendas' ? 'v.status_venda' : validationStatus} as status,
        ${validationStatus} as status_validacao,
        case when ${hasValidation} then coalesce(a.data_agendada, ${importedAgendaDate}, ${importedStatusDate}) end as data_validacao,
        v.pedido_status,
        v.protocolo_status,
        ${hasValidation} as possui_validacao,
        coalesce(a.tipo_atendimento, nullif(v.tipo_emissao, '')) as tipo_atendimento,
        ${tipo === 'vendas' ? 'coalesce(v.valor_venda, 0)' : '0'} as valor
      from vendas_certificados v
      ${agendaJoin}
      left join cadastros_base cb on cb.id = v.cadastro_base_id
      left join profiles vendedor on vendedor.id = v.vendedor_id
      left join profiles agente on agente.id = coalesce(a.agente_registro_id, v.agente_registro_id)
      where ${baseWhere.join('\n and ')}
      order by ${dateExpression} desc
      limit 5000
    `, params)

    const linhas = result.rows.map(row => ({ ...row, valor: Number(row.valor ?? 0) }))
    const totalValor = Number(linhas.reduce((sum, row) => sum + row.valor, 0).toFixed(2))
    const realizados = linhas.filter(row => row.status === 'realizado' || row.status === 'emitido').length
    const comValidacao = linhas.filter(row => row.possui_validacao).length
    const validacoesRealizadas = linhas.filter(row => row.status_validacao === 'realizado').length
    const agrupamentos = {
      parceiros: this.groupOperationalRows(linhas as Array<Record<string, unknown> & { valor: number }>, 'parceiro'),
      vendedores: this.groupOperationalRows(linhas as Array<Record<string, unknown> & { valor: number }>, 'vendedor'),
      agentes: this.groupOperationalRows(linhas as Array<Record<string, unknown> & { valor: number }>, 'agente_registro'),
    }

    return {
      tipo,
      from,
      to,
      resumo: { quantidade: linhas.length, realizados, valor_total: totalValor, com_validacao: comValidacao, validacoes_realizadas: validacoesRealizadas },
      agrupamentos,
      linhas,
    }
  }

  private groupOperationalRows(rows: Array<Record<string, unknown> & { valor: number }>, field: string) {
    const groups = new Map<string, { nome: string; quantidade: number; valor: number }>()
    for (const row of rows) {
      const nome = String(row[field] ?? 'Não informado')
      const current = groups.get(nome) ?? { nome, quantidade: 0, valor: 0 }
      current.quantidade += 1
      current.valor += row.valor
      groups.set(nome, current)
    }
    return [...groups.values()]
      .map(item => ({ ...item, valor: Number(item.valor.toFixed(2)) }))
      .sort((a, b) => b.quantidade - a.quantidade)
  }

  async getCommissionReport(input: {
    from?: string | null
    to?: string | null
    viewer_profile_id: string
    viewer_perfil: string
    target_profile_id?: string | null
  }) {
    const from = input.from?.trim() || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const to = input.to?.trim() || new Date().toISOString()
    const canViewAll = ['admin', 'superadmin'].includes(input.viewer_perfil)
    const targetProfileId = canViewAll && input.target_profile_id?.trim()
      ? input.target_profile_id.trim()
      : input.viewer_profile_id

    const [profileResult, salesResult, agendasResult] = await Promise.all([
      this.db.query<{ id: string; nome: string; perfil: string; parceiro_id: string | null; vinculo_nome: string | null }>(
        `select id, nome, perfil, parceiro_id, vinculo_nome from profiles where id = $1 limit 1`,
        [targetProfileId],
      ),
      this.db.query<{
        id: string
        created_at: string
        status_venda: string | null
        nome_faturamento: string | null
        tipo_produto: string | null
        valor_venda: number | null
        desconto: number | null
        comissao_vendedor_valor: number | null
        vendedor_id: string | null
        metadata: Record<string, unknown> | null
        cliente_iss_retido: boolean | null
      }>(
        `select v.id, v.created_at, v.status_venda, v.nome_faturamento, v.tipo_produto, v.valor_venda,
                v.desconto, v.comissao_vendedor_valor, v.vendedor_id, v.metadata, cb.iss_retido as cliente_iss_retido
         from vendas_certificados v
         left join cadastros_base cb on cb.id = v.cadastro_base_id
         where (
               v.vendedor_id = $1::uuid
               OR EXISTS (
                 SELECT 1
                 FROM jsonb_array_elements(coalesce(v.metadata#>'{estrutura_comercial,repasses}', '[]'::jsonb)) repasse
                 WHERE repasse->>'parent_profile_id' = $1::text
               )
             )
           and v.created_at >= $2::timestamptz
           and v.created_at <= $3::timestamptz
           and coalesce(v.status_venda, '') != 'cancelado'
         order by v.created_at desc`,
        [targetProfileId, from, to],
      ),
      this.db.query<{
        id: string
        created_at: string
        data_agendada: string | null
        status_agendamento: string | null
        venda_certificado_id: string | null
        observacoes: string | null
        metadata: Record<string, unknown> | null
        nome_faturamento: string | null
        tipo_produto: string | null
      }>(
        `select a.id, a.created_at, a.data_agendada, a.status_agendamento, a.venda_certificado_id,
                a.observacoes, a.metadata, v.nome_faturamento, v.tipo_produto
         from agendamentos_validacao a
         left join vendas_certificados v on v.id = a.venda_certificado_id
         where a.agente_registro_id = $1
           and coalesce(a.data_agendada, a.created_at) >= $2::timestamptz
           and coalesce(a.data_agendada, a.created_at) <= $3::timestamptz
           and coalesce(a.status_agendamento, '') != 'cancelado'
         order by coalesce(a.data_agendada, a.created_at) desc`,
        [targetProfileId, from, to],
      ),
    ])

    const profile = profileResult.rows[0] ?? null
    const salesRows = salesResult.rows
    const agendaRows = agendasResult.rows

    const vendas = salesRows.map(row => {
      const metadata = this.asObject(row.metadata)
      const estrutura = this.asObject(metadata.estrutura_comercial)
      const modoOperacao = String(estrutura.modo_operacao ?? 'comissao')
      const liquidoRevenda = Number(estrutura.liquido_revendedor ?? 0)
      const repasses = Array.isArray(estrutura.repasses) ? estrutura.repasses : []
      const repassesDoPerfil = repasses
        .map(item => this.asObject(item))
        .filter(item => String(item.parent_profile_id ?? '') === targetProfileId)
      const valorRepasses = Number(repassesDoPerfil.reduce((acc, item) => acc + Number(item.valor_calculado ?? 0), 0).toFixed(2))
      const valorPrincipal = row.vendedor_id === targetProfileId
        ? (modoOperacao === 'revenda'
            ? liquidoRevenda
            : Number(estrutura.saldo_estrutura ?? row.comissao_vendedor_valor ?? 0))
        : 0
      const comissao = Number((valorPrincipal + valorRepasses).toFixed(2))
      const desconto = Number(row.desconto ?? 0)
      const impostoRetido = Number(estrutura.imposto_retido_valor ?? 0)
      return {
        tipo: 'venda',
        id: row.id,
        data: row.created_at,
        cliente_nome: row.nome_faturamento,
        descricao: row.tipo_produto,
        status: row.status_venda,
        modo_operacao: modoOperacao,
        valor_bruto: Number(row.valor_venda ?? 0),
        valor_receber: comissao,
        desconto,
        imposto_retido: impostoRetido,
        metadata: metadata,
      }
    })

    const validacoes = agendaRows.map(row => {
      const metadata = this.asObject(row.metadata)
      const remuneracao = this.asObject(metadata.remuneracao_validacao)
      return {
        tipo: 'validacao',
        id: row.id,
        data: row.data_agendada ?? row.created_at,
        cliente_nome: row.nome_faturamento,
        descricao: row.tipo_produto,
        status: row.status_agendamento,
        modo_operacao: 'validacao',
        valor_bruto: Number(remuneracao.base_calculo ?? 0),
        valor_receber: Number(remuneracao.valor_calculado ?? 0),
        desconto: 0,
        imposto_retido: 0,
        metadata: metadata,
      }
    })

    const linhas = [...vendas, ...validacoes].sort((a, b) => String(b.data).localeCompare(String(a.data)))
    const resumo = {
      vendas_quantidade: vendas.length,
      validacoes_quantidade: validacoes.length,
      vendas_total_bruto: Number(vendas.reduce((acc, row) => acc + row.valor_bruto, 0).toFixed(2)),
      vendas_total_receber: Number(vendas.reduce((acc, row) => acc + row.valor_receber, 0).toFixed(2)),
      validacoes_total_receber: Number(validacoes.reduce((acc, row) => acc + row.valor_receber, 0).toFixed(2)),
      descontos_total: Number(vendas.reduce((acc, row) => acc + row.desconto, 0).toFixed(2)),
      imposto_retido_total: Number(linhas.reduce((acc, row) => acc + row.imposto_retido, 0).toFixed(2)),
    }
    const totalReceber = Number((resumo.vendas_total_receber + resumo.validacoes_total_receber).toFixed(2))

    return {
      profile,
      from,
      to,
      resumo: {
        ...resumo,
        total_receber: totalReceber,
      },
      linhas,
    }
  }

  private asObject(value: unknown): Record<string, unknown> {
    if (!value) return {}
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as Record<string, unknown>
        return parsed && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
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




