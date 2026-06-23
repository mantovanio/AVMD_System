import type { IncomingMessage, ServerResponse } from 'node:http'
import type { LinksProdutosRepository, CreateLinkInput, UpdateLinkInput } from '../repositories/linksProdutosRepository.js'
import { readJson, writeJson } from '../utils/http.js'

export async function handleLinksProdutosRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  repo: LinksProdutosRepository,
  corsOrigin: string,
): Promise<boolean> {
  const url = req.url ?? ''
  const method = req.method ?? ''

  // GET /api/links-produtos
  if (method === 'GET' && url === '/api/links-produtos') {
    const rows = await repo.findAll()
    writeJson(res, 200, { ok: true, links: rows }, corsOrigin)
    return true
  }

  // POST /api/links-produtos
  if (method === 'POST' && url === '/api/links-produtos') {
    const body = await readJson<CreateLinkInput>(req)
    if (!body?.tipo_certificado) {
      writeJson(res, 400, { ok: false, error: 'tipo_certificado e obrigatorio' }, corsOrigin)
      return true
    }
    const row = await repo.create(body)
    writeJson(res, 201, { ok: true, link: row }, corsOrigin)
    return true
  }

  // PUT /api/links-produtos/:id
  const putMatch = url.match(/^\/api\/links-produtos\/([^/]+)$/)
  if (method === 'PUT' && putMatch) {
    const id = putMatch[1]
    const body = await readJson<UpdateLinkInput>(req)
    const updated = await repo.update(id, body)
    if (!updated) {
      writeJson(res, 404, { ok: false, error: 'Link nao encontrado' }, corsOrigin)
      return true
    }
    writeJson(res, 200, { ok: true, link: updated }, corsOrigin)
    return true
  }

  // DELETE /api/links-produtos/:id
  const deleteMatch = url.match(/^\/api\/links-produtos\/([^/]+)$/)
  if (method === 'DELETE' && deleteMatch) {
    const id = deleteMatch[1]
    const deleted = await repo.delete(id)
    if (!deleted) {
      writeJson(res, 404, { ok: false, error: 'Link nao encontrado' }, corsOrigin)
      return true
    }
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  return false
}
