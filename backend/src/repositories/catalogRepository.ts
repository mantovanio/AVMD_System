import { randomUUID } from 'node:crypto'
import type { AivenSqlClient } from '../db/aivenClient.js'

function calcularAliquotaEfetivaAnexoIII(rbt12: number): number {
  if (!Number.isFinite(rbt12) || rbt12 <= 0) return 6
  const faixas = [
    { limite: 180_000, nominal: 6, deducao: 0 },
    { limite: 360_000, nominal: 11.2, deducao: 9_360 },
    { limite: 720_000, nominal: 13.5, deducao: 17_640 },
    { limite: 1_800_000, nominal: 16, deducao: 35_640 },
    { limite: 3_600_000, nominal: 21, deducao: 125_640 },
    { limite: 4_800_000, nominal: 33, deducao: 648_000 },
  ]
  const faixa = faixas.find(item => rbt12 <= item.limite) ?? faixas[faixas.length - 1]
  return Number((((rbt12 * (faixa.nominal / 100)) - faixa.deducao) / rbt12 * 100).toFixed(4))
}

export class CatalogRepository {
  constructor(private readonly db: AivenSqlClient) {}

  private canViewAll(viewerPerfil?: string | null) {
    return !!viewerPerfil && ['admin', 'superadmin', 'supervisor_renovacoes'].includes(viewerPerfil)
  }

  // ── NFS-e ────────────────────────────────────────────────────────────
  async listNfseConfiguracoes() {
    const result = await this.db.query(
      `select * from nfse_configuracoes
       order by ativo desc, municipio_nome asc, created_at asc`,
    )
    return result.rows
  }

  async getActiveNfseConfiguracao() {
    const result = await this.db.query(
      `select * from nfse_configuracoes
       where ativo = true
       order by updated_at desc, created_at desc
       limit 1`,
    )
    return result.rows[0] ?? null
  }

  async saveNfseConfiguracao(input: Record<string, unknown>) {
    const id = String(input.id ?? '').trim() || randomUUID()
    const existingResult = await this.db.query(
      `select senha_prefeitura, chave_autenticacao, certificado_senha
         from nfse_configuracoes where id = $1::uuid`,
      [id],
    )
    const existing = (existingResult.rows[0] ?? {}) as Record<string, unknown>
    const secretFields = new Set(['senha_prefeitura', 'chave_autenticacao', 'certificado_senha'])
    const fields = [
      'identificador','municipio_nome','municipio_codigo_ibge','provedor','ativo','cadastro_base_emitente_id',
      'cnpj_emitente','inscricao_municipal','inscricao_estadual','cnae','ambiente','natureza_operacao',
      'simples_nacional','regime_especial','exigibilidade_iss','incentivo_fiscal','tipo_rps','serie_rps',
      'numero_rps_atual','codigo_servico_municipio','codigo_tributacao_municipio','codigo_cfps','codigo_cst',
      'aliquota_iss','aliquota_pis','aliquota_cofins','aliquota_inss','aliquota_ir','aliquota_csll',
      'usuario_prefeitura','senha_prefeitura','chave_autenticacao','usa_certificado_digital','certificado_pfx_path',
      'certificado_senha','observacoes','robo_ligado','payload_reforma_tributaria','updated_by',
      'razao_social_emitente','nome_fantasia_emitente','telefone_emitente','email_emitente','endereco_emitente','complemento_emitente',
    ]
    const vals = fields.map(field => {
      const incoming = input[field]
      const value = secretFields.has(field) && (!incoming || incoming === '********')
        ? existing[field] ?? null
        : incoming ?? null
      if (field === 'payload_reforma_tributaria') return JSON.stringify(value && typeof value === 'object' ? value : {})
      if (['ativo','simples_nacional','incentivo_fiscal','usa_certificado_digital','robo_ligado'].includes(field)) return Boolean(value)
      if (field === 'cadastro_base_emitente_id' || field === 'updated_by') return String(value ?? '').trim() || null
      if (field === 'numero_rps_atual') return Number(value ?? 1) || 1
      if (field.startsWith('aliquota_')) return value === null || value === '' ? null : Number(value)
      return typeof value === 'string' ? value.trim() || null : value
    })
    const cols = fields.join(', ')
    const phs = fields.map((_, index) => `$${index + 2}`).join(', ')
    const ups = fields.map(field => `${field} = excluded.${field}`).join(', ')
    const result = await this.db.query(
      `insert into nfse_configuracoes (id, ${cols})
       values ($1, ${phs})
       on conflict (id) do update set ${ups}, updated_at = now()
       returning *`,
      [id, ...vals],
    )
    return result.rows[0] ?? null
  }

  async searchNfseEmitentes(term: string) {
    const query = String(term ?? '').trim()
    const digits = query.replace(/\D/g, '')
    if (!query && !digits) return []

    const result = await this.db.query(
      `select id, cpf_cnpj, nome, nome_fantasia, email, telefone, cidade, uf,
              inscricao_municipal, inscricao_estadual, status
         from cadastros_base
        where ($1::text <> '' and regexp_replace(coalesce(cpf_cnpj, ''), '\\D', '', 'g') = $1)
           or ($2::text <> '' and (
                coalesce(nome, '') ilike '%' || $2 || '%'
             or coalesce(nome_fantasia, '') ilike '%' || $2 || '%'
             or coalesce(email, '') ilike '%' || $2 || '%'
           ))
        order by
          case when $1::text <> '' and regexp_replace(coalesce(cpf_cnpj, ''), '\\D', '', 'g') = $1 then 0 else 1 end,
          updated_at desc nulls last,
          created_at desc nulls last
        limit 10`,
      [digits, query],
    )
    return result.rows
  }

  async listNfseByVenda(vendaId: string) {
    const result = await this.db.query(
      `select * from nfse_emitidas
       where venda_certificado_id = $1::uuid
       order by created_at desc`,
      [vendaId],
    )
    return result.rows
  }

  async getNfseById(id: string) {
    const result = await this.db.query(
      `select * from nfse_emitidas where id = $1::uuid limit 1`,
      [id],
    )
    return result.rows[0] ?? null
  }

  async listSalesByDocumento(documento: string, input: { viewer_profile_id?: string | null; viewer_perfil?: string | null; limit?: number } = {}) {
    const limit = Math.min(Math.max(Number(input.limit || 500), 1), 5000)
    const digits = String(documento ?? '').replace(/\D/g, '')
    if (!digits) return []

    const params: unknown[] = [digits]
    const where: string[] = [
      `(regexp_replace(coalesce(v.documento_faturamento, ''), '\\D', '', 'g') = $1
        or regexp_replace(coalesce(cb.cpf_cnpj, ''), '\\D', '', 'g') = $1
        or regexp_replace(coalesce(v.metadata->'safeweb_financeiro'->>'documento', ''), '\\D', '', 'g') = $1)`,
    ]

    if (input.viewer_profile_id && input.viewer_perfil && !this.canViewAll(input.viewer_perfil)) {
      params.push(input.viewer_profile_id)
      where.push(`(v.vendedor_id::text = $${params.length} OR v.agente_registro_id::text = $${params.length})`)
    }

    params.push(limit)
    const result = await this.db.query(
      `select
        v.*,
        case when cb.id is null then null else jsonb_build_object('nome', cb.nome, 'cpf_cnpj', cb.cpf_cnpj) end as cadastros_base,
        case when pa.id is null then null else jsonb_build_object('nome', pa.nome) end as pontos_atendimento
      from vendas_certificados v
      left join cadastros_base cb on cb.id = v.cadastro_base_id
      left join pontos_atendimento pa on pa.id = v.ponto_atendimento_id
      where ${where.join(' and ')}
      order by coalesce(v.data_inicio_validade::date, v.created_at::date) desc, v.created_at desc
      limit $${params.length}`,
      params,
    )
    return result.rows
  }

  async createNfse(input: Record<string, unknown>) {
    const fields = [
      'lancamento_financeiro_id','cadastro_base_tomador_id','venda_certificado_id','numero_nf','codigo_verificacao',
      'status_nf','data_emissao','valor_servico','valor_iss','xml_url','pdf_url','payload_envio','payload_retorno','metadata',
    ]
    const vals = fields.map(field => {
      const value = input[field] ?? null
      if (['payload_envio','payload_retorno','metadata'].includes(field)) return JSON.stringify(value && typeof value === 'object' ? value : {})
      if (['lancamento_financeiro_id','cadastro_base_tomador_id','venda_certificado_id'].includes(field)) return String(value ?? '').trim() || null
      if (['valor_servico','valor_iss'].includes(field)) return value === null || value === '' ? null : Number(value)
      return value
    })
    const cols = fields.join(', ')
    const phs = fields.map((_, index) => `$${index + 1}`).join(', ')
    const result = await this.db.query(
      `insert into nfse_emitidas (${cols})
       values (${phs})
       returning *`,
      vals,
    )
    return result.rows[0] ?? null
  }

