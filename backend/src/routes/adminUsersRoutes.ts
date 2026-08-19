import { createClerkClient } from '@clerk/backend'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { readJson, writeJson } from '../utils/http.js'

function buildTemporaryStrongPassword() {
  const stamp = Date.now().toString(36)
  return `Tmp#${stamp}aA1!`
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

type ClerkUserLike = {
  id: string
  emailAddresses?: Array<{ emailAddress?: string }>
}

function clerkUserHasEmail(user: ClerkUserLike, email: string) {
  const normalizedEmail = normalizeEmail(email)
  return user.emailAddresses?.some(item => normalizeEmail(item.emailAddress ?? '') === normalizedEmail) ?? false
}

type CreateUserBody = {
  action: 'create_user'
  payload: {
    nome: string
    email: string
    senha: string
    perfil: string
    tipo_vinculo: string
    permissoes?: string[]
    metadata?: Record<string, unknown>
  }
}

type UpdatePasswordBody = {
  action: 'update_password'
  payload: { userId: string; password: string }
}

type LinkExistingUserBody = {
  action: 'link_existing_user'
  payload: {
    profileId: string
    password: string
  }
}

type DeleteUserBody = {
  action: 'delete_user'
  payload: { userId: string }
}

type AdminUsersBody = CreateUserBody | UpdatePasswordBody | LinkExistingUserBody | DeleteUserBody

type ClerkErrorLike = {
  errors?: Array<{ message?: string; longMessage?: string; long_message?: string }>
  message?: string
  status?: number
  clerkError?: boolean
}

function getClerkErrorMessage(error: unknown) {
  const payload = error as ClerkErrorLike | undefined
  const first = payload?.errors?.[0]
  return first?.longMessage
    ?? first?.long_message
    ?? first?.message
    ?? payload?.message
    ?? (error instanceof Error ? error.message : 'Falha ao processar ação no Clerk.')
}

function isClerkNotFoundError(error: unknown) {
  const payload = error as ClerkErrorLike | undefined
  const status = payload?.status
  const message = `${payload?.message ?? ''} ${payload?.errors?.map(err => `${err.longMessage ?? err.long_message ?? err.message ?? ''}`).join(' ') ?? ''}`.toLowerCase()
  return status === 404 || message.includes('no user was found with id') || message.includes('not found')
}

async function resolveClerkUserByProfile(
  clerkClient: ReturnType<typeof createClerkClient>,
  profileRepository: ProfileRepository,
  profileId: string,
) {
  const profile = await profileRepository.findById(profileId)
  if (!profile) return { profile: null, clerkUserId: null }

  if (profile.clerk_user_id) {
    try {
      const clerkUser = await clerkClient.users.getUser(profile.clerk_user_id)
      if (clerkUser?.id) {
        return { profile, clerkUserId: clerkUser.id }
      }
    } catch (error) {
      if (!isClerkNotFoundError(error)) {
        throw error
      }
    }
  }

  const email = profile.email?.trim().toLowerCase()
  if (!email) {
    return { profile, clerkUserId: null }
  }

  const clerkUsers = await clerkClient.users.getUserList({ emailAddress: [email], limit: 1 })
  const clerkUser = clerkUsers.data.find(user =>
    user.emailAddresses?.some(item => item.emailAddress?.trim().toLowerCase() === email),
  )

  if (!clerkUser?.id) {
    return { profile, clerkUserId: null }
  }

  if (profile.clerk_user_id !== clerkUser.id) {
    await profileRepository.update(profile.id, { clerk_user_id: clerkUser.id })
  }

  return { profile, clerkUserId: clerkUser.id }
}

export async function handleAdminUsersRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  profileRepository: ProfileRepository,
  clerkSecretKey: string,
  corsOrigin: string,
): Promise<boolean> {
  if (req.url !== '/api/admin/users') return false

  if (req.method === 'GET') {
    try {
      const profiles = await profileRepository.findAll()
      const users = profiles.map(p => ({
        id: p.id,
        nome: p.nome,
        email: p.email,
        perfil: p.perfil,
        status: p.status,
        tipo_vinculo: p.tipo_vinculo,
        created_at: p.created_at,
      }))
      writeJson(res, 200, { ok: true, users }, corsOrigin)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      writeJson(res, 500, { ok: false, error: msg }, corsOrigin)
    }
    return true
  }

  if (req.method !== 'POST') return false

  if (!clerkSecretKey) {
    writeJson(res, 503, { ok: false, error: 'CLERK_SECRET_KEY não configurada no backend.' }, corsOrigin)
    return true
  }

  const clerkClient = createClerkClient({ secretKey: clerkSecretKey })
  const body = await readJson<AdminUsersBody>(req)

  if (body.action === 'create_user') {
    const { nome, email, senha, perfil, tipo_vinculo, permissoes, metadata } = body.payload

    try {
      const normalizedEmail = normalizeEmail(email)
      const existingClerkUsers = await clerkClient.users.getUserList({ emailAddress: [normalizedEmail], limit: 5 })
      const matched = existingClerkUsers.data.find(u => clerkUserHasEmail(u, normalizedEmail))

      let clerkUserId: string
      if (matched) {
        clerkUserId = matched.id
      } else {
        const [firstNameRaw, ...rest] = nome.trim().split(/\s+/)
        const firstName = firstNameRaw || 'Usuario'
        const lastName = rest.join(' ').trim() || undefined
        const usernameBase = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
        const username = ((usernameBase || 'usuario') + Date.now().toString(36)).slice(0, 24)

        const clerkUser = await clerkClient.users.createUser({
          emailAddress: [email],
          username,
          password: buildTemporaryStrongPassword(),
          firstName,
          lastName,
        })
        clerkUserId = clerkUser.id
      }

      await clerkClient.users.updateUser(clerkUserId, {
        password: senha,
        skipPasswordChecks: true,
        signOutOfOtherSessions: true,
      })

      const existingProfile = await profileRepository.findInternalAccessByEmail(email)
      if (existingProfile) {
        await profileRepository.update(existingProfile.id, { clerk_user_id: clerkUserId })
        writeJson(res, 200, { ok: true, userId: clerkUserId, linked: true }, corsOrigin)
      } else {
        await profileRepository.createProfile({
          clerk_user_id: clerkUserId,
          nome,
          email,
          perfil,
          tipo_vinculo,
          permissoes: permissoes ?? [],
          metadata: metadata ?? {},
        })
        writeJson(res, 200, { ok: true, userId: clerkUserId }, corsOrigin)
      }
    } catch (error) {
      writeJson(res, 400, { ok: false, error: getClerkErrorMessage(error) }, corsOrigin)
    }
    return true
  }

  if (body.action === 'update_password') {
    const { userId, password } = body.payload
    const resolved = await resolveClerkUserByProfile(clerkClient, profileRepository, userId)
    const profile = resolved.profile
    const clerkUserId = resolved.clerkUserId

    if (!profile) {
      writeJson(res, 404, { ok: false, error: 'Perfil não encontrado.' }, corsOrigin)
      return true
    }

    if (!clerkUserId) {
      writeJson(res, 400, { ok: false, error: 'Este usuário ainda não está vinculado ao Clerk. Vincule a conta de login antes de alterar a senha.' }, corsOrigin)
      return true
    }
    try {
      const clerkUser = await clerkClient.users.getUser(clerkUserId)
      if (!clerkUser?.id) {
        writeJson(res, 400, { ok: false, error: 'Conta vinculada não encontrada no Clerk. Refaça o vínculo antes de alterar a senha.' }, corsOrigin)
        return true
      }
      await clerkClient.users.updateUser(clerkUserId, {
        password,
        skipPasswordChecks: true,
        signOutOfOtherSessions: true,
      })
      writeJson(res, 200, { ok: true, userId: clerkUserId, verified: true }, corsOrigin)
    } catch (error) {
      if (isClerkNotFoundError(error)) {
        writeJson(res, 400, { ok: false, error: 'A conta vinculada ao Clerk não foi encontrada. Refaça o vínculo antes de alterar a senha.' }, corsOrigin)
        return true
      }
      writeJson(res, 400, { ok: false, error: getClerkErrorMessage(error) }, corsOrigin)
    }
    return true
  }

  if (body.action === 'link_existing_user') {
    const { profileId, password } = body.payload
    const profile = await profileRepository.findById(profileId)
    if (!profile) {
      writeJson(res, 404, { ok: false, error: 'Perfil não encontrado.' }, corsOrigin)
      return true
    }
    if (profile.clerk_user_id) {
      writeJson(res, 409, { ok: false, error: 'Este usuário já está vinculado ao Clerk.' }, corsOrigin)
      return true
    }
    if (!profile.email || !profile.nome.trim() || !password) {
      writeJson(res, 400, { ok: false, error: 'Nome, e-mail e senha são obrigatórios para vincular a conta.' }, corsOrigin)
      return true
    }

    try {
      const normalizedEmail = normalizeEmail(profile.email)
      const existingClerkUsers = await clerkClient.users.getUserList({ emailAddress: [normalizedEmail], limit: 5 })
      const matched = existingClerkUsers.data.find(u => clerkUserHasEmail(u, normalizedEmail))

      let clerkUserId: string
      if (matched) {
        clerkUserId = matched.id
      } else {
        const [firstNameRaw, ...rest] = profile.nome.trim().split(/\s+/)
        const firstName = firstNameRaw || 'Usuario'
        const lastName = rest.join(' ').trim() || undefined
        const usernameBase = profile.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
        const username = ((usernameBase || 'usuario') + Date.now().toString(36)).slice(0, 24)

        const clerkUser = await clerkClient.users.createUser({
          emailAddress: [profile.email],
          username,
          password: buildTemporaryStrongPassword(),
          firstName,
          lastName,
        })
        clerkUserId = clerkUser.id
      }

      await clerkClient.users.updateUser(clerkUserId, {
        password,
        skipPasswordChecks: true,
        signOutOfOtherSessions: true,
      })

      await profileRepository.update(profile.id, { clerk_user_id: clerkUserId })
      writeJson(res, 200, { ok: true, userId: clerkUserId }, corsOrigin)
    } catch (error) {
      writeJson(res, 400, { ok: false, error: getClerkErrorMessage(error) }, corsOrigin)
    }
    return true
  }

  if (body.action === 'delete_user') {
    const { userId } = body.payload
    try {
      const profile = await profileRepository.findById(userId)
      const clerkUserId = profile?.clerk_user_id ?? userId

      if (clerkUserId) {
        try {
          await clerkClient.users.deleteUser(clerkUserId)
        } catch (error) {
          if (!isClerkNotFoundError(error)) {
            throw error
          }
        }
      }

      if (profile) {
        await profileRepository.update(profile.id, {
          status: 'removido',
          clerk_user_id: null,
          observacoes: [profile.observacoes?.trim(), 'Acesso removido pelo administrador; histórico preservado.'].filter(Boolean).join(' '),
        })
      }
      writeJson(res, 200, { ok: true }, corsOrigin)
    } catch (error) {
      writeJson(res, 400, { ok: false, error: getClerkErrorMessage(error) }, corsOrigin)
    }
    return true
  }

  writeJson(res, 400, { ok: false, error: 'action inválida' }, corsOrigin)
  return true
}


