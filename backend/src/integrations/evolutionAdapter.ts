import type { BackendConfig, EvolutionInstanceConfig } from '../config/env.js'
import type { IntegrationEventEnvelope, IntegrationExecutionResult } from './contracts.js'
import type { IntegrationAdapter } from './registry.js'

function cleanBaseUrl(value: string) {
  return value.replace(/\/$/, '')
}

function normalizePhoneBR(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return value
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

export async function sendEvolutionMessage(
  instance: EvolutionInstanceConfig,
  to: string,
  body: string,
): Promise<IntegrationExecutionResult> {
  if (!instance.baseUrl || !instance.apiToken || !instance.instanceName) {
    return {
      ok: false,
      status: 'failed',
      error: 'Evolution API nao configurada para este canal.',
    }
  }

  const url = `${cleanBaseUrl(instance.baseUrl)}/message/sendText/${instance.instanceName}`
  const normalizedNumber = normalizePhoneBR(to)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: instance.apiToken,
    },
    body: JSON.stringify({ number: normalizedNumber, text: body }),
  })

  const payload = await response.json().catch(() => ({ status: response.status })) as Record<string, unknown>
  if (!response.ok) {
    return {
      ok: false,
      status: 'failed',
      error: `Evolution retornou HTTP ${response.status}`,
      payload,
    }
  }

  return {
    ok: true,
    status: 'sent',
    external_id: typeof payload === 'object' && payload && 'key' in payload
      ? JSON.stringify((payload as { key: unknown }).key)
      : null,
    payload,
  }
}

export class EvolutionAdapter implements IntegrationAdapter {
  readonly domain = 'communication' as const
  readonly provider = 'evolution' as const

  constructor(private readonly config: BackendConfig) {}

  async execute(event: IntegrationEventEnvelope): Promise<IntegrationExecutionResult> {
    if (event.event_type !== 'message.send') {
      return {
        ok: true,
        status: 'ignored',
        payload: { reason: 'Evento de comunicacao ignorado pelo adapter Evolution.' },
      }
    }

    const to = String(event.payload.to ?? '').trim()
    const body = String(event.payload.body ?? '').trim()
    if (!to || !body) {
      return {
        ok: false,
        status: 'failed',
        error: 'Payload Evolution invalido: informe to e body.',
      }
    }

    // Roteia para a instância correta com base no canal do evento.
    // canal='renovacao' → CertiID (IA de renovações)
    // canal='atendimento' ou ausente → atendimento humano (padrão)
    const canal = String(event.payload.canal ?? 'atendimento').trim()
    const instance = canal === 'renovacao'
      ? this.config.evolutionCertiid
      : this.config.evolutionAtendimento

    return sendEvolutionMessage(instance, to, body)
  }
}
