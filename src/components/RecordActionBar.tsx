import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const groupLabel: Record<string, string> = {
    status: 'Status',
    cadastro: 'Cadastro',
    comunicacao: 'Comunicação',
    comercial: 'Comercial',
    automacao: 'Automação',
    admin: 'Admin',
  }
  const grouped = useMemo(() => {
    const groups: Array<{ group?: string; items: ActionBarAction[] }> = []
    for (const action of visibleActions) {
      const current = groups[groups.length - 1]
      if (!current || current.group !== action.group) {
        groups.push({ group: action.group, items: [action] })
      } else {
        current.items.push(action)
      }
    }
    return groups
  }, [visibleActions])

  return (
    <div className={cn(
      'sticky top-0 z-50 rounded-2xl border border-blue-200/80 dark:border-blue-900/30 bg-gradient-to-r from-white via-blue-50/80 to-white dark:from-gray-900 dark:via-blue-950/25 dark:to-gray-900 backdrop-blur-md shadow-[0_14px_36px_rgba(15,23,42,0.10)]',
      'px-2.5 py-2.5 flex items-start gap-2.5 flex-wrap sm:px-4 sm:py-3 sm:gap-3',
      className,
    )}>
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400 font-semibold">
            Operação selecionada
          </span>
          <span className="text-sm sm:text-base font-bold text-gray-950 dark:text-gray-50 truncate max-w-[150px] sm:max-w-[220px]">
            {recordName}
          </span>
        </div>
        {recordBadge}
      </div>

      <div className="hidden w-px h-7 bg-blue-200 dark:bg-blue-900/40 shrink-0 sm:block" />

      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {grouped.map(group => (
          <div key={group.group ?? `group-${group.items[0]?.key}`} className="flex flex-wrap items-start gap-1.5">
            {group.group && (
              <button
                type="button"
                onClick={() => setOpenGroups(prev => ({ ...prev, [group.group as string]: !prev[group.group as string] }))}
                className="mr-0.5 inline-flex items-center gap-1 rounded-full border border-blue-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-blue-600 dark:border-blue-900/40 dark:bg-gray-950 dark:text-blue-400"
              >
                {groupLabel[group.group] ?? group.group}
                <ChevronDown size={10} className={cn('transition-transform', openGroups[group.group] && 'rotate-180')} />
              </button>
            )}
            {(group.group ? openGroups[group.group] : true) && group.items.map(action => (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                title={action.tooltip ?? action.label}
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-medium transition-colors shadow-sm',
                  'sm:px-3 sm:py-1.75 sm:gap-1.5 sm:text-xs',
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
