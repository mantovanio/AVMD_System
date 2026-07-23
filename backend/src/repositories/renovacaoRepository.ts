import type { AivenSqlClient } from '../db/aivenClient.js'
import { normalizePhoneBR } from '../utils/phone.js'

export interface RenovacaoRow {
  id: string
  pedido: string | null
  protocolo: string | null
  data_vencimento: string
  cliente: string
  email: string | null
  telefone: string | null
  tipo_certificado: string
  valor: number | null
  status: string
  renovado: boolean
  observacoes: string | null
  cpf: string | null
  cnpj: string | null
  razao_social: string | null
  agr: string | null
  vendedor: string | null
  contador: string | null
  ultimo_lembrete: string | null
  enviou_email: boolean
  enviou_whatsapp: boolean
  venda_certificado_id: string | null
  produto_emitido_id: string | null
  cadastro_base_id: string | null
  empresa_id: string | null
  titular_id: string | null
  vendedor_fk_id: string | null
  agente_registro_fk_id: string | null
  contador_fk_id: string | null
  snapshot_json: Record<string, unknown>
  deleted_at: string | null
  deleted_by: string | null
  motivo_exclusao: string | null
  created_at: string
  updated_at: string
}

export type CreateRenovacaoInput = Pick<RenovacaoRow,
  'data_vencimento' | 'cliente' | 'tipo_certificado'
> & Partial<Omit<RenovacaoRow, 'id' | 'created_at' | 'updated_at' | 'data_vencimento' | 'cliente' | 'tipo_certificado'>>

export type UpdateRenovacaoInput = Partial<Omit<RenovacaoRow, 'id' | 'created_at'>>

export class RenovacaoRepository {
  constructor(private readonly db: AivenSqlClient) {}

  private readonly listColumns = [
    'id',
    'pedido',
    'protocolo',
    'data_vencimento',
    'cliente',
    'email',
    'telefone',
    'tipo_certificado',
    'valor',
    'status',
    'renovado',
    'observacoes',
    'cpf',
    'cnpj',
    'razao_social',
    'agr',
    'vendedor',
    'contador',
    'ultimo_lembrete',
    'enviou_email',
    'enviou_whatsapp',
    'created_at',
    'updated_at',
  ].join(', ')

