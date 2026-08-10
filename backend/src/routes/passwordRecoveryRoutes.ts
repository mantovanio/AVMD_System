import { createClerkClient } from '@clerk/backend'
import { randomInt, createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CommunicationOutboxRepository } from '../repositories/communicationOutboxRepository.js'
import type { PasswordRecoveryAuditRepository } from '../repositories/passwordRecoveryAuditRepository.js'
import type { PasswordRecoveryRepository } from '../repositories/passwordRecoveryRepository.js'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { readJson, writeJson } from '../utils/http.js'
import { checkRateLimit } from '../utils/rateLimit.js'

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
  if (!profile.clerk_user_id) {
    return { blocked: true, reason: 'Recuperação disponível somente para usuário interno com conta de acesso vinculada.', clerkUserId: null }
  }

  const normalizedEmail = normalizeEmail(email)
  const clerkUsers = await clerkClient.users.getUserList({ emailAddress: [normalizedEmail], limit: 5 })
  const matchedUsers = clerkUsers.data.filter(user => clerkUserHasEmail(user, normalizedEmail))

  if (matchedUsers.length > 1) {
    return { blocked: true, reason: 'E-mail compartilhado ou duplicado no Clerk. Confirme a identidade com o administrador.', clerkUserId: null }
  }

  const clerkUserId = matchedUsers[0]?.id ?? null
  if (!clerkUserId) {
    return { blocked: true, reason: 'E-mail não confirmado na conta de acesso do usuário.', clerkUserId: null }
  }
  if (profile.clerk_user_id && clerkUserId && profile.clerk_user_id !== clerkUserId) {
    return { blocked: true, reason: 'Vínculo do perfil com o Clerk está inconsistente. Confirme com o administrador.', clerkUserId: null }
  }

  return { blocked: false, reason: null, clerkUserId }
}

async function ensureAdminProfile(profileRepository: ProfileRepository, adminProfileId: string) {
  const admin = await profileRepository.findById(adminProfileId)
  return admin && admin.perfil === 'admin' && admin.status === 'ativo' ? admin : null
}

