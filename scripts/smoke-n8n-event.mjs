import { createAivenSqlClient } from '../backend/dist/db/aivenClient.js'
import { loadConfig } from '../backend/dist/config/env.js'
import { createIntegrationRegistry } from '../backend/dist/integrations/createRegistry.js'
import { IntegrationEventProcessor } from '../backend/dist/integrations/eventProcessor.js'
import { IntegrationEventRepository } from '../backend/dist/repositories/integrationEventRepository.js'

const db = createAivenSqlClient()
const repository = new IntegrationEventRepository(db)
const processor = new IntegrationEventProcessor(repository, createIntegrationRegistry(loadConfig()))

const created = await repository.create({
  domain: 'automation',
  provider: 'n8n',
  direction: 'outbound',
  event_type: 'automation.trigger',
  status: 'queued',
  entity_type: 'smoke_test',
  entity_id: 'n8n-webhook',
  correlation_id: `smoke-n8n-${Date.now()}`,
  payload: {
    workflow_key: 'smoke_test',
    message: 'Teste de integracao AVMD -> N8N',
    source: 'scripts/smoke-n8n-event.mjs',
  },
  metadata: {
    registro_teste: true,
  },
})

const result = await processor.processQueued(1)
console.log(JSON.stringify({ created, result }, null, 2))
process.exit(result.results.some(item => !item.ok) ? 1 : 0)
