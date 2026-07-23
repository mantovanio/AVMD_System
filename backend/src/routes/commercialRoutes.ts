import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson, writeJson } from '../utils/http.js'
import { CommercialRepository } from '../repositories/commercialRepository.js'
import type { CheckoutPaymentService } from '../services/checkoutPaymentService.js'

type SalesRequest = { limit?: number; dateFrom?: string | null; dateTo?: string | null }
type SaleStatusRequest = { id: string; status: string }
type SalePaymentStatusRequest = { id: string; status: string }
type SalePaymentMethodRequest = { id: string; forma_pagamento_id: string; admin_profile_id: string; payment_installments?: number | null }
type ScheduleRequest = { dataBase?: string | null; status?: string | null; agenteId?: string | null }
type UpdateVendaRequest = {
  id: string
  tipo_produto?: string
  tipo_venda?: string
  tipo_emissao?: string
  tabela_preco_id?: string
  tabela_preco_item_id?: string
  forma_pagamento_id?: string
  valor_venda?: number
  desconto?: number
  observacoes?: string
  data_vencimento?: string
  vendedor_id?: string | null
  contador_id?: string | null
}
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
type ImportCustomersRequest = {
  items?: Array<{
    tipo_cliente?: string | null
    data_nascimento?: string | null
    tipo_cadastro?: string | null
    documento?: string | null
    documento_titular?: string | null
    cpf_cnpj?: string | null
    cpf?: string | null
    cnpj?: string | null
    nome?: string | null
    razao_social?: string | null
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
    pedido?: string | null
    protocolo?: string | null
    produto?: string | null
    tipo?: string | null
    validade?: string | null
    vencimento?: string | null
    atendente?: string | null
    ponto?: string | null
    vendedor?: string | null
    status_pedido?: string | null
    valor_compra?: string | number | null
    ar?: string | null
    iss_retido?: boolean | null
    status?: string | null
  }>
}
type CommissionReportRequest = {
  from?: string | null
  to?: string | null
  viewer_profile_id: string
  viewer_perfil: string
  target_profile_id?: string | null
}


type CustomerPortalAccessRequest = { customerId?: string }
type CustomerPortalAccessStatusRequest = { customerId?: string; status?: string }

export async function handleCommercialRoutes(req: IncomingMessage, res: ServerResponse, repository: CommercialRepository, corsOrigin: string, paymentService?: CheckoutPaymentService) {
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

  if (req.method === 'POST' && req.url === '/api/comercial/vendas/pagamento') {
    const body = await readJson<SalePaymentStatusRequest>(req)
    const venda = await repository.updateSalePaymentStatus(body as { id: string; status: 'em_aberto' | 'pago' | 'recusado' })
    writeJson(res, 200, { ok: true, venda }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/comercial/vendas/forma-pagamento') {
    const body = await readJson<SalePaymentMethodRequest>(req)
    try {
      const venda = await repository.updateSalePaymentMethod(body)
      if (!venda) {
        writeJson(res, 404, { ok: false, error: 'Venda ou forma de pagamento não encontrada.' }, corsOrigin)
        return true
      }
      const charge = paymentService
        ? await paymentService.createCommercialPaymentLink({ vendaId: body.id, profileId: body.admin_profile_id })
        : null
      if (charge && !charge.ok) {
        writeJson(res, 502, {
          ok: false,
          venda,
          charge,
          error: charge.error ?? 'Forma alterada, mas a nova cobrança não foi gerada.',
        }, corsOrigin)
        return true
      }
      writeJson(res, 200, { ok: true, venda, charge }, corsOrigin)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível alterar a forma de pagamento.'
      const status = message.includes('administradores') ? 403 : 400
      writeJson(res, status, { ok: false, error: message }, corsOrigin)
    }
    return true
  }

  const vendaUpdateMatch = url.match(/^\/api\/comercial\/vendas\/([^/]+)$/)
  if (method === 'PATCH' && vendaUpdateMatch) {
    const body = await readJson<UpdateVendaRequest>(req)
    body.id = vendaUpdateMatch[1]
    const venda = await repository.updateVenda(body)
    if (!venda) {
      writeJson(res, 404, { ok: false, error: 'Venda nao encontrada.' }, corsOrigin)
      return true
    }
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
    const body = await readJson<{
      page?: number
      pageSize?: number
      search?: string
      filterTipo?: string
      filterStatus?: string
    }>(req)
    const result = await repository.listCustomers(body)
    writeJson(res, 200, { ok: true, ...result }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/comercial/clientes/save') {
    const body = await readJson<SaveCustomerRequest>(req)
    const cliente = await repository.saveCustomer(body)
    writeJson(res, 200, { ok: true, cliente }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/comercial/clientes/import') {
    const body = await readJson<ImportCustomersRequest>(req)
    const result = await repository.importCustomers(body.items ?? [])
    writeJson(res, 200, { ok: true, ...result }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/comercial/clientes/buscar') {
    const body = await readJson<SearchCustomerRequest>(req)
    const term = body.term?.trim() ?? ''
    const clientes = term.length >= 3 ? await repository.searchCustomers(term) : []
    writeJson(res, 200, { ok: true, clientes }, corsOrigin)
    return true
  }


  if (req.method === 'POST' && req.url === '/api/comercial/clientes/access') {
    const body = await readJson<CustomerPortalAccessRequest>(req)
    if (!body.customerId) {
      writeJson(res, 400, { ok: false, error: 'customerId obrigatorio.' }, corsOrigin)
      return true
    }
    const access = await repository.getCustomerPortalAccess(body.customerId)
    writeJson(res, 200, { ok: true, access }, corsOrigin)
    return true
  }

  if (req.method === 'PATCH' && req.url === '/api/comercial/clientes/access/status') {
    const body = await readJson<CustomerPortalAccessStatusRequest>(req)
    if (!body.customerId || !body.status) {
      writeJson(res, 400, { ok: false, error: 'customerId e status obrigatorios.' }, corsOrigin)
      return true
    }
    const access = await repository.setCustomerPortalAccessStatus(body.customerId, body.status)
    if (!access) {
      writeJson(res, 404, { ok: false, error: 'Acesso do cliente nao encontrado.' }, corsOrigin)
      return true
    }
    writeJson(res, 200, { ok: true, access }, corsOrigin)
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

  if (req.method === 'GET' && req.url === '/api/comercial/relatorios/comissoes/perfis') {
    const perfis = await repository.listCommissionReportProfiles()
    writeJson(res, 200, { ok: true, perfis }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/comercial/relatorios/comissoes') {
    const body = await readJson<CommissionReportRequest>(req)
    const relatorio = await repository.getCommissionReport(body)
    writeJson(res, 200, { ok: true, relatorio }, corsOrigin)
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


