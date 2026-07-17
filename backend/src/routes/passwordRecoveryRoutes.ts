import { createClerkClient } from '@clerk/backend'
import { randomInt } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { readJson, writeJson } from '../utils/http.js'

type RequestBody = {
  email?: string
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

function buildClerkUsername(email: string) {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'usuario'
  return `${base}${randomInt(100000, 1000000)}`.slice(0, 24)
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
      writeJson(res, 404, { ok: false, error: 'Conta não encontrada.' }, corsOrigin)
      return true
    }

    const clerkClient = createClerkClient({ secretKey: clerkSecretKey })

    try {
      await syncClerkUser(clerkClient, profileRepository, profile.id, email, profile.nome, profile.clerk_user_id)
    } catch (error) {
      writeJson(res, 400, { ok: false, error: getClerkErrorMessage(error) }, corsOrigin)
      return true
    }

    writeJson(res, 200, { ok: true, email: maskEmail(email) }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/auth/password-recovery/verify') {
    writeJson(res, 410, { ok: false, error: 'Recuperação de senha agora é feita pelo Clerk.' }, corsOrigin)
    return true
  }

  return false
}
