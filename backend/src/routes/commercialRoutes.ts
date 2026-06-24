import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson, writeJson } from '../utils/http.js'
import { CommercialRepository } from '../repositories/commercialRepository.js'

type SalesRequest = { limit?: number }
type SaleStatusRequest = { id: string; status: string }
type ScheduleRequest = { dataBase?: string | null; status?: string | null; agenteId?: string | null }
type SaveAgendaRequest = {
  agendaId?: string | null
  vendaId?: string | null
  cliente?: string
  telefone?: string | null
  servico?: string | null
  data_hora: string
  status: string
  observacoes?: string | null
  ponto_atendimento_id?: string | null
  agente_registro_id?: string | null
  tipo_atendimento?: string | null
}
type SaveCustomerRequest = {
  id?: string | null
  tipo_cliente?: string | null
  tipo_cadastro?: string | null
  cpf_cnpj: string
  nome: string
  nome_fantasia?: string | null
  email?: string | null
  telefone?: string | null
  cidade?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  uf?: string | null
  cep?: string | null
  inscricao_municipal?: string | null
  inscricao_estadual?: string | null
  iss_retido?: boolean | null
  status?: string | null
  metadata?: Record<string, unknown> | null
}
type SearchCustomerRequest = { term?: string }

export async function handleCommercialRoutes(req: IncomingMessage, res: ServerResponse, repository: CommercialRepository, corsOrigin: string) {
  const method = req.method ?? ''
  const url = req.url ?? ''

  if (req.method === 'POST' && req.url === '/api/comercial/vendas') {
    const body = await readJson<SalesRequest>(req)
    const vendas = await repository.listSales(body)
    writeJson(res, 200, { ok: true, vendas }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/comercial/vendas/status') {
    const body = await readJson<SaleStatusRequest>(req)
    const venda = await repository.updateSaleStatus(body)
    writeJson(res, 200, { ok: true, venda }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/comercial/agenda') {
    const body = await readJson<ScheduleRequest>(req)
    const agenda = await repository.listSchedule(body)
    writeJson(res, 200, { ok: true, agenda }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/comercial/agenda/save') {
    const body = await readJson<SaveAgendaRequest>(req)
    if (body.agendaId && body.vendaId && body.agente_registro_id && body.ponto_atendimento_id) {
      const agenda = await repository.saveValidationAgenda({
        agendaId: body.agendaId,
        vendaId: body.vendaId,
        agente_registro_id: body.agente_registro_id,
        ponto_atendimento_id: body.ponto_atendimento_id,
        data_agendada: body.data_hora,
        tipo_atendimento: body.tipo_atendimento ?? null,
        observacoes: body.observacoes ?? null,
        status_agendamento: body.status === 'aguardando' ? 'pendente' : body.status,
      })
      writeJson(res, 200, { ok: true, agenda }, corsOrigin)
      return true
    }
    const agenda = await repository.upsertAgenda(body)
    writeJson(res, 200, { ok: true, agenda }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/comercial/clientes') {
    const clientes = await repository.listCustomers()
    writeJson(res, 200, { ok: true, clientes }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/comercial/clientes/save') {
    const body = await readJson<SaveCustomerRequest>(req)
    const cliente = await repository.saveCustomer(body)
    writeJson(res, 200, { ok: true, cliente }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/comercial/clientes/buscar') {
    const body = await readJson<SearchCustomerRequest>(req)
    const term = body.term?.trim() ?? ''
    const clientes = term.length >= 3 ? await repository.searchCustomers(term) : []
    writeJson(res, 200, { ok: true, clientes }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/comercial/pontos') {
    const pontos = await repository.listPoints()
    writeJson(res, 200, { ok: true, pontos }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/comercial/agentes') {
    const agentes = await repository.listAgents()
    writeJson(res, 200, { ok: true, agentes }, corsOrigin)
    return true
  }

  // ── Pontos de atendimento (admin CRUD) ──────────────────────────────
  if (method === 'GET' && url === '/api/config/pontos') {
    const pontos = await repository.listAllPoints()
    writeJson(res, 200, { ok: true, pontos }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/config/pontos') {
    const body = await readJson<Record<string, unknown>>(req)
    const ponto = await repository.savePoint(body as Parameters<typeof repository.savePoint>[0])
    writeJson(res, 200, { ok: true, ponto }, corsOrigin)
    return true
  }

  const pontosStatusMatch = url.match(/^\/api\/config\/pontos\/([^/]+)\/status$/)
  if (method === 'PATCH' && pontosStatusMatch) {
    const body = await readJson<{ status: string }>(req)
    await repository.updatePointStatus(pontosStatusMatch[1], body.status ?? 'ativo')
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // ── Dados de referência ─────────────────────────────────────────────
  if (method === 'GET' && url === '/api/ref/bancos') {
    const bancos = await repository.listBancos()
    writeJson(res, 200, { ok: true, bancos }, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/ref/centros') {
    const centros = await repository.listCentrosCustos()
    writeJson(res, 200, { ok: true, centros }, corsOrigin)
    return true
  }

  if (method === 'GET' && url === '/api/ref/agentes') {
    const agentes = await repository.listActiveAgents()
    writeJson(res, 200, { ok: true, agentes }, corsOrigin)
    return true
  }

  // ── Parceiros agentes permitidos (antes das rotas /:id p/ evitar conflito) ──
  if (method === 'GET' && url === '/api/parceiros/agentes') {
    const agentes = await repository.listParceiroAgentes()
    writeJson(res, 200, { ok: true, agentes }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/parceiros/agentes') {
    const body = await readJson<{ parceiro_id: string; agente_registro_id: string; ponto_atendimento_id?: string | null; ativo?: boolean }>(req)
    const agente = await repository.saveParceiroAgente(body)
    writeJson(res, 200, { ok: true, agente }, corsOrigin)
    return true
  }

  const agenteIdMatch = url.match(/^\/api\/parceiros\/agentes\/([^/]+)$/)

  if (method === 'PATCH' && agenteIdMatch) {
    const body = await readJson<{ ativo: boolean }>(req)
    await repository.toggleParceiroAgente(agenteIdMatch[1], body.ativo)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  if (method === 'DELETE' && agenteIdMatch) {
    await repository.deleteParceiroAgente(agenteIdMatch[1])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  // ── Parceiros ───────────────────────────────────────────────────────
  if (method === 'GET' && url === '/api/parceiros') {
    const parceiros = await repository.listParceiros()
    writeJson(res, 200, { ok: true, parceiros }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/parceiros') {
    const body = await readJson<Record<string, unknown>>(req)
    const parceiro = await repository.saveParceiro(body)
    writeJson(res, 200, { ok: true, parceiro }, corsOrigin)
    return true
  }

  const parceiroVinculosMatch = url.match(/^\/api\/parceiros\/([^/]+)\/vinculos$/)
  if (method === 'GET' && parceiroVinculosMatch) {
    const count = await repository.countVinculosParceiro(parceiroVinculosMatch[1])
    writeJson(res, 200, { ok: true, count }, corsOrigin)
    return true
  }

  const parceiroIdMatch = url.match(/^\/api\/parceiros\/([^/]+)$/)

  if (method === 'PATCH' && parceiroIdMatch) {
    const body = await readJson<{ status: string; segmento: string; data_desativacao: string | null }>(req)
    await repository.updateParceiroStatus(parceiroIdMatch[1], body)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  if (method === 'DELETE' && parceiroIdMatch) {
    await repository.deleteParceiro(parceiroIdMatch[1])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  return false
}


