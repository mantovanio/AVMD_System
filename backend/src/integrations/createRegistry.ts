import type { BackendConfig } from '../config/env.js'
import { EvolutionAdapter } from './evolutionAdapter.js'
import { N8nAdapter } from './n8nAdapter.js'
import { IntegrationRegistry } from './registry.js'

export function createIntegrationRegistry(config: BackendConfig) {
  const registry = new IntegrationRegistry()
  registry.register(new N8nAdapter(config))
  registry.register(new EvolutionAdapter(config))
  return registry
}
