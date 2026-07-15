import { useState, useRef, useEffect } from 'react'
import { X, Send, Loader2, Trash2 } from 'lucide-react'
import { getEdgeFunctionUrl, getSupabaseAccessToken } from '@/lib/supabase'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  onClose: () => void
}

export default function ClaudeChat({ onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const next: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setLoading(true)

    try {
      const accessToken = await getSupabaseAccessToken()
      const res = await fetch(getEdgeFunctionUrl('claude-proxy'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          system: 'Você é um assistente do sistema CertiID, um CRM para gestão de certificados digitais. Responda sempre em português do Brasil, de forma direta e objetiva.',
          messages: next,
        }),
      })

      const data = await res.json() as { ok?: boolean; reply?: string; error?: string }

      if (!res.ok || data.ok === false) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Erro: ${data.error ?? 'Falha ao consultar a IA.'}` }])
      } else {
        const reply = data.reply ?? 'Sem resposta.'
        setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Erro ao conectar com Claude.' }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
  }

  return (
    <div className="fixed top-14 right-2 sm:right-4 w-[calc(100vw-16px)] sm:w-96 h-[calc(100vh-80px)] sm:h-[520px] bg-white dark:bg-gray-950 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col z-50 overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-50 dark:bg-gray-900 shrink-0 border-b border-gray-200 dark:border-gray-800">
        <ClaudeLogo className="w-6 h-6 shrink-0" />
        <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 flex-1">Claude</span>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            title="Limpar conversa"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          title="Fechar"
          className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50 dark:bg-gray-950/40">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm text-center px-4">
            Olá! Como posso ajudar?
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-br-none'
                : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-none border border-gray-200 dark:border-gray-700'
            }`}>
              <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl rounded-bl-none px-3 py-2.5">
              <Loader2 size={15} className="animate-spin text-gray-400" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-700 flex items-end gap-2 shrink-0 bg-white dark:bg-gray-900">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte ao Claude… (Enter para enviar)"
          rows={1}
          disabled={loading}
          className="flex-1 resize-none max-h-24 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500 dark:text-gray-100 placeholder-gray-400 overflow-y-auto disabled:opacity-50"
          onInput={e => {
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 96)}px`
          }}
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!input.trim() || loading}
          className="shrink-0 w-9 h-9 flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  )
}

function ClaudeLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M9.74 4.5C8.97 4.5 8.32 4.98 8.07 5.67L4.55 15.5C4.22 16.4 4.88 17.35 5.83 17.35H7.05L8.26 13.97H12.5L11.89 12.25H8.85L10.32 8.05L13.56 17.35H15.28L11.57 6.2C11.32 5.47 10.65 4.97 9.87 4.97L9.74 4.5Z"
        fill="#CC785C"
      />
      <path
        d="M14.13 4.5L17.86 14.95C18.09 15.6 18.09 16.31 17.86 16.96L17.5 18C17.25 18.7 16.59 19.16 15.83 19.16H14.72L13.5 15.67H9.26L9.87 17.35H13L14.21 20.5H16.05C17.43 20.5 18.67 19.63 19.13 18.31L19.5 17.25C19.91 16.11 19.91 14.85 19.5 13.71L15.77 3.27C15.53 2.6 14.89 2.16 14.17 2.16H12.45L14.13 4.5Z"
        fill="#CC785C"
      />
    </svg>
  )
}
