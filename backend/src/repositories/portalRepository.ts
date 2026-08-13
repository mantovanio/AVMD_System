import type { AivenSqlClient } from '../db/aivenClient.js'
import type { CheckoutRepository } from './checkoutRepository.js'
import type { PaymentOptionRow } from './checkoutRepository.js'
import type { ProfileRow } from './profileRepository.js'
import { CommercialRepository } from './commercialRepository.js'

export type PortalOrderRow = {
  id: string
  created_at: string
  status_venda: string | null
  pago: boolean
  valor_venda: number | null
  tipo_produto: string | null
  pedido_status: string | null
  protocolo_status: string | null
  protocolo_numero: string | null
  nome_faturamento: string | null
  email_faturamento: string | null
  telefone_faturamento: string | null
  forma_pagamento_id: string | null
  forma_pagamento_nome: string | null
  payment_charge_status: string | null
  payment_charge_url: string | null
  payment_charge_details: Record<string, unknown> | null
  nfse_numero: string | null
  nfse_status: string | null
  nfse_pdf_url: string | null
  nfse_xml_url: string | null
  agendamento_id: string | null
  data_agendada: string | null
  status_agendamento: string | null
  agente_nome: string | null
  ponto_nome: string | null
}

type AuthorizedSale = {
  id: string
  tabela_preco_id: string
  forma_pagamento_id: string | null
  valor: number
  descricao: string
  nome: string
  email: string
  telefone: string
  documento: string
  cep: string
  logradouro: string
  numero: string
  bairro: string
  cidade: string
  uf: string
  pago: boolean
  loja_owner_tipo: string | null
  loja_owner_parceiro_id: string | null
  agendamento_id: string | null
}

export class PortalRepository {
  constructor(
    private readonly db: AivenSqlClient,
    private readonly checkoutRepository: CheckoutRepository,
    private readonly commercialRepository: CommercialRepository,
  ) {}

  async listOrdersByEmail(email: string): Promise<PortalOrderRow[]> {
    const matcher = this.buildEmailMatcher(email)
    if (!matcher.hasAny) return []

    const result = await this.db.query<PortalOrderRow>(
      `select
         v.id,
         v.created_at,
         v.status_venda,
         v.pago,
         v.valor_venda,
         v.tipo_produto,
         v.pedido_status,
         v.protocolo_status,
         v.protocolo_numero,
         v.nome_faturamento,
         v.email_faturamento,
         v.telefone_faturamento,
         v.forma_pagamento_id,
         fp.nome as forma_pagamento_nome,
         nullif(coalesce(v.metadata->'payment_charge'->>'status', ''), '') as payment_charge_status,
         nullif(coalesce(v.metadata->'payment_charge'->>'charge_url', ''), '') as payment_charge_url,
         v.metadata->'payment_charge'->'details' as payment_charge_details,
         nf.numero_nf as nfse_numero,
         nf.status_nf as nfse_status,
         nf.pdf_url as nfse_pdf_url,
         nf.xml_url as nfse_xml_url,
         av.id as agendamento_id,
         av.data_agendada,
         av.status_agendamento,
         ag.nome as agente_nome,
         pa.nome as ponto_nome
       from vendas_certificados v
       left join cadastros_base cb on cb.id = v.cadastro_base_id
       left join titulares_certificado t on t.id = v.titular_id
       left join formas_pagamento_v2 fp on fp.id = v.forma_pagamento_id
       left join lateral (
         select n.numero_nf, n.status_nf, n.pdf_url, n.xml_url
         from nfse_emitidas n
         where n.venda_certificado_id = v.id
         order by n.created_at desc
         limit 1
       ) nf on true
       left join lateral (
         select a.id, a.data_agendada, a.status_agendamento, a.agente_registro_id, a.ponto_atendimento_id
         from agendamentos_validacao a
         where a.venda_certificado_id = v.id
         order by coalesce(a.data_agendada, a.created_at) desc, a.created_at desc
         limit 1
       ) av on true
       left join profiles ag on ag.id = av.agente_registro_id
       left join pontos_atendimento pa on pa.id = av.ponto_atendimento_id
       where ${matcher.whereSql}
       order by v.created_at desc
       limit 30`,
      matcher.params,
    )
    return result.rows
  }

  async listPaymentMethods(): Promise<PaymentOptionRow[]> {
    return this.checkoutRepository.findActivePaymentMethods()
  }

  async getScheduleContext(email: string, saleId: string) {
    const sale = await this.findAuthorizedSale(email, saleId)
    if (!sale) return null

    return this.checkoutRepository.getCheckoutScheduleContext({
      tabelaPrecoId: sale.tabela_preco_id,
      parceiroId: sale.loja_owner_tipo === 'parceiro' ? sale.loja_owner_parceiro_id : null,
    })
  }

