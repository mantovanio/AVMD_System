import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ChoiceCardProps {
  label: string
  helper: string
  active: boolean
  onClick: () => void
}

export function ChoiceCard({ label, helper, active, onClick }: ChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full min-h-[96px] rounded-[24px] border px-4 py-4 text-left transition-all',
        active
          ? 'border-[#ea7b18] bg-[#fff8f1] ring-2 ring-[#fde4cf]'
          : 'border-slate-200 bg-white hover:border-slate-300'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 break-words">{label}</p>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed break-words">{helper}</p>
        </div>
        {active && <CheckCircle2 size={18} className="text-[#ea7b18] shrink-0" />}
      </div>
    </button>
  )
}
