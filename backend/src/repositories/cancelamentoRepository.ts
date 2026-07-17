import type { AivenSqlClient } from '../db/aivenClient.js'

export type CancelamentoRow = {
  id: string
  venda_id: string
  motivo: string
  dentro_prazo_30d: boolean
  valor_reembolsado: number | null
  custo_operacional: number
  comissao_vendedor_revertida: number
  comissao_agente_revertida: number
  estorno_gateway_ref: string | null
  estorno_realizado: boolean
  observacoes: string | null
  cancelado_por: string | null
  created_at: string
}

export type CreateCancelamentoInput = {
  venda_id: string
  motivo: string
  dentro_prazo_30d: boolean
  valor_reembolsado?: number | null
  custo_operacional?: number
  comissao_vendedor_revertida: number
  comissao_agente_revertida: number
  estorno_gateway_ref?: string | null
  estorno_realizado?: boolean
  observacoes?: string | null
  cancelado_por: string
}

export class CancelamentoRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async create(input: CreateCancelamentoInput): Promise<CancelamentoRow> {
    const result = await this.db.query<CancelamentoRow>(
      `insert into cancelamentos_venda (
        venda_id, motivo, dentro_prazo_30d,
        valor_reembolsado, custo_operacional,
        comissao_vendedor_revertida, comissao_agente_revertida,
        estorno_gateway_ref, estorno_realizado,
        observacoes, cancelado_por
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
      )
      returning *`,
      [
        input.venda_id,
        input.motivo,
        input.dentro_prazo_30d,
        input.valor_reembolsado ?? null,
        input.custo_operacional ?? 0,
        input.comissao_vendedor_revertida,
        input.comissao_agente_revertida,
        input.estorno_gateway_ref ?? null,
        input.estorno_realizado ?? false,
        input.observacoes ?? null,
        input.cancelado_por,
      ],
    )
    return result.rows[0]
  }

  async createAndCancelSale(input: CreateCancelamentoInput): Promise<CancelamentoRow> {
    return this.db.transaction(async trx => {
      const inserted = await trx.query<CancelamentoRow>(
        `insert into cancelamentos_venda (
          venda_id, motivo, dentro_prazo_30d,
          valor_reembolsado, custo_operacional,
          comissao_vendedor_revertida, comissao_agente_revertida,
          estorno_gateway_ref, estorno_realizado,
          observacoes, cancelado_por
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
        )
        returning *`,
        [
          input.venda_id,
          input.motivo,
          input.dentro_prazo_30d,
          input.valor_reembolsado ?? null,
          input.custo_operacional ?? 0,
          input.comissao_vendedor_revertida,
          input.comissao_agente_revertida,
          input.estorno_gateway_ref ?? null,
          input.estorno_realizado ?? false,
          input.observacoes ?? null,
          input.cancelado_por,
        ],
      )

      await trx.query(
        `update vendas_certificados
         set status_venda = 'cancelado',
             pedido_status = 'cancelado',
             protocolo_status = case when protocolo_status = 'nao_gerado' then protocolo_status else protocolo_status end,
             metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
               'cancelamento_operacional', jsonb_build_object(
                 'cancelado_em', now(),
                 'cancelado_por', $2::text,
                 'motivo', $3::text
               )
             ),
             updated_at = now()
         where id = $1::uuid`,
        [input.venda_id, input.cancelado_por, input.motivo],
      )

      return inserted.rows[0]
    })
  }

  async findByVendaId(vendaId: string): Promise<CancelamentoRow | null> {
    const result = await this.db.query<CancelamentoRow>(
      'select * from cancelamentos_venda where venda_id = $1 limit 1',
      [vendaId],
    )
    return result.rows[0] ?? null
  }

  async list(limit = 50, offset = 0): Promise<CancelamentoRow[]> {
    const result = await this.db.query<CancelamentoRow>(
      'select * from cancelamentos_venda order by created_at desc limit $1 offset $2',
      [limit, offset],
    )
    return result.rows
  }
}
