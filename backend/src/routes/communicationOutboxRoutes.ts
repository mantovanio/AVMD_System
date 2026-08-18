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

  return false
}
