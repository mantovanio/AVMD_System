import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { ClerkProvider } from '@clerk/clerk-react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import Sidebar, { type Page } from '@/components/Sidebar'
import NotificationBell from '@/components/NotificationBell'
import { useNotifications } from '@/hooks/useNotifications'
import { Menu } from 'lucide-react'
import { APP_VERSION } from '@/lib/version'
import { DEFAULT_AGENCY_CONFIG, fetchAgencyConfig } from '@/lib/agencyConfig'
import { PAGE_LABELS, PERFIL_LABEL, isAdminProfile, resolveAllowedPages as resolveLegacyPages, resolveDefaultPage } from '@/lib/security'
import { PermissionsProvider, usePermissions } from '@/contexts/PermissionsContext'
import { getRuntimeConfig } from '@/lib/runtimeConfig'

const Login = lazy(() => import('@/pages/Login'))
const PortalCliente = lazy(() => import('@/pages/PortalCliente'))
const UpdatePassword = lazy(() => import('@/pages/UpdatePassword'))
const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Comercial = lazy(() => import('@/pages/Comercial'))
const Clientes = lazy(() => import('@/pages/Clientes'))
const ChatAoVivo = lazy(() => import('@/pages/ChatInboxCRM'))
const Renovacoes = lazy(() => import('@/pages/Renovacoes'))
const Financeiro = lazy(() => import('@/pages/Financeiro'))
const Relatorios = lazy(() => import('@/pages/Relatorios'))
const Parceiros = lazy(() => import('@/pages/Parceiros'))
const Configuracoes = lazy(() => import('@/pages/Configuracoes'))
const CatalogoIA = lazy(() => import('@/pages/CatalogoIA'))
const MarketplaceLoja = lazy(() => import('@/pages/MarketplaceLoja'))
const ContestacaoAssinatura = lazy(() => import('@/pages/ContestacaoAssinatura'))
const ClaudeChat = lazy(() => import('@/components/ClaudeChat'))
const DebugPanel = lazy(() => import('@/components/DebugPanel'))

// ── Módulo → páginas controladas ───────────────────────────────
const MODULE_PAGE_MAP: Partial<Record<string, Page[]>> = {
  crm:          ['dashboard', 'comercial', 'clientes', 'renovacoes', 'parceiros', 'relatorios', 'financeiro', 'catalogo_ia'],
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
  const [claudeOpen, setClaudeOpen]     = useState(false)
  const [debugOpen,  setDebugOpen]      = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Permissões por módulo — carregadas do backend
  const { loading: permLoading, resolveAllowedPages: resolveModulePages } = usePermissions()

  // Módulos habilitados — fallback via Supabase
  const [enabledModules, setEnabledModules] = useState<Record<string, boolean>>({})
  const [modulesLoaded, setModulesLoaded]   = useState(false)

  const isAdmin = isAdminProfile(profile)
  const { notifications } = useNotifications(isAdmin)

  // Tema escuro
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

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
    fetch(`${origin}/api/permissoes/modules-config`)
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setEnabledModules(data.config ?? {})
        }
        setModulesLoaded(true)
      })
      .catch(() => setModulesLoaded(true))
  }, [user])

  // Splash de carregamento
  if (loading || (user && !modulesLoaded && !permLoading)) {
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
        <header className="h-14 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMobileNavOpen(true)}
              className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <Menu size={18} />
            </button>
            {agencyConfig.logo_interna_url?.trim() ? (
              <img src={agencyConfig.logo_interna_url} alt={agencyConfig.nome_agencia} className="h-7 w-auto object-contain" />
            ) : null}
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {PAGE_LABELS[activePage]}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 leading-none">{nomeDisplay}</p>
              {perfilLabel && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{perfilLabel} — {agencyConfig.nome_agencia}</p>
              )}
            </div>
            <span className="hidden md:inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
              v{APP_VERSION}
            </span>
            <NotificationBell notifications={notifications} onNavigate={handleNavigate} />
            {isAdmin && (
              <button type="button" onClick={() => setDebugOpen(o => !o)} title="Debug logs"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors text-sm ${debugOpen ? 'bg-red-100 dark:bg-red-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                🪲
              </button>
            )}
            <button type="button" onClick={() => setClaudeOpen(o => !o)} title="Chat com Claude"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${claudeOpen ? 'bg-orange-100 dark:bg-orange-900/30' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
              <ClaudeBadge />
            </button>
            <button type="button" onClick={() => setDark(d => !d)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title={dark ? 'Modo claro' : 'Modo escuro'}>
              {dark ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Suspense fallback={<PageLoader />}>
            {activePage === 'portal'        && <PortalCliente />}
            {activePage === 'dashboard'     && <Dashboard />}
            {activePage === 'comercial'     && <Comercial />}
            {activePage === 'clientes'      && <Clientes />}
            {activePage === 'chat'          && <ChatAoVivo />}
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
        {claudeOpen && <ClaudeChat onClose={() => setClaudeOpen(false)} />}
        {debugOpen  && <DebugPanel onClose={() => setDebugOpen(false)} />}
      </Suspense>
    </div>
  )
}

function ClaudeBadge() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.74 4.5C8.97 4.5 8.32 4.98 8.07 5.67L4.55 15.5C4.22 16.4 4.88 17.35 5.83 17.35H7.05L8.26 13.97H12.5L11.89 12.25H8.85L10.32 8.05L13.56 17.35H15.28L11.57 6.2C11.32 5.47 10.65 4.97 9.87 4.97L9.74 4.5Z" fill="#CC785C" />
      <path d="M14.13 4.5L17.86 14.95C18.09 15.6 18.09 16.31 17.86 16.96L17.5 18C17.25 18.7 16.59 19.16 15.83 19.16H14.72L13.5 15.67H9.26L9.87 17.35H13L14.21 20.5H16.05C17.43 20.5 18.67 19.63 19.13 18.31L19.5 17.25C19.91 16.11 19.91 14.85 19.5 13.71L15.77 3.27C15.53 2.6 14.89 2.16 14.17 2.16H12.45L14.13 4.5Z" fill="#CC785C" />
    </svg>
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
  const runtime = getRuntimeConfig()

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

  if (!runtime.clerkPublishableKey) {
    return <ConfigErrorScreen message="VITE_CLERK_PUBLISHABLE_KEY precisa estar configurada para acessar o painel administrativo." />
  }

  return (
    <ClerkProvider publishableKey={runtime.clerkPublishableKey}>
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