  async reconcileConvertedFromSales(): Promise<number> {
    const result = await this.db.query<{ id: string }>(
      `WITH matched AS (
         SELECT r.id
           FROM renovacoes r
          WHERE r.deleted_at IS NULL
            AND coalesce(r.renovado, false) = false
            AND r.status IN ('pendente', 'contatado')
            AND EXISTS (
              SELECT 1
                FROM vendas_certificados v
                LEFT JOIN cadastros_base cb ON cb.id = v.cadastro_base_id
               WHERE coalesce(v.status_venda, '') <> 'cancelado'
                 AND (
                   coalesce(v.pago, false) = true
                   OR coalesce(v.status_pagamento, '') = 'pago'
                   OR coalesce(v.status_venda, '') IN ('vendido', 'agendado', 'em_validacao', 'emitido')
                 )
                 AND coalesce(v.data_inicio_validade::date, v.created_at::date) >= (r.data_vencimento::date - INTERVAL '180 days')
                 AND (
                   (nullif(regexp_replace(coalesce(r.protocolo, ''), '\\D', '', 'g'), '') IS NOT NULL
                    AND nullif(regexp_replace(coalesce(r.protocolo, ''), '\\D', '', 'g'), '') IN (
                      nullif(regexp_replace(coalesce(v.protocolo_numero, ''), '\\D', '', 'g'), ''),
                      nullif(regexp_replace(coalesce(v.metadata->'safeweb_financeiro'->'emissao'->>'protocolo_renovacao', ''), '\\D', '', 'g'), '')
                    ))
                   OR (r.cadastro_base_id IS NOT NULL AND v.cadastro_base_id = r.cadastro_base_id)
                   OR nullif(regexp_replace(coalesce(v.documento_faturamento, cb.cpf_cnpj, v.metadata->'safeweb_financeiro'->>'documento', ''), '\\D', '', 'g'), '') IN (
                     nullif(regexp_replace(coalesce(r.cpf, ''), '\\D', '', 'g'), ''),
                     nullif(regexp_replace(coalesce(r.cnpj, ''), '\\D', '', 'g'), '')
                   )
                   OR nullif(regexp_replace(coalesce(v.metadata->'safeweb_financeiro'->>'documento_titular', ''), '\\D', '', 'g'), '') IN (
                     nullif(regexp_replace(coalesce(r.cpf, ''), '\\D', '', 'g'), ''),
                     nullif(regexp_replace(coalesce(r.cnpj, ''), '\\D', '', 'g'), '')
                   )
                 )
                 AND (
                   regexp_replace(lower(coalesce(r.tipo_certificado, '')), '[^a-z0-9]+', '', 'g') = ''
                   OR regexp_replace(lower(coalesce(v.tipo_produto, '')), '[^a-z0-9]+', '', 'g') = ''
                   OR position(
                     regexp_replace(lower(coalesce(r.tipo_certificado, '')), '[^a-z0-9]+', '', 'g')
                     in regexp_replace(lower(coalesce(v.tipo_produto, '')), '[^a-z0-9]+', '', 'g')
                   ) > 0
                   OR position(
                     regexp_replace(lower(coalesce(v.tipo_produto, '')), '[^a-z0-9]+', '', 'g')
                     in regexp_replace(lower(coalesce(r.tipo_certificado, '')), '[^a-z0-9]+', '', 'g')
                   ) > 0
                 )
            )
       ), updated AS (
         UPDATE renovacoes r
            SET status = 'convertido',
                renovado = true,
                observacoes = concat_ws(E'\n', nullif(r.observacoes, ''), 'Convertido automaticamente: venda/pedido localizado no Comercial.'),
                updated_at = now()
           FROM matched m
          WHERE r.id = m.id
          RETURNING r.id
       ), cancelled AS (
         DELETE FROM communication_outbox o
          USING updated u
          WHERE o.status = 'pending'
            AND o.payload->>'renovacao_id' = u.id::text
            AND coalesce(o.payload->>'tipo', '') LIKE 'renovacao%'
            AND o.scheduled_for > now()
          RETURNING o.id
       )
       SELECT id FROM updated`,
    )
    return result.rows.length
  }

