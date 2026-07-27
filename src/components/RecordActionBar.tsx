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
  group?: string
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
  red: 'border-red-500 bg-red-600 text-white hover:bg-red-500 hover:border-red-500 dark:border-red-500 dark:bg-red-600 dark:text-white dark:hover:bg-red-500',
}

export function RecordActionBar({ recordName, recordBadge, actions, onClose, className, children }: RecordActionBarProps) {
  const visibleActions = actions.filter(a => !a.hidden)
  const groupLabel: Record<string, string> = {
    status: 'Status',
    cadastro: 'Cadastro',
    comunicacao: 'Comunicação',
    comercial: 'Comercial',
    automacao: 'Automação',
    admin: 'Admin',
  }
  const grouped: Array<{ group?: string; items: ActionBarAction[] }> = []
  for (const action of visibleActions) {
    const current = grouped[grouped.length - 1]
    if (!current || current.group !== action.group) {
      grouped.push({ group: action.group, items: [action] })
    } else {
      current.items.push(action)
    }
  }

  return (
    <div className={cn(
      'sticky top-0 z-50 rounded-2xl border border-blue-200/80 dark:border-blue-900/30 bg-gradient-to-r from-white via-blue-50/80 to-white dark:from-gray-900 dark:via-blue-950/25 dark:to-gray-900 backdrop-blur-md shadow-[0_14px_36px_rgba(15,23,42,0.10)]',
      'px-3 py-3 flex items-start gap-3 flex-wrap sm:px-5 sm:py-4 sm:gap-4',
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

      <div className="flex flex-col gap-2 flex-1 min-w-0">
        {grouped.map(group => (
          <div key={group.group ?? `group-${group.items[0]?.key}`} className="flex flex-wrap items-center gap-2">
            {group.group && (
              <span className="mr-1 inline-flex items-center rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-600 dark:border-blue-900/40 dark:bg-gray-950 dark:text-blue-400">
                {groupLabel[group.group] ?? group.group}
              </span>
            )}
            {group.items.map(action => (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                title={action.tooltip ?? action.label}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors shadow-sm',
                  'sm:px-3.5 sm:py-2 sm:gap-2 sm:text-sm',
                  'disabled:opacity-40 disabled:cursor-not-allowed',
                  variantClasses[action.variant ?? 'default'],
                )}
              >
                {action.icon}
                <span className="hidden sm:inline">{action.label}</span>
              </button>
            ))}
          </div>
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