  async deleteNfse(id: string) {
    const result = await this.db.query<{ id: string }>(
      `delete from nfse_emitidas
       where id = $1::uuid
         and status_nf in ('pendente','erro')
       returning id`,
      [id],
    )
    return result.rows[0] ?? null
  }

  async getNfseVendaContext(vendaId: string) {
    const result = await this.db.query(
      `select id, cadastro_base_id, nome_faturamento, documento_faturamento,
              email_faturamento, telefone_faturamento, logradouro, numero,
              complemento, bairro, cidade, uf, cep, metadata->>'ibge' as ibge, inscricao_municipal,
              inscricao_estadual, valor_venda, iss_retido, observacoes
       from vendas_certificados
       where id = $1::uuid`,
      [vendaId],
    )
    return result.rows[0] ?? null
  }

  async updateNfseConfigRpsNumber(configId: string, nextNumber: number) {
    await this.db.query(
      `update nfse_configuracoes set numero_rps_atual = $2, updated_at = now() where id = $1::uuid`,
      [configId, nextNumber],
    )
  }

  async updateNfseStatusByProtocolo(protocolo: string, updates: { numero_nf: string; codigo_verificacao: string | null; status_nf: string }): Promise<string | null> {
    const result = await this.db.query<{ id: string }>(
      `update nfse_emitidas
       set numero_nf = $2, codigo_verificacao = $3, status_nf = $4, updated_at = now()
       where (payload_envio->>'protocolo' = $1 OR metadata->>'protocolo' = $1)
       returning id`,
      [protocolo, updates.numero_nf, updates.codigo_verificacao, updates.status_nf],
    )
    return result.rows[0]?.id ?? null
  }

  async markNfseCancelled(id: string, cancellation: {
    codigo: string
    justificativa: string
    observacao: string | null
    canceladoPor: string | null
    dataHora: string | null
    rawResponse: string
  }) {
    const result = await this.db.query(
      `update nfse_emitidas
          set status_nf = 'cancelada',
              payload_retorno = coalesce(payload_retorno, '{}'::jsonb) || jsonb_build_object(
                'cancelamento_prefeitura', jsonb_build_object(
                  'sucesso', true,
                  'codigo', $2::text,
                  'justificativa', $3::text,
                  'observacao', $4::text,
                  'cancelado_por', $5::text,
                  'data_hora_prefeitura', $6::text,
                  'recebido_em', now(),
                  'resposta_xml', $7::text
                )
              ),
              metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
                'cancelamento_fiscal', jsonb_build_object(
                  'codigo', $2::text,
                  'justificativa', $3::text,
                  'observacao', $4::text,
                  'cancelado_por', $5::text,
                  'confirmado_em', now()
                )
              ),
              updated_at = now()
        where id = $1::uuid
          and status_nf in ('emitida', 'processado')
        returning *`,
      [id, cancellation.codigo, cancellation.justificativa, cancellation.observacao,
        cancellation.canceladoPor, cancellation.dataHora, cancellation.rawResponse],
    )
    return result.rows[0] ?? null
  }

  // ── Certificados ─────────────────────────────────────────────────────
  async listCertificados() {
    const r = await this.db.query(`select * from certificados order by tipo asc`)
    return r.rows
  }

  async saveCertificado(input: Record<string, unknown>) {
    const id = (input.id as string | null)?.trim() || randomUUID()
    const fields = ['codigo','status_produto','tipo','estoque','validade','validade_meses','descricao','modelo','categoria',
      'tipo_emissao_padrao','periodo_uso','descricao_produto','produto_vinculado_ac',
      'preco_venda','valor_custo_ac','valor_custo','agrupador','hash','codigo_alternativo','combo_produtos','ativo']
      const vals = fields.map(f => {
        const v = input[f] ?? null
        if (f === 'combo_produtos') {
          if (v !== null && typeof v === 'object') return JSON.stringify(v)
          if (v !== null && typeof v === 'string') return v
          return '[]'
        }
        if (f === 'ativo' && typeof v === 'boolean') return v
        if (f === 'estoque' && typeof v === 'number') return v
        return v
      })
    const cols = fields.join(', ')
    const phs = fields.map((_, i) => `$${i + 2}`).join(', ')
    const ups = fields.map(f => `${f} = excluded.${f}`).join(', ')
    const r = await this.db.query<{ id: string }>(
      `insert into certificados (id, ${cols}) values ($1, ${phs})
       on conflict (id) do update set ${ups}, updated_at = now() returning id`,
      [id, ...vals]
    )
    return r.rows[0] ?? { id }
  }

  async toggleCertificado(id: string, ativo: boolean) {
    await this.db.query(
      `update certificados
       set ativo = $2,
           status_produto = case when $2 then 'Ativo' else 'Inativo' end,
           updated_at = now()
       where id = $1::uuid`,
      [id, ativo],
    )
  }

  async deleteCertificado(id: string) {
    await this.db.query(`delete from tabelas_preco_itens where certificado_id = $1::uuid`, [id])
    await this.db.query(`delete from certificados where id = $1::uuid`, [id])
  }

  async bulkDeleteCertificados(ids: string[]) {
    if (!ids.length) return
    const phs = ids.map((_, i) => `$${i + 1}`).join(', ')
    await this.db.query(`delete from tabelas_preco_itens where certificado_id::text in (${phs})`, ids)
    await this.db.query(`delete from certificados where id::text in (${phs})`, ids)
  }

  async bulkUpsertCertificados(items: Record<string, unknown>[]) {
    const fields = ['codigo','status_produto','tipo','estoque','validade','validade_meses','descricao','modelo','categoria',
      'tipo_emissao_padrao','periodo_uso','descricao_produto','produto_vinculado_ac',
      'preco_venda','valor_custo_ac','valor_custo','agrupador','hash','codigo_alternativo','combo_produtos','ativo']
    for (const item of items) {
      const id = (item.id as string | null)?.trim() || randomUUID()
      const vals = fields.map(f => {
        const v = item[f] ?? null
        if (f === 'combo_produtos') {
          if (v !== null && typeof v === 'object') return JSON.stringify(v)
          if (v !== null && typeof v === 'string') return v
          return '[]'
        }
        if (f === 'ativo' && typeof v === 'boolean') return v
        if (f === 'estoque' && typeof v === 'number') return v
        return v
      })
      const cols = fields.join(', ')
      const phs = fields.map((_, i) => `$${i + 2}`).join(', ')
      const ups = fields.map(f => `${f} = excluded.${f}`).join(', ')
      await this.db.query(
        `insert into certificados (id, ${cols}) values ($1, ${phs})
         on conflict (id) do update set ${ups}, updated_at = now()`,
        [id, ...vals]
      )
    }
  }

  // ── Tabelas de preço ─────────────────────────────────────────────────
  async listTabelasPreco() {
    const r = await this.db.query(`select * from tabelas_preco order by nome asc`)
    return r.rows
  }

  async saveTabelaPreco(input: Record<string, unknown>) {
    const id = (input.id as string | null)?.trim() || randomUUID()
    const fields = ['nome','descricao','codigo_voucher','max_desconto_percentual','max_desconto_valor',
      'comissao_venda_pct','comissao_gestor_pct','comissao_gestor_valor','ativo']
    const vals = fields.map(f => input[f] ?? null)
    const cols = fields.join(', ')
    const phs = fields.map((_, i) => `$${i + 2}`).join(', ')
    const ups = fields.map(f => `${f} = excluded.${f}`).join(', ')
    const r = await this.db.query<{ id: string }>(
      `insert into tabelas_preco (id, ${cols}) values ($1, ${phs})
       on conflict (id) do update set ${ups}, updated_at = now() returning id`,
      [id, ...vals]
    )
    return r.rows[0] ?? { id }
  }

  async toggleTabelaPreco(id: string, ativo: boolean) {
    await this.db.query(`update tabelas_preco set ativo = $2, updated_at = now() where id = $1::uuid`, [id, ativo])
  }

  async deleteTabelaPreco(id: string) {
    await this.db.query(`delete from tabelas_preco where id = $1::uuid`, [id])
  }

  // ── Tabela itens ─────────────────────────────────────────────────────
  async listTabelaItens() {
    const r = await this.db.query(`select * from tabelas_preco_itens order by created_at asc`)
    return r.rows
  }

  async saveTabelaItem(input: Record<string, unknown>) {
    const id = (input.id as string | null)?.trim() || randomUUID()
    const fields = ['tabela_preco_id','certificado_id','valor','valor_custo','valor_repasse','link_safeweb','ativo','metadata']
    const vals = fields.map(f => input[f] ?? null)
    const cols = fields.join(', ')
    const phs = fields.map((_, i) => `$${i + 2}`).join(', ')
    const ups = fields.map(f => `${f} = excluded.${f}`).join(', ')
    const r = await this.db.query<{ id: string }>(
      `insert into tabelas_preco_itens (id, ${cols}) values ($1, ${phs})
       on conflict (id) do update set ${ups}, updated_at = now() returning id`,
      [id, ...vals]
    )
    return r.rows[0] ?? { id }
  }

