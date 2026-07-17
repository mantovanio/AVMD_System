import { createClerkClient } from '@clerk/backend'
import { createHash, randomBytes } from 'node:crypto'
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

    const token = randomBytes(24).toString('hex')
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
      'Recebemos uma solicitação de troca de senha no CRM.',
      '',
      `Seu código de recuperação é: ${token}`,
      '',
      'Esse código expira em 15 minutos.',
      'Se você não solicitou isso, ignore este e-mail.',
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
