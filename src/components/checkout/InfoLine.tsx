import { cn } from '@/lib/utils'

interface InfoLineProps {
  label: string
  value: string
  tone?: 'default' | 'warn'
}

export function InfoLine({ label, value, tone = 'default' }: InfoLineProps) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={cn(
        'font-medium text-right',
        tone === 'warn' ? 'text-amber-700' : 'text-slate-900'
      )}>
        {value}
      </span>
    </div>
  )
}
