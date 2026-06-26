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

  const pontoMatch = route(pathname, '/api/hierarquia/ponto/([\w-]+)')
  if (method === 'GET' && pontoMatch) {
    const rows = await repo.getTreeForPonto(pontoMatch[1])
    writeJson(res, 200, { ok: true, profiles: rows }, corsOrigin)
    return true
  }

  if (method === 'GET' && pathname === '/api/hierarquia/agentes-disponiveis') {
    const rows = await repo.getAvailableAgentes(parsed.searchParams.get('pontoId'))
    writeJson(res, 200, { ok: true, profiles: rows }, corsOrigin)
    return true
  }

  if (method === 'GET' && pathname === '/api/hierarquia/vendedores-disponiveis') {
    const rows = await repo.getAvailableVendedores()
    writeJson(res, 200, { ok: true, profiles: rows }, corsOrigin)
    return true
  }

  const faixasMatch = route(pathname, '/api/hierarquia/faixas/([\w-]+)')
  if (method === 'GET' && faixasMatch) {
    const rows = await repo.getFaixasForProfile(faixasMatch[1])
    writeJson(res, 200, { ok: true, faixas: rows }, corsOrigin)
    return true
  }

  const remuneracaoMatch = route(pathname, '/api/hierarquia/remuneracao/([\w-]+)/([\w-]+)')
  if (method === 'GET' && remuneracaoMatch) {
    const rows = await repo.listRemuneracaoRules(remuneracaoMatch[1], remuneracaoMatch[2])
    writeJson(res, 200, { ok: true, regras: rows }, corsOrigin)
    return true
  }

  const modeloMatch = route(pathname, '/api/hierarquia/modelo-comercial/([\w-]+)/([\w-]+)')
  if (method === 'GET' && modeloMatch) {
    const modelo = await repo.getModeloNegocio(modeloMatch[1], modeloMatch[2])
    writeJson(res, 200, { ok: true, modelo }, corsOrigin)
    return true
  }

  const precosBaseMatch = route(pathname, '/api/hierarquia/revenda-precos/([\w-]+)/([\w-]+)')
  if (method === 'GET' && precosBaseMatch) {
    const precos = await repo.listRevendaPriceBases(precosBaseMatch[1], precosBaseMatch[2])
    writeJson(res, 200, { ok: true, precos }, corsOrigin)
    return true
  }

  const repassesMatch = route(pathname, '/api/hierarquia/repasses/([\w-]+)/([\w-]+)')
  if (method === 'GET' && repassesMatch) {
    const regras = await repo.listRepasseRules(repassesMatch[1], repassesMatch[2])
    writeJson(res, 200, { ok: true, regras }, corsOrigin)
    return true
  }

  if (method === 'GET' && pathname === '/api/hierarquia/tabela-itens') {
    const itens = await repo.listTabelaPrecoItemResumo()
    writeJson(res, 200, { ok: true, itens }, corsOrigin)
    return true
  }

  if (method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') return false

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

  const configMatch = route(pathname, '/api/hierarquia/profile/([\w-]+)/config')
  if (method === 'PATCH' && configMatch) {
    const body = await readJson<{ supervisao_pct?: number; link_loja?: string | null }>(req)
    await repo.updateProfileConfig(configMatch[1], body)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

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

  if (method === 'POST' && pathname === '/api/hierarquia/remuneracao') {
    const body = await readJson<{
      id?: string | null
      profile_id: string
      ponto_atendimento_id?: string | null
      escopo: string
      tipo_calculo: string
      documento_tipo: string
      valor: number
      ativo?: boolean
    }>(req)
    if (!body.profile_id || !body.escopo || !body.tipo_calculo || !body.documento_tipo) {
      writeJson(res, 400, { ok: false, error: 'profile_id, escopo, tipo_calculo e documento_tipo são obrigatórios' }, corsOrigin)
      return true
    }
    const regra = await repo.saveRemuneracaoRule(body)
    writeJson(res, 200, { ok: true, regra }, corsOrigin)
    return true
  }

  if (method === 'POST' && pathname === '/api/hierarquia/modelo-comercial') {
    const body = await readJson<{
      profile_id: string
      ponto_atendimento_id: string
      modo_operacao: 'comissao' | 'revenda'
      ativo?: boolean
    }>(req)
    if (!body.profile_id || !body.ponto_atendimento_id || !body.modo_operacao) {
      writeJson(res, 400, { ok: false, error: 'profile_id, ponto_atendimento_id e modo_operacao são obrigatórios' }, corsOrigin)
      return true
    }
    const modelo = await repo.saveModeloNegocio(body)
    writeJson(res, 200, { ok: true, modelo }, corsOrigin)
    return true
  }

  if (method === 'POST' && pathname === '/api/hierarquia/revenda-precos') {
    const body = await readJson<{
      id?: string | null
      profile_id: string
      ponto_atendimento_id: string
      tabela_preco_item_id: string
      valor_base: number
      ativo?: boolean
    }>(req)
    if (!body.profile_id || !body.ponto_atendimento_id || !body.tabela_preco_item_id) {
      writeJson(res, 400, { ok: false, error: 'profile_id, ponto_atendimento_id e tabela_preco_item_id são obrigatórios' }, corsOrigin)
      return true
    }
    const preco = await repo.saveRevendaPriceBase(body)
    writeJson(res, 200, { ok: true, preco }, corsOrigin)
    return true
  }

  if (method === 'POST' && pathname === '/api/hierarquia/repasses') {
    const body = await readJson<{
      id?: string | null
      parent_profile_id: string
      child_profile_id: string
      ponto_atendimento_id: string
      escopo: 'validacao' | 'venda' | 'margem_revenda'
      tipo_calculo: 'fixa' | 'percentual'
      valor: number
      ativo?: boolean
    }>(req)
    if (!body.parent_profile_id || !body.child_profile_id || !body.ponto_atendimento_id || !body.escopo || !body.tipo_calculo) {
      writeJson(res, 400, { ok: false, error: 'parent_profile_id, child_profile_id, ponto_atendimento_id, escopo e tipo_calculo são obrigatórios' }, corsOrigin)
      return true
    }
    const regra = await repo.saveRepasseRule(body)
    writeJson(res, 200, { ok: true, regra }, corsOrigin)
    return true
  }

  const deleteFaixaMatch = route(pathname, '/api/hierarquia/faixas/([\w-]+)/([\w-]+)')
  if (method === 'DELETE' && deleteFaixaMatch) {
    await repo.deleteFaixa(deleteFaixaMatch[1], deleteFaixaMatch[2])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  const deleteRemuneracaoMatch = route(pathname, '/api/hierarquia/remuneracao/([\w-]+)/([\w-]+)')
  if (method === 'DELETE' && deleteRemuneracaoMatch) {
    await repo.deleteRemuneracaoRule(deleteRemuneracaoMatch[1], deleteRemuneracaoMatch[2])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  const deletePrecoBaseMatch = route(pathname, '/api/hierarquia/revenda-precos/([\w-]+)/([\w-]+)')
  if (method === 'DELETE' && deletePrecoBaseMatch) {
    await repo.deleteRevendaPriceBase(deletePrecoBaseMatch[1], deletePrecoBaseMatch[2])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  const deleteRepasseMatch = route(pathname, '/api/hierarquia/repasses/([\w-]+)/([\w-]+)')
  if (method === 'DELETE' && deleteRepasseMatch) {
    await repo.deleteRepasseRule(deleteRepasseMatch[1], deleteRepasseMatch[2])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  return false
}
