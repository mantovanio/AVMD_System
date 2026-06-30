import { supabase } from '@/lib/supabase'
import { getApiUrl, useLegacySupabase } from '@/lib/api'
import { loadActiveWhatsAppIntegration } from '@/lib/whatsappIntegration'
import type { CommunicationChannel, CommunicationProvider } from '@/types'

interface QueueMessageInput {
  channel: CommunicationChannel
  provider: CommunicationProvider
  to: string
  body: string
  subject?: string | null
  payload?: Record<string, unknown>
  scheduledFor?: string
}

function normalizeWhatsAppProvider(provider: string | null | undefined): CommunicationProvider {
  if (provider === 'evolution' || provider === 'chatwoot' || provider === 'chatwoot_disparo' || provider === 'n8n') {
    return provider
  }
  return 'n8n'
}

function communicationProviderFromWhatsAppEngine(engine: string | null | undefined, provider: string | null | undefined): CommunicationProvider {
  if (engine === 'evolution') return 'evolution'
  return normalizeWhatsAppProvider(provider === 'evolution' ? 'n8n' : provider)
}

export async function queueCommunication({
  channel,
  provider,
  to,
  body,
  subject = null,
  payload = {},
  scheduledFor,
}: QueueMessageInput) {
  if (useLegacySupabase()) {
    const { error } = await supabase.from('communication_outbox').insert([{
      channel,
      provider,
      to_address: to,
      subject,
      body,
      payload,
      scheduled_for: scheduledFor ?? new Date().toISOString(),
    }])
    return { error: error?.message ?? null }
  }

  try {
    await fetch(getApiUrl('/communication/outbox'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel,
        provider,
        to_address: to,
        subject,
        body,
        payload,
        scheduled_for: scheduledFor ?? new Date().toISOString(),
      }),
    })
    return { error: null }
  } catch (err) {
    return { error: String(err) }
  }
}

export async function queueWhatsAppMessage(input: Omit<QueueMessageInput, 'channel' | 'provider'> & { canal?: 'atendimento' | 'renovacao' }) {
  const active = await loadActiveWhatsAppIntegration(input.canal).catch(() => null)
  return queueCommunication({
    ...input,
    channel: 'whatsapp',
    provider: communicationProviderFromWhatsAppEngine(active?.engine ?? null, active?.provider),
    payload: {
      ...(input.payload ?? {}),
      integration_id: active?.id ?? null,
      whatsapp_engine: active?.engine ?? null,
      instance_name: active?.instance_name ?? null,
    },
  })
}

export function queueEmailMessage(input: Omit<QueueMessageInput, 'channel' | 'provider'>) {
  return queueCommunication({
    ...input,
    channel: 'email',
    provider: 'email_smtp',
  })
}

export function renderTemplate(template: string, values: Record<string, string | number | null | undefined>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => String(values[key] ?? ''))
}

export async function queueWhatsAppFollowUp(input: {
  to: string
  body: string
  renovacaoId: string
  instanceName?: string
  delayHours?: number
}) {
  const active = await loadActiveWhatsAppIntegration().catch(() => null)
  const delayMs = (input.delayHours ?? 48) * 3600 * 1000
  return queueCommunication({
    channel: 'whatsapp',
    provider: communicationProviderFromWhatsAppEngine(active?.engine ?? null, active?.provider),
    to: input.to,
    body: input.body,
    payload: {
      renovacao_id:  input.renovacaoId,
      instance_name: input.instanceName ?? active?.instance_name ?? null,
      integration_id: active?.id ?? null,
      whatsapp_engine: active?.engine ?? null,
      tipo:          'renovacao_followup_auto',
      followup_round: 1,
    },
    scheduledFor: new Date(Date.now() + delayMs).toISOString(),
  })
}
