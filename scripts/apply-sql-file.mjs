import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import pg from 'pg'

process.loadEnvFile?.('.env.local')
process.loadEnvFile?.('backend/.env.local')

const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const force = argv.includes('--force')
const fileArg = argv.find((arg) => !arg.startsWith('--'))

if (!fileArg) {
  console.error([
    'Uso: node scripts/apply-sql-file.mjs <arquivo.sql> [--dry-run] [--force]',
    'Exemplo: node scripts/apply-sql-file.mjs backend/sql/026_fix_legacy_email_schedule_phone.sql',
  ].join('\n'))
  process.exit(1)
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL nao encontrado. Verifique backend/.env.local ou variavel de ambiente.')
  process.exit(1)
}

const rootDir = process.cwd()
const targetPath = path.resolve(rootDir, fileArg)
const relativePath = path.relative(rootDir, targetPath).replace(/\\/g, '/')
const migrationName = path.basename(targetPath)

function parseTargetFromDatabaseUrl(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl)
    return {
      host: parsed.hostname,
      port: parsed.port || '5432',
      database: parsed.pathname.replace(/^\//, ''),
    }
  } catch {
    return { host: 'desconhecido', port: 'desconhecida', database: 'desconhecido' }
  }
}

function parseRequiredTables(sqlText) {
  const matches = [...sqlText.matchAll(/^\s*--\s*@requires-table\s+(.+)$/gim)]
  if (!matches.length) return []
  return [...new Set(matches
    .flatMap(match => String(match[1] ?? '').split(','))
    .map(item => item.trim().toLowerCase())
    .filter(Boolean))]
}

const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

try {
  const sql = await fs.readFile(targetPath, 'utf8')
  const checksum = createHash('sha256').update(sql).digest('hex')
  const target = parseTargetFromDatabaseUrl(process.env.DATABASE_URL)
  const requiredTables = parseRequiredTables(sql)

  const client = await pool.connect()
  try {
    await client.query('begin')

    const dbInfoResult = await client.query(
      `select current_database() as database_name, current_schema() as schema_name`,
    )
    const dbInfo = dbInfoResult.rows[0] ?? { database_name: 'desconhecido', schema_name: 'desconhecido' }

    if (requiredTables.length > 0) {
      const tablesResult = await client.query(
        `select distinct lower(table_name) as table_name
         from information_schema.tables
         where table_type = 'BASE TABLE'
           and lower(table_name) = any($1::text[])`,
        [requiredTables],
      )
      const existing = new Set(tablesResult.rows.map(row => row.table_name))
      const missing = requiredTables.filter(t => !existing.has(t))
      if (missing.length > 0) {
        throw new Error(
          `Preflight falhou: tabela(s) obrigatoria(s) ausente(s): ${missing.join(', ')}. ` +
          `Banco alvo: ${target.host}:${target.port}/${target.database} (conectado em ${dbInfo.database_name}, schema ${dbInfo.schema_name}).`,
        )
      }
    }

    await client.query(`
      create table if not exists avmd_sql_migrations (
        id bigserial primary key,
        file_name text not null unique,
        file_path text not null,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `)

    const existing = await client.query(
      `select file_name, file_path, checksum, applied_at
       from avmd_sql_migrations
       where file_name = $1
       limit 1`,
      [migrationName],
    )

    const row = existing.rows[0]
    if (row) {
      if (row.checksum === checksum && !force) {
        await client.query('commit')
        console.log(JSON.stringify({
          ok: true,
          skipped: true,
          reason: 'migration_already_applied',
          file: migrationName,
          path: relativePath,
          applied_at: row.applied_at,
        }, null, 2))
        process.exit(0)
      }

      if (row.checksum !== checksum && !force) {
        throw new Error(`Ja existe migracao aplicada com o nome ${migrationName}, mas com checksum diferente. Use outro nome de arquivo ou rode com --force se souber o que esta fazendo.`)
      }
    }

    if (dryRun) {
      await client.query('rollback')
      console.log(JSON.stringify({
        ok: true,
        dryRun: true,
        file: migrationName,
        path: relativePath,
        target,
        requiredTables,
        checksum,
        bytes: Buffer.byteLength(sql, 'utf8'),
      }, null, 2))
      process.exit(0)
    }

    await client.query(sql)

    await client.query(
      `insert into avmd_sql_migrations (file_name, file_path, checksum, applied_at)
       values ($1, $2, $3, now())
       on conflict (file_name) do update set
         file_path = excluded.file_path,
         checksum = excluded.checksum,
         applied_at = excluded.applied_at`,
      [migrationName, relativePath, checksum],
    )

    await client.query('commit')
    console.log(JSON.stringify({
      ok: true,
      applied: true,
      file: migrationName,
      path: relativePath,
      target,
      requiredTables,
      checksum,
      bytes: Buffer.byteLength(sql, 'utf8'),
      forced: force,
    }, null, 2))
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    file: migrationName,
    path: relativePath,
    message: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exitCode = 1
} finally {
  await pool.end()
}
