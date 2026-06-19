import type { BackendConfig } from '../config/env.js'
import type { IntegrationEventEnvelope, IntegrationExecutionResult } from './contracts.js'
import type { IntegrationAdapter } from './registry.js'

export class N8nAdapter implements IntegrationAdapter {
  readonly domain = 'automation' as const
  readonly provider = 'n8n' as const

  constructor(private readonly config: BackendConfig) {}

  async execute(event: IntegrationEventEnvelope): Promise<IntegrationExecutionResult> {
    if (!this.config.n8nWebhookUrl) {
      return {
        ok: false,
        status: 'failed',
        error: 'N8N_WEBHOOK_URL nao configurada.',
      }
    }

    const response = await fetch(this.config.n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    })

    const payload = await response.json().catch(() => ({ status: response.status })) as Record<string, unknown>
    if (!response.ok) {
      return {
        ok: false,
        status: 'failed',
        error: `N8N retornou HTTP ${response.status}`,
        payload,
      }
    }

    return {
      ok: true,
      status: 'sent',
      payload,
    }
  }
}

