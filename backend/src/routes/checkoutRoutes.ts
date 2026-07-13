import type { IncomingMessage, ServerResponse } from 'node:http'
import { readJson, writeJson } from '../utils/http.js'
import type { CheckoutContextApiRequest, CheckoutSubmitRequest } from '../contracts/checkoutContract.js'
import { CheckoutService } from '../services/checkoutService.js'
import { CheckoutPaymentService } from '../services/checkoutPaymentService.js'

export async function handleCheckoutRoutes(req: IncomingMessage, res: ServerResponse, service: CheckoutService, corsOrigin: string, paymentService?: CheckoutPaymentService) {
  if (req.method === 'OPTIONS') {
    writeJson(res, 204, {}, corsOrigin)
    return
  }

  if (req.method === 'POST' && req.url === '/api/checkout/context') {
    const body = await readJson<CheckoutContextApiRequest>(req)
    const response = await service.handleContext(body)
    writeJson(res, response.ok ? 200 : 400, response, corsOrigin)
    return
  }


  if (req.method === 'POST' && req.url === '/api/checkout/webhook/safe2pay') {
    const body = await readJson<Record<string, unknown>>(req)
    if (!paymentService) {
      writeJson(res, 500, { ok: false, error: 'Servico de pagamento indisponivel.' }, corsOrigin)
      return
    }
    const result = await paymentService.applyWebhook({ gateway: 'safe2pay', payload: body })
    writeJson(res, 200, { ok: true, result }, corsOrigin)
    return
  }

  if (req.method === 'POST' && req.url?.startsWith('/api/checkout/webhook/mercado-pago')) {
    const body = await readJson<Record<string, unknown>>(req)
    if (!paymentService) {
      writeJson(res, 500, { ok: false, error: 'Servico de pagamento indisponivel.' }, corsOrigin)
      return
    }
    try {
      const url = new URL(req.url, 'http://localhost')
      const isOrder = url.pathname.endsWith('/orders') || String(body.type ?? '') === 'order'
      const result = isOrder
        ? await paymentService.applyMercadoPagoOrderWebhook({
            payload: body,
            dataId: url.searchParams.get('data.id') || String((body.data as Record<string, unknown> | undefined)?.id ?? ''),
            xSignature: String(req.headers['x-signature'] ?? ''),
            xRequestId: String(req.headers['x-request-id'] ?? ''),
          })
        : await paymentService.applyMercadoPagoWebhook(body)
      writeJson(res, 200, { ok: true, result }, corsOrigin)
    } catch (error) {
      const statusCode = error instanceof Error && 'statusCode' in error ? Number((error as Error & { statusCode?: number }).statusCode) : 502
      writeJson(res, statusCode, { ok: false, error: error instanceof Error ? error.message : 'Falha ao processar webhook.' }, corsOrigin)
    }
    return
  }

  if (req.method === 'POST' && req.url === '/api/checkout/submit') {
    const body = await readJson<CheckoutSubmitRequest>(req)
    const response = await service.submit(body)
    writeJson(res, response.ok ? 200 : 400, response, corsOrigin)
    return
  }

  writeJson(res, 404, { ok: false, error: 'Rota nao encontrada.' }, corsOrigin)
}
