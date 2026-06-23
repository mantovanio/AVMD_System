import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AutomationRulesRepository } from '../repositories/automationRulesRepository.js'
import { readJson, writeJson } from '../utils/http.js'

export async function handleAutomationRulesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  repo: AutomationRulesRepository,
  corsOrigin: string,
): Promise<boolean> {
  const url = req.url ?? ''
  const method = req.method ?? ''

  // GET /api/automation/rules?keys=ren30,ren15,ren7,followup
  if (method === 'GET' && url.startsWith('/api/automation/rules')) {
    const qs = new URLSearchParams(url.split('?')[1] ?? '')
    const keys = (qs.get('keys') ?? 'ren30,ren15,ren7,followup').split(',').map(k => k.trim()).filter(Boolean)
    const rows = await repo.findByKeys(keys)
    writeJson(res, 200, { ok: true, rules: rows }, corsOrigin)
    return true
  }

  // PATCH /api/automation/rules/:id
  const patchMatch = url.match(/^\/api\/automation\/rules\/([^/]+)$/)
  if (method === 'PATCH' && patchMatch) {
    const id = patchMatch[1]
    const body = await readJson<{ ativo: boolean }>(req)
    if (typeof body?.ativo !== 'boolean') {
      writeJson(res, 400, { ok: false, error: 'ativo (boolean) e obrigatorio' }, corsOrigin)
      return true
    }
    const updated = await repo.toggle(id, body.ativo)
    if (!updated) {
      writeJson(res, 404, { ok: false, error: 'Regra nao encontrada' }, corsOrigin)
      return true
    }
    writeJson(res, 200, { ok: true, rule: updated }, corsOrigin)
    return true
  }

  return false
}
