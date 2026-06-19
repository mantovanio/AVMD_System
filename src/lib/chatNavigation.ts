import type { Page } from '@/components/Sidebar'

export type CentralChatContext = Record<string, string | number | boolean | null | undefined>

export type OpenCentralChatOptions = {
  phone: string
  contactName?: string | null
  firstMessage?: string | null
  context?: CentralChatContext | null
  page?: Page
}

function cleanContext(context: CentralChatContext | null | undefined) {
  if (!context) return null

  const entries = Object.entries(context)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => [key, String(value)])

  if (entries.length === 0) return null
  return Object.fromEntries(entries)
}

export function openCentralChat(options: OpenCentralChatOptions) {
  const digits = options.phone.replace(/\D/g, '')
  if (!digits) return false

  const page = options.page ?? 'chat'
  sessionStorage.setItem('crm:open-chat-phone', digits)
  sessionStorage.setItem('crm:open-chat-nome', options.contactName ?? '')
  sessionStorage.setItem('crm:open-chat-msg', options.firstMessage ?? '')

  const safeContext = cleanContext(options.context)
  if (safeContext) {
    sessionStorage.setItem('crm:open-chat-contexto', JSON.stringify(safeContext))
  } else {
    sessionStorage.removeItem('crm:open-chat-contexto')
  }

  window.dispatchEvent(new CustomEvent('crm:navigate', { detail: { page } }))
  return true
}