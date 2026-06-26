import type { AivenSqlClient } from '../db/aivenClient.js'

export type ProfileHierarquiaRow = {
  id: string
  nome: string
  email: string | null
  perfil: string
  status: string
  nivel_hierarquia: number
  parent_profile_id: string | null
  ponto_atendimento_id: string | null
  link_loja: string | null
  supervisao_pct: number
}

export type FaixaPerfilRow = {
  id: string
  profile_id: string
  tipo_comissao: string
  faixa: string
  min_emissoes: number
  max_emissoes: number | null
  percentual: number
  valor_exemplo: number | null
  ordem: number
  ativo: boolean
}

export type RemuneracaoRegraRow = {
  id: string
  profile_id: string
  ponto_atendimento_id: string | null
  escopo: string
  tipo_calculo: string
  documento_tipo: string
  valor: number
  ativo: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type ModeloNegocioRow = {
  id: string
  profile_id: string
  ponto_atendimento_id: string | null
  modo_operacao: 'comissao' | 'revenda'
  ativo: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type RevendaPrecoBaseRow = {
  id: string
  profile_id: string
  ponto_atendimento_id: string
  tabela_preco_item_id: string
  valor_base: number
  ativo: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  tabela_nome?: string | null
  produto_nome?: string | null
}

export type RepasseRegraRow = {
  id: string
  parent_profile_id: string
  child_profile_id: string
  ponto_atendimento_id: string
  escopo: 'validacao' | 'venda' | 'margem_revenda'
  tipo_calculo: 'fixa' | 'percentual'
  valor: number
  ativo: boolean
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  parent_nome?: string | null
  child_nome?: string | null
}

export type TabelaPrecoItemResumoRow = {
  id: string
  tabela_preco_id: string
  tabela_nome: string | null
  certificado_id: string | null
  produto_nome: string | null
  valor: number | null
  valor_custo: number | null
  ativo: boolean
}

const PROFILE_COLS = `id, nome, email, perfil, status, nivel_hierarquia,
  parent_profile_id, ponto_atendimento_id, link_loja, supervisao_pct`

export class HierarquiaRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async getTreeForPonto(pontoId: string): Promise<ProfileHierarquiaRow[]> {
    const result = await this.db.query<ProfileHierarquiaRow>(`
      WITH RECURSIVE roots AS (
        SELECT DISTINCT v.agente_id AS id
        FROM pontos_atendimento_agentes v
        WHERE v.ponto_atendimento_id = $1
          AND v.ativo = true
      ),
      hier AS (
        SELECT ${PROFILE_COLS}
        FROM profiles
        WHERE id IN (SELECT id FROM roots)
          AND perfil = 'agente_registro'
          AND status != 'removido'
        UNION ALL
        SELECT p.id, p.nome, p.email, p.perfil, p.status, p.nivel_hierarquia,
               p.parent_profile_id, p.ponto_atendimento_id, p.link_loja, p.supervisao_pct
        FROM profiles p
        JOIN hier h ON p.parent_profile_id = h.id
        WHERE p.status != 'removido' AND h.nivel_hierarquia < 3
      )
      SELECT * FROM hier ORDER BY nivel_hierarquia, nome
    `, [pontoId])
    return result.rows
  }

  async getAvailableAgentes(pontoId?: string | null): Promise<ProfileHierarquiaRow[]> {
    const params: unknown[] = []
    const filters = ["perfil = 'agente_registro'", "status = 'ativo'"]

    if (pontoId) {
      params.push(pontoId)
      filters.push(`id not in (
        select agente_id
        from pontos_atendimento_agentes
        where ponto_atendimento_id = $${params.length}
          and ativo = true
      )`)
    }

    const result = await this.db.query<ProfileHierarquiaRow>(`
      SELECT ${PROFILE_COLS} FROM profiles
      WHERE ${filters.join(' AND ')}
      ORDER BY nome
    `, params)
    return result.rows
  }

  async getAvailableVendedores(): Promise<ProfileHierarquiaRow[]> {
    const result = await this.db.query<ProfileHierarquiaRow>(`
      SELECT ${PROFILE_COLS} FROM profiles
      WHERE perfil = 'vendedor' AND status = 'ativo'
        AND parent_profile_id IS NULL
      ORDER BY nome
    `)
    return result.rows
  }

  async linkAgenteAoPonto(profileId: string, pontoId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO pontos_atendimento_agentes (ponto_atendimento_id, agente_id, principal, ativo, metadata)
       VALUES ($1, $2, false, true, '{}'::jsonb)
       ON CONFLICT (ponto_atendimento_id, agente_id)
       DO UPDATE SET ativo = true, updated_at = now()`,
      [pontoId, profileId],
    )
  }

  async unlinkAgenteFromPonto(profileId: string, pontoId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM pontos_atendimento_agentes
       WHERE agente_id = $1 AND ponto_atendimento_id = $2`,
      [profileId, pontoId],
    )
  }

  async linkVendedorToParent(vendedorId: string, parentId: string, nivel: number): Promise<void> {
    if (nivel > 3) throw new Error('Profundidade máxima é 3 níveis abaixo do agente.')
    await this.db.query(
      `UPDATE profiles SET parent_profile_id = $2, nivel_hierarquia = $3, updated_at = now()
       WHERE id = $1`,
      [vendedorId, parentId, nivel],
    )
  }

  async unlinkVendedorFromParent(vendedorId: string): Promise<void> {
    await this.db.query(
      `UPDATE profiles SET parent_profile_id = NULL, nivel_hierarquia = 0, updated_at = now()
       WHERE id = $1`,
      [vendedorId],
    )
  }

  async updateProfileConfig(profileId: string, input: {
    supervisao_pct?: number
    link_loja?: string | null
  }): Promise<void> {
    const sets: string[] = ['updated_at = now()']
    const params: unknown[] = [profileId]
    let idx = 2
    if (input.supervisao_pct !== undefined) {
      sets.push(`supervisao_pct = $${idx++}`)
      params.push(input.supervisao_pct)
    }
    if ('link_loja' in input) {
      sets.push(`link_loja = $${idx++}`)
      params.push(input.link_loja ?? null)
    }
    await this.db.query(`UPDATE profiles SET ${sets.join(', ')} WHERE id = $1`, params)
  }

  async getFaixasForProfile(profileId: string): Promise<FaixaPerfilRow[]> {
    const result = await this.db.query<FaixaPerfilRow>(
      `SELECT * FROM faixas_comissao WHERE profile_id = $1 ORDER BY tipo_comissao, ordem`,
      [profileId],
    )
    return result.rows
  }

  async saveFaixa(input: {
    id?: string | null
    profile_id: string
    tipo_comissao: string
    faixa: string
    min_emissoes: number
    max_emissoes: number | null
    percentual: number
    valor_exemplo: number | null
    ordem: number
  }): Promise<FaixaPerfilRow> {
    if (input.id) {
      const result = await this.db.query<FaixaPerfilRow>(
        `UPDATE faixas_comissao SET
           faixa=$2, min_emissoes=$3, max_emissoes=$4, percentual=$5,
           valor_exemplo=$6, ordem=$7, updated_at=now()
         WHERE id=$1 AND profile_id=$8 RETURNING *`,
        [input.id, input.faixa, input.min_emissoes, input.max_emissoes,
         input.percentual, input.valor_exemplo, input.ordem, input.profile_id],
      )
      return result.rows[0]
    }
    const result = await this.db.query<FaixaPerfilRow>(
      `INSERT INTO faixas_comissao
         (profile_id, tipo_comissao, faixa, min_emissoes, max_emissoes, percentual, valor_exemplo, ordem, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true) RETURNING *`,
      [input.profile_id, input.tipo_comissao, input.faixa, input.min_emissoes, input.max_emissoes,
       input.percentual, input.valor_exemplo, input.ordem],
    )
    return result.rows[0]
  }

  async deleteFaixa(id: string, profileId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM faixas_comissao WHERE id=$1 AND profile_id=$2`,
      [id, profileId],
    )
  }

  async listRemuneracaoRules(profileId: string, pontoId: string): Promise<RemuneracaoRegraRow[]> {
    const result = await this.db.query<RemuneracaoRegraRow>(
      `SELECT *
       FROM agente_remuneracao_regras
       WHERE profile_id = $1
         AND (ponto_atendimento_id = $2 OR ponto_atendimento_id IS NULL)
       ORDER BY escopo, documento_tipo, created_at ASC`,
      [profileId, pontoId],
    )
    return result.rows
  }

  async saveRemuneracaoRule(input: {
    id?: string | null
    profile_id: string
    ponto_atendimento_id?: string | null
    escopo: string
    tipo_calculo: string
    documento_tipo: string
    valor: number
    ativo?: boolean
  }): Promise<RemuneracaoRegraRow> {
    if (input.id) {
      const result = await this.db.query<RemuneracaoRegraRow>(
        `UPDATE agente_remuneracao_regras
         SET escopo = $2,
             tipo_calculo = $3,
             documento_tipo = $4,
             valor = $5,
             ativo = $6,
             ponto_atendimento_id = $7,
             updated_at = now()
         WHERE id = $1 AND profile_id = $8
         RETURNING *`,
        [input.id, input.escopo, input.tipo_calculo, input.documento_tipo, input.valor, input.ativo ?? true, input.ponto_atendimento_id ?? null, input.profile_id],
      )
      return result.rows[0]
    }

    const result = await this.db.query<RemuneracaoRegraRow>(
      `INSERT INTO agente_remuneracao_regras
         (profile_id, ponto_atendimento_id, escopo, tipo_calculo, documento_tipo, valor, ativo, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb)
       RETURNING *`,
      [input.profile_id, input.ponto_atendimento_id ?? null, input.escopo, input.tipo_calculo, input.documento_tipo, input.valor, input.ativo ?? true],
    )
    return result.rows[0]
  }

  async deleteRemuneracaoRule(id: string, profileId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM agente_remuneracao_regras WHERE id = $1 AND profile_id = $2`,
      [id, profileId],
    )
  }

  async getModeloNegocio(profileId: string, pontoId: string): Promise<ModeloNegocioRow | null> {
    const result = await this.db.query<ModeloNegocioRow>(
      `SELECT *
       FROM perfil_modelos_negocio
       WHERE profile_id = $1
         AND ponto_atendimento_id = $2
       LIMIT 1`,
      [profileId, pontoId],
    )
    return result.rows[0] ?? null
  }

  async saveModeloNegocio(input: {
    profile_id: string
    ponto_atendimento_id: string
    modo_operacao: 'comissao' | 'revenda'
    ativo?: boolean
  }): Promise<ModeloNegocioRow> {
    const result = await this.db.query<ModeloNegocioRow>(
      `INSERT INTO perfil_modelos_negocio
         (profile_id, ponto_atendimento_id, modo_operacao, ativo, metadata)
       VALUES ($1, $2, $3, $4, '{}'::jsonb)
       ON CONFLICT (profile_id, ponto_atendimento_id)
       DO UPDATE SET modo_operacao = excluded.modo_operacao,
                     ativo = excluded.ativo,
                     updated_at = now()
       RETURNING *`,
      [input.profile_id, input.ponto_atendimento_id, input.modo_operacao, input.ativo ?? true],
    )
    return result.rows[0]
  }

  async listRevendaPriceBases(profileId: string, pontoId: string): Promise<RevendaPrecoBaseRow[]> {
    const result = await this.db.query<RevendaPrecoBaseRow>(
      `SELECT r.*, tp.nome AS tabela_nome, c.tipo AS produto_nome
       FROM perfil_precos_base_revenda r
       JOIN tabelas_preco_itens i ON i.id = r.tabela_preco_item_id
       LEFT JOIN tabelas_preco tp ON tp.id = i.tabela_preco_id
       LEFT JOIN certificados c ON c.id = i.certificado_id
       WHERE r.profile_id = $1
         AND r.ponto_atendimento_id = $2
       ORDER BY tp.nome ASC, c.tipo ASC, r.created_at ASC`,
      [profileId, pontoId],
    )
    return result.rows
  }

  async saveRevendaPriceBase(input: {
    id?: string | null
    profile_id: string
    ponto_atendimento_id: string
    tabela_preco_item_id: string
    valor_base: number
    ativo?: boolean
  }): Promise<RevendaPrecoBaseRow> {
    if (input.id) {
      const result = await this.db.query<RevendaPrecoBaseRow>(
        `UPDATE perfil_precos_base_revenda
         SET tabela_preco_item_id = $2,
             valor_base = $3,
             ativo = $4,
             updated_at = now()
         WHERE id = $1 AND profile_id = $5
         RETURNING *`,
        [input.id, input.tabela_preco_item_id, input.valor_base, input.ativo ?? true, input.profile_id],
      )
      return result.rows[0]
    }

    const result = await this.db.query<RevendaPrecoBaseRow>(
      `INSERT INTO perfil_precos_base_revenda
         (profile_id, ponto_atendimento_id, tabela_preco_item_id, valor_base, ativo, metadata)
       VALUES ($1, $2, $3, $4, $5, '{}'::jsonb)
       ON CONFLICT (profile_id, ponto_atendimento_id, tabela_preco_item_id)
       DO UPDATE SET valor_base = excluded.valor_base,
                     ativo = excluded.ativo,
                     updated_at = now()
       RETURNING *`,
      [input.profile_id, input.ponto_atendimento_id, input.tabela_preco_item_id, input.valor_base, input.ativo ?? true],
    )
    return result.rows[0]
  }

  async deleteRevendaPriceBase(id: string, profileId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM perfil_precos_base_revenda WHERE id = $1 AND profile_id = $2`,
      [id, profileId],
    )
  }

  async listRepasseRules(childProfileId: string, pontoId: string): Promise<RepasseRegraRow[]> {
    const result = await this.db.query<RepasseRegraRow>(
      `SELECT r.*, pp.nome AS parent_nome, cp.nome AS child_nome
       FROM perfil_repasse_regras r
       JOIN profiles pp ON pp.id = r.parent_profile_id
       JOIN profiles cp ON cp.id = r.child_profile_id
       WHERE r.child_profile_id = $1
         AND r.ponto_atendimento_id = $2
       ORDER BY r.escopo ASC, pp.nome ASC, r.created_at ASC`,
      [childProfileId, pontoId],
    )
    return result.rows
  }

  async saveRepasseRule(input: {
    id?: string | null
    parent_profile_id: string
    child_profile_id: string
    ponto_atendimento_id: string
    escopo: 'validacao' | 'venda' | 'margem_revenda'
    tipo_calculo: 'fixa' | 'percentual'
    valor: number
    ativo?: boolean
  }): Promise<RepasseRegraRow> {
    if (input.id) {
      const result = await this.db.query<RepasseRegraRow>(
        `UPDATE perfil_repasse_regras
         SET parent_profile_id = $2,
             escopo = $3,
             tipo_calculo = $4,
             valor = $5,
             ativo = $6,
             updated_at = now()
         WHERE id = $1 AND child_profile_id = $7
         RETURNING *`,
        [input.id, input.parent_profile_id, input.escopo, input.tipo_calculo, input.valor, input.ativo ?? true, input.child_profile_id],
      )
      return result.rows[0]
    }

    const result = await this.db.query<RepasseRegraRow>(
      `INSERT INTO perfil_repasse_regras
         (parent_profile_id, child_profile_id, ponto_atendimento_id, escopo, tipo_calculo, valor, ativo, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '{}'::jsonb)
       ON CONFLICT (parent_profile_id, child_profile_id, ponto_atendimento_id, escopo)
       DO UPDATE SET tipo_calculo = excluded.tipo_calculo,
                     valor = excluded.valor,
                     ativo = excluded.ativo,
                     updated_at = now()
       RETURNING *`,
      [input.parent_profile_id, input.child_profile_id, input.ponto_atendimento_id, input.escopo, input.tipo_calculo, input.valor, input.ativo ?? true],
    )
    return result.rows[0]
  }

  async deleteRepasseRule(id: string, childProfileId: string): Promise<void> {
    await this.db.query(
      `DELETE FROM perfil_repasse_regras WHERE id = $1 AND child_profile_id = $2`,
      [id, childProfileId],
    )
  }

  async listTabelaPrecoItemResumo(): Promise<TabelaPrecoItemResumoRow[]> {
    const result = await this.db.query<TabelaPrecoItemResumoRow>(
      `SELECT i.id, i.tabela_preco_id, tp.nome AS tabela_nome, i.certificado_id,
              c.tipo AS produto_nome, i.valor, i.valor_custo, i.ativo
       FROM tabelas_preco_itens i
       LEFT JOIN tabelas_preco tp ON tp.id = i.tabela_preco_id
       LEFT JOIN certificados c ON c.id = i.certificado_id
       WHERE i.ativo = true
       ORDER BY tp.nome ASC, c.tipo ASC, i.created_at ASC`,
    )
    return result.rows
  }
}