  async bulkUpsertTabelaItens(items: Record<string, unknown>[]) {
    const inserted: string[] = []
    const fields = ['tabela_preco_id','certificado_id','valor','valor_custo','valor_repasse','link_safeweb','ativo','metadata']
    for (const item of items) {
      const id = (item.id as string | null)?.trim() || randomUUID()
      const vals = fields.map(f => item[f] ?? null)
      const cols = fields.join(', ')
      const phs = fields.map((_, i) => `$${i + 2}`).join(', ')
      const ups = fields.map(f => `${f} = excluded.${f}`).join(', ')
      const r = await this.db.query<{ id: string }>(
        `insert into tabelas_preco_itens (id, ${cols}) values ($1, ${phs})
         on conflict (tabela_preco_id, certificado_id) do update set ${ups}, updated_at = now() returning id`,
        [id, ...vals]
      )
      if (r.rows[0]) inserted.push(r.rows[0].id)
    }
    return { inserted: inserted.length }
  }

  async bulkUpdateTabelaItemPrices(updates: { id: string; valor: number }[]) {
    for (const u of updates) {
      await this.db.query(`update tabelas_preco_itens set valor = $2, updated_at = now() where id = $1::uuid`, [u.id, u.valor])
    }
  }

  async toggleTabelaItem(id: string, ativo: boolean) {
    await this.db.query(`update tabelas_preco_itens set ativo = $2, updated_at = now() where id = $1::uuid`, [id, ativo])
  }

  async deleteTabelaItem(id: string) {
    await this.db.query(`delete from tabelas_preco_itens where id = $1::uuid`, [id])
  }

  async bulkDeleteTabelaItens(ids: string[]) {
    if (!ids.length) return
    const phs = ids.map((_, i) => `$${i + 1}`).join(', ')
    await this.db.query(`delete from tabelas_preco_itens where id::text in (${phs})`, ids)
  }

  async getTabelaItensByCertificadoId(tabelaId: string) {
    const r = await this.db.query(`select id, certificado_id from tabelas_preco_itens where tabela_preco_id = $1::uuid`, [tabelaId])
    return r.rows
  }

  async getAllCertificadosCodigoId() {
    const r = await this.db.query(`select id, codigo from certificados`)
    return r.rows as { id: string; codigo: number | null }[]
  }

  // ── Tabela participantes ──────────────────────────────────────────────
  async listTabelaParticipantes() {
    const r = await this.db.query(`select * from tabelas_preco_participantes`)
    return r.rows
  }

  async saveTabelaParticipante(input: Record<string, unknown>) {
    const id = randomUUID()
    const r = await this.db.query<{ id: string }>(
      `insert into tabelas_preco_participantes (id, tabela_preco_id, tipo_participante, parceiro_id, tipo_parceiro, perfil)
       values ($1, $2::uuid, $3, $4, $5, $6) returning id`,
      [id, input.tabela_preco_id, input.tipo_participante, input.parceiro_id ?? null, input.tipo_parceiro ?? null, input.perfil ?? null]
    )
    return r.rows[0] ?? { id }
  }

  async deleteTabelaParticipante(id: string) {
    await this.db.query(`delete from tabelas_preco_participantes where id = $1::uuid`, [id])
  }

  // ── Agentes tabelas preço ─────────────────────────────────────────────
  async listAgentesTabelaPreco() {
    const r = await this.db.query(`select * from agentes_tabelas_preco order by created_at asc`)
    return r.rows
  }

  async saveAgenteTabelaPreco(input: { tabela_preco_id: string; agente_registro_id: string; ponto_atendimento_id?: string | null; ativo?: boolean }) {
    const id = randomUUID()
    const r = await this.db.query<{ id: string }>(
      `insert into agentes_tabelas_preco (id, tabela_preco_id, agente_registro_id, ponto_atendimento_id, ativo, metadata)
       values ($1, $2::uuid, $3::uuid, $4, $5, '{}'::jsonb) returning id`,
      [id, input.tabela_preco_id, input.agente_registro_id, input.ponto_atendimento_id ?? null, input.ativo ?? true]
    )
    return r.rows[0] ?? { id }
  }

  async toggleAgenteTabelaPreco(id: string, ativo: boolean) {
    await this.db.query(`update agentes_tabelas_preco set ativo = $2, updated_at = now() where id = $1::uuid`, [id, ativo])
  }

  async deleteAgenteTabelaPreco(id: string) {
    await this.db.query(`delete from agentes_tabelas_preco where id = $1::uuid`, [id])
  }

  // ── Faixas de comissão ────────────────────────────────────────────────
  async listFaixasComissao() {
    const r = await this.db.query(`select * from faixas_comissao order by ordem asc`)
    return r.rows
  }

  async saveComissao(input: Record<string, unknown>) {
    const id = (input.id as string | null)?.trim() || randomUUID()
    const fields = ['faixa','min_emissoes','max_emissoes','percentual','valor_exemplo','ordem','ativo']
    const vals = fields.map(f => input[f] ?? null)
    const cols = fields.join(', ')
    const phs = fields.map((_, i) => `$${i + 2}`).join(', ')
    const ups = fields.map(f => `${f} = excluded.${f}`).join(', ')
    const r = await this.db.query<{ id: string }>(
      `insert into faixas_comissao (id, ${cols}) values ($1, ${phs})
       on conflict (id) do update set ${ups}, updated_at = now() returning id`,
      [id, ...vals]
    )
    return r.rows[0] ?? { id }
  }

  async deleteComissao(id: string) {
    await this.db.query(`delete from faixas_comissao where id = $1::uuid`, [id])
  }

  // ── Formas de pagamento ───────────────────────────────────────────────
  async listFormasPagamento() {
    const r = await this.db.query(`select * from formas_pagamento_v2 order by nome asc`)
    return r.rows
  }

  async saveFormaPagamento(input: Record<string, unknown>) {
    const id = (input.id as string | null)?.trim() || randomUUID()
    const fields = ['nome','codigo','tipo','gateway','ativo']
    const vals = fields.map(f => input[f] ?? null)
    const cols = fields.join(', ')
    const phs = fields.map((_, i) => `$${i + 2}`).join(', ')
    const ups = fields.map(f => `${f} = excluded.${f}`).join(', ')
    const r = await this.db.query<{ id: string }>(
      `insert into formas_pagamento_v2 (id, ${cols}) values ($1, ${phs})
       on conflict (id) do update set ${ups}, updated_at = now() returning id`,
      [id, ...vals]
    )
    return r.rows[0] ?? { id }
  }

  async deleteFormaPagamento(id: string) {
    await this.db.query(`delete from formas_pagamento_v2 where id = $1::uuid`, [id])
  }

  // ── App settings ──────────────────────────────────────────────────────
  async getAppSettings(keys: string[]) {
    if (!keys.length) return {}
    const phs = keys.map((_, i) => `$${i + 1}`).join(', ')
    const r = await this.db.query<{ key: string; value: unknown }>(`select key, value from app_settings where key in (${phs})`, keys)
    const map: Record<string, unknown> = {}
    for (const row of r.rows) map[row.key] = row.value
    return map
  }

