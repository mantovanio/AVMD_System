import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ExternalIntegrationRepository, CreateIntegrationInput, UpdateIntegrationInput } from '../repositories/externalIntegrationRepository.js'
import { readJson, writeJson } from '../utils/http.js'

export async function handleExternalIntegrationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  repo: ExternalIntegrationRepository,
  corsOrigin: string,
): Promise<boolean> {
  const url = req.url ?? ''

  // GET /api/integrations
  if (req.method === 'GET' && url === '/api/integrations') {
    const rows = await repo.findAll()
    writeJson(res, 200, { ok: true, integrations: rows }, corsOrigin)
    return true
  }

  // POST /api/integrations
  if (req.method === 'POST' && url === '/api/integrations') {
    const body = await readJson<CreateIntegrationInput>(req)
    if (!body?.provider || !body?.name) {
      writeJson(res, 400, { ok: false, error: 'provider e name sao obrigatorios' }, corsOrigin)
      return true
    }
    const created = await repo.create(body)
    writeJson(res, 201, { ok: true, integration: created }, corsOrigin)
    return true
  }

  // PUT /api/integrations/:id
  const putMatch = url.match(/^\/api\/integrations\/([^/]+)$/)
  if (req.method === 'PUT' && putMatch) {
    const id = putMatch[1]
    const body = await readJson<UpdateIntegrationInput>(req)
    if (!body) {
      writeJson(res, 400, { ok: false, error: 'Body invalido' }, corsOrigin)
      return true
    }
    const updated = await repo.update(id, body)
    if (!updated) {
      writeJson(res, 404, { ok: false, error: 'Integracao nao encontrada' }, corsOrigin)
      return true
    }
    writeJson(res, 200, { ok: true, integration: updated }, corsOrigin)
    return true
  }

  // DELETE /api/integrations/:id
  const deleteMatch = url.match(/^\/api\/integrations\/([^/]+)$/)
  if (req.method === 'DELETE' && deleteMatch) {
    const id = deleteMatch[1]
    const deleted = await repo.delete(id)
    if (!deleted) {
      writeJson(res, 404, { ok: false, error: 'Integracao nao encontrada' }, corsOrigin)
      return true
    }
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  return false
}
