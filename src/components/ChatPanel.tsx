import { useState, useEffect, useRef } from 'react'
import { X, Send, Loader2, Smile, Paperclip, Mic, StopCircle, Trash2, MessageCircle, Phone, CalendarClock, Clock3, Copy, RefreshCw, Pencil, Save, CornerUpLeft } from 'lucide-react'
import { supabase, getEdgeFunctionUrl, getSupabaseAccessToken } from '@/lib/supabase'
import { getApiUrl } from '@/lib/api'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { DEFAULT_CONTACT_DOCUMENT_STORAGE, loadContactDocumentStorageConfig, type ContactDocumentStorageConfig } from '@/lib/contactDocumentStorage'
import type { ChatContact, Lead } from '@/types'
import { useAuth } from '@/contexts/AuthContext'

// ── Public types ───────────────────────────────────────────────

export type { ChatContact }

export interface EvolutionCfg {
  base_url:      string
  api_token:     string
  instance_name: string
  status?: 'ativo' | 'pendente' | 'erro' | 'inativo'
  last_test_at?: string | null
  last_error?: string | null
}

// ── Internal types ─────────────────────────────────────────────

interface Message {
  id:           string
  content:      string | null
  fromMe:       boolean
  created_at:   string
  source?:      string | null
  eventType?:   string | null
  messageId?:   string | null
  pushName?:    string | null
  messageType?: string
  mediaUrl?:    string | null
  quoted?: {
    messageId: string
    content: string
  } | null
}

interface Props {
  contact:   ChatContact
  evolution: EvolutionCfg | null
  onClose:   () => void
}

type LeadSidebarInfo = Pick<
  Lead,
  | 'id'
  | 'nome_lead'
  | 'whatsapp_lead'
  | 'motivo_contato'
  | 'resumo_conversa'
  | 'status'
  | 'ultima_mensagem'
  | 'inicio_atendimento'
  | 'data_agendamento'
  | 'agendamento_criado_em'
  | 'anotacoes'
  | 'responsavel_profile_id'
  | 'responsavel_nome'
  | 'transferido_em'
  | 'transferido_por'
  | 'follow_up_1'
  | 'follow_up_2'
  | 'follow_up_3'
  | 'horario_comercial'
  | 'evolution_remote_jid'
  | 'evolution_instance'
  | 'created_at'
>

type TransferTarget = {
  id: string
  nome: string
  perfil: 'admin' | 'usuario' | 'vendedor' | 'agente_registro'
}

type LeadAttachment = {
  id: string
  lead_id: string
  nome_original: string
  mime_type: string | null
  tamanho_bytes: number | null
  uploaded_at: string
  uploaded_by: string | null
  data_url: string | null
  storage_provider: 'supabase' | 'server' | null
  bucket: string | null
  storage_path: string | null
  external_url: string | null
  created_at: string
}

type LeadEditForm = {
  nome_lead: string
  whatsapp_lead: string
  motivo_contato: string
  status: string
  data_agendamento: string
  resumo_conversa: string
  anotacoes: string
  follow_up_1: string
  follow_up_2: string
  follow_up_3: string
}

// ── Constants ──────────────────────────────────────────────────

const EDGE_FN = getEdgeFunctionUrl('evolution-webhook')
const CHAT_LEAD_DOC_BUCKET = 'chat-lead-documentos'

const EMOJIS = [
  '😊','😂','🥰','😍','😘','😁','😎','🤩','😜','😅','😭','😤',
  '🙏','👍','👏','🙌','💪','🤝','👋','✌️','❤️','🔥','✨','⭐',
  '🎉','🎊','🏆','💯','🎯','🚀','💡','✅','❌','⚠️','📌','📎',
  '📞','📲','💬','📧','📅','🔒','🔑','💰','📋','🔔','📣','💻',
]

// ── Helpers ────────────────────────────────────────────────────

function fmtTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

function normalizeMimeType(mime: string | null | undefined) {
  return (mime ?? '').replace(/\s+/g, '')
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Nao informado'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatStatusLabel(value: string | null | undefined) {
  if (!value) return 'Nao definido'
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function buildLeadEditForm(lead: LeadSidebarInfo | null, fallbackName: string | null, fallbackPhone: string | null): LeadEditForm {
  return {
    nome_lead: lead?.nome_lead ?? fallbackName ?? '',
    whatsapp_lead: lead?.whatsapp_lead ?? fallbackPhone ?? '',
    motivo_contato: lead?.motivo_contato ?? '',
    status: lead?.status ?? 'iniciou_conversa',
    data_agendamento: toDateTimeLocal(lead?.data_agendamento),
    resumo_conversa: lead?.resumo_conversa ?? '',
    anotacoes: lead?.anotacoes ?? '',
    follow_up_1: lead?.follow_up_1 ?? '',
    follow_up_2: lead?.follow_up_2 ?? '',
    follow_up_3: lead?.follow_up_3 ?? '',
  }
}

function buildSafeFileName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.\- ]+/g, '').trim() || `arquivo-${Date.now()}`
}

function buildLeadDocumentPath(leadId: string, fileName: string) {
  const safeName = buildSafeFileName(fileName)
  return `${leadId}/${Date.now()}-${safeName}`
}

async function resolveLeadAttachmentUrl(doc: LeadAttachment) {
  if (doc.data_url) return doc.data_url
  if (doc.external_url) return doc.external_url
  if (!doc.bucket || !doc.storage_path) throw new Error('Documento sem caminho de armazenamento')

  const { data, error } = await supabase.storage
    .from(doc.bucket)
    .createSignedUrl(doc.storage_path, 60 * 10)

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Nao foi possivel abrir o documento')
  }

  return data.signedUrl
}

function parseEvolutionEvents(events: Record<string, unknown>[]): Message[] {
  return events
    .map(row => {
      const pld = row.payload as Record<string, unknown> | undefined
      if (!pld) return null
      return {
        id:          (row.id as string),
        content:     (pld.content as string | null) ?? null,
        fromMe:      (pld.fromMe as boolean) ?? false,
        created_at:  (row.created_at as string) ?? new Date().toISOString(),
        source:      (row.source as string | null) ?? null,
        eventType:   (row.event_type as string | null) ?? null,
        messageId:   (pld.messageId as string | null) ?? null,
        pushName:    (pld.pushName as string | null) ?? null,
        messageType: (pld.messageType as string | null) ?? 'conversation',
        mediaUrl:    (pld.mediaUrl as string | null) ?? null,
        quoted:      (pld.quoted as { messageId: string; content: string } | null) ?? null,
      } as Message
    })
    .filter((m): m is Message => m !== null)
}

async function fetchMediaObjectUrl(evolution: EvolutionCfg, messageId: string, convertToMp4 = false) {
  const accessToken = await getSupabaseAccessToken()
  const res = await fetch(EDGE_FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({
      _action: 'get_media_base64',
      base_url: evolution.base_url,
      api_token: evolution.api_token,
      instance_name: evolution.instance_name,
      message_id: messageId,
      convert_to_mp4: convertToMp4,
    }),
  })
  const data = await res.json() as { ok: boolean; base64?: string; mimetype?: string; error?: string }
  if (!data.ok || !data.base64 || !data.mimetype) {
    throw new Error(data.error || 'Falha ao carregar mídia')
  }

  const byteCharacters = atob(data.base64)
  const byteNumbers = new Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i)
  }
  const byteArray = new Uint8Array(byteNumbers)
  const blob = new Blob([byteArray], { type: normalizeMimeType(data.mimetype) })
  return URL.createObjectURL(blob)
}

// ── Component ──────────────────────────────────────────────────

