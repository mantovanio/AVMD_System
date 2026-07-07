import type { AivenSqlClient } from '../db/aivenClient.js'

export interface LinkProdutoRow {
  id: string
  tipo_certificado: string
  link_renovacao: string | null
  link_nova_emissao: string | null
  descricao: string | null
  ativo: boolean
  whatsapp_template_id: string | null
  created_at: string
  updated_at: string
}

export type CreateLinkInput = Omit<LinkProdutoRow, 'id' | 'created_at' | 'updated_at'>
export type UpdateLinkInput = Partial<Omit<LinkProdutoRow, 'id' | 'created_at'>>

export class LinksProdutosRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async findById(id: string): Promise<LinkProdutoRow | null> {
    const result = await this.db.query<LinkProdutoRow>(
      `SELECT * FROM links_produtos WHERE id = $1 LIMIT 1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  async findAll(): Promise<LinkProdutoRow[]> {
    const result = await this.db.query<LinkProdutoRow>(
      `SELECT * FROM links_produtos ORDER BY tipo_certificado ASC`,
    )
    return result.rows
  }

  async findBestByTipoCertificado(tipoCertificado: string): Promise<LinkProdutoRow | null> {
    const tipo = String(tipoCertificado ?? '').trim()
    if (!tipo) return null

    const result = await this.db.query<LinkProdutoRow>(
      `SELECT *
         FROM links_produtos
        WHERE ativo = true
          AND (
            lower(tipo_certificado) = lower($1)
            OR position(lower(tipo_certificado) in lower($1)) > 0
          )
        ORDER BY
          CASE WHEN lower(tipo_certificado) = lower($1) THEN 0 ELSE 1 END,
          length(tipo_certificado) DESC,
          updated_at DESC
        LIMIT 1`,
      [tipo],
    )
    return result.rows[0] ?? null
  }

  async create(input: CreateLinkInput): Promise<LinkProdutoRow> {
    const result = await this.db.query<LinkProdutoRow>(
      `INSERT INTO links_produtos (tipo_certificado, link_renovacao, link_nova_emissao, descricao, ativo, whatsapp_template_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.tipo_certificado,
        input.link_renovacao ?? null,
        input.link_nova_emissao ?? null,
        input.descricao ?? null,
        input.ativo ?? true,
        input.whatsapp_template_id ?? null,
      ],
    )
    return result.rows[0]
  }

  async update(id: string, input: UpdateLinkInput): Promise<LinkProdutoRow | null> {
    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1

    const field = (col: string, val: unknown) => { sets.push(`${col} = $${idx++}`); params.push(val) }

    if (input.link_renovacao !== undefined)       field('link_renovacao', input.link_renovacao)
    if (input.link_nova_emissao !== undefined)   field('link_nova_emissao', input.link_nova_emissao)
    if (input.descricao !== undefined)           field('descricao', input.descricao)
    if (input.ativo !== undefined)               field('ativo', input.ativo)
    if (input.whatsapp_template_id !== undefined) field('whatsapp_template_id', input.whatsapp_template_id)

    if (sets.length === 0) return null

    sets.push('updated_at = NOW()')
    params.push(id)

    const result = await this.db.query<LinkProdutoRow>(
      `UPDATE links_produtos SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    )
    return result.rows[0] ?? null
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `DELETE FROM links_produtos WHERE id = $1 RETURNING id`,
      [id],
    )
    return result.rows.length > 0
  }
}
