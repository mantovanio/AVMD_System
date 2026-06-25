import { createClerkClient } from '@clerk/backend'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { readJson, writeJson } from '../utils/http.js'

type CreateUserBody = {
  action: 'create_user'
  payload: {
    nome: string
    email: string
    senha: string
    perfil: string
    tipo_vinculo: string
    permissoes?: string[]
  }
}

type UpdatePasswordBody = {
  action: 'update_password'
  payload: { userId: string; password: string }
}

type DeleteUserBody = {
  action: 'delete_user'
  payload: { userId: string }
}

type AdminUsersBody = CreateUserBody | UpdatePasswordBody | DeleteUserBody

type ClerkErrorLike = {
  errors?: Array<{ message?: string; longMessage?: string; long_message?: string }>
  message?: string
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

export async function handleAdminUsersRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  profileRepository: ProfileRepository,
  clerkSecretKey: string,
  corsOrigin: string,
): Promise<boolean> {
  if (req.url !== '/api/admin/users') return false
  if (req.method !== 'POST') return false

  if (!clerkSecretKey) {
    writeJson(res, 503, { ok: false, error: 'CLERK_SECRET_KEY não configurada no backend.' }, corsOrigin)
    return true
  }

  const clerkClient = createClerkClient({ secretKey: clerkSecretKey })
  const body = await readJson<AdminUsersBody>(req)

  if (body.action === 'create_user') {
    const { nome, email, senha, perfil, tipo_vinculo, permissoes } = body.payload
    const [firstNameRaw, ...rest] = nome.trim().split(/\s+/)
    const firstName = firstNameRaw || 'Usuario'
    const lastName = rest.join(' ').trim() || undefined
    const usernameBase = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
    const username = ((usernameBase || 'usuario') + Date.now().toString(36)).slice(0, 24)

    try {
      const clerkUser = await clerkClient.users.createUser({
        emailAddress: [email],
        username,
        password: senha,
        firstName,
        lastName,
      })

      await profileRepository.createProfile({
        clerk_user_id: clerkUser.id,
        nome,
        email,
        perfil,
        tipo_vinculo,
        permissoes: permissoes ?? [],
      })

      writeJson(res, 200, { ok: true, userId: clerkUser.id }, corsOrigin)
    } catch (error) {
      writeJson(res, 400, { ok: false, error: getClerkErrorMessage(error) }, corsOrigin)
    }
    return true
  }

  if (body.action === 'update_password') {
    const { userId, password } = body.payload
    try {
      await clerkClient.users.updateUser(userId, { password })
      writeJson(res, 200, { ok: true }, corsOrigin)
    } catch (error) {
      writeJson(res, 400, { ok: false, error: getClerkErrorMessage(error) }, corsOrigin)
    }
    return true
  }

  if (body.action === 'delete_user') {
    const { userId } = body.payload
    try {
      await clerkClient.users.deleteUser(userId)
      await profileRepository.deleteByClerkId(userId)
      writeJson(res, 200, { ok: true }, corsOrigin)
    } catch (error) {
      writeJson(res, 400, { ok: false, error: getClerkErrorMessage(error) }, corsOrigin)
    }
    return true
  }

  writeJson(res, 400, { ok: false, error: 'action inválida' }, corsOrigin)
  return true
}


