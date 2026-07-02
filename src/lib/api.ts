import { getEdgeFunctionUrl } from '@/lib/supabase'
import { getRuntimeConfig } from '@/lib/runtimeConfig'

export function getApiBaseUrl() {
  return getRuntimeConfig().apiBaseUrl
}

export function useLegacySupabase() {
  return getRuntimeConfig().useLegacySupabase
}

export function getApiUrl(path: string) {
  const baseUrl = getApiBaseUrl()
  if (!baseUrl) {
    throw new Error('VITE_API_BASE_URL nao esta configurada para o modo aiven_api.')
  }
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

export function getCheckoutBackendUrl(endpoint: 'context' | 'submit') {
  if (useLegacySupabase()) {
    return getEdgeFunctionUrl('marketplace-checkout')
  }
  return getApiUrl(`/checkout/${endpoint}`)
}

export function getMediaProxyUrl(mediaUrl: string, instanceName?: string): string {
  const params = new URLSearchParams({ url: mediaUrl })
  if (instanceName) params.set('instance', instanceName)
  return getApiUrl(`/chat/media-proxy?${params.toString()}`)
}

export async function postJson<T = unknown>(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data
      ? (data as any).error
      : response.statusText
    throw new Error(String(message || 'Falha na requisicao'))
  }

  return data as T
}
