import { useState } from 'react'
import {
  LayoutDashboard,
  ShoppingCart,
  MessageSquare,
  Megaphone,
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
  PanelLeftClose,
  PanelLeftOpen,
  UserCog,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgencyConfig } from '@/lib/agencyConfig'

export type Page =
  | 'portal'
  | 'dashboard'
  | 'comercial'
  | 'clientes'
  | 'chat'
  | 'engage'
  | 'renovacoes'
  | 'financeiro'
  | 'relatorios'
  | 'parceiros'
  | 'configuracoes'
  | 'catalogo_ia'

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
      { id: 'engage',     icon: Megaphone,       label: 'Engage'       },
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
  agencyConfig,
  expanded,
  onToggle,
}: {
  groups: SidebarGroup[]
  activePage: Page
  onNavigate: (page: Page) => void
  onLogout?: () => void
  agencyConfig?: AgencyConfig
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className={cn(
      'relative flex flex-col py-4 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0 transition-[width] duration-200',
      expanded ? 'w-64' : 'w-16',
    )}>
      <div className={cn('flex items-center mb-4 px-2', expanded ? 'justify-between' : 'justify-center')}>
        {expanded && (
          <span className="min-w-0 flex-1 px-3 text-sm font-semibold text-gray-700 dark:text-gray-200 truncate">
            {agencyConfig?.nome_agencia ?? 'Menu principal'}
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          title={expanded ? 'Minimizar sidebar' : 'Expandir sidebar'}
          aria-label={expanded ? 'Minimizar sidebar' : 'Expandir sidebar'}
          className={cn(
            'flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 transition-colors',
            expanded ? 'w-9 h-9 shrink-0' : 'w-8 h-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-sm',
          )}
        >
          {expanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={16} />}
        </button>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <nav className="flex flex-col flex-1 px-2 overflow-y-auto sidebar-scroll">
          {groups.map((group, groupIndex) => (
            <div key={group.id} className={cn(groupIndex > 0 && 'mt-3 pt-3 border-t border-gray-100 dark:border-gray-800')}>
              {expanded && (
                <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                  {group.label}
                </p>
              )}
              <div className="flex flex-col gap-1">
                {group.items.map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    onClick={() => onNavigate(id)}
                    type="button"
                    title={label}
                    className={cn(
                      'flex items-center h-12 rounded-xl transition-colors',
                      expanded ? 'w-full gap-3 px-3' : 'justify-center w-12 mx-auto',
                      activePage === id
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                        : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300',
                    )}
                  >
                    <Icon size={20} className="shrink-0" />
                    {expanded && <span className="text-sm font-medium truncate">{label}</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="px-2 pt-3 mt-3 border-t border-gray-100 dark:border-gray-800" />
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
        </div>
      </aside>
    </div>
  )
}

export default function Sidebar({ activePage, onNavigate, allowedPages, onLogout, agencyConfig, mobileOpen, onMobileClose }: Props) {
  const [desktopExpanded, setDesktopExpanded] = useState(false)
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
          expanded={desktopExpanded}
          onToggle={() => setDesktopExpanded(value => !value)}
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
