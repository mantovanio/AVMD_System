import { createClerkClient } from '@clerk/backend'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CommunicationOutboxRepository } from '../repositories/communicationOutboxRepository.js'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { readJson, writeJson } from '../utils/http.js'

type RegisterBody = {
  nome?: string
  email?: string
  senha?: string
}

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
    ?? (error instanceof Error ? error.message : 'Falha ao processar cadastro no Clerk.')
}

function buildPendingApprovalEmail(nome: string) {
  const firstName = nome.trim().split(/\s+/)[0] || 'cliente'
  return {
    subject: 'Cadastro recebido e aguardando aprovação',
    body: `Olá, ${firstName}.

Recebemos seu cadastro na plataforma.

Neste momento o seu acesso está aguardando aprovação da equipe responsável. Assim que a liberação for concluída, você poderá entrar normalmente com o e-mail e a senha cadastrados.

Se tiver urgência, responda este e-mail para falar com a equipe.`,
  }
}

export async function handlePublicAuthRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  profileRepository: ProfileRepository,
  outboxRepository: CommunicationOutboxRepository,
  clerkSecretKey: string,
  corsOrigin: string,
): Promise<boolean> {
  if (req.method !== 'POST') return false
  if (req.url !== '/api/auth/register') return false

  if (!clerkSecretKey) {
    writeJson(res, 503, { ok: false, error: 'CLERK_SECRET_KEY não configurada no backend.' }, corsOrigin)
    return true
  }

  const body = await readJson<RegisterBody>(req)
  const nome = String(body?.nome ?? '').trim()
  const email = String(body?.email ?? '').trim().toLowerCase()
  const senha = String(body?.senha ?? '')

  if (!nome || !email || !senha) {
    writeJson(res, 400, { ok: false, error: 'Nome, e-mail e senha são obrigatórios.' }, corsOrigin)
    return true
  }

  const existingProfile = await profileRepository.findByEmail(email)
  if (existingProfile) {
    if (existingProfile.clerk_user_id) {
      writeJson(res, 409, { ok: false, error: 'Este email já está cadastrado.' }, corsOrigin)
      return true
    }
  }

  const clerkClient = createClerkClient({ secretKey: clerkSecretKey })
  const [firstNameRaw, ...rest] = nome.split(/\s+/)
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

    if (existingProfile) {
      await profileRepository.update(existingProfile.id, {
        clerk_user_id: clerkUser.id,
        nome,
        email,
        perfil: existingProfile.perfil || 'usuario',
        tipo_vinculo: existingProfile.tipo_vinculo || 'usuario_comum',
        permissoes: existingProfile.permissoes ?? [],
        status: 'ativo',
      })
    } else {
      await profileRepository.createProfile({
        clerk_user_id: clerkUser.id,
        nome,
        email,
        perfil: 'usuario',
        tipo_vinculo: 'usuario_comum',
        permissoes: [],
        status: 'inativo',
      })
    }

    const emailMessage = buildPendingApprovalEmail(nome)
    await outboxRepository.create({
      channel: 'email',
      provider: 'email_smtp',
      to_address: email,
      subject: emailMessage.subject,
      body: emailMessage.body,
      payload: { context: 'public_signup_pending_approval', nome, email },
    })

    writeJson(res, 200, { ok: true, userId: clerkUser.id }, corsOrigin)
  } catch (error) {
    writeJson(res, 400, { ok: false, error: getClerkErrorMessage(error) }, corsOrigin)
  }

  return true
}
