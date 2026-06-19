import type { IntegrationEventRepository } from '../repositories/integrationEventRepository.js'
import type { IntegrationRegistry } from './registry.js'

export class IntegrationEventProcessor {
  constructor(
    private readonly repository: IntegrationEventRepository,
    private readonly registry: IntegrationRegistry,
  ) {}

  async processQueued(limit = 10) {
    const events = await this.repository.listQueued(limit)
    const results = []

    for (const event of events) {
      try {
        const result = await this.registry.execute(event)
        await this.repository.markProcessed({
          id: event.id,
          status: result.status ?? (result.ok ? 'sent' : 'failed'),
          externalId: result.external_id ?? null,
          error: result.error ?? null,
          payload: result.payload ?? null,
        })
        results.push({ id: event.id, ok: result.ok, status: result.status ?? (result.ok ? 'sent' : 'failed'), error: result.error ?? null })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido ao processar evento.'
        await this.repository.markProcessed({
          id: event.id,
          status: 'failed',
          error: message,
        })
        results.push({ id: event.id, ok: false, status: 'failed', error: message })
      }
    }

    return {
      total: events.length,
      results,
    }
  }
}
