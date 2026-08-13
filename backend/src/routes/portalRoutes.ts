import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHmac, createHash, randomInt, timingSafeEqual } from 'node:crypto'
import type { CommunicationOutboxRepository } from '../repositories/communicationOutboxRepository.js'
import type { PortalAccessTokenRepository } from '../repositories/portalAccessTokenRepository.js'
import type { PortalRepository } from '../repositories/portalRepository.js'
import type { CheckoutPaymentService } from '../services/checkoutPaymentService.js'
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

function buildPortalCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0')
}

function buildPortalEmail(nome: string, code: string) {
  const firstName = nome.trim().split(/\s+/)[0] || 'cliente'
  const sentAt = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date())
  const body = `Olá, ${firstName}.

Recebemos uma solicitação de acesso ao portal Minhas Compras da CertiID.

Use este código para entrar:

${code}

Esse código é válido por 10 minutos.
Se você pediu mais de um código, use sempre o e-mail mais recente.

Se você não solicitou esse acesso, ignore esta mensagem.`
  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#17346b;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dbe4f0;border-radius:18px;padding:32px;">
            <tr>
              <td align="center" style="font-size:30px;font-weight:800;color:#17346b;">
                Certi<span style="color:#f88414;">ID</span>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:8px;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#52678f;">
                Portal Minhas Compras
              </td>
            </tr>
            <tr>
              <td style="padding-top:30px;font-size:16px;line-height:1.6;color:#132b57;">
                Olá, <strong>${firstName}</strong>.
              </td>
            </tr>
            <tr>
              <td style="padding-top:18px;font-size:15px;line-height:1.7;color:#30466f;">
                Recebemos uma solicitação de acesso ao portal <strong>Minhas Compras da CertiID</strong>.
                Use o código abaixo para acompanhar seus pedidos com segurança.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:26px 0;">
                <div style="border:1px solid #dbe4f0;border-radius:14px;background:#f8fbff;padding:22px;">
                  <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#52678f;">Código de acesso</div>
                  <div style="margin-top:12px;font-size:34px;font-weight:800;letter-spacing:8px;color:#f88414;">${code}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="border-left:4px solid #f88414;background:#fff8ef;padding:14px 16px;font-size:14px;line-height:1.6;color:#9b4a00;">
                Este código expira em 10 minutos. Se você pediu mais de um código, use sempre o e-mail mais recente.
              </td>
            </tr>
            <tr>
              <td style="padding-top:26px;font-size:12px;line-height:1.6;color:#7b8aa8;text-align:center;">
                Mensagem automática de segurança enviada em ${sentAt}. Por favor, não responda.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
  return {
    subject: `Minhas Compras CertiID - acesso ${code.slice(-3)} - ${sentAt}`,
    body,
    html,
  }
}

function normalizePhone(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

function maskPhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 4) return 'final ' + digits
  const local = digits.startsWith('55') ? digits.slice(2) : digits
  const ddd = local.slice(0, 2)
  const suffix = local.slice(-4)
  return ddd ? `(${ddd}) *****-${suffix}` : `*****-${suffix}`
}

function buildPortalWhatsappMessage(code: string) {
  return `CertiID - Portal Minhas Compras

Seu código de acesso é: ${code}

Ele expira em 10 minutos. Se você pediu mais de um código, use sempre o mais recente.

Se você não solicitou esse acesso, ignore esta mensagem.`
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
  portalAccessTokenRepository: PortalAccessTokenRepository,
  outboxRepository: CommunicationOutboxRepository,
  clerkSecretKey: string,
  corsOrigin: string,
  paymentService?: CheckoutPaymentService,
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

    const code = buildPortalCode()
    const tokenHash = hashCode(code)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    await portalAccessTokenRepository.create({ email, tokenHash, expiresAt })

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
        code,
        html: recoveryEmail.html,
        tipo: 'portal_access_code',
        token_expires_at: expiresAt,
      },
    })

    const phones = Array.from(new Set(vendas.map(venda => normalizePhone(venda.telefone_faturamento)).filter(Boolean)))
    await Promise.allSettled(phones.slice(0, 2).map(phone => outboxRepository.create({
      channel: 'whatsapp',
      provider: 'evolution',
      to_address: phone,
      subject: null,
      body: buildPortalWhatsappMessage(code),
      payload: {
        context: 'portal_access',
        canal: 'atendimento',
        email,
        tipo: 'portal_access_code_whatsapp',
        token_expires_at: expiresAt,
      },
    })))

    writeJson(res, 200, { ok: true, email, maskedPhones: phones.slice(0, 2).map(maskPhone) }, corsOrigin)
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

    const tokenHash = hashCode(code)
    const token = await portalAccessTokenRepository.findValidByEmailAndTokenHash(email, tokenHash)
    if (!token) {
      writeJson(res, 401, { ok: false, error: 'Código inválido ou expirado. Solicite um novo código e tente novamente.' }, corsOrigin)
      return true
    }
    await portalAccessTokenRepository.consume(token.id)

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
    const pagamentos = await portalRepository.listPaymentMethods()
    writeJson(res, 200, { ok: true, pedidos, pagamentos }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && requestPath === '/api/portal/payment-method') {
    const body = await readJson<PortalScheduleBody & { forma_pagamento_id?: string }>(req)
    const email = resolveEmail(body, clerkSecretKey)
    if (!email || !body.saleId || !body.forma_pagamento_id) {
      writeJson(res, 401, { ok: false, error: 'Sessão, venda ou forma de pagamento inválida.' }, corsOrigin)
      return true
    }
    if (!paymentService) {
      writeJson(res, 503, { ok: false, error: 'Serviço de pagamento indisponível.' }, corsOrigin)
      return true
    }

    try {
      const saleBefore = await portalRepository.findAuthorizedPaymentSale(email, body.saleId)
      if (!saleBefore) {
        writeJson(res, 404, { ok: false, error: 'Venda não encontrada para este cliente.' }, corsOrigin)
        return true
      }
      await portalRepository.changePaymentMethod(email, { saleId: body.saleId, formaPagamentoId: body.forma_pagamento_id })
      const sale = await portalRepository.findAuthorizedPaymentSale(email, body.saleId)
      if (!sale?.forma_pagamento_id) {
        writeJson(res, 404, { ok: false, error: 'Forma de pagamento não vinculada ao pedido.' }, corsOrigin)
        return true
      }
      const charge = await paymentService.createChargeForSale({
        vendaId: sale.id,
        formaPagamentoId: sale.forma_pagamento_id,
        valor: sale.valor,
        descricao: sale.descricao,
        comprador: {
          nome: sale.nome,
          email: sale.email,
          telefone: sale.telefone,
          documento: sale.documento,
        },
        fiscal: {
          cep: sale.cep,
          logradouro: sale.logradouro,
          numero: sale.numero,
          bairro: sale.bairro,
          cidade: sale.cidade,
          uf: sale.uf,
        },
      })
      if (!charge.ok) {
        writeJson(res, 502, { ok: false, charge, error: charge.error ?? 'Forma alterada, mas a nova cobrança não foi gerada.' }, corsOrigin)
        return true
      }
      const pedidos = await portalRepository.listOrdersByEmail(email)
      writeJson(res, 200, { ok: true, charge, pedidos }, corsOrigin)
    } catch (error) {
      writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : 'Não foi possível alterar a forma de pagamento.' }, corsOrigin)
    }
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
