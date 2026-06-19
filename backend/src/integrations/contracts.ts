export type IntegrationDomain = 'communication' | 'automation' | 'payment' | 'fiscal'

export type IntegrationProvider =
  | 'evolution'
  | 'n8n'
  | 'safe2pay'
  | 'mercado_pago'
  | 'itau'
  | 'inter'
  | 'c6'
  | 'prefeitura'
  | 'sefaz'
  | 'email_smtp'

export type IntegrationDirection = 'inbound' | 'outbound'

export type IntegrationEventStatus = 'queued' | 'processing' | 'sent' | 'received' | 'failed' | 'ignored'

export type IntegrationEventType =
  | 'message.send'
  | 'message.received'
  | 'automation.trigger'
  | 'payment.charge.create'
  | 'payment.status.updated'
  | 'fiscal.invoice.issue'
  | 'fiscal.invoice.cancel'
  | 'fiscal.invoice.status.updated'
  | 'commercial.sale.status.updated'
  | 'commercial.customer.saved'
  | 'commercial.validation_agenda.saved'

export type IntegrationEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  id?: string
  domain: IntegrationDomain
  provider: IntegrationProvider
  direction: IntegrationDirection
  event_type: IntegrationEventType
  status?: IntegrationEventStatus
  entity_type?: string | null
  entity_id?: string | null
  correlation_id?: string | null
  payload: TPayload
  metadata?: Record<string, unknown> | null
}

export type IntegrationExecutionResult = {
  ok: boolean
  external_id?: string | null
  status?: IntegrationEventStatus
  error?: string | null
  payload?: Record<string, unknown> | null
}

