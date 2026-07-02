export type EvolutionInstanceConfig = {
  baseUrl: string
  apiToken: string
  instanceName: string
}

export type BackendConfig = {
  port: number
  databaseUrl: string
  corsOrigin: string
  n8nWebhookUrl: string
  n8nEmailSendUrl: string
  clerkSecretKey: string
  publicApiBaseUrl: string
  // Canal de atendimento humano (dia a dia, sem IA)
  evolutionAtendimento: EvolutionInstanceConfig
  // Canal CertiID — renovações de certificados (com IA)
  evolutionCertiid: EvolutionInstanceConfig
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
  const baseUrl = env('EVOLUTION_BASE_URL')
  return {
    port: Number(env('PORT', '8787')),
    databaseUrl: env('DATABASE_URL'),
    corsOrigin: env('CORS_ORIGIN', 'http://localhost:5173'),
    n8nWebhookUrl: env('N8N_WEBHOOK_URL'),
    n8nEmailSendUrl: env('N8N_EMAIL_SEND_URL'),
    clerkSecretKey: env('CLERK_SECRET_KEY'),
    publicApiBaseUrl: env('PUBLIC_API_BASE_URL', 'https://api.certiid.mantovan.com.br'),
    evolutionAtendimento: {
      baseUrl,
      apiToken: env('EVOLUTION_ATENDIMENTO_API_TOKEN'),
      instanceName: env('EVOLUTION_ATENDIMENTO_INSTANCE_NAME', 'atendimento'),
    },
    evolutionCertiid: {
      baseUrl,
      apiToken: env('EVOLUTION_CERTIID_API_TOKEN'),
      instanceName: env('EVOLUTION_CERTIID_INSTANCE_NAME', 'CertiID'),
    },
  }
}
