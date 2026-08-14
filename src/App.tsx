import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { ClerkProvider } from '@clerk/clerk-react'
import { ptBR } from '@clerk/localizations'
import { createPortal } from 'react-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import Sidebar, { type Page } from '@/components/Sidebar'
import NotificationBell from '@/components/NotificationBell'
import { useNotifications } from '@/hooks/useNotifications'
import { Camera, LogOut, Menu, MoonStar, Settings, SunMedium, UserCog } from 'lucide-react'
import { APP_VERSION } from '@/lib/version'
import { DEFAULT_AGENCY_CONFIG, fetchAgencyConfig } from '@/lib/agencyConfig'
import { PAGE_LABELS, PERFIL_LABEL, isAdminProfile, resolveAllowedPages as resolveLegacyPages, resolveDefaultPage } from '@/lib/security'
import { PermissionsProvider, usePermissions } from '@/contexts/PermissionsContext'
import { assertRuntimeConfig } from '@/lib/runtimeConfig'

const Login = lazy(() => import('@/pages/Login'))
const PortalCliente = lazy(() => import('@/pages/PortalCliente'))
const UpdatePassword = lazy(() => import('@/pages/UpdatePassword'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Comercial = lazy(() => import('@/pages/Comercial'))
const Clientes = lazy(() => import('@/pages/Clientes'))
const ChatAoVivo = lazy(() => import('@/pages/ChatInboxCRM'))
const Engage = lazy(() => import('@/pages/Engage'))
const Renovacoes = lazy(() => import('@/pages/Renovacoes'))
const Financeiro = lazy(() => import('@/pages/Financeiro'))
const Relatorios = lazy(() => import('@/pages/Relatorios'))
const Parceiros = lazy(() => import('@/pages/Parceiros'))
const Configuracoes = lazy(() => import('@/pages/Configuracoes'))
const CatalogoIA = lazy(() => import('@/pages/CatalogoIA'))
const MarketplaceLoja = lazy(() => import('@/pages/MarketplaceLoja'))
const ContestacaoAssinatura = lazy(() => import('@/pages/ContestacaoAssinatura'))
const DebugPanel = lazy(() => import('@/components/DebugPanel'))

// ── Módulo → páginas controladas ───────────────────────────────
const MODULE_PAGE_MAP: Partial<Record<string, Page[]>> = {
  crm:          ['dashboard', 'comercial', 'clientes', 'engage', 'renovacoes', 'parceiros', 'relatorios', 'financeiro', 'catalogo_ia'],
  chat_interno: ['chat'],
}

// Páginas não controladas por módulo (visíveis se o perfil permitir)
const UNMODULATED_PAGES: Page[] = ['portal', 'configuracoes']

function getModuleEnabledPages(enabledModules: Record<string, boolean>): Page[] {
  const pages: Page[] = [...UNMODULATED_PAGES]
  for (const [mod, modPages] of Object.entries(MODULE_PAGE_MAP)) {
    if (enabledModules[mod] !== false) {
      pages.push(...(modPages ?? []))
    }
  }
  return pages
}

function FullScreenLoader({ message = 'Carregando...' }: { message?: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-gray-900 to-blue-900 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center animate-pulse">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <p className="text-blue-300 text-sm">{message}</p>
      </div>
    </div>
  )
}

function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center animate-pulse">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 7h16M4 12h16M4 17h10" />
          </svg>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Carregando tela...</p>
      </div>
    </div>
  )
}

// ── Componente principal ────────────────────────────────────────

