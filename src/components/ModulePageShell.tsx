import { useEffect, type ComponentType, type ReactNode } from 'react'
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
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:px-6">
        <div className="space-y-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
              {menuLabel}
            </p>
            <h1 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{activeTabLabel}</h1>
          </div>

          <div className="-mx-1 flex flex-wrap gap-2">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleTabClick(id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-all',
                  activeTab === id
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white',
                )}
              >
                {Icon && <Icon size={16} className="shrink-0" />}
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
        {children}
      </div>
    </div>
  )
}
