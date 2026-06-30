import type { IncomingMessage, ServerResponse } from 'node:http'
import type { BackendConfig } from '../config/env.js'
import type { CommunicationEventRepository } from '../repositories/communicationEventRepository.js'
import type { LeadRepository } from '../repositories/leadRepository.js'
import { readJson, writeJson } from '../utils/http.js'

type JsonRecord = Record<string, unknown>

type NormalizedEvolutionEvent = {
  eventType: string | null
  instanceName: string | null
  conversationId: string | null
  contact: string | null
  contactDigits: string | null
  externalMessageId: string | null
  pushName: string | null
  fromMe: boolean
  messageType: string
  content: string | null
  mimeType: string | null
  fileName: string | null
  mediaUrl: string | null
  quoted: { messageId: string; content: string } | null
  raw: JsonRecord
}

type EvolutionControlInput = {
  base_url?: string
  api_token?: string
  instance_name?: string
  webhook_url?: string
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function pickString(source: JsonRecord | null, ...keys: string[]) {
  if (!source) return ''
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function cleanBaseUrl(value: string) {
  return value.replace(/\/$/, '')
}

function normalizePhoneDigits(value: string | null | undefined) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits || null
}

function buildRemoteJid(phoneDigits: string | null) {
  return phoneDigits ? `${phoneDigits}@s.whatsapp.net` : null
}

function extractMessageContent(message: JsonRecord | null): { content: string | null; messageType: string; mimeType: string | null; fileName: string | null; mediaUrl: string | null; quoted: { messageId: string; content: string } | null } {
  if (!message) {
    return {
      content: null,
      messageType: 'conversation',
      mimeType: null,
      fileName: null,
      mediaUrl: null,
      quoted: null,
    }
  }

  const entry = Object.entries(message).find(([, value]) => value !== null && value !== undefined)
  const messageType = entry?.[0] ?? 'conversation'
  const payload = asRecord(entry?.[1])
  const context = asRecord(payload?.contextInfo)
  const quotedMessage = asRecord(context?.quotedMessage)
  const quotedEntry = quotedMessage ? Object.entries(quotedMessage).find(([, value]) => value !== null && value !== undefined) : null
  const quotedPayload = asRecord(quotedEntry?.[1])
  const quotedContent = pickString(quotedPayload, 'text', 'caption') || (typeof quotedEntry?.[1] === 'string' ? quotedEntry[1] : '')

  const fallbackContent = typeof entry?.[1] === 'string' ? entry[1] : ''
  const content = pickString(payload, 'text', 'caption', 'conversation') || fallbackContent || null
  const mimeType = pickString(payload, 'mimetype') || null
  const fileName = pickString(payload, 'fileName', 'title') || null
  const mediaUrl = pickString(payload, 'url', 'mediaUrl') || null
  const quotedId = pickString(context, 'stanzaId') || null

  return {
    content,
    messageType,
    mimeType,
    fileName,
    mediaUrl,
    quoted: quotedId ? { messageId: quotedId, content: quotedContent || 'Mensagem respondida' } : null,
  }
}

function normalizeEvolutionEvent(body: JsonRecord): NormalizedEvolutionEvent {
  const data = asRecord(body.data)
  const key = asRecord(data?.key) ?? asRecord(body.key)
  const message = asRecord(data?.message) ?? asRecord(body.message)
  const messageData = extractMessageContent(message)

  const rawConversationId =
    pickString(body, 'conversationId', 'remoteJid', 'chatId')
    || pickString(data, 'remoteJid', 'chatId', 'conversationId')
    || pickString(key, 'remoteJid')
    || ''

  const contactDigits = normalizePhoneDigits(
    pickString(body, 'contact', 'phone', 'number')
    || pickString(data, 'contact', 'phone', 'number')
    || (rawConversationId ? rawConversationId.split('@')[0] : ''),
  )

  const conversationId = rawConversationId || buildRemoteJid(contactDigits)
  const eventType = pickString(body, 'event', 'eventType', 'type') || pickString(data, 'eventType', 'type') || null
  const instanceName = pickString(body, 'instance', 'instanceName') || pickString(data, 'instance', 'instanceName') || null
  const fromMe = Boolean(body.fromMe ?? data?.fromMe ?? key?.fromMe ?? false)
  const pushName = pickString(body, 'pushName') || pickString(data, 'pushName') || pickString(key, 'pushName') || null
  const externalMessageId = pickString(body, 'messageId', 'externalId') || pickString(data, 'id', 'messageId') || pickString(key, 'id') || null

  return {
    eventType,
    instanceName,
    conversationId,
    contact: contactDigits,
    contactDigits,
    externalMessageId,
    pushName,
    fromMe,
    messageType: pickString(body, 'messageType') || pickString(data, 'messageType') || messageData.messageType,
    content: pickString(body, 'content') || pickString(data, 'content') || messageData.content,
    mimeType: pickString(body, 'mimeType') || pickString(data, 'mimeType') || messageData.mimeType,
    fileName: pickString(body, 'fileName') || pickString(data, 'fileName') || messageData.fileName,
    mediaUrl: pickString(body, 'mediaUrl') || pickString(data, 'mediaUrl') || messageData.mediaUrl,
    quoted: messageData.quoted,
    raw: body,
  }
}

async function testEvolutionConnection(input: EvolutionControlInput) {
  const baseUrl = cleanBaseUrl(asString(input.base_url))
  const apiToken = asString(input.api_token)
  const instanceName = asString(input.instance_name)

  if (!baseUrl || !apiToken || !instanceName) {
    return { ok: false, status: 400, payload: { ok: false, error: 'base_url, api_token e instance_name sao obrigatorios.' } }
  }

  const response = await fetch(`${baseUrl}/instance/connectionState/${instanceName}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiToken,
    },
  })

  const payload = await response.json().catch(() => ({})) as JsonRecord
  const state = pickString(asRecord(payload.instance), 'state') || pickString(payload, 'state') || pickString(asRecord(payload.response), 'state') || 'desconhecido'
  const normalizedState = state.toLowerCase()
  const connectedStates = new Set(['open', 'opened', 'connected', 'online'])

  if (!response.ok) {
    return { ok: false, status: 502, payload: { ok: false, error: `Evolution retornou HTTP ${response.status}`, state, detail: payload } }
  }

  if (!connectedStates.has(normalizedState)) {
    return { ok: false, status: 200, payload: { ok: false, state, error: `Estado da instância: ${state}` } }
  }

  return { ok: true, status: 200, payload: { ok: true, state } }
}

async function configureEvolutionWebhook(input: EvolutionControlInput) {
  const baseUrl = cleanBaseUrl(asString(input.base_url))
  const apiToken = asString(input.api_token)
  const instanceName = asString(input.instance_name)
  const webhookUrl = asString(input.webhook_url)

  if (!baseUrl || !apiToken || !instanceName || !webhookUrl) {
    return { ok: false, status: 400, payload: { ok: false, error: 'base_url, api_token, instance_name e webhook_url sao obrigatorios.' } }
  }

  const endpoint = `${baseUrl}/webhook/set/${instanceName}`
  const defaultEvents = ['MESSAGES_UPSERT', 'MESSAGES_UPDATE', 'SEND_MESSAGE']
  const attempts: JsonRecord[] = [
    {
      webhook: {
        url: webhookUrl,
        enabled: true,
        byEvents: false,
        base64: true,
        events: defaultEvents,
      },
    },
  ]

  const errors: string[] = []

  for (const body of attempts) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiToken,
      },
      body: JSON.stringify(body),
    })

    const payload = await response.json().catch(() => ({})) as JsonRecord
    if (response.ok) {
      return { ok: true, status: 200, payload: { ok: true, webhook_url: webhookUrl, detail: payload } }
    }

    errors.push(`HTTP ${response.status}`)
  }

  return {
    ok: false,
    status: 502,
    payload: {
      ok: false,
      error: `Falha ao configurar webhook na Evolution (${errors.join(', ') || 'sem resposta valida'}).`,
    },
  }
}

async function forwardInboundToN8n(config: BackendConfig, event: NormalizedEvolutionEvent, leadId: string | null) {
  if (!config.n8nWebhookUrl || event.fromMe) return { forwarded: false, error: null as string | null }

  try {
    const response = await fetch(config.n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'evolution',
        event_type: event.eventType,
        conversation_id: event.conversationId,
        contact: event.contact,
        lead_id: leadId,
        instance_name: event.instanceName,
        message: {
          id: event.externalMessageId,
          from_me: event.fromMe,
          type: event.messageType,
          content: event.content,
          mime_type: event.mimeType,
          file_name: event.fileName,
          media_url: event.mediaUrl,
          quoted: event.quoted,
          push_name: event.pushName,
        },
        payload: event.raw,
      }),
    })

    if (!response.ok) {
      return { forwarded: false, error: `N8N retornou HTTP ${response.status}` }
    }

    return { forwarded: true, error: null }
  } catch (error) {
    return { forwarded: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function upsertLeadFromEvolutionEvent(leadRepository: LeadRepository, event: NormalizedEvolutionEvent) {
  const phoneDigits = event.contactDigits
  if (!phoneDigits) return null

  const summary = event.content || (event.fileName ? `Arquivo: ${event.fileName}` : null)
  return leadRepository.upsertFromEvolutionEvent({
    phoneDigits,
    conversationId: event.conversationId,
    instanceName: event.instanceName,
    pushName: event.pushName,
    content: summary,
    fromMe: event.fromMe,
  })
}

export async function handleEvolutionWebhookRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  leadRepository: LeadRepository,
  communicationEventRepository: CommunicationEventRepository,
  config: BackendConfig,
  corsOrigin: string,
): Promise<boolean> {
  const url = req.url ?? ''
  const method = req.method ?? ''

  if (method === 'POST' && url === '/api/evolution/connection/test') {
    const body = await readJson<EvolutionControlInput>(req)
    const result = await testEvolutionConnection(body)
    writeJson(res, result.status, result.payload, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/evolution/webhook/configure') {
    const body = await readJson<EvolutionControlInput>(req)
    const result = await configureEvolutionWebhook(body)
    writeJson(res, result.status, result.payload, corsOrigin)
    return true
  }

  if (method === 'POST' && url === '/api/webhooks/evolution') {
    const body = await readJson<JsonRecord>(req)
    const normalized = normalizeEvolutionEvent(body)
    const lead = await upsertLeadFromEvolutionEvent(leadRepository, normalized)

    const payload: JsonRecord = {
      ...normalized.raw,
      content: normalized.content,
      fromMe: normalized.fromMe,
      messageId: normalized.externalMessageId,
      messageType: normalized.messageType,
      pushName: normalized.pushName,
      mimeType: normalized.mimeType,
      fileName: normalized.fileName,
      mediaUrl: normalized.mediaUrl,
      quoted: normalized.quoted,
      conversationId: normalized.conversationId,
      documentKey: normalized.contactDigits,
      instanceName: normalized.instanceName,
    }

    const eventRow = await communicationEventRepository.create({
      source: 'evolution',
      event_type: normalized.eventType ?? 'message_received',
      external_id: normalized.externalMessageId,
      conversation_id: normalized.conversationId,
      lead_id: lead?.id ?? null,
      contact: normalized.contactDigits,
      payload,
    })

    const forwarded = await forwardInboundToN8n(config, normalized, lead?.id ?? null)

    writeJson(res, 200, {
      ok: true,
      conversation_id: eventRow.conversation_id,
      lead_id: lead?.id ?? null,
      forwarded_to_n8n: forwarded.forwarded,
      n8n_error: forwarded.error,
    }, corsOrigin)
    return true
  }

  return false
}
