import { supabase } from '@/lib/supabase'

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
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'crm_chat_settings')
    .maybeSingle()

  if (error) return { data: DEFAULT_CRM_CHAT_SETTINGS, error }

  const value = (data?.value ?? {}) as Partial<CrmChatSettings>
  return {
    data: {
      ...DEFAULT_CRM_CHAT_SETTINGS,
      ...value,
      sign_outgoing_messages: value.sign_outgoing_messages ?? DEFAULT_CRM_CHAT_SETTINGS.sign_outgoing_messages,
    },
    error: null,
  }
}

