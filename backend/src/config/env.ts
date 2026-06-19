export type BackendConfig = {
  port: number
  databaseUrl: string
  corsOrigin: string
  n8nWebhookUrl: string
  evolutionBaseUrl: string
  evolutionApiToken: string
  evolutionInstanceName: string
}

try {
  process.loadEnvFile?.('backend/.env.local')
} catch {
  // Arquivo local opcional para segredos de desenvolvimento.
}

function env(name: string, fallback = '') {
  return String(process.env[name] || fallback).trim()
}

export function loadConfig(): BackendConfig {
  return {
    port: Number(env('PORT', '8787')),
    databaseUrl: env('DATABASE_URL'),
    corsOrigin: env('CORS_ORIGIN', 'http://localhost:5173'),
    n8nWebhookUrl: env('N8N_WEBHOOK_URL'),
    evolutionBaseUrl: env('EVOLUTION_BASE_URL'),
    evolutionApiToken: env('EVOLUTION_API_TOKEN'),
    evolutionInstanceName: env('EVOLUTION_INSTANCE_NAME'),
  }
}
