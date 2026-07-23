type FetchLike = typeof fetch

export type TelegramWebhookSetupResult = {
  ok: boolean
  error?: string | null
  payload?: Record<string, unknown> | null
}

export type TelegramNotifierConfig = {
  botToken: string
  adminChatIds: string[]
  webhookUrl: string
  webhookSecret?: string | null
}

export type TelegramWebhookUpdate = {
  update_id?: number
  message?: {
    message_id?: number
    text?: string
    chat?: {
      id?: number | string
      type?: string
      username?: string
      first_name?: string
      last_name?: string
    }
    from?: {
      id?: number | string
      username?: string
      first_name?: string
      last_name?: string
    }
  }
  callback_query?: {
    id?: string
    data?: string
    from?: {
      id?: number | string
      username?: string
    }
    message?: {
      chat?: {
        id?: number | string
        type?: string
      }
    }
  }
}

export class TelegramNotifier {
  constructor(
    private readonly config: TelegramNotifierConfig,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  isConfigured() {
    return Boolean(this.config.botToken && this.config.adminChatIds.length > 0)
  }

  getWebhookUrl() {
    return this.config.webhookUrl.trim()
  }

  hasWebhookSecret() {
    return Boolean(this.config.webhookSecret?.trim())
  }

  isWebhookSecretValid(value: string) {
    if (!this.hasWebhookSecret()) return true
    return String(value ?? '').trim() === String(this.config.webhookSecret ?? '').trim()
  }

  isAdminChat(chatId: number | string | null | undefined) {
    if (chatId === null || chatId === undefined) return false
    const normalized = String(chatId).trim()
    return this.config.adminChatIds.includes(normalized)
  }

  async ensureWebhookConfigured(): Promise<TelegramWebhookSetupResult> {
    if (!this.config.botToken) {
      return { ok: false, error: 'TELEGRAM_BOT_TOKEN nao configurado.' }
    }

    if (!this.getWebhookUrl()) {
      return { ok: false, error: 'TELEGRAM_WEBHOOK_URL nao configurada.' }
    }

    const endpoint = `https://api.telegram.org/bot${this.config.botToken}/setWebhook`
    const body: Record<string, unknown> = {
      url: this.getWebhookUrl(),
      allowed_updates: ['message', 'callback_query'],
    }
    if (this.config.webhookSecret) {
      body.secret_token = this.config.webhookSecret
    }

    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok || payload.ok === false) {
      return {
        ok: false,
        error: String(payload.description || payload.error || `Telegram respondeu ${response.status}`),
        payload,
      }
    }

    return { ok: true, payload }
  }

  async sendMessage(chatId: number | string, text: string): Promise<TelegramWebhookSetupResult> {
    if (!this.config.botToken) {
      return { ok: false, error: 'TELEGRAM_BOT_TOKEN nao configurado.' }
    }

    const endpoint = `https://api.telegram.org/bot${this.config.botToken}/sendMessage`
    const response = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: this.limitMessage(text),
        disable_web_page_preview: true,
      }),
    })
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok || payload.ok === false) {
      return {
        ok: false,
        error: String(payload.description || payload.error || `Telegram respondeu ${response.status}`),
        payload,
      }
    }

    return { ok: true, payload }
  }

  async broadcast(text: string): Promise<TelegramWebhookSetupResult> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Telegram nao configurado para admins.' }
    }

    const results = await Promise.allSettled(
      this.config.adminChatIds.map(chatId => this.sendMessage(chatId, text)),
    )

    const failed = results.find(result => result.status === 'rejected')
    if (failed) {
      return { ok: false, error: 'Falha ao enviar notificação para um ou mais chats do Telegram.' }
    }

    const firstFulfilled = results.find((result): result is PromiseFulfilledResult<TelegramWebhookSetupResult> => result.status === 'fulfilled')
    return firstFulfilled?.value ?? { ok: true }
  }

  async notifyPaymentUpdate(input: {
    vendaId: string | null
    externalId: string | null
    gateway: string
    status: string
    paid: boolean
    payload: Record<string, unknown>
  }): Promise<void> {
    const statusLabel = input.paid ? 'pago' : input.status || 'pendente'
    const vendaLabel = input.vendaId ? `Venda ${input.vendaId}` : 'Venda sem ID'
    const externalLabel = input.externalId ? ` | Externo ${input.externalId}` : ''
    const payloadType = String(input.payload['type'] ?? input.payload['topic'] ?? input.payload['action'] ?? '').trim()
    const message = [
      'Atualização de pagamento',
      `${vendaLabel}${externalLabel}`,
      `Gateway: ${input.gateway}`,
      `Status: ${statusLabel}`,
      payloadType ? `Evento: ${payloadType}` : null,
    ].filter(Boolean).join('\n')

    await this.broadcast(message)
  }

  private limitMessage(text: string) {
    const normalized = text.trim()
    return normalized.length > 3900 ? `${normalized.slice(0, 3900)}...` : normalized
  }
}