  async saveSchedule(email: string, input: {
    saleId: string
    agente_registro_id: string
    ponto_atendimento_id: string
    data_agendada: string
  }) {
    const sale = await this.findAuthorizedSale(email, input.saleId)
    if (!sale) return null

    return this.commercialRepository.saveValidationAgenda({
      agendaId: sale.agendamento_id,
      vendaId: sale.id,
      agente_registro_id: input.agente_registro_id,
      ponto_atendimento_id: input.ponto_atendimento_id,
      data_agendada: input.data_agendada,
      tipo_atendimento: 'videoconferencia',
      observacoes: 'Agendamento realizado pelo portal do cliente.',
      status_agendamento: 'pendente',
    })
  }

  async findAuthorizedPaymentSale(email: string, saleId: string): Promise<AuthorizedSale | null> {
    return this.findAuthorizedSale(email, saleId)
  }

  async changePaymentMethod(email: string, input: { saleId: string; formaPagamentoId: string }) {
    const sale = await this.findAuthorizedSale(email, input.saleId)
    if (!sale) return null
    if (sale.pago) throw new Error('Este pedido já está pago. A forma de pagamento não pode mais ser alterada pelo portal.')

    const result = await this.db.query<Record<string, unknown>>(
      `update vendas_certificados venda
          set forma_pagamento_id = forma.id,
              status_pagamento = 'em_aberto',
              pago = false,
              data_pagamento = null,
              metadata = coalesce(venda.metadata, '{}'::jsonb) || jsonb_build_object(
                'forma_pagamento', forma.nome,
                'payment_method_id', forma.gateway,
                'payment_method_label', forma.nome,
                'forma_pagamento_alterada_por', 'portal_cliente',
                'forma_pagamento_alterada_em', now(),
                'payment_charge_history',
                  case
                    when venda.metadata->'payment_charge' is null then coalesce(venda.metadata->'payment_charge_history', '[]'::jsonb)
                    else coalesce(venda.metadata->'payment_charge_history', '[]'::jsonb)
                      || jsonb_build_array(
                        (venda.metadata->'payment_charge') || jsonb_build_object(
                          'status', 'substituido',
                          'substituido_em', now(),
                          'substituido_por', 'portal_cliente',
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
                      'substituido_por', 'portal_cliente',
                      'nova_forma_pagamento_id', $2::text
                    )
                  end
              ),
              updated_at = now()
        from formas_pagamento_v2 forma
        where venda.id = $1::uuid
          and forma.id = $2::uuid
          and forma.ativo = true
        returning venda.id`,
      [input.saleId, input.formaPagamentoId],
    )
    return result.rows[0] ?? null
  }

  private async findAuthorizedSale(email: string, saleId: string): Promise<AuthorizedSale | null> {
    const matcher = this.buildEmailMatcher(email, 2)
    if (!matcher.hasAny) return null

    const result = await this.db.query<AuthorizedSale>(
       `select
         v.id,
         v.tabela_preco_id,
         v.forma_pagamento_id,
         coalesce(v.valor_venda, 0)::float8 as valor,
         coalesce(v.tipo_produto, 'Certificado digital') as descricao,
         coalesce(v.nome_faturamento, cb.nome, 'Cliente') as nome,
         coalesce(v.email_faturamento, cb.email, '') as email,
         coalesce(v.telefone_faturamento, cb.telefone, '') as telefone,
         coalesce(v.documento_faturamento, cb.cpf_cnpj, '') as documento,
         coalesce(v.cep, cb.cep, '') as cep,
         coalesce(v.logradouro, cb.logradouro, '') as logradouro,
         coalesce(v.numero, cb.numero, '') as numero,
         coalesce(v.bairro, cb.bairro, '') as bairro,
         coalesce(v.cidade, cb.cidade, '') as cidade,
         coalesce(v.uf, cb.uf, '') as uf,
         coalesce(v.pago, false) as pago,
         lm.owner_tipo as loja_owner_tipo,
         lm.owner_parceiro_id as loja_owner_parceiro_id,
         av.id as agendamento_id
       from vendas_certificados v
       left join cadastros_base cb on cb.id = v.cadastro_base_id
       left join titulares_certificado t on t.id = v.titular_id
       left join lojas_marketplace lm on lm.id = v.loja_marketplace_id
       left join lateral (
         select a.id
         from agendamentos_validacao a
         where a.venda_certificado_id = v.id
         order by coalesce(a.data_agendada, a.created_at) desc, a.created_at desc
         limit 1
       ) av on true
       where v.id = $1::uuid
         and ${matcher.whereSql}
       limit 1`,
      [saleId, ...matcher.params],
    )

    return result.rows[0] ?? null
  }

  private buildEmailMatcher(emailValue: string, startIndex = 1) {
    const clauses: string[] = []
    const params: string[] = []
    let idx = startIndex

    const email = String(emailValue ?? '').trim().toLowerCase()
    if (email) {
      clauses.push(`lower(coalesce(v.email_faturamento, '')) = $${idx}`)
      params.push(email)
      idx += 1
      clauses.push(`lower(coalesce(cb.email, '')) = $${idx}`)
      params.push(email)
      idx += 1
      clauses.push(`lower(coalesce(t.email, '')) = $${idx}`)
      params.push(email)
      idx += 1
    }

    return {
      hasAny: clauses.length > 0,
      whereSql: clauses.length > 0 ? `(${clauses.join(' or ')})` : 'false',
      params,
    }
  }
}
