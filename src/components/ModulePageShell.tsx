import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
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
  storageKey,
  children,
  menuLabel = 'Submenu do módulo',
}: ModulePageShellProps<T>) {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem(storageKey)
    if (saved === '1') setIsOpen(true)
  }, [storageKey])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(storageKey, isOpen ? '1' : '0')
  }, [isOpen, storageKey])

  const activeTabLabel = tabs.find(tab => tab.id === activeTab)?.label ?? 'Seção'

  function handleTabChange(tab: T) {
    onTabChange(tab)
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsOpen(false)
    }
  }

  return (
    <div className="relative flex h-full min-h-0 bg-slate-50/40 dark:bg-gray-950">
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/35 backdrop-blur-[1px] md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 dark:border-gray-800 dark:bg-gray-900 md:static md:z-auto md:max-w-none md:shadow-none',
          isOpen ? 'translate-x-0' : '-translate-x-full md:w-0 md:min-w-0 md:translate-x-0 md:overflow-hidden md:border-r-0',
        )}
      >
        <div className="flex h-full w-72 max-w-[85vw] flex-col md:max-w-none">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-gray-800">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-gray-500">
                {menuLabel}
              </p>
              <h2 className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">Navegação</h2>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
              title="Ocultar submenu"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => handleTabChange(id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium transition-all',
                  activeTab === id
                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white',
                )}
              >
                {Icon && <Icon size={17} className="shrink-0" />}
                <span className="leading-5">{label}</span>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsOpen(current => !current)}
              className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
              title={isOpen ? 'Ocultar submenu' : 'Mostrar submenu'}
            >
              {isOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>

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
    </div>
  )
}