  async setAppSetting(key: string, value: unknown) {
    await this.db.query(
      `insert into app_settings (key, value, updated_at) values ($1, $2::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(value)]
    )
  }

  // ── Disponibilidades ──────────────────────────────────────────────────
  async listDisponibilidades() {
    const r = await this.db.query(`select * from agentes_disponibilidade order by created_at asc`)
    return r.rows
  }

  async saveDisponibilidade(input: Record<string, unknown>) {
    const id = (input.id as string | null)?.trim() || randomUUID()
    const fields = ['agente_registro_id','ponto_atendimento_id','dia_semana','hora_inicio','hora_fim',
      'intervalo_minutos','capacidade_por_slot','tipo_atendimento','ativo']
    const vals = fields.map(f => input[f] ?? null)
    const cols = fields.join(', ')
    const phs = fields.map((_, i) => `$${i + 2}`).join(', ')
    const ups = fields.map(f => `${f} = excluded.${f}`).join(', ')
    const r = await this.db.query<{ id: string }>(
      `insert into agentes_disponibilidade (id, ${cols}) values ($1, ${phs})
       on conflict (id) do update set ${ups}, updated_at = now() returning id`,
      [id, ...vals]
    )
    return r.rows[0] ?? { id }
  }

  async toggleDisponibilidade(id: string, ativo: boolean) {
    await this.db.query(`update agentes_disponibilidade set ativo = $2, updated_at = now() where id = $1::uuid`, [id, ativo])
  }

  async listIndisponibilidades() {
    const r = await this.db.query(`select * from agentes_indisponibilidades order by inicio_em asc`)
    return r.rows
  }

  async saveIndisponibilidade(input: Record<string, unknown>) {
    const id = (input.id as string | null)?.trim() || randomUUID()
    const fields = ['agente_registro_id','ponto_atendimento_id','inicio_em','fim_em','motivo','ativo']
    const vals = fields.map(f => input[f] ?? null)
    const cols = fields.join(', ')
    const phs = fields.map((_, i) => `$${i + 2}`).join(', ')
    const ups = fields.map(f => `${f} = excluded.${f}`).join(', ')
    const r = await this.db.query<{ id: string }>(
      `insert into agentes_indisponibilidades (id, ${cols}) values ($1, ${phs})
       on conflict (id) do update set ${ups}, updated_at = now() returning id`,
      [id, ...vals]
    )
    return r.rows[0] ?? { id }
  }

  async toggleIndisponibilidade(id: string, ativo: boolean) {
    await this.db.query(`update agentes_indisponibilidades set ativo = $2, updated_at = now() where id = $1::uuid`, [id, ativo])
  }

  // ── Profiles lookup ───────────────────────────────────────────────────
  async getProfileNames(ids: string[]) {
    if (!ids.length) return []
    const phs = ids.map((_, i) => `$${i + 1}`).join(', ')
    const r = await this.db.query<{ id: string; nome: string }>(
      `select id, nome from profiles where id::text in (${phs})`,
      ids
    )
    return r.rows
  }

  // ── Bulk venda update ─────────────────────────────────────────────────
  async batchUpdateVendasByProtocolo(updates: { protocolo_numero: string; [key: string]: unknown }[]) {
    const fields = ['status_venda','tipo_produto','tipo_venda','tipo_emissao','valor_venda','valor_custo',
      'pago','status_pagamento','data_pagamento','data_vencimento','agente_registro_id','ponto_atendimento_id',
      'parceiro_id','vendedor_id','cadastro_base_id','certificado_id','data_inicio_validade','validado_safeweb',
      'documento_faturamento','nome_faturamento','email_faturamento','telefone_faturamento','numero_serie',
      'voucher_codigo','voucher_percentual','voucher_valor','nome_ar','nome_local_atendimento',
      'status_certificado','nome_parceiro_safeweb','observacoes','metadata']
    let updated = 0
    for (const u of updates) {
      const { protocolo_numero, ...rest } = u
      const setClauses: string[] = []
      const vals: unknown[] = [protocolo_numero]
      for (const f of fields) {
        if (f in rest) {
          setClauses.push(`${f} = $${vals.length + 1}`)
          vals.push(rest[f])
        }
      }
      if (!setClauses.length) continue
      await this.db.query(
        `update vendas_certificados set ${setClauses.join(', ')}, updated_at = now() where protocolo_numero = $1`,
        vals
      )
      updated++
    }
    return { updated }
  }

  async batchUpdateVendasByIdentity(updates: { protocolo_numero?: string; pedido_numero?: string; [key: string]: unknown }[]) {
    const fields = ['status_venda','tipo_produto','tipo_venda','tipo_emissao','valor_venda','valor_custo',
      'pago','status_pagamento','data_pagamento','data_vencimento','agente_registro_id','ponto_atendimento_id',
      'parceiro_id','vendedor_id','cadastro_base_id','certificado_id','data_inicio_validade','validado_safeweb',
      'documento_faturamento','nome_faturamento','email_faturamento','telefone_faturamento','numero_serie',
      'voucher_codigo','voucher_percentual','voucher_valor','nome_ar','nome_local_atendimento',
      'status_certificado','nome_parceiro_safeweb','observacoes','metadata']
    let updated = 0
    for (const u of updates) {
      const { protocolo_numero, pedido_numero, ...rest } = u
      const protocolo = String(protocolo_numero ?? '').trim()
      const pedido = String(pedido_numero ?? '').trim()
      if (!protocolo && !pedido) continue
      const setClauses: string[] = []
      const vals: unknown[] = []
      for (const f of fields) {
        if (f in rest) {
          vals.push(rest[f])
          setClauses.push(`${f} = $${vals.length}`)
        }
      }
      if (!setClauses.length) continue
      vals.push(protocolo || null, pedido || null)
      await this.db.query(
        `update vendas_certificados
            set ${setClauses.join(', ')}, updated_at = now()
          where ($${vals.length - 1}::text is not null and protocolo_numero = $${vals.length - 1})
             or ($${vals.length}::text is not null and pedido_numero = $${vals.length})`,
        vals,
      )
      updated++
    }
    return { updated }
  }

  async getExistingVendaIdentities(items: { protocolo_numero?: string | null; pedido_numero?: string | null }[]) {
    const protocolos = [...new Set(items.map(item => String(item.protocolo_numero ?? '').trim()).filter(Boolean))]
    const pedidos = [...new Set(items.map(item => String(item.pedido_numero ?? '').trim()).filter(Boolean))]
    if (!protocolos.length && !pedidos.length) return []
    const r = await this.db.query<{ protocolo_numero: string | null; pedido_numero: string | null }>(
      `select protocolo_numero, pedido_numero
         from vendas_certificados
        where (coalesce(array_length($1::text[], 1), 0) > 0 and protocolo_numero = any($1::text[]))
           or (coalesce(array_length($2::text[], 1), 0) > 0 and pedido_numero = any($2::text[]))`,
      [protocolos, pedidos],
    )
    return r.rows
  }

  // ── Check which CPF/CNPJs already exist ──────────────────────────────
  async getExistingCpfs(cpfs: string[]) {
    if (!cpfs.length) return []
    const r = await this.db.query<{ cpf_cnpj: string }>(
      `select cpf_cnpj from cadastros_base where cpf_cnpj = any($1::text[])`,
      [cpfs],
    )
    return r.rows.map(row => row.cpf_cnpj)
  }

  // ── Bulk clientes upsert (requer UNIQUE em cpf_cnpj) ─────────
  async batchUpsertCadastros(payloads: Record<string, unknown>[]) {
    const fields = ['tipo_cliente','tipo_cadastro','cpf_cnpj','nome','nome_fantasia','email','telefone',
      'logradouro','numero','complemento','bairro','cidade','uf','cep','inscricao_municipal',
      'inscricao_estadual','iss_retido','status']
    let upserted = 0
    for (const p of payloads) {
      const cpfCnpj = String(p.cpf_cnpj ?? '').trim()
      if (!cpfCnpj) continue
      const existing = await this.db.query<{ id: string }>(
        `select id from cadastros_base where cpf_cnpj = $1 order by updated_at desc nulls last, created_at desc nulls last limit 1`,
        [cpfCnpj],
      )
      if (existing.rows[0]?.id) {
        const updateFields = fields.filter(f => f !== 'cpf_cnpj')
        const vals = updateFields.map(f => p[f] ?? null)
        const setClauses = updateFields.map((f, i) => `${f} = $${i + 2}`).join(', ')
        await this.db.query(
          `update cadastros_base set ${setClauses}, updated_at = now() where id = $1::uuid`,
          [existing.rows[0].id, ...vals],
        )
        upserted++
        continue
      }
      const id = randomUUID()
      const vals = fields.map(f => p[f] ?? null)
      const cols = fields.join(', ')
      const phs = fields.map((_, i) => `$${i + 2}`).join(', ')
      await this.db.query(
        `insert into cadastros_base (id, ${cols}) values ($1, ${phs})`,
        [id, ...vals]
      )
      upserted++
    }
    return { upserted }
  }

  // ── Bulk insert sem ON CONFLICT (usar quando ja filtrou duplicatas) ──
  async batchInsertCadastros(payloads: Record<string, unknown>[]) {
    const fields = ['tipo_cliente','tipo_cadastro','cpf_cnpj','nome','nome_fantasia','email','telefone','status']
    const cols = fields.join(', ')
    const valueCols = ['id', ...fields]
    const chunkSize = 500
    let inserted = 0

    for (let start = 0; start < payloads.length; start += chunkSize) {
      const chunk = payloads.slice(start, start + chunkSize)
      const params: unknown[] = []
      const valuesSql: string[] = []

      for (const p of chunk) {
        const base = params.length
        params.push(randomUUID(), ...fields.map(f => p[f] ?? null))
        const placeholders = Array.from(
          { length: fields.length + 1 },
          (_, i) => `$${base + i + 1}`,
        ).join(', ')
        valuesSql.push(`(${placeholders})`)
      }

      const result = await this.db.query(
        `insert into cadastros_base (id, ${cols})
         select ${valueCols.map(c => c === 'id' ? 'v.id::uuid' : `v.${c}`).join(', ')}
         from (values ${valuesSql.join(', ')}) as v(${valueCols.join(', ')})
         where not exists (
           select 1
           from cadastros_base cb
           where cb.cpf_cnpj = v.cpf_cnpj
         )`,
        params,
      )
      inserted += (result as unknown as { rowCount: number }).rowCount ?? 0
    }

    return { inserted }
  }

  // ── Legacy agendamentos ───────────────────────────────────────────────
  async insertAgendamentoLegacy(input: Record<string, unknown>) {
    const id = randomUUID()
    const fields = ['agente_registro_id','ponto_atendimento_id','cliente_id','data_hora','status',
      'observacoes','tipo_atendimento']
    const vals = fields.map(f => input[f] ?? null)
    const cols = fields.join(', ')
    const phs = fields.map((_, i) => `$${i + 2}`).join(', ')
    await this.db.query(
      `insert into agendamentos (id, ${cols}) values ($1, ${phs})`,
      [id, ...vals]
    )
    return { id }
  }

  // ── Update agendamento_validacao status ───────────────────────────────
  async updateAgendamentoValidacaoStatus(id: string, status: string) {
    await this.db.query(`update agendamentos_validacao set status_agendamento = $2, updated_at = now() where id = $1::uuid`, [id, status])
  }

  // ── Update venda status ───────────────────────────────────────────────
  async updateVendaStatusById(id: string, status: string) {
    await this.db.query(`update vendas_certificados set status_venda = $2, updated_at = now() where id = $1::uuid`, [id, status])
  }

  // ── Titulares certificado ─────────────────────────────────────────────
  async upsertTitular(input: Record<string, unknown>) {
    const id = (input.id as string | null)?.trim() || randomUUID()
    const fields = ['nome','cpf','data_nascimento','email','telefone']
    const vals = fields.map(f => input[f] ?? null)
    const cols = fields.join(', ')
    const phs = fields.map((_, i) => `$${i + 2}`).join(', ')
    const ups = fields.filter(f => f !== 'cpf').map(f => `${f} = excluded.${f}`).join(', ')
    const r = await this.db.query<{ id: string }>(
      `insert into titulares_certificado (id, ${cols}) values ($1, ${phs})
       on conflict (cpf) do update set ${ups}, updated_at = now() returning id`,
      [id, ...vals]
    )
    return r.rows[0] ?? { id }
  }

  // ── Vendas extra ──────────────────────────────────────────────────────
  async updateVendaTitular(id: string, titular_id: string, protocolo_numero: string) {
    const existing = await this.db.query<{ id: string; protocolo_numero: string | null; pago: boolean; status_venda: string | null }>(
      `select id, protocolo_numero, pago, status_venda
       from vendas_certificados
       where id = $1::uuid
       limit 1`,
      [id],
    )
    const venda = existing.rows[0]
    if (!venda) throw new Error('Venda nao encontrada.')

    const novoProtocolo = String(protocolo_numero ?? '').trim()
    if (!novoProtocolo) throw new Error('Protocolo obrigatorio.')

    const conflito = await this.db.query<{ id: string }>(
      `select id
       from vendas_certificados
       where protocolo_numero = $1
         and id <> $2::uuid
       limit 1`,
      [novoProtocolo, id],
    )
    if (conflito.rows[0]) {
      throw new Error(`Já existe uma venda com o protocolo ${novoProtocolo}.`)
    }

    await this.db.query(
      `update vendas_certificados
       set titular_id = $2::uuid,
           protocolo_numero = $3,
           protocolo_status = case
             when status_venda = 'cancelado' then protocolo_status
             else 'gerado'
           end,
           updated_at = now()
       where id = $1::uuid`,
      [id, titular_id, novoProtocolo],
    )
  }

  async deleteVenda(id: string) {
    const venda = await this.db.query<{ id: string; pago: boolean; status_venda: string | null; cadastro_base_id: string | null; nome_faturamento: string | null; documento_faturamento: string | null; pedido_numero: string | null; protocolo_numero: string | null }>(
      `select id, pago, status_venda, cadastro_base_id, nome_faturamento, documento_faturamento, pedido_numero, protocolo_numero
       from vendas_certificados
       where id = $1::uuid
       limit 1`,
      [id],
    )
    const row = venda.rows[0]
    if (!row) throw new Error('Venda nao encontrada.')
    if (row.cadastro_base_id || String(row.nome_faturamento ?? '').trim() || String(row.documento_faturamento ?? '').trim()) {
      throw new Error('Venda com cliente vinculado nao pode ser excluida definitivamente. Use cancelamento ou auditoria administrativa.')
    }
    if (row.pago || row.status_venda === 'vendido' || row.status_venda === 'emitido') {
      throw new Error('Venda paga ou emitida nao pode ser excluida. Use cancelamento ou ajuste de protocolo.')
    }
    await this.db.query(
      `insert into vendas_auditoria_operacional (
        acao, venda_id, pedido_numero, protocolo_numero, cliente_nome, documento,
        status_venda, motivo, payload
      ) values (
        'exclusao', $1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb
      )`,
      [
        row.id,
        row.pedido_numero ?? null,
        row.protocolo_numero ?? null,
        row.nome_faturamento ?? null,
        row.documento_faturamento ?? null,
        row.status_venda ?? null,
        'Exclusão definitiva permitida porque a venda não tinha vínculo de cliente.',
        JSON.stringify({ pago: row.pago }),
      ],
    )
    await this.db.query(`delete from vendas_certificados where id = $1::uuid`, [id])
  }

  // ── Criar nova venda ──────────────────────────────────────────────────
  async createVenda(input: Record<string, unknown>) {
    const id = randomUUID()
    const metadataBase = this.normalizeMetadata(input.metadata)
    const precificacao = await this.getPrecificacaoCertificados()
    const valorVendaInformado = Number(input.valor_venda ?? 0)
    const adminProfileId = typeof input.admin_profile_id === 'string' ? input.admin_profile_id.trim() : ''
    let adminOverrideAprovado = false
    if (precificacao) {
      const precoMinimo = this.calcularPrecoMinimoPrecificacao(precificacao)
      if (valorVendaInformado > 0 && valorVendaInformado < precoMinimo) {
        if (!adminProfileId) {
          throw new Error(`A venda foi bloqueada: o valor informado está abaixo do preço mínimo calculado para a tríade comercial (R$ ${precoMinimo.toFixed(2)}).`)
        }
        const adminCheck = await this.db.query<{ id: string }>(
          `select id
             from profiles
            where id = $1::uuid
              and perfil = 'admin'
              and status = 'ativo'
            limit 1`,
          [adminProfileId],
        )
        if (!adminCheck.rows[0]) {
          throw new Error(`A venda foi bloqueada: o valor informado está abaixo do preço mínimo calculado para a tríade comercial (R$ ${precoMinimo.toFixed(2)}).`)
        }
        adminOverrideAprovado = true
      }
    }
    const estruturaSnapshot = await this.buildEstruturaComercialSnapshot(input)
    const metadataFinal = {
      ...metadataBase,
      precificacao_certificados: precificacao ? {
        ...precificacao,
        preco_venda_minimo: this.calcularPrecoMinimoPrecificacao(precificacao),
        override_admin_aprovado: adminOverrideAprovado,
        admin_profile_id: adminOverrideAprovado ? adminProfileId : null,
      } : null,
      estrutura_comercial: estruturaSnapshot,
    }
    const payload: Record<string, unknown> = {
      ...input,
      metadata: metadataFinal,
    }
    const cadastroBaseIdInput = typeof payload.cadastro_base_id === 'string' ? payload.cadastro_base_id.trim() : ''
    const documentoFaturamento = String(payload.documento_faturamento ?? '').replace(/\D/g, '')
    const nomeFaturamento = String(payload.nome_faturamento ?? '').trim()
    const emailFaturamento = String(payload.email_faturamento ?? '').trim()
    const telefoneFaturamento = String(payload.telefone_faturamento ?? '').trim()

    let resolvedCadastroBaseId = cadastroBaseIdInput || null
    if (resolvedCadastroBaseId) {
      const existingCadastro = await this.db.query<{ id: string }>(
        `select id from cadastros_base where id = $1::uuid limit 1`,
        [resolvedCadastroBaseId],
      )
      resolvedCadastroBaseId = existingCadastro.rows[0]?.id ?? null
    }

    if (!resolvedCadastroBaseId && documentoFaturamento) {
      const cadastroByDocumento = await this.db.query<{ id: string }>(
        `select id
           from cadastros_base
          where regexp_replace(coalesce(cpf_cnpj, ''), '\\D', '', 'g') = $1
          order by updated_at desc nulls last, created_at desc nulls last
          limit 1`,
        [documentoFaturamento],
      )
      resolvedCadastroBaseId = cadastroByDocumento.rows[0]?.id ?? null
    }

    if (!resolvedCadastroBaseId && (documentoFaturamento || nomeFaturamento || emailFaturamento || telefoneFaturamento)) {
      const novoCadastroId = randomUUID()
      const tipoCliente = documentoFaturamento.length === 14 ? 'pessoa_juridica' : 'pessoa_fisica'
      const tipoCadastro = 'cliente'
      const nomeBase = nomeFaturamento || documentoFaturamento || 'Cliente'
      await this.db.query(
        `insert into cadastros_base (
          id, tipo_cliente, tipo_cadastro, cpf_cnpj, nome, nome_fantasia,
          email, telefone, status, metadata, created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10::jsonb, now(), now()
        )`,
        [
          novoCadastroId,
          tipoCliente,
          tipoCadastro,
          documentoFaturamento || null,
          nomeBase,
          documentoFaturamento.length === 14 ? nomeBase : null,
          emailFaturamento || null,
          telefoneFaturamento || null,
          'ativo',
          JSON.stringify({
            origem: 'venda_comercial',
            cadastro_auto_criado: true,
          }),
        ],
      )
      resolvedCadastroBaseId = novoCadastroId
    }

    if (!resolvedCadastroBaseId) {
      throw new Error('Nao foi possivel vincular o cliente da venda. Atualize o cadastro antes de salvar.')
    }

    payload.cadastro_base_id = resolvedCadastroBaseId
    if (!payload.pedido_numero) {
      const seq = await this.db.query<{ nextval: string }>(`select nextval('vendas_pedido_numero_seq') as nextval`)
      payload.pedido_numero = seq.rows[0].nextval
    }

    const fields = ['cadastro_base_id','empresa_id','vendedor_id','agente_registro_id',
      'ponto_atendimento_id','tabela_preco_id','tabela_preco_item_id','tipo_produto',
      'certificado_id','tipo_venda','tipo_emissao','tabela_preco',
      'valor_venda','desconto','status_venda','pago','data_pagamento','data_vencimento',
      'data_inicio_validade','validado_safeweb','status_pagamento',
      'forma_pagamento_id','nome_faturamento','documento_faturamento','email_faturamento',
      'telefone_faturamento','logradouro','numero','complemento','bairro','cidade','uf','cep',
      'inscricao_municipal','inscricao_estadual','iss_retido','contador_id',
      'pedido_numero','pedido_status','protocolo_numero','protocolo_status','certificadora',
      'voucher_codigo','voucher_percentual','voucher_valor',
      'numero_serie','nome_ar','nome_local_atendimento','status_certificado','nome_parceiro_safeweb',
      'api_payload_pedido','api_payload_protocolo',
      'comissao_vendedor_tipo','comissao_vendedor_valor','comissao_agente_tipo','comissao_agente_valor',
      'observacoes','metadata']
    const present = fields.filter(f => f in payload)
    if (!present.length) throw new Error('No fields provided for venda')
    const vals = present.map(f => (payload as Record<string, unknown>)[f] ?? null)
    const cols = present.join(', ')
    const phs = present.map((_, i) => `$${i + 2}`).join(', ')
    const r = await this.db.query<Record<string, unknown>>(
      `insert into vendas_certificados (id, ${cols}) values ($1, ${phs}) returning *`,
      [id, ...vals]
    )
    return r.rows[0] ?? { id }
  }

  private normalizeMetadata(value: unknown): Record<string, unknown> {
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

  private async getPrecificacaoCertificados(): Promise<{
    regime_operacional: 'REVENDA' | 'COMISSIONADO'
    custo_certificadora: number
    custo_cartao: number
    custo_token: number
    custo_leitora: number
    custo_midia: number
    custo_suporte_operacional: number
    gateway_taxa_percentual: number
    gateway_taxa_fixa: number
    comissao_agr_tipo: 'FIXO' | 'PERCENTUAL'
    comissao_agr_valor: number
    comissao_vendedor_tipo: 'FIXO' | 'PERCENTUAL' | 'DIFERENCA'
    comissao_vendedor_valor: number
    comissao_indicador_tipo: 'FIXO' | 'PERCENTUAL'
    comissao_indicador_valor: number
    aliquota_imposto: number
    margem_lucro_desejada: number
  } | null> {
    const r = await this.db.query<Record<string, unknown>>(
      `select regime_operacional, custo_certificadora, custo_cartao, custo_token, custo_leitora, custo_midia, custo_suporte_operacional,
              gateway_taxa_percentual, gateway_taxa_fixa,
              comissao_agr_tipo, comissao_agr_valor,
              comissao_vendedor_tipo, comissao_vendedor_valor,
              comissao_indicador_tipo, comissao_indicador_valor,
              aliquota_imposto, margem_lucro_desejada
         from configuracao_precificacao_certificados
        where id = 'default'
        limit 1`,
    )
    const row = r.rows[0]
    if (!row) return null
    return {
      regime_operacional: (row.regime_operacional as 'REVENDA' | 'COMISSIONADO') ?? 'REVENDA',
      custo_certificadora: Number(row.custo_certificadora ?? 0),
      custo_cartao: Number(row.custo_cartao ?? 0),
      custo_token: Number(row.custo_token ?? 0),
      custo_leitora: Number(row.custo_leitora ?? 0),
      custo_midia: Number(row.custo_midia ?? 0),
      custo_suporte_operacional: Number(row.custo_suporte_operacional ?? 0),
      gateway_taxa_percentual: Number(row.gateway_taxa_percentual ?? 0),
      gateway_taxa_fixa: Number(row.gateway_taxa_fixa ?? 0),
      comissao_agr_tipo: (row.comissao_agr_tipo as 'FIXO' | 'PERCENTUAL') ?? 'FIXO',
      comissao_agr_valor: Number(row.comissao_agr_valor ?? 0),
      comissao_vendedor_tipo: (row.comissao_vendedor_tipo as 'FIXO' | 'PERCENTUAL') ?? 'FIXO',
      comissao_vendedor_valor: Number(row.comissao_vendedor_valor ?? 0),
      comissao_indicador_tipo: (row.comissao_indicador_tipo as 'FIXO' | 'PERCENTUAL') ?? 'FIXO',
      comissao_indicador_valor: Number(row.comissao_indicador_valor ?? 0),
      aliquota_imposto: Number(row.aliquota_imposto ?? 0),
      margem_lucro_desejada: Number(row.margem_lucro_desejada ?? 0),
    }
  }

  private calcularPrecoMinimoPrecificacao(cfg: {
    custo_certificadora: number
    custo_cartao: number
    custo_token: number
    custo_leitora: number
    custo_midia: number
    custo_suporte_operacional: number
    gateway_taxa_percentual: number
    gateway_taxa_fixa: number
    comissao_agr_tipo: 'FIXO' | 'PERCENTUAL'
    comissao_agr_valor: number
    comissao_vendedor_tipo: 'FIXO' | 'PERCENTUAL' | 'DIFERENCA'
    comissao_vendedor_valor: number
    comissao_indicador_tipo: 'FIXO' | 'PERCENTUAL'
    comissao_indicador_valor: number
    aliquota_imposto: number
    margem_lucro_desejada: number
  }) {
    const baseFixa =
      cfg.custo_certificadora +
      cfg.custo_cartao +
      cfg.custo_token +
      (cfg.custo_cartao > 0 ? cfg.custo_leitora : 0) +
      cfg.custo_midia +
      cfg.custo_suporte_operacional +
      cfg.gateway_taxa_fixa +
      (cfg.comissao_agr_tipo === 'FIXO' ? cfg.comissao_agr_valor : 0) +
      (cfg.comissao_vendedor_tipo === 'FIXO' ? cfg.comissao_vendedor_valor : 0) +
      (cfg.comissao_indicador_tipo === 'FIXO' ? cfg.comissao_indicador_valor : 0)
    const percentualTotal =
      cfg.gateway_taxa_percentual +
      cfg.aliquota_imposto +
      cfg.margem_lucro_desejada +
      (cfg.comissao_agr_tipo === 'PERCENTUAL' ? cfg.comissao_agr_valor : 0) +
      (cfg.comissao_vendedor_tipo === 'PERCENTUAL' ? cfg.comissao_vendedor_valor : 0) +
      (cfg.comissao_indicador_tipo === 'PERCENTUAL' ? cfg.comissao_indicador_valor : 0)
    const divisor = Math.max(0.0001, 1 - percentualTotal / 100)
    return Number((baseFixa / divisor).toFixed(2))
  }

  private calcularComissaoVendedorDiferenca(input: {
    valorVenda: number
    precoBase: number
    aliquotaImposto: number
    comissaoIndicadorValor: number
  }) {
    const valorLiquidoAposImposto = Number((input.valorVenda - (input.valorVenda * input.aliquotaImposto / 100)).toFixed(2))
    const diferencaBruta = Number(Math.max(0, valorLiquidoAposImposto - input.precoBase).toFixed(2))
    const comissaoIndicador = Number(Math.max(0, input.comissaoIndicadorValor).toFixed(2))
    const comissaoVendedorLiquida = Number(Math.max(0, diferencaBruta - comissaoIndicador).toFixed(2))
    return {
      valor_liquido_pos_imposto: valorLiquidoAposImposto,
      diferenca_bruta: diferencaBruta,
      comissao_indicador: comissaoIndicador,
      comissao_vendedor_liquida: comissaoVendedorLiquida,
    }
  }

  private async buildEstruturaComercialSnapshot(input: Record<string, unknown>) {
    const vendedorInformadoId = typeof input.vendedor_id === 'string' ? input.vendedor_id : null
    const parceiroInformadoId = typeof input.contador_id === 'string' ? input.contador_id : null
    const validadorInformadoId = typeof input.agente_registro_id === 'string' ? input.agente_registro_id : null
    const pontoId = typeof input.ponto_atendimento_id === 'string' ? input.ponto_atendimento_id : null
    const itemId = typeof input.tabela_preco_item_id === 'string' ? input.tabela_preco_item_id : null
    const valorVenda = Number(input.valor_venda ?? 0)
    const aliquotaPadrao = 7.8
    let vendedorId = vendedorInformadoId
    let origemParticipante = vendedorInformadoId ? 'vendedor' : 'sem_participante'

    if (!vendedorId && parceiroInformadoId) {
      const perfilVinculado = await this.db.query<{ id: string; tipo_vinculo: string | null }>(
        `select id, tipo_vinculo
         from profiles
         where parceiro_id = $1
           and status = 'ativo'
         order by
           case when tipo_vinculo in ('contador', 'parceiro', 'vendedor') then 0 else 1 end,
           created_at asc
         limit 1`,
        [parceiroInformadoId],
      )
      vendedorId = perfilVinculado.rows[0]?.id ?? null
      origemParticipante = perfilVinculado.rows[0]?.tipo_vinculo ?? 'parceiro_sem_perfil'
    }

    if (!vendedorId || !pontoId) {
      const impostoValor = Number(((valorVenda * aliquotaPadrao) / 100).toFixed(2))
      return {
        modo_operacao: 'comissao',
        modelo_comercial: 'integrado',
        aliquota_imposto: aliquotaPadrao,
        imposto_valor: impostoValor,
        valor_apos_imposto: Number((valorVenda - impostoValor).toFixed(2)),
        base_calculo_comissoes: Number((valorVenda - impostoValor).toFixed(2)),
        origem: !pontoId ? 'sem_ponto' : origemParticipante,
        contador_id: parceiroInformadoId,
        vendedor_id: vendedorId,
        validador_id: validadorInformadoId,
        parceiro_id: parceiroInformadoId,
      }
    }

    const modelo = await this.db.query<{
      modo_operacao: 'comissao' | 'revenda'
      aliquota_imposto: number
      imposto_modo: 'fixo' | 'simples_anexo_iii'
      simples_rbt12: number | null
    }>(
      `select modo_operacao, aliquota_imposto, imposto_modo, simples_rbt12
       from perfil_modelos_negocio
       where profile_id = $1
         and ponto_atendimento_id = $2
         and ativo = true
       limit 1`,
      [vendedorId, pontoId],
    )

    const modoOperacao = modelo.rows[0]?.modo_operacao ?? 'comissao'
    const impostoModo = modelo.rows[0]?.imposto_modo ?? 'fixo'
    const simplesRbt12 = Number(modelo.rows[0]?.simples_rbt12 ?? 0)
    const aliquotaImposto = impostoModo === 'simples_anexo_iii'
      ? calcularAliquotaEfetivaAnexoIII(simplesRbt12)
      : Number(modelo.rows[0]?.aliquota_imposto ?? aliquotaPadrao)
    const impostoValor = Number(((valorVenda * aliquotaImposto) / 100).toFixed(2))
    const valorAposImposto = Number((valorVenda - impostoValor).toFixed(2))

    const precoBaseRow = itemId
      ? await this.db.query<{
          regra_id: string
          valor_base: number
          tabela_preco_item_id: string
          produto_nome: string | null
          tabela_nome: string | null
        }>(
          `select r.id as regra_id, r.valor_base, r.tabela_preco_item_id, c.tipo as produto_nome, tp.nome as tabela_nome
           from perfil_precos_base_revenda r
           join tabelas_preco_itens i on i.id = r.tabela_preco_item_id
           left join certificados c on c.id = i.certificado_id
           left join tabelas_preco tp on tp.id = i.tabela_preco_id
           where r.profile_id = $1
             and r.ponto_atendimento_id = $2
             and r.tabela_preco_item_id = $3
             and r.ativo = true
           limit 1`,
          [vendedorId, pontoId, itemId],
        )
      : { rows: [] }

    const precoBase = modoOperacao === 'revenda' ? Number(precoBaseRow.rows[0]?.valor_base ?? 0) : 0
    if (modoOperacao === 'revenda' && !precoBaseRow.rows[0]) {
      throw new Error('A venda foi bloqueada: falta configurar o ganho fixo da Certifast para este produto na revenda.')
    }
    if (modoOperacao === 'revenda' && valorVenda < precoBase) {
      throw new Error('A venda foi bloqueada: o valor de venda é menor que o ganho fixo da Certifast.')
    }
    const baseCalculo = valorAposImposto
    const escopoCascata = modoOperacao === 'revenda' ? 'margem_revenda' : 'venda'
    const precificacao = await this.getPrecificacaoCertificados()
    const vendedorEmDif = precificacao?.comissao_vendedor_tipo === 'DIFERENCA'
    const diferencaVendedor = vendedorEmDif
      ? this.calcularComissaoVendedorDiferenca({
          valorVenda,
          precoBase,
          aliquotaImposto,
          comissaoIndicadorValor: precificacao?.comissao_indicador_valor ?? 0,
        })
      : null

    const repasses = await this.db.query<{
      id: string
      parent_profile_id: string
      parent_nome: string | null
      escopo: 'validacao' | 'venda' | 'margem_revenda'
      tipo_calculo: 'fixa' | 'percentual'
      valor: number
    }>(
      `select r.id, r.parent_profile_id, p.nome as parent_nome, r.escopo, r.tipo_calculo, r.valor
       from perfil_repasse_regras r
       join profiles p on p.id = r.parent_profile_id
       where r.child_profile_id = $1
         and r.ponto_atendimento_id = $2
         and r.escopo = $3
         and r.ativo = true
       order by p.nome asc, r.created_at asc`,
      [vendedorId, pontoId, escopoCascata],
    )

    const repassesCalculados = repasses.rows.map(row => {
      const valorRegra = Number(row.valor ?? 0)
      const valorCalculado = row.tipo_calculo === 'percentual'
        ? Number(((baseCalculo * valorRegra) / 100).toFixed(2))
        : valorRegra
      return {
        regra_id: row.id,
        parent_profile_id: row.parent_profile_id,
        parent_nome: row.parent_nome,
        escopo: row.escopo,
        tipo_calculo: row.tipo_calculo,
        valor_regra: valorRegra,
        valor_calculado: valorCalculado,
      }
    })

    const totalRepasse = Number(repassesCalculados.reduce((acc, row) => acc + Number(row.valor_calculado || 0), 0).toFixed(2))
    const totalComprometido = Number((totalRepasse + (modoOperacao === 'revenda' ? precoBase : 0)).toFixed(2))
    if (totalComprometido > baseCalculo) {
      throw new Error(
        `A venda foi bloqueada: retenção e remunerações somam R$ ${totalComprometido.toFixed(2)}, acima do valor após imposto de R$ ${baseCalculo.toFixed(2)}.`,
      )
    }
    const saldoEstrutura = Number((baseCalculo - totalComprometido).toFixed(2))

    return {
      modo_operacao: modoOperacao,
      modelo_comercial: modoOperacao === 'revenda' ? 'revenda' : 'integrado',
      vendedor_id: vendedorId,
      contador_id: parceiroInformadoId,
      validador_id: validadorInformadoId,
      parceiro_id: parceiroInformadoId,
      origem_participante: origemParticipante,
      ponto_atendimento_id: pontoId,
      tabela_preco_item_id: itemId,
      valor_venda: valorVenda,
      aliquota_imposto: aliquotaImposto,
      imposto_modo: impostoModo,
      simples_anexo: impostoModo === 'simples_anexo_iii' ? 'III' : null,
      simples_rbt12: impostoModo === 'simples_anexo_iii' ? simplesRbt12 : null,
      imposto_valor: impostoValor,
      imposto_retido_valor: impostoValor,
      valor_apos_imposto: valorAposImposto,
      preco_base: precoBase,
      base_calculo_comissoes: baseCalculo,
      retencao_revenda: modoOperacao === 'revenda' ? precoBase : null,
      margem_revenda: modoOperacao === 'revenda' ? saldoEstrutura : null,
      liquido_revendedor: modoOperacao === 'revenda' ? saldoEstrutura : null,
      valor_certifast: modoOperacao === 'revenda' ? precoBase : saldoEstrutura,
      saldo_estrutura: saldoEstrutura,
      preco_base_regra_id: precoBaseRow.rows[0]?.regra_id ?? null,
      produto_nome: precoBaseRow.rows[0]?.produto_nome ?? null,
      tabela_nome: precoBaseRow.rows[0]?.tabela_nome ?? null,
      repasses: repassesCalculados,
      total_repasse: totalRepasse,
      comissao_vendedor_modo: vendedorEmDif ? 'DIFERENCA' : (precificacao?.comissao_vendedor_tipo ?? 'FIXO'),
      comissao_vendedor_liquida: diferencaVendedor?.comissao_vendedor_liquida ?? null,
      comissao_indicador_paga_pelo_vendedor: vendedorEmDif ? true : false,
      comissao_indicador_valor: vendedorEmDif ? (diferencaVendedor?.comissao_indicador ?? precificacao?.comissao_indicador_valor ?? 0) : (precificacao?.comissao_indicador_valor ?? null),
      valor_liquido_pos_imposto: diferencaVendedor?.valor_liquido_pos_imposto ?? valorAposImposto,
      diferenca_vendedor_bruta: diferencaVendedor?.diferenca_bruta ?? null,
    }
  }

  async getVendaById(id: string) {
    const r = await this.db.query<Record<string, unknown>>(
      `select vc.*, cb.nome as _cb_nome, cb.cpf_cnpj as _cb_cpf, pa.nome as _pa_nome
       from vendas_certificados vc
       left join cadastros_base cb on cb.id = vc.cadastro_base_id
       left join pontos_atendimento pa on pa.id = vc.ponto_atendimento_id
       where vc.id = $1::uuid`,
      [id]
    )
    return r.rows[0] ?? null
  }

  async getAgendaByVenda(vendaId: string) {
    const r = await this.db.query<Record<string, unknown>>(
      `select id, venda_certificado_id, data_agendada, agente_registro_id, ponto_atendimento_id, tipo_atendimento, observacoes, status_agendamento
       from agendamentos_validacao where venda_certificado_id = $1::uuid order by created_at desc limit 1`,
      [vendaId]
    )
    return r.rows[0] ?? null
  }

  async createAgendaPendente(input: Record<string, unknown>) {
    const id = randomUUID()
    const fields = ['venda_certificado_id','cadastro_base_id','empresa_id','titular_id',
      'contador_id','agente_registro_id','ponto_atendimento_id','data_agendada',
      'tipo_atendimento','status_agendamento','observacoes','metadata']
    const present = fields.filter(f => f in input)
    const vals = present.map(f => input[f] ?? null)
    const cols = present.join(', ')
    const phs = present.map((_, i) => `$${i + 2}`).join(', ')
    const r = await this.db.query<Record<string, unknown>>(
      `insert into agendamentos_validacao (id, ${cols}) values ($1, ${phs}) returning *`,
      [id, ...vals]
    )
    return r.rows[0] ?? { id }
  }

  async getClientesByDocs(docs: string[]) {
    if (!docs.length) return []
    const phs = docs.map((_, i) => `$${i + 1}`).join(', ')
    const r = await this.db.query<{ id: string; cpf_cnpj: string }>(
      `select id, cpf_cnpj from cadastros_base where cpf_cnpj in (${phs})`, docs
    )
    return r.rows
  }

  async getSafewebVendas() {
    const r = await this.db.query<Record<string, unknown>>(
      `select vc.*, cb.nome as _cb_nome, cb.cpf_cnpj as _cb_cpf
       from vendas_certificados vc
       left join cadastros_base cb on cb.id = vc.cadastro_base_id
       where vc.validado_safeweb = true
       order by vc.data_inicio_validade desc limit 500`
    )
    return r.rows
  }

  async getTitularByCpf(cpf: string) {
    const r = await this.db.query<Record<string, unknown>>(
      `select * from titulares_certificado where cpf = $1 limit 1`, [cpf]
    )
    return r.rows[0] ?? null
  }

  // ── Vendas: verificar protocolos existentes ───────────────────────────
  async getExistingProtocolos(protocolos: string[]) {
    if (!protocolos.length) return []
    const phs = protocolos.map((_, i) => `$${i + 1}`).join(', ')
    const r = await this.db.query<{ protocolo_numero: string }>(
      `select protocolo_numero from vendas_certificados where protocolo_numero in (${phs})`,
      protocolos
    )
    return r.rows.map(row => row.protocolo_numero)
  }

  async countVendasEmitidosSemValidacao() {
    const r = await this.db.query<{ n: string }>(
      `select count(*)::text as n from vendas_certificados where status_venda = 'emitido' and validado_safeweb is null`
    )
    return parseInt(r.rows[0]?.n ?? '0', 10)
  }

  // ── Esteira persistente de importações ────────────────────────────────
  async ensureImportJobTables() {
    await this.db.query(`
      create table if not exists import_jobs (
        id uuid primary key,
        tipo text not null default 'safeweb_financeiro',
        status text not null default 'queued',
        total_files integer not null default 0,
        total_rows integer not null default 0,
        progress_current integer not null default 0,
        progress_total integer not null default 0,
        message text,
        result jsonb not null default '{}'::jsonb,
        error text,
        created_by text,
        started_at timestamptz,
        finished_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `)
    await this.db.query(`
      create table if not exists import_job_files (
        id uuid primary key,
        job_id uuid not null references import_jobs(id) on delete cascade,
        file_name text not null,
        file_type text,
        rows_count integer not null default 0,
        rows_json jsonb not null default '{}'::jsonb,
        status text not null default 'queued',
        result jsonb not null default '{}'::jsonb,
        error text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `)
  }

  async createImportJob(input: {
    id?: string
    tipo: string
    createdBy?: string | null
    totalFiles: number
    totalRows: number
    progressTotal: number
    message: string
  }) {
    await this.ensureImportJobTables()
    const id = input.id ?? randomUUID()
    const r = await this.db.query<Record<string, unknown>>(
      `insert into import_jobs (
         id, tipo, status, total_files, total_rows, progress_current, progress_total, message, result, error, created_by
       ) values ($1::uuid, $2, 'queued', $3, $4, 0, $5, $6, '{}'::jsonb, null, $7)
       returning *`,
      [id, input.tipo, input.totalFiles, input.totalRows, input.progressTotal, input.message, input.createdBy ?? null],
    )
    return r.rows[0]
  }

  async addImportJobFile(input: {
    jobId: string
    fileName: string
    fileType?: string | null
    rowsCount: number
    rowsJson: unknown
  }) {
    await this.ensureImportJobTables()
    const id = randomUUID()
    const r = await this.db.query<Record<string, unknown>>(
      `insert into import_job_files (id, job_id, file_name, file_type, rows_count, rows_json)
       values ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)
       returning *`,
      [id, input.jobId, input.fileName, input.fileType ?? null, input.rowsCount, JSON.stringify(input.rowsJson ?? {})],
    )
    return r.rows[0]
  }

  async updateImportJob(id: string, patch: {
    status?: string
    message?: string
    progressCurrent?: number
    progressTotal?: number
    result?: unknown
    error?: string | null
    startedAtNow?: boolean
    finishedAtNow?: boolean
  }) {
    await this.ensureImportJobTables()
    await this.db.query(
      `update import_jobs
       set status = coalesce($2, status),
           message = coalesce($3, message),
           progress_current = coalesce($4, progress_current),
           progress_total = coalesce($5, progress_total),
           result = coalesce($6::jsonb, result),
           error = $7,
           started_at = case when $8 then now() else started_at end,
           finished_at = case when $9 then now() else finished_at end,
           updated_at = now()
       where id = $1::uuid`,
      [
        id,
        patch.status ?? null,
        patch.message ?? null,
        patch.progressCurrent ?? null,
        patch.progressTotal ?? null,
        patch.result == null ? null : JSON.stringify(patch.result),
        patch.error ?? null,
        Boolean(patch.startedAtNow),
        Boolean(patch.finishedAtNow),
      ],
    )
  }

  async getImportJob(id: string) {
    await this.ensureImportJobTables()
    const job = await this.db.query<Record<string, unknown>>(`select * from import_jobs where id = $1::uuid`, [id])
    if (!job.rows[0]) return null
    const files = await this.db.query<Record<string, unknown>>(
      `select id, file_name, file_type, rows_count, status, result, error, created_at, updated_at
       from import_job_files
       where job_id = $1::uuid
       order by created_at asc`,
      [id],
    )
    return { ...job.rows[0], files: files.rows }
  }

  // ── Bulk catalog GET ──────────────────────────────────────────────────
  async getCatalogAll() {
    const [
      certs, tabelas, itens, participantes, agentesTabelaPreco,
      comissoes, pagamentos, parceiros, parceirosAgentes
    ] = await Promise.all([
      this.db.query(`select * from certificados order by tipo asc`),
      this.db.query(`select * from tabelas_preco order by nome asc`),
      this.db.query(`select * from tabelas_preco_itens order by created_at asc`),
      this.db.query(`select * from tabelas_preco_participantes`),
      this.db.query(`select * from agentes_tabelas_preco order by created_at asc`),
      this.db.query(`select * from faixas_comissao order by ordem asc`),
      this.db.query(`select * from formas_pagamento_v2 order by nome asc`),
      this.db.query(`select id, cpf_cnpj, nome, nome_fantasia, tipo_parceiro, gestor_1_id, gestor_2_id, gestor_3_id, gestor_4_id, gestor_5_id from parceiros where status = 'ativo' order by nome asc`),
      this.db.query(`select * from parceiros_agentes_permitidos order by created_at asc`),
    ])
    return {
      certificados: certs.rows,
      tabelas: tabelas.rows,
      itens: itens.rows,
      participantes: participantes.rows,
      agentesTabelaPreco: agentesTabelaPreco.rows,
      comissoes: comissoes.rows,
      pagamentos: pagamentos.rows,
      parceiros: parceiros.rows,
      parceirosAgentes: parceirosAgentes.rows,
    }
  }
}



