import { getApiUrl } from '@/lib/api'
import type { PerfilAcesso, PermissaoPagina, TipoVinculoUsuario } from '@/types'

type CreateUserPayload = {
  nome: string
  email: string
  senha: string
  perfil: PerfilAcesso
  permissoes: PermissaoPagina[]
}

type UpdatePasswordPayload = {
  userId: string
  password: string
}

type LinkExistingUserPayload = {
  profileId: string
  password: string
}

type DeleteUserPayload = {
  userId: string
}

const DEFAULT_VINCULO_BY_PERFIL: Record<PerfilAcesso, TipoVinculoUsuario> = {
  admin: 'usuario_comum',
  agente_registro: 'agente_registro',
  vendedor: 'vendedor',
  usuario: 'usuario_comum',
}

function normalizeAdminUserError(error: string | undefined) {
  const text = String(error ?? '').trim()
  if (!text) return 'Falha ao processar o usuário.'
  const normalized = text.toLowerCase()
  if (text === 'Given password is not strong enough.') {
    return 'A senha inicial está fraca. Use pelo menos 8 caracteres com letras maiúsculas, minúsculas e números.'
  }
  if (normalized.includes('missing data')) {
    return 'Dados obrigatórios não foram aceitos pelo provedor de autenticação. Revise nome, e-mail e uma senha forte.'
  }
  if (normalized.includes('no user was found with id') || normalized.includes('account vinculada não encontrada') || normalized.includes('não foi encontrada')) {
    return 'A conta vinculada ao login não foi encontrada. Refaça o vínculo antes de alterar a senha.'
  }
  if (normalized.includes('not found')) {
    return 'Conta não encontrada. Refaça o vínculo antes de alterar a senha.'
  }
  return text
}

async function callAdminUsers(body: unknown) {
  const res = await fetch(getApiUrl('/admin/users'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => null) as { ok?: boolean; userId?: string; verified?: boolean; error?: string } | null
  if (!res.ok) throw new Error(normalizeAdminUserError(data?.error ?? `Erro ${res.status}`))
  return {
    ok: Boolean(data?.ok),
    userId: data?.userId,
    verified: Boolean(data?.verified),
    error: normalizeAdminUserError(data?.error),
  }
}

export async function createAdminManagedUser(payload: CreateUserPayload) {
  const response = await callAdminUsers({
    action: 'create_user',
    payload: {
      ...payload,
      tipo_vinculo: DEFAULT_VINCULO_BY_PERFIL[payload.perfil],
    },
  })
  if (!response.ok) throw new Error(response.error ?? 'Falha ao criar usuário')
  return response
}

export async function updateAdminManagedPassword(payload: UpdatePasswordPayload) {
  const response = await callAdminUsers({ action: 'update_password', payload })
  if (!response.ok) throw new Error(response.error ?? 'Falha ao atualizar senha')
  return response
}

export async function linkExistingAdminManagedUser(payload: LinkExistingUserPayload) {
  const response = await callAdminUsers({ action: 'link_existing_user', payload })
  if (!response.ok) throw new Error(response.error ?? 'Falha ao vincular usuário')
  return response
}

export async function deleteAdminManagedUser(payload: DeleteUserPayload) {
  const response = await callAdminUsers({ action: 'delete_user', payload })
  if (!response.ok) throw new Error(response.error ?? 'Falha ao excluir usuário')
  return response
}
