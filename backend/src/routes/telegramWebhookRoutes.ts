import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AivenSqlClient } from '../db/aivenClient.js'
import { readJson, writeJson } from '../utils/http.js'
import type { TelegramNotifier, TelegramWebhookUpdate } from '../services/telegramNotifier.js'

type TelegramQueryRow = {
  total: string
  em_aberto: string
  pago: string
  recusado: string
  outbox_pending: string
  outbox_failed: string
}

function normalizeText(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeMoney(value: unknown) {
  const raw = Number(value ?? 0)
  if (Number.isNaN(raw)) return 'R$ 0,00'
  return raw.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function parseCommand(text: string) {
  const normalized = text.trim()
  const [command, ...parts] = normalized.split(/\s+/)
  return { command: command.toLowerCase(), args: parts }
}

async function buildStatusMessage(db: AivenSqlClient) {
  const [salesResult, outboxResult] = await Promise.all([
    db.query<TelegramQueryRow>(`
      select
        count(*)::text as total,
        count(*) filter (where coalesce(pago, false) = false and coalesce(status_pagamento, '') <> 'pago')::text as em_aberto,
        count(*) filter (where coalesce(pago, false) = true or coalesce(status_pagamento, '') = 'pago')::text as pago,
        count(*) filter (where coalesce(status_pagamento, '') = 'recusado')::text as recusado
      from vendas_certificados
    `),
    db.query<TelegramQueryRow>(`
      select
        count(*) filter (where status = 'pending')::text as outbox_pending,
        count(*) filter (where status = 'failed')::text as outbox_failed,
        count(*)::text as total,
        '0'::text as em_aberto,
        '0'::text as pago,
        '0'::text as recusado
      from communication_outbox
    `),
  ])

  const sales = salesResult.rows[0]
  const outbox = outboxResult.rows[0]
  return [
    'AVMD operacional',
    `Vendas: ${sales?.total ?? '0'}`,
    `Em aberto: ${sales?.em_aberto ?? '0'}`,
    `Pagas: ${sales?.pago ?? '0'}`,
    `Recusadas: ${sales?.recusado ?? '0'}`,
    `Fila de comunicação: ${outbox?.outbox_pending ?? '0'}`,
    `Falhas na fila: ${outbox?.outbox_failed ?? '0'}`,
  ].join('\n')
}

async function buildLatestPendingMessage(db: AivenSqlClient) {
  const result = await db.query<{
    id: string
    pedido_numero: string | null
    valor_venda: number | string | null
    status_pagamento: string | null
    pago: boolean | null
    created_at: string
  }>(`
    select id, pedido_numero, valor_venda, status_pagamento, pago, created_at
    from vendas_certificados
    where coalesce(pago, false) = false
      and coalesce(status_pagamento, '') <> 'pago'
    order by created_at desc
    limit 5
  `)

  if (result.rows.length === 0) {
    return 'Nenhuma venda pendente no momento.'
  }

  return [
    'Últimas vendas em aberto',
    ...result.rows.map(row => {
      const ref = row.pedido_numero ?? row.id
      return `• ${ref} — ${normalizeMoney(row.valor_venda)} — ${row.status_pagamento ?? 'em_aberto'}`
    }),
  ].join('\n')
}

async function buildSaleMessage(db: AivenSqlClient, ref: string) {
  const result = await db.query<{
    id: string
    pedido_numero: string | null
    valor_venda: number | string | null
    status_pagamento: string | null
    pago: boolean | null
    forma_pagamento_id: string | null
    data_pagamento: string | null
    created_at: string
    updated_at: string
  }>(`
    select id, pedido_numero, valor_venda, status_pagamento, pago, forma_pagamento_id, data_pagamento, created_at, updated_at
    from vendas_certificados
    where id::text = $1
       or pedido_numero::text = $1
    order by created_at desc
    limit 1
  `, [ref])

  const sale = result.rows[0]
  if (!sale) {
    return `Nenhuma venda encontrada para ${ref}.`
  }

  return [
    `Venda ${sale.pedido_numero ?? sale.id}`,
    `Valor: ${normalizeMoney(sale.valor_venda)}`,
    `Pagamento: ${sale.status_pagamento ?? 'sem_status'}`,
    `Pago: ${sale.pago ? 'sim' : 'não'}`,
    `Forma: ${sale.forma_pagamento_id ?? 'não informada'}`,
    sale.data_pagamento ? `Data do pagamento: ${sale.data_pagamento}` : null,
  ].filter(Boolean).join('\n')
}

async function handleTelegramCommand(notifier: TelegramNotifier, db: AivenSqlClient, update: TelegramWebhookUpdate) {
  const message = update.message ?? update.callback_query?.message
  const chatId = message?.chat?.id ?? null
  const text = normalizeText(update.message?.text ?? update.callback_query?.data)
  if (!chatId || !text) return
  if (!notifier.isAdminChat(chatId)) return

  const { command, args } = parseCommand(text)
  if (!command) return

  if (command === '/start' || command === '/ajuda' || command === '/help') {
    await notifier.sendMessage(chatId, [
      'Comandos disponíveis:',
      '/status - resumo da operação',
      '/pendentes - últimas vendas em aberto',
      '/venda <pedido|id> - detalhes de uma venda',
      '/ping - valida conexão',
    ].join('\n'))
    return
  }

  if (command === '/ping') {
    await notifier.sendMessage(chatId, 'Telegram ativo e conectado ao AVMD.')
    return
  }

  if (command === '/status') {
    await notifier.sendMessage(chatId, await buildStatusMessage(db))
    return
  }

  if (command === '/pendentes') {
    await notifier.sendMessage(chatId, await buildLatestPendingMessage(db))
    return
  }

  if (command === '/venda') {
    const ref = args[0]
    if (!ref) {
      await notifier.sendMessage(chatId, 'Informe o pedido ou ID: /venda 18025')
      return
    }
    await notifier.sendMessage(chatId, await buildSaleMessage(db, ref))
    return
  }

  await notifier.sendMessage(chatId, 'Comando não reconhecido. Use /help.')
}

export async function handleTelegramWebhookRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  notifier: TelegramNotifier,
  db: AivenSqlClient,
  corsOrigin: string,
): Promise<boolean> {
  const url = req.url ?? ''
  const method = req.method ?? ''

  if (!url.startsWith('/api/webhooks/telegram')) return false

  if (method === 'GET') {
    writeJson(res, 200, { ok: true, service: 'telegram-webhook' }, corsOrigin)
    return true
  }

  if (method !== 'POST') return false

  if (notifier.getWebhookUrl() && !notifier.isWebhookSecretValid(normalizeText(req.headers['x-telegram-bot-api-secret-token']))) {
    writeJson(res, 403, { ok: false, error: 'Webhook telegram inválido.' }, corsOrigin)
    return true
  }

  const update = await readJson<TelegramWebhookUpdate>(req)
  await handleTelegramCommand(notifier, db, update)
  writeJson(res, 200, { ok: true }, corsOrigin)
  return true
}
