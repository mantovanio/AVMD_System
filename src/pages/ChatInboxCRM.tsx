import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  ChevronDown,
  Clock3,
  Columns3,
  List,
  Loader2,
  Mail,
  MessageCircle,
  Mic,
  Paperclip,
  Phone,
  RefreshCw,
  Search,
  Send,
  Smile,
  StopCircle,
  Save,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  UserRound,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getApiUrl } from '@/lib/api'
import { logger } from '@/lib/logger'
import { useAuth } from '@/contexts/AuthContext'
import { applyOutgoingSignature, DEFAULT_CRM_CHAT_SETTINGS, loadCrmChatSettings } from '@/lib/crmChatSettings'

type QueueType = 'atendimento' | 'renovacao' | 'email'
type DirectionType = 'incoming' | 'outgoing'
type SenderType = 'cliente' | 'ia' | 'humano'
type RecState = 'idle' | 'recording' | 'preview'

interface ConversationRow {
  id: string
  document_key: string
  telefone: string | null
  cliente_nome: string | null
  whatsapp_instance: string | null
  numero_receptor: string | null
  fila: QueueType
  kanban_status: string
  atendimento_humano: boolean
  agente_nome: string | null
  ultima_mensagem: string | null
  ultima_mensagem_direcao: DirectionType | null
  ultima_interacao_em: string
  created_at: string
  crm_customer_id: string | null
  nome_crm: string | null
  email_principal: string | null
  cpf: string | null
  cnpj: string | null
  observacoes: string | null
  contato_status: string | null
  agente_atual: string | null
  agente_desde: string | null
}

interface CrmMessage {
  id: string
  conversation_id: string
  document_key: string
  external_message_id?: string | null
  direction: DirectionType
  sender_type: SenderType
  sender_name?: string | null
  mensagem: string | null
  mime_type?: string | null
  file_name?: string | null
  media_url?: string | null
  created_at: string
}

interface EvolutionEventRow {
  id: string
  event_type: string | null
  payload: Record<string, unknown> | null
  created_at: string
  source?: string | null
}

interface AgentOption {
  id: string
  nome: string
  perfil: string
}

interface RenovacaoCRM {
  id: string
  cliente: string | null
  razao_social: string | null
  tipo_certificado: string
  data_vencimento: string
  dias_restantes: number
  valor: number | null
  prioridade: string
  status: string
  pedido: string | null
  protocolo: string | null
}

interface EvolutionIntegration {
  id: string
  name: string | null
  status: string | null
  base_url: string | null
  api_token: string | null
  instance_name: string | null
  sender_name?: string | null
}

interface ManualConversationForm {
  contactName: string
  phone: string
  queue: QueueType
  integrationId: string
  firstMessage: string
}

interface ContactEditForm {
  name: string
  phone: string
  email: string
  status: string
  observations: string
}

const CHAT_ATTACHMENT_BUCKET = 'chat-lead-documentos'

const STATUS_COLUMNS = [
  { key: 'iniciou_conversa', label: 'Iniciou Conversa', tone: 'amber' },
  { key: 'conversando', label: 'Conversando', tone: 'blue' },
  { key: 'agendado', label: 'Agendado', tone: 'green' },
  { key: 'follow_up', label: 'Follow Up', tone: 'orange' },
  { key: 'cancelou_agendamento', label: 'Cancelou', tone: 'red' },
  { key: 'perdido', label: 'Perdido', tone: 'zinc' },
] as const

const STATUS_OPTIONS = [
  ...STATUS_COLUMNS,
  { key: 'resolvido', label: 'Resolvido', tone: 'green' },
  { key: 'arquivado', label: 'Arquivado', tone: 'slate' },
] as const

const CLOSED_KANBAN_STATUSES = new Set([
  'perdido',
  'cancelou_agendamento',
  'resolvido',
  'resolvida',
  'resolved',
  'arquivado',
  'arquivada',
  'finalizado',
  'finalizada',
  'encerrado',
  'encerrada',
  'closed',
  'archived',
])

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map(item => [item.key, item.label]),
)

const TONE_STYLES: Record<string, string> = {
  amber: 'border-amber-200 bg-amber-50',
  blue: 'border-blue-200 bg-blue-50',
  green: 'border-green-200 bg-green-50',
  violet: 'border-violet-200 bg-violet-50',
  orange: 'border-orange-200 bg-orange-50',
  red: 'border-red-200 bg-red-50',
  sky: 'border-sky-200 bg-sky-50',
  zinc: 'border-zinc-200 bg-zinc-50',
}

const EMOJIS = ['😊', '😂', '🥰', '😍', '😘', '😁', '😎', '🤩', '😜', '😅', '😭', '😤', '🙏', '👍', '👏', '🙌', '💪', '🤝', '👋', '✌️', '❤️', '🔥', '✨', '⭐', '🎉', '🎯', '✅', '❌', '⚠️', '📌', '📎', '📞']

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Nao informado'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelative(value: string | null | undefined) {
  if (!value) return 'Sem interacao'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  return `${days} d`
}

function minutesSince(value: string | null | undefined) {
  if (!value) return 0
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000))
}

function formatRecTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ')
}

function normalizeKanbanStatus(status: string | null | undefined) {
  if (status === 'cliente') return 'conversando'
  return status ?? ''
}

function isClosedConversationStatus(status: string | null | undefined) {
  return Boolean(status && CLOSED_KANBAN_STATUSES.has(status))
}

function normalizeMimeType(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, '')
}

function isImageMime(value: string | null | undefined) {
  return normalizeMimeType(value).startsWith('image/')
}

function isAudioMime(value: string | null | undefined) {
  return normalizeMimeType(value).startsWith('audio/')
}

function isVideoMime(value: string | null | undefined) {
  return normalizeMimeType(value).startsWith('video/')
}

function isDocumentMime(value: string | null | undefined) {
  const normalized = normalizeMimeType(value)
  return Boolean(normalized && !isImageMime(normalized) && !isAudioMime(normalized) && !isVideoMime(normalized))
}

function queueLabel(fila: QueueType) {
  if (fila === 'renovacao') return 'Renovacao'
  if (fila === 'email') return 'Email'
  return 'Atendimento'
}

function hasRegisteredCustomer(item: ConversationRow | null | undefined) {
  if (!item) return false
  return Boolean(item.crm_customer_id || item.nome_crm || item.email_principal || item.cpf || item.cnpj)
}

function getUrgencyMeta(item: ConversationRow, humanActive: boolean) {
  if (item.ultima_mensagem_direcao !== 'incoming') return null
  const waitingMinutes = minutesSince(item.ultima_interacao_em)
  if (humanActive && waitingMinutes >= 30) return { label: 'Aguardando humano', tone: 'red' as const }
  if (!humanActive && waitingMinutes >= 20) return { label: 'Sem retorno', tone: 'red' as const }
  if (waitingMinutes >= 8) return { label: 'Atencao', tone: 'amber' as const }
  return null
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('55')) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

function normalizeDigits(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '')
}

function phoneMatchesQuery(item: ConversationRow, queryDigits: string) {
  if (!queryDigits) return false
  const candidates = [
    item.telefone ?? '',
    item.document_key ?? '',
    item.cliente_nome ?? '',
    item.nome_crm ?? '',
  ]

  return candidates.some(candidate => {
    const digits = normalizeDigits(candidate)
    return Boolean(
      digits
      && (
        digits === queryDigits
        || digits.endsWith(queryDigits)
        || queryDigits.endsWith(digits)
      ),
    )
  })
}

function inferQueueFromIntegration(integration: Pick<EvolutionIntegration, 'name' | 'instance_name' | 'sender_name'>) {
  const instance = (integration.instance_name ?? '').toLowerCase()
  const label = `${integration.name ?? ''} ${integration.sender_name ?? ''}`.toLowerCase()
  if (instance === 'renovacao' || instance === 'certiid') return 'renovacao'
  if (instance === 'atendimento') return 'atendimento'
  return label.includes('renov') ? 'renovacao' : 'atendimento'
}

function integrationDisplayName(integration: EvolutionIntegration) {
  return integration.sender_name || integration.name || integration.instance_name || 'Instancia sem nome'
}

function integrationChannelLabel(integration: EvolutionIntegration) {
  const queue = inferQueueFromIntegration(integration)
  const instance = integration.instance_name ? ` (${integration.instance_name})` : ''
  return `${queueLabel(queue)} - ${integrationDisplayName(integration)}${instance}`
}

function createEmptyManualConversationForm(): ManualConversationForm {
  return {
    contactName: '',
    phone: '',
    queue: 'atendimento',
    integrationId: '',
    firstMessage: '',
  }
}

function safeAttachmentName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.\- ]+/g, '').trim() || `arquivo-${Date.now()}`
}

function parseEvolutionEventMessages(events: EvolutionEventRow[]): CrmMessage[] {
  return events
    .filter(event => event.source === 'evolution' || event.source === 'chatwoot')
    .map(event => {
      const payload = event.payload ?? {}
      const data = (payload.data as Record<string, unknown> | undefined) ?? undefined
      const fromMe = Boolean(payload.fromMe ?? data?.fromMe)
      const senderType = (payload.senderType as SenderType | undefined)
        ?? (fromMe ? 'humano' : 'cliente')
      const messageType = (payload.messageType as string | undefined)
        ?? (data?.messageType as string | undefined)
        ?? 'conversation'
      const content = (payload.content as string | undefined)
        ?? (data?.content as string | undefined)
        ?? null
      const mimeType = (payload.mimeType as string | undefined)
        ?? (data?.mimeType as string | undefined)
        ?? null
      const fileName = (payload.fileName as string | undefined)
        ?? (data?.fileName as string | undefined)
        ?? null
      const mediaUrl = (payload.mediaUrl as string | undefined)
        ?? (data?.mediaUrl as string | undefined)
        ?? null
      const externalMessageId = (payload.messageId as string | undefined)
        ?? (payload.externalId as string | undefined)
        ?? (data?.messageId as string | undefined)
        ?? null

      return {
        id: externalMessageId ? `evo-${externalMessageId}` : String(event.id),
        conversation_id: String(payload.conversationId ?? payload.remoteJid ?? payload.chatId ?? ''),
        document_key: String(payload.documentKey ?? payload.remoteJid ?? payload.contact ?? ''),
        external_message_id: externalMessageId,
        direction: (fromMe ? 'outgoing' : 'incoming') as DirectionType,
        sender_type: senderType,
        sender_name: (payload.pushName as string | undefined) ?? (data?.pushName as string | undefined) ?? null,
        mensagem: content,
        mime_type: mimeType,
        file_name: fileName,
        media_url: mediaUrl,
        created_at: event.created_at,
      }
    })
    .filter(message => Boolean(message.conversation_id))
}

