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

  return false
}


