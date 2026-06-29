import type { ReactNode } from 'react'
import { Building2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SectionCardProps {
  title: string
  description: string
  icon: typeof Building2
  children: ReactNode
  highlight?: boolean
  done?: boolean
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  children,
  highlight = false,
  done = false,
}: SectionCardProps) {
  return (
    <section className={cn(
      'rounded-[30px] border bg-white p-5 sm:p-6 shadow-sm',
      highlight ? 'border-[#17346b] ring-2 ring-sky-100' : 'border-slate-200',
      done && !highlight ? 'shadow-[0_10px_40px_-28px_rgba(22,163,74,0.55)]' : ''
    )}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-11 h-11 rounded-2xl flex items-center justify-center shrink-0',
            highlight ? 'bg-sky-100 text-[#17346b]' : 'bg-slate-100 text-slate-700'
          )}>
            <Icon size={18} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500 mt-2 leading-relaxed">{description}</p>
          </div>
        </div>
        {done && (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
            <CheckCircle2 size={14} />
            Etapa revisada
          </span>
        )}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}
