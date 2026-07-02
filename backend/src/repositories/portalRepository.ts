import type { AivenSqlClient } from '../db/aivenClient.js'
import type { CheckoutRepository } from './checkoutRepository.js'
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
  payment_charge_status: string | null
  agendamento_id: string | null
  data_agendada: string | null
  status_agendamento: string | null
  agente_nome: string | null
  ponto_nome: string | null
}

type AuthorizedSale = {
  id: string
  tabela_preco_id: string
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

  async listOrders(profile: ProfileRow): Promise<PortalOrderRow[]> {
    const matcher = this.buildProfileMatcher(profile)
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
         nullif(coalesce(v.metadata->'payment_charge'->>'status', ''), '') as payment_charge_status,
         av.id as agendamento_id,
         av.data_agendada,
         av.status_agendamento,
         ag.nome as agente_nome,
         pa.nome as ponto_nome
       from vendas_certificados v
       left join cadastros_base cb on cb.id = v.cadastro_base_id
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

  async getScheduleContext(profile: ProfileRow, saleId: string) {
    const sale = await this.findAuthorizedSale(profile, saleId)
    if (!sale) return null

    return this.checkoutRepository.getCheckoutScheduleContext({
      tabelaPrecoId: sale.tabela_preco_id,
      parceiroId: sale.loja_owner_tipo === 'parceiro' ? sale.loja_owner_parceiro_id : null,
    })
  }

  async saveSchedule(profile: ProfileRow, input: {
    saleId: string
    agente_registro_id: string
    ponto_atendimento_id: string
    data_agendada: string
  }) {
    const sale = await this.findAuthorizedSale(profile, input.saleId)
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

  private async findAuthorizedSale(profile: ProfileRow, saleId: string): Promise<AuthorizedSale | null> {
    const matcher = this.buildProfileMatcher(profile, 2)
    if (!matcher.hasAny) return null

    const result = await this.db.query<AuthorizedSale>(
      `select
         v.id,
         v.tabela_preco_id,
         lm.owner_tipo as loja_owner_tipo,
         lm.owner_parceiro_id as loja_owner_parceiro_id,
         av.id as agendamento_id
       from vendas_certificados v
       left join cadastros_base cb on cb.id = v.cadastro_base_id
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

  private buildProfileMatcher(profile: ProfileRow, startIndex = 1) {
    const clauses: string[] = []
    const params: string[] = []
    let idx = startIndex

    const email = String(profile.email ?? '').trim().toLowerCase()
    if (email) {
      clauses.push(`lower(coalesce(v.email_faturamento, '')) = $${idx}`)
      params.push(email)
      idx += 1
      clauses.push(`lower(coalesce(cb.email, '')) = $${idx}`)
      params.push(email)
      idx += 1
    }

    const documento = onlyDigits(profile.documento)
    if (documento) {
      clauses.push(`regexp_replace(coalesce(v.documento_faturamento, ''), '\D', '', 'g') = $${idx}`)
      params.push(documento)
      idx += 1
      clauses.push(`regexp_replace(coalesce(cb.cpf_cnpj, ''), '\D', '', 'g') = $${idx}`)
      params.push(documento)
      idx += 1
    }

    const telefone = rightPhone(profile.telefone)
    if (telefone) {
      clauses.push(`right(regexp_replace(coalesce(v.telefone_faturamento, ''), '\D', '', 'g'), 11) = $${idx}`)
      params.push(telefone)
      idx += 1
      clauses.push(`right(regexp_replace(coalesce(cb.telefone, ''), '\D', '', 'g'), 11) = $${idx}`)
      params.push(telefone)
      idx += 1
    }

    return {
      hasAny: clauses.length > 0,
      whereSql: clauses.length > 0 ? `(${clauses.join(' or ')})` : 'false',
      params,
    }
  }
}

function onlyDigits(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '')
}

function rightPhone(value: string | null | undefined) {
  const digits = onlyDigits(value)
  return digits ? digits.slice(-11) : ''
}
