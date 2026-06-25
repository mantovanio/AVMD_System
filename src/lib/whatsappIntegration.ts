import { getApiUrl } from '@/lib/api'
import type { ExternalIntegration, IntegrationProvider, WhatsAppEngine } from '@/types'

type IntegrationMetadata = Record<string, unknown>

export interface ActiveWhatsAppIntegration {
  id: string
  provider: IntegrationProvider
  engine: WhatsAppEngine
  name: string
  base_url: string | null
  api_token: string | null
  instance_name: string | null
  webhook_url: string | null
  supportsEmbeddedChat: boolean
}

function readMetadata(integration: Pick<ExternalIntegration, 'metadata'> | Partial<ExternalIntegration> | null | undefined): IntegrationMetadata {
  const metadata = integration?.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  return metadata as IntegrationMetadata
}

export function getWhatsAppEngine(integration: Pick<ExternalIntegration, 'provider' | 'metadata'> | Partial<ExternalIntegration> | null | undefined): WhatsAppEngine {
  const metadata = readMetadata(integration)
  const engine = metadata.whatsapp_engine
  if (engine === 'evolution' || engine === 'zapi' || engine === 'custom') return engine
  if (integration?.provider === 'evolution') return 'evolution'
  return 'custom'
}

export function getWhatsAppEngineLabel(engine: WhatsAppEngine) {
  const labels: Record<WhatsAppEngine, string> = {
    evolution: 'Evolution compatível',
    zapi: 'Z-API / similar',
    custom: 'Webhook customizado',
  }
  return labels[engine]
}

export function isWhatsAppIntegration(integration: Pick<ExternalIntegration, 'provider' | 'metadata'> | Partial<ExternalIntegration> | null | undefined) {
  if (!integration) return false
  const metadata = readMetadata(integration)
  if (metadata.integration_family === 'whatsapp_api') return true
  return integration.provider === 'evolution'
}

export function supportsEmbeddedChat(engine: WhatsAppEngine) {
  return engine === 'evolution'
}

export function buildWhatsAppMetadata(
  current: Pick<ExternalIntegration, 'metadata'> | Partial<ExternalIntegration> | null | undefined,
  engine: WhatsAppEngine,
): IntegrationMetadata {
  const metadata = readMetadata(current)
  return {
    ...metadata,
    integration_family: 'whatsapp_api',
    whatsapp_engine: engine,
    supports_embedded_chat: supportsEmbeddedChat(engine),
  }
}

export function normalizeWhatsAppProvider(
  currentProvider: IntegrationProvider,
  _engine: WhatsAppEngine,
): IntegrationProvider {
  if (currentProvider === 'evolution' || currentProvider === 'n8n') return 'evolution'
  return 'evolution'
}

function integrationPriority(integration: ExternalIntegration, canal?: 'atendimento' | 'renovacao') {
  const metadata = readMetadata(integration)
  const engine = getWhatsAppEngine(integration)
  const statusScore = integration.status === 'ativo' ? 0 : integration.status === 'pendente' ? 1 : 2
  const canalScore = canal && metadata.canal === canal ? 0 : 1
  const engineScore = engine === 'evolution' ? 0 : 1
  const credentialScore = integration.base_url && integration.api_token && integration.instance_name ? 0 : 1
  return `${canalScore}${engineScore}${credentialScore}${statusScore}`
}

export async function loadActiveWhatsAppIntegration(canal?: 'atendimento' | 'renovacao'): Promise<ActiveWhatsAppIntegration | null> {
  let list: ExternalIntegration[]
  try {
    const res = await fetch(getApiUrl('/integrations'))
    const data = await res.json() as { ok: boolean; integrations: ExternalIntegration[] }
    list = (data.integrations ?? [])
      .filter(isWhatsAppIntegration)
      .filter(item => item.status !== 'inativo')
      .sort((a, b) => integrationPriority(a, canal).localeCompare(integrationPriority(b, canal)))
  } catch {
    return null
  }

  const preferred = list[0]
  if (!preferred) return null

  const engine = getWhatsAppEngine(preferred)
  return {
    id: preferred.id,
    provider: preferred.provider,
    engine,
    name: preferred.name,
    base_url: preferred.base_url,
    api_token: preferred.api_token,
    instance_name: preferred.instance_name,
    webhook_url: preferred.webhook_url,
    supportsEmbeddedChat: supportsEmbeddedChat(engine),
  }
}
