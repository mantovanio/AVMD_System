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
      'sticky top-0 z-20 border-b border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm',
      'px-3 py-2.5 flex items-center gap-2 flex-wrap sm:px-4 sm:gap-3',
      className,
    )}>
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate max-w-[140px] sm:max-w-[200px]">
          {recordName}
        </span>
        {recordBadge}
      </div>

      <div className="hidden w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0 sm:block" />

      <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
        {visibleActions.map(action => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.tooltip ?? action.label}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors',
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
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  )
}