function AppContent() {
  const { user, profile, loading, signOut, isPasswordRecovery } = useAuth()
  const pathname = window.location.pathname
  const initialPortal = new URLSearchParams(window.location.search).get('page') === 'portal'
  const isShopRoute  = /^\/shop\/?$/.test(pathname)
  const lojaMatch    = pathname.match(/^\/loja\/([^/]+)\/?$/)
  const lojaSlug     = lojaMatch?.[1] ? decodeURIComponent(lojaMatch[1]) : null
  const contestacaoMatch = pathname.match(/^\/contestacao\/([^/]+)\/?$/)
  const contestacaoToken = contestacaoMatch?.[1] ? decodeURIComponent(contestacaoMatch[1]) : null

  const [page, setPage]         = useState<Page>(initialPortal ? 'portal' : 'dashboard')
  const [dark, setDark]         = useState(() => localStorage.getItem('theme') === 'dark')
  const [agencyConfig, setAgencyConfig] = useState(DEFAULT_AGENCY_CONFIG)
  const [debugOpen,  setDebugOpen]      = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  // Permissões por módulo — carregadas do backend
  const { loading: permLoading, resolveAllowedPages: resolveModulePages } = usePermissions()

  // Módulos habilitados — fallback via Supabase
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>({})
  const [modulesLoaded, setModulesLoaded]   = useState(false)

  const isAdmin = isAdminProfile(profile)
  const { notifications } = useNotifications(isAdmin, profile?.id ?? null)

  // Tema escuro
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    document.body.classList.toggle('dark', dark)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.body.style.colorScheme = dark ? 'dark' : 'light'
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    function handleThemeChange(event: Event) {
      const custom = event as CustomEvent<{ dark?: boolean }>
      if (typeof custom.detail?.dark === 'boolean') {
        setDark(custom.detail.dark)
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === 'theme') {
        setDark(event.newValue === 'dark')
      }
    }

    window.addEventListener('app:theme-change', handleThemeChange as EventListener)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener('app:theme-change', handleThemeChange as EventListener)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (!target.closest('[data-user-menu]')) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Navegação via evento customizado (usado pelo ChatPanel)
  useEffect(() => {
    function handleExternalNavigate(event: Event) {
      const custom = event as CustomEvent<{ page?: Page }>
      const nextPage = custom.detail?.page
      if (nextPage) setPage(nextPage)
    }
    window.addEventListener('crm:navigate', handleExternalNavigate as EventListener)
    return () => window.removeEventListener('crm:navigate', handleExternalNavigate as EventListener)
  }, [])

  // Config da agência
  useEffect(() => {
    let active = true
    fetchAgencyConfig().then(({ data }) => { if (active) setAgencyConfig(data) })
    return () => { active = false }
  }, [])

  // Módulos habilitados do backend
  useEffect(() => {
    if (!user) return
    const origin = window.location.origin
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 5000)
    fetch(`${origin}/api/permissoes/modules-config`, { signal: controller.signal })
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setEnabledModules(data.config ?? {})
        }
        setModulesLoaded(true)
      })
      .catch(() => setModulesLoaded(true))
      .finally(() => window.clearTimeout(timeout))
    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [user])

  // Splash de carregamento
  if (loading) {
    return <FullScreenLoader />
  }

  // Rotas públicas especiais
  if (isShopRoute) {
    return (
      <Suspense fallback={<FullScreenLoader message="Carregando checkout..." />}>
        <MarketplaceLoja />
      </Suspense>
    )
  }
  if (lojaSlug) {
    return (
      <Suspense fallback={<FullScreenLoader message="Carregando checkout..." />}>
        <MarketplaceLoja slug={lojaSlug} />
      </Suspense>
    )
  }
  if (contestacaoToken) {
    return (
      <Suspense fallback={<FullScreenLoader message="Carregando contestação..." />}>
        <ContestacaoAssinatura token={contestacaoToken} />
      </Suspense>
    )
  }

  // Autenticação
  if (isPasswordRecovery) {
    return (
      <Suspense fallback={<FullScreenLoader message="Carregando redefinição de senha..." />}>
        <UpdatePassword />
      </Suspense>
    )
  }
  if (!user) {
    return (
      <Suspense fallback={<FullScreenLoader message="Carregando login..." />}>
        <Login />
      </Suspense>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-gray-900 to-blue-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl shadow-black/40 p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Perfil aguardando configuração</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Não encontramos um perfil de acesso liberado para sua conta. Contate o administrador.</p>
          <button type="button" onClick={() => void signOut()}
            className="mt-6 w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
            Voltar ao login
          </button>
        </div>
      </div>
    )
  }

  if (profile?.status === 'inativo') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-gray-900 to-blue-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl shadow-black/40 p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Acesso aguardando liberação</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Sua conta foi criada, mas o primeiro acesso precisa ser liberado pelo administrador.</p>
          <button type="button" onClick={() => void signOut()}
            className="mt-6 w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
            Voltar ao login
          </button>
        </div>
      </div>
    )
  }

  // ── Páginas disponíveis = permissões por módulo (fallback: perfil + módulos) ──
  const moduleBasedPages = resolveModulePages()
  const rolePages   = resolveLegacyPages(profile)
  const modulePages = getModuleEnabledPages(enabledModules)
  const allowedPages = moduleBasedPages.length > 0
    ? moduleBasedPages.filter(p => rolePages.includes(p) && modulePages.includes(p))
    : rolePages.filter(p => modulePages.includes(p))
  const defaultPage  = resolveDefaultPage(profile)
  const activePage: Page = allowedPages.includes(page) ? page : (allowedPages[0] ?? defaultPage)

  function handleNavigate(p: Page) {
    if (allowedPages.includes(p)) setPage(p)
  }

  const perfilLabel  = PERFIL_LABEL[profile.perfil] ?? ''
  const nomeDisplay  = profile.nome ?? user.email ?? 'Usuário'
  const themeToggleLabel = dark ? 'Alternar para tema claro' : 'Alternar para tema escuro'
  const avatarUrl = typeof profile.metadata?.avatar_url === 'string' ? profile.metadata.avatar_url : ''
  const userInitials = nomeDisplay
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'U'

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        allowedPages={allowedPages}
        onLogout={() => void signOut()}
        agencyConfig={agencyConfig}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b border-gray-200/80 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 flex items-center justify-between px-4 shrink-0 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-4 min-w-0">
            <button type="button" onClick={() => setMobileNavOpen(true)}
              className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <Menu size={18} />
            </button>
            {agencyConfig.logo_interna_url?.trim() ? (
              <img src={agencyConfig.logo_interna_url} alt={agencyConfig.nome_agencia} className="h-24 w-auto max-w-[420px] object-contain drop-shadow-sm" />
            ) : null}
            <div className="hidden md:flex min-w-0 flex-col">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">Painel operacional</span>
              <span className="truncate text-sm font-semibold text-blue-600 dark:text-blue-400">{PAGE_LABELS[activePage]}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden md:inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              v{APP_VERSION}
            </span>
            <NotificationBell notifications={notifications} onNavigate={handleNavigate} />
            {isAdmin && (
              <button type="button" onClick={() => setDebugOpen(o => !o)} title="Debug logs"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors text-sm ${debugOpen ? 'bg-red-100 dark:bg-red-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                <span className="text-[10px] font-bold text-red-500">DBG</span>
              </button>
            )}
            <button type="button" onClick={() => setDark(d => !d)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                dark ? 'bg-blue-950 text-amber-300 ring-1 ring-blue-800' : 'bg-gray-100 text-slate-600 hover:bg-gray-200'
              }`}
              title={themeToggleLabel}
              aria-label={themeToggleLabel}>
              {dark ? <SunMedium size={16} /> : <MoonStar size={16} />}
            </button>
            <div className="relative" data-user-menu>
              <button
                type="button"
                onClick={() => setUserMenuOpen(open => !open)}
                title="Menu do usuário"
                className={`min-w-0 rounded-full pl-2 pr-3 py-1.5 flex items-center gap-2 transition-colors border ${
                  userMenuOpen
                    ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                    : 'border-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
                aria-label="Menu do usuário"
              >
                <span className="relative flex h-8 w-8 overflow-hidden rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={nomeDisplay} className="h-full w-full object-cover" />
                  ) : (
                    <span className="m-auto text-xs font-bold">{userInitials}</span>
                  )}
                </span>
                <span className="hidden lg:flex min-w-0 flex-col items-start leading-tight">
                  <span className="max-w-[160px] truncate text-sm font-semibold">{nomeDisplay}</span>
                  {perfilLabel && <span className="max-w-[160px] truncate text-[11px] text-gray-400 dark:text-gray-500">{perfilLabel}</span>}
                </span>
                <UserCog size={15} className="hidden sm:block opacity-70" />
              </button>
              {userMenuOpen && createPortal(
                <div className="fixed right-5 top-16 z-[2147483647] w-72 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-4 dark:border-gray-800">
                    <span className="relative flex h-12 w-12 overflow-hidden rounded-2xl bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100">
                      {avatarUrl ? (
                        <img src={avatarUrl} alt={nomeDisplay} className="h-full w-full object-cover" />
                      ) : (
                        <span className="m-auto text-sm font-bold">{userInitials}</span>
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{nomeDisplay}</p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setUserMenuOpen(false); handleNavigate('configuracoes') }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Settings size={16} className="text-gray-400" />
                    Configurações do usuário
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUserMenuOpen(false); handleNavigate('configuracoes') }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <Camera size={16} className="text-gray-400" />
                    Foto de perfil
                  </button>
                  <button
                    type="button"
                    onClick={() => setDark(prev => !prev)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {dark ? <SunMedium size={16} className="text-amber-500" /> : <MoonStar size={16} className="text-slate-500" />}
                    {dark ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setUserMenuOpen(false); void signOut() }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <LogOut size={16} />
                    Sair
                  </button>
                </div>,
                document.body,
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Suspense fallback={<PageLoader />}>
            {activePage === 'portal'        && <PortalCliente />}
            {activePage === 'dashboard'     && <Dashboard />}
            {activePage === 'comercial'     && <Comercial />}
            {activePage === 'clientes'      && <Clientes />}
            {activePage === 'chat'          && <ChatAoVivo />}
            {activePage === 'engage'        && <Engage />}
            {activePage === 'renovacoes'    && <Renovacoes />}
            {activePage === 'financeiro'    && <Financeiro />}
            {activePage === 'relatorios'    && <Relatorios />}
            {activePage === 'parceiros'     && <Parceiros />}
            {activePage === 'configuracoes' && <Configuracoes />}
            {activePage === 'catalogo_ia'   && <CatalogoIA />}
          </Suspense>
        </main>
      </div>

      <Suspense fallback={null}>
        {debugOpen  && <DebugPanel onClose={() => setDebugOpen(false)} />}
      </Suspense>
    </div>
  )
}

function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-950 via-gray-900 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl shadow-black/40 p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Configuração pendente</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{message}</p>
      </div>
    </div>
  )
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false, message: 'Falha inesperada ao carregar o sistema.' }
  }

  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || 'Falha inesperada ao carregar o sistema.',
    }
  }

  override componentDidCatch(error: Error) {
    // Mantemos a tela de erro visível em vez de deixar a interface em branco.
    console.error('AppErrorBoundary', error)
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-blue-950 via-gray-900 to-blue-900 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl shadow-black/40 p-8 text-center">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Sistema indisponível no momento</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 w-full px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
            >
              Recarregar sistema
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default function App() {
  const pathname = window.location.pathname
  const isShopRoute = /^\/shop\/?$/.test(pathname)
  const lojaMatch = pathname.match(/^\/loja\/([^/]+)\/?$/)
  const lojaSlug = lojaMatch?.[1] ? decodeURIComponent(lojaMatch[1]) : null
  const contestacaoMatch = pathname.match(/^\/contestacao\/([^/]+)\/?$/)
  const contestacaoToken = contestacaoMatch?.[1] ? decodeURIComponent(contestacaoMatch[1]) : null
  const runtime = assertRuntimeConfig()
  const clerkPublishableKey = runtime.clerkPublishableKey

  if (isShopRoute) {
    return (
      <Suspense fallback={<FullScreenLoader message="Carregando checkout..." />}>
        <MarketplaceLoja />
      </Suspense>
    )
  }

  if (lojaSlug) {
    return (
      <Suspense fallback={<FullScreenLoader message="Carregando checkout..." />}>
        <MarketplaceLoja slug={lojaSlug} />
      </Suspense>
    )
  }

  if (contestacaoToken) {
    return (
      <Suspense fallback={<FullScreenLoader message="Carregando contestação..." />}>
        <ContestacaoAssinatura token={contestacaoToken} />
      </Suspense>
    )
  }

  if (!clerkPublishableKey) {
    return <ConfigErrorScreen message="VITE_CLERK_PUBLISHABLE_KEY precisa estar configurada para acessar o painel administrativo." />
  }

  return (
    <ClerkProvider publishableKey={clerkPublishableKey} localization={ptBR}>
      <AuthProvider>
        <PermissionsProvider>
          <AppErrorBoundary>
            <AppContent />
          </AppErrorBoundary>
        </PermissionsProvider>
      </AuthProvider>
    </ClerkProvider>
  )
}

