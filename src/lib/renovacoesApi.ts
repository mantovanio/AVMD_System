import { getApiUrl } from '@/lib/api'
import type {
  AutomationRule, CommunicationTemplate, LinkProduto, RenovacaoV2, StatusRenovacao,
} from '@/types'

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(getApiUrl(path), {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const json = await res.json().catch(() => null) as T
  if (!res.ok) {
    const err = (json as { error?: string } | null)?.error ?? `HTTP ${res.status}`
    throw new Error(err)
  }
  return json
}

// ── Renovações ────────────────────────────────────────────────

export async function fetchRenovacoes(): Promise<RenovacaoV2[]> {
  const data = await apiFetch<{ ok: boolean; renovacoes: RenovacaoV2[] }>('/renovacoes')
  return data.renovacoes ?? []
}

export async function createRenovacao(record: Omit<RenovacaoV2, 'id' | 'created_at' | 'dias_restantes' | 'prioridade'>): Promise<RenovacaoV2> {
  const data = await apiFetch<{ ok: boolean; renovacao: RenovacaoV2 }>('/renovacoes', {
    method: 'POST',
    body: JSON.stringify(record),
  })
  return data.renovacao
}

export async function bulkCreateRenovacoes(records: unknown[]): Promise<number> {
  const data = await apiFetch<{ ok: boolean; inserted: number }>('/renovacoes/bulk', {
    method: 'POST',
    body: JSON.stringify({ records }),
  })
  return data.inserted ?? 0
}

export async function updateRenovacao(id: string, update: Partial<RenovacaoV2>): Promise<RenovacaoV2> {
  const data = await apiFetch<{ ok: boolean; renovacao: RenovacaoV2 }>(`/renovacoes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  })
  return data.renovacao
}

export async function bulkUpdateRenovacoes(ids: string[], update: Partial<RenovacaoV2>): Promise<number> {
  const data = await apiFetch<{ ok: boolean; updated: number }>('/renovacoes/bulk', {
    method: 'PATCH',
    body: JSON.stringify({ ids, update }),
  })
  return data.updated ?? 0
}

export async function softDeleteRenovacao(id: string, deletedBy: string | null): Promise<void> {
  await apiFetch(`/renovacoes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      deleted_at: new Date().toISOString(),
      deleted_by: deletedBy,
      motivo_exclusao: 'Excluído manualmente pela tela de renovações',
    }),
  })
}

export async function bulkSoftDeleteRenovacoes(ids: string[], deletedBy: string | null): Promise<void> {
  await apiFetch('/renovacoes/bulk', {
    method: 'PATCH',
    body: JSON.stringify({
      ids,
      update: {
        deleted_at: new Date().toISOString(),
        deleted_by: deletedBy,
        motivo_exclusao: 'Excluído manualmente em lote pela tela de renovações',
      },
    }),
  })
}

export async function criarLeadKanban(renovacaoId: string, lead: {
  nome_lead: string | null
  whatsapp_lead: string | null
  motivo_contato: string
  anotacoes: string | null
}): Promise<void> {
  await apiFetch(`/renovacoes/${renovacaoId}/lead`, {
    method: 'POST',
    body: JSON.stringify({ ...lead, status: 'iniciou_conversa', inicio_atendimento: new Date().toISOString() }),
  })
}

export async function cancelarFollowUps(renovacaoId: string): Promise<void> {
  await apiFetch(`/renovacoes/${renovacaoId}/followups`, { method: 'DELETE' })
}

// ── WhatsApp ──────────────────────────────────────────────────

export async function sendWhatsApp(phone: string, body: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const data = await apiFetch<{ ok: boolean; error?: string }>('/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ phone, body }),
    })
    return data
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

// ── Templates ─────────────────────────────────────────────────

export async function fetchTemplates(): Promise<CommunicationTemplate[]> {
  const data = await apiFetch<{ ok: boolean; templates: CommunicationTemplate[] }>('/communication/templates')
  return data.templates ?? []
}

export async function saveTemplate(tpl: Partial<CommunicationTemplate> & { name: string; channel: 'whatsapp' | 'email'; body: string; template_key: string }): Promise<CommunicationTemplate> {
  if (tpl.id) {
    const data = await apiFetch<{ ok: boolean; template: CommunicationTemplate }>(`/communication/templates/${tpl.id}`, {
      method: 'PUT',
      body: JSON.stringify(tpl),
    })
    return data.template
  }
  const data = await apiFetch<{ ok: boolean; template: CommunicationTemplate }>('/communication/templates', {
    method: 'POST',
    body: JSON.stringify(tpl),
  })
  return data.template
}

export async function deleteTemplate(id: string): Promise<void> {
  await apiFetch(`/communication/templates/${id}`, { method: 'DELETE' })
}

export async function setTemplatePadrao(id: string, channel: string, ativo: boolean): Promise<CommunicationTemplate> {
  const data = await apiFetch<{ ok: boolean; template: CommunicationTemplate }>(`/communication/templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ ativo }),
  })
  return data.template
}

// ── Automation Rules ──────────────────────────────────────────

export async function fetchAutoRules(): Promise<AutomationRule[]> {
  const data = await apiFetch<{ ok: boolean; rules: AutomationRule[] }>(
    '/automation/rules?keys=ren30,ren15,ren7,followup',
  )
  return data.rules ?? []
}

export async function toggleAutomationRule(id: string, ativo: boolean): Promise<AutomationRule> {
  const data = await apiFetch<{ ok: boolean; rule: AutomationRule }>(`/automation/rules/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ ativo }),
  })
  return data.rule
}

// ── Links Produtos ────────────────────────────────────────────

export async function fetchLinks(): Promise<LinkProduto[]> {
  const data = await apiFetch<{ ok: boolean; links: LinkProduto[] }>('/links-produtos')
  return data.links ?? []
}

export async function saveLink(link: Partial<LinkProduto> & { tipo_certificado: string }): Promise<LinkProduto> {
  if (link.id) {
    const data = await apiFetch<{ ok: boolean; link: LinkProduto }>(`/links-produtos/${link.id}`, {
      method: 'PUT',
      body: JSON.stringify(link),
    })
    return data.link
  }
  const data = await apiFetch<{ ok: boolean; link: LinkProduto }>('/links-produtos', {
    method: 'POST',
    body: JSON.stringify(link),
  })
  return data.link
}

export async function deleteLink(id: string): Promise<void> {
  await apiFetch(`/links-produtos/${id}`, { method: 'DELETE' })
}

// ── N8N webhook URL (via external integrations) ───────────────

export async function fetchN8nWebhookUrl(): Promise<string | null> {
  try {
    const data = await apiFetch<{ ok: boolean; integrations: { provider: string; webhook_url: string | null }[] }>('/integrations')
    return data.integrations?.find(i => i.provider === 'n8n')?.webhook_url ?? null
  } catch {
    return null
  }
}

// ── Status helpers ────────────────────────────────────────────

export function enrichRenovacao(r: RenovacaoV2): RenovacaoV2 {
  // pg retorna DATE como ISO datetime "2026-07-02T03:00:00.000Z" — normaliza para "YYYY-MM-DD"
  const dateStr = (r.data_vencimento ?? '').slice(0, 10)
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const venc = new Date(dateStr + 'T00:00:00'); venc.setHours(0, 0, 0, 0)
  const dias = Math.round((venc.getTime() - hoje.getTime()) / 86400000)
  return {
    ...r,
    data_vencimento: dateStr,
    dias_restantes: dias,
    prioridade: dias <= 7 ? 'urgente' : dias <= 15 ? 'media' : 'normal',
  }
}

export type { StatusRenovacao }