  async findAll(limit = 500, offset = 0): Promise<RenovacaoRow[]> {
    const result = await this.db.query<RenovacaoRow>(
      `SELECT ${this.listColumns} FROM renovacoes
       WHERE deleted_at IS NULL
       ORDER BY data_vencimento ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    )
    return result.rows
  }
  async findOperacionais(janelaDias = 30, limit = 500, offset = 0): Promise<RenovacaoRow[]> {
    await this.reconcileConvertedFromSales()
    const result = await this.db.query<RenovacaoRow>(
      `SELECT ${this.listColumns} FROM renovacoes
       WHERE deleted_at IS NULL
         AND coalesce(renovado, false) = false
         AND status NOT IN ('convertido', 'perdido')
         AND data_vencimento >= (CURRENT_DATE - ($1 || ' days')::interval)
       ORDER BY data_vencimento ASC
       LIMIT $2 OFFSET $3`,
      [janelaDias, limit, offset],
    )
    return result.rows
  }

  async findHistorico(janelaDias = 30, limit = 500, offset = 0): Promise<RenovacaoRow[]> {
    const result = await this.db.query<RenovacaoRow>(
      `SELECT ${this.listColumns} FROM renovacoes
       WHERE deleted_at IS NULL
         AND data_vencimento < (CURRENT_DATE - ($1 || ' days')::interval)
       ORDER BY data_vencimento DESC
       LIMIT $2 OFFSET $3`,
      [janelaDias, limit, offset],
    )
    return result.rows
  }

  async findByIds(ids: string[]): Promise<RenovacaoRow[]> {
    if (!ids.length) return []
    const phs = ids.map((_, i) => `$${i + 1}`).join(', ')
    const result = await this.db.query<RenovacaoRow>(
      `SELECT * FROM renovacoes WHERE id IN (${phs}) AND deleted_at IS NULL`,
      ids,
    )
    return result.rows
  }

  async findPendentesN8n(): Promise<RenovacaoRow[]> {
    await this.reconcileConvertedFromSales()
    const result = await this.db.query<RenovacaoRow>(
      `SELECT * FROM renovacoes
       WHERE deleted_at IS NULL
         AND status IN ('pendente','contatado')
         AND coalesce(renovado, false) = false
         AND data_vencimento >= (CURRENT_DATE - INTERVAL '10 days')
         AND NOT EXISTS (
           SELECT 1
             FROM vendas_certificados v
             LEFT JOIN cadastros_base cb ON cb.id = v.cadastro_base_id
            WHERE coalesce(v.status_venda, '') <> 'cancelado'
              AND (
                coalesce(v.pago, false) = true
                OR coalesce(v.status_pagamento, '') = 'pago'
                OR coalesce(v.status_venda, '') IN ('vendido', 'agendado', 'em_validacao', 'emitido')
              )
              AND coalesce(v.data_inicio_validade::date, v.created_at::date) >= (renovacoes.data_vencimento::date - INTERVAL '180 days')
              AND (
                (nullif(regexp_replace(coalesce(renovacoes.protocolo, ''), '\\D', '', 'g'), '') IS NOT NULL
                 AND nullif(regexp_replace(coalesce(renovacoes.protocolo, ''), '\\D', '', 'g'), '') IN (
                   nullif(regexp_replace(coalesce(v.protocolo_numero, ''), '\\D', '', 'g'), ''),
                   nullif(regexp_replace(coalesce(v.metadata->'safeweb_financeiro'->'emissao'->>'protocolo_renovacao', ''), '\\D', '', 'g'), '')
                 ))
                OR (renovacoes.cadastro_base_id IS NOT NULL AND v.cadastro_base_id = renovacoes.cadastro_base_id)
                OR nullif(regexp_replace(coalesce(v.documento_faturamento, cb.cpf_cnpj, v.metadata->'safeweb_financeiro'->>'documento', ''), '\\D', '', 'g'), '') IN (
                  nullif(regexp_replace(coalesce(renovacoes.cpf, ''), '\\D', '', 'g'), ''),
                  nullif(regexp_replace(coalesce(renovacoes.cnpj, ''), '\\D', '', 'g'), '')
                )
                OR nullif(regexp_replace(coalesce(v.metadata->'safeweb_financeiro'->>'documento_titular', ''), '\\D', '', 'g'), '') IN (
                  nullif(regexp_replace(coalesce(renovacoes.cpf, ''), '\\D', '', 'g'), ''),
                  nullif(regexp_replace(coalesce(renovacoes.cnpj, ''), '\\D', '', 'g'), '')
                )
              )
         )
       ORDER BY data_vencimento ASC`,
    )
    return result.rows
  }

  async findById(id: string): Promise<RenovacaoRow | null> {
    const result = await this.db.query<RenovacaoRow>(
      `SELECT * FROM renovacoes WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  async findLatestByPhone(phoneDigits: string): Promise<RenovacaoRow | null> {
    if (!phoneDigits) return null
    const normalized = normalizePhoneBR(phoneDigits)
    if (!normalized) return null
    const result = await this.db.query<RenovacaoRow>(
      `SELECT *
         FROM renovacoes
        WHERE deleted_at IS NULL
          AND fn_normalize_phone_br(telefone) = $1
        ORDER BY
          CASE
            WHEN renovado = false AND status IN ('pendente', 'contatado') THEN 0
            WHEN renovado = false THEN 1
            ELSE 2
          END,
          ABS(EXTRACT(EPOCH FROM (data_vencimento::timestamp - CURRENT_DATE::timestamp))) ASC,
          updated_at DESC
        LIMIT 1`,
      [normalized],
    )
    return result.rows[0] ?? null
  }

  async create(input: CreateRenovacaoInput): Promise<RenovacaoRow> {
    const result = await this.db.query<RenovacaoRow>(
      `INSERT INTO renovacoes (
        pedido, protocolo, data_vencimento, cliente, email, telefone,
        tipo_certificado, valor, status, renovado, observacoes,
        cpf, cnpj, razao_social, agr, vendedor, contador, snapshot_json
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        input.pedido ?? null,
        input.protocolo ?? null,
        input.data_vencimento,
        input.cliente,
        input.email ?? null,
        input.telefone ?? null,
        input.tipo_certificado,
        input.valor ?? null,
        input.status ?? 'pendente',
        input.renovado ?? false,
        input.observacoes ?? null,
        input.cpf ?? null,
        input.cnpj ?? null,
        input.razao_social ?? null,
        input.agr ?? null,
        input.vendedor ?? null,
        input.contador ?? null,
        JSON.stringify(input.snapshot_json ?? {}),
      ],
    )
    return result.rows[0]
  }

  async bulkCreate(inputs: CreateRenovacaoInput[]): Promise<number> {
    if (inputs.length === 0) return 0
    const chunkSize = 300
    let inserted = 0

    for (let start = 0; start < inputs.length; start += chunkSize) {
      const chunk = inputs.slice(start, start + chunkSize)
      const params: unknown[] = []
      const valuesSql: string[] = []

      for (const input of chunk) {
        const base = params.length
        params.push(
          input.pedido ?? null,
          input.protocolo ?? null,
          input.data_vencimento,
          input.cliente,
          input.email ?? null,
          input.telefone ?? null,
          input.tipo_certificado,
          input.valor ?? null,
          input.status ?? 'pendente',
          input.renovado ?? false,
          input.observacoes ?? null,
          input.cpf ?? null,
          input.cnpj ?? null,
          input.razao_social ?? null,
          input.agr ?? null,
          input.vendedor ?? null,
          input.contador ?? null,
          JSON.stringify(input.snapshot_json ?? {}),
        )
        const placeholders = Array.from({ length: 18 }, (_, i) => `$${base + i + 1}`).join(',')
        valuesSql.push(`(${placeholders})`)
      }

      await this.db.query(
        `INSERT INTO renovacoes (
          pedido, protocolo, data_vencimento, cliente, email, telefone,
          tipo_certificado, valor, status, renovado, observacoes,
          cpf, cnpj, razao_social, agr, vendedor, contador, snapshot_json
         ) VALUES ${valuesSql.join(',')}`,
        params,
      )
      inserted += chunk.length
    }

    return inserted
  }

  async update(id: string, input: UpdateRenovacaoInput): Promise<RenovacaoRow | null> {
    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1

    const field = (col: string, val: unknown) => { sets.push(`${col} = $${idx++}`); params.push(val) }

    if (input.status !== undefined)        field('status', input.status)
    if (input.renovado !== undefined)      field('renovado', input.renovado)
    if (input.email !== undefined)         field('email', input.email)
    if (input.telefone !== undefined)      field('telefone', input.telefone)
    if (input.observacoes !== undefined)   field('observacoes', input.observacoes)
    if (input.ultimo_lembrete !== undefined) field('ultimo_lembrete', input.ultimo_lembrete)
    if (input.enviou_email !== undefined)    field('enviou_email', input.enviou_email)
    if (input.enviou_whatsapp !== undefined) field('enviou_whatsapp', input.enviou_whatsapp)
    if (input.deleted_at !== undefined)    field('deleted_at', input.deleted_at)
    if (input.deleted_by !== undefined)    field('deleted_by', input.deleted_by)
    if (input.motivo_exclusao !== undefined) field('motivo_exclusao', input.motivo_exclusao)

    if (sets.length === 0) return this.findById(id)

    sets.push('updated_at = NOW()')
    params.push(id)

    const result = await this.db.query<RenovacaoRow>(
      `UPDATE renovacoes SET ${sets.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
      params,
    )
    return result.rows[0] ?? null
  }

  async bulkUpdate(ids: string[], input: UpdateRenovacaoInput): Promise<number> {
    if (ids.length === 0) return 0
    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1

    const field = (col: string, val: unknown) => { sets.push(`${col} = $${idx++}`); params.push(val) }

    if (input.status !== undefined)      field('status', input.status)
    if (input.renovado !== undefined)    field('renovado', input.renovado)
    if (input.deleted_at !== undefined)  field('deleted_at', input.deleted_at)
    if (input.deleted_by !== undefined)  field('deleted_by', input.deleted_by)
    if (input.motivo_exclusao !== undefined) field('motivo_exclusao', input.motivo_exclusao)

    if (sets.length === 0) return 0

    sets.push('updated_at = NOW()')
    const placeholders = ids.map((_, i) => `$${idx + i}`).join(',')
    params.push(...ids)

    const result = await this.db.query<{ id: string }>(
      `UPDATE renovacoes SET ${sets.join(', ')} WHERE id IN (${placeholders}) AND deleted_at IS NULL RETURNING id`,
      params,
    )
    return result.rows.length
  }

  async handleSaleRenewal(input: {
    cadastro_base_id: string | null
    tipo_produto: string
    certificado_id: string | null
    cliente_nome: string | null
    cpf: string | null
    cnpj: string | null
    email: string | null
    telefone: string | null
    valor_venda: number | null
    venda_id: string
    data_referencia?: string | null
  }): Promise<{ converted: boolean; newRenewalId: string | null }> {
    let converted = false

    if (input.cadastro_base_id && input.tipo_produto) {
      const existing = await this.db.query<{ id: string }>(
        `SELECT id FROM renovacoes
         WHERE cadastro_base_id = $1
           AND tipo_certificado = $2
           AND deleted_at IS NULL
           AND status NOT IN ('convertido', 'perdido')
         ORDER BY data_vencimento DESC
         LIMIT 1`,
        [input.cadastro_base_id, input.tipo_produto],
      )
      if (existing.rows[0]) {
        await this.update(existing.rows[0].id, { status: 'convertido', renovado: true })
        converted = true
      }
    }

    let validadeMeses = 12
    if (input.certificado_id) {
      const cert = await this.db.query<{ validade_meses: number | null }>(
        `SELECT validade_meses FROM certificados WHERE id = $1 AND ativo = true LIMIT 1`,
        [input.certificado_id],
      )
      if (cert.rows[0]?.validade_meses && cert.rows[0].validade_meses > 0) {
        validadeMeses = cert.rows[0].validade_meses
      }
    }

    const dataVencimento = input.data_referencia ? new Date(input.data_referencia) : new Date()
    if (Number.isNaN(dataVencimento.getTime())) {
      dataVencimento.setTime(Date.now())
    }
    dataVencimento.setMonth(dataVencimento.getMonth() + validadeMeses)

    const result = await this.db.query<{ id: string }>(
      `INSERT INTO renovacoes (
        data_vencimento, cliente, tipo_certificado, valor, status, renovado,
        cpf, cnpj, email, telefone, venda_certificado_id, cadastro_base_id,
        observacoes, snapshot_json
      ) VALUES ($1, $2, $3, $4, 'pendente', false, $5, $6, $7, $8, $9, $10,
        'Renovação automática criada na venda', $11)
      RETURNING id`,
      [
        dataVencimento.toISOString().slice(0, 10),
        input.cliente_nome ?? 'Cliente',
        input.tipo_produto,
        input.valor_venda ?? null,
        input.cpf ?? null,
        input.cnpj ?? null,
        input.email ?? null,
        input.telefone ?? null,
        input.venda_id,
        input.cadastro_base_id ?? null,
        JSON.stringify({ origem: 'venda_automatica', validade_meses: validadeMeses }),
      ],
    )

    return { converted, newRenewalId: result.rows[0]?.id ?? null }
  }
}
