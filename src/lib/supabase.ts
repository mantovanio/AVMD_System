import { createClient } from '@supabase/supabase-js'
import { getRuntimeConfig } from '@/lib/api'
import { useLegacySupabase } from '@/lib/api'

// Verifica se estamos no modo legado ANTES de criar o cliente
const legacyMode = useLegacySupabase()

const runtime = getRuntimeConfig()
const supabaseUrl = runtime.supabaseUrl
const supabaseAnonKey = runtime.supabaseAnonKey

// APENAS instancia o cliente se estiver no modo legado E tiver as chaves
export const supabase = (legacyMode && supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: supabaseFetch } })
  : null as unknown as ReturnType<typeof createClient>

// Função fetch conditional - usa fetch nativo se não houver Supabase
function supabaseFetch(input: RequestInfo, init?: RequestInit) {
  // Se não houver cliente Supabase instalado, use fetch nativo
  if (!supabase) return fetch(input, init)
  // Caso contrário, use o fetch do cliente Supabase
  const supaClient = supabase as any
  return supaClient.fetch(input, init)
}

// Tipos e constantes úteis (apenas leitura, não criam conexão)
export const SUPABASE_URL = supabaseUrl
export const SUPABASE_ANON_KEY = supabaseAnonKey

export function getEdgeFunctionUrl(functionName: string) {
  // Só retorna URL se supabase cliente existir
  return supabase ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${functionName}` : ''
}