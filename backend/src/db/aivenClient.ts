import { Pool, type PoolClient, type QueryResult } from 'pg'
import { loadConfig } from '../config/env.js'

export type SqlQueryResult<Row> = {
  rows: Row[]
}

export interface AivenSqlClient {
  query<Row>(sql: string, params?: unknown[]): Promise<SqlQueryResult<Row>>
  transaction<T>(fn: (trx: AivenSqlClient) => Promise<T>): Promise<T>
}

class PgSqlClient implements AivenSqlClient {
  constructor(private readonly executor: { query: (sql: string, params?: unknown[]) => Promise<QueryResult> }) {}

  async query<Row>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<Row>> {
    const result = await this.executor.query(sql, params)
    return { rows: result.rows as Row[] }
  }

  async transaction<T>(): Promise<T> {
    throw new Error('Transacao nao suportada neste cliente.')
  }
}

class PgPoolSqlClient implements AivenSqlClient {
  constructor(private readonly pool: Pool) {}

  async query<Row>(sql: string, params: unknown[] = []): Promise<SqlQueryResult<Row>> {
    const result = await this.pool.query(sql, params)
    return { rows: result.rows as Row[] }
  }

  async transaction<T>(fn: (trx: AivenSqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('begin')
      const trx = new PgTransactionalSqlClient(client)
      const result = await fn(trx)
      await client.query('commit')
      return result
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  }
}

class PgTransactionalSqlClient extends PgSqlClient {
  constructor(private readonly client: PoolClient) {
    super(client)
  }

  override async transaction<T>(): Promise<T> {
    throw new Error('Transacoes aninhadas nao sao suportadas.')
  }
}

export class MissingDatabaseUrlError extends Error {
  constructor() {
    super('DATABASE_URL nao configurada para o backend Aiven.')
  }
}

export function createAivenSqlClient(): AivenSqlClient {
  const config = loadConfig()
  if (!config.databaseUrl) {
    throw new MissingDatabaseUrlError()
  }

  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseUrl.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
  })

  return new PgPoolSqlClient(pool)
}
