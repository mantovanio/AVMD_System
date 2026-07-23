import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

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
  telegramBotToken: string
  telegramAdminChatIds: string[]
  telegramWebhookUrl: string
  telegramWebhookSecret: string
  // Canal de atendimento humano (dia a dia, sem IA)
  evolutionAtendimento: EvolutionInstanceConfig
  // Canal CertiID — renovações de certificados (com IA)
  evolutionCertiid: EvolutionInstanceConfig
}

try {
  const envFileCandidates = [
    resolve('backend/.env.local'),
    resolve('../.env.local'),
  ]
  const envFile = envFileCandidates.find(f => existsSync(f))
  if (envFile) process.loadEnvFile?.(envFile)
} catch {
  // Arquivo local opcional para segredos de desenvolvimento.
}

function env(name: string, fallback = '') {
  return String(process.env[name] || fallback).trim()
}

function parseCsvList(value: string) {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

export function loadConfig(): BackendConfig {
  const baseUrl = env('EVOLUTION_BASE_URL')
  const defaultToken = env('EVOLUTION_API_TOKEN')
  const publicApiBaseUrl = env('PUBLIC_API_BASE_URL', 'https://api.certiid.mantovan.com.br')
  const telegramWebhookUrl = env('TELEGRAM_WEBHOOK_URL', `${publicApiBaseUrl.replace(/\/$/, '')}/api/webhooks/telegram`)
  const defaultEmailSendUrl = 'https://auto.mantovan.com.br/webhook/avmd-email-send'
  return {
    port: Number(env('PORT', '8787')),
    databaseUrl: env('DATABASE_URL'),
    corsOrigin: env('CORS_ORIGIN', 'http://localhost:5173'),
    n8nWebhookUrl: env('N8N_WEBHOOK_URL'),
    n8nEmailSendUrl: env('N8N_EMAIL_SEND_URL', defaultEmailSendUrl),
    clerkSecretKey: env('CLERK_SECRET_KEY'),
    publicApiBaseUrl,
    telegramBotToken: env('TELEGRAM_BOT_TOKEN'),
    telegramAdminChatIds: parseCsvList(env('TELEGRAM_ADMIN_CHAT_IDS')),
    telegramWebhookUrl,
    telegramWebhookSecret: env('TELEGRAM_WEBHOOK_SECRET'),
    evolutionAtendimento: {
      baseUrl,
      apiToken: env('EVOLUTION_ATENDIMENTO_API_TOKEN') || defaultToken,
      instanceName: env('EVOLUTION_ATENDIMENTO_INSTANCE_NAME', 'atendimento'),
    },
    evolutionCertiid: {
      baseUrl,
      apiToken: env('EVOLUTION_CERTIID_API_TOKEN') || defaultToken,
      instanceName: env('EVOLUTION_CERTIID_INSTANCE_NAME', 'CertiID'),
    },
  }
}
