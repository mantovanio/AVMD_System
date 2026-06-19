import fs from 'node:fs/promises'
import pg from 'pg'

process.loadEnvFile?.('backend/.env.local')

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const backupDir = 'claude/backups/admavmd-20260615-170131'

async function readRows(file) {
  const raw = await fs.readFile(`${backupDir}/${file}`, 'utf8')
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed) ? parsed : parsed.rows ?? []
}

async function seedAppSettings(client) {
  const rows = await readRows('app_settings.rows.json')
  for (const row of rows) {
    await client.query(
      `insert into app_settings (key, value, updated_by, updated_at)
       values ($1, $2::jsonb, $3, coalesce($4::timestamptz, now()))
       on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      [row.key, JSON.stringify(row.value ?? {}), row.updated_by ?? null, row.updated_at ?? null]
    )
  }

  await client.query(
    `insert into app_settings (key, value)
     values ('payment_runtime', $1::jsonb)
     on conflict (key) do nothing`,
    [JSON.stringify({
      modo_teste_geral: true,
      bloquear_integracoes_reais: true,
      aviso_checkout: 'Pedido recebido. O atendimento sera liberado apos a confirmacao do pagamento.',
    })]
  )
}

async function seedCertificados(client) {
  const rows = await readRows('certificados.rows.json')
  for (const row of rows) {
    await client.query(
      `insert into certificados (
        id, codigo, tipo, estoque, validade, descricao, modelo, categoria, tipo_emissao_padrao,
        periodo_uso, descricao_produto, produto_vinculado_ac, preco_venda, valor_custo_ac,
        valor_custo, agrupador, hash, ativo, created_at, updated_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20
      )
      on conflict (id) do update set
        codigo = excluded.codigo,
        tipo = excluded.tipo,
        estoque = excluded.estoque,
        validade = excluded.validade,
        descricao = excluded.descricao,
        modelo = excluded.modelo,
        categoria = excluded.categoria,
        tipo_emissao_padrao = excluded.tipo_emissao_padrao,
        periodo_uso = excluded.periodo_uso,
        descricao_produto = excluded.descricao_produto,
        produto_vinculado_ac = excluded.produto_vinculado_ac,
        preco_venda = excluded.preco_venda,
        valor_custo_ac = excluded.valor_custo_ac,
        valor_custo = excluded.valor_custo,
        agrupador = excluded.agrupador,
        hash = excluded.hash,
        ativo = excluded.ativo,
        updated_at = excluded.updated_at`,
      [
        row.id,
        row.codigo ?? null,
        row.tipo,
        row.estoque ?? 0,
        row.validade ?? null,
        row.descricao ?? null,
        row.modelo ?? null,
        row.categoria ?? null,
        row.tipo_emissao_padrao ?? null,
        row.periodo_uso ?? null,
        row.descricao_produto ?? null,
        row.produto_vinculado_ac ?? null,
        row.preco_venda ?? 0,
        row.valor_custo_ac ?? 0,
        row.valor_custo ?? 0,
        row.agrupador ?? null,
        row.hash ?? null,
        row.ativo ?? true,
        row.created_at ?? null,
        row.updated_at ?? null,
      ]
    )
  }
}

async function seedDefaults(client) {
  const tabela = await client.query(
    `insert into tabelas_preco (nome, descricao, ativo)
     values ('Tabela Padrao AVMD', 'Tabela inicial criada para o checkout Aiven.', true)
     on conflict do nothing
     returning id`
  )

  let tabelaId = tabela.rows[0]?.id
  if (!tabelaId) {
    const existing = await client.query(`select id from tabelas_preco where nome = 'Tabela Padrao AVMD' order by created_at asc limit 1`)
    tabelaId = existing.rows[0]?.id
  }

  await client.query(
    `insert into formas_pagamento_v2 (nome, codigo, tipo, gateway, ativo, metadata)
     values
       ('PIX', 'pix', 'pix', null, true, '{}'::jsonb),
       ('Cartao de Credito', 'cartao_credito', 'cartao_credito', null, true, '{}'::jsonb),
       ('Boleto', 'boleto', 'boleto', null, true, '{}'::jsonb)
     on conflict do nothing`
  )

  await client.query(
    `insert into lojas_marketplace (nome_loja, slug, tabela_preco_id, owner_tipo, descricao, ativo, configuracoes)
     values ('AVMD Certificacao Digital', 'avmd', $1, 'institucional', 'Checkout publico AVMD conectado ao Aiven.', true, '{}'::jsonb)
     on conflict (slug) do update set tabela_preco_id = excluded.tabela_preco_id, ativo = true, updated_at = now()`,
    [tabelaId]
  )

  await client.query(
    `insert into tabelas_preco_itens (tabela_preco_id, certificado_id, valor, valor_custo, valor_repasse, ativo)
     select $1, c.id,
            case when coalesce(c.preco_venda, 0) > 0 then c.preco_venda else 1 end,
            coalesce(c.valor_custo, 0),
            0,
            true
     from certificados c
     where c.ativo = true
     on conflict (tabela_preco_id, certificado_id) do nothing`,
    [tabelaId]
  )
}

try {
  await pool.query('begin')
  await seedAppSettings(pool)
  await seedCertificados(pool)
  await seedDefaults(pool)
  await pool.query('commit')

  const counts = await pool.query(`
    select 'certificados' as tabela, count(*)::int as total from certificados
    union all select 'formas_pagamento_v2', count(*)::int from formas_pagamento_v2
    union all select 'tabelas_preco', count(*)::int from tabelas_preco
    union all select 'tabelas_preco_itens', count(*)::int from tabelas_preco_itens
    union all select 'lojas_marketplace', count(*)::int from lojas_marketplace
    union all select 'app_settings', count(*)::int from app_settings
    order by tabela
  `)
  console.log(JSON.stringify({ ok: true, counts: counts.rows }, null, 2))
} catch (error) {
  await pool.query('rollback').catch(() => undefined)
  console.error(JSON.stringify({ ok: false, message: error.message }, null, 2))
  process.exitCode = 1
} finally {
  await pool.end()
}
