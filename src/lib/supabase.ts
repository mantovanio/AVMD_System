import { createClient } from '@supabase/supabase-js'
import { getRuntimeConfig } from '@/lib/runtimeConfig'

const runtime = getRuntimeConfig()
const supabaseUrl = runtime.supabaseUrl
const supabaseAnonKey = runtime.supabaseAnonKey

function shouldStripHeader(key: string) {
  const normalized = key.toLowerCase()
  return normalized === 'x-client-info' || normalized.startsWith('x-supabase-')
}

function sanitizeHeaders(headers?: HeadersInit) {
  const next = new Headers(headers ?? {})
  for (const key of Array.from(next.keys())) {
    if (shouldStripHeader(key)) next.delete(key)
  }
  return next
}

function stripSupabaseClientInfo(input: RequestInfo | URL, init?: RequestInit) {
  const nextInit: RequestInit = { ...(init ?? {}) }
  nextInit.headers = sanitizeHeaders(nextInit.headers)

  if (input instanceof Request) {
    const requestHeaders = sanitizeHeaders(input.headers)
    const nextRequest = new Request(input, { ...nextInit, headers: requestHeaders })
    return fetch(nextRequest)
  }

  return fetch(input, nextInit)
}

// Only instantiate if URL is present — in aiven_api mode the URL is not required
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: stripSupabaseClientInfo } })
  : null as unknown as ReturnType<typeof createClient>

export const SUPABASE_URL = supabaseUrl
export const SUPABASE_ANON_KEY = supabaseAnonKey

export function getEdgeFunctionUrl(functionName: string) {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${functionName}`
}

type ClerkSessionWithToken = {
  getToken: () => Promise<string | null>
}

type ClerkRuntime = {
  session?: ClerkSessionWithToken | null
}

export async function getSupabaseAccessToken() {
  const clerk = globalThis as typeof globalThis & { Clerk?: ClerkRuntime }
  const token = await clerk.Clerk?.session?.getToken()
  if (!token) throw new Error('Sessao expirada. Faca login novamente.')
  return token
}
