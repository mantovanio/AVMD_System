import { useEffect, useState, useCallback } from 'react'
import { getApiUrl, useLegacySupabase } from '@/lib/api'
import type { Page } from '@/components/Sidebar'

export interface SystemNotification {
  id:        string
  type:      'novo_usuario' | 'mensagem_pendente' | 'renovacao_vencendo'
  title:     string
  body:      string
  page:      Page
  createdAt: string
}

export function useNotifications(isAdmin: boolean) {
  const [notifications, setNotifications] = useState<SystemNotification[]>([])

  const fetchAll = useCallback(async () => {
    if (useLegacySupabase()) {
      const { supabase } = await import('@/lib/supabase')
      return fetchLegacyNotifications(supabase, isAdmin, setNotifications)
    }

    const items: SystemNotification[] = []

    if (isAdmin) {
      try {
        const r = await fetch(getApiUrl('/admin/users'))
        const data = await r.json().catch(() => null)
        const users = (data?.users ?? []) as Array<{ id: string; nome?: string; email?: string; status?: string; created_at?: string }>
        for (const u of users.filter(u => u.status === 'inativo')) {
          items.push({
            id: `usuario_${u.id}`,
            type: 'novo_usuario',
            title: 'Novo cadastro aguardando aprovacao',
            body: u.nome ?? u.email ?? 'Usuario sem nome',
            page: 'configuracoes',
            createdAt: u.created_at ?? new Date().toISOString(),
          })
        }
      } catch { /* ignore */ }
    }

    try {
      const r = await fetch(getApiUrl('/chat/crm/conversations?status=pending&limit=20'))
      const data = await r.json().catch(() => null)
      const convs = (data?.conversations ?? []) as Array<{ id: string; cliente_nome?: string; nome_crm?: string; telefone?: string; document_key?: string; fila?: string; atendimento_humano?: boolean; ultima_interacao_em?: string; ultima_mensagem_direcao?: string }>
      for (const conv of convs.filter(c => c.ultima_mensagem_direcao === 'incoming')) {
        const nome = conv.cliente_nome ?? conv.nome_crm ?? conv.telefone ?? conv.document_key ?? 'Contato sem identificacao'
        items.push({
          id: `inbox_${conv.id}`,
          type: 'mensagem_pendente',
          title: conv.atendimento_humano ? 'Mensagem pendente em atendimento humano' : 'Mensagem nova no inbox CRM',
          body: `${nome} - fila ${conv.fila === 'renovacao' ? 'renovacao' : 'atendimento'}`,
          page: 'chat',
          createdAt: conv.ultima_interacao_em ?? new Date().toISOString(),
        })
      }
    } catch { /* ignore */ }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    setNotifications(items)
  }, [isAdmin])

  useEffect(() => {
    void fetchAll()
    const interval = setInterval(() => void fetchAll(), 60_000)
    return () => clearInterval(interval)
  }, [fetchAll])

  return { notifications, refetch: fetchAll }
}

async function fetchLegacyNotifications(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  isAdmin: boolean,
  setNotifications: (items: SystemNotification[]) => void,
) {
  const items: SystemNotification[] = []

  if (isAdmin) {
    const { data: pendentes } = await supabase
      .from('profiles')
      .select('id, nome, email, created_at')
      .eq('status', 'inativo')
      .order('created_at', { ascending: false })

    for (const u of pendentes ?? []) {
      items.push({
        id: `usuario_${u.id}`, type: 'novo_usuario',
        title: 'Novo cadastro aguardando aprovacao',
        body: u.nome ?? u.email ?? 'Usuario sem nome',
        page: 'configuracoes', createdAt: u.created_at,
      })
    }
  }

  const { data: inboxPendentes } = await supabase
    .from('crm_chat_admin_view')
    .select('id, cliente_nome, nome_crm, telefone, document_key, fila, atendimento_humano, ultima_interacao_em, ultima_mensagem_direcao')
    .eq('ultima_mensagem_direcao', 'incoming')
    .order('ultima_interacao_em', { ascending: false })
    .limit(20)

  for (const conv of inboxPendentes ?? []) {
    const nome = conv.cliente_nome ?? conv.nome_crm ?? conv.telefone ?? conv.document_key ?? 'Contato sem identificacao'
    items.push({
      id: `inbox_${conv.id}`, type: 'mensagem_pendente',
      title: conv.atendimento_humano ? 'Mensagem pendente em atendimento humano' : 'Mensagem nova no inbox CRM',
      body: `${nome} - fila ${conv.fila === 'renovacao' ? 'renovacao' : 'atendimento'}`,
      page: 'chat', createdAt: conv.ultima_interacao_em,
    })
  }

  const hoje = new Date()
  const em30 = new Date(hoje); em30.setDate(hoje.getDate() + 30)
  const { data: renovacoes } = await supabase
    .from('renovacoes')
    .select('id, nome_titular, data_vencimento')
    .eq('status', 'pendente')
    .lte('data_vencimento', em30.toISOString().slice(0, 10))
    .gte('data_vencimento', hoje.toISOString().slice(0, 10))
    .order('data_vencimento', { ascending: true })
    .limit(5)

  if ((renovacoes ?? []).length > 0) {
    items.push({
      id: 'renovacoes_vencendo', type: 'renovacao_vencendo',
      title: 'Renovacoes vencendo em breve',
      body: `${renovacoes!.length} certificado${renovacoes!.length !== 1 ? 's' : ''} vencem nos proximos 30 dias`,
      page: 'renovacoes', createdAt: new Date().toISOString(),
    })
  }

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  setNotifications(items)
}
