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

function text(value, fallback = null) {
  if (value === undefined || value === null) return fallback
  const normalized = String(value).trim()
  return normalized || fallback
}

try {
  const rows = await readRows('cadastros_base.rows.json')
  let imported = 0
  let skipped = 0

  await pool.query('begin')
  for (const row of rows) {
    if (!row.id) {
      skipped++
      continue
    }

    await pool.query(
      `insert into cadastros_base (
        id, tipo_cliente, tipo_cadastro, cpf_cnpj, nome, nome_fantasia, email, telefone,
        logradouro, numero, complemento, bairro, cidade, uf, cep,
        inscricao_municipal, inscricao_estadual, iss_retido, status, metadata, created_at, updated_at
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20::jsonb, coalesce($21::timestamptz, now()), coalesce($22::timestamptz, now())
      )
      on conflict (id) do update set
        tipo_cliente = excluded.tipo_cliente,
        tipo_cadastro = excluded.tipo_cadastro,
        cpf_cnpj = excluded.cpf_cnpj,
        nome = excluded.nome,
        nome_fantasia = excluded.nome_fantasia,
        email = excluded.email,
        telefone = excluded.telefone,
        logradouro = excluded.logradouro,
        numero = excluded.numero,
        complemento = excluded.complemento,
        bairro = excluded.bairro,
        cidade = excluded.cidade,
        uf = excluded.uf,
        cep = excluded.cep,
        inscricao_municipal = excluded.inscricao_municipal,
        inscricao_estadual = excluded.inscricao_estadual,
        iss_retido = excluded.iss_retido,
        status = excluded.status,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at`,
      [
        row.id,
        text(row.tipo_cliente, 'pessoa_fisica'),
        text(row.tipo_cadastro, 'cliente'),
        text(row.cpf_cnpj, `sem-documento-${row.id}`),
        text(row.nome, row.nome_fantasia || `Cadastro ${row.id}`),
        text(row.nome_fantasia),
        text(row.email),
        text(row.telefone),
        text(row.logradouro),
        text(row.numero),
        text(row.complemento),
        text(row.bairro),
        text(row.cidade),
        text(row.uf),
        text(row.cep),
        text(row.inscricao_municipal),
        text(row.inscricao_estadual),
        Boolean(row.iss_retido),
        text(row.status, 'ativo'),
        JSON.stringify(row.metadata ?? {}),
        row.created_at ?? null,
        row.updated_at ?? null,
      ]
    )
    imported++
  }
  await pool.query('commit')

  const total = await pool.query(`select count(*)::int as total from cadastros_base`)
  console.log(JSON.stringify({ ok: true, imported, skipped, total: total.rows[0].total }, null, 2))
} catch (error) {
  await pool.query('rollback').catch(() => undefined)
  console.error(JSON.stringify({ ok: false, message: error.message }, null, 2))
  process.exitCode = 1
} finally {
  await pool.end()
}
