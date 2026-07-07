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

  const redirectToLink = async (
    id: string,
    field: 'link_renovacao' | 'link_nova_emissao',
  ): Promise<boolean> => {
    const row = await repo.findById(id)
    if (!row || !row.ativo) {
      writeJson(res, 404, { ok: false, error: 'Link nao encontrado' }, corsOrigin)
      return true
    }

    const destination = String(row[field] ?? '').trim()
    if (!destination) {
      writeJson(res, 404, { ok: false, error: 'Destino nao configurado para este link' }, corsOrigin)
      return true
    }

    res.statusCode = 302
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    res.setHeader('Location', destination)
    res.end()
    return true
  }

  const redirectRenovacaoMatch = url.match(/^\/r\/renovacao\/([^/?#]+)$/)
  if (method === 'GET' && redirectRenovacaoMatch) {
    return redirectToLink(redirectRenovacaoMatch[1], 'link_renovacao')
  }

  const redirectNovaEmissaoMatch = url.match(/^\/r\/nova-emissao\/([^/?#]+)$/)
  if (method === 'GET' && redirectNovaEmissaoMatch) {
    return redirectToLink(redirectNovaEmissaoMatch[1], 'link_nova_emissao')
  }

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
