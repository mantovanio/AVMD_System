import { randomUUID } from 'node:crypto'
import type { AivenSqlClient } from '../db/aivenClient.js'
import type {
  AgendaAgent,
  AgendaPoint,
  AgendaSlot,
  CheckoutExistingCustomerLookup,
  CheckoutPriceTable,
  CheckoutProduct,
  CheckoutStore,
  CheckoutSubmitRequest,
} from '../contracts/checkoutContract.js'
import type {
  CheckoutRepository,
  CheckoutScheduleContextInput,
  CreateCheckoutSaleInput,
  CreateCheckoutScheduleInput,
  PaymentOptionRow,
  PaymentRuntimeSetting,
  CheckoutPaymentMethodConfig,
} from './checkoutRepository.js'
import {
  generateAgendaSlots,
  type AgendaAvailability,
  type AgendaBooking,
  type AgendaEligibilityLink,
  type AgendaPartnerRestriction,
  type AgendaUnavailability,
} from '../utils/agenda.js'

type ProfileRow = {
  id: string
  nome: string | null
}

type PointRow = {
  id: string
  nome: string
}

export class AivenCheckoutRepository implements CheckoutRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async findMarketplaceStore(slug: string | null): Promise<CheckoutStore | null> {
    if (slug) {
      const sql = `
        select *
        from lojas_marketplace
        where ativo = true
          and slug = $1
        limit 1
      `
      const result = await this.db.query<CheckoutStore>(sql, [slug])
      return result.rows[0] ?? null
    }

