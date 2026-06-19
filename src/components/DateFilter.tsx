import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { DateFilterOption, DateRange } from '@/types'

interface Props {
  value: DateFilterOption
  onChange: (option: DateFilterOption, range: DateRange) => void
}

const OPTIONS: { id: DateFilterOption; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'ontem', label: 'Ontem' },
  { id: '7dias', label: 'Últimos 7 dias' },
  { id: 'este_mes', label: 'Este mês' },
  { id: 'mes_passado', label: 'Mês passado' },
  { id: '3meses', label: '3 meses' },
  { id: 'personalizado', label: '📅 Personalizado' },
]

export function buildRange(option: DateFilterOption): DateRange {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)

  switch (option) {
    case 'hoje':
      return { from: today, to: tomorrow }
    case 'ontem': {
      const y = new Date(today); y.setDate(y.getDate() - 1)
      return { from: y, to: today }
    }
    case '7dias': {
      const s = new Date(today); s.setDate(s.getDate() - 6)
      return { from: s, to: tomorrow }
    }
    case 'este_mes': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: s, to: tomorrow }
    }
    case 'mes_passado': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const e = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: s, to: e }
    }
    case '3meses': {
      const s = new Date(today); s.setMonth(s.getMonth() - 3)
      return { from: s, to: tomorrow }
    }
    default:
      return { from: today, to: tomorrow }
  }
}

export default function DateFilter({ value, onChange }: Props) {
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  function handleSelect(opt: DateFilterOption) {
    if (opt !== 'personalizado') {
      onChange(opt, buildRange(opt))
    } else {
      onChange(opt, buildRange('hoje'))
    }
  }

  function applyCustom() {
    if (!customFrom || !customTo) return
    onChange('personalizado', { from: new Date(customFrom), to: new Date(customTo + 'T23:59:59') })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-6 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      {OPTIONS.map(opt => (
        <button
          key={opt.id}
          onClick={() => handleSelect(opt.id)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
            value === opt.id
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
          )}
        >
          {opt.label}
        </button>
      ))}
      {value === 'personalizado' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customFrom}
            onChange={e => setCustomFrom(e.target.value)}
            className="text-xs border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 bg-white dark:bg-gray-800"
          />
          <span className="text-xs text-gray-400">até</span>
          <input
            type="date"
            value={customTo}
            onChange={e => setCustomTo(e.target.value)}
            className="text-xs border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 bg-white dark:bg-gray-800"
          />
          <button
            onClick={applyCustom}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
