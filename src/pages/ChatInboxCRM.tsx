import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  Calendar,
  Check,
  CheckCheck,
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
  Reply,
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
import { getApiUrl, resolveChatMediaUrl } from '@/lib/api'
import { logger } from '@/lib/logger'
import { useAuth } from '@/contexts/AuthContext'
import { applyOutgoingSignature, DEFAULT_CRM_CHAT_SETTINGS, loadCrmChatSettings } from '@/lib/crmChatSettings'
import { normalizeStructuredMessage } from '@/lib/messageFormatting'
import { normalizePhoneBR } from '@/lib/phone'
import MediaPreview from '@/components/MediaPreview'

type QueueType = 'atendimento' | 'renovacao' | 'email' | 'agendamento'
type DirectionType = 'incoming' | 'outgoing'
type SenderType = 'cliente' | 'ia' | 'humano' | 'contact' | 'agent'
type RecState = 'idle' | 'recording' | 'preview'

interface ConversationRow {
  id: string
  document_key: string
  telefone: string | null
  cliente_nome: string | null
  empresa_nome: string | null
  whatsapp_instance: string | null
  numero_receptor: string | null
  fila: string
  kanban_status: string
  atendimento_humano: boolean
  agente_nome: string | null
  ultima_mensagem: string | null
  ultima_mensagem_direcao: DirectionType | null
  ultima_interacao_em: string
  tem_resposta?: boolean
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
  delivery_status?: string | null
  delivered_at?: string | null
  read_at?: string | null
  status_updated_at?: string | null
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
  company: string
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

function inferMediaKind(
  mimeType: string | null | undefined,
  mediaUrl: string | null | undefined,
  fileName: string | null | undefined,
  mensagem: string | null | undefined,
) {
  const mime = normalizeMimeType(mimeType)
  const url = String(mediaUrl ?? '').toLowerCase()
  const name = String(fileName ?? '').toLowerCase()
  const text = String(mensagem ?? '').trim().toLowerCase()

  if (mime.startsWith('image/') || url.startsWith('data:image/') || /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(url) || /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(name) || text === 'imagem') return 'image'
  if (mime.startsWith('audio/') || url.startsWith('data:audio/') || /\.(mp3|wav|ogg|m4a|webm)(\?.*)?$/i.test(url) || /\.(mp3|wav|ogg|m4a|webm)$/i.test(name) || text === 'áudio' || text === 'audio') return 'audio'
  if (mime.startsWith('video/') || url.startsWith('data:video/') || /\.(mp4|mov|mkv|webm)(\?.*)?$/i.test(url) || /\.(mp4|mov|mkv|webm)$/i.test(name) || text === 'vídeo' || text === 'video') return 'video'
  if (mime.startsWith('application/') || /\.(pdf|docx?|xlsx?|pptx?|txt)(\?.*)?$/i.test(url) || /\.(pdf|docx?|xlsx?|pptx?|txt)$/i.test(name) || text === 'documento' || text === 'arquivo') return 'document'
  return 'text'
}

function inferMediaFileName(mimeType?: string | null, fileName?: string | null, mensagem?: string | null) {
  const explicitName = String(fileName || '').trim()
  if (explicitName && /\.[a-z0-9]{2,5}$/i.test(explicitName)) return explicitName

  const label = String(explicitName || mensagem || '').trim()
  const mime = String(mimeType || '').toLowerCase()
  if (mime.includes('pdf')) return label && label !== 'Arquivo' ? `${label}.pdf` : 'documento.pdf'
  if (mime.includes('png')) return label && label !== 'Imagem' ? `${label}.png` : 'imagem.png'
  if (mime.includes('webp')) return label && label !== 'Imagem' ? `${label}.webp` : 'imagem.webp'
  if (mime.includes('jpeg') || mime.includes('jpg') || mime.startsWith('image/')) return label && label !== 'Imagem' ? `${label}.jpg` : 'imagem.jpg'
  if (mime.includes('mpeg') || mime.includes('mp3')) return label && label !== 'Audio' ? `${label}.mp3` : 'audio.mp3'
  if (mime.includes('ogg') || mime.includes('opus') || mime.startsWith('audio/')) return label && label !== 'Audio' ? `${label}.ogg` : 'audio.ogg'
  if (mime.includes('mp4') || mime.startsWith('video/')) return label && label !== 'Video' ? `${label}.mp4` : 'video.mp4'
  return explicitName || label || 'arquivo'
}

function isEncryptedWhatsappMediaUrl(mediaUrl: string | null | undefined) {
  return /(^https?:\/\/)?mmg\.whatsapp\.net\//i.test(String(mediaUrl ?? ''))
    || /\/api\/chat\/media-proxy\?/i.test(String(mediaUrl ?? '')) && /mmg\.whatsapp\.net/i.test(String(mediaUrl ?? ''))
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function queueLabel(fila: string) {
  if (fila === 'renovacao') return 'Renovacao'
  if (fila === 'email') return 'Email'
  if (fila === 'agendamento') return 'Agendamento'
  return 'Atendimento'
}

function contactPhone(item: ConversationRow) {
  if (item.fila === 'email') return item.email_principal || item.document_key
  const raw = item.telefone || item.document_key
  return raw.replace(/@.*$/, '')
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

function formatPhoneHint(value: string) {
  const digits = normalizePhone(value)
  if (!digits) return 'Aceita com ou sem DDI. Ex.: 11999999999 ou 5511999999999'
  return digits.startsWith('55')
    ? `Será enviado como ${digits}`
    : 'Aceita com ou sem DDI. Ex.: 11999999999 ou 5511999999999'
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

function normalizeDisplaySenderName(value: string | null | undefined) {
  const text = (value ?? '').trim()
  if (!text) return null
  const normalized = text
    .normalize('NFD')
    .replace(/̀-ͯ/g, '')
    .toLowerCase()
  if (normalized === 'voce' || normalized === 'you' || normalized === 'me') return null
  return text
}

function displayConversationName(item: ConversationRow | null | undefined) {
  if (!item) return 'Sem nome identificado'
  const person = normalizeDisplaySenderName(item.nome_crm || item.cliente_nome)
  const company = normalizeDisplaySenderName(item.empresa_nome)
  if (person && company && person.toLowerCase() !== company.toLowerCase()) return `${person} · ${company}`
  return person || company || (item.fila === 'email' ? item.email_principal || item.document_key : null) || contactPhone(item) || 'Sem nome identificado'
}

function stripOutgoingSignature(text: string | null | undefined, senderName?: string | null): string {
  if (!text || !senderName) return text ?? ''
  const trimmed = text.trimEnd()
  const suffix = `\n\n— ${senderName}`
  if (trimmed.endsWith(suffix)) return trimmed.slice(0, -suffix.length).trimEnd()
  return text
}

function dedupeConversations(rows: ConversationRow[]) {
  const bestByKey = new Map<string, ConversationRow>()

  for (const item of rows) {
    const phoneKey = normalizePhoneBR(item.telefone || item.document_key)
    const emailKey = (item.email_principal || item.document_key || '').includes('@')
      ? (item.email_principal || item.document_key || '').trim().toLowerCase()
      : ''
    // Usa telefone como chave primaria estavel — nao muda quando
    // crm_customer_id passa de null para uuid apos salvar contato.
    const identity = phoneKey
      ? `phone:${phoneKey}`
      : emailKey
        ? `email:${emailKey}`
        : `row:${item.id}`
    const key = `${item.fila}:${identity}`
    const current = bestByKey.get(key)
    if (!current) {
      bestByKey.set(key, item)
      continue
    }
    const currentTime = new Date(current.ultima_interacao_em || current.created_at).getTime()
    const nextTime = new Date(item.ultima_interacao_em || item.created_at).getTime()
    if (nextTime >= currentTime) bestByKey.set(key, item)
  }

  return [...bestByKey.values()].sort((a, b) => new Date(b.ultima_interacao_em || b.created_at).getTime() - new Date(a.ultima_interacao_em || a.created_at).getTime())
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

function asMessageRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function pickMessageString(source: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!source) return ''
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function deepPickMessageString(value: unknown, keys: string[], depth = 0, maxDepth = 4): string {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > maxDepth) return ''
  const record = value as Record<string, unknown>
  for (const key of keys) {
    const candidate = record[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  for (const candidate of Object.values(record)) {
    const nested = deepPickMessageString(candidate, keys, depth + 1, maxDepth)
    if (nested) return nested
  }
  return ''
}

function deepPickMessageRecord(value: unknown, predicate: (record: Record<string, unknown>) => boolean, depth = 0, maxDepth = 4): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > maxDepth) return null
  const record = value as Record<string, unknown>
  if (predicate(record)) return record
  for (const candidate of Object.values(record)) {
    const nested = deepPickMessageRecord(candidate, predicate, depth + 1, maxDepth)
    if (nested) return nested
  }
  return null
}

function parseEvolutionEventMessages(events: EvolutionEventRow[], viewerQueryString = ''): CrmMessage[] {
  return events
    .filter(event => event.source === 'evolution')
    .map(event => {
      const payload = event.payload ?? {}
      const data = (payload.data as Record<string, unknown> | undefined) ?? undefined
      const fromMe = Boolean(payload.fromMe ?? data?.fromMe)
      const senderType = (payload.senderType as SenderType | undefined)
        ?? (fromMe ? 'humano' : 'cliente')
      const messageType = (payload.messageType as string | undefined)
        ?? (data?.messageType as string | undefined)
        ?? 'conversation'
      const rawContent = (payload.content as string | undefined)
        ?? (data?.content as string | undefined)
        ?? null
      const content = rawContent ? normalizeStructuredMessage(rawContent) : rawContent
      const mimeType = (payload.mimeType as string | undefined)
        ?? (data?.mimeType as string | undefined)
        ?? null
      const fileName = (payload.fileName as string | undefined)
        ?? (data?.fileName as string | undefined)
        ?? deepPickMessageString(payload, ['fileName', 'filename', 'title', 'name'])
        ?? null
      // A url do WhatsApp (mmg.whatsapp.net/...enc) e criptografada e nao pode
      // ser tocada/exibida direto. A Evolution API (webhook com base64: true)
      // ja manda o conteudo decifrado em data.message, mas o base64 fica dentro
      // do tipo especifico (imageMessage.base64, videoMessage.base64, etc.).
      const rawMessage = data?.message as Record<string, unknown> | undefined
      const messageEntry = rawMessage
        ? Object.entries(rawMessage).find(([, v]) => v !== null && v !== undefined)
        : null
      const messagePayload = asMessageRecord(messageEntry?.[1])
      const mediaRecord = deepPickMessageRecord(messageEntry?.[1], record =>
        typeof record.base64 === 'string'
        || typeof record.data === 'string'
        || typeof record.url === 'string'
        || typeof record.mediaUrl === 'string'
        || typeof record.mimetype === 'string'
        || typeof record.mimeType === 'string',
      )
      const inlineBase64 = (payload.base64 as string | undefined)
        ?? (rawMessage?.base64 as string | undefined)
        ?? (messagePayload?.base64 as string | undefined)
        ?? (mediaRecord?.base64 as string | undefined)
        ?? (mediaRecord?.data as string | undefined)
        ?? null
      const nestedBase64 = pickMessageString(messagePayload, 'base64', 'data') || deepPickMessageString(messageEntry?.[1], ['base64', 'data']) || (mediaRecord?.base64 as string | undefined) || (mediaRecord?.data as string | undefined) || ''
      const nestedUrl = pickMessageString(messagePayload, 'url', 'mediaUrl') || deepPickMessageString(messageEntry?.[1], ['url', 'mediaUrl', 'link']) || (mediaRecord?.url as string | undefined) || (mediaRecord?.mediaUrl as string | undefined) || ''
      const nestedMime = (mediaRecord?.mimetype as string | undefined) || (mediaRecord?.mimeType as string | undefined) || null
      const mediaUrl = inlineBase64
        ? `data:${mimeType || nestedMime || 'application/octet-stream'};base64,${inlineBase64}`
        : nestedBase64
          ? `data:${mimeType || nestedMime || 'application/octet-stream'};base64,${nestedBase64}`
          : (payload.mediaUrl as string | undefined)
            ?? (data?.mediaUrl as string | undefined)
            ?? nestedUrl
            ?? null
      const finalMimeType = mimeType || nestedMime || null
      const isEncryptedWhatsappMediaUrl = Boolean(mediaUrl && /(^https?:\/\/)?mmg\.whatsapp\.net\//i.test(mediaUrl))
      const eventMediaUrl = viewerQueryString && (mediaUrl || finalMimeType || fileName || /image|video|audio|document|file|sticker/i.test(messageType))
        ? `/api/chat/event-media/${encodeURIComponent(String(event.id))}?${viewerQueryString}`
        : null
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
        mime_type: finalMimeType,
        file_name: fileName,
        media_url: isEncryptedWhatsappMediaUrl ? eventMediaUrl : (mediaUrl ?? eventMediaUrl),
        delivery_status: null,
        delivered_at: null,
        read_at: null,
        status_updated_at: null,
        created_at: event.created_at,
      }
    })
    .filter(message => Boolean(message.conversation_id))
}

function mergeConversationMessages(messages: CrmMessage[]) {
  const ordered = [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const seenExternalIds = new Map<string, CrmMessage>()
  const seenSignatures = new Set<string>()
  const result: CrmMessage[] = []

  for (const message of ordered) {
    const content = (message.mensagem ?? '').trim().replace(/\s+/g, ' ')
    const externalId = message.external_message_id?.trim() || (message.id.startsWith('evo-') ? message.id.slice(4) : '')
    if (externalId) {
      const existing = seenExternalIds.get(externalId)
      if (existing) {
        const existingEncryptedMedia = isEncryptedWhatsappMediaUrl(existing.media_url)
        const messageHasUsableMedia = Boolean(message.media_url && !isEncryptedWhatsappMediaUrl(message.media_url))
        // Prefere a versao da Evolution quando ela traz base64/rota por evento.
        if (((!existing.mime_type && !existing.media_url) || existingEncryptedMedia) && (message.mime_type || messageHasUsableMedia)) {
          seenExternalIds.set(externalId, message)
        }
        continue
      }
      seenExternalIds.set(externalId, message)
    }

    const signature = [
      message.direction,
      message.mime_type ?? '',
      message.file_name ?? '',
      content.toLowerCase(),
      message.created_at.slice(0, 16),
    ].join('|')

    if (seenSignatures.has(signature)) continue
    seenSignatures.add(signature)
  }

  for (const message of seenExternalIds.values()) {
    result.push(message)
  }

  return result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
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
  const [aguardandoFilter, setAguardandoFilter] = useState(false)
  const [showClosedConversations, setShowClosedConversations] = useState(false)
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
  const [viewMode, setViewMode] = useState<'lista' | 'kanban'>('lista')
  const [kanbanOpen, setKanbanOpen] = useState(false)
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [draggedConversationId, setDraggedConversationId] = useState<string | null>(null)
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set())
  const [selectionAnchors, setSelectionAnchors] = useState<Record<string, string>>({})
  const [humanMessage, setHumanMessage] = useState('')
  const [sendingHumanMessage, setSendingHumanMessage] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [showEmailReply, setShowEmailReply] = useState(false)
  const [manualConversationOpen, setManualConversationOpen] = useState(false)
  const [manualConversationLoading, setManualConversationLoading] = useState(false)
  const [manualConversationError, setManualConversationError] = useState<string | null>(null)
  const [integrations, setIntegrations] = useState<EvolutionIntegration[]>([])
  const [manualConversation, setManualConversation] = useState<ManualConversationForm>(createEmptyManualConversationForm)
  const [selectedReplyIntegrationId, setSelectedReplyIntegrationId] = useState('')
  const [selectedReplyIntegrationConversationId, setSelectedReplyIntegrationConversationId] = useState<string | null>(null)
  const [signOutgoingMessages, setSignOutgoingMessages] = useState(DEFAULT_CRM_CHAT_SETTINGS.sign_outgoing_messages)
  const [chatSettingsLoading, setChatSettingsLoading] = useState(true)
  const [showHumanResponsePanel, setShowHumanResponsePanel] = useState(false)
  const [showHumanResponseDetails, setShowHumanResponseDetails] = useState(false)
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
    company: '',
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

  const humanModeActive = useMemo(() => {
    if (!selectedConversation) return false
    if (selectedConversation.atendimento_humano || humanOverrideIds.includes(selectedConversation.id)) return true
    if (selectedConversation.fila !== 'renovacao') return true
    const inst = String(selectedConversation.whatsapp_instance ?? '').trim().toLowerCase()
    if (inst && !inst.includes('renov') && !inst.includes('certiid')) return true
    return false
  }, [humanOverrideIds, selectedConversation])

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

  const selectedReplyQueue = useMemo(() => {
    const selectedOption = replyChannelOptions.find(item => item.id === selectedReplyIntegrationId)
    return selectedOption?.queue ?? selectedConversation?.fila ?? null
  }, [replyChannelOptions, selectedConversation?.fila, selectedReplyIntegrationId])

  const replyQueueOptions = useMemo(
    () => Array.from(new Set(replyChannelOptions.map(item => item.queue))),
    [replyChannelOptions],
  )

  const visibleReplyChannelOptions = useMemo(() => {
    if (!selectedReplyQueue) return replyChannelOptions
    return replyChannelOptions.filter(item => item.queue === selectedReplyQueue)
  }, [replyChannelOptions, selectedReplyQueue])

  const viewerQueryString = useMemo(() => {
    const params = new URLSearchParams()
    if (profile?.id) params.set('profile_id', profile.id)
    if (profile?.perfil) params.set('perfil', profile.perfil)
    return params.toString()
  }, [profile?.id, profile?.perfil])

  useEffect(() => {
    if (!profile?.id) return
    void bootstrap()
  }, [profile?.id])

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
    const digits = normalizePhoneBR(deepLinkPhone)
    const match = digits
      ? conversations.find(item =>
          normalizePhoneBR(item.document_key) === digits ||
          normalizePhoneBR(item.telefone) === digits
        )
      : undefined
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
      setShowHumanResponsePanel(false)
      setShowHumanResponseDetails(false)
      setSelectedReplyIntegrationId('')
      setSelectedReplyIntegrationConversationId(null)
      setContactEdit({
        name: '',
        company: '',
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
    setShowHumanResponsePanel(false)
    setShowHumanResponseDetails(false)
    void loadMessages(selectedConversation.id)
  }, [selectedConversation?.id])

  useEffect(() => {
    if (!selectedConversation) return
    setContactEdit({
      name: selectedConversation.nome_crm || selectedConversation.cliente_nome || '',
      company: selectedConversation.empresa_nome || '',
      phone: selectedConversation.fila === 'email' ? '' : (selectedConversation.telefone || selectedConversation.document_key || ''),
      email: selectedConversation.email_principal || (selectedConversation.fila === 'email' ? selectedConversation.document_key : ''),
      status: selectedConversation.contato_status || '',
      observations: selectedConversation.observacoes || '',
    })
    setContactEditError(null)
  }, [
    selectedConversation?.id,
    selectedConversation?.cliente_nome,
    selectedConversation?.empresa_nome,
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
    if (!profile?.id || !viewerQueryString) {
      setConversations([])
      setSelectedId(null)
      if (showRefreshing) setRefreshing(false)
      return
    }

    if (showRefreshing) setRefreshing(true)
    try {
      const response = await fetch(getApiUrl(`/chat/crm/conversations?${viewerQueryString}`))
      if (!response.ok) throw new Error('Erro ao carregar conversas')
      const json = await response.json() as { ok: boolean; data: ConversationRow[] }
      const rows = dedupeConversations(json.data ?? [])

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
        const response = await fetch(getApiUrl(`/chat/crm/messages?conversation_id=${encodeURIComponent(id)}&${viewerQueryString}`))
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
    if (!profile?.id || !viewerQueryString) {
      if (!background) setLoadingMessages(false)
      return
    }

    if (!background) setLoadingMessages(true)
    const conversation = conversations.find(item => item.id === conversationId) ?? null
    const documentKey = conversation?.document_key ?? ''

    try {
      const response = await fetch(getApiUrl(`/chat/crm/messages?conversation_id=${encodeURIComponent(conversationId)}&document_key=${encodeURIComponent(documentKey)}&${viewerQueryString}`))
      if (!response.ok) throw new Error('Erro ao carregar mensagens')
      const json = await response.json() as { ok: boolean; crmMessages: CrmMessage[]; evolutionMessages: EvolutionEventRow[] }

      const crmMessages = (json.crmMessages ?? []) as CrmMessage[]
      const evolutionMessages = parseEvolutionEventMessages((json.evolutionMessages ?? []) as EvolutionEventRow[], viewerQueryString)
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
        phone: normalizePhone(prefill?.phone ?? ''),
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

  async function changeConversationQueue(newFila: QueueType) {
    if (!selectedConversation) return
    setActionLoading(true)
    setActionError(null)
    try {
      const response = await fetch(getApiUrl(`/chat/crm/conversations/${selectedConversation.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fila: newFila }),
      })
      const data = await response.json()
      if (!data.ok) throw new Error(data.error || 'Falha ao alterar fila')
      await loadConversations(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
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

  function toggleConversationSelection(listKey: string, itemId: string, orderedIds: string[], shiftKey: boolean) {
    const anchorId = selectionAnchors[listKey]
    setSelectedConversationIds(prev => {
      const next = new Set(prev)
      if (shiftKey && anchorId) {
        const anchorIndex = orderedIds.indexOf(anchorId)
        const clickedIndex = orderedIds.indexOf(itemId)
        if (anchorIndex !== -1 && clickedIndex !== -1) {
          const [start, end] = anchorIndex < clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex]
          for (let i = start; i <= end; i += 1) next.add(orderedIds[i])
          return next
        }
      }
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
    setSelectionAnchors(prev => ({ ...prev, [listKey]: itemId }))
  }

  function clearConversationSelection() {
    setSelectedConversationIds(new Set())
    setSelectionAnchors({})
  }

  async function bulkDeleteSelectedConversations() {
    const ids = Array.from(selectedConversationIds)
    if (ids.length === 0) return
    if (!confirm(`Tem certeza que deseja apagar ${ids.length} conversa${ids.length > 1 ? 's' : ''}? Essa acao nao pode ser desfeita.`)) return
    try {
      const response = await fetch(getApiUrl('/chat/crm/conversations/bulk'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await response.json()
      if (!data.ok) throw new Error(data.error || 'Falha ao apagar conversas selecionadas')
      clearConversationSelection()
      await loadConversations(false)
      if (selectedId && ids.includes(selectedId)) setSelectedId(null)
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
      setConversations(prev => prev.map(item => (
        item.id === conversationId
          ? {
              ...item,
              cliente_nome: conv.cliente_nome || conv.nome_crm || item.cliente_nome,
              telefone: conv.telefone || conv.document_key || item.telefone,
              crm_customer_id: data.customer_id ?? item.crm_customer_id,
            }
          : item
      )))
      if (selectedConversation?.id === conversationId) {
        setContactEdit(prev => ({
          ...prev,
          name: conv.cliente_nome || conv.nome_crm || prev.name,
          phone: conv.telefone || conv.document_key || prev.phone,
        }))
      }
      await loadConversations(false)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  async function createManualConversation() {
    const normalizedPhone = normalizePhoneBR(manualConversation.phone)
    const normalizedDigits = (normalizedPhone ?? '').replace(/\D/g, '')
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

    if (normalizedDigits.length < 10) {
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
          canal: manualConversation.queue === 'renovacao' ? 'renovacao' : 'atendimento',
          conversation_id: `${normalizedPhone}@s.whatsapp.net`,
          content: firstMessage,
          contact_name: contactName || null,
          lead_id: null,
        }),
      })

      const payload = await response.json() as { ok?: boolean; error?: string; detail?: unknown }
      if (!response.ok || !payload.ok) {
        const detailText = typeof payload.detail === 'string'
          ? payload.detail
          : payload.detail && typeof payload.detail === 'object'
            ? JSON.stringify(payload.detail)
            : ''
        const rawError = [payload.error, detailText].filter(Boolean).join(' | ')
        const msg = rawError.includes('404') || rawError.includes('not found') || rawError.includes('invalid')
          ? 'Numero nao encontrado no WhatsApp. Verifique se o numero esta correto e ativo.'
          : rawError.includes('401') || rawError.includes('403')
            ? 'Credenciais do canal invalidas. Verifique a integracao em Configuracoes.'
            : /connection closed|socket hang up|econnreset|timeout/i.test(rawError)
              ? 'A Evolution fechou a conexao ao enviar. Tente novamente em alguns segundos; se repetir, reconecte essa instancia do WhatsApp.'
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
    const companyName = contact.company.trim() || selectedConversation?.empresa_nome || ''
    const phoneDigits = normalizeContactPhone(contact.phone || selectedConversation?.telefone || selectedConversation?.document_key || '')
    const email = contact.email.trim()
    const vcard = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${fullName}`,
      companyName ? `ORG:${companyName}` : null,
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
    const cleanedCompany = contactEdit.company.trim()
    const cleanedPhone = contactEdit.phone.trim()
    const cleanedEmail = contactEdit.email.trim()
    const cleanedStatus = contactEdit.status.trim()
    const cleanedObs = contactEdit.observations.trim()
    const resolvedName = cleanedName || selectedConversation.cliente_nome || selectedConversation.nome_crm || null
    const resolvedCompany = cleanedCompany || selectedConversation.empresa_nome || null
    const resolvedPhone = cleanedPhone || selectedConversation.telefone || selectedConversation.document_key || null
    const resolvedEmail = cleanedEmail || null
    const resolvedStatus = cleanedStatus || null
    const resolvedObs = cleanedObs || null

    if (selectedConversation.fila !== 'email') {
      if (!resolvedName) {
        setContactEditSaving(false)
        setContactEditError('Informe ao menos o nome do contato.')
        return
      }
      if (!resolvedPhone) {
        setContactEditSaving(false)
        setContactEditError('Para contato solto no chat, salve ao menos nome e telefone. O e-mail e opcional.')
        return
      }
    }

    try {
      let nextCustomerId = customerId
      if (customerId) {
        const r = await fetch(getApiUrl(`/chat/crm/customers/${customerId}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: resolvedName,
            empresa_nome: resolvedCompany,
            telefone: resolvedPhone,
            email: resolvedEmail,
            contato_status: resolvedStatus,
            observacoes: resolvedObs,
          }),
        })
        const d = await r.json()
        if (!d.ok) throw new Error(d.error || 'Falha ao atualizar cliente')
      } else {
        const r = await fetch(getApiUrl('/chat/crm/customers'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nome: resolvedName,
            empresa_nome: resolvedCompany,
            telefone: resolvedPhone,
            email: resolvedEmail,
            observacoes: resolvedObs,
            conversation_id: selectedConversation.id,
          }),
        })
        const d = await r.json()
        if (!d.ok) throw new Error(d.error || 'Falha ao criar contato leve no CRM')
        nextCustomerId = typeof d.customer_id === 'string' ? d.customer_id : null
      }

      await fetch(getApiUrl(`/chat/crm/conversations/${selectedConversation.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliente_nome: resolvedName, telefone: resolvedPhone }),
      })

      setConversations(prev => prev.map(item => (
        item.id === selectedConversation.id
          ? {
              ...item,
              cliente_nome: resolvedName,
              empresa_nome: resolvedCompany,
              telefone: resolvedPhone,
              crm_customer_id: nextCustomerId ?? item.crm_customer_id,
              nome_crm: resolvedName,
            }
          : item
      )))
      setContactEdit(prev => ({
        ...prev,
        name: resolvedName ?? prev.name,
        company: resolvedCompany ?? prev.company,
        phone: resolvedPhone ?? prev.phone,
        email: resolvedEmail ?? prev.email,
        status: resolvedStatus ?? prev.status,
        observations: resolvedObs ?? prev.observations,
      }))

      const historyText = [
        'Dados do contato atualizados no painel',
        resolvedName ? `Nome: ${resolvedName}` : null,
        resolvedCompany ? `Empresa: ${resolvedCompany}` : null,
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
            documentKey: selectedConversation.document_key,
            empresa_nome: resolvedCompany,
            telefone: resolvedPhone ?? selectedConversation.telefone ?? selectedConversation.document_key,
            customer_email: resolvedEmail ?? selectedConversation.email_principal ?? (selectedConversation.fila === 'email' ? selectedConversation.document_key : null),
            canal: selectedConversation.fila === 'renovacao'
              ? 'renovacao'
              : selectedConversation.fila === 'agendamento'
                ? 'agendamento'
                : selectedConversation.fila === 'email'
                  ? 'email'
                  : 'atendimento',
            kanban_status: selectedConversation.kanban_status,
            instance_name: selectedConversation.whatsapp_instance,
            instanceName: selectedConversation.whatsapp_instance,
            customer_id: nextCustomerId,
            nome: resolvedName,
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
        company: resolvedCompany || '',
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
      const companyName = contactEdit.company.trim() || selectedConversation.empresa_nome || ''
      const phoneDigits = normalizeContactPhone(contactEdit.phone || selectedConversation.telefone || selectedConversation.document_key || '')
      const filenameBase = companyName
        ? `${contactName} ${companyName}`
        : contactName
      const filename = `${filenameBase.replace(/[^\p{L}\p{N}]+/gu, '_') || 'contato'}.vcf`
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
          sender_name: senderName,
        }),
      })

      const payload = await response.json() as { ok?: boolean; error?: string; messageId?: string }
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Nao foi possivel enviar a mensagem humana.')

      setMessages(prev => prev.map(item => item.id === tempId ? { ...item, id: payload.messageId ?? tempId } : item))
      markConversationAsHuman(selectedConversation.id)
      fetch(getApiUrl(`/chat/crm/conversations/${selectedConversation.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ atendimento_humano: true, agente_nome: currentHumanAgentName }),
      }).catch(() => {})
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

  async function sendEmailReply() {
    if (!selectedConversation) return
    if (sendingEmail) return
    const subject = emailSubject.trim()
    const body = emailBody.trim()
    if (!body) return
    if (!subject) return
    const to = selectedConversation.email_principal || ''
    if (!to) {
      setActionError('Contato sem e-mail cadastrado.')
      return
    }

    setSendingEmail(true)
    setActionError(null)
    const tempId = `temp-email-${Date.now()}`
    const tempCreatedAt = new Date().toISOString()
    setMessages(prev => [...prev, {
      id: tempId,
      conversation_id: selectedConversation.id,
      document_key: selectedConversation.document_key,
      direction: 'outgoing',
      sender_type: 'humano',
      sender_name: currentHumanAgentName,
      mensagem: `[EMAIL] ${subject}\n\n${body}`,
      created_at: tempCreatedAt,
    }])
    setEmailBody('')

    try {
      const response = await fetch(getApiUrl('/chat/send-email'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          body,
          conversation_id: selectedConversation.id,
          lead_id: null,
        }),
      })
      const payload = await response.json() as { ok?: boolean; error?: string }
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Falha ao enviar e-mail.')
      await loadConversations(false)
      await loadMessages(selectedConversation.id, { background: true })
    } catch (err) {
      setMessages(prev => prev.filter(item => item.id !== tempId))
      setEmailBody(body)
      setActionError(`Falha no envio de e-mail: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSendingEmail(false)
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
      const fileBase64 = await blobToBase64(file)
      const response = await fetch(getApiUrl('/chat/send-media'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_name: integration.instance_name,
          conversation_id: selectedConversation.id,
          destination_number: destinationNumber,
          file_base64: fileBase64,
          file_name: filename,
          mime_type: finalMimeType,
          sender_name: currentHumanAgentName,
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
    fetch(getApiUrl(`/chat/crm/conversations/${selectedConversation.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atendimento_humano: true, agente_nome: currentHumanAgentName }),
    }).catch(() => {})
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
      const text = `${item.cliente_nome ?? ''} ${item.nome_crm ?? ''} ${item.empresa_nome ?? ''} ${item.telefone ?? ''} ${item.document_key ?? ''} ${item.ultima_mensagem ?? ''}`.toLowerCase()
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
    const matchesAguardando = !aguardandoFilter || (
      item.ultima_mensagem_direcao === 'incoming'
      && !item.tem_resposta
      && minutesSince(item.ultima_interacao_em) >= 8
    )
    return matchesQueue && matchesHuman && matchesAguardando
  }

  const filteredConversations = useMemo(() => {
    return activeConversations.filter(matchesOperationalFilters)
  }, [activeConversations, queueFilter, humanFilter, humanOverrideIds, aguardandoFilter])

  const filteredClosedConversations = useMemo(() => (
    closedConversations.filter(matchesOperationalFilters)
  ), [closedConversations, queueFilter, humanFilter, humanOverrideIds])

  const filteredConversationIds = useMemo(
    () => filteredConversations.map(item => item.id),
    [filteredConversations],
  )

  const filteredClosedConversationIds = useMemo(
    () => filteredClosedConversations.map(item => item.id),
    [filteredClosedConversations],
  )

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
      agendamento: activeConversations.filter(item => item.fila === 'agendamento').length,
      humano: activeConversations.filter(item => item.atendimento_humano || humanOverrideIds.includes(item.id)).length,
      aguardando: activeConversations.filter(item => {
        if (item.ultima_mensagem_direcao !== 'incoming') return false
        if (item.tem_resposta) return false
        const waitingMinutes = minutesSince(item.ultima_interacao_em)
        return waitingMinutes >= 8
      }).length,
    }), [activeConversations, humanOverrideIds])

  const unreadTotal = useMemo(
    () => Object.values(unreadCounts).reduce((acc, value) => acc + value, 0),
    [unreadCounts],
  )

  const activeShortcut = useMemo(() => ({
    all: queueFilter === 'todas' && humanFilter === 'todos' && !aguardandoFilter,
    atendimento: queueFilter === 'atendimento' && humanFilter === 'todos' && !aguardandoFilter,
    renovacao: queueFilter === 'renovacao' && humanFilter === 'todos' && !aguardandoFilter,
    email: queueFilter === 'email' && humanFilter === 'todos' && !aguardandoFilter,
    agendamento: queueFilter === 'agendamento' && humanFilter === 'todos' && !aguardandoFilter,
    humano: queueFilter === 'todas' && humanFilter === 'humano' && !aguardandoFilter,
    aguardando: aguardandoFilter,
  }), [queueFilter, humanFilter, aguardandoFilter])

  const groupedByStatus = useMemo(() => {
      const kanbanStatuses = new Set<string>(STATUS_COLUMNS.map(c => c.key))
      const kanbanItems = searchMatchedConversations.filter(item =>
        kanbanStatuses.has(normalizeKanbanStatus(item.kanban_status)) &&
        matchesOperationalFilters(item)
      )
      return STATUS_COLUMNS.map(column => ({
        ...column,
        items: kanbanItems.filter(item => normalizeKanbanStatus(item.kanban_status) === column.key),
      }))
  }, [searchMatchedConversations, queueFilter, humanFilter, humanOverrideIds])

  useEffect(() => {
    if (visibleConversations.length === 0) {
      if (selectedId) setSelectedId(null)
      return
    }

    if (!selectedId || !visibleConversations.some(item => item.id === selectedId)) {
      setSelectedId(visibleConversations[0]?.id ?? null)
    }
  }, [visibleConversations, selectedId])

  function applySummaryShortcut(target: 'all' | 'atendimento' | 'renovacao' | 'agendamento' | 'email' | 'humano' | 'aguardando') {
    if (target === 'aguardando') {
      setAguardandoFilter(prev => !prev)
      setQueueFilter('todas')
      setHumanFilter('todos')
      setSelectedId(null)
      return
    }

    setAguardandoFilter(false)
    const nextQueue: 'todas' | QueueType =
      target === 'atendimento' ? 'atendimento' :
      target === 'renovacao' ? 'renovacao' :
      target === 'agendamento' ? 'agendamento' :
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
      <div className="shrink-0 border-b border-slate-200/80 bg-white px-5 py-3 backdrop-blur">
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_auto] xl:items-center">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Operacao de chat
              </div>
              <div>
                <h1 className="text-[24px] font-semibold tracking-[-0.03em] text-slate-950">Central de Atendimento</h1>
                <p className="mt-1 text-[13px] text-slate-500">Chat, Kanban e filas em uma visao mais limpa e direta.</p>
              </div>
            </div>

            <div className="grid w-full grid-cols-3 gap-2 sm:grid-cols-6">
              <SummaryCard icon={MessageCircle} label="Atendimento" value={summary.atendimento} active={activeShortcut.atendimento} onClick={() => applySummaryShortcut('atendimento')} />
              <SummaryCard icon={RefreshCw} label="Renovacao" value={summary.renovacao} active={activeShortcut.renovacao} onClick={() => applySummaryShortcut('renovacao')} />
              <SummaryCard icon={Calendar} label="Agendamento" value={summary.agendamento} active={activeShortcut.agendamento} onClick={() => applySummaryShortcut('agendamento')} />
              <SummaryCard icon={Mail} label="Email" value={summary.email} active={activeShortcut.email} onClick={() => applySummaryShortcut('email')} />
              <SummaryCard icon={User} label="Humano" value={summary.humano} active={activeShortcut.humano} onClick={() => applySummaryShortcut('humano')} />
              <SummaryCard icon={Clock3} label="Aguardando" value={summary.aguardando} active={activeShortcut.aguardando} onClick={() => applySummaryShortcut('aguardando')} />
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <button type="button" onClick={() => void loadConversations(true)} className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
                <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /> Atualizar
              </button>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-100/80 p-1">
                <button type="button" onClick={closeKanban} className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition ${!kanbanOpen ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 hover:text-sky-700'}`}>
                  <List size={15} /> Chat
                </button>
                <button type="button" onClick={openKanban} className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition ${kanbanOpen ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-500 hover:text-sky-700'}`}>
                  <Columns3 size={15} /> Kanban
                </button>
              </div>
              <button type="button" onClick={() => void openManualConversationModal()} className="inline-flex h-9 items-center gap-2 rounded-full bg-emerald-600 px-3.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50" disabled={manualConversationLoading}>
                <MessageCircle size={15} /> Nova conversa
              </button>
            </div>
          </div>

          <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_160px_160px_210px]">
            <label className="flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4">
              <Search size={16} className="text-slate-400" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar contato ou mensagem" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
            </label>

            <select value={queueFilter} onChange={event => setQueueFilter(event.target.value as 'todas' | QueueType)} className="h-11 rounded-full border border-slate-200 bg-white px-4 text-sm outline-none">
              <option value="todas">Todas as filas</option>
              <option value="atendimento">Atendimento</option>
              <option value="renovacao">Renovacao</option>
              <option value="agendamento">Agendamento</option>
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
                showClosedConversations                  ? 'border-sky-200 bg-sky-50 text-sky-700'
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
                <BulkActionBar
                  count={selectedConversationIds.size}
                  onClear={clearConversationSelection}
                  onDelete={() => void bulkDeleteSelectedConversations()}
                />
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
                      onArchive={() => void updateConversationStatusById(item.id, 'arquivado')}
                      onDelete={() => void deleteConversation(item.id)}
                      onSaveContact={() => void saveContactFromConversation(item.id)}
                      checked={selectedConversationIds.has(item.id)}
                      onCheckToggle={event => toggleConversationSelection('inbox-ativas', item.id, filteredConversationIds, event.shiftKey)}
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
                            onDelete={() => void deleteConversation(item.id)}
                            onSaveContact={() => void saveContactFromConversation(item.id)}
                            checked={selectedConversationIds.has(item.id)}
                            onCheckToggle={event => toggleConversationSelection('inbox-encerradas', item.id, filteredClosedConversationIds, event.shiftKey)}
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
                        <h3 className="text-lg font-semibold">
                          {displayConversationName(selectedConversation)}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {contactPhone(selectedConversation)}
                        </p>
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
                          Este atendimento ainda está como lead. Você pode salvar nome, telefone e e-mail parciais agora e complementar o cadastro depois.
                        </div>
                      )}
                    </div>

                    {!humanModeActive ? (
                      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-slate-50 px-6 py-10 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                          <Bot size={32} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-700">Conversa sendo atendida pela IA</p>
                          <p className="mt-1 text-xs text-slate-400">O robo esta respondendo automaticamente. Clique em "Assumir humano" no painel ao lado para assumir o atendimento.</p>
                        </div>
                      </div>
                    ) : (
                      <>
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
                        {!showHumanResponsePanel ? (
                          <button
                            type="button"
                            onClick={() => setShowHumanResponsePanel(true)}
                            className="mb-2 flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-sky-300 hover:bg-sky-50/70"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-700">Resposta humana</p>
                              <p className="mt-0.5 truncate text-[11px] text-slate-500">Canal: {selectedReplyChannelLabel}</p>
                            </div>
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600">
                              Exibir painel
                              <ChevronDown size={14} />
                            </span>
                          </button>
                        ) : (
                          <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-slate-700">Resposta humana</p>
                                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${showHumanResponseDetails ? 'bg-sky-100 text-sky-700' : 'border border-slate-200 bg-white text-slate-500'}`}>
                                    {showHumanResponseDetails ? 'Opcoes abertas' : 'Modo compacto'}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-[11px] text-slate-400">
                                  Canal: {selectedReplyChannelLabel} · Assinatura: {chatSettingsLoading ? 'carregando...' : (signOutgoingMessages ? 'ativa' : 'desativada')}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {selectedConversation.fila !== 'email' && (
                                  <button
                                    type="button"
                                    onClick={() => setShowHumanResponseDetails(current => !current)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-sky-300 hover:text-sky-700"
                                  >
                                    {showHumanResponseDetails ? 'Fechar opcoes' : 'Abrir opcoes'}
                                    <ChevronDown size={14} className={`transition-transform ${showHumanResponseDetails ? 'rotate-180' : ''}`} />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowHumanResponsePanel(false)
                                    setShowHumanResponseDetails(false)
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                                >
                                  Ocultar
                                  <X size={12} />
                                </button>
                              </div>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge text={`Origem: ${selectedConversation.whatsapp_instance || 'Nao definida'}`} tone="blue" />
                              <Badge text={selectedConversation.agente_atual || profile?.nome || 'Humano'} tone="green" />
                            </div>

                            {showHumanResponseDetails && selectedConversation.fila !== 'email' && (
                              <div className="mt-2 border-t border-slate-200 pt-2.5">
                                <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Canal de resposta</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {replyQueueOptions.map(queue => {
                                        const active = selectedReplyQueue === queue
                                        return (
                                          <button
                                            key={queue}
                                            type="button"
                                            onClick={() => {
                                              const nextOption = replyChannelOptions.find(item => item.queue === queue)
                                              if (!nextOption) return
                                              setSelectedReplyIntegrationId(nextOption.id)
                                              setSelectedReplyIntegrationConversationId(selectedConversation.id)
                                            }}
                                            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${active ? 'bg-sky-600 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700'}`}
                                          >
                                            {queueLabel(queue)}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>

                                  <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Responder por</p>
                                    {visibleReplyChannelOptions.length === 0 ? (
                                      <div className="mt-2 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-sm text-slate-400">
                                        Nenhum canal disponivel para esta fila.
                                      </div>
                                    ) : (
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {visibleReplyChannelOptions.map(option => {
                                          const active = selectedReplyIntegrationId === option.id
                                          return (
                                            <button
                                              key={option.id}
                                              type="button"
                                              onClick={() => {
                                                setSelectedReplyIntegrationId(option.id)
                                                setSelectedReplyIntegrationConversationId(selectedConversation.id)
                                              }}
                                              className={`min-w-[220px] rounded-xl px-3 py-2 text-left text-sm transition ${active ? 'bg-slate-900 text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50'}`}
                                            >
                                              <span className="block font-medium">{integrationDisplayName(option.integration)}</span>
                                              <span className={`mt-0.5 block text-[11px] ${active ? 'text-slate-200' : 'text-slate-500'}`}>
                                                {option.integration.instance_name || 'Instancia sem nome'}
                                              </span>
                                            </button>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

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

                      {selectedConversation.fila === 'email' ? (
                        <div className="space-y-2">
                          {showEmailReply ? (
                            <div className="space-y-3 rounded-2xl border border-sky-200 bg-sky-50 p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-600">Responder e-mail</span>
                                <button
                                  type="button"
                                  onClick={() => setShowEmailReply(false)}
                                  className="rounded-lg p-1 text-sky-500 hover:bg-sky-100"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                              <div className="space-y-2">
                                <label className="block space-y-1">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-600">Para</span>
                                  <input
                                    value={selectedConversation.email_principal || ''}
                                    disabled
                                    className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                                  />
                                </label>
                                <label className="block space-y-1">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-600">Assunto</span>
                                  <input
                                    value={emailSubject}
                                    onChange={event => setEmailSubject(event.target.value)}
                                    placeholder="Re: Assunto do e-mail original"
                                    className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                                  />
                                </label>
                                <label className="block space-y-1">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-600">Mensagem</span>
                                  <textarea
                                    value={emailBody}
                                    onChange={event => setEmailBody(event.target.value)}
                                    rows={6}
                                    placeholder="Digite sua resposta de e-mail..."
                                    className="w-full resize-none rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                                  />
                                </label>
                              </div>
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => void sendEmailReply()}
                                  disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}
                                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-sky-600 px-5 text-sm font-medium text-white disabled:opacity-50"
                                >
                                  {sendingEmail ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                  {sendingEmail ? 'Enviando...' : 'Responder e-mail'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setShowEmailReply(true)}
                              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-white text-sm font-medium text-sky-700 hover:bg-sky-50"
                            >
                              <Reply size={16} />
                              Responder
                            </button>
                          )}
                        </div>
                      ) : (
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
                      )}

                      {actionError && (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{actionError}</div>
                      )}
                    </div>
                    </>
                    )}
                </div>

                <div className="hidden w-2 shrink-0 cursor-col-resize rounded-full bg-slate-200/80 transition hover:bg-sky-300 xl:block" onMouseDown={() => setIsResizingRight(true)} />

                <aside className="min-h-0 shrink-0 overflow-y-auto px-4 py-4" style={{ width: `${rightPanelWidth}px` }}>
                  <div className="space-y-4">
                    <PanelBlock title="Contato e histórico">
                      <div className="space-y-3">
                        <label className="block space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nome da pessoa</span>
                          <input
                            value={contactEdit.name}
                            onChange={event => setContactEdit(prev => ({ ...prev, name: event.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                            placeholder="Nome do contato"
                          />
                        </label>

                        <label className="block space-y-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Nome da empresa</span>
                          <input
                            value={contactEdit.company}
                            onChange={event => setContactEdit(prev => ({ ...prev, company: event.target.value }))}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                            placeholder="Razão social ou nome fantasia"
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
                            placeholder="Opcional"
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
                      <InfoRow icon={<User size={14} />} label="Pessoa" value={selectedConversation.nome_crm || selectedConversation.cliente_nome || 'Nao informado'} />
                      <InfoRow icon={<UserRound size={14} />} label="Empresa" value={selectedConversation.empresa_nome || 'Nao informada'} />
                      <InfoRow icon={<Phone size={14} />} label="Telefone" value={contactPhone(selectedConversation)} mono />
                      <InfoRow icon={<Mail size={14} />} label="Email" value={selectedConversation.email_principal || (selectedConversation.fila === 'email' ? selectedConversation.document_key : 'Nao informado')} />
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
                      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Fila</label>
                      <select value={selectedConversation.fila} onChange={event => void changeConversationQueue(event.target.value as QueueType)} disabled={actionLoading} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none">
                        <option value="atendimento">Atendimento</option>
                        <option value="renovacao">Renovacao</option>
                        <option value="email">Email</option>
                        <option value="agendamento">Agendamento</option>
                      </select>

                      <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">Etapa do Kanban</label>
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
                      <div className="space-y-2 text-sm leading-relaxed text-slate-700">
                        <p><span className="font-semibold text-slate-500">Pessoa:</span> {selectedConversation.nome_crm || selectedConversation.cliente_nome || 'Nao informado'}</p>
                        <p><span className="font-semibold text-slate-500">Empresa:</span> {selectedConversation.empresa_nome || 'Nao informada'}</p>
                        <p className="whitespace-pre-wrap">{selectedConversation.observacoes || 'Sem observacoes no crm_customers.'}</p>
                      </div>
                    </PanelBlock>

                    <PanelBlock title="Leitura operacional">
                      <ul className="space-y-2 whitespace-pre-line text-sm text-slate-600">
                        <li>Fila: <strong>{queueLabel(selectedConversation.fila)}</strong></li>
                        <li>Modo atual: <strong>{humanModeActive ? 'Humano' : 'IA Clara'}</strong></li>
                        <li>Documento-chave: <strong>{selectedConversation.document_key}</strong></li>
                        <li>Agente desde: <strong>{formatDateTime(selectedConversation.agente_desde)}</strong></li>
                        <li>Ultima mensagem: <strong>{normalizeStructuredMessage(selectedConversation.ultima_mensagem) || 'Sem resumo'}</strong></li>
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
                    onBlur={() => setManualConversation(prev => ({ ...prev, phone: normalizePhone(prev.phone) }))}
                    placeholder="11999999999"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                  />
                  <span className="block text-[11px] text-slate-400">{formatPhoneHint(manualConversation.phone)}</span>
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
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Kanban operacional</h3>
                <p className="text-sm text-slate-500">Janela ampla para organizar as filas. Ao clicar no card, voce volta direto para o chat.</p>
              </div>
              <div className="flex flex-1 items-center justify-end gap-4">
                <BulkActionBar
                  count={selectedConversationIds.size}
                  onClear={clearConversationSelection}
                  onDelete={() => void bulkDeleteSelectedConversations()}
                />
                <button type="button" onClick={closeKanban} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <X size={15} /> Fechar
                </button>
              </div>
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
                            checked={selectedConversationIds.has(item.id)}
                            onCheckToggle={event => toggleConversationSelection(`kanban:${column.key}`, item.id, column.items.map(i => i.id), event.shiftKey)}
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
  icon: Icon,
  label,
  value,
  active = false,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: number
  active?: boolean
  onClick?: () => void
}) {
  const className = `flex flex-col items-center justify-center gap-1 rounded-[18px] border px-2 py-2.5 text-center transition-all ${
    active
      ? 'border-sky-200 bg-sky-50 text-sky-900 shadow-[0_10px_24px_rgba(14,116,144,0.08)]'
      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
  }`

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} title={label}>
        <Icon size={22} className={active ? 'text-sky-700' : 'text-slate-400'} />
        <p className={`text-[22px] font-semibold leading-none tracking-[-0.02em] ${active ? 'text-sky-950' : 'text-slate-900'}`}>{value}</p>
      </button>
    )
  }

  return (
    <div className={className} title={label}>
      <Icon size={22} className="text-slate-400" />
      <p className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-slate-900">{value}</p>
    </div>
  )
}

function BulkActionBar({
  count,
  onClear,
  onDelete,
}: {
  count: number
  onClear: () => void
  onDelete: () => void
}) {
  if (count === 0) return null
  return (
    <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
      <span className="text-sm font-semibold text-sky-900">{count} selecionada{count > 1 ? 's' : ''}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <X size={13} /> Limpar selecao
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
        >
          <Trash2 size={13} /> Apagar selecionadas
        </button>
      </div>
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
  onArchive,
  onDelete,
  onSaveContact,
  checked = false,
  onCheckToggle,
}: {
  item: ConversationRow
  selected: boolean
  onClick: () => void
  human: boolean
  unreadCount?: number
  closed?: boolean
  onArchive?: () => void
  onDelete?: () => void
  onSaveContact?: () => void
  checked?: boolean
  onCheckToggle?: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
    const urgency = getUrgencyMeta(item, human)
    const hasCrmCustomer = hasRegisteredCustomer(item)
    const selectedClass = selected
      ? 'border-sky-200 bg-sky-50 shadow-[0_10px_24px_rgba(14,116,144,0.08)]'
      : closed
        ? 'border-slate-200 bg-slate-50 hover:border-slate-300'
        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'

    return (
      <div className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selectedClass}`}>
        <div className="flex items-start justify-between gap-3">
          {onCheckToggle && (
            <button
              type="button"
              onClick={event => { event.stopPropagation(); onCheckToggle(event) }}
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${checked ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white text-transparent hover:border-sky-400'}`}
              title="Selecionar conversa"
            >
              <Check size={13} />
            </button>
          )}
          <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold text-slate-900">{displayConversationName(item)}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{contactPhone(item)}</p>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            {!hasCrmCustomer && onSaveContact && (
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation()
                  onSaveContact()
                }}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600"
                title="Salvar contato"
              >
                <UserPlus size={14} />
              </button>
            )}
            {!closed && onArchive && (
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation()
                  onArchive()
                }}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600"
                title="Arquivar conversa"
              >
                <Save size={14} />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={event => {
                  event.stopPropagation()
                  onDelete()
                }}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                title="Apagar conversa"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
        <button type="button" onClick={onClick} className="mt-2 w-full text-left">
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${selected ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>{queueLabel(item.fila)}</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">{unreadCount}</span>
            )}
            <span className={selected ? 'text-sky-600' : 'text-slate-400'}>{human ? <UserRound size={14} /> : <Bot size={14} />}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {urgency && <Badge text={urgency.label} tone={urgency.tone} />}
            {!hasCrmCustomer && <Badge text="Contato sem cadastro" tone="amber" />}
            {closed && <Badge text="Encerrada" tone="slate" />}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] text-slate-500">
            <div>
              <p className="uppercase tracking-wide text-slate-400">Etapa</p>
              <p className="mt-0.5 font-medium text-slate-700">{statusLabel(normalizeKanbanStatus(item.kanban_status))}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-slate-400">Ultima interacao</p>
              <p className="mt-0.5 font-medium text-slate-700">{formatRelative(item.ultima_interacao_em)}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-slate-400">Modo</p>
              <p className="mt-0.5 font-medium text-slate-700">{human ? 'Humano' : 'IA'}</p>
            </div>
            <div>
              <p className="uppercase tracking-wide text-slate-400">Origem</p>
              <p className="mt-0.5 font-medium text-slate-700">{item.document_key ? 'CRM' : 'WhatsApp'}</p>
            </div>
          </div>
        </button>
      </div>
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
  checked = false,
  onCheckToggle,
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
  checked?: boolean
  onCheckToggle?: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
    const urgency = getUrgencyMeta(item, human)
    const hasCrmCustomer = !!item.crm_customer_id
    return (
      <div className={`group relative w-full rounded-xl border ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-white/70 bg-white hover:border-slate-300'}`}>
        {onCheckToggle && (
          <button
            type="button"
            onClick={event => { event.stopPropagation(); onCheckToggle(event) }}
            className={`absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-md border transition ${checked ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300 bg-white/90 text-transparent hover:border-sky-400'}`}
            title="Selecionar conversa"
          >
            <Check size={12} />
          </button>
        )}
        <button type="button" onClick={onClick} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} className={`w-full py-3 text-left ${onCheckToggle ? 'pl-7 pr-3' : 'px-3'}`}>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{displayConversationName(item)}</p>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${selected ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700'}`}>{unreadCount}</span>}
              {human ? <UserRound size={14} /> : <Bot size={14} />}
            </div>
          </div>
          <p className={`mt-1 truncate text-xs ${selected ? 'text-slate-300' : 'text-slate-500'}`}>{contactPhone(item)}</p>
          {urgency && <div className="mt-2"><Badge text={urgency.label} tone={urgency.tone} /></div>}
          <p className={`mt-2 line-clamp-2 text-xs ${selected ? 'text-slate-100' : 'text-slate-600'}`}>{normalizeStructuredMessage(item.ultima_mensagem) || 'Sem mensagem'}</p>
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
    const normalizedSenderName = normalizeDisplaySenderName(message.sender_name)
    const isContactMsg = message.sender_type === 'cliente' || message.sender_type === 'contact' || !isOutgoing
    const isIaMsg = message.sender_type === 'ia'
    const senderLabel = isContactMsg
      ? displayConversationName(conversation)
        : isIaMsg
          ? 'IA Clara'
          : normalizedSenderName || fallbackHumanName || 'Humano'
    const detailLabel = isContactMsg
      ? conversation ? contactPhone(conversation) : 'Canal de entrada'
      : isIaMsg
        ? conversation?.whatsapp_instance || 'Automacao'
        : normalizedSenderName || fallbackHumanName || conversation?.agente_atual || 'Humano'
    const downloadFileName = inferMediaFileName(message.mime_type, message.file_name, message.mensagem)
    const rawResolvedMediaUrl = resolveChatMediaUrl(message.media_url, conversation?.whatsapp_instance, downloadFileName)
    const resolvedMediaUrl = isEncryptedWhatsappMediaUrl(rawResolvedMediaUrl) ? null : rawResolvedMediaUrl
    const mediaKind = inferMediaKind(message.mime_type, resolvedMediaUrl, downloadFileName || message.file_name, message.mensagem)
    const isImage = mediaKind === 'image'
    const isAudio = mediaKind === 'audio'
    const isVideo = mediaKind === 'video'
    const isDocument = mediaKind === 'document'
    const hasMedia = isImage || isAudio || isVideo || isDocument
    const mediaLabel = message.file_name || message.mensagem || downloadFileName || (isAudio ? 'Audio' : isImage ? 'Imagem' : isVideo ? 'Video' : isDocument ? 'Arquivo' : '')
    const [imagePreviewOpen, setImagePreviewOpen] = useState(false)
    const receiptStatus = String(message.delivery_status ?? '').trim().toLowerCase()
    const receiptLabel = receiptStatus === 'read'
      ? 'Lida'
      : receiptStatus === 'delivered'
        ? 'Recebida'
        : receiptStatus === 'received'
          ? 'Recebida'
          : receiptStatus === 'failed'
            ? 'Falhou'
            : 'Enviada'
    const receiptTone = receiptStatus === 'read'
      ? 'text-sky-600'
      : receiptStatus === 'delivered' || receiptStatus === 'received'
        ? 'text-slate-500'
        : receiptStatus === 'failed'
          ? 'text-rose-600'
          : 'text-slate-400'
    const receiptTime = message.read_at || message.delivered_at || message.status_updated_at || message.created_at
  
    return (
      <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm ${isOutgoing ? 'bg-emerald-100 text-emerald-950' : 'bg-white text-slate-800'}`}>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>{senderLabel}</span>
            <span>•</span>
            <span>{detailLabel}</span>
          </div>
          {isImage && resolvedMediaUrl ? (
            <div className="space-y-2">
              <button type="button" onClick={() => setImagePreviewOpen(true)} className="block w-full overflow-hidden rounded-xl text-left">
                <img src={resolvedMediaUrl} alt={mediaLabel} className="max-h-[360px] max-w-full rounded-xl object-contain" loading="lazy" />
              </button>
              <a href={resolvedMediaUrl} target="_blank" rel="noreferrer" download={downloadFileName} className="text-xs text-sky-600 hover:underline">
                Baixar imagem
              </a>
            </div>
          ) : isAudio && resolvedMediaUrl ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-violet-700">Audio anexado</p>
              <audio src={resolvedMediaUrl} controls className="w-full min-w-0" preload="metadata" />
            </div>
          ) : isVideo && resolvedMediaUrl ? (
            <div className="space-y-2">
              <video src={resolvedMediaUrl} controls className="max-w-full rounded-xl" preload="metadata" />
              <a href={resolvedMediaUrl} target="_blank" rel="noreferrer" download={downloadFileName} className="text-xs text-sky-600 hover:underline">
                Abrir video em nova aba
              </a>
            </div>
          ) : isDocument && resolvedMediaUrl ? (
            <a href={resolvedMediaUrl} target="_blank" rel="noreferrer" download={downloadFileName} className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-sky-700 hover:underline">
              Arquivo: {mediaLabel}
            </a>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{normalizeStructuredMessage(isOutgoing ? stripOutgoingSignature(message.mensagem, message.sender_name) : message.mensagem) || mediaLabel || 'Mensagem sem texto'}</p>
          )}
          <div className={`mt-2 flex items-center justify-end gap-1 text-[11px] ${isOutgoing ? 'text-emerald-800/80' : 'text-slate-400'}`}>
            <span>{formatDateTime(message.created_at)}</span>
            {isOutgoing && (
              <span className={`inline-flex items-center gap-1 ${receiptTone}`} title={`${receiptLabel} em ${formatDateTime(receiptTime)}`}>
                {receiptStatus === 'read' ? <CheckCheck size={13} /> : receiptStatus === 'delivered' || receiptStatus === 'received' ? <CheckCheck size={13} /> : <Check size={13} />}
                <span>{receiptLabel}</span>
              </span>
            )}
          </div>
        </div>
      {isImage && resolvedMediaUrl && imagePreviewOpen && (
        <MediaPreview
          url={resolvedMediaUrl}
          fileName={mediaLabel}
          onClose={() => setImagePreviewOpen(false)}
        />
      )}
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




