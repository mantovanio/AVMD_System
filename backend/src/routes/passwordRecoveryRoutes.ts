import { createClerkClient } from '@clerk/backend'
import { randomInt, randomUUID, createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CommunicationOutboxRepository } from '../repositories/communicationOutboxRepository.js'
import type { PasswordRecoveryAuditRepository } from '../repositories/passwordRecoveryAuditRepository.js'
import type { PasswordRecoveryRepository } from '../repositories/passwordRecoveryRepository.js'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { readJson, writeJson } from '../utils/http.js'

type RequestBody = {
  email?: string
}

type VerifyBody = {
  email?: string
  code?: string
  password?: string
}

type ClerkErrorLike = {
  errors?: Array<{ message?: string; longMessage?: string; long_message?: string }>
  message?: string
  status?: number
}

type ClerkUserLike = {
  id: string
  emailAddresses?: Array<{ emailAddress?: string }>
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function maskEmail(email: string) {
  const [user, domain] = email.split('@')
  if (!user || !domain) return email
  return `${user.slice(0, 2)}***@${domain}`
}

function getClerkErrorMessage(error: unknown, fallback = 'Falha ao processar ação no Clerk.') {
  const payload = error as ClerkErrorLike | undefined
  const first = payload?.errors?.[0]
  return first?.longMessage
    ?? first?.long_message
    ?? first?.message
    ?? payload?.message
    ?? (error instanceof Error ? error.message : '')
    ?? fallback
}

function isClerkNotFoundError(error: unknown) {
  const payload = error as ClerkErrorLike | undefined
  const status = payload?.status
  const message = `${payload?.message ?? ''} ${payload?.errors?.map(err => `${err.longMessage ?? err.long_message ?? err.message ?? ''}`).join(' ') ?? ''}`.toLowerCase()
  return status === 404 || message.includes('no user was found with id') || message.includes('not found')
}

function clerkUserHasEmail(user: ClerkUserLike, email: string) {
  const normalizedEmail = normalizeEmail(email)
  return user.emailAddresses?.some(item => normalizeEmail(item.emailAddress ?? '') === normalizedEmail) ?? false
}

function getRequestSource(req: IncomingMessage) {
  return String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0]?.trim() || null
}

function getUserAgent(req: IncomingMessage) {
  return String(req.headers['user-agent'] ?? '').trim() || null
}

async function findEmailRisk(
  clerkClient: ReturnType<typeof createClerkClient>,
  profile: { id: string; email: string | null; nome: string; clerk_user_id: string | null; status: string },
  email: string,
): Promise<{ blocked: boolean; reason: string | null; clerkUserId: string | null }> {
  if (profile.status !== 'ativo') {
    return { blocked: true, reason: 'Conta inativa ou bloqueada.', clerkUserId: null }
  }

  const normalizedEmail = normalizeEmail(email)
  const clerkUsers = await clerkClient.users.getUserList({ emailAddress: [normalizedEmail], limit: 5 })
  const matchedUsers = clerkUsers.data.filter(user => clerkUserHasEmail(user, normalizedEmail))

  if (matchedUsers.length > 1) {
    return { blocked: true, reason: 'E-mail compartilhado ou duplicado no Clerk. Confirme a identidade com o administrador.', clerkUserId: null }
  }

  const clerkUserId = matchedUsers[0]?.id ?? null
  if (profile.clerk_user_id && clerkUserId && profile.clerk_user_id !== clerkUserId) {
    return { blocked: true, reason: 'Vínculo do perfil com o Clerk está inconsistente. Confirme com o administrador.', clerkUserId: null }
  }

  return { blocked: false, reason: null, clerkUserId }
}

function buildClerkUsername(email: string) {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'usuario'
  return `${base}${randomInt(100000, 1000000)}`.slice(0, 24)
}

function buildTemporaryStrongPassword() {
  const stamp = Date.now().toString(36)
  const rand = randomInt(100000, 999999)
  return `Tmp#${stamp}${rand}aA1!`
}

function buildRecoveryCode() {
  return String(randomInt(0, 1000000)).padStart(6, '0')
}

function hashRecoveryCode(code: string) {
  return createHash('sha256').update(code).digest('hex')
}

function buildRecoveryEmail(nome: string, code: string) {
  const firstName = nome.trim().split(/\s+/)[0] || 'cliente'
  return {
    subject: 'Código de recuperação de senha',
    body: `Olá, ${firstName}.

Recebemos sua solicitação de recuperação de senha.

Use este código para redefinir seu acesso:

${code}

Esse código é válido por 15 minutos.
Se você não solicitou essa alteração, desconsidere esta mensagem.`,
  }
}