export default function ChatPanel({ contact, evolution, onClose }: Props) {
  const { profile } = useAuth()
  const [remoteJid, setRemoteJid]           = useState<string | null>(contact.evolution_remote_jid)
  const [messages, setMessages]             = useState<Message[]>([])
  const [loading, setLoading]               = useState(true)
  const [loadingLabel, setLoadingLabel]     = useState('Carregando...')
  const [input, setInput]                   = useState('')
  const [sending, setSending]               = useState(false)
  const [fetchError, setFetchError]         = useState<string | null>(null)
  const [showEmoji, setShowEmoji]           = useState(false)
  const [leadInfo, setLeadInfo]             = useState<LeadSidebarInfo | null>(null)
  const [leadLoading, setLeadLoading]       = useState(contact._table === 'leads_contabilidade')
  const [copyFeedback, setCopyFeedback]     = useState<string | null>(null)
  const [editingLead, setEditingLead]       = useState(false)
  const [savingLead, setSavingLead]         = useState(false)
  const [leadForm, setLeadForm]             = useState<LeadEditForm>(() => buildLeadEditForm(null, contact.nome, contact.telefone))
  const [hasTransferFields, setHasTransferFields] = useState(true)
  const [hasDocumentTable, setHasDocumentTable] = useState(true)
  const [leadAttachments, setLeadAttachments] = useState<LeadAttachment[]>([])
  const [documentStorageConfig, setDocumentStorageConfig] = useState<ContactDocumentStorageConfig>(DEFAULT_CONTACT_DOCUMENT_STORAGE)
  const [transferTargets, setTransferTargets] = useState<TransferTarget[]>([])
  const [loadingTargets, setLoadingTargets] = useState(false)
  const [selectedTransferId, setSelectedTransferId] = useState('')
  const [transferringLead, setTransferringLead] = useState(false)
  const [uploadingLeadAttachment, setUploadingLeadAttachment] = useState(false)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [composerMode, setComposerMode] = useState<'mensagem' | 'nota_interna'>('mensagem')
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)

  // file attachment
  const [pendingFile, setPendingFile]       = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)

  // audio recording
  type RecState = 'idle' | 'recording' | 'preview'
  const [recState, setRecState]   = useState<RecState>('idle')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl]   = useState<string | null>(null)
  const [recSecs, setRecSecs]     = useState(0)

  const bottomRef         = useRef<HTMLDivElement>(null)
  const inputRef          = useRef<HTMLTextAreaElement>(null)
  const fileInputRef      = useRef<HTMLInputElement>(null)
  const leadDocInputRef   = useRef<HTMLInputElement>(null)
  const panelRef          = useRef<HTMLDivElement>(null)
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null)
  const audioChunksRef    = useRef<Blob[]>([])
  const recTimerRef       = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Init & realtime ─────────────────────────────────────────

  useEffect(() => {
    void init()
    void loadTransferTargets()
    void loadDocumentStorageConfig()
    void loadLeadDocuments()
    inputRef.current?.focus()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!remoteJid) return
    const channel = supabase
      .channel(`evolution-chat-${remoteJid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'communication_events', filter: `conversation_id=eq.${remoteJid}` },
        (change) => {
          const row = change.new as Record<string, unknown>
          const pld = row.payload as Record<string, unknown> | undefined
          if (!pld) return
          const msg: Message = {
            id:          row.id as string,
            content:     (pld.content as string | null) ?? null,
            fromMe:      (pld.fromMe as boolean) ?? false,
            created_at:  row.created_at as string,
            source:      (row.source as string | null) ?? null,
            eventType:   (row.event_type as string | null) ?? null,
            messageId:   (pld.messageId as string | null) ?? null,
            pushName:    (pld.pushName as string | null) ?? null,
            messageType: (pld.messageType as string | null) ?? 'conversation',
            mediaUrl:    (pld.mediaUrl as string | null) ?? null,
            quoted:      (pld.quoted as { messageId: string; content: string } | null) ?? null,
          }
          setMessages(prev => {
            const existingIndex = prev.findIndex(m =>
              m.id === msg.id ||
              (msg.messageId && m.messageId === msg.messageId) ||
              (msg.messageId && m.id === msg.messageId),
            )
            if (existingIndex >= 0) {
              const next = [...prev]
              next[existingIndex] = { ...next[existingIndex], ...msg }
              return next
            }
            return [...prev, msg]
          })
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [remoteJid])

  useEffect(() => {
    if (contact._table !== 'leads_contabilidade') return
    void loadLeadInfo()

    const channel = supabase
      .channel(`chat-panel-lead-${contact.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads_contabilidade', filter: `id=eq.${contact.id}` },
        payload => {
          if (payload.eventType === 'DELETE') return
          const next = payload.new as LeadSidebarInfo
          setLeadInfo(next)
          setLeadForm(buildLeadEditForm(next, contact.nome, contact.telefone))
          setSelectedTransferId(next.responsavel_profile_id ?? '')
          if (next.evolution_remote_jid && next.evolution_remote_jid !== remoteJid) {
            setRemoteJid(next.evolution_remote_jid)
          }
        },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [contact._table, contact.id, remoteJid])

  useEffect(() => {
    if (contact._table !== 'leads_contabilidade') return

    const channel = supabase
      .channel(`chat-panel-docs-${contact.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_lead_documentos', filter: `lead_id=eq.${contact.id}` },
        () => { void loadLeadDocuments() },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [contact._table, contact.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (!copyFeedback) return
    const timer = window.setTimeout(() => setCopyFeedback(null), 1800)
    return () => window.clearTimeout(timer)
  }, [copyFeedback])

  useEffect(() => {
    if (!isResizingSidebar) return

    function handleMouseMove(event: MouseEvent) {
      if (!panelRef.current) return
      const rect = panelRef.current.getBoundingClientRect()
      const next = rect.right - event.clientX
      const minWidth = 260
      const maxWidth = Math.min(520, Math.max(320, rect.width - 320))
      setSidebarWidth(Math.max(minWidth, Math.min(maxWidth, next)))
    }

    function handleMouseUp() {
      setIsResizingSidebar(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isResizingSidebar])

  // ── Init ────────────────────────────────────────────────────

  async function init() {
    setLoading(true)
    setFetchError(null)
    logger.info('ChatPanel', 'init', { contact_id: contact.id })

    if (!evolution) {
      logger.warn('ChatPanel', 'Evolution API não configurada')
      setFetchError('evolution_not_configured')
      setLoading(false)
      return
    }

    let jid = contact.evolution_remote_jid

    if (jid) {
      setRemoteJid(jid)
      await loadHistory(jid)
      setLoading(false)
      return
    }

    if (!contact.telefone) {
      setFetchError('Contato sem WhatsApp. Adicione um número antes de abrir o chat.')
      setLoading(false)
      return
    }

    setLoadingLabel('Iniciando conversa...')
    logger.info('ChatPanel', 'chamando init_chat', { instance: evolution.instance_name })
    try {
      const res = await fetch(getApiUrl('/chat/init'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: contact.telefone,
          lead_id: contact.id,
          instance_name: evolution.instance_name,
        }),
      })
      const data = await res.json() as { ok: boolean; remoteJid?: string; messages?: Record<string, unknown>[]; error?: string }
      logger.info('ChatPanel', 'init_chat resposta', { ok: data.ok, jid: data.remoteJid, msgs: data.messages?.length })
      if (!res.ok || !data.ok || !data.remoteJid) {
        setFetchError(data.error ?? 'Número de telefone inválido')
        setLoading(false)
        return
      }
      jid = data.remoteJid
      setRemoteJid(jid)
      setMessages(parseEvolutionEvents(data.messages ?? []))
    } catch (e) {
      logger.error('ChatPanel', 'exceção em init_chat', String(e))
      setFetchError('Sem conexão com o servidor')
    } finally {
      setLoading(false)
    }
  }

  async function loadHistory(jid: string) {
    const res = await fetch(getApiUrl(`/chat/leads/${contact.id}/history?conversation_id=${encodeURIComponent(jid)}`)).catch(() => null)
    if (!res?.ok) return
    const data = await res.json() as { ok: boolean; messages?: Record<string, unknown>[] }
    setMessages(parseEvolutionEvents(data.messages ?? []))
  }

  async function loadLeadInfo() {
    if (contact._table !== 'leads_contabilidade') return
    setLeadLoading(true)
    const extendedSelect = 'id, nome_lead, whatsapp_lead, motivo_contato, resumo_conversa, status, ultima_mensagem, inicio_atendimento, data_agendamento, agendamento_criado_em, anotacoes, responsavel_profile_id, responsavel_nome, transferido_em, transferido_por, follow_up_1, follow_up_2, follow_up_3, horario_comercial, evolution_remote_jid, evolution_instance, created_at'
    const fallbackSelect = 'id, nome_lead, whatsapp_lead, motivo_contato, resumo_conversa, status, ultima_mensagem, inicio_atendimento, data_agendamento, agendamento_criado_em, anotacoes, follow_up_1, follow_up_2, follow_up_3, horario_comercial, evolution_remote_jid, evolution_instance, created_at'

    let { data, error } = await supabase
      .from('leads_contabilidade')
      .select(extendedSelect)
      .eq('id', contact.id)
      .maybeSingle()

    if (error) {
      setHasTransferFields(false)
      const fallback = await supabase
        .from('leads_contabilidade')
        .select(fallbackSelect)
        .eq('id', contact.id)
        .maybeSingle()
      data = fallback.data as typeof data
      error = fallback.error
    } else {
      setHasTransferFields(true)
    }

    if (!error && data) {
      const next = data as LeadSidebarInfo
      setLeadInfo(next)
      setLeadForm(buildLeadEditForm(next, contact.nome, contact.telefone))
      setSelectedTransferId(next.responsavel_profile_id ?? '')
      if (next.evolution_remote_jid && next.evolution_remote_jid !== remoteJid) {
        setRemoteJid(next.evolution_remote_jid)
      }
    }
    setLeadLoading(false)
  }

  async function loadDocumentStorageConfig() {
    try {
      const config = await loadContactDocumentStorageConfig()
      setDocumentStorageConfig(config)
    } catch {
      setDocumentStorageConfig(DEFAULT_CONTACT_DOCUMENT_STORAGE)
    }
  }

  async function loadLeadDocuments() {
    if (contact._table !== 'leads_contabilidade') return
    let { data, error } = await supabase
      .from('chat_lead_documentos')
      .select('id, lead_id, nome_original, mime_type, tamanho_bytes, uploaded_at, uploaded_by, data_url, storage_provider, bucket, storage_path, external_url, created_at')
      .eq('lead_id', contact.id)
      .order('created_at', { ascending: false })

    if (error) {
      const fallback = await supabase
        .from('chat_lead_documentos')
        .select('id, lead_id, nome_original, mime_type, tamanho_bytes, uploaded_at, uploaded_by, data_url, created_at')
        .eq('lead_id', contact.id)
        .order('created_at', { ascending: false })

      data = fallback.data as typeof data
      error = fallback.error
    }

    if (error) {
      setHasDocumentTable(false)
      setLeadAttachments([])
      return
    }

    setHasDocumentTable(true)
    setLeadAttachments((data ?? []) as LeadAttachment[])
  }

  async function loadTransferTargets() {
    setLoadingTargets(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nome, perfil, status')
      .in('perfil', ['admin', 'usuario', 'agente_registro'])
      .eq('status', 'ativo')
      .order('nome', { ascending: true })

    if (!error && data) {
      setTransferTargets((data as TransferTarget[]) ?? [])
    }
    setLoadingTargets(false)
  }

  // ── Send text ────────────────────────────────────────────────

  async function handleSend() {
    if (composerMode === 'nota_interna') {
      await saveInternalNote()
      return
    }
    if (!evolution) return
    const text = input.trim()
    if (!text || sending || !remoteJid) return
    logger.info('ChatPanel', 'enviando mensagem', { jid: remoteJid, length: text.length })
    setSending(true)
    setInput('')
    const tempId  = `temp-${Date.now()}`
    const tempNow = new Date().toISOString()
    setMessages(prev => [...prev, { id: tempId, content: text, fromMe: true, created_at: tempNow }])
    try {
      const res = await fetch(getApiUrl('/chat/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: remoteJid,
          content: text,
          lead_id: contact.id,
          instance_name: evolution.instance_name,
          quoted_message_id: replyTo?.messageId ?? replyTo?.id ?? null,
          quoted_content: replyTo?.content ?? (replyTo?.messageType === 'audioMessage' ? 'Audio' : 'Mensagem respondida'),
        }),
      })
      const data = await res.json() as { ok: boolean; messageId?: string; error?: string }
      if (res.ok && data.ok) {
        setMessages(prev => prev.map(m => m.id === tempId ? {
          ...m,
          id: data.messageId ?? tempId,
          quoted: replyTo ? {
            messageId: replyTo.messageId ?? replyTo.id,
            content: replyTo.content ?? (replyTo.messageType === 'audioMessage' ? 'Audio' : 'Mensagem respondida'),
          } : null,
        } : m))
      } else {
        setMessages(prev => prev.filter(item => item.id !== tempId))
        setInput(text)
        alert(data.error || 'Nao foi possivel enviar a mensagem.')
      }
    } catch (e) {
      logger.error('ChatPanel', 'falha ao enviar mensagem', String(e))
      setMessages(prev => prev.filter(item => item.id !== tempId))
      setInput(text)
      alert('Nao foi possivel enviar a mensagem.')
    } finally {
      setReplyTo(null)
      setSending(false)
      inputRef.current?.focus()
    }
  }

  async function saveInternalNote() {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    const tempId = `note-${Date.now()}`
    const tempNow = new Date().toISOString()
    setMessages(prev => [...prev, {
      id: tempId,
      content: text,
      fromMe: true,
      created_at: tempNow,
      source: 'crm',
      eventType: 'internal_note',
      messageType: 'internalNote',
      pushName: profile?.nome ?? profile?.email ?? 'Operador',
    }])

    const res = await fetch(getApiUrl('/chat/internal-note'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: contact._table === 'leads_contabilidade' ? contact.id : null,
        conversation_id: remoteJid ?? null,
        content: text,
      }),
    }).catch(() => null)

    if (!res?.ok) {
      setMessages(prev => prev.filter(item => item.id !== tempId))
      setInput(text)
      alert('Nao foi possivel salvar a nota interna.')
      setSending(false)
      return
    }

    setReplyTo(null)
    setSending(false)
    inputRef.current?.focus()
  }

  // ── Send attachment ──────────────────────────────────────────

  async function sendAttachment(file: File | Blob, filename: string, mimeType?: string): Promise<{ ok: boolean; error?: string }> {
    if (!evolution || !remoteJid) return { ok: false, error: 'Canal WhatsApp não configurado.' }
    const finalMimeType = normalizeMimeType(mimeType || file.type || 'application/octet-stream')
    const blob = (mimeType && !(file instanceof File)) ? new Blob([file], { type: finalMimeType }) : file
    const form = new FormData()
    form.append('_action',       'send_attachment')
    form.append('base_url',      evolution.base_url)
    form.append('api_token',     evolution.api_token)
    form.append('instance_name', evolution.instance_name)
    form.append('number',        remoteJid)
    form.append('lead_id',       contact.id)
    form.append('file',          blob, filename)
    form.append('caption',       filename)
    try {
      const accessToken = await getSupabaseAccessToken()
      const res = await fetch(EDGE_FN, {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${accessToken}` },
        body:    form,
      })
      const data = await res.json() as { ok: boolean; messageId?: string; error?: string }
      logger.info('ChatPanel', 'send_attachment resposta', { ok: data.ok, mime: finalMimeType, error: data.error ?? null })
      if (data.ok) {
        // Adiciona mensagem local imediatamente (Realtime pode demorar)
        setMessages(prev => [...prev, {
          id:          data.messageId ?? `sent-${Date.now()}`,
          content:     filename,
          fromMe:      true,
          created_at:  new Date().toISOString(),
          messageType: finalMimeType.startsWith('audio') ? 'audioMessage' : finalMimeType.startsWith('image') ? 'imageMessage' : 'documentMessage',
        }])
        return { ok: true }
      }
      logger.error('ChatPanel', 'falha ao enviar anexo', data)
      return { ok: false, error: data.error ?? 'Falha ao enviar anexo.' }
    } catch (e) {
      logger.error('ChatPanel', 'falha ao enviar anexo', String(e))
      return { ok: false, error: String(e) }
    }
  }

  // ── File attachment ──────────────────────────────────────────

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    if (file.type.startsWith('image/')) {
      setPendingPreview(URL.createObjectURL(file))
    } else {
      setPendingPreview(null)
    }
    e.target.value = ''
  }

  function clearFile() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(null)
    setPendingPreview(null)
  }

  async function handleFileSend() {
    if (!pendingFile || !remoteJid) return
    setSending(true)
    const result = await sendAttachment(pendingFile, pendingFile.name)
    setSending(false)
    if (!result.ok) alert(result.error || 'Não foi possível enviar o arquivo.')
    clearFile()
  }

  // ── Audio recording ──────────────────────────────────────────

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/webm;codecs=opus'
      const mr = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mr
      audioChunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(audioChunksRef.current, { type: mimeType })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setRecState('preview')
      }
      mr.start()
      setRecState('recording')
      setRecSecs(0)
      recTimerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000)
    } catch {
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.')
    }
  }

  function stopRecording() {
    if (recTimerRef.current) clearInterval(recTimerRef.current)
    mediaRecorderRef.current?.stop()
  }

  async function sendAudio() {
    if (!audioBlob || !remoteJid) return
    setSending(true)
    const preferredMime = normalizeMimeType(audioBlob.type || 'audio/ogg;codecs=opus')
    const extension = preferredMime.includes('webm') ? 'webm' : 'ogg'
    const audioToSend = new Blob([audioBlob], { type: preferredMime })
    const result = await sendAttachment(audioToSend, `audio_${Date.now()}.${extension}`, preferredMime)
    setSending(false)
    if (!result.ok) alert(result.error || 'Não foi possível enviar o áudio.')
    discardAudio()
  }

  function discardAudio() {
    if (recTimerRef.current) clearInterval(recTimerRef.current)
    mediaRecorderRef.current?.stop()
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setRecState('idle')
    setRecSecs(0)
  }

  // ── Emoji ────────────────────────────────────────────────────

  function insertEmoji(emoji: string) {
    const el = inputRef.current
    if (!el) { setInput(prev => prev + emoji); setShowEmoji(false); return }
    const start = el.selectionStart ?? input.length
    const end   = el.selectionEnd   ?? input.length
    setInput(input.slice(0, start) + emoji + input.slice(end))
    setShowEmoji(false)
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + emoji.length
      el.focus()
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
  }

  async function copyText(value: string | null | undefined, label: string) {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopyFeedback(`${label} copiado`)
    } catch {
      setCopyFeedback(`Falha ao copiar ${label.toLowerCase()}`)
    }
  }

  async function saveLeadInfo() {
    if (contact._table !== 'leads_contabilidade') return
    setSavingLead(true)
    const payload = {
      nome_lead: leadForm.nome_lead.trim() || null,
      whatsapp_lead: leadForm.whatsapp_lead.trim() || null,
      motivo_contato: leadForm.motivo_contato.trim() || null,
      status: leadForm.status || 'iniciou_conversa',
      data_agendamento: leadForm.data_agendamento ? new Date(leadForm.data_agendamento).toISOString() : null,
      resumo_conversa: leadForm.resumo_conversa.trim() || null,
      anotacoes: leadForm.anotacoes.trim() || null,
      follow_up_1: leadForm.follow_up_1.trim() || null,
      follow_up_2: leadForm.follow_up_2.trim() || null,
      follow_up_3: leadForm.follow_up_3.trim() || null,
    }
    const res = await fetch(getApiUrl(`/chat/leads/${contact.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => null)

    setSavingLead(false)
    if (!res?.ok) {
      alert('Nao foi possivel salvar as informacoes.')
      return
    }
    const result = await res.json() as { lead?: LeadSidebarInfo | null }
    const data = result.lead ?? null
    if (data) {
      setLeadInfo(data as LeadSidebarInfo)
      setLeadForm(buildLeadEditForm(data as LeadSidebarInfo, contact.nome, contact.telefone))
    }
    setEditingLead(false)
    setCopyFeedback('Dados do contato atualizados')
  }

  function cancelLeadEdit() {
    setLeadForm(buildLeadEditForm(leadInfo, contact.nome, contact.telefone))
    setEditingLead(false)
  }

  async function transferConversation() {
    if (!hasTransferFields) {
      alert('A base ainda não possui os campos de transferência. Aplique a migration nova do chat.')
      return
    }
    if (contact._table !== 'leads_contabilidade') return
    if (!selectedTransferId) {
      alert('Selecione o atendente ou agente responsável.')
      return
    }
    const destination = transferTargets.find(item => item.id === selectedTransferId)
    if (!destination) {
      alert('Destino da transferência não encontrado.')
      return
    }

    setTransferringLead(true)
    const { data, error } = await supabase
      .from('leads_contabilidade')
      .update({
        responsavel_profile_id: destination.id,
        responsavel_nome: destination.nome,
        transferido_em: new Date().toISOString(),
        transferido_por: profile?.nome ?? profile?.email ?? 'Operador',
      })
      .eq('id', contact.id)
      .select('id, nome_lead, whatsapp_lead, motivo_contato, resumo_conversa, status, ultima_mensagem, inicio_atendimento, data_agendamento, agendamento_criado_em, anotacoes, responsavel_profile_id, responsavel_nome, transferido_em, transferido_por, follow_up_1, follow_up_2, follow_up_3, horario_comercial, evolution_remote_jid, evolution_instance, created_at')
      .maybeSingle()

    setTransferringLead(false)
    if (error) {
      alert('Nao foi possivel transferir a conversa.')
      return
    }
    if (data) {
      const next = data as LeadSidebarInfo
      setLeadInfo(next)
      setSelectedTransferId(next.responsavel_profile_id ?? '')
    }
    setCopyFeedback(`Conversa transferida para ${destination.nome}`)
  }

  const ALLOWED_MIME_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
  ])

  async function uploadLeadAttachment(file: File) {
    if (contact._table !== 'leads_contabilidade') return
    if (!hasDocumentTable) {
      alert('A base ainda não possui a tabela de documentos do contato. Aplique a migration nova do chat.')
      return
    }
    const limitBytes = 20 * 1024 * 1024
    if (file.size > limitBytes) {
      alert('Este upload no contato aceita arquivos de até 20 MB por enquanto.')
      return
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      alert(`Tipo de arquivo não permitido: ${file.type || 'desconhecido'}. Use imagens, PDF, Word, Excel ou texto.`)
      return
    }

    setUploadingLeadAttachment(true)
    try {
      let nextAttachment: Record<string, unknown>
      let cleanupStorage: { bucket: string; path: string } | null = null

      if (documentStorageConfig.mode === 'server') {
        const uploadUrl = documentStorageConfig.server_upload_url.trim()
        if (!uploadUrl) {
          alert('Configure a URL de upload do servidor em Integrações antes de usar este modo.')
          return
        }
        try {
          const parsed = new URL(uploadUrl)
          if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
        } catch {
          alert('URL de upload do servidor inválida.')
          return
        }

        const form = new FormData()
        form.append('file', file, file.name)
        form.append('lead_id', contact.id)
        form.append('file_name', buildSafeFileName(file.name))

        const response = await fetch(uploadUrl, {
          method: 'POST',
          headers: documentStorageConfig.server_auth_token.trim()
            ? { Authorization: `Bearer ${documentStorageConfig.server_auth_token.trim()}` }
            : undefined,
          body: form,
        })

        const payload = await response.json().catch(() => null) as {
          ok?: boolean
          url?: string
          path?: string
          file_name?: string
          mime_type?: string
          size_bytes?: number
          error?: string
        } | null

        if (!response.ok || !payload?.ok || !(payload.url || payload.path)) {
          alert(payload?.error || 'Nao foi possivel enviar o arquivo para o servidor configurado.')
          return
        }

        const externalUrl = payload.url
          ?? (documentStorageConfig.server_public_base_url.trim() && payload.path
            ? `${documentStorageConfig.server_public_base_url.replace(/\/$/, '')}/${String(payload.path).replace(/^\//, '')}`
            : null)

        nextAttachment = {
          lead_id: contact.id,
          nome_original: payload.file_name || buildSafeFileName(file.name),
          mime_type: payload.mime_type || file.type || null,
          tamanho_bytes: payload.size_bytes || file.size,
          uploaded_at: new Date().toISOString(),
          uploaded_by: profile?.nome ?? profile?.email ?? null,
          data_url: null,
          storage_provider: 'server',
          bucket: null,
          storage_path: payload.path ?? null,
          external_url: externalUrl,
        }
      } else {
        const bucket = documentStorageConfig.supabase_bucket || CHAT_LEAD_DOC_BUCKET
        const storagePath = buildLeadDocumentPath(contact.id, file.name)
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(storagePath, file, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
          })

        if (uploadError) {
          alert(`Nao foi possivel enviar o arquivo para o armazenamento: ${uploadError.message}`)
          return
        }

        cleanupStorage = { bucket, path: storagePath }
        nextAttachment = {
          lead_id: contact.id,
          nome_original: buildSafeFileName(file.name),
          mime_type: file.type || null,
          tamanho_bytes: file.size,
          uploaded_at: new Date().toISOString(),
          uploaded_by: profile?.nome ?? profile?.email ?? null,
          data_url: null,
          storage_provider: 'supabase',
          bucket,
          storage_path: storagePath,
          external_url: null,
        }
      }

      const { data, error } = await supabase
        .from('chat_lead_documentos')
        .insert(nextAttachment)
        .select('id, lead_id, nome_original, mime_type, tamanho_bytes, uploaded_at, uploaded_by, data_url, storage_provider, bucket, storage_path, external_url, created_at')
        .single()

      if (error) {
        if (cleanupStorage) {
          await supabase.storage.from(cleanupStorage.bucket).remove([cleanupStorage.path])
        }
        alert('Nao foi possivel salvar o documento no contato.')
        return
      }
      if (data) {
        setLeadAttachments(prev => [data as LeadAttachment, ...prev])
      }
      setCopyFeedback(`Documento salvo em ${sidebarName}`)
    } catch (error) {
      alert('Falha ao salvar documento do contato.')
    } finally {
      setUploadingLeadAttachment(false)
      if (leadDocInputRef.current) leadDocInputRef.current.value = ''
    }
  }

  async function removeLeadAttachment(attachmentId: string) {
    if (contact._table !== 'leads_contabilidade') return
    const doc = leadAttachments.find(item => item.id === attachmentId)
    const deleteUrl = documentStorageConfig.server_delete_url.trim()
    const isDeleteUrlSafe = (() => { try { const p = new URL(deleteUrl); return ['http:', 'https:'].includes(p.protocol) } catch { return false } })()
    if (doc?.storage_provider === 'server' && isDeleteUrlSafe && doc.storage_path) {
      await fetch(deleteUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(documentStorageConfig.server_auth_token.trim()
            ? { Authorization: `Bearer ${documentStorageConfig.server_auth_token.trim()}` }
            : {}),
        },
        body: JSON.stringify({
          lead_id: contact.id,
          path: doc.storage_path,
          url: doc.external_url,
        }),
      }).catch(() => null)
    } else if (doc?.bucket && doc.storage_path) {
      await supabase.storage.from(doc.bucket).remove([doc.storage_path])
    }
    const { error } = await supabase
      .from('chat_lead_documentos')
      .delete()
      .eq('id', attachmentId)
      .eq('lead_id', contact.id)

    if (error) {
      alert('Nao foi possivel remover o documento.')
      return
    }
    setLeadAttachments(prev => prev.filter(item => item.id !== attachmentId))
    setCopyFeedback('Documento removido do contato')
  }

  async function openLeadAttachment(doc: LeadAttachment) {
    try {
      const url = await resolveLeadAttachmentUrl(doc)
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        alert('URL do documento inválida.')
        return
      }
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      alert('Nao foi possivel abrir o documento.')
    }
  }

  // ── Render ───────────────────────────────────────────────────

  const canSend = !loading && !fetchError
  const canUseInternalNotes = !loading && contact._table === 'leads_contabilidade'
  const sidebarPhone = leadInfo?.whatsapp_lead ?? contact.telefone
  const sidebarName = leadInfo?.nome_lead ?? contact.nome ?? 'Sem nome'
  const sidebarStatus = formatStatusLabel(leadInfo?.status)
  const channelState = !evolution
    ? {
        tone: 'border-red-200 bg-red-50 text-red-700',
        label: 'Canal inativo',
        description: 'Evolution nao configurada no sistema.',
      }
    : evolution.status === 'ativo'
      ? {
          tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
          label: 'Canal ativo',
          description: evolution.last_test_at
            ? `Ultimo teste em ${formatDateTime(evolution.last_test_at)}`
            : 'Conectado e pronto para conversar.',
        }
      : evolution.status === 'pendente'
        ? {
            tone: 'border-amber-200 bg-amber-50 text-amber-700',
            label: 'Canal em configuracao',
            description: evolution.last_error || 'A integracao ainda precisa ser validada.',
          }
        : {
            tone: 'border-red-200 bg-red-50 text-red-700',
            label: 'Canal desconectado',
            description: evolution.last_error || 'Falha na comunicacao com a Evolution.',
          }
  const sidebarHighlights = [
    { label: 'Status atual', value: sidebarStatus, tone: 'border-red-200 bg-red-50 text-red-700' },
    { label: 'Produto / motivo', value: leadInfo?.motivo_contato ?? 'Nao informado', tone: 'border-blue-200 bg-blue-50 text-blue-700' },
    { label: 'Ultima mensagem', value: leadInfo?.ultima_mensagem ?? 'Sem historico recente', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
    { label: 'Horario comercial', value: leadInfo?.horario_comercial ? 'Dentro do horario comercial' : 'Fora do horario comercial', tone: leadInfo?.horario_comercial ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700' },
  ]

  return (
    <div ref={panelRef} className="fixed bottom-4 right-4 w-[min(96vw,1040px)] h-[min(88vh,720px)] bg-white dark:bg-gray-950 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col z-50 overflow-hidden">

      {/* Hidden inputs */}
      <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx" className="hidden" onChange={handleFileSelect} />
      <input
        ref={leadDocInputRef}
        type="file"
        accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx"
        className="hidden"
        onChange={event => {
          const file = event.target.files?.[0]
          if (file) void uploadLeadAttachment(file)
        }}
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-[#f7f1e3] via-[#fffdf8] to-[#ecf7f0] dark:from-gray-950 dark:via-gray-950 dark:to-gray-900 border-b border-[#e7dcc3] dark:border-gray-800 shrink-0 shadow-[inset_0_-1px_0_rgba(255,255,255,0.45)]">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-100 via-white to-emerald-50 border border-emerald-200/80 flex items-center justify-center shrink-0 shadow-sm">
          <MessageCircle size={18} className="text-emerald-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 dark:text-gray-100 font-semibold text-sm truncate">{sidebarName}</p>
          <div className="flex items-center gap-2 min-w-0 mt-0.5">
            {sidebarPhone && <p className="text-gray-500 dark:text-gray-400 text-xs truncate">{sidebarPhone}</p>}
            <span className={cn(
              'hidden sm:inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em]',
              channelState.tone,
            )}>
              {channelState.label}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          title="Fechar"
          aria-label="Fechar chat"
          className="w-9 h-9 rounded-xl border border-white/70 bg-white/65 text-gray-600 hover:text-gray-900 dark:hover:text-gray-100 transition-colors shrink-0 flex items-center justify-center shadow-sm backdrop-blur"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 min-h-0 flex flex-col xl:flex-row">
        <div
          className="relative min-h-0 flex flex-col"
          style={{ width: `calc(100% - ${sidebarWidth}px - 12px)` }}
        >
          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1 bg-[#ece5dd] dark:bg-gray-950">
            {!loading && (
              <div className={cn('mx-2 mb-3 rounded-2xl border px-3 py-2 text-xs shadow-sm', channelState.tone)}>
                <div className="font-semibold uppercase tracking-[0.14em]">{channelState.label}</div>
                <div className="mt-1 normal-case tracking-normal">{channelState.description}</div>
              </div>
            )}
            {loading && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-gray-500 text-sm">
                <Loader2 size={20} className="animate-spin" />
                {loadingLabel}
              </div>
            )}

            {!loading && fetchError && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
                {fetchError === 'evolution_not_configured' ? (
                  <>
                    <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <MessageCircle size={22} className="text-gray-400" />
                    </div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Evolution API nao configurada</p>
                    <p className="text-xs text-gray-500 max-w-[200px]">Configure a integração em Configurações → Integrações para usar o chat interno.</p>
                    <div className="mt-1 px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-xs">
                      Configure a integração do WhatsApp para responder direto por aqui.
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-red-500">{fetchError}</p>
                    <button type="button" onClick={() => void init()} className="text-xs text-blue-500 hover:underline">
                      Tentar novamente
                    </button>
                  </>
                )}
              </div>
            )}

            {!loading && !fetchError && messages.length === 0 && (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                Nenhuma mensagem ainda. Diga ola.
              </div>
            )}

            {!loading && !fetchError && messages.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                evolution={evolution}
                onReply={selected => setReplyTo(selected)}
              />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* File preview bar */}
          {pendingFile && (
            <div className="px-3 py-2 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2 shrink-0">
              {pendingPreview
                ? <img src={pendingPreview} alt="" className="h-12 w-12 object-cover rounded-lg shrink-0" />
                : <div className="h-12 w-12 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center text-[10px] text-gray-500 text-center px-1 shrink-0">{pendingFile.name.split('.').pop()?.toUpperCase()}</div>
              }
              <span className="flex-1 text-xs text-gray-600 dark:text-gray-300 truncate min-w-0">{pendingFile.name}</span>
              <button type="button" onClick={() => void handleFileSend()} disabled={sending || !remoteJid}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg disabled:opacity-50 shrink-0">
                {sending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Enviar
              </button>
              <button type="button" onClick={clearFile} className="p-1 text-gray-400 hover:text-red-500 shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          )}

          {/* Audio preview bar */}
          {recState === 'preview' && audioUrl && (
            <div className="px-3 py-2 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex items-center gap-2 shrink-0">
              <audio src={audioUrl} controls className="h-8 flex-1 min-w-0" />
              <button type="button" onClick={() => void sendAudio()} disabled={sending || !remoteJid}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg disabled:opacity-50 shrink-0">
                {sending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />} Enviar
              </button>
              <button type="button" onClick={discardAudio} className="p-1 text-gray-400 hover:text-red-500 shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          )}

          {/* Emoji picker */}
          {showEmoji && (
            <div className="absolute bottom-[68px] left-4 w-72 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-2.5 z-10">
              <div className="grid grid-cols-8 gap-0.5">
                {EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => insertEmoji(e)}
                    className="w-8 h-8 text-lg flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="px-2 py-2 bg-[#f0f2f5] dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shrink-0">
            <div className="mb-2 flex items-center gap-2">
              {[
                { id: 'mensagem', label: 'Mensagem ao cliente' },
                { id: 'nota_interna', label: 'Nota interna' },
              ].map(mode => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setComposerMode(mode.id as 'mensagem' | 'nota_interna')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                    composerMode === mode.id
                      ? mode.id === 'nota_interna'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700',
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            {replyTo && (
              <div className="mb-2 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="mt-0.5 text-emerald-600"><CornerUpLeft size={14} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                    Respondendo {replyTo.fromMe ? 'sua mensagem' : 'ao contato'}
                  </p>
                  <p className="mt-1 text-sm text-emerald-900 truncate">
                  {replyTo.content ?? (replyTo.messageType === 'audioMessage' ? 'Audio' : 'Mensagem')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="text-emerald-700 hover:text-emerald-900"
                title="Cancelar resposta"
              >
                <X size={14} />
              </button>
            </div>
          )}

            {composerMode === 'nota_interna' && (
              <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Esta nota fica somente na timeline interna do atendimento e não será enviada ao cliente.
              </div>
            )}

            {/* Recording indicator */}
            {recState === 'recording' && (
              <div className="flex items-center gap-2 mb-1.5 px-1">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                <span className="text-sm text-red-500 font-medium">{fmtTime(recSecs)}</span>
                <span className="text-xs text-gray-500">Gravando...</span>
                <button type="button" onClick={stopRecording}
                  className="ml-auto flex items-center gap-1 px-2 py-1 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg text-xs">
                  <StopCircle size={12} /> Parar
                </button>
                <button type="button" onClick={discardAudio}
                  className="p-1 text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            )}

            <div className="flex items-end gap-1.5 bg-white dark:bg-gray-800 rounded-2xl px-2 py-1.5 border border-gray-200 dark:border-gray-700">
              {/* Emoji button */}
              <button type="button" onClick={() => setShowEmoji(v => !v)} title="Emojis"
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-full transition-colors shrink-0 self-end mb-0.5',
                  showEmoji ? 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/30' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
                )}>
                <Smile size={20} />
              </button>

              {/* File attachment button */}
              <button type="button" onClick={() => fileInputRef.current?.click()} title="Anexar arquivo"
                disabled={!!pendingFile || recState !== 'idle'}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors shrink-0 self-end mb-0.5 disabled:opacity-40">
                <Paperclip size={20} />
              </button>

              {/* Text area */}
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={composerMode === 'nota_interna' ? 'Escreva uma nota interna ou lembrete do contato' : 'Mensagem'}
                rows={1}
                disabled={(composerMode === 'nota_interna' ? !canUseInternalNotes : !canSend) || recState !== 'idle'}
                className="flex-1 resize-none max-h-28 bg-transparent text-sm py-1.5 focus:outline-none dark:text-gray-100 placeholder-gray-400 overflow-y-auto disabled:opacity-50 leading-relaxed"
                onInput={e => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = `${Math.min(el.scrollHeight, 112)}px`
                }}
              />

              {/* Send / Mic button */}
              {input.trim() ? (
                <button type="button" onClick={() => void handleSend()}
                  disabled={sending || (composerMode === 'nota_interna' ? !canUseInternalNotes : !canSend)}
                  className={cn(
                    'w-9 h-9 flex items-center justify-center disabled:opacity-40 text-white rounded-full transition-colors shrink-0 self-end',
                    composerMode === 'nota_interna' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-green-600 hover:bg-green-700',
                  )}>
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              ) : (
                <button type="button"
                  onClick={recState === 'idle' ? () => void startRecording() : stopRecording}
                  disabled={recState === 'preview' || !canSend}
                  title={recState === 'idle' ? 'Gravar áudio' : 'Parar gravação'}
                  className={cn(
                    'w-9 h-9 flex items-center justify-center rounded-full transition-colors shrink-0 self-end disabled:opacity-40',
                    recState === 'recording'
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300',
                  )}>
                  {recState === 'recording' ? <StopCircle size={20} /> : <Mic size={20} />}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="hidden xl:flex w-3 shrink-0 items-stretch justify-center bg-gradient-to-b from-[#f8f5ee] via-white to-[#f3f8f4] dark:from-gray-950 dark:via-gray-950 dark:to-gray-900">
          <button
            type="button"
            onMouseDown={() => setIsResizingSidebar(true)}
            className={cn(
              'group relative h-full w-3 cursor-col-resize active:bg-emerald-50 dark:active:bg-emerald-900/20',
              isResizingSidebar && 'bg-emerald-50 dark:bg-emerald-900/20',
            )}
            title="Ajustar largura entre chat e informacoes"
            aria-label="Ajustar largura do painel lateral"
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-300 transition-colors group-hover:bg-emerald-400 dark:bg-gray-700 dark:group-hover:bg-emerald-500" />
            <span className="absolute top-1/2 left-1/2 h-10 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gray-300 transition-colors group-hover:bg-emerald-400 dark:bg-gray-700 dark:group-hover:bg-emerald-500" />
          </button>
        </div>

        <aside
          className="min-h-0 overflow-y-auto bg-white dark:bg-gray-950 border-t xl:border-t-0 border-gray-200 dark:border-gray-800 shrink-0"
          style={{ width: `${sidebarWidth}px` }}
        >
          <div className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Contato em tempo real</p>
                <h3 className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{sidebarName}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 break-all">{sidebarPhone ?? 'Sem telefone cadastrado'}</p>
              </div>
              <button
                type="button"
                onClick={() => void loadLeadInfo()}
                className="w-9 h-9 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-600 flex items-center justify-center shrink-0"
                title="Atualizar dados do contato"
              >
                <RefreshCw size={15} className={cn(leadLoading && 'animate-spin')} />
              </button>
            </div>

            {copyFeedback && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                {copyFeedback}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2">
              {sidebarHighlights.map(item => (
                <div key={item.label} className={cn('rounded-2xl border px-3 py-3', item.tone)}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-75">{item.label}</p>
                  <p className="mt-1 text-sm font-medium leading-snug">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50/80 dark:bg-gray-900/60 p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Acoes rapidas</p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setEditingLead(true)}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:border-indigo-300 hover:text-indigo-700"
                >
                  <Pencil size={14} /> Editar informacoes
                </button>
                <button
                  type="button"
                  onClick={() => leadDocInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:border-amber-300 hover:text-amber-700"
                >
                  {uploadingLeadAttachment ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                  Salvar documento no contato
                </button>
                <button
                  type="button"
                  onClick={() => void copyText(sidebarPhone, 'Telefone')}
                  disabled={!sidebarPhone}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:border-green-300 hover:text-green-700 disabled:opacity-50"
                >
                  <Copy size={14} /> Copiar telefone
                </button>
                <button
                  type="button"
                  onClick={() => void copyText(remoteJid, 'JID')}
                  disabled={!remoteJid}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:border-blue-300 hover:text-blue-700 disabled:opacity-50"
                >
                  <MessageCircle size={14} /> Copiar identificador da conversa
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Dados do atendimento</p>
              <InfoRow icon={<Phone size={14} />} label="Telefone" value={sidebarPhone} />
              <InfoRow icon={<MessageCircle size={14} />} label="Responsavel atual" value={leadInfo?.responsavel_nome ?? 'Nao definido'} />
              <InfoRow icon={<Clock3 size={14} />} label="Transferido em" value={formatDateTime(leadInfo?.transferido_em)} />
              <InfoRow icon={<MessageCircle size={14} />} label="Transferido por" value={leadInfo?.transferido_por} />
              <InfoRow icon={<Clock3 size={14} />} label="Criado em" value={formatDateTime(leadInfo?.created_at)} />
              <InfoRow icon={<CalendarClock size={14} />} label="Agendamento" value={formatDateTime(leadInfo?.data_agendamento)} />
              <InfoRow icon={<CalendarClock size={14} />} label="Retorno criado" value={formatDateTime(leadInfo?.agendamento_criado_em)} />
              <InfoRow icon={<MessageCircle size={14} />} label="Instancia" value={leadInfo?.evolution_instance ?? contact.evolution_instance ?? evolution?.instance_name ?? 'Nao informada'} />
              <InfoRow icon={<MessageCircle size={14} />} label="JID" value={remoteJid ?? leadInfo?.evolution_remote_jid ?? 'Ainda nao vinculado'} mono />
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Transferir conversa</p>
                {!hasTransferFields && (
                  <span className="text-[11px] text-amber-600">Migration pendente</span>
                )}
              </div>
              <SidebarSelect
                label="Atendente / agente responsavel"
                value={selectedTransferId}
                onChange={setSelectedTransferId}
                options={[
                  { value: '', label: loadingTargets ? 'Carregando...' : 'Selecione o destino' },
                  ...transferTargets.map(target => ({
                    value: target.id,
                    label: `${target.nome} · ${target.perfil === 'agente_registro' ? 'Agente' : target.perfil === 'usuario' ? 'Operador' : 'Admin'}`,
                  })),
                ]}
              />
              <button
                type="button"
                onClick={() => void transferConversation()}
                disabled={transferringLead || !selectedTransferId || loadingTargets}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white px-3 py-2.5 text-sm font-medium disabled:opacity-50"
              >
                {transferringLead ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Transferir atendimento
              </button>
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Documentos do contato</p>
                {!hasDocumentTable && (
                  <span className="text-[11px] text-amber-600">Migration pendente</span>
                )}
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[11px] text-gray-600">
                Armazenamento atual: <span className="font-semibold">{documentStorageConfig.mode === 'server' ? 'Servidor próprio' : 'Supabase Storage'}</span>
              </div>

              {leadAttachments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-400">
                  Nenhum documento salvo neste contato ainda.
                </div>
              ) : (
                <div className="space-y-2">
                  {leadAttachments.map(doc => (
                    <div key={doc.id} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{doc.nome_original}</p>
                          <p className="text-xs text-gray-500">
                            {doc.mime_type || 'arquivo'} · {doc.tamanho_bytes ? `${Math.round(doc.tamanho_bytes / 1024)} KB` : 'tamanho n/d'}
                          </p>
                          {doc.storage_provider && (
                            <p className="text-[11px] text-gray-400 mt-1">
                              {doc.storage_provider === 'server' ? 'Servidor próprio' : 'Supabase Storage'}
                            </p>
                          )}
                          {doc.bucket && doc.storage_path && (
                            <p className="text-[11px] text-gray-400 mt-1 truncate">
                              {doc.bucket}/{doc.storage_path}
                            </p>
                          )}
                          {doc.external_url && !doc.bucket && (
                            <p className="text-[11px] text-gray-400 mt-1 truncate">
                              {doc.external_url}
                            </p>
                          )}
                          <p className="text-[11px] text-gray-400 mt-1">
                            {formatDateTime(doc.uploaded_at)} · {doc.uploaded_by || 'Operador'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => void openLeadAttachment(doc)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Abrir
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeLeadAttachment(doc.id)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {editingLead ? (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Editar contato e agendamento</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelLeadEdit}
                      className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:text-gray-900"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveLeadInfo()}
                      disabled={savingLead}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs disabled:opacity-50"
                    >
                      {savingLead ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                      Salvar
                    </button>
                  </div>
                </div>

                <SidebarInput
                  label="Nome"
                  value={leadForm.nome_lead}
                  onChange={value => setLeadForm(prev => ({ ...prev, nome_lead: value }))}
                />
                <SidebarInput
                  label="WhatsApp"
                  value={leadForm.whatsapp_lead}
                  onChange={value => setLeadForm(prev => ({ ...prev, whatsapp_lead: value }))}
                />
                <SidebarInput
                  label="Produto / motivo"
                  value={leadForm.motivo_contato}
                  onChange={value => setLeadForm(prev => ({ ...prev, motivo_contato: value }))}
                />

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <SidebarSelect
                    label="Etapa atual"
                    value={leadForm.status}
                    onChange={value => setLeadForm(prev => ({ ...prev, status: value }))}
                    options={[
                      { value: 'iniciou_conversa', label: 'Iniciou Conversa' },
                      { value: 'conversando', label: 'Conversando' },
                      { value: 'agendado', label: 'Agendado' },
                      { value: 'cliente', label: 'Cliente' },
                      { value: 'follow_up', label: 'Follow Up' },
                      { value: 'cancelou_agendamento', label: 'Cancelou Agendamento' },
                      { value: 'perdido', label: 'Perdido' },
                    ]}
                  />
                  <SidebarDateTimeInput
                    label="Agendar retorno"
                    value={leadForm.data_agendamento}
                    onChange={value => setLeadForm(prev => ({ ...prev, data_agendamento: value }))}
                  />
                </div>

                <SidebarTextArea
                  label="Resumo da conversa"
                  value={leadForm.resumo_conversa}
                  onChange={value => setLeadForm(prev => ({ ...prev, resumo_conversa: value }))}
                  rows={3}
                />
                <SidebarTextArea
                  label="Anotacoes"
                  value={leadForm.anotacoes}
                  onChange={value => setLeadForm(prev => ({ ...prev, anotacoes: value }))}
                  rows={3}
                />
                <SidebarTextArea
                  label="Follow up 1"
                  value={leadForm.follow_up_1}
                  onChange={value => setLeadForm(prev => ({ ...prev, follow_up_1: value }))}
                  rows={2}
                />
                <SidebarTextArea
                  label="Follow up 2"
                  value={leadForm.follow_up_2}
                  onChange={value => setLeadForm(prev => ({ ...prev, follow_up_2: value }))}
                  rows={2}
                />
                <SidebarTextArea
                  label="Follow up 3"
                  value={leadForm.follow_up_3}
                  onChange={value => setLeadForm(prev => ({ ...prev, follow_up_3: value }))}
                  rows={2}
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Resumo comercial</p>
                <LongTextBlock label="Resumo da conversa" value={leadInfo?.resumo_conversa} />
                <LongTextBlock label="Anotacoes" value={leadInfo?.anotacoes} />
                <LongTextBlock label="Follow up 1" value={leadInfo?.follow_up_1} />
                <LongTextBlock label="Follow up 2" value={leadInfo?.follow_up_2} />
                <LongTextBlock label="Follow up 3" value={leadInfo?.follow_up_3} />
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value, mono = false }: { icon: React.ReactNode; label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 text-gray-400 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className={cn('mt-0.5 text-sm text-gray-700 dark:text-gray-200 break-words', mono && 'font-mono text-[12px]')}>
          {value || 'Nao informado'}
        </p>
      </div>
    </div>
  )
}

function LongTextBlock({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">
        {value || 'Nao informado'}
      </p>
    </div>
  )
}

function SidebarInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-indigo-400"
      />
    </label>
  )
}

function SidebarTextArea({ label, value, onChange, rows }: { label: string; value: string; onChange: (value: string) => void; rows: number }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-1 w-full resize-y rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-indigo-400"
      />
    </label>
  )
}

function SidebarDateTimeInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <input
        type="datetime-local"
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-indigo-400"
      />
    </label>
  )
}

function SidebarSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-indigo-400"
      >
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

// ── MessageBubble ──────────────────────────────────────────────

function MessageBubble({
  message,
  evolution,
  onReply,
}: {
  message: Message
  evolution: EvolutionCfg | null
  onReply?: (message: Message) => void
}) {
  const isOut     = message.fromMe
  const isInternalNote = message.messageType === 'internalNote' || message.eventType === 'internal_note' || message.source === 'crm'
  const isImage   = message.messageType === 'imageMessage'
  const isAudio   = message.messageType === 'audioMessage'
  const isVideo   = message.messageType === 'videoMessage'
  const isDoc     = message.messageType === 'documentMessage'
  const needsResolvedMedia = isAudio || isImage || isVideo || isDoc
  const time      = new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string | null>(message.mediaUrl ?? null)
  const audioLabel = message.fromMe ? 'Audio enviado' : 'Audio recebido'

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null

    async function resolveMedia() {
      if (!needsResolvedMedia || !evolution || !message.messageId) return
      try {
        objectUrl = await fetchMediaObjectUrl(evolution, message.messageId, isVideo)
        if (active) setResolvedMediaUrl(objectUrl)
      } catch (error) {
        logger.error('ChatPanel', 'falha ao resolver midia recebida', String(error))
      }
    }

    if (needsResolvedMedia) {
      void resolveMedia()
    } else {
      setResolvedMediaUrl(message.mediaUrl ?? null)
    }

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [evolution, isVideo, needsResolvedMedia, message.fromMe, message.mediaUrl, message.messageId])

  return (
    <div className={cn('flex px-2', isOut ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[82%] rounded-2xl px-3 py-2 text-sm shadow-sm',
        isAudio && 'min-w-[240px] sm:min-w-[280px]',
        isInternalNote && 'border border-amber-200 bg-amber-50 text-amber-900 rounded-bl-2xl rounded-br-2xl',
        isOut
          ? (isInternalNote ? '' : 'bg-[#d9fdd3] dark:bg-green-800 text-gray-900 dark:text-gray-100 rounded-br-none')
          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-none',
      )}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {isInternalNote ? (
              <p className="text-[10px] font-bold text-amber-700 mb-0.5">Nota interna{message.pushName ? ` · ${message.pushName}` : ''}</p>
            ) : !isOut && message.pushName && (
              <p className="text-[10px] font-bold text-green-600 dark:text-green-400 mb-0.5">{message.pushName}</p>
            )}

            {message.quoted && (
              <div className="mb-2 rounded-xl border-l-4 border-emerald-400 bg-emerald-50/80 dark:bg-emerald-900/20 px-2.5 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Resposta</p>
                <p className="mt-1 text-xs text-emerald-900 dark:text-emerald-100 break-words">
                  {message.quoted.content}
                </p>
              </div>
            )}

            {isImage && (
              resolvedMediaUrl ? (
                <a href={resolvedMediaUrl} target="_blank" rel="noreferrer" className="block mb-1">
                  <img src={resolvedMediaUrl} alt="imagem" className="max-w-full rounded-xl" />
                </a>
              ) : (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-500 mb-1">
                  Carregando imagem...
                </div>
              )
            )}
            {isAudio && (
              <div className="mb-1.5 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-violet-700 dark:text-violet-300">
                  <span className="text-sm">♪</span>
                  <span>{audioLabel}</span>
                </div>
                {resolvedMediaUrl ? (
                  <audio src={resolvedMediaUrl} controls className="w-full min-w-0 h-10" preload="metadata" />
                ) : (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-500">
                    Carregando audio...
                  </div>
                )}
              </div>
            )}
            {isVideo && (
              resolvedMediaUrl ? (
                <div className="mb-1.5 space-y-2">
                  <video src={resolvedMediaUrl} controls className="max-w-full rounded-xl" preload="metadata" />
                  <a href={resolvedMediaUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                    Abrir video em nova aba
                  </a>
                </div>
              ) : (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-500 mb-1">
                  Carregando video...
                </div>
              )
            )}
            {isDoc && (
              resolvedMediaUrl ? (
                <a href={resolvedMediaUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline text-xs mb-1">
                  📎 {message.content ?? 'arquivo'}
                </a>
              ) : (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-xs text-gray-500 mb-1">
                  Carregando arquivo...
                </div>
              )
            )}

            {message.content && !isDoc && !isAudio && !isVideo && (
              <p className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
            )}
          </div>

          {onReply && !isInternalNote && (
            <button
              type="button"
              onClick={() => onReply(message)}
              className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-black/5 hover:text-emerald-700"
              title="Responder esta mensagem"
            >
              <CornerUpLeft size={14} />
            </button>
          )}
        </div>
        <p className={cn('text-[10px] mt-0.5 text-right leading-none', isOut ? 'text-green-700 dark:text-green-300' : 'text-gray-400')}>
          {time}
        </p>
      </div>
    </div>
  )
}


