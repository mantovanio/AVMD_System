import type { IncomingMessage, ServerResponse } from 'node:http'
import type { HierarquiaRepository } from '../repositories/hierarquiaRepository.js'
import { readJson, writeJson } from '../utils/http.js'

function route(url: string | undefined, pattern: string): RegExpMatchArray | null {
  return (url ?? '').match(new RegExp(`^${pattern}$`))
}

export async function handleHierarquiaRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  repo: HierarquiaRepository,
  corsOrigin: string,
): Promise<boolean> {
  const url = req.url ?? ''
  const method = req.method ?? ''
  const parsed = new URL(url, 'http://localhost')
  const pathname = parsed.pathname

  if (!pathname.startsWith('/api/hierarquia')) return false

  // GET /api/hierarquia/ponto/:pontoId
  const pontoMatch = route(pathname, '/api/hierarquia/ponto/([\\w-]+)')
  if (method === 'GET' && pontoMatch) {
    const rows = await repo.getTreeForPonto(pontoMatch[1])
    writeJson(res, 200, { ok: true, profiles: rows }, corsOrigin)
    return true
  }

  // GET /api/hierarquia/agentes-disponiveis
  if (method === 'GET' && pathname === '/api/hierarquia/agentes-disponiveis') {
    const rows = await repo.getAvailableAgentes(parsed.searchParams.get('pontoId'))
    writeJson(res, 200, { ok: true, profiles: rows }, corsOrigin)
    return true
  }

  // GET /api/hierarquia/vendedores-disponiveis
  if (method === 'GET' && pathname === '/api/hierarquia/vendedores-disponiveis') {
    const rows = await repo.getAvailableVendedores()
    writeJson(res, 200, { ok: true, profiles: rows }, corsOrigin)
    return true
  }

  // GET /api/hierarquia/faixas/:profileId
  const faixasMatch = route(pathname, '/api/hierarquia/faixas/([\\w-]+)')
  if (method === 'GET' && faixasMatch) {
    const rows = await repo.getFaixasForProfile(faixasMatch[1])
    writeJson(res, 200, { ok: true, faixas: rows }, corsOrigin)
    return true
  }

  if (method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') return false

  // POST /api/hierarquia/agente/vincular
  if (method === 'POST' && pathname === '/api/hierarquia/agente/vincular') {
    const body = await readJson<{ profileId: string; pontoId: string }>(req)
    if (!body.profileId || !body.pontoId) {
      writeJson(res, 400, { ok: false, error: 'profileId e pontoId obrigatórios' }, corsOrigin)
      return true
    }
    await repo.linkAgenteAoPonto(body.profileId, body.pontoId)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // POST /api/hierarquia/agente/desvincular
  if (method === 'POST' && pathname === '/api/hierarquia/agente/desvincular') {
    const body = await readJson<{ profileId: string; pontoId: string }>(req)
    if (!body.profileId || !body.pontoId) {
      writeJson(res, 400, { ok: false, error: 'profileId e pontoId obrigatórios' }, corsOrigin)
      return true
    }
    await repo.unlinkAgenteFromPonto(body.profileId, body.pontoId)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // POST /api/hierarquia/vendedor/vincular
  if (method === 'POST' && pathname === '/api/hierarquia/vendedor/vincular') {
    const body = await readJson<{ vendedorId: string; parentId: string; nivel: number }>(req)
    if (!body.vendedorId || !body.parentId) {
      writeJson(res, 400, { ok: false, error: 'vendedorId e parentId obrigatórios' }, corsOrigin)
      return true
    }
    try {
      await repo.linkVendedorToParent(body.vendedorId, body.parentId, body.nivel ?? 1)
    } catch (e) {
      writeJson(res, 400, { ok: false, error: e instanceof Error ? e.message : 'Erro' }, corsOrigin)
      return true
    }
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // POST /api/hierarquia/vendedor/desvincular
  if (method === 'POST' && pathname === '/api/hierarquia/vendedor/desvincular') {
    const body = await readJson<{ vendedorId: string }>(req)
    if (!body.vendedorId) {
      writeJson(res, 400, { ok: false, error: 'vendedorId obrigatório' }, corsOrigin)
      return true
    }
    await repo.unlinkVendedorFromParent(body.vendedorId)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // PATCH /api/hierarquia/profile/:id/config
  const configMatch = route(pathname, '/api/hierarquia/profile/([\\w-]+)/config')
  if (method === 'PATCH' && configMatch) {
    const body = await readJson<{ supervisao_pct?: number; link_loja?: string | null }>(req)
    await repo.updateProfileConfig(configMatch[1], body)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // POST /api/hierarquia/faixas — save (create or update)
  if (method === 'POST' && pathname === '/api/hierarquia/faixas') {
    const body = await readJson<{
      id?: string | null
      profile_id: string
      tipo_comissao: string
      faixa: string
      min_emissoes: number
      max_emissoes?: number | null
      percentual: number
      valor_exemplo?: number | null
      ordem: number
    }>(req)
    if (!body.profile_id || !body.tipo_comissao) {
      writeJson(res, 400, { ok: false, error: 'profile_id e tipo_comissao obrigatórios' }, corsOrigin)
      return true
    }
    const faixa = await repo.saveFaixa({
      ...body,
      max_emissoes: body.max_emissoes ?? null,
      valor_exemplo: body.valor_exemplo ?? null,
    })
    writeJson(res, 200, { ok: true, faixa }, corsOrigin)
    return true
  }

  // DELETE /api/hierarquia/faixas/:id/:profileId
  const deleteFaixaMatch = route(pathname, '/api/hierarquia/faixas/([\\w-]+)/([\\w-]+)')
  if (method === 'DELETE' && deleteFaixaMatch) {
    await repo.deleteFaixa(deleteFaixaMatch[1], deleteFaixaMatch[2])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  return false
}
