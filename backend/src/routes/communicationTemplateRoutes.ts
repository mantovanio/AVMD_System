import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CommunicationTemplateRepository, CreateTemplateInput, UpdateTemplateInput } from '../repositories/communicationTemplateRepository.js'
import { readJson, writeJson } from '../utils/http.js'

export async function handleCommunicationTemplateRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  repo: CommunicationTemplateRepository,
  corsOrigin: string,
): Promise<boolean> {
  const url = req.url ?? ''
  const method = req.method ?? ''

  // GET /api/communication/templates
  if (method === 'GET' && url === '/api/communication/templates') {
    const rows = await repo.findAll()
    writeJson(res, 200, { ok: true, templates: rows }, corsOrigin)
    return true
  }

  // POST /api/communication/templates
  if (method === 'POST' && url === '/api/communication/templates') {
    const body = await readJson<CreateTemplateInput>(req)
    if (!body?.name || !body?.body || !body?.channel) {
      writeJson(res, 400, { ok: false, error: 'name, channel e body sao obrigatorios' }, corsOrigin)
      return true
    }
    const row = await repo.create(body)
    writeJson(res, 201, { ok: true, template: row }, corsOrigin)
    return true
  }

  // PUT /api/communication/templates/:id
  const putMatch = url.match(/^\/api\/communication\/templates\/([^/]+)$/)
  if (method === 'PUT' && putMatch) {
    const id = putMatch[1]
    const body = await readJson<UpdateTemplateInput>(req)
    if (body.ativo === true) {
      const current = await repo.findById(id)
      if (current) await repo.clearAtivoByChannel(current.channel, id)
    }
    const updated = await repo.update(id, body)
    if (!updated) {
      writeJson(res, 404, { ok: false, error: 'Template nao encontrado' }, corsOrigin)
      return true
    }
    writeJson(res, 200, { ok: true, template: updated }, corsOrigin)
    return true
  }

  // DELETE /api/communication/templates/:id
  const deleteMatch = url.match(/^\/api\/communication\/templates\/([^/]+)$/)
  if (method === 'DELETE' && deleteMatch) {
    const id = deleteMatch[1]
    const deleted = await repo.delete(id)
    if (!deleted) {
      writeJson(res, 404, { ok: false, error: 'Template nao encontrado' }, corsOrigin)
      return true
    }
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  return false
}
