import type { AivenSqlClient } from '../db/aivenClient.js'

export type ProfileRow = {
  id: string
  clerk_user_id: string | null
  nome: string
  email: string | null
  perfil: string
  status: string
  tipo_vinculo: string | null
  parceiro_id: string | null
  vinculo_nome: string | null
  documento: string | null
  telefone: string | null
  cidade: string | null
  observacoes: string | null
  permissoes: string[] | null
  created_at: string
  updated_at: string
}

export class ProfileRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async findAll(): Promise<ProfileRow[]> {
    const result = await this.db.query<ProfileRow>(
      'SELECT * FROM profiles ORDER BY created_at ASC',
    )
    return result.rows
  }

  async findById(id: string): Promise<ProfileRow | null> {
    const result = await this.db.query<ProfileRow>(
      'SELECT * FROM profiles WHERE id::text = $1 OR clerk_user_id = $1 LIMIT 1',
      [id],
    )
    return result.rows[0] ?? null
  }

  async findByClerkId(clerkUserId: string): Promise<ProfileRow | null> {
    const result = await this.db.query<ProfileRow>(
      'SELECT * FROM profiles WHERE clerk_user_id = $1 LIMIT 1',
      [clerkUserId],
    )
    return result.rows[0] ?? null
  }

  async findByEmail(email: string): Promise<ProfileRow | null> {
    const result = await this.db.query<ProfileRow>(
      'SELECT * FROM profiles WHERE email = $1 LIMIT 1',
      [email],
    )
    return result.rows[0] ?? null
  }

  async createProfile(input: {
    clerk_user_id: string
    nome: string
    email: string
    perfil: string
    tipo_vinculo: string
    permissoes: string[]
    status?: string
  }): Promise<ProfileRow> {
    const result = await this.db.query<ProfileRow>(
      `INSERT INTO profiles (clerk_user_id, nome, email, perfil, tipo_vinculo, permissoes, status)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       RETURNING *`,
      [input.clerk_user_id, input.nome, input.email, input.perfil, input.tipo_vinculo, JSON.stringify(input.permissoes ?? []), input.status ?? 'ativo'],
    )
    return result.rows[0]
  }

  async update(id: string, input: Partial<{
    nome: string
    email: string | null
    perfil: string
    status: string
    tipo_vinculo: string | null
    parceiro_id: string | null
    vinculo_nome: string | null
    documento: string | null
    telefone: string | null
    cidade: string | null
    observacoes: string | null
    permissoes: string[] | null
  }>): Promise<ProfileRow | null> {
    const sets: string[] = []
    const params: unknown[] = []
    let idx = 1

    const field = (col: string, val: unknown) => {
      sets.push(`${col} = $${idx++}`)
      params.push(val)
    }

    if (input.nome !== undefined) field('nome', input.nome)
    if (input.email !== undefined) field('email', input.email)
    if (input.perfil !== undefined) field('perfil', input.perfil)
    if (input.status !== undefined) field('status', input.status)
    if (input.tipo_vinculo !== undefined) field('tipo_vinculo', input.tipo_vinculo)
    if (input.parceiro_id !== undefined) field('parceiro_id', input.parceiro_id)
    if (input.vinculo_nome !== undefined) field('vinculo_nome', input.vinculo_nome)
    if (input.documento !== undefined) field('documento', input.documento)
    if (input.telefone !== undefined) field('telefone', input.telefone)
    if (input.cidade !== undefined) field('cidade', input.cidade)
    if (input.observacoes !== undefined) field('observacoes', input.observacoes)
    if (input.permissoes !== undefined) {
      sets.push(`permissoes = $${idx++}::jsonb`)
      params.push(JSON.stringify(input.permissoes ?? []))
    }

    if (sets.length === 0) return this.findById(id)

    sets.push('updated_at = now()')
    params.push(id)

    const result = await this.db.query<ProfileRow>(
      `UPDATE profiles
       SET ${sets.join(', ')}
       WHERE id::text = $${idx} OR clerk_user_id = $${idx}
       RETURNING *`,
      params,
    )
    return result.rows[0] ?? null
  }

  async deleteByClerkId(clerkUserId: string): Promise<void> {
    await this.db.query('DELETE FROM profiles WHERE clerk_user_id = $1', [clerkUserId])
  }
}