async function syncClerkUser(
  clerkClient: ReturnType<typeof createClerkClient>,
  profileRepository: ProfileRepository,
  profileId: string,
  email: string,
  nome: string,
  currentClerkUserId: string | null,
) {
  const recoveryEmail = normalizeEmail(email)
  let clerkUserId: string | null = null

  if (currentClerkUserId) {
    try {
      const linkedUser = await clerkClient.users.getUser(currentClerkUserId)
      if (clerkUserHasEmail(linkedUser, recoveryEmail)) {
        clerkUserId = linkedUser.id
      }
    } catch (error) {
      if (!isClerkNotFoundError(error)) {
        throw error
      }
    }
  }

  if (!clerkUserId) {
    const clerkUsers = await clerkClient.users.getUserList({ emailAddress: [recoveryEmail], limit: 1 })
    const clerkUser = clerkUsers.data.find(user => clerkUserHasEmail(user, recoveryEmail))
    clerkUserId = clerkUser?.id ?? null
  }

  if (!clerkUserId) {
    const [firstNameRaw, ...lastNameParts] = nome.trim().split(/\s+/)
    const createdUser = await clerkClient.users.createUser({
      emailAddress: [recoveryEmail],
      username: buildClerkUsername(recoveryEmail),
      password: buildTemporaryStrongPassword(),
      firstName: firstNameRaw || 'Usuario',
      lastName: lastNameParts.join(' ').trim() || undefined,
    })
    clerkUserId = createdUser.id
  }

  if (currentClerkUserId !== clerkUserId) {
    await profileRepository.update(profileId, { clerk_user_id: clerkUserId })
  }

  return clerkUserId
}

