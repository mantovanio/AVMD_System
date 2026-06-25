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
  }): Promise<ProfileRow> {
    const result = await this.db.query<ProfileRow>(
      `INSERT INTO profiles (clerk_user_id, nome, email, perfil, tipo_vinculo, permissoes, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'ativo')
       RETURNING *`,
      [input.clerk_user_id, input.nome, input.email, input.perfil, input.tipo_vinculo, JSON.stringify(input.permissoes ?? [])],
    )
    return result.rows[0]
  }

  async deleteByClerkId(clerkUserId: string): Promise<void> {
    await this.db.query('DELETE FROM profiles WHERE clerk_user_id = $1', [clerkUserId])
  }
}

