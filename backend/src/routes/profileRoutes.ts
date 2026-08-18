import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { readJson, writeJson } from '../utils/http.js'

type GetProfileBody = {
  userId?: string
  email?: string
  firstName?: string
  lastName?: string
}

type UpdateProfileBody = Partial<{
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
  metadata: Record<string, unknown> | null
}>

export async function handleProfileRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  profileRepository: ProfileRepository,
  corsOrigin: string,
): Promise<boolean> {
  if (req.method === 'GET' && req.url === '/api/profiles') {
    const rows = await profileRepository.findAll()
    writeJson(res, 200, { ok: true, profiles: rows }, corsOrigin)
    return true
  }

  const putMatch = (req.url ?? '').match(/^\/api\/profiles\/([^/]+)$/)
  if (req.method === 'PUT' && putMatch) {
    const body = await readJson<UpdateProfileBody>(req)
    const updated = await profileRepository.update(putMatch[1], body)
    if (!updated) {
      writeJson(res, 404, { ok: false, error: 'Perfil não encontrado.' }, corsOrigin)
      return true
    }
    writeJson(res, 200, { ok: true, profile: updated }, corsOrigin)
    return true
  }

  if (req.method !== 'POST') return false

  if (req.url === '/api/auth/profile') {
    const body = await readJson<GetProfileBody>(req)
    if (!body?.userId) {
      writeJson(res, 400, { ok: false, error: 'userId obrigatório' }, corsOrigin)
      return true
    }

    let profile = await profileRepository.findByClerkId(body.userId)
    if (!profile && body.email) {
      profile = await profileRepository.findByEmail(body.email)
    }

    if (profile && body.userId && !profile.clerk_user_id) {
      await profileRepository.update(profile.id, { clerk_user_id: body.userId })
      profile = { ...profile, clerk_user_id: body.userId }
    }

    if (profile && profile.status === 'removido' && body.userId) {
      await profileRepository.update(profile.id, { status: 'ativo' })
      profile = { ...profile, status: 'ativo' }
    }

    if (!profile && body.email) {
      const nome = [body.firstName, body.lastName].filter(Boolean).join(' ').trim() || body.email.split('@')[0]
      try {
        profile = await profileRepository.createProfile({
          clerk_user_id: body.userId,
          nome,
          email: body.email,
          perfil: 'usuario',
          tipo_vinculo: 'funcionario',
          permissoes: [],
          metadata: { auto_provisioned: true },
        })
      } catch {
        // Se falhou (provavelmente email duplicado), tenta encontrar o perfil existente e vincular
        profile = await profileRepository.findByEmail(body.email)
        if (profile && body.userId) {
          await profileRepository.update(profile.id, { clerk_user_id: body.userId })
          profile = { ...profile, clerk_user_id: body.userId }
          if (profile.status === 'removido') {
            await profileRepository.update(profile.id, { status: 'ativo' })
            profile = { ...profile, status: 'ativo' }
          }
        }
      }
    }

    writeJson(res, 200, { ok: true, profile: profile ?? null }, corsOrigin)
    return true
  }

  return false
}
