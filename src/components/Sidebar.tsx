import { useState } from 'react'
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

const GROUP_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  operacao:       LayoutDashboard,
  relacionamento: MessageSquare,
  gestao:         DollarSign,
  sistema:        Settings,
}

function SubmenuPanel({
  group,
  activePage,
  onNavigate,
  onClose,
}: {
  group: SidebarGroup
  activePage: Page
  onNavigate: (page: Page) => void
  onClose: () => void
}) {
  return (
    <div className="w-52 flex flex-col py-4 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
      <div className="flex items-center justify-between px-4 mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{group.label}</h3>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Fechar"
        >
          <ChevronLeft size={16} />
        </button>
      </div>
      <nav className="flex-1 px-2 space-y-1 overflow-y-auto">
        {group.items.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => { onNavigate(id) }}
            type="button"
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm font-medium text-left',
              activePage === id
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200',
            )}
          >
            <Icon size={18} className="shrink-0" />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function IconRail({
  groups,
  activeGroup,
  onGroupClick,
  onLogout,
  onMobileClose,
  agencyConfig,
}: {
  groups: SidebarGroup[]
  activeGroup: string | null
  onGroupClick: (id: string) => void
  onLogout?: () => void
  onMobileClose?: () => void
  agencyConfig?: AgencyConfig
}) {
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

      <nav className="flex flex-col flex-1 px-2 overflow-y-auto space-y-1">
        {groups.map(group => {
          const Icon = GROUP_ICONS[group.id] ?? LayoutDashboard
          const isActive = activeGroup === group.id
          return (
            <button
              key={group.id}
              onClick={() => onGroupClick(group.id)}
              type="button"
              title={group.label}
              className={cn(
                'flex items-center justify-center w-12 h-12 rounded-xl transition-colors mx-auto',
                isActive
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                  : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300',
              )}
            >
              <Icon size={20} />
            </button>
          )
        })}
      </nav>

      <div className="px-2">
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
            const GroupIcon = GROUP_ICONS[group.id]
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => setExpandedGroup(isExpanded ? null : group.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  {GroupIcon && <GroupIcon size={18} />}
                  <span>{group.label}</span>
                  <ChevronLeft size={14} className={cn('ml-auto transition-transform', isExpanded && '-rotate-90')} />
                </button>
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
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null)

  const groups = MENU_GROUPS
    .map(group => ({
      ...group,
      items: allowedPages
        ? group.items.filter(item => allowedPages.includes(item.id))
        : group.items,
    }))
    .filter(group => group.items.length > 0)

  const expandedGroupData = expandedGroup ? groups.find(g => g.id === expandedGroup) ?? null : null

  function handleGroupClick(groupId: string) {
    setExpandedGroup(prev => prev === groupId ? null : groupId)
  }

  function handleNavigate(page: Page) {
    onNavigate(page)
  }

  return (
    <>
      {/* Desktop sidebar layout */}
      <div className="hidden md:flex">
        <IconRail
          groups={groups}
          activeGroup={expandedGroup}
          onGroupClick={handleGroupClick}
          onLogout={onLogout}
          agencyConfig={agencyConfig}
        />
        {expandedGroupData && (
          <SubmenuPanel
            group={expandedGroupData}
            activePage={activePage}
            onNavigate={handleNavigate}
            onClose={() => setExpandedGroup(null)}
          />
        )}
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <MobileDrawer
          groups={groups}
          activePage={activePage}
          onNavigate={handleNavigate}
          onLogout={onLogout}
          onClose={onMobileClose ?? (() => {})}
          agencyConfig={agencyConfig}
        />
      )}
    </>
  )
}
