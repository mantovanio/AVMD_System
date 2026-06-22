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
}
