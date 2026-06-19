import type { IncomingMessage, ServerResponse } from 'node:http'
import type { IntegrationEventEnvelope } from '../integrations/contracts.js'
import { IntegrationEventProcessor } from '../integrations/eventProcessor.js'
import { IntegrationEventRepository } from '../repositories/integrationEventRepository.js'
import { readJson, writeJson } from '../utils/http.js'

type CreateIntegrationEventRequest = IntegrationEventEnvelope

type ProcessIntegrationEventsRequest = {
  limit?: number
}

export async function handleIntegrationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  repository: IntegrationEventRepository,
  processor: IntegrationEventProcessor,
  corsOrigin: string,
) {
  if (req.method === 'POST' && req.url === '/api/integrations/events') {
    const body = await readJson<CreateIntegrationEventRequest>(req)
    const event = await repository.create(body)
    writeJson(res, 200, { ok: true, event }, corsOrigin)
    return true
  }

  if (req.method === 'POST' && req.url === '/api/integrations/process') {
    const body = await readJson<ProcessIntegrationEventsRequest>(req)
    const result = await processor.processQueued(body.limit ?? 10)
    writeJson(res, 200, { ok: true, ...result }, corsOrigin)
    return true
  }

  return false
}
