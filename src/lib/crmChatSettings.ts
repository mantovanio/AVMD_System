import { getApiUrl } from '@/lib/api'

export type CrmChatSettings = {
  sign_outgoing_messages: boolean
}

export const DEFAULT_CRM_CHAT_SETTINGS: CrmChatSettings = {
  sign_outgoing_messages: true,
}

export function applyOutgoingSignature(content: string, senderName?: string | null, enabled = true) {
  if (!enabled) return content
  const name = (senderName ?? '').trim()
  if (!name) return content
  if (content.trimEnd().endsWith(`— ${name}`)) return content
  return `${content}\n\n— ${name}`
}

export async function loadCrmChatSettings() {
  try {
    const response = await fetch(getApiUrl('/app-settings?keys=crm_chat_settings'))
    const payload = await response.json().catch(() => null) as {
      ok?: boolean
      settings?: Record<string, unknown>
      error?: string
    } | null

    if (!response.ok || !payload?.ok) {
      return {
        data: DEFAULT_CRM_CHAT_SETTINGS,
        error: new Error(payload?.error ?? 'Não foi possível carregar as preferências do chat.'),
      }
    }

    const value = (payload.settings?.crm_chat_settings ?? {}) as Partial<CrmChatSettings>
    return {
      data: {
        ...DEFAULT_CRM_CHAT_SETTINGS,
        ...value,
        sign_outgoing_messages: value.sign_outgoing_messages ?? DEFAULT_CRM_CHAT_SETTINGS.sign_outgoing_messages,
      },
      error: null,
    }
  } catch (error) {
    return {
      data: DEFAULT_CRM_CHAT_SETTINGS,
      error: error instanceof Error ? error : new Error('Não foi possível carregar as preferências do chat.'),
    }
  }
}

