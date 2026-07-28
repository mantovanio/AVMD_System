import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CommunicationOutboxRepository } from '../repositories/communicationOutboxRepository.js'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { writeJson } from '../utils/http.js'

export async function handlePublicAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  _profileRepository: ProfileRepository,
  _outboxRepository: CommunicationOutboxRepository,
  _clerkSecretKey: string,
  corsOrigin: string,
): Promise<boolean> {
  if (req.method !== 'POST' || req.url !== '/api/auth/register') return false

  writeJson(res, 403, {
    ok: false,
    error: 'Cadastro público desativado. Contas de acesso são criadas exclusivamente pelo administrador.',
  }, corsOrigin)
  return true
}