export async function handlePasswordRecoveryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  profileRepository: ProfileRepository,
  passwordRecoveryRepository: PasswordRecoveryRepository,
  passwordRecoveryAuditRepository: PasswordRecoveryAuditRepository,
  outboxRepository: CommunicationOutboxRepository,
  clerkSecretKey: string,
  corsOrigin: string,
): Promise<boolean> {
  if (req.method === 'POST' && req.url === '/api/auth/password-recovery/request') {
    if (!clerkSecretKey) {
      writeJson(res, 503, { ok: false, error: 'CLERK_SECRET_KEY não configurada no backend.' }, corsOrigin)
      return true
    }

    const body = await readJson<RequestBody>(req)
    const email = normalizeEmail(String(body?.email ?? ''))
    if (!email) {
      writeJson(res, 400, { ok: false, error: 'Informe o e-mail cadastrado.' }, corsOrigin)
      return true
    }

    const profile = await profileRepository.findByEmail(email)
    if (!profile) {
      await passwordRecoveryAuditRepository.create({
        email,
        action: 'request',
        status: 'blocked',
        reason: 'Conta não encontrada.',
        source: 'password_recovery_request',
        ipAddress: getRequestSource(req),
        userAgent: getUserAgent(req),
      })
      writeJson(res, 404, { ok: false, error: 'Conta não encontrada.' }, corsOrigin)
      return true
    }

    const clerkClient = createClerkClient({ secretKey: clerkSecretKey })

    try {
      const risk = await findEmailRisk(clerkClient, profile, email)
      if (risk.blocked) {
        await passwordRecoveryAuditRepository.create({
          profileId: profile.id,
          email,
          action: 'request',
          status: 'requires_confirmation',
          reason: risk.reason,
          source: 'password_recovery_request',
          ipAddress: getRequestSource(req),
          userAgent: getUserAgent(req),
          clerkUserId: profile.clerk_user_id,
          metadata: { profile_status: profile.status },
        })
        writeJson(res, 428, { ok: false, error: risk.reason ?? 'Confirmação extra necessária para continuar.' }, corsOrigin)
        return true
      }

      const clerkUserId = risk.clerkUserId ?? await syncClerkUser(clerkClient, profileRepository, profile.id, email, profile.nome, profile.clerk_user_id)
      const recoveryCode = buildRecoveryCode()
      const tokenHash = hashRecoveryCode(recoveryCode)
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

      await passwordRecoveryRepository.create({
        profileId: profile.id,
        email,
        tokenHash,
        expiresAt,
      })

      const recoveryEmail = buildRecoveryEmail(profile.nome, recoveryCode)
      await outboxRepository.create({
        channel: 'email',
        provider: 'email_smtp',
        to_address: email,
        subject: recoveryEmail.subject,
        body: recoveryEmail.body,
        payload: {
          context: 'password_recovery',
          profile_id: profile.id,
          email,
          code: recoveryCode,
        },
      })

      await passwordRecoveryAuditRepository.create({
        profileId: profile.id,
        email,
        action: 'request',
        status: 'sent',
        source: 'password_recovery_request',
        ipAddress: getRequestSource(req),
        userAgent: getUserAgent(req),
        clerkUserId,
        metadata: {
          profile_status: profile.status,
          clerk_user_id: clerkUserId,
        },
      })

      writeJson(res, 200, { ok: true, email: maskEmail(email) }, corsOrigin)
      return true
    } catch (error) {
      await passwordRecoveryAuditRepository.create({
        profileId: profile.id,
        email,
        action: 'request',
        status: 'blocked',
        reason: error instanceof Error ? error.message : String(error),
        source: 'password_recovery_request',
        ipAddress: getRequestSource(req),
        userAgent: getUserAgent(req),
        clerkUserId: profile.clerk_user_id,
        metadata: { profile_status: profile.status },
      })
      writeJson(res, 400, { ok: false, error: getClerkErrorMessage(error) }, corsOrigin)
      return true
    }
  }

  if (req.method === 'POST' && req.url === '/api/auth/password-recovery/verify') {
    if (!clerkSecretKey) {
      writeJson(res, 503, { ok: false, error: 'CLERK_SECRET_KEY não configurada no backend.' }, corsOrigin)
      return true
    }

    const body = await readJson<VerifyBody>(req)
    const email = normalizeEmail(String(body?.email ?? ''))
    const code = String(body?.code ?? '').replace(/\D/g, '').slice(0, 6)
    const password = String(body?.password ?? '')

    if (!email || code.length !== 6 || !password) {
      writeJson(res, 400, { ok: false, error: 'Informe e-mail, código de 6 dígitos e nova senha.' }, corsOrigin)
      return true
    }

    const profile = await profileRepository.findByEmail(email)
    if (!profile) {
      await passwordRecoveryAuditRepository.create({
        email,
        action: 'verify',
        status: 'blocked',
        reason: 'Conta não encontrada.',
        source: 'password_recovery_verify',
        ipAddress: getRequestSource(req),
        userAgent: getUserAgent(req),
      })
      writeJson(res, 404, { ok: false, error: 'Conta não encontrada.' }, corsOrigin)
      return true
    }

    const tokenHash = hashRecoveryCode(code)
    const token = await passwordRecoveryRepository.findValidByTokenHash(tokenHash)
    if (!token || token.profile_id !== profile.id) {
      await passwordRecoveryAuditRepository.create({
        profileId: profile.id,
        email,
        action: 'verify',
        status: 'blocked',
        reason: 'Código inválido ou expirado.',
        source: 'password_recovery_verify',
        ipAddress: getRequestSource(req),
        userAgent: getUserAgent(req),
        clerkUserId: profile.clerk_user_id,
      })
      writeJson(res, 400, { ok: false, error: 'Código inválido ou expirado.' }, corsOrigin)
      return true
    }

    const clerkClient = createClerkClient({ secretKey: clerkSecretKey })
    try {
      const risk = await findEmailRisk(clerkClient, profile, email)
      if (risk.blocked) {
        await passwordRecoveryAuditRepository.create({
          profileId: profile.id,
          email,
          action: 'verify',
          status: 'requires_confirmation',
          reason: risk.reason,
          source: 'password_recovery_verify',
          ipAddress: getRequestSource(req),
          userAgent: getUserAgent(req),
          clerkUserId: profile.clerk_user_id,
          metadata: { profile_status: profile.status },
        })
        writeJson(res, 428, { ok: false, error: risk.reason ?? 'Confirmação extra necessária para continuar.' }, corsOrigin)
        return true
      }

      const clerkUserId = risk.clerkUserId ?? await syncClerkUser(clerkClient, profileRepository, profile.id, email, profile.nome, profile.clerk_user_id)
      if (!clerkUserId) {
        await passwordRecoveryAuditRepository.create({
          profileId: profile.id,
          email,
          action: 'verify',
          status: 'blocked',
          reason: 'Conta vinculada não encontrada no Clerk.',
          source: 'password_recovery_verify',
          ipAddress: getRequestSource(req),
          userAgent: getUserAgent(req),
          clerkUserId: profile.clerk_user_id,
        })
        writeJson(res, 400, { ok: false, error: 'Conta vinculada não encontrada no Clerk.' }, corsOrigin)
        return true
      }

      await clerkClient.users.updateUser(clerkUserId, {
        password,
        skipPasswordChecks: true,
        signOutOfOtherSessions: true,
      })
      await passwordRecoveryRepository.consume(token.id)
      await passwordRecoveryAuditRepository.create({
        profileId: profile.id,
        email,
        action: 'verify',
        status: 'verified',
        source: 'password_recovery_verify',
        ipAddress: getRequestSource(req),
        userAgent: getUserAgent(req),
        clerkUserId,
        metadata: { profile_status: profile.status },
      })
      writeJson(res, 200, { ok: true }, corsOrigin)
    } catch (error) {
      await passwordRecoveryAuditRepository.create({
        profileId: profile.id,
        email,
        action: 'verify',
        status: 'blocked',
        reason: error instanceof Error ? error.message : String(error),
        source: 'password_recovery_verify',
        ipAddress: getRequestSource(req),
        userAgent: getUserAgent(req),
        clerkUserId: profile.clerk_user_id,
      })
      writeJson(res, 400, { ok: false, error: getClerkErrorMessage(error) }, corsOrigin)
    }
    return true
  }

  return false
}
