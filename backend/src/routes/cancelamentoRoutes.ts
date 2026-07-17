import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson, writeJson } from '../utils/http.js'
import { CancelamentoRepository } from '../repositories/cancelamentoRepository.js'
import { CommercialRepository } from '../repositories/commercialRepository.js'

type CancelarVendaRequest = {
  venda_id: string
  motivo: string
  dentro_prazo_30d: boolean
  custo_operacional?: number
  observacoes?: string
  cancelado_por: string
}

export async function handleCancelamentoRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  cancelamentoRepo: CancelamentoRepository,
  commercialRepo: CommercialRepository,
  corsOrigin: string,
) {
  const method = req.method ?? ''
  const url = req.url ?? ''

  if (method === 'POST' && url === '/api/cancelamentos') {
    const body = await readJson<CancelarVendaRequest>(req)

    if (!body.venda_id || !body.motivo || !body.cancelado_por) {
      writeJson(res, 400, { ok: false, error: 'venda_id, motivo e cancelado_por sao obrigatorios.' }, corsOrigin)
      return true
    }

    const jaCancelado = await cancelamentoRepo.findByVendaId(body.venda_id)
    if (jaCancelado) {
      writeJson(res, 409, { ok: false, error: 'Esta venda ja possui um cancelamento registrado.' }, corsOrigin)
      return true
    }

    const vendas = await commercialRepo.listSales({ limit: 200 }) as Array<Record<string, unknown>>
    const venda = vendas.find(v => v.id === body.venda_id)
    if (!venda) {
      writeJson(res, 404, { ok: false, error: 'Venda nao encontrada.' }, corsOrigin)
      return true
    }

    const v = venda as Record<string, unknown>
    const valorVenda = Number(v.valor_venda ?? 0)
    const comissaoVendedorValor = Number(v.comissao_vendedor_valor ?? 0)
    const comissaoAgenteValor = Number(v.comissao_agente_valor ?? 0)
    const custoOperacional = body.custo_operacional ?? 0

    const valorReembolsado = body.dentro_prazo_30d
      ? Math.max(0, valorVenda - custoOperacional)
      : 0

    const cancelamentoAtomico = await cancelamentoRepo.createAndCancelSale({
      venda_id: body.venda_id,
      motivo: body.motivo,
      dentro_prazo_30d: body.dentro_prazo_30d,
      valor_reembolsado: valorReembolsado || null,
      custo_operacional: custoOperacional,
      comissao_vendedor_revertida: comissaoVendedorValor,
      comissao_agente_revertida: comissaoAgenteValor,
      estorno_gateway_ref: null,
      estorno_realizado: false,
      observacoes: body.observacoes ?? null,
      cancelado_por: body.cancelado_por,
    })

    writeJson(res, 200, { ok: true, cancelamento: cancelamentoAtomico }, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/cancelamentos/listar') {
    const body = await readJson<{ limit?: number; offset?: number }>(req)
    const cancelamentos = await cancelamentoRepo.list(body.limit, body.offset)
    writeJson(res, 200, { ok: true, cancelamentos }, corsOrigin)
    return true
  }

  if (method === 'POST' && url.startsWith('/api/cancelamentos/')) {
    const vendaId = url.replace('/api/cancelamentos/', '')
    if (vendaId) {
      const cancelamento = await cancelamentoRepo.findByVendaId(vendaId)
      writeJson(res, 200, { ok: true, cancelamento }, corsOrigin)
      return true
    }
  }

  return false
}
