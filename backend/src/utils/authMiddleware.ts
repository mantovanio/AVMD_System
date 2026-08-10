import { verifyToken } from '@clerk/backend'
import type { IncomingMessage, ServerResponse } from 'node:http'

type AuthenticatedRequest = IncomingMessage & {
  auth?: {
    userId: string
    sessionId: string
    user?: Record<string, unknown>
  }
}

type ClerkErrorLike = {
  errors?: Array<{ message?: string }>
  message?: string
  status?: number
}

function sendUnauthorized(res: ServerResponse, corsOrigin: string, error: string) {
  res.statusCode = 401
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  if (corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  }
  res.end(JSON.stringify({ ok: false, error }))
}

export async function requireAuth(
  req: IncomingMessage,
  res: ServerResponse,
  clerkSecretKey: string,
  corsOrigin: string,
): Promise<AuthenticatedRequest | null> {
  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : ''

  if (!token) {
    sendUnauthorized(res, corsOrigin, 'Token de autenticação obrigatório.')
    return null
  }

  try {
    const session = await verifyToken(token, { secretKey: clerkSecretKey })
    const authenticatedReq = req as AuthenticatedRequest
    authenticatedReq.auth = {
      userId: session.sub,
      sessionId: session.sid ?? '',
    }
    return authenticatedReq
  } catch (error) {
    const payload = error as ClerkErrorLike | undefined
    sendUnauthorized(res, corsOrigin, payload?.message ?? 'Token inválido ou expirado.')
    return null
  }
}

export async function requireAdmin(
  req: IncomingMessage,
  res: ServerResponse,
  clerkSecretKey: string,
  corsOrigin: string,
  profileRepository: { findById: (id: string) => Promise<{ perfil: string; status: string } | null> },
): Promise<AuthenticatedRequest | null> {
  const authReq = await requireAuth(req, res, clerkSecretKey, corsOrigin)
  if (!authReq) return null

  const profile = await profileRepository.findById(authReq.auth!.userId)
  if (!profile || profile.perfil !== 'admin' || profile.status !== 'ativo') {
    res.statusCode = 403
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    if (corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin)
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    }
    res.end(JSON.stringify({ ok: false, error: 'Acesso restrito a administradores.' }))
    return null
  }

  return authReq
}
