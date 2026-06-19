import type { IntegrationDomain, IntegrationEventEnvelope, IntegrationExecutionResult, IntegrationProvider } from './contracts.js'

export interface IntegrationAdapter {
  domain: IntegrationDomain
  provider: IntegrationProvider
  execute(event: IntegrationEventEnvelope): Promise<IntegrationExecutionResult>
}

export class IntegrationRegistry {
  private readonly adapters = new Map<string, IntegrationAdapter>()

  register(adapter: IntegrationAdapter) {
    this.adapters.set(this.key(adapter.domain, adapter.provider), adapter)
  }

  find(domain: IntegrationDomain, provider: IntegrationProvider) {
    return this.adapters.get(this.key(domain, provider)) ?? null
  }

  async execute(event: IntegrationEventEnvelope) {
    const adapter = this.find(event.domain, event.provider)
    if (!adapter) {
      return {
        ok: false,
        status: 'failed' as const,
        error: `Integração não registrada: ${event.domain}/${event.provider}`,
      }
    }
    return adapter.execute(event)
  }

  private key(domain: IntegrationDomain, provider: IntegrationProvider) {
    return `${domain}:${provider}`
  }
}
