import { createClerkClient } from '@clerk/backend'
import { createHash, randomInt } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CommunicationOutboxRepository } from '../repositories/communicationOutboxRepository.js'
import type { PasswordRecoveryRepository } from '../repositories/passwordRecoveryRepository.js'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { readJson, writeJson } from '../utils/http.js'

type RequestBody = {
  email?: string
}

type VerifyBody = {
  token?: string
  password?: string
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function maskEmail(email: string) {
  const [user, domain] = email.split('@')
  if (!user || !domain) return email
  return `${user.slice(0, 2)}***@${domain}`
}

function buildRecoveryEmailHtml(options: { nome: string; code: string; expiresMinutes: number }) {
  const firstName = options.nome.split(/\s+/)[0] || 'cliente'
  const code = options.code
  const expiresMinutes = options.expiresMinutes

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
      <div style="background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);border-radius:20px;overflow:hidden;border:1px solid #dbe4f0;box-shadow:0 18px 48px rgba(15,23,42,.18);">
        <div style="padding:28px 28px 20px;text-align:center;background:linear-gradient(135deg,#0f172a 0%,#1d4ed8 100%);color:#fff;">
          <div style="font-size:28px;font-weight:700;letter-spacing:.5px;">CertiID</div>
          <div style="margin-top:6px;font-size:14px;opacity:.9;">Agência de Certificação Digital</div>
        </div>
        <div style="padding:32px 28px;">
          <div style="font-size:22px;line-height:1.3;font-weight:700;color:#0f172a;margin-bottom:12px;">Recuperação de senha</div>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#334155;">Olá, ${firstName}. Recebemos uma solicitação para redefinir sua senha no CRM da CertiID.</p>
          <div style="margin:24px 0;padding:20px;border-radius:16px;background:#eff6ff;border:1px solid #bfdbfe;text-align:center;">
            <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#2563eb;font-weight:700;margin-bottom:8px;">Seu código de verificação</div>
            <div style="font-size:34px;line-height:1;font-weight:800;letter-spacing:10px;color:#0f172a;font-family:'Courier New',monospace;">${code}</div>
          </div>
          <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#334155;">Digite esse código na tela de recuperação para criar uma nova senha.</p>
          <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#334155;">Por segurança, ele expira em ${expiresMinutes} minutos.</p>
          <div style="padding:16px 18px;border-left:4px solid #2563eb;background:#f8fafc;border-radius:12px;color:#475569;font-size:13px;line-height:1.7;">
            Se você não solicitou essa alteração, pode ignorar este e-mail com segurança.
          </div>
        </div>
        <div style="padding:18px 28px 28px;border-top:1px solid #e2e8f0;text-align:center;color:#64748b;font-size:12px;line-height:1.6;">
          <strong style="color:#0f172a;">@CertiID</strong><br />
          Mensagem automática de recuperação de acesso
        </div>
      </div>
    </div>
  </body>
</html>`
}

export async function handlePasswordRecoveryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  profileRepository: ProfileRepository,
  recoveryRepository: PasswordRecoveryRepository,
  outboxRepository: CommunicationOutboxRepository,
  clerkSecretKey: string,
  corsOrigin: string,
): Promise<boolean> {
  if (req.method === 'POST' && req.url === '/api/auth/password-recovery/request') {
    const body = await readJson<RequestBody>(req)
    const email = normalizeEmail(String(body?.email ?? ''))
    if (!email) {
      writeJson(res, 400, { ok: false, error: 'Informe o e-mail cadastrado.' }, corsOrigin)
      return true
    }

    const profile = await profileRepository.findByEmail(email)
    if (!profile?.clerk_user_id) {
      writeJson(res, 404, { ok: false, error: 'Conta não encontrada ou ainda não vinculada ao login.' }, corsOrigin)
      return true
    }

    const token = String(randomInt(100000, 1000000))
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    await recoveryRepository.create({
      profileId: profile.id,
      email,
      tokenHash,
      expiresAt,
    })

    const subject = 'Código de recuperação de senha'
    const bodyText = [
      `Olá, ${profile.nome.split(/\s+/)[0] || 'cliente'}.`,
      '',
      'Recebemos uma solicitação para redefinir sua senha no CRM da CertiID.',
      '',
      `Seu código de verificação é: ${token}`,
      '',
      'Esse código expira em 15 minutos.',
      'Se você não solicitou isso, ignore este e-mail.',
      '',
      '@CertiID',
    ].join('\n')

    await outboxRepository.create({
      channel: 'email',
      provider: 'email_smtp',
      to_address: email,
      subject,
      body: bodyText,
      payload: {
        tipo: 'password_recovery',
        profile_id: profile.id,
        clerk_user_id: profile.clerk_user_id,
        email,
        html: buildRecoveryEmailHtml({
          nome: profile.nome,
          code: token,
          expiresMinutes: 15,
        }),
        text: bodyText,
      },
    })

    writeJson(res, 200, { ok: true, email: maskEmail(email) }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/auth/password-recovery/verify') {
    if (!clerkSecretKey) {
      writeJson(res, 503, { ok: false, error: 'CLERK_SECRET_KEY não configurada no backend.' }, corsOrigin)
      return true
    }

    const body = await readJson<VerifyBody>(req)
    const token = String(body?.token ?? '').trim()
    const password = String(body?.password ?? '').trim()

    if (!token || !password) {
      writeJson(res, 400, { ok: false, error: 'Código e nova senha são obrigatórios.' }, corsOrigin)
      return true
    }

    if (password.length < 8) {
      writeJson(res, 400, { ok: false, error: 'A senha deve ter pelo menos 8 caracteres.' }, corsOrigin)
      return true
    }

    const recovery = await recoveryRepository.findValidByTokenHash(hashToken(token))
    if (!recovery) {
      writeJson(res, 400, { ok: false, error: 'Código inválido ou expirado.' }, corsOrigin)
      return true
    }

    const profile = await profileRepository.findById(recovery.profile_id)
    if (!profile?.clerk_user_id) {
      writeJson(res, 400, { ok: false, error: 'Conta sem vínculo com o login.' }, corsOrigin)
      return true
    }

    const clerkClient = createClerkClient({ secretKey: clerkSecretKey })
    await clerkClient.users.updateUser(profile.clerk_user_id, {
      password,
      skipPasswordChecks: true,
      signOutOfOtherSessions: true,
    })

    await recoveryRepository.consume(recovery.id)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  return false
}