    const sql = `
      select *
      from lojas_marketplace
      where ativo = true
        and owner_tipo = 'institucional'
      order by created_at asc
      limit 1
    `
    const result = await this.db.query<CheckoutStore>(sql)
    return result.rows[0] ?? null
  }

  async findPriceTable(tabelaPrecoId: string): Promise<CheckoutPriceTable | null> {
    const sql = `
      select *
      from tabelas_preco
      where id = $1
      limit 1
    `
    const result = await this.db.query<CheckoutPriceTable>(sql, [tabelaPrecoId])
    return result.rows[0] ?? null
  }

  async findMarketplaceProducts(tabelaPrecoId: string): Promise<CheckoutProduct[]> {
    const sql = `
      select
        i.*,
        row_to_json(c) as certificados
      from tabelas_preco_itens i
      join certificados c on c.id = i.certificado_id
      where i.tabela_preco_id = $1
        and i.ativo = true
        and c.ativo = true
      order by i.created_at asc
    `
    const result = await this.db.query<CheckoutProduct>(sql, [tabelaPrecoId])
    return result.rows
  }

  async findMarketplaceItem(itemId: string): Promise<CheckoutProduct | null> {
    const sql = `
      select
        i.*,
        row_to_json(c) as certificados
      from tabelas_preco_itens i
      join certificados c on c.id = i.certificado_id
      where i.id = $1
        and i.ativo = true
        and c.ativo = true
      limit 1
    `
    const result = await this.db.query<CheckoutProduct>(sql, [itemId])
    return result.rows[0] ?? null
  }

  async findActivePaymentMethods(): Promise<PaymentOptionRow[]> {
    const sql = `
      select id, nome, codigo, tipo, gateway
      from formas_pagamento_v2
      where ativo = true
      order by nome asc
    `
    const result = await this.db.query<PaymentOptionRow>(sql)
    const settings = await this.db.query<{ value: { methods?: Array<Record<string, unknown>>; default_method_id?: string | null } | null }>(
      `select value from app_settings where key = 'payment_methods' limit 1`,
    )
    const methods = settings.rows[0]?.value?.methods ?? []
    const configuredDefault = String(settings.rows[0]?.value?.default_method_id ?? '')
    const activeGateway = configuredDefault || String(methods.find(item => item.is_default === true)?.id ?? '')
    const gatewayConfig = methods.find(item => String(item.id ?? '') === activeGateway)
    const enabledPaymentTypes = gatewayConfig?.enabled_payment_types as Record<string, unknown> | undefined
    const fallbackRows = result.rows.filter(row => row.gateway === 'mercado_pago' || !row.gateway)
    const visibleRows = activeGateway
      ? result.rows.filter(row => {
          if (String(row.gateway ?? 'manual') !== activeGateway) return false
          if (activeGateway !== 'mercado_pago' || !enabledPaymentTypes) return true
          return enabledPaymentTypes[String(row.codigo ?? row.tipo ?? '')] !== false
        })
      : fallbackRows.length > 0 ? fallbackRows : result.rows
    return visibleRows.map(row => {
      const configured = methods.find(item => String(item.id ?? '') === String(row.gateway ?? ''))
      const environment = String(configured?.ambiente ?? 'producao') === 'sandbox' ? 'sandbox' : 'producao'
      const credentialsByEnvironment = configured?.credentials_by_environment as Record<string, Record<string, unknown>> | undefined
      const environmentCredentials = credentialsByEnvironment?.[environment]
      return {
        ...row,
        public_key: configured ? String(environmentCredentials?.public_key ?? configured.client_id ?? '') || null : null,
      }
    })
  }

  async getPaymentRuntime(): Promise<PaymentRuntimeSetting> {
    const sql = `
      select value
      from app_settings
      where key = 'payment_runtime'
      limit 1
    `
    const result = await this.db.query<{ value: Partial<PaymentRuntimeSetting> | null }>(sql)
    const value = result.rows[0]?.value ?? {}
    return {
      modo_teste_geral: Boolean(value.modo_teste_geral),
      bloquear_integracoes_reais: Boolean(value.bloquear_integracoes_reais),
      aviso_checkout: String(value.aviso_checkout || 'O atendimento sera liberado apos a confirmacao do pagamento.'),
    }
  }


  async getCheckoutPaymentMethodConfig(formaPagamentoId: string): Promise<CheckoutPaymentMethodConfig | null> {
    const [methodsResult, paymentMethodResult, runtime] = await Promise.all([
      this.db.query<{ value: { methods?: Array<Record<string, unknown>> } | null }>(
        `select value from app_settings where key = 'payment_methods' limit 1`,
      ),
      this.db.query<PaymentOptionRow>(
        `select id, nome, codigo, tipo, gateway
         from formas_pagamento_v2
         where id = $1 and ativo = true
         limit 1`,
        [formaPagamentoId],
      ),
      this.getPaymentRuntime(),
    ])

    const catalogMethod = paymentMethodResult.rows[0]
    if (!catalogMethod) return null

    const methods = methodsResult.rows[0]?.value?.methods ?? []
    const catalogGateway = String(catalogMethod.gateway ?? 'safe2pay').trim() || 'safe2pay'
    const appMethod = methods.find(item => String(item.id ?? '') === formaPagamentoId || String(item.id ?? '') === catalogGateway) ?? null
    const gateway = String(appMethod?.gateway ?? catalogGateway).trim() || 'safe2pay'
    const ambiente = String(appMethod?.ambiente ?? 'producao') === 'sandbox' ? 'sandbox' : 'producao'
    const credentialsByEnvironment = appMethod?.credentials_by_environment as Record<string, Record<string, unknown>> | undefined
    const environmentCredentials = credentialsByEnvironment?.[ambiente]
    const clientId = String(environmentCredentials?.public_key ?? appMethod?.client_id ?? '') || null
    const secretKey = String(environmentCredentials?.access_token ?? appMethod?.secret_key ?? '') || null
    const integrationResult = await this.db.query<{
      base_url: string | null
      webhook_url: string | null
      api_token: string | null
      metadata: Record<string, unknown> | null
      status: string
    }>(
      `select base_url, webhook_url, api_token, metadata, status
       from external_integrations
       where provider = $1
       limit 1`,
      [gateway],
    )
    const integration = integrationResult.rows[0] ?? null

    return {
      id: catalogMethod.id,
      nome: catalogMethod.nome,
      codigo: catalogMethod.codigo ?? null,
      tipo: catalogMethod.tipo ?? null,
      gateway,
      ambiente,
      client_id: clientId,
      secret_key: secretKey,
      webhook_url: appMethod ? String(appMethod.webhook_url ?? integration?.webhook_url ?? '') || null : (integration?.webhook_url ?? null),
      provider_base_url: integration?.base_url ?? null,
      provider_api_token: String(secretKey ?? clientId ?? integration?.api_token ?? '') || null,
      provider_metadata: integration?.metadata ?? {},
      webhook_secret: appMethod ? String(appMethod.webhook_secret ?? '') || null : null,
      runtime,
    }
  }

  async getCheckoutPaymentMethodConfigByGateway(gateway: string): Promise<CheckoutPaymentMethodConfig | null> {
    const result = await this.db.query<{ id: string }>(
      `select id from formas_pagamento_v2 where gateway = $1 and ativo = true order by created_at asc limit 1`,
      [gateway],
    )
    return result.rows[0]?.id ? this.getCheckoutPaymentMethodConfig(result.rows[0].id) : null
  }

  async findCommercialSalePaymentData(vendaId: string, profileId: string) {
    const result = await this.db.query<{
      id: string; forma_pagamento_id: string; valor: number; descricao: string; nome: string; email: string
      telefone: string; documento: string; cep: string; logradouro: string; numero: string; bairro: string; cidade: string; uf: string
    }>(`
      select venda.id,
             venda.forma_pagamento_id,
             coalesce(venda.valor_venda, 0)::float8 as valor,
             coalesce(venda.tipo_produto, 'Certificado digital') as descricao,
             coalesce(venda.nome_faturamento, cliente.nome, 'Cliente') as nome,
             coalesce(venda.email_faturamento, cliente.email, '') as email,
             coalesce(venda.telefone_faturamento, cliente.telefone, '') as telefone,
             coalesce(venda.documento_faturamento, cliente.cpf_cnpj, '') as documento,
             coalesce(venda.cep, cliente.cep, '') as cep,
             coalesce(venda.logradouro, cliente.logradouro, '') as logradouro,
             coalesce(venda.numero, cliente.numero, '') as numero,
             coalesce(venda.bairro, cliente.bairro, '') as bairro,
             coalesce(venda.cidade, cliente.cidade, '') as cidade,
             coalesce(venda.uf, cliente.uf, '') as uf
      from vendas_certificados venda
      join profiles solicitante on solicitante.id = $2::uuid and solicitante.status = 'ativo'
      left join cadastros_base cliente on cliente.id = venda.cadastro_base_id
      where venda.id = $1::uuid and venda.forma_pagamento_id is not null
      limit 1
    `, [vendaId, profileId])
    return result.rows[0] ?? null
  }

  async getCheckoutScheduleContext(input: CheckoutScheduleContextInput): Promise<{ agentes: AgendaAgent[]; pontos: AgendaPoint[]; slots: AgendaSlot[] }> {
    const vinculados = await this.findActiveTableAgentLinks(input.tabelaPrecoId)
    if (vinculados.length === 0) {
      return { agentes: [], pontos: [], slots: [] }
    }

    const restricoes = input.parceiroId
      ? await this.findActivePartnerAgentRestrictions(input.parceiroId)
      : []

    const disponibilidades = await this.findActiveAgentAvailability()
    const indisponibilidades = await this.findActiveAgentUnavailability()
    const bookings = await this.findUpcomingBookings()

    const slotsBase = generateAgendaSlots({
      tabelaPrecoId: input.tabelaPrecoId,
      vinculados,
      parceiroId: input.parceiroId,
      parceirosAgentesPermitidos: restricoes,
      disponibilidades,
      indisponibilidades,
      bookings,
    })

    if (slotsBase.length === 0) {
      return { agentes: [], pontos: [], slots: [] }
    }

    const agentIds = Array.from(new Set(slotsBase.map(slot => slot.agente_registro_id)))
    const pointIds = Array.from(new Set(slotsBase.map(slot => slot.ponto_atendimento_id)))
    const [profiles, points] = await Promise.all([
      this.findAgentProfilesByIds(agentIds),
      this.findPointsByIds(pointIds),
    ])

    const agentMap = new Map(profiles.map(item => [item.id, item.nome || 'Agente de Registro']))
    const pointMap = new Map(points.map(item => [item.id, item.nome]))

    const agentes: AgendaAgent[] = profiles
      .map(item => ({ id: item.id, nome: item.nome || 'Agente de Registro' }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

    const pontos: AgendaPoint[] = points
      .map(item => ({ id: item.id, nome: item.nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))

    const slots: AgendaSlot[] = slotsBase.map(slot => ({
      ...slot,
      agente_nome: agentMap.get(slot.agente_registro_id) || 'Agente de Registro',
      ponto_nome: pointMap.get(slot.ponto_atendimento_id) || 'Ponto de Atendimento',
    }))

    return { agentes, pontos, slots }
  }

  async findLatestActiveCustomerByDocument(documento: string): Promise<CheckoutExistingCustomerLookup | null> {
    const sql = `
      select id, tipo_cliente, cpf_cnpj, nome, nome_fantasia, email, telefone, cep,
             logradouro, numero, complemento, bairro, cidade, uf
      from cadastros_base
      where status = 'ativo'
        and (
          cpf_cnpj = $1::text
          or cpf_cnpj = $2::text
        )
      order by updated_at desc
      limit 1
    `
    const digits = onlyDigits(documento)
    const masked = formatCpfCnpj(digits)
    const result = await this.db.query<CheckoutExistingCustomerLookup>(sql, [digits, masked])
    return result.rows[0] ?? null
  }

  async upsertCheckoutCustomer(payload: CheckoutSubmitRequest): Promise<{ id: string }> {
    return this.db.transaction(async trx => {
      const documento = onlyDigits(payload.comprador.cpf_cnpj)
      const existing = await this.findLatestActiveCustomerByDocumentWithClient(trx, documento)
      const customerId = existing?.id ?? randomUUID()
      const tipoCliente = documento.length === 14 ? 'pessoa_juridica' : 'pessoa_fisica'
      const tipoCadastro = 'cliente'

      if (existing?.id) {
        const sql = `
          update cadastros_base
          set tipo_cliente = $2,
              nome = $3,
              nome_fantasia = $4,
              email = $5,
              telefone = $6,
              logradouro = $7,
              numero = $8,
              complemento = $9,
              bairro = $10,
              cidade = $11,
              uf = $12,
              cep = $13,
              updated_at = now()
          where id = $1
        `
        await trx.query(sql, [
          customerId,
          tipoCliente,
          payload.comprador.nome,
          payload.comprador.nome_fantasia || null,
          payload.comprador.email,
          payload.comprador.telefone,
          payload.fiscal.logradouro,
          payload.fiscal.numero,
          payload.fiscal.complemento || null,
          payload.fiscal.bairro,
          payload.fiscal.cidade,
          payload.fiscal.uf,
          payload.fiscal.cep,
        ])
        return { id: customerId }
      }

      const sql = `
        insert into cadastros_base (
          id, tipo_cliente, tipo_cadastro, cpf_cnpj, nome, nome_fantasia,
          email, telefone, logradouro, numero, complemento, bairro, cidade, uf, cep,
          status, metadata, created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17::jsonb, now(), now()
        )
      `
      await trx.query(sql, [
        customerId,
        tipoCliente,
        tipoCadastro,
        documento,
        payload.comprador.nome,
        payload.comprador.nome_fantasia || null,
        payload.comprador.email,
        payload.comprador.telefone,
        payload.fiscal.logradouro,
        payload.fiscal.numero,
        payload.fiscal.complemento || null,
        payload.fiscal.bairro,
        payload.fiscal.cidade,
        payload.fiscal.uf,
        payload.fiscal.cep,
        'ativo',
        JSON.stringify({ origem: 'checkout_aiven' }),
      ])
      return { id: customerId }
    })
  }

  async upsertCheckoutHolder(payload: CheckoutSubmitRequest): Promise<{ id: string | null }> {
    return this.db.transaction(async trx => {
      const cpf = onlyDigits(payload.titular.cpf)
      const sqlFind = `
        select id
        from titulares_certificado
        where cpf = $1
        order by updated_at desc
        limit 1
      `
      const found = await trx.query<{ id: string }>(sqlFind, [cpf])
      const holderId = found.rows[0]?.id ?? randomUUID()

      if (found.rows[0]?.id) {
        const sqlUpdate = `
          update titulares_certificado
          set nome = $2,
              data_nascimento = $3,
              email = $4,
              telefone = $5,
              updated_at = now()
          where id = $1
        `
        await trx.query(sqlUpdate, [
          holderId,
          payload.titular.nome,
          payload.titular.data_nascimento,
          payload.titular.email,
          payload.titular.telefone,
        ])
        return { id: holderId }
      }

      const sqlInsert = `
        insert into titulares_certificado (
          id, nome, cpf, data_nascimento, email, telefone, metadata, created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7::jsonb, now(), now()
        )
      `
      await trx.query(sqlInsert, [
        holderId,
        payload.titular.nome,
        cpf,
        payload.titular.data_nascimento,
        payload.titular.email,
        payload.titular.telefone,
        JSON.stringify({ origem: 'checkout_aiven' }),
      ])
      return { id: holderId }
    })
  }

  async findRecentCheckoutSaleByFingerprint(input: {
    itemId: string
    compradorDocumento: string
    compradorEmail: string
    valor: number
    minutos?: number
  }): Promise<{ id: string; protocolo_numero: string | null; status_venda: string | null } | null> {
    const minutes = Math.max(1, Number(input.minutos ?? 5))
    const sql = `
      select id, protocolo_numero, status_venda
      from vendas_certificados
      where tabela_preco_item_id = $1::uuid
        and documento_faturamento = $2::text
        and lower(coalesce(email_faturamento, '')) = lower($3::text)
        and valor_venda = $4::float8
        and created_at >= now() - make_interval(mins => $5::int)
        and coalesce(status_venda, '') <> 'cancelado'
      order by created_at desc
      limit 1
    `
    const result = await this.db.query<{ id: string; protocolo_numero: string | null; status_venda: string | null }>(sql, [
      String(input.itemId),
      onlyDigits(String(input.compradorDocumento)),
      String(input.compradorEmail).trim(),
      Number(input.valor),
      minutes,
    ])
    return result.rows[0] ?? null
  }

  async createCheckoutSale(input: CreateCheckoutSaleInput): Promise<{ id: string; protocolo_numero: string | null }> {
    return this.db.transaction(async trx => {
      const saleId = randomUUID()
      const payload = input.payload

      const seqResult = await trx.query<{ nextval: string }>(`select nextval('vendas_pedido_numero_seq') as nextval`)
      const pedidoNumero = seqResult.rows[0]?.nextval ?? null

      const valorFinal = Number(input.item.valor ?? 0) - (input.desconto ?? 0)
      const sql = `
        insert into vendas_certificados (
          id, loja_marketplace_id, cadastro_base_id, titular_id, certificado_id, tabela_preco_id,
          tabela_preco_item_id, forma_pagamento_id, pago, tipo_produto, tipo_emissao, tabela_preco,
          valor_venda, valor_custo, desconto, voucher_codigo, voucher_percentual, voucher_valor,
          documento_faturamento, nome_faturamento, email_faturamento,
          telefone_faturamento, logradouro, numero, complemento, bairro, cidade, uf, cep,
          ponto_atendimento_id, observacoes, pedido_numero, pedido_status, protocolo_status,
          api_payload_pedido, api_payload_protocolo, created_at, updated_at
        ) values (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
          $7::uuid, $8::uuid, $9::boolean, $10::text, $11::text, $12::text,
          $13::float8, $14::float8, $15::float8, $16::text, $17::float8, $18::float8,
          $19::text, $20::text, $21::text,
          $22::text, $23::text, $24::text, $25::text, $26::text, $27::text, $28::text, $29::text,
          $30::uuid, $31::text, $32::text, $33::text, $34::text,
          $35::jsonb, $36::jsonb, now(), now()
        )
        returning id, protocolo_numero
      `
      const result = await trx.query<{ id: string; protocolo_numero: string | null }>(sql, [
        saleId,                                              // $1  id
        String(input.loja.id),                               // $2  loja_marketplace_id
        String(input.cadastroBaseId),                        // $3  cadastro_base_id
        input.titularId ? String(input.titularId) : null,    // $4  titular_id
        String(input.item.certificado_id),                   // $5  certificado_id
        String(input.loja.tabela_preco_id),                  // $6  tabela_preco_id
        String(input.item.id),                               // $7  tabela_preco_item_id
        String(payload.pagamento.forma_pagamento_id),        // $8  forma_pagamento_id
        false,                                               // $9  pago
        String(input.item.certificados?.tipo ?? 'Certificado digital'), // $10 tipo_produto
        input.item.certificados?.tipo_emissao_padrao ? String(input.item.certificados.tipo_emissao_padrao) : null, // $11 tipo_emissao
        input.tabela?.nome ? String(input.tabela.nome) : null, // $12 tabela_preco
        Number(valorFinal),                                  // $13 valor_venda
        Number(input.item.valor_custo ?? 0),                 // $14 valor_custo
        Number(input.desconto ?? 0),                         // $15 desconto
        input.voucherCodigo ? String(input.voucherCodigo) : null, // $16 voucher_codigo
        input.voucherPercentual ?? null,                     // $17 voucher_percentual
        input.voucherValor ?? null,                          // $18 voucher_valor
        payload.comprador.cpf_cnpj ? onlyDigits(payload.comprador.cpf_cnpj) : null, // $19 documento_faturamento
        String(payload.comprador.nome),                      // $20 nome_faturamento
        String(payload.comprador.email),                     // $21 email_faturamento
        String(payload.comprador.telefone),                  // $22 telefone_faturamento
        String(payload.fiscal.logradouro),                   // $23 logradouro
        String(payload.fiscal.numero),                       // $24 numero
        payload.fiscal.complemento ? String(payload.fiscal.complemento) : null, // $25 complemento
        String(payload.fiscal.bairro),                       // $26 bairro
        String(payload.fiscal.cidade),                      // $27 cidade
        String(payload.fiscal.uf),                          // $28 uf
        String(payload.fiscal.cep),                         // $29 cep
        payload.agendamento?.ponto_atendimento_id ? String(payload.agendamento.ponto_atendimento_id) : null, // $30 ponto_atendimento_id
        payload.observacoes ? String(payload.observacoes) : null, // $31 observacoes
        pedidoNumero ? String(pedidoNumero) : null,          // $32 pedido_numero
        'pendente',                                          // $33 pedido_status
        'nao_gerado',                                        // $34 protocolo_status
        JSON.stringify({ origem: 'checkout_aiven' }),        // $35 api_payload_pedido
        JSON.stringify({}),                                  // $36 api_payload_protocolo
      ])
      return result.rows[0] ?? { id: saleId, protocolo_numero: null }
    })
  }

  async markCheckoutFlowState(input: {
    vendaId: string
    stage: string
    status: 'started' | 'success' | 'failed' | 'compensated'
    error?: string | null
    compensation?: Record<string, unknown> | null
  }): Promise<void> {
    await this.db.query(
      `update vendas_certificados
       set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'checkout_flow', coalesce(metadata->'checkout_flow', '{}'::jsonb) || jsonb_build_object(
           'stage', $2::text,
           'status', $3::text,
           'error', $4::text,
           'compensation', $5::jsonb,
           'updated_at', now()
         )
       ),
           updated_at = now()
       where id = $1::uuid`,
      [
        String(input.vendaId),
        String(input.stage),
        String(input.status),
        input.error ? String(input.error) : null,
        JSON.stringify(input.compensation ?? {}),
      ],
    )
  }

  async cancelCheckoutScheduleBySaleId(input: {
    vendaId: string
    reason: string
  }): Promise<number> {
    const result = await this.db.query<{ id: string }>(
      `update agendamentos_validacao
          set status_agendamento = 'cancelado',
              metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                'checkout_flow', jsonb_build_object(
                  'status', 'compensated',
                  'reason', $2::text,
                  'updated_at', now()
                )
              ),
              updated_at = now()
        where venda_certificado_id = $1::uuid
          and status_agendamento <> 'cancelado'
        returning id`,
      [String(input.vendaId), String(input.reason)],
    )
    return result.rows.length
  }

  async cancelCheckoutSaleById(input: {
    vendaId: string
    reason: string
  }): Promise<void> {
    await this.db.query(
      `update vendas_certificados
       set status_venda = 'cancelado',
           pedido_status = 'cancelado',
           protocolo_status = case when protocolo_status = 'nao_gerado' then protocolo_status else protocolo_status end,
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'checkout_flow', coalesce(metadata->'checkout_flow', '{}'::jsonb) || jsonb_build_object(
               'status', 'compensated',
               'reason', $2::text,
               'updated_at', now()
             )
           ),
           updated_at = now()
       where id = $1::uuid`,
      [String(input.vendaId), String(input.reason)],
    )
  }


  async attachPaymentChargeToSale(input: {
    vendaId: string
    gateway: string
    externalId?: string | null
    chargeUrl?: string | null
    status: string
    payload?: Record<string, unknown> | null
    details?: Record<string, unknown> | null
  }): Promise<void> {
    await this.db.query(
      `update vendas_certificados
       set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'payment_charge', jsonb_build_object(
           'gateway', $2::text,
           'external_id', $3::text,
           'charge_url', $4::text,
           'status', $5::text,
           'payload', $6::jsonb,
           'updated_at', now(),
           'details', $7::jsonb
         )
       ),
           updated_at = now()
       where id = $1::uuid`,
      [
        String(input.vendaId),
        String(input.gateway),
        input.externalId ? String(input.externalId) : null,
        input.chargeUrl ? String(input.chargeUrl) : null,
        String(input.status),
        JSON.stringify(input.payload ?? {}),
        JSON.stringify(input.details ?? {}),
      ],
    )
  }

  async applyPaymentWebhook(input: {
    vendaId?: string | null
    externalId?: string | null
    gateway: string
    status: string
    paid: boolean
    payload?: Record<string, unknown> | null
  }): Promise<void> {
    const vendaId = input.vendaId?.trim() || await this.findVendaIdByExternalChargeId(input.externalId ?? null)
    if (!vendaId) return

    await this.db.query(
      `update vendas_certificados
       set pago = case when $2::boolean then true else pago end,
           data_pagamento = case when $2::boolean then now() else data_pagamento end,
           status_pagamento = case
             when status_venda = 'cancelado' then 'cancelado'
             when $2::boolean then 'pago'
             when $5::text = 'failed' and status_pagamento is distinct from 'pago' then 'recusado'
             else status_pagamento
           end,
           status_venda = case
             when status_venda = 'cancelado' then status_venda
             when $2::boolean then 'vendido'
             else status_venda
           end,
            metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
              'payment_charge', coalesce(metadata->'payment_charge', '{}'::jsonb) || jsonb_build_object(
                'gateway', $3::text,
               'external_id', $4::text,
               'status', $5::text,
               'webhook_payload', $6::jsonb,
               'paid', $2::boolean,
               'updated_at', now()
             )
           ),
           updated_at = now()
       where id = $1::uuid`,
      [
        String(vendaId),
        Boolean(input.paid),
        String(input.gateway),
        input.externalId ? String(input.externalId) : null,
        String(input.status),
        JSON.stringify(input.payload ?? {}),
      ],
    )
  }

  private async findVendaIdByExternalChargeId(externalId: string | null): Promise<string | null> {
    if (!externalId) return null
    const result = await this.db.query<{ id: string }>(
      `select id
       from vendas_certificados
       where metadata->'payment_charge'->>'external_id' = $1
       order by updated_at desc
       limit 1`,
      [externalId],
    )
    return result.rows[0]?.id ?? null
  }

  async createCheckoutSchedule(input: CreateCheckoutScheduleInput): Promise<void> {
    const agendamento = input.payload.agendamento
    if (!agendamento) return

    await this.db.transaction(async trx => {
      const scheduleId = randomUUID()
      const sql = `
        insert into agendamentos_validacao (
          id, venda_certificado_id, cadastro_base_id, titular_id,
          agente_registro_id, ponto_atendimento_id, data_agendada,
          tipo_atendimento, status_agendamento, observacoes, metadata, created_at, updated_at
        ) values (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9, $10, $11::jsonb, now(), now()
        )
      `
      await trx.query(sql, [
        scheduleId,
        input.vendaId,
        input.cadastroBaseId,
        input.titularId,
        agendamento.agente_registro_id,
        agendamento.ponto_atendimento_id,
        agendamento.data_agendada,
        null,
        'pendente',
        input.payload.observacoes,
        JSON.stringify({ origem: 'checkout_aiven' }),
      ])
    })
  }

  private async findActiveTableAgentLinks(tabelaPrecoId: string): Promise<AgendaEligibilityLink[]> {
    const sql = `
      select tabela_preco_id, agente_registro_id, ponto_atendimento_id, ativo
      from agentes_tabelas_preco
      where ativo = true
        and tabela_preco_id = $1
      order by created_at asc
    `
    const result = await this.db.query<AgendaEligibilityLink>(sql, [tabelaPrecoId])
    return result.rows
  }

  private async findActivePartnerAgentRestrictions(parceiroId: string): Promise<AgendaPartnerRestriction[]> {
    const sql = `
      select parceiro_id, agente_registro_id, ponto_atendimento_id, ativo
      from parceiros_agentes_permitidos
      where ativo = true
        and parceiro_id = $1
      order by created_at asc
    `
    const result = await this.db.query<AgendaPartnerRestriction>(sql, [parceiroId])
    return result.rows
  }

  private async findActiveAgentAvailability(): Promise<AgendaAvailability[]> {
    const sql = `
      select agente_registro_id, ponto_atendimento_id, dia_semana, hora_inicio, hora_fim,
             intervalo_minutos, capacidade_por_slot, tipo_atendimento, ativo
      from agentes_disponibilidade
      where ativo = true
    `
    const result = await this.db.query<AgendaAvailability>(sql)
    return result.rows
  }

  private async findActiveAgentUnavailability(): Promise<AgendaUnavailability[]> {
    const sql = `
      select agente_registro_id, ponto_atendimento_id, inicio_em, fim_em, ativo
      from agentes_indisponibilidades
      where ativo = true
        and fim_em >= now()
    `
    const result = await this.db.query<AgendaUnavailability>(sql)
    return result.rows
  }

  private async findUpcomingBookings(): Promise<AgendaBooking[]> {
    const sql = `
      select agente_registro_id, ponto_atendimento_id, data_agendada as data_hora, status_agendamento as status
      from agendamentos_validacao
      where data_agendada is not null
        and data_agendada >= now()
        and status_agendamento in ('pendente', 'confirmado', 'realizado', 'cancelado')
    `
    const result = await this.db.query<AgendaBooking>(sql)
    return result.rows
  }

  private async findAgentProfilesByIds(agentIds: string[]): Promise<ProfileRow[]> {
    if (agentIds.length === 0) return []

    const sql = `
      select id, nome
      from profiles
      where id = any($1::uuid[])
        and perfil = 'agente_registro'
        and status = 'ativo'
      order by nome asc
    `
    const result = await this.db.query<ProfileRow>(sql, [agentIds])
    return result.rows
  }

  private async findPointsByIds(pointIds: string[]): Promise<PointRow[]> {
    if (pointIds.length === 0) return []

    const sql = `
      select id, nome
      from pontos_atendimento
      where id = any($1::uuid[])
        and status = 'ativo'
      order by nome asc
    `
    const result = await this.db.query<PointRow>(sql, [pointIds])
    return result.rows
  }

  private async findLatestActiveCustomerByDocumentWithClient(client: AivenSqlClient, documento: string) {
    const sql = `
      select id, tipo_cliente, cpf_cnpj, nome, nome_fantasia, email, telefone, cep,
             logradouro, numero, complemento, bairro, cidade, uf
      from cadastros_base
      where status = 'ativo'
        and (
          cpf_cnpj = $1::text
          or cpf_cnpj = $2::text
        )
      order by updated_at desc
      limit 1
    `
    const digits = onlyDigits(documento)
    const masked = formatCpfCnpj(digits)
    const result = await client.query<CheckoutExistingCustomerLookup>(sql, [digits, masked])
    return result.rows[0] ?? null
  }
}

function formatCpfCnpj(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2')
  }
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}
