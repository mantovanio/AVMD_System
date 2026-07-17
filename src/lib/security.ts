import type { Page } from '@/components/Sidebar'
import type { PerfilAcesso, PermissaoPagina, Profile } from '@/types'

export const PAGE_LABELS: Record<Page, string> = {
  portal: 'Meu Portal',
  dashboard: 'Dashboard',
  comercial: 'Comercial',
  clientes: 'Clientes',
  chat: 'Chat ao Vivo',
  renovacoes: 'Renovações',
  financeiro: 'Financeiro',
  relatorios: 'Relatórios',
  parceiros: 'Parceiros',
  configuracoes: 'Configurações',
  catalogo_ia: 'Catálogo IA',
}

export const PAGE_PERMISSIONS: { id: PermissaoPagina; label: string; description: string }[] = [
  { id: 'portal', label: 'Meu Portal', description: 'Acompanhar pedidos, pagamentos e agendamentos' },
  { id: 'dashboard', label: 'Dashboard', description: 'Ver indicadores principais' },
  { id: 'comercial', label: 'Comercial', description: 'Clientes, vendas, agenda e certificados' },
  { id: 'clientes', label: 'Clientes', description: 'Consultar base de clientes e histórico comercial' },
  { id: 'chat', label: 'Chat ao Vivo', description: 'Atendimento e Kanban de conversas' },
  { id: 'renovacoes', label: 'Renovações', description: 'Base e campanhas de renovação' },
  { id: 'financeiro', label: 'Financeiro', description: 'Lançamentos, contas e pagamentos' },
  { id: 'relatorios', label: 'Relatórios', description: 'Análises e relatórios' },
  { id: 'parceiros', label: 'Parceiros', description: 'Cadastro e acompanhamento de parceiros' },
  { id: 'configuracoes', label: 'Configurações', description: 'Configurações, integrações e usuários' },
  { id: 'catalogo_ia', label: 'Catálogo IA', description: 'Produtos e preços usados pelos agentes de IA' },
]

export const DEFAULT_PERMISSIONS: Record<PerfilAcesso, PermissaoPagina[]> = {
  admin: PAGE_PERMISSIONS.map(p => p.id),
  agente_registro: ['dashboard', 'comercial', 'clientes', 'chat', 'renovacoes'],
  vendedor: ['dashboard', 'comercial', 'clientes', 'parceiros', 'relatorios'],
  usuario: ['dashboard', 'relatorios', 'chat'],
}

const RESTRICTED_PAGE_PROFILES: Partial<Record<PermissaoPagina, PerfilAcesso[]>> = {
  chat: ['admin', 'agente_registro', 'usuario'],
}

const LEGACY_REQUIRED_PERMISSIONS: Partial<Record<PerfilAcesso, PermissaoPagina[]>> = {
  agente_registro: ['clientes'],
  vendedor: ['clientes'],
}

function normalizePermissions(
  perfil: PerfilAcesso,
  permissoes: PermissaoPagina[],
): PermissaoPagina[] {
  const required = LEGACY_REQUIRED_PERMISSIONS[perfil] ?? []
  return Array.from(new Set([...permissoes, ...required]))
}

export const PERFIL_LABEL: Record<PerfilAcesso, string> = {
  admin: 'Administrador',
  agente_registro: 'Agente de Registro',
  vendedor: 'Vendedor',
  usuario: 'Usuário',
}

export function isProfileActive(profile: Profile | null | undefined) {
  return profile?.status === 'ativo'
}

export function isAdminProfile(profile: Profile | null | undefined) {
  return profile?.perfil === 'admin' && isProfileActive(profile)
}

export function hasPerfil(profile: Profile | null | undefined, ...perfis: PerfilAcesso[]) {
  if (!profile || !isProfileActive(profile)) return false
  return perfis.includes(profile.perfil)
}

