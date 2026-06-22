import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { readJson, writeJson } from '../utils/http.js'

type GetProfileBody = {
  userId?: string
  email?: string
}

export async function handleProfileRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  profileRepository: ProfileRepository,
  corsOrigin: string,
): Promise<boolean> {
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

    writeJson(res, 200, { ok: true, profile: profile ?? null }, corsOrigin)
    return true
  }

  return false
}
