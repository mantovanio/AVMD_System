import { type ChangeEvent, type ReactNode } from 'react'
import { Loader2, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface GuidedFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  focused?: boolean
  highlight?: boolean
  error?: string
  helper?: string
  type?: string
  multiline?: boolean
  icon?: typeof Mail
  rightElement?: ReactNode
  loading?: boolean
  loadingLabel?: string
  onFocus?: () => void
  onBlurField?: () => void
  onBlur?: () => void | Promise<void>
}

export function GuidedField({
  id,
  label,
  value,
  onChange,
  focused = false,
  highlight = false,
  error,
  helper,
  type = 'text',
  multiline = false,
  icon: Icon,
  rightElement,
  loading = false,
  loadingLabel = 'Carregando',
  onFocus,
  onBlurField,
  onBlur,
}: GuidedFieldProps) {
  const shared = {
    value,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    onFocus,
    onBlur: () => {
      onBlurField?.()
      void onBlur?.()
    },
    className: cn(
      'w-full rounded-[20px] border px-4 py-3.5 text-sm bg-white outline-none',
      Icon ? 'pl-11' : '',
      rightElement ? 'pr-20' : '',
      error
        ? 'border-red-300 ring-2 ring-red-100'
        : focused
          ? 'border-[#17346b] ring-2 ring-sky-100 shadow-[0_0_0_4px_rgba(59,130,246,0.06)]'
          : highlight
            ? 'border-[#ea7b18] ring-2 ring-[#fde4cf] bg-[#fffdf9]'
            : 'border-slate-200 focus:border-[#17346b] focus:ring-2 focus:ring-sky-100'
    ),
  }

  return (
    <label data-field-anchor={id} className="relative block group">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              <Loader2 size={12} className="animate-spin" />
              {loadingLabel}
            </span>
          )}
          {highlight && !error && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ea7b18]">Preencha aqui</span>
          )}
        </div>
      </div>
      <div className="relative">
        {Icon && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
            <Icon size={16} />
          </span>
        )}
        {rightElement && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightElement}
          </div>
        )}
        {multiline ? (
          <textarea {...shared} rows={4} />
        ) : (
          <input {...shared} type={type} />
        )}
      </div>
      {error ? (
        <p className="mt-1.5 text-sm text-red-600">{error}</p>
      ) : null}
      {!error && helper && (
        <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden max-w-xs rounded-2xl border border-slate-200 bg-slate-900 px-3 py-2 text-xs leading-relaxed text-white shadow-xl group-hover:block group-focus-within:block">
          {helper}
        </div>
      )}
    </label>
  )
}
