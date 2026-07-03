import { randomUUID } from 'node:crypto'
import type { AivenSqlClient } from '../db/aivenClient.js'

export class CatalogRepository {
  constructor(private readonly db: AivenSqlClient) {}

  // ── Certificados ─────────────────────────────────────────────────────
  async listCertificados() {
    const r = await this.db.query(`select * from certificados order by tipo asc`)
    return r.rows
  }

  async saveCertificado(input: Record<string, unknown>) {
    const id = (input.id as string | null)?.trim() || randomUUID()
    const fields = ['codigo','status_produto','tipo','estoque','validade','validade_meses','descricao','modelo','categoria',
      'tipo_emissao_padrao','periodo_uso','descricao_produto','produto_vinculado_ac',
      'preco_venda','valor_custo_ac','valor_custo','agrupador','hash','ativo']
    const vals = fields.map(f => input[f] ?? null)
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
    await this.db.query(`delete from certificados where id = $1::uuid`, [id])
  }

  async bulkDeleteCertificados(ids: string[]) {
    if (!ids.length) return
    const phs = ids.map((_, i) => `$${i + 1}`).join(', ')
    await this.db.query(`delete from certificados where id::text in (${phs})`, ids)
  }

  async bulkUpsertCertificados(items: Record<string, unknown>[]) {
    const fields = ['codigo','status_produto','tipo','estoque','validade','validade_meses','descricao','modelo','categoria',
      'tipo_emissao_padrao','periodo_uso','descricao_produto','produto_vinculado_ac',
      'preco_venda','valor_custo_ac','valor_custo','agrupador','hash','ativo']
    for (const item of items) {
      const id = (item.id as string | null)?.trim() || randomUUID()
      const vals = fields.map(f => item[f] ?? null)
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
    const fields = ['tabela_preco_id','certificado_id','valor','valor_custo','valor_repasse','link_safeweb','ativo']
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
    const fields = ['tabela_preco_id','certificado_id','valor','valor_custo','valor_repasse','link_safeweb','ativo']
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
      'pago','data_pagamento','data_vencimento','agente_registro_id','ponto_atendimento_id',
      'parceiro_id','vendedor_id']
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
      const id = randomUUID()
      const vals = fields.map(f => p[f] ?? null)
      const cols = fields.join(', ')
      const phs = fields.map((_, i) => `$${i + 2}`).join(', ')
      const ups = fields.filter(f => f !== 'cpf_cnpj').map(f => `${f} = excluded.${f}`).join(', ')
      await this.db.query(
        `insert into cadastros_base (id, ${cols}) values ($1, ${phs})
         on conflict (cpf_cnpj) do update set ${ups}, updated_at = now()`,
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
    await this.db.query(
      `update vendas_certificados set titular_id = $2::uuid, protocolo_numero = $3, protocolo_status = 'gerado', updated_at = now() where id = $1::uuid`,
      [id, titular_id, protocolo_numero]
    )
  }

  async deleteVenda(id: string) {
    await this.db.query(`delete from vendas_certificados where id = $1::uuid`, [id])
  }

  // ── Criar nova venda ──────────────────────────────────────────────────
  async createVenda(input: Record<string, unknown>) {
    const id = randomUUID()
    const metadataBase = this.normalizeMetadata(input.metadata)
    const estruturaSnapshot = await this.buildEstruturaComercialSnapshot(input)
    const metadataFinal = {
      ...metadataBase,
      estrutura_comercial: estruturaSnapshot,
    }
    const payload = {
      ...input,
      metadata: metadataFinal,
    }

    const fields = ['cadastro_base_id','empresa_id','vendedor_id','agente_registro_id',
      'ponto_atendimento_id','tabela_preco_id','tabela_preco_item_id','tipo_produto',
      'certificado_id','quantidade','tipo_venda','tipo_emissao','tabela_preco',
      'valor_venda','desconto','status_venda','pago','data_pagamento','data_vencimento',
      'forma_pagamento_id','nome_faturamento','documento_faturamento','email_faturamento',
      'telefone_faturamento','logradouro','numero','complemento','bairro','cidade','uf','cep',
      'inscricao_municipal','inscricao_estadual','iss_retido','contador_id',
      'pedido_numero','pedido_status','protocolo_numero','protocolo_status','certificadora',
      'voucher_codigo','voucher_percentual','voucher_valor',
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

  private async buildEstruturaComercialSnapshot(input: Record<string, unknown>) {
    const vendedorId = typeof input.vendedor_id === 'string' ? input.vendedor_id : null
    const pontoId = typeof input.ponto_atendimento_id === 'string' ? input.ponto_atendimento_id : null
    const itemId = typeof input.tabela_preco_item_id === 'string' ? input.tabela_preco_item_id : null
    const valorVenda = Number(input.valor_venda ?? 0)

    if (!vendedorId || !pontoId) {
      return {
        modo_operacao: 'comissao',
        origem: 'sem_vendedor_ou_ponto',
      }
    }

    const modelo = await this.db.query<{
      modo_operacao: 'comissao' | 'revenda'
    }>(
      `select modo_operacao
       from perfil_modelos_negocio
       where profile_id = $1
         and ponto_atendimento_id = $2
         and ativo = true
       limit 1`,
      [vendedorId, pontoId],
    )

    const modoOperacao = modelo.rows[0]?.modo_operacao ?? 'comissao'
    if (modoOperacao !== 'revenda') {
      return {
        modo_operacao: 'comissao',
        vendedor_id: vendedorId,
        ponto_atendimento_id: pontoId,
      }
    }

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

    const precoBase = Number(precoBaseRow.rows[0]?.valor_base ?? 0)
    const margemBruta = Number((valorVenda - precoBase).toFixed(2))
    const margemRevenda = margemBruta > 0 ? margemBruta : 0

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
         and r.escopo = 'margem_revenda'
         and r.ativo = true
       order by p.nome asc, r.created_at asc`,
      [vendedorId, pontoId],
    )

    const repassesCalculados = repasses.rows.map(row => {
      const valorRegra = Number(row.valor ?? 0)
      const valorCalculado = row.tipo_calculo === 'percentual'
        ? Number(((margemRevenda * valorRegra) / 100).toFixed(2))
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
    const liquidoRevendedor = Number((margemRevenda - totalRepasse).toFixed(2))

    return {
      modo_operacao: 'revenda',
      vendedor_id: vendedorId,
      ponto_atendimento_id: pontoId,
      tabela_preco_item_id: itemId,
      valor_venda: valorVenda,
      preco_base: precoBase,
      margem_revenda: margemRevenda,
      liquido_revendedor: liquidoRevendedor,
      preco_base_regra_id: precoBaseRow.rows[0]?.regra_id ?? null,
      produto_nome: precoBaseRow.rows[0]?.produto_nome ?? null,
      tabela_nome: precoBaseRow.rows[0]?.tabela_nome ?? null,
      repasses: repassesCalculados,
      total_repasse: totalRepasse,
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
