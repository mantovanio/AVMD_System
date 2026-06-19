import { getRuntimeConfig } from '@/lib/runtimeConfig'

export function getClerkFrontendApi() {
  return getRuntimeConfig().clerkFrontendApi
}

export function getClerkPublishableKey() {
  return getRuntimeConfig().clerkPublishableKey
}

export function isClerkConfigured() {
  const config = getRuntimeConfig()
  return Boolean(config.clerkFrontendApi || config.clerkPublishableKey)
}
