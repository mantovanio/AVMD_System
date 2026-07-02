import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PortalRepository } from '../repositories/portalRepository.js'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { readJson, writeJson } from '../utils/http.js'

type PortalAuthBody = {
  userId?: string
  email?: string
}

type PortalScheduleBody = PortalAuthBody & {
  saleId?: string
  agente_registro_id?: string
  ponto_atendimento_id?: string
  data_agendada?: string
}

async function resolveProfile(profileRepository: ProfileRepository, body: PortalAuthBody) {
  if (!body.userId) return null
  let profile = await profileRepository.findByClerkId(body.userId)
  if (!profile && body.email) {
    profile = await profileRepository.findByEmail(String(body.email).trim().toLowerCase())
  }
  return profile
}

export async function handlePortalRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  portalRepository: PortalRepository,
  profileRepository: ProfileRepository,
  corsOrigin: string,
): Promise<boolean> {
  if (req.method === 'POST' && req.url === '/api/portal/overview') {
    const body = await readJson<PortalAuthBody>(req)
    const profile = await resolveProfile(profileRepository, body)
    if (!profile) {
      writeJson(res, 404, { ok: false, error: 'Perfil do cliente nao encontrado.' }, corsOrigin)
      return true
    }

    const pedidos = await portalRepository.listOrders(profile)
    writeJson(res, 200, { ok: true, pedidos }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/portal/schedule-context') {
    const body = await readJson<PortalScheduleBody>(req)
    const profile = await resolveProfile(profileRepository, body)
    if (!profile || !body.saleId) {
      writeJson(res, 400, { ok: false, error: 'Cliente ou venda invalida.' }, corsOrigin)
      return true
    }

    const context = await portalRepository.getScheduleContext(profile, body.saleId)
    if (!context) {
      writeJson(res, 404, { ok: false, error: 'Venda nao encontrada para este cliente.' }, corsOrigin)
      return true
    }

    writeJson(res, 200, { ok: true, ...context }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/portal/schedule') {
    const body = await readJson<PortalScheduleBody>(req)
    const profile = await resolveProfile(profileRepository, body)
    if (!profile || !body.saleId || !body.agente_registro_id || !body.ponto_atendimento_id || !body.data_agendada) {
      writeJson(res, 400, { ok: false, error: 'Dados do agendamento incompletos.' }, corsOrigin)
      return true
    }

    const agenda = await portalRepository.saveSchedule(profile, {
      saleId: body.saleId,
      agente_registro_id: body.agente_registro_id,
      ponto_atendimento_id: body.ponto_atendimento_id,
      data_agendada: body.data_agendada,
    })

    if (!agenda) {
      writeJson(res, 404, { ok: false, error: 'Venda nao encontrada para este cliente.' }, corsOrigin)
      return true
    }

    writeJson(res, 200, { ok: true, agenda }, corsOrigin)
    return true
  }

  return false
}
