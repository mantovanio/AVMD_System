import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'

export class CatalogRepository {
  constructor(private db: Pool) {}

  // ── Certificados ─────────────────────────────────────────────────────
  async listCertificados() {
    const r = await this.db.query(`select * from certificados order by tipo asc`)
    return r.rows
  }

  async saveCertificado(input: Record<string, unknown>) {
    const id = (input.id as string | null)?.trim() || randomUUID()
    const fields = ['codigo','tipo','estoque','validade','descricao','modelo','categoria',
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
    await this.db.query(`update certificados set ativo = $2, updated_at = now() where id = $1::uuid`, [id, ativo])
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
    const fields = ['codigo','tipo','estoque','validade','descricao','modelo','categoria',
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
    const r = await this.db.query(`select key, value from app_settings where key in (${phs})`, keys)
    const map: Record<string, unknown> = {}
    for (const row of r.rows) map[row.key as string] = row.value
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
    const phs = cpfs.map((_, i) => `$${i + 1}`).join(', ')
    const r = await this.db.query<{ cpf_cnpj: string }>(
      `select cpf_cnpj from cadastros_base where cpf_cnpj in (${phs})`, cpfs
    )
    return r.rows.map(row => row.cpf_cnpj)
  }

  // ── Bulk clientes upsert ──────────────────────────────────────────────
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
    const fields = ['cadastro_base_id','empresa_id','vendedor_id','agente_registro_id',
      'ponto_atendimento_id','tabela_preco_id','tabela_preco_item_id','tipo_produto',
      'certificado_id','quantidade','valor_venda','desconto','status_venda','pago',
      'forma_pagamento_id','nome_faturamento','cpf_cnpj_faturamento','email_faturamento',
      'telefone_faturamento','observacoes','metadata']
    const present = fields.filter(f => f in input)
    if (!present.length) throw new Error('No fields provided for venda')
    const vals = present.map(f => input[f] ?? null)
    const cols = present.join(', ')
    const phs = present.map((_, i) => `$${i + 2}`).join(', ')
    const r = await this.db.query<Record<string, unknown>>(
      `insert into vendas_certificados (id, ${cols}) values ($1, ${phs}) returning *`,
      [id, ...vals]
    )
    return r.rows[0] ?? { id }
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
