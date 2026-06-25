import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { readJson, writeJson } from '../utils/http.js'

const CLERK_API = 'https://api.clerk.com/v1'

function clerkHeaders(secretKey: string) {
  return {
    Authorization: `Bearer ${secretKey}`,
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

type ClerkErrorItem = { message?: string; long_message?: string; code?: string }

function getClerkErrorMessage(data: Record<string, unknown> | null, status: number) {
  const clerkErrors = data?.errors as ClerkErrorItem[] | null | undefined
  return clerkErrors?.[0]?.long_message
    ?? clerkErrors?.[0]?.message
    ?? (typeof data?.message === 'string' ? data.message : null)
    ?? `Clerk erro ${status}`
}

function isRecoverableCreateError(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('missing data') || normalized.includes('missing required') || normalized.includes('form_param_missing')
}

async function createClerkUser(secretKey: string, input: {
  nome: string
  email: string
  senha: string
}) {
  const [firstName, ...rest] = input.nome.trim().split(/\s+/)
  const lastName = rest.join(' ') || undefined
  const username = input.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '_').slice(0, 64)

  const attempts: Array<Record<string, unknown>> = [
    {
      email_address: input.email,
      password: input.senha,
      first_name: firstName,
      last_name: lastName,
    },
    {
      emailAddress: input.email,
      password: input.senha,
      firstName,
      lastName,
    },
    {
      email_address: [input.email],
      password: input.senha,
      first_name: firstName,
      last_name: lastName,
    },
    {
      emailAddress: [input.email],
      password: input.senha,
      firstName,
      lastName,
    },
    {
      email_address: input.email,
      username,
      password: input.senha,
      first_name: firstName,
      last_name: lastName,
    },
    {
      emailAddress: input.email,
      username,
      password: input.senha,
      firstName,
      lastName,
    },
  ]

  let lastResponse: { ok: boolean; status: number; data: Record<string, unknown> | null } | null = null

  for (const body of attempts) {
    const response = await clerkFetch(secretKey, '/users', 'POST', body)
    if (response.ok) return response

    lastResponse = response
    const errorMessage = getClerkErrorMessage(response.data, response.status)
    if (!isRecoverableCreateError(errorMessage)) {
      return response
    }
  }

  return lastResponse ?? { ok: false, status: 500, data: { message: 'Falha desconhecida ao criar usuário no Clerk.' } }
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

  const body = await readJson<AdminUsersBody>(req)

  if (body.action === 'create_user') {
    const { nome, email, senha, perfil, tipo_vinculo, permissoes } = body.payload
    const clerkRes = await createClerkUser(clerkSecretKey, { nome, email, senha })

    if (!clerkRes.ok) {
      const errMsg = getClerkErrorMessage(clerkRes.data, clerkRes.status)
      process.stderr.write(`[adminUsers] Clerk error: ${JSON.stringify(clerkRes.data)}\n`)
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
      const errMsg = getClerkErrorMessage(clerkRes.data, clerkRes.status)
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
      const errMsg = getClerkErrorMessage(clerkRes.data, clerkRes.status)
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

