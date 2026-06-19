import { getEdgeFunctionUrl, getSupabaseAccessToken, SUPABASE_ANON_KEY } from '@/lib/supabase'
import type { PerfilAcesso, PermissaoPagina, TipoVinculoUsuario } from '@/types'

type CreateUserPayload = {
  nome: string
  email: string
  senha: string
  perfil: PerfilAcesso
  permissoes: PermissaoPagina[]
}

type CreateUserRequestPayload = CreateUserPayload & {
  tipo_vinculo: TipoVinculoUsuario
}

type UpdatePasswordPayload = {
  userId: string
  password: string
}

type DeleteUserPayload = {
  userId: string
}

type AdminUsersAction =
  | { action: 'create_user'; payload: CreateUserRequestPayload }
  | { action: 'update_password'; payload: UpdatePasswordPayload }
  | { action: 'delete_user'; payload: DeleteUserPayload }

const DEFAULT_VINCULO_BY_PERFIL: Record<PerfilAcesso, TipoVinculoUsuario> = {
  admin: 'usuario_comum',
  agente_registro: 'agente_registro',
  vendedor: 'vendedor',
  usuario: 'usuario_comum',
}

async function invokeAdminUsers(body: AdminUsersAction) {
  const accessToken = await getSupabaseAccessToken()
  const response = await fetch(getEdgeFunctionUrl('admin-users'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => null) as { ok?: boolean; userId?: string; error?: string } | null
  if (!response.ok) {
    throw new Error(data?.error ?? `Falha ao chamar Edge Function (${response.status})`)
  }

  return { ok: Boolean(data?.ok), userId: data?.userId, error: data?.error }
}

export async function createAdminManagedUser(payload: CreateUserPayload) {
  const response = await invokeAdminUsers({
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
  const response = await invokeAdminUsers({ action: 'update_password', payload })
  if (!response.ok) throw new Error(response.error ?? 'Falha ao atualizar senha')
  return response
}

export async function deleteAdminManagedUser(payload: DeleteUserPayload) {
  const response = await invokeAdminUsers({ action: 'delete_user', payload })
  if (!response.ok) throw new Error(response.error ?? 'Falha ao excluir usuário')
  return response
}