async function sendRecoveryCode(
  clerkSecretKey: string,
  profileRepository: ProfileRepository,
  passwordRecoveryRepository: PasswordRecoveryRepository,
  passwordRecoveryAuditRepository: PasswordRecoveryAuditRepository,
  outboxRepository: CommunicationOutboxRepository,
  profile: { id: string; nome: string; email: string | null; clerk_user_id: string | null; status: string; perfil: string },
  email: string,
  req?: IncomingMessage,
  origin = 'password_recovery_manual_approval',
  _skipRiskCheck = false,
) {
  const clerkClient = createClerkClient({ secretKey: clerkSecretKey })
  const risk = await findEmailRisk(clerkClient, profile, email)
  if (risk.blocked || !risk.clerkUserId) {
    throw new Error(risk.reason ?? 'Recuperação bloqueada para este cadastro.')
  }
  if (profile.perfil !== 'admin') {
    throw new Error('Recuperação de senha desativada para perfis de cliente.')
  }
  const clerkUserId = risk.clerkUserId

  const recoveryCode = buildRecoveryCode()
  const tokenHash = hashRecoveryCode(recoveryCode)
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()

  await passwordRecoveryRepository.create({
    profileId: profile.id,
    email,
    tokenHash,
    expiresAt,
  })

  await passwordRecoveryAuditRepository.create({
    profileId: profile.id,
    email,
    action: 'request',
    status: 'sent',
    source: origin,
    ipAddress: req ? getRequestSource(req) : null,
    userAgent: req ? getUserAgent(req) : null,
    clerkUserId,
    metadata: {
      profile_status: profile.status,
      clerk_user_id: clerkUserId,
      origin,
    },
  })
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

    const requestKey = `password-recovery-request:${getRequestSource(req) ?? 'unknown'}:${email}`
    const requestLimit = checkRateLimit(requestKey, 5, 60_000)
    if (!requestLimit.allowed) {
      writeJson(res, 429, {
        ok: false,
        error: 'Muitas tentativas. Aguarde um minuto e tente novamente.',
        retryAfter: Math.ceil((requestLimit.resetAt - Date.now()) / 1000),
      }, corsOrigin)
      return true
    }

    const profile = await profileRepository.findInternalAccessByEmail(email)
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

    if (profile.perfil !== 'admin') {
      await passwordRecoveryAuditRepository.create({
        profileId: profile.id,
        email,
        action: 'request',
        status: 'blocked',
        reason: 'Recuperação desativada para perfis de cliente.',
        source: 'password_recovery_request',
        ipAddress: getRequestSource(req),
        userAgent: getUserAgent(req),
        clerkUserId: profile.clerk_user_id,
        metadata: { profile_status: profile.status, blocked_for_customer: true },
      })
      writeJson(res, 403, { ok: false, error: 'Recuperação desativada para este tipo de conta.' }, corsOrigin)
      return true
    }

    const clerkClient = createClerkClient({ secretKey: clerkSecretKey })

    try {
      const risk = await findEmailRisk(clerkClient, profile, email)
      if (risk.blocked || !risk.clerkUserId) {
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
          metadata: { profile_status: profile.status, internal_access_only: true },
        })
        writeJson(res, 428, { ok: false, error: risk.reason ?? 'Confirmação extra necessária para continuar.' }, corsOrigin)
        return true
      }

      const clerkUserId = risk.clerkUserId
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
          internal_access_only: true,
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

    const verifyKey = `password-recovery-verify:${getRequestSource(req) ?? 'unknown'}:${email}`
    const verifyLimit = checkRateLimit(verifyKey, 5, 60_000)
    if (!verifyLimit.allowed) {
      writeJson(res, 429, {
        ok: false,
        error: 'Muitas tentativas. Aguarde um minuto e tente novamente.',
        retryAfter: Math.ceil((verifyLimit.resetAt - Date.now()) / 1000),
      }, corsOrigin)
      return true
    }

    const profile = await profileRepository.findInternalAccessByEmail(email)
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
      if (risk.blocked || !risk.clerkUserId) {
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
          metadata: { profile_status: profile.status, enforce_guard: true },
        })
        writeJson(res, 428, { ok: false, error: risk.reason ?? 'Confirmação extra necessária para continuar.' }, corsOrigin)
        return true
      }

      const clerkUserId = risk.clerkUserId
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
        metadata: { profile_status: profile.status, internal_access_only: true },
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

  if (req.method === 'POST' && req.url === '/api/admin/password-recovery/audit') {
    const body = await readJson<{ admin_profile_id?: string; limit?: number; offset?: number }>(req)
    if (!body.admin_profile_id) {
      writeJson(res, 400, { ok: false, error: 'admin_profile_id é obrigatório.' }, corsOrigin)
      return true
    }
    const admin = await ensureAdminProfile(profileRepository, body.admin_profile_id)
    if (!admin) {
      writeJson(res, 403, { ok: false, error: 'Apenas administradores podem acessar esta fila.' }, corsOrigin)
      return true
    }
    const auditoria = await passwordRecoveryAuditRepository.listPending(body.limit ?? 50, body.offset ?? 0)
    writeJson(res, 200, { ok: true, auditoria }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/admin/password-recovery/approve') {
    const body = await readJson<{ admin_profile_id?: string; audit_id?: number; decision_note?: string }>(req)
    if (!body.admin_profile_id || !body.audit_id) {
      writeJson(res, 400, { ok: false, error: 'admin_profile_id e audit_id são obrigatórios.' }, corsOrigin)
      return true
    }
    const admin = await ensureAdminProfile(profileRepository, body.admin_profile_id)
    if (!admin) {
      writeJson(res, 403, { ok: false, error: 'Apenas administradores podem aprovar recuperação.' }, corsOrigin)
      return true
    }
    const audit = await passwordRecoveryAuditRepository.findById(Number(body.audit_id))
    if (!audit || audit.status !== 'requires_confirmation' || !audit.profile_id) {
      writeJson(res, 404, { ok: false, error: 'Pendência não encontrada.' }, corsOrigin)
      return true
    }
    const profile = await profileRepository.findById(audit.profile_id)
    if (!profile) {
      writeJson(res, 404, { ok: false, error: 'Perfil associado não encontrado.' }, corsOrigin)
      return true
    }
    if (!profile.email) {
      writeJson(res, 400, { ok: false, error: 'Perfil sem e-mail cadastrado.' }, corsOrigin)
      return true
    }
    try {
      await sendRecoveryCode(
        clerkSecretKey,
        profileRepository,
        passwordRecoveryRepository,
        passwordRecoveryAuditRepository,
        outboxRepository,
        profile,
        profile.email,
        undefined,
        'password_recovery_admin_approval',
        true,
      )
      await passwordRecoveryAuditRepository.approve({
        id: audit.id,
        approvedByProfileId: admin.id,
        decisionNote: body.decision_note ?? null,
      })
      writeJson(res, 200, { ok: true }, corsOrigin)
    } catch (error) {
      await passwordRecoveryAuditRepository.reject({
        id: audit.id,
        rejectedByProfileId: admin.id,
        decisionNote: error instanceof Error ? error.message : String(error),
      })
      writeJson(res, 400, { ok: false, error: getClerkErrorMessage(error) }, corsOrigin)
    }
    return true
  }

  if (req.method === 'POST' && req.url === '/api/admin/password-recovery/reject') {
    const body = await readJson<{ admin_profile_id?: string; audit_id?: number; decision_note?: string }>(req)
    if (!body.admin_profile_id || !body.audit_id) {
      writeJson(res, 400, { ok: false, error: 'admin_profile_id e audit_id são obrigatórios.' }, corsOrigin)
      return true
    }
    const admin = await ensureAdminProfile(profileRepository, body.admin_profile_id)
    if (!admin) {
      writeJson(res, 403, { ok: false, error: 'Apenas administradores podem rejeitar recuperação.' }, corsOrigin)
      return true
    }
    const audit = await passwordRecoveryAuditRepository.findById(Number(body.audit_id))
    if (!audit || audit.status !== 'requires_confirmation') {
      writeJson(res, 404, { ok: false, error: 'Pendência não encontrada.' }, corsOrigin)
      return true
    }
    await passwordRecoveryAuditRepository.reject({
      id: audit.id,
      rejectedByProfileId: admin.id,
      decisionNote: body.decision_note ?? null,
    })
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  return false
}
