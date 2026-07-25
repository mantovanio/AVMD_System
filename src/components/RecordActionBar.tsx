import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ActionBarAction {
  key: string
  icon: ReactNode
  label: string
  tooltip?: string
  onClick: () => void
  variant?: 'default' | 'blue' | 'green' | 'amber' | 'purple' | 'red'
  disabled?: boolean
  hidden?: boolean
}

interface RecordActionBarProps {
  recordName: string
  recordBadge?: ReactNode
  actions: ActionBarAction[]
  onClose: () => void
  className?: string
  children?: ReactNode
}

const variantClasses: Record<string, string> = {
  default: 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800',
  blue: 'border-blue-200 dark:border-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/10',
  green: 'border-green-200 dark:border-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-50 dark:hover:bg-green-900/10',
  amber: 'border-amber-200 dark:border-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/10',
  purple: 'border-purple-200 dark:border-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/10',
  red: 'border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/10',
}

export function RecordActionBar({ recordName, recordBadge, actions, onClose, className, children }: RecordActionBarProps) {
  const visibleActions = actions.filter(a => !a.hidden)

  return (
    <div className={cn(
      'sticky top-0 z-50 rounded-2xl border border-blue-200/80 dark:border-blue-900/30 bg-gradient-to-r from-white via-blue-50/80 to-white dark:from-gray-900 dark:via-blue-950/25 dark:to-gray-900 backdrop-blur-md shadow-[0_14px_36px_rgba(15,23,42,0.10)]',
      'px-4 py-4 flex items-center gap-3 flex-wrap sm:px-5 sm:py-4 sm:gap-4',
      className,
    )}>
      <div className="flex items-center gap-2.5 min-w-0 shrink-0">
        <div className="flex flex-col min-w-0">
          <span className="text-xs uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400 font-semibold">
            Operação selecionada
          </span>
          <span className="text-base sm:text-lg font-bold text-gray-950 dark:text-gray-50 truncate max-w-[160px] sm:max-w-[240px]">
            {recordName}
          </span>
        </div>
        {recordBadge}
      </div>

      <div className="hidden w-px h-8 bg-blue-200 dark:bg-blue-900/40 shrink-0 sm:block" />

      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
        {visibleActions.map(action => (
          <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              disabled={action.disabled}
              title={action.tooltip ?? action.label}
              className={cn(
              'inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-sm font-medium transition-colors shadow-sm',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              variantClasses[action.variant ?? 'default'],
              )}
            >
            {action.icon}
            <span className="hidden md:inline">{action.label}</span>
          </button>
        ))}
        {children}
      </div>

      <button
        type="button"
        onClick={onClose}
        title="Fechar barra de ações"
        className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-blue-200/70 text-blue-500 hover:bg-blue-100 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20 transition-colors"
      >
        <X size={15} />
      </button>
    </div>
  )
}
