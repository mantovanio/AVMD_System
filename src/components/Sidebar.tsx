import { useState, useRef } from 'react'
import {
  LayoutDashboard,
  ShoppingCart,
  MessageSquare,
  RefreshCw,
  DollarSign,
  BarChart2,
  Users,
  UserSearch,
  Settings,
  LogOut,
  X,
  BookOpen,
  ChevronLeft,
  TrendingUp,
  Calendar,
  CreditCard,
  ShoppingBag,
  Tag,
  Upload,
  Wallet,
  Landmark,
  SplitSquareHorizontal,
  FileText,
  Shield,
  Store,
  Receipt,
  LineChart,
  Globe,
  MousePointerClick,
  Lock,
  Building2,
  ScrollText,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgencyConfig } from '@/lib/agencyConfig'

export type Page =
  | 'dashboard'
  | 'comercial'
  | 'clientes'
  | 'chat'
  | 'renovacoes'
  | 'financeiro'
  | 'relatorios'
  | 'parceiros'
  | 'configuracoes'
  | 'catalogo_ia'

type SubItem = { id: string; label: string; icon?: React.ComponentType<{ size?: number; className?: string }> }

const PAGE_SUB_ITEMS: Partial<Record<Page, SubItem[]>> = {
  comercial: [
    { id: 'vendas',       label: 'Lançar Vendas',    icon: TrendingUp  },
    { id: 'agenda',       label: 'Agenda',           icon: Calendar    },
    { id: 'pagamento',    label: 'Pagamentos',       icon: CreditCard  },
    { id: 'certificados', label: 'Certificados',     icon: ShoppingBag },
    { id: 'tabelas',      label: 'Tabelas de Preço', icon: Tag         },
    { id: 'comissoes',    label: 'Comissões',        icon: TrendingUp  },
    { id: 'importar',     label: 'Importações',      icon: Upload      },
  ],
  financeiro: [
    { id: 'pagarReceber', label: 'Pagar / Receber',  icon: Wallet           },
    { id: 'contas',       label: 'Contas Bancárias', icon: Landmark         },
    { id: 'centros',      label: 'Centro de Custos', icon: Building2        },
    { id: 'comissoes',    label: 'Comissões',        icon: TrendingUp       },
    { id: 'split',        label: 'Extrato Split',    icon: SplitSquareHorizontal },
    { id: 'fiscal',       label: 'Fiscal',           icon: Receipt          },
  ],
  configuracoes: [
    { id: 'geral',        label: 'Geral',                  icon: Settings    },
    { id: 'integracoes',  label: 'Integrações',            icon: Globe       },
    { id: 'automacoes',   label: 'Automações',             icon: MousePointerClick },
    { id: 'usuarios',     label: 'Usuários',               icon: Users       },
    { id: 'permissoes',   label: 'Permissões',             icon: Lock        },
    { id: 'pontos',       label: 'Pontos de Atendimento',  icon: Store       },
    { id: 'pagamentos',   label: 'Pagamentos',             icon: CreditCard  },
    { id: 'fiscal',       label: 'Fiscal / NFS-e',         icon: ScrollText  },
    { id: 'privacidade',  label: 'Privacidade (LGPD)',     icon: Shield      },
  ],
}

interface Props {
  activePage:   Page
  onNavigate:   (page: Page) => void
  allowedPages?: Page[]
  onLogout?:    () => void
  agencyConfig?: AgencyConfig
  mobileOpen?:  boolean
  onMobileClose?: () => void
}

type SidebarItem = { id: Page; icon: React.ComponentType<{ size?: number; className?: string }>; label: string }
type SidebarGroup = { id: string; label: string; items: SidebarItem[] }

