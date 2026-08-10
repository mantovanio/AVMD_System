import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { readJson, writeJson } from '../utils/http.js'
import type { CheckoutContextApiRequest, CheckoutSubmitRequest } from '../contracts/checkoutContract.js'
import { CheckoutService } from '../services/checkoutService.js'
import { CheckoutPaymentService } from '../services/checkoutPaymentService.js'

function verifyMercadoPagoSignature(rawBody: string, xSignature: string, xRequestId: string, secret: string) {
  if (!secret || !xSignature || !xRequestId) return false
  const parts = Object.fromEntries(
    xSignature.split(',').map(part => part.split('=').map(v => v.trim())),
  )
  const timestamp = parts.ts ?? ''
  const hash = parts.v1 ?? ''
  if (!timestamp || !hash) return false

  const expected = createHmac('sha256', secret)
    .update(`${xRequestId}${timestamp}${rawBody}`)
    .digest('hex')
  if (expected.length !== hash.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(hash))
}

export async function handleCheckoutRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  service: CheckoutService,
  corsOrigin: string,
  paymentService?: CheckoutPaymentService,
  mercadoPagoWebhookSecret?: string,
) {
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

  if (req.method === 'POST' && req.url === '/api/checkout/commercial-charge') {
    const body = await readJson<{ venda_id?: string; profile_id?: string }>(req)
    if (!paymentService || !body.venda_id || !body.profile_id) {
      writeJson(res, 400, { ok: false, error: 'Venda e usuário são obrigatórios.' }, corsOrigin)
      return
    }
    const result = await paymentService.createCommercialPaymentLink({ vendaId: body.venda_id, profileId: body.profile_id })
    writeJson(res, result.ok ? 200 : 400, result, corsOrigin)
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

  if ((req.method === 'POST' || req.method === 'GET') && req.url?.startsWith('/api/checkout/webhook/mercado-pago')) {
    const url = new URL(req.url, 'http://localhost')
    if (!paymentService) {
      writeJson(res, 500, { ok: false, error: 'Servico de pagamento indisponivel.' }, corsOrigin)
      return
    }
    try {
      const rawBody = req.method === 'POST'
        ? await new Promise<string>((resolve, reject) => {
            const chunks: Buffer[] = []
            req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
            req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
            req.on('error', reject)
          })
        : ''
      const body = req.method === 'POST'
        ? JSON.parse(rawBody.trim() || '{}') as Record<string, unknown>
        : {
            type: url.searchParams.get('type') || url.searchParams.get('topic') || undefined,
            id: url.searchParams.get('id') || url.searchParams.get('data.id') || undefined,
            data: { id: url.searchParams.get('data.id') || url.searchParams.get('id') || undefined },
          }
      const type = String(body.type ?? url.searchParams.get('topic') ?? '').toLowerCase()
      const isOrder = url.pathname.endsWith('/orders') || type === 'order' || type === 'merchant_order'
      if (req.method === 'POST' && isOrder && mercadoPagoWebhookSecret) {
        const isValid = verifyMercadoPagoSignature(
          rawBody,
          String(req.headers['x-signature'] ?? ''),
          String(req.headers['x-request-id'] ?? ''),
          mercadoPagoWebhookSecret,
        )
        if (!isValid) {
          writeJson(res, 403, { ok: false, error: 'Assinatura inválida.' }, corsOrigin)
          return
        }
      }
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
