import type { BackendConfig } from '../config/env.js'
import type { IntegrationEventEnvelope, IntegrationExecutionResult } from './contracts.js'
import type { IntegrationAdapter } from './registry.js'

function cleanBaseUrl(value: string) {
  return value.replace(/\/$/, '')
}

export class EvolutionAdapter implements IntegrationAdapter {
  readonly domain = 'communication' as const
  readonly provider = 'evolution' as const

  constructor(private readonly config: BackendConfig) {}

  async execute(event: IntegrationEventEnvelope): Promise<IntegrationExecutionResult> {
    if (!this.config.evolutionBaseUrl || !this.config.evolutionApiToken || !this.config.evolutionInstanceName) {
      return {
        ok: false,
        status: 'failed',
        error: 'Evolution API nao configurada no backend.',
      }
    }

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

    const url = `${cleanBaseUrl(this.config.evolutionBaseUrl)}/message/sendText/${this.config.evolutionInstanceName}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.config.evolutionApiToken,
      },
      body: JSON.stringify({
        number: to,
        text: body,
      }),
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
      external_id: typeof payload === 'object' && payload && 'key' in payload ? JSON.stringify((payload as { key: unknown }).key) : null,
      payload,
    }
  }
}

