import { useRef, useState, useEffect } from 'react'
import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react'
import type { SystemNotification } from '@/hooks/useNotifications'
import type { Page } from '@/components/Sidebar'

interface Props {
  notifications: SystemNotification[]
  onNavigate: (page: Page) => void
}

const TYPE_ICON: Record<SystemNotification['type'], string> = {
  novo_usuario:        '👤',
  mensagem_pendente:   '💬',
  renovacao_vencendo:  '🔄',
}

const MUTE_KEY = 'notification_bell_muted'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60_000)
  if (min < 1)  return 'agora'
  if (min < 60) return `${min}min atrás`
  const h = Math.floor(min / 60)
  if (h < 24)   return `${h}h atrás`
  return `${Math.floor(h / 24)}d atrás`
}

function playChime() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.3)
  } catch {
    // Audio not available
  }
}

export default function NotificationBell({ notifications, onNavigate }: Props) {
  const [open, setOpen] = useState(false)
  const [muted, setMuted] = useState(() => localStorage.getItem(MUTE_KEY) === 'true')
  const prevCountRef = useRef(notifications.length)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Sound on new notification
  useEffect(() => {
    const prev = prevCountRef.current
    prevCountRef.current = notifications.length
    if (!muted && notifications.length > prev) {
      playChime()
    }
  }, [notifications.length, muted])

  function toggleMute() {
    const next = !muted
    setMuted(next)
    localStorage.setItem(MUTE_KEY, String(next))
  }

  const count = notifications.length

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={muted ? 'Notificações (silenciado)' : 'Notificações'}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
          open
            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
            : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
        }`}
      >
        {muted ? <BellOff size={18} /> : <Bell size={18} />}
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-0.5 leading-none">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Notificações</span>
            <div className="flex items-center gap-2">
              {count > 0 && (
                <span className="text-xs text-white bg-red-500 rounded-full px-1.5 py-0.5 font-semibold">{count}</span>
              )}
              <button
                type="button"
                onClick={toggleMute}
                title={muted ? 'Ativar som' : 'Silenciar som'}
                className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
                  muted
                    ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                    : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
            </div>
          </div>

          {count === 0 ? (
            <div className="py-10 flex flex-col items-center gap-2 text-gray-400 dark:text-gray-600">
              <Bell size={28} />
              <p className="text-sm">Nenhuma notificação</p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-gray-50 dark:divide-gray-800">
              {notifications.map(n => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => { onNavigate(n.page); setOpen(false) }}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-lg shrink-0 mt-0.5">{TYPE_ICON[n.type]}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{n.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{n.body}</p>
                      </div>
                      <span className="text-[10px] text-gray-400 dark:text-gray-600 shrink-0 mt-0.5 whitespace-nowrap">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