export function hasPagePermission(profile: Profile | null | undefined, page: PermissaoPagina) {
  if (!profile || !isProfileActive(profile)) return false
  if (profile.perfil === 'admin') return true
  const allowedPerfis = RESTRICTED_PAGE_PROFILES[page]
  if (allowedPerfis && !allowedPerfis.includes(profile.perfil)) return false
  const basePermissions = profile.permissoes?.length ? profile.permissoes : DEFAULT_PERMISSIONS[profile.perfil]
  const permissoes = normalizePermissions(profile.perfil, basePermissions)
  return permissoes.includes(page)
}

export function resolveAllowedPages(profile: Profile | null | undefined): Page[] {
  if (!profile || !isProfileActive(profile)) return []
  if (profile.perfil === 'admin') return DEFAULT_PERMISSIONS.admin
  const customPermissions = profile.permissoes?.filter((p): p is Page => p in PAGE_LABELS) ?? []
  const basePermissions = customPermissions.length > 0 ? customPermissions : DEFAULT_PERMISSIONS[profile.perfil]
  return (normalizePermissions(profile.perfil, basePermissions) as Page[]).filter(page => {
    const allowedPerfis = RESTRICTED_PAGE_PROFILES[page]
    return !allowedPerfis || allowedPerfis.includes(profile.perfil)
  })
}

export function resolveDefaultPage(profile: Profile | null | undefined): Page {
  const allowedPages = resolveAllowedPages(profile)
  return allowedPages[0] ?? 'dashboard'
}

export type CommercialAction =
  | 'view'
  | 'edit_sale'
  | 'delete_sale'
  | 'change_protocol'
  | 'change_payment'
  | 'change_status'
  | 'cancel_sale'
  | 'manage_agenda'
  | 'issue_nfse'
  | 'release_emission'

export interface CommercialSaleLike {
  pago?: boolean | null
  status_venda?: string | null
  protocolo_numero?: string | null
}

export function isSaleLockedForOperations(sale: CommercialSaleLike | null | undefined) {
  if (!sale) return false
  return Boolean(sale.pago || sale.status_venda === 'vendido' || sale.status_venda === 'emitido')
}

export function canPerformCommercialAction(
  profile: Profile | null | undefined,
  action: CommercialAction,
  sale?: CommercialSaleLike | null,
) {
  if (!profile || !isProfileActive(profile)) return false
  if (profile.perfil === 'admin') return true

  const locked = isSaleLockedForOperations(sale)

  switch (profile.perfil) {
    case 'vendedor':
      return action === 'view'
        || action === 'manage_agenda'
        || action === 'issue_nfse'
        || (action === 'change_status' && !locked)
    case 'agente_registro':
      return action === 'view'
        || action === 'manage_agenda'
        || action === 'issue_nfse'
        || (action === 'change_status' && !locked)
    case 'usuario':
      return action === 'view'
    default:
      return false
  }
}

export function canEditSale(profile: Profile | null | undefined, sale?: CommercialSaleLike | null) {
  return canPerformCommercialAction(profile, 'edit_sale', sale)
}

export function canDeleteSale(profile: Profile | null | undefined, sale?: CommercialSaleLike | null) {
  return canPerformCommercialAction(profile, 'delete_sale', sale)
}

export function canChangeProtocol(profile: Profile | null | undefined, sale?: CommercialSaleLike | null) {
  if (!profile || !isProfileActive(profile)) return false
  if (profile.perfil === 'admin') return true
  return false
}

export function canChangePayment(profile: Profile | null | undefined, sale?: CommercialSaleLike | null) {
  return canPerformCommercialAction(profile, 'change_payment', sale)
}

export function canReleaseEmission(profile: Profile | null | undefined, sale?: CommercialSaleLike | null) {
  if (!profile || !isProfileActive(profile)) return false
  if (profile.perfil === 'admin') return true
  return false
}

export function sanitizePostgrestSearchTerm(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s@._+\-/]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

export function buildSafeIlikePattern(value: string) {
  const sanitized = sanitizePostgrestSearchTerm(value)
  if (!sanitized) return ''
  return `%${sanitized.replace(/\s+/g, '%')}%`
}
