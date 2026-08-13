import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHmac, createHash, timingSafeEqual } from 'node:crypto'
import type { CommunicationOutboxRepository } from '../repositories/communicationOutboxRepository.js'
import type { PortalRepository } from '../repositories/portalRepository.js'
import { readJson, writeJson } from '../utils/http.js'
import { checkRateLimit } from '../utils/rateLimit.js'

type PortalAuthBody = {
  email?: string
  token?: string
  code?: string
}

type PortalScheduleBody = PortalAuthBody & {
  saleId?: string
  agente_registro_id?: string
  ponto_atendimento_id?: string
  data_agendada?: string
}

type PortalSessionPayload = {
  email: string
  exp: number
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex')
}

function buildPortalCode(email: string, secret: string) {
  const bucket = Math.floor(Date.now() / (10 * 60 * 1000))
  const digest = createHmac('sha256', secret).update(`${normalizeEmail(email)}|${bucket}`).digest('hex')
  const value = Number.parseInt(digest.slice(0, 8), 16) % 1000000
  return String(value).padStart(6, '0')
}

function buildPortalEmail(nome: string, code: string) {
  const firstName = nome.trim().split(/\s+/)[0] || 'cliente'
  return {
    subject: 'Seu código de acesso ao portal',
    body: `Olá, ${firstName}.

Recebemos uma solicitação de acesso ao portal do cliente.

Use este código para entrar:

${code}

Esse código é válido por 10 minutos.
Se você não solicitou esse acesso, ignore esta mensagem.`,
  }
}

function issuePortalSession(payload: PortalSessionPayload, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

function verifyPortalSession(token: string, secret: string): PortalSessionPayload | null {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  if (expected.length !== signature.length) return null
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as PortalSessionPayload
    if (!payload?.email || !payload.exp) return null
    if (Date.now() > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

function resolveEmail(body: PortalAuthBody, secret: string) {
  const tokenPayload = body.token ? verifyPortalSession(body.token, secret) : null
  if (tokenPayload?.email) return tokenPayload.email
  return body.email ? normalizeEmail(body.email) : ''
}

export async function handlePortalRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  portalRepository: PortalRepository,
  outboxRepository: CommunicationOutboxRepository,
  clerkSecretKey: string,
  corsOrigin: string,
): Promise<boolean> {
  const requestPath = String(req.url ?? '')
  const isLegacyPortalApi = req.method === 'POST' && /^\/api\/public\/portal\//.test(requestPath)
  if (isLegacyPortalApi) {
    writeJson(res, 410, { ok: false, error: 'Este fluxo de acesso do cliente foi movido para a API pública /api/portal.' }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && requestPath === '/api/portal/auth/request') {
    if (!clerkSecretKey) {
      writeJson(res, 503, { ok: false, error: 'CLERK_SECRET_KEY não configurada no backend.' }, corsOrigin)
      return true
    }

    const body = await readJson<{ email?: string }>(req)
    const email = normalizeEmail(String(body?.email ?? ''))
    if (!email) {
      writeJson(res, 400, { ok: false, error: 'Informe o e-mail da compra.' }, corsOrigin)
      return true
    }

    const requestKey = `portal-auth-request:${String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0]?.trim() || 'unknown'}:${email}`
    const requestLimit = checkRateLimit(requestKey, 3, 60_000)
    if (!requestLimit.allowed) {
      writeJson(res, 429, {
        ok: false,
        error: 'Muitas tentativas de acesso. Aguarde um minuto e tente novamente.',
        retryAfter: Math.ceil((requestLimit.resetAt - Date.now()) / 1000),
      }, corsOrigin)
      return true
    }

    const vendas = await portalRepository.listOrdersByEmail(email)
    if (!vendas.length) {
      writeJson(res, 404, { ok: false, error: 'Nenhuma compra ativa foi encontrada para este e-mail.' }, corsOrigin)
      return true
    }

    const code = buildPortalCode(email, clerkSecretKey)
    const recoveryEmail = buildPortalEmail(email.split('@')[0] || 'cliente', code)
    await outboxRepository.create({
      channel: 'email',
      provider: 'email_smtp',
      to_address: email,
      subject: recoveryEmail.subject,
      body: recoveryEmail.body,
      payload: {
        context: 'portal_access',
        email,
        tipo: 'portal_access_code',
      },
    })

    writeJson(res, 200, { ok: true, email }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && requestPath === '/api/portal/auth/verify') {
    if (!clerkSecretKey) {
      writeJson(res, 503, { ok: false, error: 'CLERK_SECRET_KEY não configurada no backend.' }, corsOrigin)
      return true
    }

    const body = await readJson<{ email?: string; code?: string }>(req)
    const email = normalizeEmail(String(body?.email ?? ''))
    const code = String(body?.code ?? '').replace(/\D/g, '').slice(0, 6)
    if (!email || code.length !== 6) {
      writeJson(res, 400, { ok: false, error: 'Informe e-mail e código de 6 dígitos.' }, corsOrigin)
      return true
    }

    const expected = buildPortalCode(email, clerkSecretKey)
    const previous = buildPortalCode(email, `${clerkSecretKey}:prev`)
    if (code !== expected && code !== previous) {
      writeJson(res, 404, { ok: false, error: 'Não encontramos pedidos para esse e-mail.' }, corsOrigin)
      return true
    }

    const session = issuePortalSession(
      {
        email,
        exp: Date.now() + 60 * 60 * 1000,
      },
      clerkSecretKey,
    )

    writeJson(res, 200, { ok: true, token: session, email }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && requestPath === '/api/portal/overview') {
    const body = await readJson<PortalAuthBody>(req)
    const email = resolveEmail(body, clerkSecretKey)
    if (!email) {
      writeJson(res, 401, { ok: false, error: 'Sessão do portal inválida ou expirada.' }, corsOrigin)
      return true
    }

    const pedidos = await portalRepository.listOrdersByEmail(email)
    writeJson(res, 200, { ok: true, pedidos }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && requestPath === '/api/portal/schedule-context') {
    const body = await readJson<PortalScheduleBody>(req)
    const email = resolveEmail(body, clerkSecretKey)
    if (!email || !body.saleId) {
      writeJson(res, 401, { ok: false, error: 'Cliente ou venda invalida.' }, corsOrigin)
      return true
    }

    const context = await portalRepository.getScheduleContext(email, body.saleId)
    if (!context) {
      writeJson(res, 404, { ok: false, error: 'Venda nao encontrada para este cliente.' }, corsOrigin)
      return true
    }

    writeJson(res, 200, { ok: true, ...context }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && requestPath === '/api/portal/schedule') {
    const body = await readJson<PortalScheduleBody>(req)
    const email = resolveEmail(body, clerkSecretKey)
    if (!email || !body.saleId || !body.agente_registro_id || !body.ponto_atendimento_id || !body.data_agendada) {
      writeJson(res, 401, { ok: false, error: 'Dados do agendamento incompletos.' }, corsOrigin)
      return true
    }

    const agenda = await portalRepository.saveSchedule(email, {
      saleId: body.saleId,
      agente_registro_id: body.agente_registro_id,
      ponto_atendimento_id: body.ponto_atendimento_id,
      data_agendada: body.data_agendada,
    })

    if (!agenda) {
      writeJson(res, 404, { ok: false, error: 'Venda nao encontrada para este cliente.' }, corsOrigin)
      return true
    }

    writeJson(res, 200, { ok: true, agenda }, corsOrigin)
    return true
  }

  return false
}
