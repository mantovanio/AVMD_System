import fs from 'node:fs/promises'
import pg from 'pg'

process.loadEnvFile?.('backend/.env.local')

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
const backupDir = 'claude/backups/admavmd-20260615-170131'
const fallbackAgentId = 'f9e5427b-4bfc-430b-9904-6bc1b1f2c0e7'
const fallbackPointId = '8a1a8727-5f60-40c3-bf9a-2bd58b581c82'

async function readRows(file) {
  const raw = await fs.readFile(`${backupDir}/${file}`, 'utf8')
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed) ? parsed : parsed.rows ?? []
}

try {
  await pool.query('begin')

  const tabela = await pool.query(`select id from tabelas_preco where ativo = true order by created_at asc limit 1`)
  const tabelaId = tabela.rows[0]?.id
  if (!tabelaId) throw new Error('Nenhuma tabela de preco ativa encontrada no Aiven.')

  await pool.query(
    `insert into profiles (id, email, nome, perfil, status, tipo_vinculo, permissoes)
     values ($1, 'agente.checkout@avmd.local', 'Agente de Registro AVMD', 'agente_registro', 'ativo', 'agente_registro', '{}'::jsonb)
     on conflict (id) do update set nome = excluded.nome, perfil = excluded.perfil, status = excluded.status, updated_at = now()`,
    [fallbackAgentId]
  )

  await pool.query(
    `insert into pontos_atendimento (id, codigo, nome, endereco, cidade, uf, status, metadata)
     values ($1, 'AVMD-PA-01', 'Ponto de Atendimento AVMD', null, 'Sao Paulo', 'SP', 'ativo', '{}'::jsonb)
     on conflict (id) do update set nome = excluded.nome, status = excluded.status, updated_at = now()`,
    [fallbackPointId]
  )

  await pool.query(
    `insert into agentes_tabelas_preco (tabela_preco_id, agente_registro_id, ponto_atendimento_id, ativo, metadata)
     values ($1, $2, $3, true, '{}'::jsonb)
     on conflict do nothing`,
    [tabelaId, fallbackAgentId, fallbackPointId]
  )

  const disponibilidadeRows = await readRows('agentes_disponibilidade.rows.json')
  for (const row of disponibilidadeRows) {
    await pool.query(
      `insert into agentes_disponibilidade (
        id, agente_registro_id, ponto_atendimento_id, dia_semana, hora_inicio, hora_fim,
        intervalo_minutos, capacidade_por_slot, tipo_atendimento, ativo, metadata, created_at, updated_at
      ) values (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11::jsonb, coalesce($12::timestamptz, now()), coalesce($13::timestamptz, now())
      )
      on conflict (id) do update set
        dia_semana = excluded.dia_semana,
        hora_inicio = excluded.hora_inicio,
        hora_fim = excluded.hora_fim,
        intervalo_minutos = excluded.intervalo_minutos,
        capacidade_por_slot = excluded.capacidade_por_slot,
        tipo_atendimento = excluded.tipo_atendimento,
        ativo = excluded.ativo,
        updated_at = now()`,
      [
        row.id,
        row.agente_registro_id ?? fallbackAgentId,
        row.ponto_atendimento_id ?? fallbackPointId,
        row.dia_semana,
        row.hora_inicio,
        row.hora_fim,
        row.intervalo_minutos ?? 30,
        row.capacidade_por_slot ?? 1,
        row.tipo_atendimento ?? null,
        row.ativo ?? true,
        JSON.stringify(row.metadata ?? {}),
        row.created_at ?? null,
        row.updated_at ?? null,
      ]
    )
  }

  await pool.query('commit')

  const counts = await pool.query(`
    select 'profiles_agentes' as tabela, count(*)::int as total from profiles where perfil = 'agente_registro' and status = 'ativo'
    union all select 'pontos_atendimento', count(*)::int from pontos_atendimento where status = 'ativo'
    union all select 'agentes_tabelas_preco', count(*)::int from agentes_tabelas_preco where ativo = true
    union all select 'agentes_disponibilidade', count(*)::int from agentes_disponibilidade where ativo = true
    order by tabela
  `)
  console.log(JSON.stringify({ ok: true, tabela_preco_id: tabelaId, counts: counts.rows }, null, 2))
} catch (error) {
  await pool.query('rollback').catch(() => undefined)
  console.error(JSON.stringify({ ok: false, message: error.message }, null, 2))
  process.exitCode = 1
} finally {
  await pool.end()
}