const MENU_GROUPS: SidebarGroup[] = [
  {
    id: 'operacao',
    label: 'Operação',
    items: [
      { id: 'dashboard',  icon: LayoutDashboard, label: 'Dashboard'  },
      { id: 'comercial',  icon: ShoppingCart,    label: 'Comercial'  },
      { id: 'renovacoes', icon: RefreshCw,       label: 'Renovações' },
    ],
  },
  {
    id: 'relacionamento',
    label: 'Relacionamento',
    items: [
      { id: 'clientes',   icon: UserSearch,      label: 'Clientes'     },
      { id: 'chat',       icon: MessageSquare,   label: 'Chat ao Vivo' },
      { id: 'parceiros',  icon: Users,           label: 'Parceiros'    },
    ],
  },
  {
    id: 'gestao',
    label: 'Gestão',
    items: [
      { id: 'financeiro', icon: DollarSign,      label: 'Financeiro' },
      { id: 'relatorios', icon: BarChart2,       label: 'Relatórios' },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    items: [
      { id: 'catalogo_ia',   icon: BookOpen, label: 'Catálogo IA'   },
      { id: 'configuracoes', icon: Settings, label: 'Configurações' },
    ],
  },
]

function IconRail({
  groups,
  activePage,
  onNavigate,
  onLogout,
  onMobileClose,
  agencyConfig,
}: {
  groups: SidebarGroup[]
  activePage: Page
  onNavigate: (page: Page) => void
  onLogout?: () => void
  onMobileClose?: () => void
  agencyConfig?: AgencyConfig
}) {
  const [hoveredPage, setHoveredPage] = useState<Page | null>(null)
  const [flyoutStyle, setFlyoutStyle] = useState<React.CSSProperties | undefined>(undefined)
  const hoverTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)

  function handleFlyoutNavigate(page: Page, tab: string) {
    setHoveredPage(null)
    setFlyoutStyle(undefined)
    clearTimeout(hoverTimeout.current)
    onNavigate(page)
    window.dispatchEvent(new CustomEvent('crm:navigate-tab', { detail: { tab } }))
  }

  function handleMouseEnter(page: Page, e: React.MouseEvent) {
    clearTimeout(hoverTimeout.current)
    const subs = PAGE_SUB_ITEMS[page]
    if (subs && subs.length > 0) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setFlyoutStyle({ left: rect.right + 4, top: rect.top })
      setHoveredPage(page)
    }
  }

  function handleZoneLeave() {
    clearTimeout(hoverTimeout.current)
    hoverTimeout.current = setTimeout(() => {
      setHoveredPage(null)
      setFlyoutStyle(undefined)
    }, 300)
  }

  const hoveredSubs = hoveredPage ? (PAGE_SUB_ITEMS[hoveredPage] ?? null) : null
  const hoveredLabel = hoveredPage ? MENU_GROUPS.flatMap(g => g.items).find(i => i.id === hoveredPage)?.label ?? '' : ''

  return (
    <div className="w-16 flex flex-col py-4 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
      <div className="flex items-center justify-center mb-4">
        {agencyConfig?.logo_interna_url?.trim() ? (
          <div className="w-9 h-9 rounded-xl bg-white border border-gray-200 dark:border-gray-800 flex items-center justify-center p-1.5 overflow-hidden">
            <img src={agencyConfig.logo_interna_url} alt={agencyConfig.nome_agencia} className="w-full h-full object-contain" />
          </div>
        ) : (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-xs"
            style={{ backgroundColor: agencyConfig?.cor_primaria ?? '#2563eb' }}
          >
            ID
          </div>
        )}
        {onMobileClose && (
          <button type="button" onClick={onMobileClose}
            className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0" onMouseLeave={handleZoneLeave}>
        <nav className="flex flex-col flex-1 px-2 overflow-y-auto sidebar-scroll">
          {groups.map((group, groupIndex) => (
            <div key={group.id} className={cn(groupIndex > 0 && 'mt-3 pt-3 border-t border-gray-100 dark:border-gray-800')}>
              <div className="flex flex-col gap-1">
                {group.items.map(({ id, icon: Icon, label }) => (
                  <div
                    key={id}
                    onMouseEnter={e => handleMouseEnter(id, e)}
                  >
                    <button
                      onClick={() => { onNavigate(id); onMobileClose?.() }}
                      type="button"
                      title={label}
                      className={cn(
                        'flex items-center justify-center w-12 h-12 rounded-xl transition-colors mx-auto',
                        activePage === id
                          ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                          : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300',
                      )}
                    >
                      <Icon size={20} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {hoveredPage && hoveredSubs && flyoutStyle && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => { setHoveredPage(null); setFlyoutStyle(undefined); clearTimeout(hoverTimeout.current) }} />
            <div
              onMouseEnter={() => clearTimeout(hoverTimeout.current)}
              className="fixed z-50 w-56 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl"
              style={flyoutStyle}
            >
              <div className="max-h-80 overflow-y-auto p-1.5">
                <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {hoveredLabel}
                </p>
                {hoveredSubs.map(sub => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => handleFlyoutNavigate(hoveredPage, sub.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    {sub.icon && <sub.icon size={16} className="shrink-0 text-gray-400 dark:text-gray-500" />}
                    <span>{sub.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="px-2 pt-3 mt-3 border-t border-gray-100 dark:border-gray-800">
        <button
          type="button"
          title="Sair"
          className="flex items-center justify-center w-12 h-12 rounded-xl text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors mx-auto"
          onClick={onLogout}
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  )
}

function MobileDrawer({
  groups,
  activePage,
  onNavigate,
  onLogout,
  onClose,
  agencyConfig,
}: {
  groups: SidebarGroup[]
  activePage: Page
  onNavigate: (page: Page) => void
  onLogout?: () => void
  onClose: () => void
  agencyConfig?: AgencyConfig
}) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  function GroupButton({ group, isExpanded, onClick }: { group: SidebarGroup; isExpanded: boolean; onClick: () => void }) {
    const FirstIcon = group.items[0]?.icon
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        {FirstIcon && <FirstIcon size={18} />}
        <span>{group.label}</span>
        <ChevronLeft size={14} className={cn('ml-auto transition-transform', isExpanded && '-rotate-90')} />
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="absolute left-0 top-0 bottom-0 w-64 flex flex-col bg-white dark:bg-gray-900 shadow-2xl">
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800">
          <span className="font-semibold text-sm text-gray-900 dark:text-white">Menu</span>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={16} />
          </button>
        </div>
        <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-1">
          {groups.map(group => {
            const isExpanded = expandedGroup === group.id
            return (
              <div key={group.id}>
                <GroupButton group={group} isExpanded={isExpanded} onClick={() => setExpandedGroup(isExpanded ? null : group.id)} />
                {isExpanded && (
                  <div className="ml-4 mt-1 space-y-1">
                    {group.items.map(({ id, icon: Icon, label }) => (
                      <button
                        key={id}
                        onClick={() => { onNavigate(id); onClose() }}
                        type="button"
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                          activePage === id
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                            : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800',
                        )}
                      >
                        <Icon size={16} />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800">
          {agencyConfig && (
            <p className="text-xs text-gray-400 mb-2 px-3">{agencyConfig.nome_agencia}</p>
          )}
          <button
            type="button"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 w-full transition-colors"
            onClick={onLogout}
          >
            <LogOut size={18} />
            <span>Sair</span>
          </button>
        </div>
      </aside>
    </div>
  )
}

export default function Sidebar({ activePage, onNavigate, allowedPages, onLogout, agencyConfig, mobileOpen, onMobileClose }: Props) {
  const groups = MENU_GROUPS
    .map(group => ({
      ...group,
      items: allowedPages
        ? group.items.filter(item => allowedPages.includes(item.id))
        : group.items,
    }))
    .filter(group => group.items.length > 0)

  return (
    <>
      <aside className="hidden md:flex flex-col shrink-0">
        <IconRail
          groups={groups}
          activePage={activePage}
          onNavigate={onNavigate}
          onLogout={onLogout}
          agencyConfig={agencyConfig}
        />
      </aside>

      {mobileOpen && (
        <MobileDrawer
          groups={groups}
          activePage={activePage}
          onNavigate={onNavigate}
          onLogout={onLogout}
          onClose={onMobileClose ?? (() => {})}
          agencyConfig={agencyConfig}
        />
      )}
    </>
  )
}
