import { useState, useEffect, useRef } from 'react'
import { X, Trash2, RefreshCw, Copy } from 'lucide-react'
import { logger, type LogEntry, type LogLevel } from '@/lib/logger'
import { cn } from '@/lib/utils'

const LEVEL_COLOR: Record<LogLevel, string> = {
  info:  'text-green-600 dark:text-green-400',
  warn:  'text-amber-500 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
}

const ROW_BG: Record<LogLevel, string> = {
  info:  '',
  warn:  'bg-amber-50/60 dark:bg-amber-900/10',
  error: 'bg-red-50/60 dark:bg-red-900/10',
}

type Filter = 'all' | 'warn' | 'error'

export default function DebugPanel({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [filter, setFilter]   = useState<Filter>('all')
  const [paused, setPaused]   = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  function refresh() {
    if (!paused) setEntries(logger.entries())
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 800)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused])

  const visible = entries.filter(e =>
    filter === 'all' ? true :
    filter === 'error' ? e.level === 'error' :
    e.level === 'warn' || e.level === 'error',
  )

  function copyAll() {
    const text = visible
      .map(e => `[${e.ts.toISOString()}] ${e.level.toUpperCase()} [${e.module}] ${e.message}${e.data !== undefined ? '\n  ' + JSON.stringify(e.data) : ''}`)
      .join('\n')
    void navigator.clipboard.writeText(text)
  }

  const errorCount = entries.filter(e => e.level === 'error').length
  const warnCount  = entries.filter(e => e.level === 'warn').length

  return (
    <div className="fixed bottom-4 left-4 w-[560px] h-[500px] bg-white dark:bg-gray-950 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col z-50 overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 shrink-0">
        <span className="text-white font-semibold text-sm">🪲 Debug Logs</span>
        <div className="flex gap-1 ml-2">
          {([['all', 'Todos'], ['warn', 'Avisos'], ['error', 'Erros']] as [Filter, string][]).map(([f, label]) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={cn('px-2 py-0.5 rounded text-xs font-medium transition-colors',
                filter === f ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white')}>
              {label}
              {f === 'error' && errorCount > 0 && <span className="ml-1 bg-red-500 text-white rounded-full px-1">{errorCount}</span>}
              {f === 'warn'  && warnCount  > 0 && <span className="ml-1 bg-amber-500 text-white rounded-full px-1">{warnCount}</span>}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button type="button" onClick={() => setPaused(p => !p)} title={paused ? 'Retomar' : 'Pausar'}
          className={cn('text-xs px-2 py-0.5 rounded transition-colors', paused ? 'bg-amber-500 text-white' : 'text-gray-400 hover:text-white')}>
          {paused ? '▶ Play' : '⏸ Pause'}
        </button>
        <button type="button" onClick={copyAll} title="Copiar tudo" className="text-gray-400 hover:text-white ml-1">
          <Copy size={13} />
        </button>
        <button type="button" onClick={() => { logger.clear(); refresh() }} title="Limpar" className="text-gray-400 hover:text-white">
          <Trash2 size={13} />
        </button>
        <button type="button" onClick={() => { setPaused(false); refresh() }} title="Atualizar" className="text-gray-400 hover:text-white">
          <RefreshCw size={13} />
        </button>
        <button type="button" onClick={onClose} title="Fechar" className="text-gray-400 hover:text-white ml-1">
          <X size={15} />
        </button>
      </div>

      {/* Log list */}
      <div className="flex-1 overflow-y-auto font-mono text-[11px]">
        {visible.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Nenhum log registrado.
          </div>
        )}
        {visible.map(e => (
          <div key={e.id} className={cn('px-3 py-1 border-b border-gray-100 dark:border-gray-800/60', ROW_BG[e.level])}>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <span className="text-gray-400 shrink-0">{e.ts.toLocaleTimeString('pt-BR', { hour12: false })}</span>
              <span className={cn('font-bold shrink-0 w-10', LEVEL_COLOR[e.level])}>{e.level.toUpperCase()}</span>
              <span className="text-blue-500 dark:text-blue-400 shrink-0">[{e.module}]</span>
              <span className="text-gray-800 dark:text-gray-200 break-all">{e.message}</span>
            </div>
            {e.data !== undefined && (
              <div className="ml-[104px] mt-0.5 text-gray-500 dark:text-gray-400 break-all whitespace-pre-wrap">
                {typeof e.data === 'string' ? e.data : JSON.stringify(e.data, null, 2)}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 text-[10px] text-gray-400 shrink-0 flex items-center gap-3">
        <span>{entries.length} entradas</span>
        <span>·</span>
        <code>window.__certiidLogs</code>
        <span className="ml-auto">{paused ? '⏸ pausado' : '● ao vivo'}</span>
      </div>
    </div>
  )
}