function mergeConversationMessages(messages: CrmMessage[]) {
  const ordered = [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const seenExternalIds = new Set<string>()
  const seenSignatures = new Set<string>()
  const result: CrmMessage[] = []

  for (const message of ordered) {
    const content = (message.mensagem ?? '').trim().replace(/\s+/g, ' ')
    const externalId = message.external_message_id?.trim() || (message.id.startsWith('evo-') ? message.id.slice(4) : '')
    if (externalId) {
      if (seenExternalIds.has(externalId)) continue
      seenExternalIds.add(externalId)
    }

    const signature = [
      message.direction,
      message.sender_type,
      message.mime_type ?? '',
      message.file_name ?? '',
      content.toLowerCase(),
      message.created_at.slice(0, 16),
    ].join('|')

    if (seenSignatures.has(signature)) continue
    seenSignatures.add(signature)
    result.push(message)
  }

  return result
}

export default function ChatInboxCRM() {
  const { profile } = useAuth()
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [messages, setMessages] = useState<CrmMessage[]>([])
  const [conversationPreviews, setConversationPreviews] = useState<Record<string, CrmMessage[]>>({})
  const [agents, setAgents] = useState<AgentOption[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deepLinkPhone, setDeepLinkPhone] = useState<string | null>(() => {
    const phone = sessionStorage.getItem('crm:open-chat-phone')
    if (phone) sessionStorage.removeItem('crm:open-chat-phone')
    return phone ?? null
  })
  const [deepLinkNome, setDeepLinkNome] = useState<string>(() => {
    const nome = sessionStorage.getItem('crm:open-chat-nome') ?? ''
    sessionStorage.removeItem('crm:open-chat-nome')
    return nome
  })
  const [deepLinkMsg, setDeepLinkMsg] = useState<string>(() => {
    const msg = sessionStorage.getItem('crm:open-chat-msg') ?? ''
    sessionStorage.removeItem('crm:open-chat-msg')
    return msg
  })
  const [deepLinkContexto, setDeepLinkContexto] = useState<Record<string, string> | null>(() => {
    try {
      const raw = sessionStorage.getItem('crm:open-chat-contexto')
      sessionStorage.removeItem('crm:open-chat-contexto')
      return raw ? JSON.parse(raw) as Record<string, string> : null
    } catch { return null }
  })
  const [renovacoesCRM, setRenovacoesCRM] = useState<RenovacaoCRM[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [queueFilter, setQueueFilter] = useState<'todas' | QueueType>('todas')
  const [humanFilter, setHumanFilter] = useState<'todos' | 'ia' | 'humano'>('todos')
  const [showClosedConversations, setShowClosedConversations] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [viewMode, setViewMode] = useState<'lista' | 'kanban'>('lista')
  const [kanbanOpen, setKanbanOpen] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [draggedConversationId, setDraggedConversationId] = useState<string | null>(null)
  const [humanMessage, setHumanMessage] = useState('')
  const [sendingHumanMessage, setSendingHumanMessage] = useState(false)
  const [manualConversationOpen, setManualConversationOpen] = useState(false)
  const [manualConversationLoading, setManualConversationLoading] = useState(false)
  const [manualConversationError, setManualConversationError] = useState<string | null>(null)
  const [integrations, setIntegrations] = useState<EvolutionIntegration[]>([])
  const [manualConversation, setManualConversation] = useState<ManualConversationForm>(createEmptyManualConversationForm)
  const [selectedReplyIntegrationId, setSelectedReplyIntegrationId] = useState('')
  const [selectedReplyIntegrationConversationId, setSelectedReplyIntegrationConversationId] = useState<string | null>(null)
  const [signOutgoingMessages, setSignOutgoingMessages] = useState(DEFAULT_CRM_CHAT_SETTINGS.sign_outgoing_messages)
  const [chatSettingsLoading, setChatSettingsLoading] = useState(true)
  const [leftPanelWidth, setLeftPanelWidth] = useState(420)
  const [rightPanelWidth, setRightPanelWidth] = useState(330)
  const [isResizingLeft, setIsResizingLeft] = useState(false)
  const [isResizingRight, setIsResizingRight] = useState(false)
  const [humanOverrideIds, setHumanOverrideIds] = useState<string[]>([])
  const [showEmoji, setShowEmoji] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [recState, setRecState] = useState<RecState>('idle')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [recSecs, setRecSecs] = useState(0)
  const [contactEdit, setContactEdit] = useState<ContactEditForm>({
    name: '',
    phone: '',
    email: '',
    status: '',
    observations: '',
  })
  const [contactEditSaving, setContactEditSaving] = useState(false)
  const [contactEditError, setContactEditError] = useState<string | null>(null)

  const layoutRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  const inboxListRef = useRef<HTMLDivElement>(null)
  const messagesViewportRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastRenderedMessageCountRef = useRef(0)
  const lastScrolledConversationRef = useRef<string | null>(null)
  const lastConversationSnapshotRef = useRef('')
  const lastMessageSnapshotRef = useRef('')
  const pendingMessageReloadRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingConversationReloadRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedConversation = useMemo(
    () => conversations.find(item => item.id === selectedId) ?? null,
    [conversations, selectedId],
  )

  const humanModeActive = useMemo(
    () => Boolean(selectedConversation && (selectedConversation.atendimento_humano || humanOverrideIds.includes(selectedConversation.id))),
      [humanOverrideIds, selectedConversation],
    )

  const currentHumanAgentName = selectedConversation?.agente_atual
    || selectedConversation?.agente_nome
    || profile?.nome
    || 'Humano'

  const displayMessages = useMemo(() => {
    if (messages.length > 0) return messages
    if (!selectedConversation?.ultima_mensagem) return []

    const fallbackDirection = selectedConversation.ultima_mensagem_direcao ?? 'incoming'
    const fallbackSenderType: SenderType =
      fallbackDirection === 'incoming'
        ? 'cliente'
        : (selectedConversation.atendimento_humano || humanOverrideIds.includes(selectedConversation.id))
          ? 'humano'
          : 'ia'

    const fallbackSenderName =
      fallbackSenderType === 'humano'
        ? currentHumanAgentName
        : fallbackSenderType === 'ia'
          ? 'IA Clara'
          : selectedConversation.cliente_nome || selectedConversation.nome_crm || 'Cliente'

    return [{
      id: `fallback-${selectedConversation.id}-${selectedConversation.ultima_interacao_em}`,
      conversation_id: selectedConversation.id,
      document_key: selectedConversation.document_key,
      direction: fallbackDirection,
      sender_type: fallbackSenderType,
      sender_name: fallbackSenderName,
      mensagem: selectedConversation.ultima_mensagem,
      created_at: selectedConversation.ultima_interacao_em,
    }]
  }, [messages, selectedConversation, currentHumanAgentName, humanOverrideIds])

  const manualChannelOptions = useMemo(() => {
    const preferredByQueue = new Map<QueueType, EvolutionIntegration>()

    for (const integration of integrations) {
      const queue = inferQueueFromIntegration(integration)
      const current = preferredByQueue.get(queue)
      const isPreferred = integration.instance_name?.toLowerCase() === queue
      const currentPreferred = current?.instance_name?.toLowerCase() === queue

      if (!current || (isPreferred && !currentPreferred)) {
        preferredByQueue.set(queue, integration)
      }
    }

    return Array.from(preferredByQueue.entries()).map(([queue, integration]) => ({
      queue,
      integration,
      label: `${queueLabel(queue)} - ${integrationDisplayName(integration)}`,
    }))
  }, [integrations])

  const replyChannelOptions = useMemo(() => (
    integrations
      .filter(item => Boolean(item.id) && Boolean(item.instance_name) && Boolean(item.base_url) && Boolean(item.api_token))
      .map(integration => ({
        id: integration.id,
        queue: inferQueueFromIntegration(integration),
        integration,
        label: integrationChannelLabel(integration),
      }))
  ), [integrations])

  const selectedReplyIntegration = useMemo(
    () => replyChannelOptions.find(item => item.id === selectedReplyIntegrationId)?.integration ?? null,
    [replyChannelOptions, selectedReplyIntegrationId],
  )

  const selectedReplyChannelLabel = useMemo(() => {
    if (!selectedReplyIntegration) return 'Selecione o canal de envio'
    return integrationChannelLabel(selectedReplyIntegration)
  }, [selectedReplyIntegration])

  useEffect(() => {
    void bootstrap()
  }, [])

  useEffect(() => {
    let mounted = true
    void (async () => {
      setChatSettingsLoading(true)
      const { data } = await loadCrmChatSettings().catch(() => ({ data: DEFAULT_CRM_CHAT_SETTINGS }))
      if (!mounted) return
      setSignOutgoingMessages(data.sign_outgoing_messages)
      setChatSettingsLoading(false)
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!selectedConversation) { setRenovacoesCRM([]); return }
    const phone = (selectedConversation.telefone || selectedConversation.document_key || '').replace(/\D/g, '')
    const last11 = phone.slice(-11)
    const cpf = selectedConversation.cpf ?? null
    const cnpj = selectedConversation.cnpj ?? null

    let query = supabase
      .from('renovacoes')
      .select('id,cliente,razao_social,tipo_certificado,data_vencimento,dias_restantes,valor,prioridade,status,pedido,protocolo')
      .is('deleted_at', null)
      .in('status', ['pendente', 'contatado'])
      .order('data_vencimento', { ascending: true })
      .limit(5)

    if (cpf) query = query.eq('cpf', cpf)
    else if (cnpj) query = query.eq('cnpj', cnpj)
    else if (last11) query = query.like('telefone', `%${last11}`)

    void query.then(({ data }) => setRenovacoesCRM((data ?? []) as RenovacaoCRM[]))
  }, [selectedConversation?.id])

  useEffect(() => {
    if (!deepLinkPhone || loading) return
    const digits = deepLinkPhone.replace(/\D/g, '')
    const match = conversations.find(item =>
      (item.document_key ?? '').replace(/\D/g, '').endsWith(digits) ||
      (item.telefone ?? '').replace(/\D/g, '').endsWith(digits)
    )
    if (match) {
      setSelectedId(match.id)
    } else {
      void openManualConversationModal({
        phone: deepLinkPhone,
        contactName: deepLinkNome,
        firstMessage: deepLinkMsg,
      })
    }
    setDeepLinkPhone(null)
    setDeepLinkNome('')
    setDeepLinkMsg('')
  }, [conversations, deepLinkPhone, loading])

  useEffect(() => {
    if (!selectedConversation) {
      setMessages([])
      lastMessageSnapshotRef.current = ''
      setHumanMessage('')
      setShowEmoji(false)
      setSelectedReplyIntegrationId('')
      setSelectedReplyIntegrationConversationId(null)
      setContactEdit({
        name: '',
        phone: '',
        email: '',
        status: '',
        observations: '',
      })
      return
    }

    setUnreadCounts(prev => {
      if (!prev[selectedConversation.id]) return prev
      const next = { ...prev }
      delete next[selectedConversation.id]
      return next
    })
    setHumanMessage('')
    setShowEmoji(false)
    void loadMessages(selectedConversation.id)
  }, [selectedConversation?.id])

  useEffect(() => {
    if (!selectedConversation) return
    setContactEdit({
      name: selectedConversation.nome_crm || selectedConversation.cliente_nome || '',
      phone: selectedConversation.telefone || selectedConversation.document_key || '',
      email: selectedConversation.email_principal || '',
      status: selectedConversation.contato_status || '',
      observations: selectedConversation.observacoes || '',
    })
    setContactEditError(null)
  }, [
    selectedConversation?.id,
    selectedConversation?.cliente_nome,
    selectedConversation?.contato_status,
    selectedConversation?.document_key,
    selectedConversation?.email_principal,
    selectedConversation?.nome_crm,
    selectedConversation?.observacoes,
    selectedConversation?.telefone,
  ])

  useEffect(() => {
    if (!selectedConversation || replyChannelOptions.length === 0) return

    const currentSelectionBelongsToConversation = selectedReplyIntegrationConversationId === selectedConversation.id
      && replyChannelOptions.some(item => item.id === selectedReplyIntegrationId)
    if (currentSelectionBelongsToConversation) return

    const targetInstance = selectedConversation.whatsapp_instance?.trim().toLowerCase()
    const exactMatch = replyChannelOptions.find(item => item.integration.instance_name?.trim().toLowerCase() === targetInstance)
    const sameQueue = replyChannelOptions.find(item => item.queue === selectedConversation.fila)
    const nextDefault = exactMatch ?? sameQueue ?? replyChannelOptions[0]

    if (nextDefault) {
      setSelectedReplyIntegrationId(nextDefault.id)
      setSelectedReplyIntegrationConversationId(selectedConversation.id)
    }
  }, [selectedConversation?.id, selectedConversation?.whatsapp_instance, selectedConversation?.fila, replyChannelOptions, selectedReplyIntegrationConversationId, selectedReplyIntegrationId])

  useEffect(() => {
    if (!selectedConversation || loadingMessages) return
    const currentConversationId = selectedConversation.id
    const currentMessageCount = displayMessages.length
    const shouldScroll =
      lastScrolledConversationRef.current !== currentConversationId
      || currentMessageCount > lastRenderedMessageCountRef.current

    if (shouldScroll) {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      })
      lastScrolledConversationRef.current = currentConversationId
    }

    lastRenderedMessageCountRef.current = currentMessageCount
  }, [selectedConversation?.id, displayMessages.length, loadingMessages])

  useEffect(() => {
    const channel = supabase
      .channel('crm-chat-admin-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_chat_conversations' }, () => {
        if (pendingConversationReloadRef.current) clearTimeout(pendingConversationReloadRef.current)
        pendingConversationReloadRef.current = setTimeout(() => {
          void loadConversations(false)
        }, 180)
      })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_chat_messages' }, payload => {
          const nextRow = (payload.new ?? {}) as Record<string, unknown>
          const prevRow = (payload.old ?? {}) as Record<string, unknown>
          const conversationId = String((nextRow['conversation_id'] as string | undefined) ?? (prevRow['conversation_id'] as string | undefined) ?? '')
          const direction = String((nextRow['direction'] as string | undefined) ?? '')
            if (payload.eventType === 'INSERT' && conversationId && direction === 'incoming' && conversationId !== selectedId) {
              setUnreadCounts(prev => ({ ...prev, [conversationId]: (prev[conversationId] ?? 0) + 1 }))
            }
            if (selectedId && conversationId === selectedId) {
              if (pendingMessageReloadRef.current) clearTimeout(pendingMessageReloadRef.current)
              pendingMessageReloadRef.current = setTimeout(() => {
                void loadMessages(selectedId, { background: true })
              }, 120)
            }
          })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'communication_events' }, payload => {
          const nextRow = (payload.new ?? {}) as Record<string, unknown>
          const conversationId = String(nextRow.conversation_id ?? '')
          const source = String(nextRow.source ?? '')
          if (source === 'evolution') return
          if (!conversationId) return
          if (selectedId && conversationId === selectedId) {
            if (pendingMessageReloadRef.current) clearTimeout(pendingMessageReloadRef.current)
            pendingMessageReloadRef.current = setTimeout(() => {
              void loadMessages(selectedId, { background: true })
            }, 120)
          }
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_chat_assignments' }, () => {
          void loadConversations(false)
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_customers' }, () => {
        void loadConversations(false)
      })
      .subscribe()

    return () => {
      if (pendingConversationReloadRef.current) clearTimeout(pendingConversationReloadRef.current)
      if (pendingMessageReloadRef.current) clearTimeout(pendingMessageReloadRef.current)
      void supabase.removeChannel(channel)
    }
  }, [selectedId])

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (isResizingLeft && layoutRef.current) {
        const rect = layoutRef.current.getBoundingClientRect()
        const next = Math.min(Math.max(event.clientX - rect.left, 300), Math.max(300, rect.width - 560))
        setLeftPanelWidth(next)
      }

      if (isResizingRight && detailRef.current) {
        const rect = detailRef.current.getBoundingClientRect()
        const next = Math.min(Math.max(rect.right - event.clientX, 280), Math.max(280, rect.width - 380))
        setRightPanelWidth(next)
      }
    }

    function handleMouseUp() {
      setIsResizingLeft(false)
      setIsResizingRight(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingLeft, isResizingRight])

  useEffect(() => {
    return () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview)
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      if (recTimerRef.current) clearInterval(recTimerRef.current)
      mediaRecorderRef.current?.stream?.getTracks().forEach(track => track.stop())
    }
  }, [audioUrl, pendingPreview])

  async function bootstrap() {
    setLoading(true)
    setError(null)
    await Promise.all([
      loadConversations(false),
      loadAgents(),
      fetchEvolutionIntegrations()
        .then(rows => setIntegrations(rows))
        .catch(() => setIntegrations([])),
    ])
    setLoading(false)
  }

  async function loadConversations(showRefreshing = true) {
    if (showRefreshing) setRefreshing(true)
    try {
      const response = await fetch(getApiUrl('/chat/crm/conversations'))
      if (!response.ok) throw new Error('Erro ao carregar conversas')
      const json = await response.json() as { ok: boolean; data: ConversationRow[] }
      const rows = json.data ?? []

      const snapshot = rows
        .map(item => [
          item.id,
          item.ultima_interacao_em ?? '',
          item.kanban_status ?? '',
          item.atendimento_humano ? '1' : '0',
          item.agente_atual ?? '',
          item.ultima_mensagem ?? '',
        ].join('|'))
        .join('||')

      if (snapshot !== lastConversationSnapshotRef.current) {
        lastConversationSnapshotRef.current = snapshot
        setConversations(rows)
        void loadConversationPreviews(rows)
      }
      setSelectedId(current => {
        if (current && rows.some(item => item.id === current)) return current
        return rows[0]?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar conversas')
    }
    if (showRefreshing) setRefreshing(false)
  }

  async function loadConversationPreviews(rows: ConversationRow[]) {
    const ids = rows.slice(0, 30).map(item => item.id)
    if (ids.length === 0) {
      setConversationPreviews({})
      return
    }

    try {
      const previews: Record<string, CrmMessage[]> = {}
      for (const id of ids) {
        const response = await fetch(getApiUrl(`/chat/crm/messages?conversation_id=${encodeURIComponent(id)}`))
        if (!response.ok) continue
        const json = await response.json() as { ok: boolean; crmMessages: CrmMessage[] }
        const msgs = (json.crmMessages ?? []).slice(-3).reverse()
        if (msgs.length > 0) previews[id] = msgs
      }
      setConversationPreviews(previews)
    } catch {
      setConversationPreviews({})
    }
  }

  async function loadMessages(conversationId: string, options: { background?: boolean } = {}) {
    const background = options.background ?? false
    if (!background) setLoadingMessages(true)
    const conversation = conversations.find(item => item.id === conversationId) ?? null
    const documentKey = conversation?.document_key ?? ''

    try {
      const response = await fetch(getApiUrl(`/chat/crm/messages?conversation_id=${encodeURIComponent(conversationId)}&document_key=${encodeURIComponent(documentKey)}`))
      if (!response.ok) throw new Error('Erro ao carregar mensagens')
      const json = await response.json() as { ok: boolean; crmMessages: CrmMessage[]; evolutionMessages: EvolutionEventRow[] }

      const crmMessages = (json.crmMessages ?? []) as CrmMessage[]
      const evolutionMessages = parseEvolutionEventMessages((json.evolutionMessages ?? []) as EvolutionEventRow[])
      const nextMessages = mergeConversationMessages([...crmMessages, ...evolutionMessages])
      const nextSnapshot = nextMessages
        .map(message => [
          message.id,
          message.direction,
          message.sender_type,
          message.sender_name ?? '',
          message.mensagem ?? '',
          message.mime_type ?? '',
          message.file_name ?? '',
          message.media_url ?? '',
          message.created_at,
        ].join('|'))
        .join('||')

      if (`${conversationId}:${nextSnapshot}` !== lastMessageSnapshotRef.current) {
        lastMessageSnapshotRef.current = `${conversationId}:${nextSnapshot}`
        setMessages(nextMessages)
      }
    } catch (err) {
      if (!background) setError(err instanceof Error ? err.message : 'Erro ao carregar mensagens')
    }
    if (!background) setLoadingMessages(false)
  }

  async function loadAgents() {
    try {
      const response = await fetch(getApiUrl('/chat/crm/agents'))
      if (!response.ok) return
      const rows = (await response.json() as AgentOption[])
        .filter(item => Boolean(item.id) && Boolean(item.nome))
        .map(item => ({
          id: String(item.id),
          nome: String(item.nome),
          perfil: String(item.perfil ?? 'usuario'),
        }))
      setAgents(rows)
    } catch {
      setAgents([])
    }
  }

  async function fetchEvolutionIntegrations() {
    const response = await fetch(getApiUrl('/chat/crm/integrations'))
    if (!response.ok) throw new Error('Nao foi possivel carregar as integracoes Evolution.')
    const rows = await response.json() as EvolutionIntegration[]
    return rows ?? []
  }

  async function resolveEvolutionIntegration(instanceName?: string | null) {
    const rows = await fetchEvolutionIntegrations()

    const targetInstance = instanceName?.trim().toLowerCase()
    const integration = rows.find(item => item.instance_name?.trim().toLowerCase() === targetInstance) ?? rows[0]
    if (!integration?.base_url || !integration?.api_token || !integration?.instance_name) {
      throw new Error('Nenhuma integracao Evolution ativa foi encontrada para essa conversa.')
    }

    return integration
  }

  function markConversationAsHuman(conversationId: string) {
    setHumanOverrideIds(prev => prev.includes(conversationId) ? prev : [...prev, conversationId])
  }

  function unmarkConversationAsHuman(conversationId: string) {
    setHumanOverrideIds(prev => prev.filter(item => item !== conversationId))
  }

  function openKanban() {
    setViewMode('kanban')
    setKanbanOpen(true)
  }

  function closeKanban() {
    setViewMode('lista')
    setKanbanOpen(false)
  }

  function selectConversationFromKanban(conversationId: string) {
    setSelectedId(conversationId)
    closeKanban()
  }

  async function openManualConversationModal(prefill?: { phone?: string; contactName?: string; firstMessage?: string }) {
    setManualConversationLoading(true)
    setManualConversationError(null)

    try {
      const rows = await fetchEvolutionIntegrations()
      setIntegrations(rows)

      if (rows.length === 0) {
        throw new Error('Nenhuma integracao Evolution ativa foi encontrada para iniciar uma conversa manual.')
      }

      const defaultIntegration =
        rows.find(item => item.instance_name?.toLowerCase() === 'renovacao')
        ?? rows.find(item => item.instance_name?.toLowerCase() === 'certiid')
        ?? rows.find(item => item.instance_name?.toLowerCase() === 'atendimento')
        ?? rows[0]
      setManualConversation({
        contactName: prefill?.contactName ?? '',
        phone: prefill?.phone ?? '',
        queue: inferQueueFromIntegration(defaultIntegration),
        integrationId: defaultIntegration.id,
        firstMessage: prefill?.firstMessage ?? '',
      })
      setManualConversationOpen(true)
    } catch (err) {
      setManualConversationError(err instanceof Error ? err.message : String(err))
    } finally {
      setManualConversationLoading(false)
    }
  }

  function closeManualConversationModal() {
    setManualConversationOpen(false)
    setManualConversationError(null)
    setManualConversation(createEmptyManualConversationForm())
  }

  async function activateConversationOwner(conversationId: string, agent: { id: string; nome: string }) {
    const response = await fetch(getApiUrl('/chat/crm/assignments'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: conversationId, agent_id: agent.id, agente_nome: agent.nome }),
    })
    const data = await response.json()
    if (!data.ok) throw new Error(data.error || 'Falha ao atribuir atendimento')

    await fetch(getApiUrl(`/chat/crm/conversations/${conversationId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atendimento_humano: true, agente_nome: agent.nome }),
    })

    markConversationAsHuman(conversationId)
  }

  async function updateConversationStatus(status: string) {
    if (!selectedConversation) return
    setActionLoading(true)
    setActionError(null)
    const shouldExitView = isClosedConversationStatus(status)
    const currentConversationId = selectedConversation.id
    const response = await fetch(getApiUrl(`/chat/crm/conversations/${currentConversationId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kanban_status: status }),
    })
    const data = await response.json()

    if (!data.ok) {
      setActionError(`Nao foi possivel atualizar a etapa: ${data.error || 'Erro desconhecido'}`)
    } else {
      await loadConversations(false)
      if (shouldExitView) {
        const nextConversation = activeConversations.find(item => item.id !== currentConversationId) ?? null
        setSelectedId(nextConversation?.id ?? null)
      }
    }
    setActionLoading(false)
  }

  async function updateConversationStatusById(conversationId: string, status: string) {
    const shouldExitView = isClosedConversationStatus(status) && conversationId === selectedId
    const response = await fetch(getApiUrl(`/chat/crm/conversations/${conversationId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kanban_status: status }),
    })
    const data = await response.json()

    if (!data.ok) {
      setActionError(`Nao foi possivel mover o card no Kanban: ${data.error || 'Erro desconhecido'}`)
      return
    }

    await loadConversations(false)
    if (shouldExitView) {
      const nextConversation = activeConversations.find(item => item.id !== conversationId) ?? null
      setSelectedId(nextConversation?.id ?? null)
    }
  }

  async function toggleHumanMode(nextValue: boolean) {
    if (!selectedConversation) return
    setActionLoading(true)
    setActionError(null)

    if (nextValue) {
      markConversationAsHuman(selectedConversation.id)
    } else {
      unmarkConversationAsHuman(selectedConversation.id)
    }

    try {
      const payload = nextValue
        ? { atendimento_humano: true, agente_nome: selectedConversation.agente_atual ?? profile?.nome ?? selectedConversation.agente_nome }
        : { atendimento_humano: false, agente_nome: null }

      await fetch(getApiUrl(`/chat/crm/conversations/${selectedConversation.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!nextValue) {
        try {
          await fetch(getApiUrl('/chat/crm/assignments'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversation_id: selectedConversation.id, deactivate_only: true }),
          })
        } catch {}
      }
    } catch (err) {
      console.warn('toggleHumanMode: erro na sincronizacao', err)
    }

    await loadConversations(false)
    setActionLoading(false)
  }

  async function assignConversation() {
    if (!selectedConversation || !selectedAgentId) return

    const selectedById = agents.find(item => item.id === selectedAgentId)
    const fallbackToCurrentProfile = profile?.id && selectedAgentId === profile.id
      ? { id: profile.id, nome: profile.nome ?? 'Usuario atual', perfil: profile.perfil ?? 'usuario' }
      : null
    const agent = selectedById ?? fallbackToCurrentProfile

    if (!agent?.id) {
      setActionError('Nao foi possivel identificar o ID do agente selecionado. Recarregue a tela e tente novamente.')
      return
    }

    setActionLoading(true)
    setActionError(null)

    try {
      await activateConversationOwner(selectedConversation.id, { id: agent.id, nome: agent.nome })
      await loadConversations(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }

    setActionLoading(false)
  }

  async function deleteConversation(conversationId: string) {
    if (!confirm('Tem certeza que deseja apagar esta conversa?')) return
    try {
      const response = await fetch(getApiUrl(`/chat/crm/conversations/${conversationId}`), { method: 'DELETE' })
      const data = await response.json()
      if (!data.ok) throw new Error(data.error || 'Falha ao apagar conversa')
      await loadConversations(false)
      if (selectedId === conversationId) setSelectedId(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  async function saveContactFromConversation(conversationId: string) {
    const conv = activeConversations.find(c => c.id === conversationId) || selectedConversation
    if (!conv) return
    try {
      const response = await fetch(getApiUrl('/chat/crm/customers'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: conv.cliente_nome || conv.nome_crm || 'Contato sem nome',
          telefone: conv.telefone || conv.document_key || null,
          email: null,
          observacoes: null,
          conversation_id: conversationId,
        }),
      })
      const data = await response.json()
      if (!data.ok) throw new Error(data.error || 'Falha ao salvar contato')
      await loadConversations(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  async function createManualConversation() {
    const normalizedPhone = normalizePhone(manualConversation.phone)
    const rawDigits = manualConversation.phone.replace(/\D/g, '')
    const firstMessage = manualConversation.firstMessage.trim()
    const contactName = manualConversation.contactName.trim()
    const selectedChannel = manualChannelOptions.find(item => item.integration.id === manualConversation.integrationId)

    if (!selectedChannel?.integration.instance_name || !selectedChannel.integration.base_url || !selectedChannel.integration.api_token) {
      setManualConversationError('Selecione um canal valido para iniciar a conversa.')
      return
    }

    if (!normalizedPhone) {
      setManualConversationError('Informe um telefone valido com DDD.')
      return
    }

    if (rawDigits.startsWith('55') && rawDigits.length === 12) {
      setManualConversationError('Esse numero parece incompleto para WhatsApp. Para celular no Brasil, use 55 + DDD + 9 dígitos. Exemplo: 5511999999999.')
      return
    }

    if (rawDigits.length < 12) {
      setManualConversationError('Esse numero esta curto demais para WhatsApp. Confira o DDD e o 9 do celular antes de enviar.')
      return
    }

    if (!firstMessage) {
      setManualConversationError('Informe a primeira mensagem para iniciar a conversa.')
      return
    }

    setManualConversationLoading(true)
    setManualConversationError(null)

    try {
      const response = await fetch(getApiUrl('/chat/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_name: selectedChannel.integration.instance_name,
          conversation_id: `${normalizedPhone}@s.whatsapp.net`,
          content: firstMessage,
          lead_id: null,
        }),
      })

      const payload = await response.json() as { ok?: boolean; error?: string }
      if (!response.ok || !payload.ok) {
        const rawError = payload.error ?? ''
        const msg = rawError.includes('404') || rawError.includes('not found') || rawError.includes('invalid')
          ? 'Numero nao encontrado no WhatsApp. Verifique se o numero esta correto e ativo.'
          : rawError.includes('401') || rawError.includes('403')
            ? 'Credenciais do canal invalidas. Verifique a integracao em Configuracoes.'
            : rawError || 'Nao foi possivel iniciar a conversa manual.'
        throw new Error(msg)
      }

      await loadConversations(false)
      setSelectedId((normalizedPhone.endsWith('@s.whatsapp.net') ? normalizedPhone : `${normalizedPhone}@s.whatsapp.net`))
      closeManualConversationModal()
    } catch (err) {
      setManualConversationError(err instanceof Error ? err.message : String(err))
    } finally {
      setManualConversationLoading(false)
    }
  }

  function clearPendingFile() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(null)
    setPendingPreview(null)
  }

  function focusComposer() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        composerRef.current?.focus()
      })
    })
  }

  function normalizeContactPhone(value: string) {
    return value.replace(/\D/g, '')
  }

  function buildContactVCardBlob(contact: ContactEditForm) {
    const fullName = contact.name.trim() || selectedConversation?.cliente_nome || selectedConversation?.nome_crm || 'Contato'
    const phoneDigits = normalizeContactPhone(contact.phone || selectedConversation?.telefone || selectedConversation?.document_key || '')
    const email = contact.email.trim()
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${fullName}`,
      phoneDigits ? `TEL;TYPE=CELL:+${phoneDigits}` : null,
      email ? `EMAIL;TYPE=INTERNET:${email}` : null,
      'END:VCARD',
    ].filter(Boolean).join('\r\n')

    return new Blob([vcard], { type: 'text/vcard;charset=utf-8' })
  }

  async function saveContactDetails() {
    if (!selectedConversation) return
    const customerId = selectedConversation.crm_customer_id
    if (!customerId && !selectedConversation.document_key) {
      setContactEditError('Nao foi possivel identificar o contato para salvar.')
      return
    }

    setContactEditSaving(true)
    setContactEditError(null)

    const cleanedName = contactEdit.name.trim()
    const cleanedPhone = contactEdit.phone.trim()
    const cleanedEmail = contactEdit.email.trim()
    const cleanedStatus = contactEdit.status.trim()
    const cleanedObs = contactEdit.observations.trim()
    const resolvedName = cleanedName || selectedConversation.cliente_nome || selectedConversation.nome_crm || null
    const resolvedPhone = cleanedPhone || selectedConversation.telefone || selectedConversation.document_key || null
    const resolvedEmail = cleanedEmail || null
    const resolvedStatus = cleanedStatus || null
    const resolvedObs = cleanedObs || null

    try {
      if (customerId) {
        const r = await fetch(getApiUrl(`/chat/crm/customers/${customerId}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: resolvedName,
            telefone_principal: resolvedPhone,
            email_principal: resolvedEmail,
            contato_status: resolvedStatus,
            observacoes: resolvedObs,
          }),
        })
        const d = await r.json()
        if (!d.ok) throw new Error(d.error || 'Falha ao atualizar cliente')
      }

      await fetch(getApiUrl(`/chat/crm/conversations/${selectedConversation.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_nome: resolvedName, telefone: resolvedPhone }),
      })

      const historyText = [
        'Dados do contato atualizados no painel',
        resolvedName ? `Nome: ${resolvedName}` : null,
        resolvedPhone ? `Telefone: ${resolvedPhone}` : null,
        resolvedEmail ? `Email: ${resolvedEmail}` : null,
        resolvedStatus ? `Status CRM: ${resolvedStatus}` : null,
        resolvedObs ? `Observacoes: ${resolvedObs}` : null,
      ].filter(Boolean).join(' | ')

      await fetch(getApiUrl('/chat/crm/events'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'crm',
          event_type: 'contact_updated',
          conversation_id: selectedConversation.id,
          contact: normalizeContactPhone(resolvedPhone ?? selectedConversation.telefone ?? selectedConversation.document_key),
          payload: {
            conversation_id: selectedConversation.id,
            customer_id: customerId,
            nome: resolvedName,
            telefone: resolvedPhone,
            email: resolvedEmail,
            status: resolvedStatus,
            observacoes: resolvedObs,
            historico: historyText,
          },
        }),
      })

      await loadConversations(false)
      setContactEdit(prev => ({
        ...prev,
        name: resolvedName || '',
        phone: resolvedPhone || '',
        email: resolvedEmail || '',
        status: resolvedStatus || '',
        observations: resolvedObs || '',
      }))
    } catch (err) {
      setContactEditError(err instanceof Error ? err.message : String(err))
    } finally {
      setContactEditSaving(false)
    }
  }

  async function sendContactCard() {
    if (!selectedConversation) return
    setSendingHumanMessage(true)
    setActionError(null)
    try {
      const cardBlob = buildContactVCardBlob(contactEdit)
      const contactName = contactEdit.name.trim() || selectedConversation.cliente_nome || selectedConversation.nome_crm || 'Contato'
      const phoneDigits = normalizeContactPhone(contactEdit.phone || selectedConversation.telefone || selectedConversation.document_key || '')
      const filename = `${contactName.replace(/[^\p{L}\p{N}]+/gu, '_') || 'contato'}.vcf`
      const result = await sendHumanAttachment(cardBlob, filename, 'text/vcard')
      if (!result.ok) throw new Error(result.error ?? 'Nao foi possivel enviar o contato.')
    } catch (err) {
      setActionError(`Falha ao enviar contato: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSendingHumanMessage(false)
      focusComposer()
    }
  }

  function describeMicrophoneError(err: unknown) {
    if (!(err instanceof Error)) return 'Nao foi possivel acessar o microfone.'
    const code = (err as Error & { name?: string }).name ?? ''
    if (code === 'NotAllowedError' || code === 'PermissionDeniedError') {
      return 'O navegador bloqueou o microfone. Abra as permissoes do site e permita o acesso ao microfone.'
    }
    if (code === 'NotFoundError' || code === 'DevicesNotFoundError') {
      return 'Nenhum microfone foi encontrado neste computador. Conecte um microfone ou verifique o dispositivo padrao.'
    }
    if (code === 'NotReadableError' || code === 'TrackStartError') {
      return 'O microfone esta ocupado ou indisponivel. Feche outros apps que estejam usando o audio e tente novamente.'
    }
    if (code === 'SecurityError') {
      return 'O navegador bloqueou o uso do microfone neste contexto. Confirme que o site esta em HTTPS e recarregue a pagina.'
    }
    return err.message || 'Nao foi possivel acessar o microfone.'
  }

  function discardAudio() {
    if (recTimerRef.current) clearInterval(recTimerRef.current)
    mediaRecorderRef.current?.stream?.getTracks().forEach(track => track.stop())
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setRecState('idle')
    setRecSecs(0)
  }

  async function sendHumanReply() {
    if (!selectedConversation) return
    if (sendingHumanMessage) return
    const text = humanMessage.trim()
    if (!text) return

    setSendingHumanMessage(true)
    setActionError(null)
    const tempId = `temp-human-${Date.now()}`
    const tempCreatedAt = new Date().toISOString()
    const senderName = currentHumanAgentName
    const displayText = applyOutgoingSignature(text, senderName, signOutgoingMessages)
    setMessages(prev => [...prev, {
      id: tempId,
      conversation_id: selectedConversation.id,
      document_key: selectedConversation.document_key,
      direction: 'outgoing',
      sender_type: 'humano',
      sender_name: senderName,
      mensagem: displayText,
      created_at: tempCreatedAt,
    }])
    setHumanMessage('')
    focusComposer()

    try {
      const integration = selectedReplyIntegration ?? await resolveEvolutionIntegration(selectedConversation.whatsapp_instance)
      if (!integration?.instance_name) {
        throw new Error('Selecione um canal de saida valido para responder essa conversa.')
      }
      const destinationNumber = selectedConversation.telefone || selectedConversation.document_key
      if (!destinationNumber) throw new Error('Nao foi possivel identificar o numero do contato para envio.')

      const response = await fetch(getApiUrl('/chat/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_name: integration.instance_name,
          conversation_id: `${destinationNumber}@s.whatsapp.net`,
          content: text,
          lead_id: null,
        }),
      })

      const payload = await response.json() as { ok?: boolean; error?: string; messageId?: string }
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Nao foi possivel enviar a mensagem humana.')

      setMessages(prev => prev.map(item => item.id === tempId ? { ...item, id: payload.messageId ?? tempId } : item))
      markConversationAsHuman(selectedConversation.id)
      await loadConversations(false)
      await loadMessages(selectedConversation.id, { background: true })
    } catch (err) {
      setMessages(prev => prev.filter(item => item.id !== tempId))
      setHumanMessage(current => (current.trim().length > 0 ? current : text))
      setActionError(`Falha no envio humano: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSendingHumanMessage(false)
      focusComposer()
    }
  }

  async function sendHumanAttachment(file: File | Blob, filename: string, mimeType?: string) {
    if (!selectedConversation) return { ok: false, error: 'Nenhuma conversa selecionada.' }

    const integration = selectedReplyIntegration ?? await resolveEvolutionIntegration(selectedConversation.whatsapp_instance)
    if (!integration?.instance_name) {
      return { ok: false, error: 'Selecione um canal de saida valido para enviar esse anexo.' }
    }
    const destinationNumber = selectedConversation.telefone || selectedConversation.document_key
    if (!destinationNumber) return { ok: false, error: 'Nao foi possivel identificar o numero do contato.' }

    const finalMimeType = mimeType || file.type || 'application/octet-stream'
    const tempId = `temp-attachment-${Date.now()}`
    const tempMediaUrl = typeof URL !== 'undefined' && file instanceof Blob ? URL.createObjectURL(file) : null
      setMessages(prev => [...prev, {
        id: tempId,
        conversation_id: selectedConversation.id,
        document_key: selectedConversation.document_key,
        direction: 'outgoing',
        sender_type: 'humano',
        sender_name: currentHumanAgentName,
        mensagem: filename,
        mime_type: finalMimeType,
        file_name: filename,
        media_url: tempMediaUrl,
        created_at: new Date().toISOString(),
    }])

    try {
      const caption = `📎 ${filename}`
      const response = await fetch(getApiUrl('/chat/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_name: integration.instance_name,
          conversation_id: `${destinationNumber}@s.whatsapp.net`,
          content: caption,
          lead_id: null,
        }),
      })

      const payload = await response.json() as { ok?: boolean; error?: string }
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Nao foi possivel enviar o anexo.')
    } catch (err) {
      setMessages(prev => prev.filter(item => item.id !== tempId))
      if (tempMediaUrl) URL.revokeObjectURL(tempMediaUrl)
      return { ok: false, error: err instanceof Error ? err.message : 'Nao foi possivel enviar o anexo.' }
    }

    markConversationAsHuman(selectedConversation.id)
    await loadConversations(false)
    await loadMessages(selectedConversation.id, { background: true })
    if (tempMediaUrl) URL.revokeObjectURL(tempMediaUrl)
    focusComposer()
    return { ok: true }
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    clearPendingFile()
    setPendingFile(file)
    setPendingPreview(file.type.startsWith('image/') ? URL.createObjectURL(file) : null)
    event.target.value = ''
  }

  async function handleFileSend() {
    if (!pendingFile) return
    setSendingHumanMessage(true)
    setActionError(null)
    try {
      const result = await sendHumanAttachment(pendingFile, pendingFile.name)
      if (!result.ok) throw new Error(result.error ?? 'Nao foi possivel enviar o anexo.')
      clearPendingFile()
    } catch (err) {
      setActionError(`Falha ao enviar anexo: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSendingHumanMessage(false)
    }
  }

  async function startRecording() {
    try {
      if (!window.isSecureContext) {
        throw new Error('O navegador exige HTTPS para liberar o microfone.')
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Seu navegador nao expoe getUserMedia para capturar audio.')
      }

      if (typeof MediaRecorder === 'undefined') {
        throw new Error('Seu navegador nao suporta gravacao de audio via MediaRecorder.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const supportedMimeType = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/webm',
        'audio/ogg',
      ].find(type => MediaRecorder.isTypeSupported(type))

      const recorder = supportedMimeType ? new MediaRecorder(stream, { mimeType: supportedMimeType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []
      recorder.ondataavailable = event => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop())
        const blob = new Blob(audioChunksRef.current, { type: supportedMimeType ?? recorder.mimeType ?? 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setRecState('preview')
      }
      recorder.start()
      setRecState('recording')
      setRecSecs(0)
      recTimerRef.current = setInterval(() => setRecSecs(current => current + 1), 1000)
    } catch (err) {
      setActionError(`Nao foi possivel acessar o microfone: ${describeMicrophoneError(err)}`)
    }
  }

  function stopRecording() {
    if (recTimerRef.current) clearInterval(recTimerRef.current)
    mediaRecorderRef.current?.stop()
  }

  async function sendAudio() {
    if (!audioBlob) return
    setSendingHumanMessage(true)
    setActionError(null)
    try {
      const extension = audioBlob.type.includes('webm') ? 'webm' : 'ogg'
      const result = await sendHumanAttachment(audioBlob, `audio_${Date.now()}.${extension}`, audioBlob.type)
      if (!result.ok) throw new Error(result.error ?? 'Nao foi possivel enviar o audio.')
      discardAudio()
    } catch (err) {
      setActionError(`Falha ao enviar audio: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSendingHumanMessage(false)
      focusComposer()
    }
  }

  function insertEmoji(emoji: string) {
    const input = composerRef.current
    if (!input) {
      setHumanMessage(prev => prev + emoji)
      setShowEmoji(false)
      return
    }

    const start = input.selectionStart ?? humanMessage.length
    const end = input.selectionEnd ?? humanMessage.length
    setHumanMessage(`${humanMessage.slice(0, start)}${emoji}${humanMessage.slice(end)}`)
    setShowEmoji(false)

    requestAnimationFrame(() => {
      input.selectionStart = input.selectionEnd = start + emoji.length
      input.focus()
    })
  }

  async function handleComposerPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageItem = Array.from(event.clipboardData.items).find(item => item.type.startsWith('image/'))
    if (!imageItem) return
    const file = imageItem.getAsFile()
    if (!file) return
    event.preventDefault()
    clearPendingFile()
    setPendingFile(file)
    setPendingPreview(URL.createObjectURL(file))
  }

  function handleHumanComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (sendingHumanMessage) return
      event.preventDefault()
      void sendHumanReply()
    }
  }

  const searchMatchedConversations = useMemo(() => {
    const query = search.trim().toLowerCase()
    const queryDigits = normalizeDigits(search)
    return conversations.filter(item => {
      const text = `${item.cliente_nome ?? ''} ${item.nome_crm ?? ''} ${item.telefone ?? ''} ${item.document_key ?? ''} ${item.ultima_mensagem ?? ''}`.toLowerCase()
      if (!query) return true
      if (queryDigits) return text.includes(query) || phoneMatchesQuery(item, queryDigits)
      return text.includes(query)
    })
  }, [conversations, search])

  const activeConversations = useMemo(() => (
    searchMatchedConversations.filter(item => !isClosedConversationStatus(normalizeKanbanStatus(item.kanban_status)))
  ), [searchMatchedConversations])

  const closedConversations = useMemo(() => (
    searchMatchedConversations.filter(item => isClosedConversationStatus(item.kanban_status))
  ), [searchMatchedConversations])

  function matchesOperationalFilters(item: ConversationRow) {
    const matchesQueue = queueFilter === 'todas' || item.fila === queueFilter
    const matchesHuman = humanFilter === 'todos'
      || (humanFilter === 'humano' && (item.atendimento_humano || humanOverrideIds.includes(item.id)))
      || (humanFilter === 'ia' && !item.atendimento_humano && !humanOverrideIds.includes(item.id))
    return matchesQueue && matchesHuman
  }

  const filteredConversations = useMemo(() => {
    return activeConversations.filter(matchesOperationalFilters)
  }, [activeConversations, queueFilter, humanFilter, humanOverrideIds])

  const filteredClosedConversations = useMemo(() => (
    closedConversations.filter(matchesOperationalFilters)
  ), [closedConversations, queueFilter, humanFilter, humanOverrideIds])

  const visibleConversations = useMemo(() => (
    search.trim() || showClosedConversations
      ? [...filteredConversations, ...filteredClosedConversations]
      : filteredConversations
  ), [filteredConversations, filteredClosedConversations, search, showClosedConversations])

  const summary = useMemo(() => ({
      total: activeConversations.length,
      atendimento: activeConversations.filter(item => item.fila === 'atendimento').length,
      renovacao: activeConversations.filter(item => item.fila === 'renovacao').length,
      email: activeConversations.filter(item => item.fila === 'email').length,
      humano: activeConversations.filter(item => item.atendimento_humano || humanOverrideIds.includes(item.id)).length,
    }), [activeConversations, humanOverrideIds])

  const unreadTotal = useMemo(
    () => Object.values(unreadCounts).reduce((acc, value) => acc + value, 0),
    [unreadCounts],
  )

  const activeShortcut = useMemo(() => ({
    all: queueFilter === 'todas' && humanFilter === 'todos',
    atendimento: queueFilter === 'atendimento' && humanFilter === 'todos',
    renovacao: queueFilter === 'renovacao' && humanFilter === 'todos',
    email: queueFilter === 'email' && humanFilter === 'todos',
    humano: queueFilter === 'todas' && humanFilter === 'humano',
  }), [queueFilter, humanFilter])

  const groupedByStatus = useMemo(() => {
      return STATUS_COLUMNS.map(column => ({
        ...column,
        items: filteredConversations.filter(item => normalizeKanbanStatus(item.kanban_status) === column.key),
      }))
    }, [filteredConversations])

  useEffect(() => {
    if (visibleConversations.length === 0) {
      if (selectedId) setSelectedId(null)
      return
    }

    if (!selectedId || !visibleConversations.some(item => item.id === selectedId)) {
      setSelectedId(visibleConversations[0]?.id ?? null)
    }
  }, [visibleConversations, selectedId])

  function applySummaryShortcut(target: 'all' | 'atendimento' | 'renovacao' | 'email' | 'humano') {
    const nextQueue: 'todas' | QueueType =
      target === 'atendimento' ? 'atendimento' :
      target === 'renovacao' ? 'renovacao' :
      target === 'email' ? 'email' :
      'todas'

    const nextHuman: 'todos' | 'ia' | 'humano' = target === 'humano' ? 'humano' : 'todos'

    setQueueFilter(nextQueue)
    setHumanFilter(nextHuman)

      const nextConversation = activeConversations.find(item => {
        const matchesQueue = nextQueue === 'todas' || item.fila === nextQueue
        let matchesHuman = false
        if (nextHuman === 'todos') matchesHuman = true
        else if (nextHuman === 'humano') matchesHuman = item.atendimento_humano || humanOverrideIds.includes(item.id)
        else matchesHuman = !item.atendimento_humano && !humanOverrideIds.includes(item.id)
        return matchesQueue && matchesHuman
      })

    setSelectedId(nextConversation?.id ?? null)
    requestAnimationFrame(() => {
      inboxListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    }

    return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 text-slate-900">
      <div className="shrink-0 border-b border-slate-200/80 bg-white/90 px-5 py-4 backdrop-blur">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Operacao de chat
              </div>
              <div>
                <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-slate-950">Central de Atendimento</h1>
                <p className="mt-1 text-sm text-slate-500">Chat, Kanban e filas em uma visao mais limpa e direta.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void loadConversations(true)} className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
                <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Atualizar
              </button>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-1">
                <button type="button" onClick={closeKanban} className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition ${!kanbanOpen ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
                  <List size={15} /> Chat
                </button>
                <button type="button" onClick={openKanban} className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition ${kanbanOpen ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
                  <Columns3 size={15} /> Kanban
                </button>
              </div>
              <button type="button" onClick={() => void openManualConversationModal()} className="inline-flex h-10 items-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50" disabled={manualConversationLoading}>
                <MessageCircle size={15} /> Nova conversa
              </button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-5">
            <SummaryCard label="Visiveis" value={summary.total} active={activeShortcut.all} onClick={() => applySummaryShortcut('all')} />
            <SummaryCard label="Atendimento" value={summary.atendimento} active={activeShortcut.atendimento} onClick={() => applySummaryShortcut('atendimento')} />
            <SummaryCard label="Renovacao" value={summary.renovacao} active={activeShortcut.renovacao} onClick={() => applySummaryShortcut('renovacao')} />
            <SummaryCard label="Email" value={summary.email} active={activeShortcut.email} onClick={() => applySummaryShortcut('email')} />
            <SummaryCard label="Humano" value={summary.humano} active={activeShortcut.humano} onClick={() => applySummaryShortcut('humano')} />
          </div>

          <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_170px_170px_220px]">
            <label className="flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4">
              <Search size={16} className="text-slate-400" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar contato ou mensagem" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
            </label>

            <select value={queueFilter} onChange={event => setQueueFilter(event.target.value as 'todas' | QueueType)} className="h-11 rounded-full border border-slate-200 bg-white px-4 text-sm outline-none">
              <option value="todas">Todas as filas</option>
              <option value="atendimento">Atendimento</option>
              <option value="renovacao">Renovacao</option>
              <option value="email">Email</option>
            </select>

            <select value={humanFilter} onChange={event => setHumanFilter(event.target.value as 'todos' | 'ia' | 'humano')} className="h-11 rounded-full border border-slate-200 bg-white px-4 text-sm outline-none">
              <option value="todos">IA e humano</option>
              <option value="ia">So IA</option>
              <option value="humano">So humano</option>
            </select>

            <button
              type="button"
              onClick={() => setShowClosedConversations(prev => !prev)}
              className={`h-11 rounded-full border px-4 text-sm font-medium transition ${
                showClosedConversations
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              {showClosedConversations ? `Ocultar encerradas (${filteredClosedConversations.length})` : `Mostrar encerradas (${filteredClosedConversations.length})`}
            </button>
          </div>
        </div>
      </div>
      {error ? (
        <div className="p-6">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        </div>
      ) : loading ? (
        <div className="flex flex-1 items-center justify-center text-slate-400">Carregando conversas do CRM...</div>
      ) : (
        <div ref={layoutRef} className="flex min-h-0 flex-1 flex-col gap-4 p-4 xl:flex-row">
            <section className="min-h-0 shrink-0 overflow-hidden rounded-3xl border border-slate-200 bg-white" style={{ width: `${leftPanelWidth}px` }}>
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-700">Inbox operacional</h2>
                    <p className="text-xs text-slate-400">Lista viva de conversas com filtros e abertura imediata do chat.</p>
                  </div>
                  <div className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {unreadTotal} nao lidas
                  </div>
                </div>
              </div>

                <div ref={inboxListRef} className="h-[calc(100%-73px)] overflow-y-auto p-3">
                  <div className="space-y-3">
                  {filteredConversations.map(item => (
                    <ConversationCard
                      key={item.id}
                      item={item}
                      selected={item.id === selectedId}
                      onClick={() => setSelectedId(item.id)}
                      human={item.atendimento_humano || humanOverrideIds.includes(item.id)}
                      unreadCount={unreadCounts[item.id] ?? 0}
                      previewMessages={conversationPreviews[item.id] ?? []}
                    />
                  ))}
                  {filteredConversations.length === 0 && <EmptyState text="Nenhuma conversa encontrada com os filtros atuais." />}
                  {showClosedConversations && (
                    <div className="pt-2">
                      <div className="mb-3 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-700">Encerradas</p>
                          <p className="text-[11px] text-slate-500">Separadas do inbox operacional para nao poluir o atendimento.</p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">{filteredClosedConversations.length}</span>
                      </div>
                      <div className="space-y-3">
                        {filteredClosedConversations.map(item => (
                          <ConversationCard
                            key={item.id}
                            item={item}
                            selected={item.id === selectedId}
                            onClick={() => setSelectedId(item.id)}
                            human={item.atendimento_humano || humanOverrideIds.includes(item.id)}
                            unreadCount={unreadCounts[item.id] ?? 0}
                            closed
                            previewMessages={conversationPreviews[item.id] ?? []}
                          />
                        ))}
                        {filteredClosedConversations.length === 0 && <EmptyState text="Nenhuma conversa encerrada com os filtros atuais." compact />}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

          <div className="hidden w-2 shrink-0 cursor-col-resize rounded-full bg-slate-200/80 transition hover:bg-sky-300 xl:block" onMouseDown={() => setIsResizingLeft(true)} />

          <section className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-white">
            {!selectedConversation ? (
              <div className="flex h-full items-center justify-center text-slate-400">Selecione uma conversa para abrir o painel ADM.</div>
            ) : (
              <div ref={detailRef} className="flex h-full min-h-0 flex-col xl:flex-row">
                <div className="flex min-h-0 min-w-0 flex-1 flex-col xl:border-r xl:border-slate-200">
                  <div className="shrink-0 border-b border-slate-200 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">{selectedConversation.cliente_nome || selectedConversation.nome_crm || 'Sem nome identificado'}</h3>
                        <p className="mt-1 text-sm text-slate-500">{selectedConversation.telefone || selectedConversation.document_key}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge text={queueLabel(selectedConversation.fila)} tone={selectedConversation.fila === 'renovacao' ? 'violet' : selectedConversation.fila === 'email' ? 'sky' : 'blue'} />
                        <Badge text={statusLabel(normalizeKanbanStatus(selectedConversation.kanban_status) || selectedConversation.kanban_status)} tone="slate" />
                        <Badge text={humanModeActive ? 'Humano' : 'IA'} tone={humanModeActive ? 'green' : 'amber'} />
                      </div>
                    </div>
                      <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-3">
                        <div>Instancia: <strong className="text-slate-700">{selectedConversation.whatsapp_instance || 'Nao definida'}</strong></div>
                        <div>Numero receptor: <strong className="text-slate-700">{selectedConversation.numero_receptor || 'Nao definido'}</strong></div>
                        <div>Ultima interacao: <strong className="text-slate-700">{formatDateTime(selectedConversation.ultima_interacao_em)}</strong></div>
                      </div>
                      {!hasRegisteredCustomer(selectedConversation) && (
                        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                          Esse numero ainda nao tem cadastro completo no CRM. Cadastre o contato antes de resolver ou encerrar a conversa.
                        </div>
                      )}
                    </div>

                    <div ref={messagesViewportRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-4">
                      {loadingMessages ? (
                        <div className="text-sm text-slate-400">Carregando mensagens...</div>
                      ) : displayMessages.length === 0 ? (
                        <EmptyState text="Ainda nao existem mensagens gravadas para esta conversa." />
                      ) : (
                        <div className="space-y-3">
                            {displayMessages.map(message => (
                              <MessageRow
                                key={message.id}
                                message={message}
                                fallbackHumanName={currentHumanAgentName}
                                conversation={selectedConversation}
                              />
                            ))}
                          <div ref={messagesEndRef} />
                        </div>
                      )}
                    </div>

                    <div className="relative shrink-0 border-t border-slate-200 bg-white px-4 py-3">
                        <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-700">Resposta humana</p>
                            <p className="text-xs text-slate-500">Barra fixa com anexo, colagem de imagem, emoji e audio.</p>
                            <p className="text-[11px] text-slate-400">
                              Assinatura: {chatSettingsLoading ? 'carregando...' : (signOutgoingMessages ? 'ativa' : 'desativada')}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge text={`Origem: ${selectedConversation.whatsapp_instance || 'Nao definida'}`} tone="blue" />
                            <Badge text={selectedConversation.agente_atual || profile?.nome || 'Humano'} tone="green" />
                          </div>
                        </div>

                        <div className="mb-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_220px]">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Canal de resposta</p>
                            <p className="mt-1 text-sm text-slate-700">
                              {selectedReplyChannelLabel}
                            </p>
                          </div>
                          <label className="space-y-1">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Responder por</span>
                            <select
                              value={selectedReplyIntegrationId}
                              onChange={event => {
                                setSelectedReplyIntegrationId(event.target.value)
                                setSelectedReplyIntegrationConversationId(selectedConversation.id)
                              }}
                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                            >
                              <option value="">Selecione um canal</option>
                              {replyChannelOptions.map(option => (
                                <option key={option.id} value={option.id}>{option.label}</option>
                              ))}
                              </select>
                          </label>
                        </div>

                        {pendingFile && (
                        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          {pendingPreview ? (
                            <img src={pendingPreview} alt="Preview" className="h-14 w-14 rounded-xl object-cover" />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-[11px] font-semibold text-slate-500">
                              {pendingFile.name.split('.').pop()?.toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-700">{pendingFile.name}</p>
                            <p className="text-xs text-slate-500">Pronto para envio manual</p>
                          </div>
                          <button type="button" onClick={() => void handleFileSend()} disabled={sendingHumanMessage} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-medium text-white disabled:opacity-50">
                            {sendingHumanMessage ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                            Enviar
                          </button>
                          <button type="button" onClick={clearPendingFile} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                            <X size={15} />
                          </button>
                        </div>
                      )}

                      {recState === 'preview' && audioUrl && (
                        <div className="mb-3 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <audio src={audioUrl} controls className="min-w-0 flex-1" />
                          <button type="button" onClick={() => void sendAudio()} disabled={sendingHumanMessage} className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-3 text-sm font-medium text-white disabled:opacity-50">
                            {sendingHumanMessage ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                            Enviar
                          </button>
                          <button type="button" onClick={discardAudio} className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                            <X size={15} />
                          </button>
                        </div>
                      )}

                      {showEmoji && (
                        <div className="absolute bottom-[96px] left-4 z-10 grid w-72 grid-cols-8 gap-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
                          {EMOJIS.map(emoji => (
                            <button key={emoji} type="button" onClick={() => insertEmoji(emoji)} className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-slate-100">
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}

                      {recState === 'recording' && (
                        <div className="mb-2 flex items-center gap-2 px-1 text-sm text-red-600">
                          <span className="h-2 w-2 rounded-full bg-red-500" />
                          <span>{formatRecTime(recSecs)}</span>
                          <span className="text-xs text-slate-500">Gravando audio</span>
                        </div>
                      )}

                      <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <input ref={fileInputRef} type="file" accept="image/*,.bmp,.pdf,.doc,.docx,.txt,.csv,.xls,.xlsx" className="hidden" onChange={handleFileSelect} />
                        <button type="button" onClick={() => setShowEmoji(current => !current)} className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 ${showEmoji ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-500'}`}>
                          <Smile size={18} />
                        </button>
                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sendingHumanMessage || recState === 'recording'} className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 disabled:opacity-50">
                          <Paperclip size={18} />
                        </button>
                        <textarea
                          ref={composerRef}
                          value={humanMessage}
                          onChange={event => setHumanMessage(event.target.value)}
                          onKeyDown={handleHumanComposerKeyDown}
                          onPaste={handleComposerPaste}
                          rows={2}
                          placeholder="Digite a resposta do atendimento humano. Enter envia e Shift+Enter quebra linha."
                          disabled={recState === 'recording'}
                          className="min-h-[52px] max-h-28 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-400 disabled:opacity-60"
                          onInput={event => {
                            const element = event.currentTarget
                            element.style.height = 'auto'
                            element.style.height = `${Math.min(element.scrollHeight, 112)}px`
                          }}
                        />
                        {humanMessage.trim() ? (
                          <button type="button" onClick={() => void sendHumanReply()} disabled={sendingHumanMessage || !humanMessage.trim()} className="inline-flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white disabled:opacity-50">
                            {sendingHumanMessage ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            Enviar
                          </button>
                        ) : (
                          <button type="button" onClick={recState === 'idle' ? () => void startRecording() : stopRecording} disabled={sendingHumanMessage || recState === 'preview'} className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${recState === 'recording' ? 'bg-red-500 text-white' : 'border border-slate-200 bg-white text-slate-500'} disabled:opacity-50`}>
                            {recState === 'recording' ? <StopCircle size={18} /> : <Mic size={18} />}
                          </button>
                        )}
                      </div>

                      {actionError && (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{actionError}</div>
                      )}
                    </div>
                </div>

                <div className="hidden w-2 shrink-0 cursor-col-resize rounded-full bg-slate-200/80 transition hover:bg-sky-300 xl:block" onMouseDown={() => setIsResizingRight(true)} />

                <aside className="min-h-0 shrink-0 overflow-y-auto px-4 py-4" style={{ width: `${rightPanelWidth}px` }}>
                  <div className="space-y-4">
                    <PanelBlock title="Contato e histórico">
                      <div className="space-y-3">
                        <label className="block space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nome</span>
                          <input
                            value={contactEdit.name}
                            onChange={event => setContactEdit(prev => ({ ...prev, name: event.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                            placeholder="Nome do contato"
                          />
                        </label>

                        <label className="block space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Telefone</span>
                          <input
                            value={contactEdit.phone}
                            onChange={event => setContactEdit(prev => ({ ...prev, phone: event.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                            placeholder="5511999999999"
                          />
                        </label>

                        <label className="block space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email</span>
                          <input
                            value={contactEdit.email}
                            onChange={event => setContactEdit(prev => ({ ...prev, email: event.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                            placeholder="email@dominio.com"
                          />
                        </label>

                        <label className="block space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status CRM</span>
                          <input
                            value={contactEdit.status}
                            onChange={event => setContactEdit(prev => ({ ...prev, status: event.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                            placeholder="conversando"
                          />
                        </label>

                        <label className="block space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Observações</span>
                          <textarea
                            value={contactEdit.observations}
                            onChange={event => setContactEdit(prev => ({ ...prev, observations: event.target.value }))}
                            rows={4}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                            placeholder="Observações e histórico do contato"
                          />
                        </label>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => void saveContactDetails()}
                            disabled={contactEditSaving || !selectedConversation}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                          >
                            {contactEditSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                            Salvar contato
                          </button>
                          <button
                            type="button"
                            onClick={() => void sendContactCard()}
                            disabled={sendingHumanMessage || !selectedConversation}
                            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                          >
                            <UserRound size={15} />
                            Enviar contato
                          </button>
                        </div>

                        {contactEditError && (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            {contactEditError}
                          </div>
                        )}
                      </div>
                    </PanelBlock>

                    <PanelBlock title="Resumo operacional">
                      <InfoRow icon={<User size={14} />} label="Cliente" value={selectedConversation.nome_crm || selectedConversation.cliente_nome || 'Nao informado'} />
                      <InfoRow icon={<Phone size={14} />} label="Telefone" value={selectedConversation.telefone || selectedConversation.document_key} mono />
                      <InfoRow icon={<Mail size={14} />} label="Email" value={selectedConversation.email_principal || 'Nao informado'} />
                      <InfoRow icon={<Clock3 size={14} />} label="Status CRM" value={selectedConversation.contato_status || 'Nao definido'} />
                      <InfoRow icon={<UserCheck size={14} />} label="Agente atual" value={selectedConversation.agente_atual || selectedConversation.agente_nome || 'Nao atribuido'} />
                    </PanelBlock>

                    {renovacoesCRM.length > 0 && (
                      <PanelBlock title={`Renovacoes pendentes (${renovacoesCRM.length})`}>
                        <div className="space-y-3">
                          {renovacoesCRM.map(r => {
                            const dias = r.dias_restantes
                            const urgencia = dias <= 0 ? 'text-red-600 bg-red-50' : dias <= 7 ? 'text-orange-600 bg-orange-50' : dias <= 15 ? 'text-yellow-600 bg-yellow-50' : 'text-blue-600 bg-blue-50'
                            const diasLabel = dias <= 0 ? `Vencido há ${Math.abs(dias)} dias` : dias === 1 ? '1 dia restante' : `${dias} dias restantes`
                            return (
                              <div key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-semibold text-slate-700 leading-tight">{r.tipo_certificado}</span>
                                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${urgencia}`}>{diasLabel}</span>
                                </div>
                                {r.pedido && <p className="text-[11px] text-slate-500">Pedido: <span className="font-mono text-slate-700">{r.pedido}</span></p>}
                                {r.protocolo && <p className="text-[11px] text-slate-500">Protocolo: <span className="font-mono text-slate-700">{r.protocolo}</span></p>}
                                <p className="text-[11px] text-slate-500">Vencimento: <span className="text-slate-700">{new Date(r.data_vencimento).toLocaleDateString('pt-BR')}</span></p>
                                {r.valor != null && <p className="text-[11px] text-slate-500">Valor: <span className="font-semibold text-slate-700">R$ {r.valor.toFixed(2).replace('.', ',')}</span></p>}
                              </div>
                            )
                          })}
                        </div>
                      </PanelBlock>
                    )}

                    <PanelBlock title="Controles do atendimento">
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Etapa do Kanban</label>
                      <select value={normalizeKanbanStatus(selectedConversation.kanban_status)} onChange={event => void updateConversationStatus(event.target.value)} disabled={actionLoading} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                        {STATUS_OPTIONS.map(column => (
                          <option key={column.key} value={column.key}>{column.label}</option>
                        ))}
                      </select>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => void updateConversationStatus('resolvido')}
                          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 disabled:opacity-50"
                        >
                          Resolver e sair
                        </button>
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => void updateConversationStatus('arquivado')}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                        >
                          Arquivar e sair
                        </button>
                      </div>

                      <p className="mt-2 text-[11px] text-slate-500">
                        Ao resolver ou arquivar, a conversa sai da lista principal e continua acessivel em encerradas.
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={actionLoading || humanModeActive} onClick={() => void toggleHumanMode(true)} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                          Assumir humano
                        </button>
                        <button type="button" disabled={actionLoading || !humanModeActive} onClick={() => void toggleHumanMode(false)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                          Voltar para IA
                        </button>
                      </div>

                      <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-slate-500">Atribuir agente</label>
                      <select value={selectedAgentId} onChange={event => setSelectedAgentId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                        <option value="">Selecione um agente</option>
                        {agents.map(agent => (
                          <option key={agent.id} value={agent.id}>{agent.nome} - {agent.perfil}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => void assignConversation()} disabled={actionLoading || !selectedAgentId} className="mt-2 w-full rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                        Atribuir conversa
                      </button>
                    </PanelBlock>

                    <PanelBlock title="Observacoes do contato">
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{selectedConversation.observacoes || 'Sem observacoes no crm_customers.'}</p>
                    </PanelBlock>

                    <PanelBlock title="Leitura operacional">
                      <ul className="space-y-2 text-sm text-slate-600">
                        <li>Fila: <strong>{queueLabel(selectedConversation.fila)}</strong></li>
                        <li>Modo atual: <strong>{humanModeActive ? 'Humano' : 'IA Clara'}</strong></li>
                        <li>Documento-chave: <strong>{selectedConversation.document_key}</strong></li>
                        <li>Agente desde: <strong>{formatDateTime(selectedConversation.agente_desde)}</strong></li>
                        <li>Ultima mensagem: <strong>{selectedConversation.ultima_mensagem || 'Sem resumo'}</strong></li>
                      </ul>
                    </PanelBlock>
                  </div>
                </aside>
              </div>
            )}
          </section>
        </div>
      )}

      {manualConversationOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Nova conversa manual</h3>
                <p className="text-sm text-slate-500">Escolha o numero de saida, informe o contato e envie a primeira mensagem.</p>
              </div>
              <button type="button" onClick={closeManualConversationModal} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <X size={15} /> Fechar
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nome do contato</span>
                  <input
                    value={manualConversation.contactName}
                    onChange={event => setManualConversation(prev => ({ ...prev, contactName: event.target.value }))}
                    placeholder="Ex.: Alexandre"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Telefone com DDD</span>
                  <input
                    value={manualConversation.phone}
                    onChange={event => setManualConversation(prev => ({ ...prev, phone: event.target.value }))}
                    placeholder="5511999999999"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Numero de saida</span>
                  <select
                    value={manualConversation.integrationId}
                    onChange={event => {
                      const next = manualChannelOptions.find(item => item.integration.id === event.target.value)
                      setManualConversation(prev => ({
                        ...prev,
                        integrationId: event.target.value,
                        queue: next?.queue ?? prev.queue,
                      }))
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                  >
                    <option value="">Selecione um canal</option>
                    {manualChannelOptions.map(option => (
                      <option key={option.integration.id} value={option.integration.id}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fila da conversa</span>
                  <select
                    value={manualConversation.queue}
                    onChange={event => setManualConversation(prev => ({ ...prev, queue: event.target.value as QueueType }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                  >
                    <option value="atendimento">Atendimento</option>
                    <option value="renovacao">Renovacao</option>
                  </select>
                </label>
              </div>

              {deepLinkContexto && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-500">Contexto da renovação</p>
                  <p className="text-sm text-blue-800"><strong>{deepLinkContexto.tipo_certificado}</strong> — vence em {deepLinkContexto.data_vencimento} ({deepLinkContexto.dias_restantes} dias)</p>
                  {deepLinkContexto.pedido && <p className="text-xs text-blue-700">Pedido: <span className="font-mono">{deepLinkContexto.pedido}</span></p>}
                  {deepLinkContexto.protocolo && <p className="text-xs text-blue-700">Protocolo: <span className="font-mono">{deepLinkContexto.protocolo}</span></p>}
                  {deepLinkContexto.valor && <p className="text-xs text-blue-700">Valor: {deepLinkContexto.valor}</p>}
                </div>
              )}

              <label className="block space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Primeira mensagem</span>
                <textarea
                  value={manualConversation.firstMessage}
                  onChange={event => setManualConversation(prev => ({ ...prev, firstMessage: event.target.value }))}
                  rows={5}
                  placeholder="Digite aqui a mensagem inicial para o contato."
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-sky-400"
                />
              </label>

              {manualConversationError && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  {manualConversationError}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={closeManualConversationModal} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancelar
                </button>
                <button type="button" onClick={() => void createManualConversation()} disabled={manualConversationLoading} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {manualConversationLoading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Iniciar conversa
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {kanbanOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <div className="flex h-[min(92vh,960px)] w-[min(98vw,1720px)] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Kanban operacional</h3>
                <p className="text-sm text-slate-500">Janela ampla para organizar as filas. Ao clicar no card, voce volta direto para o chat.</p>
              </div>
              <button type="button" onClick={closeKanban} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <X size={15} /> Fechar
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-4">
              <div className="flex h-full gap-3" style={{ minWidth: `${STATUS_COLUMNS.length * 290}px` }}>
                {groupedByStatus.map(column => (
                  <div
                    key={column.key}
                    className={`flex min-h-0 w-[280px] flex-col rounded-2xl border ${TONE_STYLES[column.tone]}`}
                    onDragOver={event => event.preventDefault()}
                    onDrop={event => {
                      event.preventDefault()
                      const droppedId = event.dataTransfer.getData('text/plain') || draggedConversationId
                      if (!droppedId) return
                      setDraggedConversationId(null)
                      void updateConversationStatusById(droppedId, column.key)
                    }}
                  >
                    <div className="flex items-center justify-between border-b border-black/5 px-3 py-3">
                      <span className="text-sm font-semibold">{column.label}</span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">{column.items.length}</span>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-2">
                      <div className="space-y-2">
                        {column.items.map(item => (
                            <ConversationMiniCard
                              key={item.id}
                              item={item}
                              selected={item.id === selectedId}
                              onClick={() => selectConversationFromKanban(item.id)}
                              human={item.atendimento_humano || humanOverrideIds.includes(item.id)}
                              unreadCount={unreadCounts[item.id] ?? 0}
                              draggable
                              onDragStart={event => {
                              setDraggedConversationId(item.id)
                              event.dataTransfer.setData('text/plain', item.id)
                              event.dataTransfer.effectAllowed = 'move'
                            }}
                            onDragEnd={() => setDraggedConversationId(null)}
                            onDelete={() => void deleteConversation(item.id)}
                            onSaveContact={() => void saveContactFromConversation(item.id)}
                          />
                        ))}
                        {column.items.length === 0 && <EmptyState text="Sem conversas" compact />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  active = false,
  onClick,
}: {
  label: string
  value: number
  active?: boolean
  onClick?: () => void
}) {
  const className = `rounded-[24px] border px-4 py-3 text-left transition-all ${
    active
      ? 'border-slate-900 bg-slate-900 text-white shadow-[0_12px_30px_rgba(15,23,42,0.14)]'
      : 'border-slate-200 bg-white hover:border-slate-300 hover:-translate-y-0.5'
  }`

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${active ? 'text-slate-300' : 'text-slate-400'}`}>{label}</p>
        <div className="mt-3 flex items-end justify-between gap-3">
          <p className={`text-3xl font-semibold tracking-[-0.04em] ${active ? 'text-white' : 'text-slate-950'}`}>{value}</p>
          <span className="text-[11px] text-slate-400">Filtrar</span>
        </div>
      </button>
    )
  }

  return (
    <div className={className}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
    </div>
  )
}

function ConversationCard({
  item,
  selected,
  onClick,
  human,
  unreadCount = 0,
  closed = false,
  previewMessages = [],
}: {
  item: ConversationRow
  selected: boolean
  onClick: () => void
  human: boolean
  unreadCount?: number
  closed?: boolean
  previewMessages?: CrmMessage[]
}) {
    const urgency = getUrgencyMeta(item, human)
    const selectedClass = selected
      ? 'border-slate-900 bg-slate-900 text-white'
      : closed
        ? 'border-slate-200 bg-slate-50 hover:border-slate-300'
        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'

    return (
      <button type="button" onClick={onClick} className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selectedClass}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{item.cliente_nome || item.nome_crm || 'Sem nome'}</p>
            <p className={`mt-1 truncate text-xs ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{item.telefone || item.document_key}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${selected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>{queueLabel(item.fila)}</span>
            {unreadCount > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${selected ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700'}`}>{unreadCount} nova{unreadCount > 1 ? 's' : ''}</span>
            )}
            {human ? <UserRound size={14} /> : <Bot size={14} />}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {urgency && <Badge text={urgency.label} tone={urgency.tone} />}
          {!hasRegisteredCustomer(item) && <Badge text="Contato sem cadastro" tone="amber" />}
          {closed && <Badge text="Encerrada" tone="slate" />}
        </div>
        <div className="mt-3 space-y-1.5">
          {previewMessages.slice(0, 3).reverse().map(message => {
            const previewText = (message.mensagem || message.file_name || 'Mensagem sem texto').replace(/\s+/g, ' ').trim()
            const previewLabel = message.sender_type === 'cliente'
              ? 'Cliente'
              : message.sender_type === 'ia'
                ? 'IA'
                : 'Humano'
            return (
              <div
                key={message.id}
                className={`rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  selected
                    ? 'bg-white/10 text-slate-100'
                    : message.direction === 'outgoing'
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-slate-50 text-slate-700'
                }`}
              >
                <p className="mb-0.5 font-semibold uppercase tracking-wide opacity-70">{previewLabel}</p>
                <p className="line-clamp-2 break-words">{previewText}</p>
              </div>
            )
          })}
          {previewMessages.length === 0 && (
            <p className={`line-clamp-2 text-sm ${selected ? 'text-slate-100' : 'text-slate-600'}`}>
              {item.ultima_mensagem || 'Sem ultima mensagem gravada.'}
            </p>
          )}
        </div>
        <div className={`mt-3 flex items-center justify-between text-xs ${selected ? 'text-slate-300' : 'text-slate-500'}`}>
          <span>{statusLabel(item.kanban_status)}</span>
          <span>{formatRelative(item.ultima_interacao_em)}</span>
        </div>
    </button>
  )
}

function ConversationMiniCard({
  item,
  selected,
  onClick,
  human,
  unreadCount = 0,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDelete,
  onSaveContact,
}: {
  item: ConversationRow
  selected: boolean
  onClick: () => void
  human: boolean
  unreadCount?: number
  draggable?: boolean
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void
  onDragEnd?: () => void
  onDelete?: () => void
  onSaveContact?: () => void
}) {
    const urgency = getUrgencyMeta(item, human)
    const hasCrmCustomer = !!item.crm_customer_id
    return (
      <div className={`group relative w-full rounded-xl border ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-white/70 bg-white hover:border-slate-300'}`}>
        <button type="button" onClick={onClick} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} className="w-full px-3 py-3 text-left">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{item.cliente_nome || item.nome_crm || 'Sem nome'}</p>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${selected ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700'}`}>{unreadCount}</span>}
              {human ? <UserRound size={14} /> : <Bot size={14} />}
            </div>
          </div>
          <p className={`mt-1 truncate text-xs ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{item.telefone || item.document_key}</p>
          {urgency && <div className="mt-2"><Badge text={urgency.label} tone={urgency.tone} /></div>}
          <p className={`mt-2 line-clamp-2 text-xs ${selected ? 'text-slate-100' : 'text-slate-600'}`}>{item.ultima_mensagem || 'Sem mensagem'}</p>
        </button>
        <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
          {!hasCrmCustomer && onSaveContact && (
            <button type="button" onClick={event => { event.stopPropagation(); onSaveContact() }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm hover:bg-sky-50 hover:text-sky-600"
              title="Salvar contato">
              <UserPlus size={13} />
            </button>
          )}
          {onDelete && (
            <button type="button" onClick={event => { event.stopPropagation(); onDelete() }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm hover:bg-red-50 hover:text-red-600"
              title="Apagar conversa">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    )
  }

function MessageRow({
  message,
  fallbackHumanName,
  conversation,
}: {
  message: CrmMessage
  fallbackHumanName?: string | null
  conversation?: ConversationRow | null
}) {
  const isOutgoing = message.direction === 'outgoing'
    const senderLabel = message.sender_type === 'cliente'
      ? 'Cliente'
      : message.sender_type === 'ia'
        ? 'IA Clara'
        : message.sender_name || fallbackHumanName || 'Humano'
    const detailLabel = message.sender_type === 'cliente'
      ? conversation?.telefone || conversation?.document_key || 'Canal de entrada'
      : message.sender_type === 'ia'
        ? conversation?.whatsapp_instance || 'Automacao'
        : message.sender_name || fallbackHumanName || conversation?.agente_atual || 'Humano'
    const isImage = isImageMime(message.mime_type)
    const isAudio = isAudioMime(message.mime_type)
    const isVideo = isVideoMime(message.mime_type)
    const isDocument = isDocumentMime(message.mime_type)
    const mediaLabel = message.file_name || message.mensagem || (isAudio ? 'Audio' : isImage ? 'Imagem' : isVideo ? 'Video' : 'Arquivo')
  
    return (
      <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm ${isOutgoing ? 'bg-emerald-100 text-emerald-950' : 'bg-white text-slate-800'}`}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>{senderLabel}</span>
            <span>•</span>
            <span>{detailLabel}</span>
            <span>•</span>
            <span>{formatDateTime(message.created_at)}</span>
          </div>
          {isImage && message.media_url ? (
            <a href={message.media_url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
              <img src={message.media_url} alt={mediaLabel} className="max-w-full rounded-xl" />
            </a>
          ) : isAudio && message.media_url ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-violet-700">Audio anexado</p>
              <audio src={message.media_url} controls className="w-full min-w-0" preload="metadata" />
            </div>
          ) : isVideo && message.media_url ? (
            <div className="space-y-2">
              <video src={message.media_url} controls className="max-w-full rounded-xl" preload="metadata" />
              <a href={message.media_url} target="_blank" rel="noreferrer" className="text-xs text-sky-600 hover:underline">
                Abrir video em nova aba
              </a>
            </div>
          ) : isDocument && message.media_url ? (
            <a href={message.media_url} target="_blank" rel="noreferrer" className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-sky-700 hover:underline">
              📎 {mediaLabel}
            </a>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.mensagem || mediaLabel || 'Mensagem sem texto'}</p>
          )}
        </div>
    </div>
  )
}

function PanelBlock({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <button type="button" onClick={() => setOpen(prev => !prev)} className="flex w-full items-center justify-between gap-2 text-left">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
        <ChevronDown size={14} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </div>
  )
}

function InfoRow({ icon, label, value, mono = false }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 text-slate-400">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className={`mt-0.5 break-words text-sm text-slate-700 ${mono ? 'font-mono' : ''}`}>{value}</p>
      </div>
    </div>
  )
}

function Badge({ text, tone }: { text: string; tone: 'blue' | 'violet' | 'green' | 'amber' | 'slate' | 'red' | 'sky' }) {
  const classes = {
    blue: 'bg-blue-100 text-blue-700',
    violet: 'bg-violet-100 text-violet-700',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
    slate: 'bg-slate-100 text-slate-700',
    red: 'bg-red-100 text-red-700',
    sky: 'bg-sky-100 text-sky-700',
  }

  return <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${classes[tone]}`}>{text}</span>
}

function EmptyState({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 text-center text-slate-400 ${compact ? 'px-3 py-6 text-xs' : 'px-4 py-10 text-sm'}`}>
      <MessageCircle size={compact ? 18 : 24} className="mb-2" />
      <p>{text}</p>
    </div>
  )
}

