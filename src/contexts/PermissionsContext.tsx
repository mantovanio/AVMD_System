import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import type { Page } from '@/components/Sidebar'

type NivelAcesso = 'nenhum' | 'visualizar' | 'editar' | 'admin'

type ModuloPermissao = {
  chave: string
  nome: string
  grupo: string
  icone: string | null
  rota: string | null
  ordem: number
  nivel_acesso: NivelAcesso
}

type PermissionsContextValue = {
  permissoes: ModuloPermissao[]
  loading: boolean
  getNivelAcesso: (moduloChave: string) => NivelAcesso
  canView: (moduloChave: string) => boolean
  canEdit: (moduloChave: string) => boolean
  isAdminOf: (moduloChave: string) => boolean
  resolveAllowedPages: () => Page[]
  PAGE_TO_MODULO: Record<Page, string>
}

const MODULO_TO_PAGE: Record<string, Page> = {
  dashboard: 'dashboard',
  comercial: 'comercial',
  clientes: 'clientes',
  chat_crm: 'chat',
  renovacoes: 'renovacoes',
  financeiro: 'financeiro',
  relatorios: 'relatorios',
  parceiros: 'parceiros',
  catalogo_ia: 'catalogo_ia',
  configuracoes: 'configuracoes',
}

const PAGE_TO_MODULO: Record<Page, string> = {
  dashboard: 'dashboard',
  comercial: 'comercial',
  clientes: 'clientes',
  chat: 'chat_crm',
  renovacoes: 'renovacoes',
  financeiro: 'financeiro',
  relatorios: 'relatorios',
  parceiros: 'parceiros',
  catalogo_ia: 'catalogo_ia',
  configuracoes: 'configuracoes',
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null)

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const [permissoes, setPermissoes] = useState<ModuloPermissao[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.id) {
      setLoading(false)
      return
    }

    const origin = window.location.origin
    fetch(`${origin}/api/permissoes/profile/${profile.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.ok) setPermissoes(data.permissoes ?? [])
        setLoading(false)
      })
      .catch(() => {
        setPermissoes([])
        setLoading(false)
      })
  }, [profile?.id])

  function getNivelAcesso(moduloChave: string): NivelAcesso {
    return permissoes.find(p => p.chave === moduloChave)?.nivel_acesso ?? 'nenhum'
  }

  function canView(moduloChave: string): boolean {
    return getNivelAcesso(moduloChave) !== 'nenhum'
  }

  function canEdit(moduloChave: string): boolean {
    const nivel = getNivelAcesso(moduloChave)
    return nivel === 'editar' || nivel === 'admin'
  }

  function isAdminOf(moduloChave: string): boolean {
    return getNivelAcesso(moduloChave) === 'admin'
  }

  function resolveAllowedPages(): Page[] {
    const pages: Page[] = []
    for (const p of permissoes) {
      const page = MODULO_TO_PAGE[p.chave]
      if (page && p.nivel_acesso !== 'nenhum') pages.push(page)
    }
    return pages
  }

  return (
    <PermissionsContext.Provider value={{
      permissoes,
      loading,
      getNivelAcesso,
      canView,
      canEdit,
      isAdminOf,
      resolveAllowedPages,
      PAGE_TO_MODULO,
    }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext)
  if (!ctx) throw new Error('usePermissions must be used within PermissionsProvider')
  return ctx
}
