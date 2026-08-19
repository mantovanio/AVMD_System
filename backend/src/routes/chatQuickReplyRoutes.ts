import type { IncomingMessage, ServerResponse } from 'http'
import type { AivenSqlClient } from '../db/aivenClient.js'
import { ChatQuickReplyRepository } from '../repositories/chatQuickReplyRepository.js'
import { writeJson } from '../utils/http.js'

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        resolve({})
      }
    })
    req.on('error', reject)
  })
}

export async function handleQuickRepliesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  corsOrigin: string,
  db: AivenSqlClient,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const path = url.pathname
  const method = req.method ?? 'GET'

  if (!path.startsWith('/api/chat/quick-replies')) return false

  const repo = new ChatQuickReplyRepository(db)

  // GET /api/chat/quick-replies
  if (method === 'GET' && path === '/api/chat/quick-replies') {
    const term = url.searchParams.get('q')
    const replies = term ? await repo.search(term) : await repo.findAll()
    writeJson(res, 200, { ok: true, replies }, corsOrigin)
    return true
  }

  // GET /api/chat/quick-replies/:id
  if (method === 'GET' && path.match(/^\/api\/chat\/quick-replies\/[0-9a-f-]+$/)) {
    const id = path.split('/').pop()!
    const reply = await repo.findById(id)
    if (!reply) { writeJson(res, 404, { ok: false, error: 'Resposta rapida nao encontrada.' }, corsOrigin); return true }
    writeJson(res, 200, { ok: true, reply }, corsOrigin)
    return true
  }

  // POST /api/chat/quick-replies
  if (method === 'POST' && path === '/api/chat/quick-replies') {
    const body = await parseBody(req)
    const shortcut = String(body.shortcut ?? '').trim()
    const name = String(body.name ?? '').trim()
    if (!shortcut) { writeJson(res, 400, { ok: false, error: 'shortcut obrigatorio.' }, corsOrigin); return true }
    if (!name) { writeJson(res, 400, { ok: false, error: 'name obrigatorio.' }, corsOrigin); return true }

    try {
      const reply = await repo.create({
        shortcut,
        name,
        body: String(body.body ?? ''),
        category: body.category ? String(body.category) : null,
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
      })
      writeJson(res, 201, { ok: true, reply }, corsOrigin)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('unique')) {
        writeJson(res, 409, { ok: false, error: 'Ja existe uma resposta rapida com esse atalho.' }, corsOrigin)
      } else {
        writeJson(res, 500, { ok: false, error: msg }, corsOrigin)
      }
    }
    return true
  }

  // PUT /api/chat/quick-replies/:id
  if (method === 'PUT' && path.match(/^\/api\/chat\/quick-replies\/[0-9a-f-]+$/)) {
    const id = path.split('/').pop()!
    const body = await parseBody(req)
    try {
      const reply = await repo.update(id, {
        shortcut: body.shortcut ? String(body.shortcut).trim() : undefined,
        name: body.name ? String(body.name).trim() : undefined,
        body: body.body !== undefined ? String(body.body) : undefined,
        category: body.category !== undefined ? (body.category ? String(body.category) : null) : undefined,
        attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
        ativo: typeof body.ativo === 'boolean' ? body.ativo : undefined,
      })
      if (!reply) { writeJson(res, 404, { ok: false, error: 'Resposta rapida nao encontrada.' }, corsOrigin); return true }
      writeJson(res, 200, { ok: true, reply }, corsOrigin)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('unique')) {
        writeJson(res, 409, { ok: false, error: 'Ja existe uma resposta rapida com esse atalho.' }, corsOrigin)
      } else {
        writeJson(res, 500, { ok: false, error: msg }, corsOrigin)
      }
    }
    return true
  }

  // DELETE /api/chat/quick-replies/:id
  if (method === 'DELETE' && path.match(/^\/api\/chat\/quick-replies\/[0-9a-f-]+$/)) {
    const id = path.split('/').pop()!
    const deleted = await repo.delete(id)
    if (!deleted) { writeJson(res, 404, { ok: false, error: 'Resposta rapida nao encontrada.' }, corsOrigin); return true }
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  return false
}
