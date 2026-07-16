import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FlowModalProps {
  open: boolean
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  className?: string
  contentClassName?: string
}

export function FlowModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  className,
  contentClassName,
}: FlowModalProps) {
  if (!open) return null

  return (
    <div className={cn('fixed inset-0 z-[9999] flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4 sm:p-6', className)}>
      <div className={cn('w-full max-w-6xl my-auto overflow-hidden rounded-[28px] bg-white shadow-2xl', contentClassName)}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-[#ea7b18] font-semibold">Checkout guiado</p>
            <h3 className="mt-1 text-xl font-semibold text-slate-900">{title}</h3>
            {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 hover:bg-slate-50"
            aria-label="Fechar modal"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
