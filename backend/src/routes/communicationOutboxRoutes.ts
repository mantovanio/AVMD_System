import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CommunicationOutboxRepository, CreateOutboxInput } from '../repositories/communicationOutboxRepository.js'
import { readJson, writeJson } from '../utils/http.js'

export async function handleCommunicationOutboxRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  repo: CommunicationOutboxRepository,
  corsOrigin: string,
): Promise<boolean> {
  const url = req.url ?? ''
  const method = req.method ?? ''

  // POST /api/communication/outbox — enfileirar mensagem (e-mail ou WhatsApp agendado)
  if (method === 'POST' && url === '/api/communication/outbox') {
    const body = await readJson<CreateOutboxInput>(req)
    if (!body?.to_address || !body?.body) {
      writeJson(res, 400, { ok: false, error: 'to_address e body sao obrigatorios' }, corsOrigin)
      return true
    }
    const row = await repo.create(body)
    writeJson(res, 201, { ok: true, outbox: row }, corsOrigin)
    return true
  }

  // GET /api/communication/outbox/recent — ultimos disparos (7 dias)
  if (method === 'GET' && url === '/api/communication/outbox/recent') {
    const limit = parseInt(new URL(url, 'http://localhost').searchParams.get('limit') ?? '50', 10)
    const recent = await repo.listRecentDispatches(limit)
    writeJson(res, 200, { ok: true, dispatches: recent }, corsOrigin)
    return true
  }

  // GET /api/communication/outbox/stats — estatisticas de disparo
  if (method === 'GET' && url === '/api/communication/outbox/stats') {
    const stats = await repo.getDispatchStats()
    writeJson(res, 200, { ok: true, stats }, corsOrigin)
    return true
  }

  // GET /api/communication/outbox/renovacao/:id — historico de uma renovacao
  const renovacaoMatch = url.match(/^\/api\/communication\/outbox\/renovacao\/([a-f0-9-]+)$/)
  if (method === 'GET' && renovacaoMatch) {
    const renovacaoId = renovacaoMatch[1]
    const dispatches = await repo.listDispatchesByRenovacaoId(renovacaoId)
    writeJson(res, 200, { ok: true, dispatches }, corsOrigin)
    return true
  }

  return false
}
