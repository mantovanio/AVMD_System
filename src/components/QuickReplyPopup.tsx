import { useEffect, useRef } from 'react'
import { MessageSquare } from 'lucide-react'
import type { QuickReply } from '../hooks/useQuickReplyAutocomplete'

interface QuickReplyPopupProps {
  replies: QuickReply[]
  selectedIndex: number
  onSelect: (reply: QuickReply) => void
  onHover: (index: number) => void
  position?: { top: number; left: number }
}

export default function QuickReplyPopup({ replies, selectedIndex, onSelect, onHover, position }: QuickReplyPopupProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const selected = itemRefs.current[selectedIndex]
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  if (replies.length === 0) return null

  return (
    <div
      ref={listRef}
      className="absolute z-50 w-80 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
      style={position ? { bottom: position.top, left: position.left } : { bottom: '100%', left: 0, marginBottom: 4 }}
    >
      <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-100">
        Respostas rapidas
      </div>
      {replies.map((reply, index) => (
        <div
          key={reply.id}
          ref={el => { itemRefs.current[index] = el }}
          className={`flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors ${
            index === selectedIndex ? 'bg-sky-50' : 'hover:bg-slate-50'
          }`}
          onMouseEnter={() => onHover(index)}
          onClick={() => onSelect(reply)}
        >
          <MessageSquare className="h-4 w-4 mt-0.5 text-sky-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono font-semibold text-sky-700">\{reply.shortcut}</span>
              <span className="text-xs font-medium text-slate-700 truncate">{reply.name}</span>
            </div>
            {reply.body && (
              <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 whitespace-pre-wrap">{reply.body}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
