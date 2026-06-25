import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { readJson, writeJson } from '../utils/http.js'

const CLERK_API = 'https://api.clerk.com/v1'

function clerkHeaders(secretKey: string) {
  return {
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
  }
}

async function clerkFetch(secretKey: string, path: string, method: string, body?: unknown) {
  const res = await fetch(`${CLERK_API}${path}`, {
    method,
    headers: clerkHeaders(secretKey),
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null) as Record<string, unknown> | null
  return { ok: res.ok, status: res.status, data }
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

  const body = await readJson<AdminUsersBody>(req)

  if (body.action === 'create_user') {
    const { nome, email, senha, perfil, tipo_vinculo, permissoes } = body.payload
    const [first_name, ...rest] = nome.trim().split(' ')
    const last_name = rest.join(' ') || undefined

    const clerkRes = await clerkFetch(clerkSecretKey, '/users', 'POST', {
      email_address: [email],
      password: senha,
      first_name,
      last_name,
      skip_password_checks: false,
      skip_password_requirement: false,
    })

    if (!clerkRes.ok) {
      const errMsg = (clerkRes.data?.errors as Array<{ message: string }> | null)?.[0]?.message
        ?? clerkRes.data?.message
        ?? `Clerk erro ${clerkRes.status}`
      writeJson(res, 400, { ok: false, error: String(errMsg) }, corsOrigin)
      return true
    }

    const clerkUserId = clerkRes.data?.id as string | undefined
    if (!clerkUserId) {
      writeJson(res, 500, { ok: false, error: 'Clerk não retornou userId.' }, corsOrigin)
      return true
    }

    await profileRepository.createProfile({
      clerk_user_id: clerkUserId,
      nome,
      email,
      perfil,
      tipo_vinculo,
      permissoes: permissoes ?? [],
    })

    writeJson(res, 200, { ok: true, userId: clerkUserId }, corsOrigin)
    return true
  }

  if (body.action === 'update_password') {
    const { userId, password } = body.payload
    const clerkRes = await clerkFetch(clerkSecretKey, `/users/${userId}`, 'PATCH', { password })
    if (!clerkRes.ok) {
      const errMsg = (clerkRes.data?.errors as Array<{ message: string }> | null)?.[0]?.message ?? `Clerk erro ${clerkRes.status}`
      writeJson(res, 400, { ok: false, error: String(errMsg) }, corsOrigin)
      return true
    }
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  if (body.action === 'delete_user') {
    const { userId } = body.payload
    const clerkRes = await clerkFetch(clerkSecretKey, `/users/${userId}`, 'DELETE')
    if (!clerkRes.ok) {
      const errMsg = (clerkRes.data?.errors as Array<{ message: string }> | null)?.[0]?.message ?? `Clerk erro ${clerkRes.status}`
      writeJson(res, 400, { ok: false, error: String(errMsg) }, corsOrigin)
      return true
    }
    await profileRepository.deleteByClerkId(userId)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }

  writeJson(res, 400, { ok: false, error: 'action inválida' }, corsOrigin)
  return true
}
