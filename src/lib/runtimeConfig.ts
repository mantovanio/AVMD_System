export type RuntimeMode = 'supabase_legacy' | 'aiven_api'

export type RuntimeConfig = {
  clerkFrontendApi: string
  clerkPublishableKey: string
  supabaseUrl: string
  supabaseAnonKey: string
  apiBaseUrl: string
  useLegacySupabase: boolean
  mode: RuntimeMode
}

function env(name: string) {
  return String(import.meta.env[name] || '').trim()
}

export function getRuntimeConfig(): RuntimeConfig {
  const clerkFrontendApi = env('VITE_CLERK_FRONTEND_API')
  const clerkPublishableKey = env('VITE_CLERK_PUBLISHABLE_KEY')
  const supabaseUrl = env('VITE_SUPABASE_URL')
  const supabaseAnonKey = env('VITE_SUPABASE_PUBLISHABLE_KEY') || env('VITE_SUPABASE_ANON_KEY')
  const apiBaseUrl = env('VITE_API_BASE_URL')
  const useLegacySupabase = (env('VITE_USE_LEGACY_SUPABASE') || 'true').toLowerCase() === 'true'

  return {
    clerkFrontendApi,
    clerkPublishableKey,
    supabaseUrl,
    supabaseAnonKey,
    apiBaseUrl,
    useLegacySupabase,
    mode: useLegacySupabase ? 'supabase_legacy' : 'aiven_api',
  }
}

export function assertRuntimeConfig() {
  const config = getRuntimeConfig()
  const missing: string[] = []

  if (!config.clerkPublishableKey) {
    missing.push('VITE_CLERK_PUBLISHABLE_KEY')
  }

  if (config.useLegacySupabase) {
    if (!config.supabaseUrl) missing.push('VITE_SUPABASE_URL')
    if (!config.supabaseAnonKey) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY ou VITE_SUPABASE_ANON_KEY')
  } else if (!config.apiBaseUrl) {
    missing.push('VITE_API_BASE_URL')
  }

  if (missing.length > 0) {
    throw new Error(`Configuracao obrigatoria ausente para o modo atual (${config.mode}): ${missing.join(', ')}`)
  }

  return config
}
