import type { AivenSqlClient } from '../db/aivenClient.js'

export type ModuloSistema = {
  id: string
  chave: string
  nome: string
  descricao: string | null
  grupo: string
  icone: string | null
  rota: string | null
  ordem: number
  ativo: boolean
}

export type PerfilAcesso = {
  id: string
  nome: string
  descricao: string | null
  nivel: number
  padrao: boolean
}

export type PerfilModulo = {
  modulo_id: string
  nivel_acesso: string
  chave: string
  nome: string
  grupo: string
}

export type ProfileModuloOverride = {
  modulo_id: string
  nivel_acesso: string
}

export type ProfilePermissaoView = {
  profile_id: string
  perfil_nome: string
  nivel_acesso: string
  id: string
  chave: string
  nome: string
  grupo: string
  icone: string | null
  rota: string | null
  ordem: number
}

export type PacoteNegocio = {
  id: string
  nome: string
  descricao: string | null
  ativo: boolean
}

export class PermissoesRepository {
  constructor(private readonly db: AivenSqlClient) {}

  async listModulos(): Promise<ModuloSistema[]> {
    const result = await this.db.query<ModuloSistema>(
      'SELECT * FROM modulos_sistema WHERE ativo = true ORDER BY ordem ASC',
    )
    return result.rows
  }

  async listPerfis(): Promise<PerfilAcesso[]> {
    const result = await this.db.query<PerfilAcesso>(
      'SELECT * FROM perfis_acesso ORDER BY nivel DESC',
    )
    return result.rows
  }

  async getPerfilModulos(perfilId: string): Promise<PerfilModulo[]> {
    const result = await this.db.query<PerfilModulo>(
      `SELECT pm.modulo_id, pm.nivel_acesso, m.chave, m.nome, m.grupo
       FROM perfil_modulos pm
       JOIN modulos_sistema m ON m.id = pm.modulo_id
       WHERE pm.perfil_id = $1
       ORDER BY m.ordem`,
      [perfilId],
    )
    return result.rows
  }

  async getProfilePermissoes(profileId: string): Promise<ProfilePermissaoView[]> {
    const result = await this.db.query<ProfilePermissaoView>(
      'SELECT * FROM profile_permissoes_view WHERE profile_id = $1::uuid ORDER BY ordem',
      [profileId],
    )
    return result.rows
  }

  async getProfileOverrides(profileId: string): Promise<ProfileModuloOverride[]> {
    const result = await this.db.query<ProfileModuloOverride>(
      `SELECT modulo_id, nivel_acesso
       FROM profile_modulos
       WHERE profile_id = $1::uuid`,
      [profileId],
    )
    return result.rows
  }

  async setProfileOverride(profileId: string, moduloId: string, nivelAcesso: string): Promise<void> {
    await this.db.query(
      `INSERT INTO profile_modulos (profile_id, modulo_id, nivel_acesso)
       VALUES ($1::uuid, $2::uuid, $3)
       ON CONFLICT (profile_id, modulo_id)
       DO UPDATE SET nivel_acesso = $3`,
      [profileId, moduloId, nivelAcesso],
    )
  }

  async removeProfileOverride(profileId: string, moduloId: string): Promise<void> {
    await this.db.query(
      'DELETE FROM profile_modulos WHERE profile_id = $1::uuid AND modulo_id = $2::uuid',
      [profileId, moduloId],
    )
  }

  async clearProfileOverrides(profileId: string): Promise<void> {
    await this.db.query(
      'DELETE FROM profile_modulos WHERE profile_id = $1::uuid',
      [profileId],
    )
  }

  async listModulesConfig(): Promise<{ module_name: string; enabled: boolean }[]> {
    const result = await this.db.query<{ module_name: string; enabled: boolean }>(
      'SELECT module_name, enabled FROM modules_config ORDER BY module_name',
    )
    return result.rows
  }

  async listPacotes(): Promise<PacoteNegocio[]> {
    const result = await this.db.query<PacoteNegocio>(
      'SELECT * FROM pacotes_negocio WHERE ativo = true ORDER BY nome',
    )
    return result.rows
  }

  async updatePacoteModulos(pacoteId: string, moduloChaves: string[]): Promise<void> {
    await this.db.query('DELETE FROM pacote_modulos WHERE pacote_id = $1::uuid', [pacoteId])
    if (moduloChaves.length > 0) {
      const ids = await this.db.query<{ id: string }>(
        `SELECT id FROM modulos_sistema WHERE chave = ANY($1)`,
        [moduloChaves],
      )
      for (const row of ids.rows) {
        await this.db.query(
          'INSERT INTO pacote_modulos (pacote_id, modulo_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING',
          [pacoteId, row.id],
        )
      }
    }
  }

  async getPacoteModulos(pacoteId: string): Promise<string[]> {
    const result = await this.db.query<{ chave: string }>(
      `SELECT m.chave
       FROM pacote_modulos pm
       JOIN modulos_sistema m ON m.id = pm.modulo_id
       WHERE pm.pacote_id = $1::uuid`,
      [pacoteId],
    )
    return result.rows.map(r => r.chave)
  }

  async getParceiroPacote(parceiroId: string): Promise<PacoteNegocio | null> {
    const result = await this.db.query<PacoteNegocio>(
      `SELECT pn.*
       FROM parceiros p
       JOIN pacotes_negocio pn ON pn.id = p.pacote_id
       WHERE p.id = $1::uuid`,
      [parceiroId],
    )
    return result.rows[0] ?? null
  }
}
