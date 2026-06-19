import type { IntegrationEventEnvelope } from './contracts.js'

export function buildEvolutionMessageEvent(input: {
  to: string
  body: string
  entityType?: string | null
  entityId?: string | null
  correlationId?: string | null
  metadata?: Record<string, unknown> | null
}): IntegrationEventEnvelope {
  return {
    domain: 'communication',
    provider: 'evolution',
    direction: 'outbound',
    event_type: 'message.send',
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    correlation_id: input.correlationId ?? null,
    payload: {
      to: input.to,
      body: input.body,
    },
    metadata: input.metadata ?? null,
  }
}

export function buildN8nAutomationEvent(input: {
  workflowKey: string
  payload: Record<string, unknown>
  entityType?: string | null
  entityId?: string | null
  correlationId?: string | null
}): IntegrationEventEnvelope {
  return {
    domain: 'automation',
    provider: 'n8n',
    direction: 'outbound',
    event_type: 'automation.trigger',
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    correlation_id: input.correlationId ?? null,
    payload: {
      workflow_key: input.workflowKey,
      ...input.payload,
    },
  }
}

export function buildPaymentStatusEvent(input: {
  provider: 'safe2pay' | 'mercado_pago' | 'itau' | 'inter' | 'c6'
  vendaId?: string | null
  externalId?: string | null
  status: string
  payload: Record<string, unknown>
}): IntegrationEventEnvelope {
  return {
    domain: 'payment',
    provider: input.provider,
    direction: 'inbound',
    event_type: 'payment.status.updated',
    entity_type: 'vendas_certificados',
    entity_id: input.vendaId ?? null,
    correlation_id: input.externalId ?? null,
    payload: {
      status: input.status,
      external_id: input.externalId ?? null,
      ...input.payload,
    },
  }
}

export function buildFiscalIssueEvent(input: {
  provider: 'prefeitura' | 'sefaz'
  vendaId: string
  payload: Record<string, unknown>
  correlationId?: string | null
}): IntegrationEventEnvelope {
  return {
    domain: 'fiscal',
    provider: input.provider,
    direction: 'outbound',
    event_type: 'fiscal.invoice.issue',
    entity_type: 'vendas_certificados',
    entity_id: input.vendaId,
    correlation_id: input.correlationId ?? null,
    payload: input.payload,
  }
}
