import type { IncomingMessage, ServerResponse } from 'node:http'
import type { PermissoesRepository } from '../repositories/permissoesRepository.js'
import { readJson, writeJson } from '../utils/http.js'

export async function handlePermissoesRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  repo: PermissoesRepository,
  corsOrigin: string,
): Promise<boolean> {
  const url = req.url ?? ''

  // ── GET /api/permissoes/modules-config ──────────────────────
  if (req.method === 'GET' && url === '/api/permissoes/modules-config') {
    const rows = await repo.listModulesConfig()
    const config: Record<string, boolean> = {}
    for (const row of rows) {
      config[row.module_name] = row.enabled
    }
    writeJson(res, 200, { ok: true, config }, corsOrigin)
    return true
  }

  // ── GET /api/permissoes/modulos ─────────────────────────────
  if (req.method === 'GET' && url === '/api/permissoes/modulos') {
    const modulos = await repo.listModulos()
    writeJson(res, 200, { ok: true, modulos }, corsOrigin)
    return true
  }

  // ── GET /api/permissoes/perfis ──────────────────────────────
  if (req.method === 'GET' && url === '/api/permissoes/perfis') {
    const perfis = await repo.listPerfis()
    writeJson(res, 200, { ok: true, perfis }, corsOrigin)
    return true
  }

  // ── GET /api/permissoes/pacotes ─────────────────────────────
  if (req.method === 'GET' && url === '/api/permissoes/pacotes') {
    const pacotes = await repo.listPacotes()
    writeJson(res, 200, { ok: true, pacotes }, corsOrigin)
    return true
  }

  // ── GET /api/permissoes/pacotes/:id/modulos ─────────────────
  const pacoteModulosMatch = url.match(/^\/api\/permissoes\/pacotes\/([^/]+)\/modulos$/)
  if (req.method === 'GET' && pacoteModulosMatch) {
    const modulos = await repo.getPacoteModulos(pacoteModulosMatch[1])
    writeJson(res, 200, { ok: true, modulos }, corsOrigin)
    return true
  }

  // ── PUT /api/permissoes/pacotes/:id/modulos ─────────────────
  if (req.method === 'PUT' && pacoteModulosMatch) {
    const body = await readJson<{ modulos: string[] }>(req)
    if (!body?.modulos) {
      writeJson(res, 400, { ok: false, error: 'modulos array required' }, corsOrigin)
      return true
    }
    await repo.updatePacoteModulos(pacoteModulosMatch[1], body.modulos)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // ── GET /api/permissoes/perfis/:id/modulos ──────────────────
  const perfilModulosMatch = url.match(/^\/api\/permissoes\/perfis\/([^/]+)\/modulos$/)
  if (req.method === 'GET' && perfilModulosMatch) {
    const modulos = await repo.getPerfilModulos(perfilModulosMatch[1])
    writeJson(res, 200, { ok: true, modulos }, corsOrigin)
    return true
  }

  // ── GET /api/permissoes/profile/:id ─────────────────────────
  const profilePermissoesMatch = url.match(/^\/api\/permissoes\/profile\/([^/]+)$/)
  if (req.method === 'GET' && profilePermissoesMatch) {
    const permissoes = await repo.getProfilePermissoes(profilePermissoesMatch[1])
    writeJson(res, 200, { ok: true, permissoes }, corsOrigin)
    return true
  }

  // ── GET /api/permissoes/profile/:id/overrides ───────────────
  const profileOverridesMatch = url.match(/^\/api\/permissoes\/profile\/([^/]+)\/overrides$/)
  if (req.method === 'GET' && profileOverridesMatch) {
    const overrides = await repo.getProfileOverrides(profileOverridesMatch[1])
    writeJson(res, 200, { ok: true, overrides }, corsOrigin)
    return true
  }

  // ── PUT /api/permissoes/profile/:id/overrides ───────────────
  const putOverridesMatch = url.match(/^\/api\/permissoes\/profile\/([^/]+)\/overrides$/)
  if (req.method === 'PUT' && putOverridesMatch) {
    const body = await readJson<{ overrides: Array<{ modulo_id: string; nivel_acesso: string }> }>(req)
    const profileId = putOverridesMatch[1]

    if (!body?.overrides) {
      writeJson(res, 400, { ok: false, error: 'overrides array required' }, corsOrigin)
      return true
    }

    await repo.clearProfileOverrides(profileId)
    for (const ov of body.overrides) {
      if (ov.nivel_acesso === 'herdar') continue
      await repo.setProfileOverride(profileId, ov.modulo_id, ov.nivel_acesso)
    }

    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // ── GET /api/permissoes/parceiro/:id/pacote ─────────────────
  const parceiroPacoteMatch = url.match(/^\/api\/permissoes\/parceiro\/([^/]+)\/pacote$/)
  if (req.method === 'GET' && parceiroPacoteMatch) {
    const pacote = await repo.getParceiroPacote(parceiroPacoteMatch[1])
    writeJson(res, 200, { ok: true, pacote }, corsOrigin)
    return true
  }

  return false
}
