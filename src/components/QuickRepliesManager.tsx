import { useState, useEffect, useCallback, useRef } from 'react'
import { getApiUrl } from '../lib/api'
import { Loader2, Plus, Pencil, Trash2, Search, MessageSquare, Paperclip, X, Upload, Image as ImageIcon } from 'lucide-react'

interface QuickReplyAttachment {
  url: string
  filename: string
  mime_type: string
  size?: number
}

interface QuickReply {
  id: string
  shortcut: string
  name: string
  body: string
  category: string | null
  attachments: QuickReplyAttachment[]
  ativo: boolean
  created_at: string
  updated_at: string
}

const CATEGORIES = [
  'agendamento',
  'pos-venda',
  'financeiro',
  'duvida',
  'encerramento',
  'outro',
]

export default function QuickRepliesManager() {
  const [replies, setReplies] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<QuickReply | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formShortcut, setFormShortcut] = useState('')
  const [formName, setFormName] = useState('')
  const [formBody, setFormBody] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [formAttachments, setFormAttachments] = useState<QuickReplyAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadReplies = useCallback(async () => {
    try {
      setLoading(true)
      const params = search ? `?q=${encodeURIComponent(search)}` : ''
      const res = await fetch(getApiUrl(`/chat/quick-replies${params}`))
      const data = await res.json() as { ok: boolean; replies?: QuickReply[] }
      if (data.ok && data.replies) setReplies(data.replies)
    } catch {
      setError('Erro ao carregar respostas rapidas.')
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { void loadReplies() }, [loadReplies])

  function openCreate() {
    setEditing(null)
    setFormShortcut('')
    setFormName('')
    setFormBody('')
    setFormCategory('')
    setPendingFiles([])
    setFormAttachments([])
    setShowForm(true)
    setError(null)
  }

  function openEdit(reply: QuickReply) {
    setEditing(reply)
    setFormShortcut(reply.shortcut)
    setFormName(reply.name)
    setFormBody(reply.body)
    setFormCategory(reply.category ?? '')
    setPendingFiles([])
    setFormAttachments(reply.attachments.map(a => ({ ...a })))
    setShowForm(true)
    setError(null)
  }

  async function fileToAttachment(file: File): Promise<QuickReplyAttachment> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        resolve({ url: dataUrl, filename: file.name, mime_type: file.type, size: file.size })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function handleSave() {
    if (!formShortcut.trim() || !formName.trim()) {
      setError('Atalho e nome sao obrigatorios.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const newAttachments = await Promise.all(pendingFiles.map(f => fileToAttachment(f)))
      const attachments = [...formAttachments, ...newAttachments]
      const payload = {
        shortcut: formShortcut.trim(),
        name: formName.trim(),
        body: formBody.trim(),
        category: formCategory || null,
        attachments,
      }
      const body = editing
        ? await fetch(getApiUrl(`/chat/quick-replies/${editing.id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch(getApiUrl('/chat/quick-replies'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const data = await body.json() as { ok: boolean; error?: string }
      if (!body.ok || !data.ok) throw new Error(data.error ?? 'Erro ao salvar.')
      setShowForm(false)
      void loadReplies()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta resposta rapida?')) return
    try {
      await fetch(getApiUrl(`/chat/quick-replies/${id}`), { method: 'DELETE' })
      void loadReplies()
    } catch {
      setError('Erro ao excluir.')
    }
  }

  async function handleToggleAtivo(reply: QuickReply) {
    try {
      await fetch(getApiUrl(`/chat/quick-replies/${reply.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !reply.ativo }),
      })
      void loadReplies()
    } catch {
      setError('Erro ao atualizar.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-sky-600" />
          Respostas Rapidas
        </h3>
        <button
          onClick={openCreate}
          className="flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
        >
          <Plus className="h-4 w-4" /> Nova
        </button>
      </div>

      <p className="text-xs text-slate-500">
        Crie mensagens prontas para usar no chat. Digite <kbd className="px-1 py-0.5 rounded bg-slate-100 border text-xs font-mono">\\</kbd> seguido do atalho para inserir rapidamente.
      </p>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por atalho, nome ou categoria..."
          className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm outline-none focus:border-sky-400"
        />
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-sky-600" />
        </div>
      ) : replies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">
          Nenhuma resposta rapida cadastrada.
        </div>
      ) : (
        <div className="space-y-2">
          {replies.map(reply => (
            <div
              key={reply.id}
              className={`rounded-xl border p-3 transition-colors ${
                reply.ativo ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-xs font-mono font-semibold text-sky-700">
                      \{reply.shortcut}
                    </span>
                    <span className="text-sm font-medium text-slate-800 truncate">{reply.name}</span>
                    {reply.category && (
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {reply.category}
                      </span>
                    )}
                    {reply.attachments.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        <Paperclip className="h-3 w-3" /> {reply.attachments.length}
                      </span>
                    )}
                  </div>
                  {reply.body && (
                    <p className="mt-1 text-xs text-slate-600 line-clamp-2 whitespace-pre-wrap">{reply.body}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => void handleToggleAtivo(reply)}
                    className={`rounded-lg px-2 py-1 text-xs font-medium transition-colors ${
                      reply.ativo
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {reply.ativo ? 'Ativo' : 'Inativo'}
                  </button>
                  <button onClick={() => openEdit(reply)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => void handleDelete(reply.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-semibold text-slate-800">
                {editing ? 'Editar Resposta Rapida' : 'Nova Resposta Rapida'}
              </h4>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Atalho (sem \)</label>
                <input
                  value={formShortcut}
                  onChange={e => setFormShortcut(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                  placeholder="ex: obrigado"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nome</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="ex: Agradecimento padrao"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Categoria</label>
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 bg-white"
                >
                  <option value="">Sem categoria</option>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Mensagem</label>
                <textarea
                  value={formBody}
                  onChange={e => setFormBody(e.target.value)}
                  placeholder="Digite a mensagem pronta..."
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Anexos (imagens, audios, PDFs)</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation() }}
                  onDrop={e => {
                    e.preventDefault(); e.stopPropagation()
                    const files = Array.from(e.dataTransfer.files)
                    if (files.length > 0) setPendingFiles(prev => [...prev, ...files])
                  }}
                  className="flex items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-500 cursor-pointer hover:border-sky-400 hover:bg-sky-50 transition-colors"
                >
                  <Upload className="h-4 w-4 text-slate-400" />
                  <span>Clique ou arraste arquivos aqui</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,audio/*,.pdf,.doc,.docx"
                  className="hidden"
                  onChange={e => {
                    const files = Array.from(e.target.files ?? [])
                    if (files.length > 0) setPendingFiles(prev => [...prev, ...files])
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                />
                {(formAttachments.length > 0 || pendingFiles.length > 0) && (
                  <div className="mt-2 space-y-1">
                    {formAttachments.map((att, i) => (
                      <div key={`att-${i}`} className="flex items-center gap-2 rounded-lg bg-slate-100 px-2 py-1.5 text-xs">
                        {att.mime_type.startsWith('image/') ? (
                          <img src={att.url} alt={att.filename} className="h-6 w-6 rounded object-cover" />
                        ) : (
                          <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        <span className="flex-1 truncate text-slate-700">{att.filename}</span>
                        {att.size && <span className="text-slate-400">{(att.size / 1024).toFixed(0)}KB</span>}
                        <button
                          onClick={() => setFormAttachments(prev => prev.filter((_, j) => j !== i))}
                          className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {pendingFiles.map((file, i) => (
                      <div key={`file-${i}`} className="flex items-center gap-2 rounded-lg bg-sky-50 px-2 py-1.5 text-xs">
                        {file.type.startsWith('image/') ? (
                          <ImageIcon className="h-3.5 w-3.5 text-sky-500" />
                        ) : (
                          <Paperclip className="h-3.5 w-3.5 text-sky-500" />
                        )}
                        <span className="flex-1 truncate text-sky-700">{file.name}</span>
                        <span className="text-sky-400">{(file.size / 1024).toFixed(0)}KB</span>
                        <button
                          onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                          className="rounded p-0.5 text-sky-400 hover:bg-sky-100 hover:text-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-1 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
