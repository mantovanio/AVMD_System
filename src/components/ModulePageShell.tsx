import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

type ModuleTabIcon = ComponentType<{ size?: number; className?: string }>

export type ModulePageShellTab<T extends string> = {
  id: T
  label: string
  icon?: ModuleTabIcon
}

interface ModulePageShellProps<T extends string> {
  tabs: ModulePageShellTab<T>[]
  activeTab: T
  onTabChange: (tab: T) => void
  storageKey: string
  children: ReactNode
  menuLabel?: string
}

export default function ModulePageShell<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  children,
  menuLabel = 'Submenu do módulo',
}: ModulePageShellProps<T>) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    if (menuOpen) window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen])

  useEffect(() => {
    function handleTabNav(e: Event) {
      const detail = (e as CustomEvent).detail as { tab: string } | undefined
      if (detail?.tab) {
        const match = tabs.find(t => t.id === detail.tab)
        if (match) onTabChange(match.id)
      }
    }
    window.addEventListener('crm:navigate-tab', handleTabNav)
    return () => window.removeEventListener('crm:navigate-tab', handleTabNav)
  }, [tabs, onTabChange])

  const activeTabLabel = tabs.find(tab => tab.id === activeTab)?.label ?? 'Seção'

  function handleTabClick(tab: T) {
    onTabChange(tab)
    setMenuOpen(false)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen(prev => !prev)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
              title="Abrir seções"
            >
              <Menu size={18} />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMenuOpen(false)} />
                <div className={cn(
                  'z-50 w-56 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900',
                  'fixed md:absolute',
                  'bottom-0 left-0 right-0 md:bottom-auto md:left-0 md:right-auto md:top-full md:mt-2',
                  'rounded-b-none md:rounded-b-xl',
                )}>
                  <div className="max-h-80 overflow-y-auto p-1">
                    {tabs.map(({ id, label, icon: Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleTabClick(id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all',
                          activeTab === id
                            ? 'bg-blue-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white',
                        )}
                      >
                        {Icon && <Icon size={17} className="shrink-0" />}
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
              {menuLabel}
            </p>
            <h1 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{activeTabLabel}</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
        {children}
      </div>
    </div>
  )
}
