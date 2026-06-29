import { getApiBaseUrl, getApiUrl } from '@/lib/api'
import { getEdgeFunctionUrl } from '@/lib/supabase'

export function getEvolutionWebhookUrl() {
  const apiBaseUrl = getApiBaseUrl()
  if (apiBaseUrl) {
    return getApiUrl('/webhooks/evolution')
  }

  return getEdgeFunctionUrl('evolution-webhook')
}

export function getEvolutionConnectionTestUrl() {
  return getApiUrl('/evolution/connection/test')
}

export function getEvolutionWebhookConfigureUrl() {
  return getApiUrl('/evolution/webhook/configure')
}
