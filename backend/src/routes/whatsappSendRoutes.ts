import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ExternalIntegrationRepository } from '../repositories/externalIntegrationRepository.js'
import { readJson, writeJson } from '../utils/http.js'

interface SendWhatsAppInput {
  phone: string
  body: string
  instance_name?: string
}

export async function handleWhatsappSendRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  integrationRepo: ExternalIntegrationRepository,
  corsOrigin: string,
): Promise<boolean> {
  const url = req.url ?? ''
  const method = req.method ?? ''

  if (method !== 'POST' || url !== '/api/whatsapp/send') return false

  const body = await readJson<SendWhatsAppInput>(req)
  if (!body?.phone || !body?.body) {
    writeJson(res, 400, { ok: false, error: 'phone e body sao obrigatorios' }, corsOrigin)
    return true
  }

  const integrations = await integrationRepo.findActiveWhatsApp()
  let integration = integrations[0] ?? null

  if (body.instance_name) {
    const byInstance = integrations.find(i => i.instance_name === body.instance_name)
    if (byInstance) integration = byInstance
  }

  if (!integration?.base_url || !integration?.api_token || !integration?.instance_name) {
    writeJson(res, 422, { ok: false, error: 'Nenhuma integracao WhatsApp ativa configurada.' }, corsOrigin)
    return true
  }

  const baseUrl = integration.base_url.replace(/\/$/, '')
  const evolutionUrl = `${baseUrl}/message/sendText/${integration.instance_name}`

  try {
    const evRes = await fetch(evolutionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: integration.api_token,
      },
      body: JSON.stringify({ number: body.phone, text: body.body }),
    })

    const payload = await evRes.json().catch(() => ({ status: evRes.status })) as Record<string, unknown>

    if (!evRes.ok) {
      writeJson(res, 502, { ok: false, error: `Evolution retornou HTTP ${evRes.status}`, detail: payload }, corsOrigin)
      return true
    }

    writeJson(res, 200, { ok: true, payload }, corsOrigin)
  } catch (err) {
    writeJson(res, 502, { ok: false, error: String(err) }, corsOrigin)
  }

  return true
}
