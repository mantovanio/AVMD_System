import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  AlertTriangle, Bell, Check, CheckCircle, Clock,
  Download, Edit3, Eye, EyeOff, ExternalLink, Link2, Loader2, Mail, MessageSquare, Plus,
  RefreshCw, Save, Send, Trash2, Upload, Users, X, Zap,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { queueEmailMessage, renderTemplate } from '@/lib/communication'
import { loadActiveWhatsAppIntegration } from '@/lib/whatsappIntegration'
import { openCentralChat } from '@/lib/chatNavigation'

const EDGE_FN = 'https://api.certiid.mantovan.com.br/functions/v1/evolution-webhook'

async function sendWhatsAppDirect(phone: string, body: string, accessToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const integration = await loadActiveWhatsAppIntegration()
    if (!integration?.base_url || !integration?.api_token || !integration?.instance_name) {
      return { ok: false, error: 'Integracao WhatsApp nao configurada. Verifique em Configuracoes.' }
    }
    const res = await fetch(EDGE_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({
        _action: 'send_message',
        base_url: integration.base_url,
        api_token: integration.api_token,
        instance_name: integration.instance_name,
        number: phone,
        content: body,
        queue_override: 'renovacao',
      }),
    })
    const payload = await res.json() as { ok?: boolean; error?: string }
    if (!res.ok || !payload.ok) return { ok: false, error: payload.error ?? 'Falha no envio' }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
import { useAuth } from '@/contexts/AuthContext'
import { hasPerfil, isAdminProfile } from '@/lib/security'
import * as XLSX from 'xlsx'
import type {
  AutomationRule, CommunicationTemplate, LinkProduto,
  PrioridadeRenovacao, RenovacaoV2, StatusRenovacao,
} from '@/types'

// ── constants ─────────────────────────────────────────────────

const PRIORIDADE_CONFIG: Record<PrioridadeRenovacao, {
  label: string; color: string; bg: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}> = {
  urgente: { label: 'Urgente (≤ 7 dias)',  color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-900/10',       icon: AlertTriangle },
  media:   { label: 'Médio (8–15 dias)',   color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-900/10', icon: Clock         },
  normal:  { label: 'Normal (16–30 dias)', color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/10',     icon: CheckCircle   },
}

const STATUS_CONFIG: Record<StatusRenovacao, { label: string; cls: string }> = {
  pendente:   { label: 'Pendente',      cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'        },
  contatado:  { label: 'Contatado',     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'     },
  convertido: { label: 'Renovado',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  perdido:    { label: 'Não Renovado',  cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'         },
}

// ── Extração de primeiro nome ─────────────────────────────────────────────────
// Primeiros nomes que formam nome composto no Brasil (ex: Ana Clara, João Vitor)
const PREFIXOS_COMPOSTOS = new Set([
  'ANA', 'ANNA', 'ANNE',
  'MARIA',
  'JOAO', 'JOÃO',
  'JOSE', 'JOSÉ',
  'LUIZ', 'LUIS', 'LUISA', 'LUÍSA',
  'MARCO', 'MARCOS',
  'PEDRO',
  'PAULO',
  'CARLOS',
  'VITOR', 'VICTOR',
  'LAURA',
  'CLARA',
])

// Palavras que NÃO são parte do primeiro nome (conectores e sufixos genealógicos)
const NAO_NOME = new Set([
  'DA', 'DE', 'DO', 'DAS', 'DOS', 'DI', 'D', 'E',
  'FILHO', 'FILHA', 'JUNIOR', 'JÚNIOR', 'JR',
  'NETO', 'SOBRINHO', 'BISNETO',
])

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/**
 * Retorna o primeiro nome (ou nome composto) de uma pessoa.
 * Para empresas (cnpj preenchido) retorna o nome completo sem alteração.
 * Exemplos PF: "ANA CLARA SILVA" → "Ana Clara"
 *              "JOAO VITOR PEREIRA" → "João Vitor"  (usa forma do cadastro)
 *              "MARIA JULIA SOUZA" → "Maria Julia"
 *              "CARLOS ALBERTO NETO" → "Carlos"  (Alberto não é prefixo composto)
 * Exemplo PJ: "VICCARE LTDA" → "Viccare Ltda"  (título, sem cortar)
 */
function extrairPrimeiroNome(nome: string | null | undefined, cnpj?: string | null): string {
  if (!nome) return ''
  const raw = nome.trim()
  if (!raw) return ''

  // Empresa: retorna nome completo em title case
  if (cnpj?.replace(/\D/g, '')) {
    return raw.split(/\s+/).map(titleCase).join(' ')
  }

  const palavras = raw.split(/\s+/)
  if (palavras.length === 0) return ''

  const p0 = palavras[0].toUpperCase()
  const p1 = palavras[1]?.toUpperCase()

  // Nome composto: primeira palavra é prefixo composto E segunda não é conector/sufixo
  if (p1 && PREFIXOS_COMPOSTOS.has(p0) && !NAO_NOME.has(p1)) {
    return titleCase(palavras[0]) + ' ' + titleCase(palavras[1])
  }

  return titleCase(palavras[0])
}
// ─────────────────────────────────────────────────────────────────────────────

const WHATSAPP_TPL_DEFAULT = 'Olá {{primeiro_nome}}, seu certificado {{tipo_certificado}} vence em {{dias_restantes}} dias ({{data_vencimento}}). Podemos ajudar com a renovação! 🔐'
const EMAIL_TPL_DEFAULT    = 'Olá {{primeiro_nome}},\n\nSeu certificado {{tipo_certificado}} vence em {{dias_restantes}} dias ({{data_vencimento}}).\n\nEntre em contato para renovar e evitar interrupções.\n\nEquipe AR CERTI ID'

// variáveis disponíveis para templates
const TEMPLATE_VARS = [
  { key: '{{cliente}}',          label: 'Cliente (nome completo)' },
  { key: '{{primeiro_nome}}',    label: 'Primeiro Nome'    },
  { key: '{{razao_social}}',     label: 'Razão Social'     },
  { key: '{{tipo_certificado}}', label: 'Produto'          },
  { key: '{{dias_restantes}}',   label: 'Dias p/ Vencer'   },
  { key: '{{data_vencimento}}',  label: 'Data Vencimento'  },
  { key: '{{valor}}',            label: 'Valor da Venda'   },
  { key: '{{pedido}}',           label: 'Nº Pedido'        },
  { key: '{{protocolo}}',        label: 'Protocolo'        },
  { key: '{{cpf}}',              label: 'CPF'              },
  { key: '{{cnpj}}',             label: 'CNPJ'             },
  { key: '{{agr}}',              label: 'AGR'              },
  { key: '{{vendedor}}',         label: 'Vendedor'         },
  { key: '{{contador}}',         label: 'Contador'         },
  { key: '{{link_renovacao}}',   label: 'Link Renovação'   },
  { key: '{{link_nova_emissao}}',label: 'Link Nova Emissão'},
]

function parseBrDate(s: string): string {
  const parts = s.trim().split('/')
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  return s
}

function normalizePhoneBR(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  // já tem DDI 55 e tamanho correto (12 = fixo, 13 = celular)
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`
  // só DDD + número (10 = fixo, 11 = celular)
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  // qualquer outro: apenas adiciona +
  return `+${digits}`
}

const CSV_FIELDS: { key: keyof RenovacaoV2 | 'produto'; label: string }[] = [
  { key: 'pedido',           label: 'Pedido'                       },
  { key: 'protocolo',        label: 'Protocolo'                    },
  { key: 'data_vencimento',  label: 'Data Vencimento'              },
  { key: 'cliente',          label: 'Cliente'                      },
  { key: 'email',            label: 'E-mail'                       },
  { key: 'telefone',         label: 'Telefone'                     },
  { key: 'produto',          label: 'Produto'                      },
  { key: 'valor',            label: 'Valor Venda'                  },
  { key: 'cpf',              label: 'CPF'                          },
  { key: 'cnpj',             label: 'CNPJ'                         },
  { key: 'razao_social',     label: 'Razao Social'                 },
  { key: 'agr',              label: 'AGR'                          },
  { key: 'vendedor',         label: 'Vendedor'                     },
  { key: 'contador',         label: 'Contador'                     },
]

type TplForm  = { name: string; channel: 'whatsapp' | 'email'; subject: string; body: string; template_key: string }
type LinkForm = { tipo_certificado: string; link_renovacao: string; link_nova_emissao: string; descricao: string }
type ContatoForm = {
  cliente: string
  email: string
  telefone: string
  cpf: string
  cnpj: string
  razao_social: string
  agr: string
  vendedor: string
  contador: string
  observacoes: string
}

const EMPTY_TPL:  TplForm  = { name: '', channel: 'whatsapp', subject: '', body: '', template_key: '' }
const EMPTY_LINK: LinkForm = { tipo_certificado: '', link_renovacao: '', link_nova_emissao: '', descricao: '' }
const EMPTY_CONTATO: ContatoForm = {
  cliente: '',
  email: '',
  telefone: '',
  cpf: '',
  cnpj: '',
  razao_social: '',
  agr: '',
  vendedor: '',
  contador: '',
  observacoes: '',
}

// ── helpers ───────────────────────────────────────────────────

function normalizeRowKeys(rows: Record<string, string>[]): Record<string, string>[] {
  if (rows.length === 0) return []
  const rawHeaders = Object.keys(rows[0] ?? {})
  const fieldKeys = CSV_FIELDS.map(f => f.key as string)
  const headerMap = rawHeaders.map(h => {
    const clean = h.trim().replace(/"/g, '')
    const byKey   = fieldKeys.find(k => k.toLowerCase() === clean.toLowerCase())
    const byLabel = CSV_FIELDS.find(f => f.label.toLowerCase().replace(/\s*\(.*\)/, '') === clean.toLowerCase())?.key as string | undefined
    return byKey ?? byLabel ?? clean.toLowerCase().replace(/\s+/g, '_')
  })
  return rows.map(row => Object.fromEntries(
    rawHeaders.map((header, index) => [headerMap[index], String(row[header] ?? '').trim()]),
  ))
}

function parseCSV(raw: string): Record<string, string>[] {
  const lines = raw.replace(/^﻿/, '').trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const rawHeaders = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const values: string[] = []
    let cur = ''; let inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { values.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    values.push(cur.trim())
    return Object.fromEntries(rawHeaders.map((h, i) => [h, (values[i] ?? '').replace(/"/g, '').trim()]))
  })
  return normalizeRowKeys(rows)
}

const SPREADSHEET_MAX_BYTES = 5 * 1024 * 1024 // 5 MB — mitiga ReDoS em xlsx

function parseSpreadsheet(buffer: ArrayBuffer, fileName: string): Record<string, string>[] {
  if (buffer.byteLength > SPREADSHEET_MAX_BYTES) {
    throw new Error('Arquivo muito grande. O limite para importação é 5 MB.')
  }
  if (fileName.toLowerCase().endsWith('.csv')) {
    return parseCSV(new TextDecoder('utf-8').decode(buffer))
  }
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) return []
  const sheet = workbook.Sheets[firstSheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, string | number | null>>(sheet, {
    defval: '',
    raw: false,
  })
  return normalizeRowKeys(rows.map(row =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value ?? '').trim()])),
  ))
}

function downloadSpreadsheetTemplate() {
  const rows = [
    CSV_FIELDS.map(f => f.label.replace(' (YYYY-MM-DD)', '')),
    ['001', 'PROT-2024-001', '2026-06-15', 'João Silva', 'joao@email.com', '11999999999', 'e-CPF A3', '219.90', '12345678900', '', '', 'AR001', 'Maria Vendedora', 'Carlos Contador'],
  ]
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'modelo_renovacoes.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function fmtCurrency(v: number | null) {
  return v ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'
}

// ── component ─────────────────────────────────────────────────

export default function Renovacoes() {
  const { profile } = useAuth()
  const isAdmin = isAdminProfile(profile)
  const canEditCadastro = hasPerfil(profile, 'admin', 'agente_registro')

  // ── list state ──────────────────────────────────────────────
  const [lista, setLista]           = useState<RenovacaoV2[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [filtro, setFiltro]         = useState<PrioridadeRenovacao | 'todos'>('todos')
  const [busca, setBusca]           = useState('')
  const [sendingId, setSendingId]   = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [toast, setToast]           = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  // ── bulk selection ───────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkSending, setBulkSending] = useState(false)

  // ── import CSV ───────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvRows, setCsvRows]       = useState<Record<string, string>[]>([])
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting]   = useState(false)
  const [editingContato, setEditingContato] = useState<RenovacaoV2 | null>(null)
  const [contatoForm, setContatoForm] = useState<ContatoForm>(EMPTY_CONTATO)
  const [savingContato, setSavingContato] = useState(false)

  // ── automation panel ─────────────────────────────────────────
  const [showAutomation, setShowAutomation] = useState(false)
  const [autoRules, setAutoRules]           = useState<AutomationRule[]>([])
  const [loadingRules, setLoadingRules]     = useState(false)

  // ── template editor ──────────────────────────────────────────
  const [showTemplates, setShowTemplates]   = useState(false)
  const [templates, setTemplates]           = useState<CommunicationTemplate[]>([])
  const [loadingTpls, setLoadingTpls]       = useState(false)
  const [editingTpl, setEditingTpl]         = useState<CommunicationTemplate | null>(null)
  const [tplForm, setTplForm]               = useState<TplForm>(EMPTY_TPL)
  const [savingTpl, setSavingTpl]           = useState(false)
  const [showPreview, setShowPreview]       = useState(true)
  const [previewId, setPreviewId]           = useState<string>('')
  const [selectedWaTplId, setSelectedWaTplId] = useState<string>('')
  const [selectedEmailTplId, setSelectedEmailTplId] = useState<string>('')
  const tplTextareaRef                      = useRef<HTMLTextAreaElement>(null)

  // ── links de produtos ─────────────────────────────────────────
  const [showLinks, setShowLinks]         = useState(false)
  const [links, setLinks]                 = useState<LinkProduto[]>([])
  const [loadingLinks, setLoadingLinks]   = useState(false)
  const [editingLink, setEditingLink]     = useState<LinkProduto | null>(null)
  const [linkForm, setLinkForm]           = useState<LinkForm>(EMPTY_LINK)
  const [savingLink, setSavingLink]       = useState(false)
  const linksMap = useMemo(() => new Map(links.map(l => [l.tipo_certificado, l])), [links])

  // ── auto-kanban via realtime ──────────────────────────────────
  const [autoKanban, setAutoKanban]       = useState(false)
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState<string | null>(null)
  const listaRef                          = useRef<RenovacaoV2[]>([])
  const autoKanbanRef                     = useRef(false)

  // ── chat flutuante removido — usa ChatInboxCRM via crm:navigate ──

  // ── toast ────────────────────────────────────────────────────

  function showMsg(msg: string, type: 'ok' | 'err' = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  // ── fetch ────────────────────────────────────────────────────

  const fetchRenovacoes = useCallback(async () => {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('renovacoes').select('*').is('deleted_at', null).order('data_vencimento', { ascending: true })
    if (err) { setError(err.message); setLoading(false); return }
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const enriched: RenovacaoV2[] = ((data ?? []) as Record<string, unknown>[]).map(r => {
      const venc = new Date(r.data_vencimento as string); venc.setHours(0, 0, 0, 0)
      const dias = Math.round((venc.getTime() - hoje.getTime()) / 86400000)
      return {
        id: r.id as string, cliente: r.cliente as string,
        telefone: (r.telefone as string | null) ?? null,
        email: (r.email as string | null) ?? null,
        tipo_certificado: r.tipo_certificado as string,
        data_vencimento: r.data_vencimento as string,
        valor: (r.valor as number | null) ?? null,
        status: r.status as StatusRenovacao,
        observacoes: (r.observacoes as string | null) ?? null,
        created_at: r.created_at as string,
        pedido: (r.pedido as string | null) ?? null,
        protocolo: (r.protocolo as string | null) ?? null,
        cpf: (r.cpf as string | null) ?? null,
        cnpj: (r.cnpj as string | null) ?? null,
        razao_social: (r.razao_social as string | null) ?? null,
        agr: (r.agr as string | null) ?? null,
        vendedor: (r.vendedor as string | null) ?? null,
        contador: (r.contador as string | null) ?? null,
        renovado: (r.renovado as boolean) ?? false,
        ultimo_lembrete: (r.ultimo_lembrete as string | null) ?? null,
        dias_restantes: dias,
        prioridade: dias <= 7 ? 'urgente' : dias <= 15 ? 'media' : 'normal',
        // campos v2
        venda_certificado_id:   (r.venda_certificado_id as string | null)   ?? null,
        produto_emitido_id:     (r.produto_emitido_id as string | null)     ?? null,
        cadastro_base_id:       (r.cadastro_base_id as string | null)       ?? null,
        empresa_id:             (r.empresa_id as string | null)             ?? null,
        titular_id:             (r.titular_id as string | null)             ?? null,
        vendedor_fk_id:         (r.vendedor_fk_id as string | null)         ?? null,
        agente_registro_fk_id:  (r.agente_registro_fk_id as string | null)  ?? null,
        contador_fk_id:         (r.contador_fk_id as string | null)         ?? null,
        snapshot_json:          (r.snapshot_json as Record<string, unknown>) ?? {},
        deleted_at:             (r.deleted_at as string | null)             ?? null,
        deleted_by:             (r.deleted_by as string | null)             ?? null,
        motivo_exclusao:        (r.motivo_exclusao as string | null)        ?? null,
      }
    })
    setLista(enriched)
    setLoading(false)
  }, [])

  const fetchAutoRules = useCallback(async () => {
    setLoadingRules(true)
    const { data } = await supabase.from('automation_rules').select('*')
      .in('rule_key', ['ren30','ren15','ren7','followup']).order('rule_key')
    setAutoRules((data ?? []) as AutomationRule[])
    setLoadingRules(false)
  }, [])

  const fetchTemplates = useCallback(async () => {
    setLoadingTpls(true)
    const { data } = await supabase.from('communication_templates').select('*').order('created_at')
    const nextTemplates = (data ?? []) as CommunicationTemplate[]
    setTemplates(nextTemplates)
    setSelectedWaTplId(prev => {
      const stillExists = nextTemplates.some(t => t.id === prev && t.channel === 'whatsapp')
      if (stillExists) return prev
      return nextTemplates.find(t => t.channel === 'whatsapp' && t.ativo)?.id
        ?? nextTemplates.find(t => t.channel === 'whatsapp')?.id
        ?? ''
    })
    setSelectedEmailTplId(prev => {
      const stillExists = nextTemplates.some(t => t.id === prev && t.channel === 'email')
      if (stillExists) return prev
      return nextTemplates.find(t => t.channel === 'email' && t.ativo)?.id
        ?? nextTemplates.find(t => t.channel === 'email')?.id
        ?? ''
    })
    setLoadingTpls(false)
  }, [])

  useEffect(() => { void fetchRenovacoes() }, [fetchRenovacoes])
  useEffect(() => { void fetchTemplates() }, [fetchTemplates])

  // mantém ref atualizada para uso no realtime sem stale closure
  useEffect(() => { listaRef.current = lista }, [lista])
  useEffect(() => { autoKanbanRef.current = autoKanban }, [autoKanban])

  // ── realtime: auto-kanban quando cliente responde ─────────────
  useEffect(() => {
    const channel = supabase.channel('auto-kanban-renovacoes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'communication_events' },
        async (payload) => {
          if (!autoKanbanRef.current) return
          const ev = payload.new as Record<string, unknown>
          if (ev.event_type !== 'message_received') return
          const phone = String(ev.contact ?? '').replace(/\D/g, '')
          if (!phone) return
          const match = listaRef.current.find(r =>
            r.telefone?.replace(/\D/g, '') === phone &&
            r.status !== 'contatado' && r.status !== 'convertido'
          )
          if (!match) return
          await supabase.from('leads_contabilidade').insert([{
            nome_lead:          match.razao_social ?? match.cliente,
            whatsapp_lead:      match.telefone,
            motivo_contato:     `Resposta automática — renovação: ${match.tipo_certificado}`,
            status:             'iniciou_conversa',
            inicio_atendimento: new Date().toISOString(),
            anotacoes: [
              match.cpf       && `CPF: ${match.cpf}`,
              match.cnpj      && `CNPJ: ${match.cnpj}`,
              match.pedido    && `Pedido: ${match.pedido}`,
              match.protocolo && `Protocolo: ${match.protocolo}`,
            ].filter(Boolean).join(' | ') || null,
          }])
          await supabase.from('renovacoes').update({ status: 'contatado' }).eq('id', match.id)
          setLista(prev => prev.map(r => r.id === match.id ? { ...r, status: 'contatado' } : r))
          setToast({ msg: `Resposta recebida! Lead criado: ${match.razao_social ?? match.cliente}`, type: 'ok' })
          setTimeout(() => setToast(null), 5000)
        })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── fetches complementares ────────────────────────────────────

  const fetchLinks = useCallback(async () => {
    setLoadingLinks(true)
    const { data } = await supabase.from('links_produtos').select('*').order('tipo_certificado')
    setLinks((data ?? []) as LinkProduto[])
    setLoadingLinks(false)
  }, [])

  const fetchN8nWebhookUrl = useCallback(async () => {
    const { data } = await supabase
      .from('external_integrations').select('webhook_url').eq('provider', 'n8n').maybeSingle()
    setN8nWebhookUrl((data as { webhook_url: string | null } | null)?.webhook_url ?? null)
  }, [])


  function openChat(r: RenovacaoV2) {
    if (!r.telefone) { showMsg('Cliente sem telefone para chat.', 'err'); return }
    const tpl = getSelectedTpl('whatsapp')
    const msgTemplate = renderTemplate(tpl?.body ?? WHATSAPP_TPL_DEFAULT, tplValues(r))
    openCentralChat({
      phone: r.telefone,
      contactName: r.razao_social ?? r.cliente ?? '',
      firstMessage: msgTemplate,
      context: {
        tipo_certificado: r.tipo_certificado,
        data_vencimento: new Date(r.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR'),
        dias_restantes: r.dias_restantes,
        pedido: r.pedido ?? '',
        protocolo: r.protocolo ?? '',
        valor: r.valor != null ? `R$ ${r.valor.toFixed(2).replace('.', ',')}` : '',
      },
    })
  }

  // ── template values (for rendering) ─────────────────────────

  function tplValues(r: RenovacaoV2): Record<string, string | number> {
    const linkData = linksMap.get(r.tipo_certificado)
    const nomeCompleto = r.razao_social ?? r.cliente
    return {
      cliente:           nomeCompleto,
      primeiro_nome:     extrairPrimeiroNome(nomeCompleto, r.cnpj),
      razao_social:      r.razao_social ?? '',
      tipo_certificado:  r.tipo_certificado,
      dias_restantes:    r.dias_restantes,
      data_vencimento:   new Date(r.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR'),
      valor:             fmtCurrency(r.valor),
      pedido:            r.pedido ?? '',
      protocolo:         r.protocolo ?? '',
      cpf:               r.cpf ?? '',
      cnpj:              r.cnpj ?? '',
      agr:               r.agr ?? '',
      vendedor:          r.vendedor ?? '',
      contador:          r.contador ?? '',
      link_renovacao:    linkData?.link_renovacao    ?? '',
      link_nova_emissao: linkData?.link_nova_emissao ?? '',
    }
  }

  // ── active templates ─────────────────────────────────────────

  function getSelectedTpl(channel: 'whatsapp' | 'email') {
    const selectedId = channel === 'whatsapp' ? selectedWaTplId : selectedEmailTplId
    return templates.find(t => t.id === selectedId && t.channel === channel)
      ?? templates.find(t => t.channel === channel && t.ativo)
      ?? templates.find(t => t.channel === channel)
  }

  // ── individual send ──────────────────────────────────────────

  async function criarLeadKanban(r: RenovacaoV2) {
    const anotacoes = [
      r.cpf       && `CPF: ${r.cpf}`,
      r.cnpj      && `CNPJ: ${r.cnpj}`,
      r.pedido    && `Pedido: ${r.pedido}`,
      r.protocolo && `Protocolo: ${r.protocolo}`,
      r.agr       && `AGR: ${r.agr}`,
      r.vendedor  && `Vendedor: ${r.vendedor}`,
      r.contador  && `Contador: ${r.contador}`,
    ].filter(Boolean).join(' | ') || null
    const { error } = await supabase.from('leads_contabilidade').insert([{
      nome_lead: r.razao_social ?? r.cliente,
      whatsapp_lead: r.telefone,
      motivo_contato: `Renovação: ${r.tipo_certificado} — vence em ${r.dias_restantes}d`,
      status: 'iniciou_conversa',
      inicio_atendimento: new Date().toISOString(),
      anotacoes,
    }])
    if (error) showMsg('Erro ao criar lead: ' + error.message, 'err')
    else showMsg(`Lead criado no Kanban: ${r.razao_social ?? r.cliente}`)
  }

  async function atualizarStatus(id: string, status: StatusRenovacao) {
    await supabase.from('renovacoes').update({ status }).eq('id', id)
    setLista(prev => prev.map(r => r.id === id ? { ...r, status } : r))
  }

  async function marcarRenovado(r: RenovacaoV2) {
    const s: StatusRenovacao = r.status === 'convertido' ? 'pendente' : 'convertido'
    setUpdatingId(r.id)
    await supabase.from('renovacoes').update({ status: s, renovado: s === 'convertido' }).eq('id', r.id)
    setLista(prev => prev.map(x => x.id === r.id ? { ...x, status: s, renovado: s === 'convertido' } : x))
    setUpdatingId(null)
    showMsg(s === 'convertido' ? 'Marcado como Renovado!' : 'Marcação removida.')
  }

  async function marcarNaoRenovado(r: RenovacaoV2) {
    const s: StatusRenovacao = r.status === 'perdido' ? 'pendente' : 'perdido'
    setUpdatingId(r.id)
    await supabase.from('renovacoes').update({ status: s }).eq('id', r.id)
    setLista(prev => prev.map(x => x.id === r.id ? { ...x, status: s } : x))
    setUpdatingId(null)
    showMsg(s === 'perdido' ? 'Marcado como Não Renovado.' : 'Marcação removida.')
  }

  async function enviarWhatsApp(r: RenovacaoV2) {
    if (!r.telefone) { showMsg('Cliente sem telefone.', 'err'); return }
    setSendingId(r.id)
    const tpl = getSelectedTpl('whatsapp')
    const body = renderTemplate(tpl?.body ?? WHATSAPP_TPL_DEFAULT, tplValues(r))
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) { setSendingId(null); showMsg('Sessao expirada. Atualize a pagina.', 'err'); return }
    const result = await sendWhatsAppDirect(r.telefone, body, accessToken)
    if (!result.ok) { setSendingId(null); showMsg('Erro WhatsApp: ' + result.error, 'err'); return }
    await atualizarStatus(r.id, 'contatado')
    const agora = new Date().toISOString()
    await supabase.from('renovacoes').update({ ultimo_lembrete: agora }).eq('id', r.id)
    setLista(prev => prev.map(x => x.id === r.id ? { ...x, ultimo_lembrete: agora } : x))
    await criarLeadKanban(r)
    setSendingId(null)
    showMsg('WhatsApp enviado com sucesso!')
  }

  async function enviarEmail(r: RenovacaoV2) {
    if (!r.email) { showMsg('Cliente sem e-mail.', 'err'); return }
    setSendingId(r.id)
    const tpl     = getSelectedTpl('email')
    const body    = renderTemplate(tpl?.body ?? EMAIL_TPL_DEFAULT, tplValues(r))
    const subject = renderTemplate(tpl?.subject ?? 'Renovação do seu certificado digital', tplValues(r))
    const { error } = await queueEmailMessage({ to: r.email, subject, body, payload: { renovacao_id: r.id, tipo: 'renovacao' } })
    if (error) { setSendingId(null); showMsg('Erro e-mail: ' + error, 'err'); return }
    await atualizarStatus(r.id, 'contatado')
    await supabase.from('renovacoes').update({ ultimo_lembrete: new Date().toISOString() }).eq('id', r.id)
    setLista(prev => prev.map(x => x.id === r.id ? { ...x, ultimo_lembrete: new Date().toISOString() } : x))
    await criarLeadKanban(r)
    setSendingId(null)
  }

  // ── bulk selection helpers ───────────────────────────────────

  function toggleSelectAll() {
    if (selectedIds.size === listagem.length && listagem.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(listagem.map(r => r.id)))
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── bulk actions ─────────────────────────────────────────────

  async function bulkEnviarWhatsApp() {
    const alvos = listagem.filter(r => selectedIds.has(r.id) && r.telefone)
    if (!alvos.length) { showMsg('Nenhum selecionado com telefone.', 'err'); return }
    const tpl = getSelectedTpl('whatsapp')
    setBulkSending(true)
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) { setBulkSending(false); showMsg('Sessao expirada. Atualize a pagina.', 'err'); return }
    let enviados = 0
    let erros = 0
    for (const r of alvos) {
      const body = renderTemplate(tpl?.body ?? WHATSAPP_TPL_DEFAULT, tplValues(r))
      const result = await sendWhatsAppDirect(r.telefone!, body, accessToken)
      if (result.ok) {
        enviados++
        await atualizarStatus(r.id, 'contatado')
        await supabase.from('renovacoes').update({ ultimo_lembrete: new Date().toISOString() }).eq('id', r.id)
      } else {
        erros++
        logger.warn('Renovacoes', `Erro envio WA para ${r.telefone}: ${result.error}`)
      }
      // Pausa entre envios para não sobrecarregar a Evolution
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
    setBulkSending(false)
    showMsg(`${enviados} enviados${erros > 0 ? `, ${erros} com erro` : ''}.`)
  }

  async function bulkEnviarEmail() {
    const alvos = listagem.filter(r => selectedIds.has(r.id) && r.email)
    if (!alvos.length) { showMsg('Nenhum selecionado com e-mail.', 'err'); return }
    const tpl  = getSelectedTpl('email')
    setBulkSending(true)
    const base = Date.now()
    await Promise.all(alvos.map((r, i) => queueEmailMessage({
      to: r.email!,
      subject: renderTemplate(tpl?.subject ?? 'Renovação do seu certificado digital', tplValues(r)),
      body:    renderTemplate(tpl?.body ?? EMAIL_TPL_DEFAULT, tplValues(r)),
      payload: { renovacao_id: r.id, tipo: 'renovacao_lote' },
      scheduledFor: new Date(base + i * 1500).toISOString(),
    })))
    setBulkSending(false)
    showMsg(`${alvos.length} e-mails enfileirados.`)
  }

  async function bulkMarcarRenovado() {
    const ids = [...selectedIds]
    setBulkSending(true)
    await supabase.from('renovacoes').update({ status: 'convertido', renovado: true }).in('id', ids)
    setLista(prev => prev.map(r => ids.includes(r.id) ? { ...r, status: 'convertido', renovado: true } : r))
    setSelectedIds(new Set())
    setBulkSending(false)
    showMsg(`${ids.length} marcado(s) como Renovado.`)
  }

  async function bulkMarcarNaoRenovado() {
    const ids = [...selectedIds]
    setBulkSending(true)
    await supabase.from('renovacoes').update({ status: 'perdido' }).in('id', ids)
    setLista(prev => prev.map(r => ids.includes(r.id) ? { ...r, status: 'perdido' } : r))
    setSelectedIds(new Set())
    setBulkSending(false)
    showMsg(`${ids.length} marcado(s) como Não Renovado.`)
  }

  async function bulkKanban() {
    const alvos = listagem.filter(r => selectedIds.has(r.id))
    setBulkSending(true)
    for (const r of alvos) await criarLeadKanban(r)
    setBulkSending(false)
    setSelectedIds(new Set())
    showMsg(`${alvos.length} lead(s) criado(s) no Kanban.`)
  }

  async function enviarMassa() {
    const alvos = listagem.filter(r => r.telefone && r.status !== 'convertido' && r.status !== 'perdido')
    if (!alvos.length) { showMsg('Nenhum cliente elegível com telefone.', 'err'); return }
    const tpl = getSelectedTpl('whatsapp')
    setSendingId('massa')
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) { setSendingId(null); showMsg('Sessao expirada. Atualize a pagina.', 'err'); return }
    let enviados = 0
    let falhas = 0
    for (const r of alvos) {
      const body = renderTemplate(tpl?.body ?? WHATSAPP_TPL_DEFAULT, tplValues(r))
      const result = await sendWhatsAppDirect(r.telefone!, body, accessToken)
      if (result.ok) {
        enviados++
        await atualizarStatus(r.id, 'contatado')
        await supabase.from('renovacoes').update({ ultimo_lembrete: new Date().toISOString() }).eq('id', r.id)
      } else {
        falhas++
      }
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
    setSendingId(null)
    const tempoTotal = Math.ceil((alvos.length * 1.5) / 60)
    showMsg(
      falhas > 0 ? `${enviados} enviados, ${falhas} falharam.` : `${enviados} WhatsApps enviados (~${tempoTotal} min).`,
      falhas > 0 ? 'err' : 'ok'
    )
  }

  async function cancelarFollowUps(renovacaoId: string) {
    await supabase
      .from('communication_outbox')
      .delete()
      .filter('payload->>renovacao_id', 'eq', renovacaoId)
      .filter('payload->>tipo', 'eq', 'renovacao_followup_auto')
      .gte('scheduled_for', new Date().toISOString())
    showMsg('Avisos agendados cancelados.')
  }

  async function toggleAutomation(rule: AutomationRule) {
    const { error } = await supabase.from('automation_rules').update({ ativo: !rule.ativo }).eq('id', rule.id)
    if (error) { showMsg('Erro ao atualizar regra.', 'err'); return }
    setAutoRules(prev => prev.map(r => r.id === rule.id ? { ...r, ativo: !r.ativo } : r))
  }

  // ── links CRUD ───────────────────────────────────────────────

  function abrirEditarLink(link: LinkProduto) {
    setEditingLink(link)
    setLinkForm({
      tipo_certificado:  link.tipo_certificado,
      link_renovacao:    link.link_renovacao    ?? '',
      link_nova_emissao: link.link_nova_emissao ?? '',
      descricao:         link.descricao         ?? '',
    })
  }

  function abrirNovoLink() {
    setEditingLink(null)
    setLinkForm({ ...EMPTY_LINK })
  }

  async function salvarLink() {
    if (!linkForm.tipo_certificado.trim()) return
    setSavingLink(true)
    const payload = {
      tipo_certificado:  linkForm.tipo_certificado.trim(),
      link_renovacao:    linkForm.link_renovacao.trim()    || null,
      link_nova_emissao: linkForm.link_nova_emissao.trim() || null,
      descricao:         linkForm.descricao.trim()         || null,
      ativo: true,
    }
    const { error } = editingLink
      ? await supabase.from('links_produtos').update(payload).eq('id', editingLink.id)
      : await supabase.from('links_produtos').insert([payload])
    setSavingLink(false)
    if (error) { showMsg('Erro ao salvar link: ' + error.message, 'err'); return }
    showMsg('Link salvo!')
    setEditingLink(null)
    setLinkForm({ ...EMPTY_LINK })
    void fetchLinks()
  }

  async function deletarLink(link: LinkProduto) {
    if (!confirm(`Excluir links de "${link.tipo_certificado}"?`)) return
    await supabase.from('links_produtos').delete().eq('id', link.id)
    setLinks(prev => prev.filter(l => l.id !== link.id))
    if (editingLink?.id === link.id) { setEditingLink(null); setLinkForm({ ...EMPTY_LINK }) }
    showMsg('Link excluído.')
  }

  function toggleAutoKanban() {
    const next = !autoKanban
    setAutoKanban(next)
    showMsg(next ? 'Auto-Kanban ativado! Respostas criarão leads automaticamente.' : 'Auto-Kanban desativado.')
  }

  // ── template CRUD ────────────────────────────────────────────

  function abrirNovoTemplate() {
    setEditingTpl(null)
    setTplForm({ ...EMPTY_TPL })
  }

  function abrirEditarTemplate(tpl: CommunicationTemplate) {
    setEditingTpl(tpl)
    setTplForm({ name: tpl.name, channel: tpl.channel, subject: tpl.subject ?? '', body: tpl.body, template_key: tpl.template_key })
  }

  async function salvarTemplate() {
    if (!tplForm.name.trim() || !tplForm.body.trim()) return
    setSavingTpl(true)
    const key     = tplForm.template_key.trim() || tplForm.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    const payload = {
      name:         tplForm.name.trim(),
      channel:      tplForm.channel,
      subject:      tplForm.channel === 'email' ? (tplForm.subject || null) : null,
      body:         tplForm.body.trim(),
      template_key: key,
      ativo:        true,
    }
    const { error } = editingTpl
      ? await supabase.from('communication_templates').update(payload).eq('id', editingTpl.id)
      : await supabase.from('communication_templates').insert([payload])
    setSavingTpl(false)
    if (error) { showMsg('Erro ao salvar: ' + error.message, 'err'); return }
    showMsg('Template salvo!')
    setEditingTpl(null)
    setTplForm({ ...EMPTY_TPL })
    void fetchTemplates()
  }

  async function deletarTemplate(tpl: CommunicationTemplate) {
    if (!confirm(`Excluir template "${tpl.name}"?`)) return
    await supabase.from('communication_templates').delete().eq('id', tpl.id)
    setTemplates(prev => prev.filter(t => t.id !== tpl.id))
    if (editingTpl?.id === tpl.id) { setEditingTpl(null); setTplForm({ ...EMPTY_TPL }) }
    showMsg('Template excluído.')
  }

  async function definirTemplatePadrao(tpl: CommunicationTemplate, ativo: boolean) {
    if (ativo) {
      const sameChannelIds = templates.filter(t => t.channel === tpl.channel).map(t => t.id)
      if (sameChannelIds.length > 0) {
        const { error: clearError } = await supabase.from('communication_templates')
          .update({ ativo: false }).in('id', sameChannelIds)
        if (clearError) { showMsg('Erro ao atualizar templates: ' + clearError.message, 'err'); return }
      }
      if (tpl.channel === 'whatsapp') setSelectedWaTplId(tpl.id)
      else setSelectedEmailTplId(tpl.id)
    } else {
      if (tpl.channel === 'whatsapp' && selectedWaTplId === tpl.id) setSelectedWaTplId('')
      if (tpl.channel === 'email' && selectedEmailTplId === tpl.id) setSelectedEmailTplId('')
    }
    const { error } = await supabase.from('communication_templates').update({ ativo }).eq('id', tpl.id)
    if (error) { showMsg('Erro ao atualizar template: ' + error.message, 'err'); return }
    await fetchTemplates()
    showMsg(ativo ? 'Template marcado como padrão.' : 'Template desmarcado.')
  }

  function toggleTplSelection(tpl: CommunicationTemplate) {
    if (tpl.channel === 'whatsapp') {
      setSelectedWaTplId(prev => prev === tpl.id ? '' : tpl.id)
    } else {
      setSelectedEmailTplId(prev => prev === tpl.id ? '' : tpl.id)
    }
  }

  // insere variável na posição do cursor no textarea
  function insertVar(varKey: string) {
    const el = tplTextareaRef.current
    if (!el) { setTplForm(prev => ({ ...prev, body: prev.body + varKey })); return }
    const start = el.selectionStart
    const end   = el.selectionEnd
    const newBody = tplForm.body.slice(0, start) + varKey + tplForm.body.slice(end)
    setTplForm(prev => ({ ...prev, body: newBody }))
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + varKey.length
      el.focus()
    })
  }

  // ── import CSV ───────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const result = ev.target?.result
      if (!(result instanceof ArrayBuffer)) return
      setCsvRows(parseSpreadsheet(result, file.name))
      setShowImport(true)
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function excluirRenovacao(r: RenovacaoV2) {
    if (!isAdmin) { showMsg('Somente administradores podem excluir registros.', 'err'); return }
    if (!confirm(`Excluir "${r.razao_social ?? r.cliente}" da lista de renovações?`)) return
    const { data } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('renovacoes')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: data.user?.id ?? null,
        motivo_exclusao: 'Excluído manualmente pela tela de renovações',
      })
      .eq('id', r.id)
    if (error) { showMsg('Erro ao excluir renovação: ' + error.message, 'err'); return }
    setLista(prev => prev.filter(item => item.id !== r.id))
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(r.id)
      return next
    })
    showMsg('Renovação excluída da lista.')
  }

  async function bulkExcluirRenovacoes() {
    if (!isAdmin) { showMsg('Somente administradores podem excluir registros.', 'err'); return }
    const ids = [...selectedIds]
    if (!ids.length) return
    if (!confirm(`Excluir ${ids.length} renovação(ões) selecionada(s)?`)) return
    setBulkSending(true)
    const { data } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('renovacoes')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: data.user?.id ?? null,
        motivo_exclusao: 'Excluído manualmente em lote pela tela de renovações',
      })
      .in('id', ids)
    setBulkSending(false)
    if (error) { showMsg('Erro ao excluir em lote: ' + error.message, 'err'); return }
    setLista(prev => prev.filter(r => !ids.includes(r.id)))
    setSelectedIds(new Set())
    showMsg(`${ids.length} renovação(ões) excluída(s).`)
  }

  function abrirEditarContato(r: RenovacaoV2) {
    if (!canEditCadastro) {
      showMsg('Seu perfil não pode alterar cadastro por aqui.', 'err')
      return
    }
    setEditingContato(r)
    setContatoForm({
      cliente: r.cliente ?? '',
      email: r.email ?? '',
      telefone: r.telefone ?? '',
      cpf: r.cpf ?? '',
      cnpj: r.cnpj ?? '',
      razao_social: r.razao_social ?? '',
      agr: r.agr ?? '',
      vendedor: r.vendedor ?? '',
      contador: r.contador ?? '',
      observacoes: r.observacoes ?? '',
    })
  }

  async function salvarContato() {
    if (!canEditCadastro) { showMsg('Seu perfil não pode alterar cadastro por aqui.', 'err'); return }
    if (!editingContato) return
    setSavingContato(true)
    const payload = {
      email: contatoForm.email.trim() || null,
      telefone: normalizePhoneBR(contatoForm.telefone),
    }
    const { error } = await supabase.from('renovacoes').update(payload).eq('id', editingContato.id)
    setSavingContato(false)
    if (error) { showMsg('Erro ao salvar contato: ' + error.message, 'err'); return }
    setLista(prev => prev.map(item => item.id === editingContato.id ? { ...item, ...payload } : item))
    setEditingContato(null)
    setContatoForm({ ...EMPTY_CONTATO })
    showMsg('Contato atualizado.')
  }

  async function confirmarImport() {
    const validos = csvRows.filter(r => r.cliente?.trim() && r.data_vencimento?.trim())
    if (!validos.length) return
    setImporting(true)
    const records = validos.map(r => ({
      pedido: r.pedido || null, protocolo: r.protocolo || null,
      data_vencimento: parseBrDate(r.data_vencimento), cliente: r.cliente,
      email: r.email || null, telefone: normalizePhoneBR(r.telefone),
      tipo_certificado: r.produto || r.tipo_certificado || 'Não especificado',
      valor: r.valor ? parseFloat(r.valor.replace(',', '.')) : null,
      cpf: r.cpf || null, cnpj: r.cnpj || null, razao_social: r.razao_social || null,
      agr: r.agr || null, vendedor: r.vendedor || null, contador: r.contador || null,
      status: 'pendente' as StatusRenovacao, renovado: false,
    }))
    const { error } = await supabase.from('renovacoes').insert(records)
    setImporting(false)
    if (error) { showMsg('Erro na importação: ' + error.message, 'err'); return }
    showMsg(`${records.length} renovações importadas!`)
    setShowImport(false); setCsvRows([])
    void fetchRenovacoes()
  }

  // ── derived state ────────────────────────────────────────────

  const listagem = lista.filter(r => {
    const matchFiltro = filtro === 'todos' || r.prioridade === filtro
    const term = busca.toLowerCase()
    const matchBusca  = !term || [r.cliente,r.razao_social,r.tipo_certificado,r.email,r.telefone,r.cpf,r.cnpj,r.pedido,r.protocolo,r.vendedor,r.contador,r.agr].some(v => v?.toLowerCase().includes(term))
    return matchFiltro && matchBusca
  })

  const allSelected   = listagem.length > 0 && selectedIds.size === listagem.length
  const someSelected  = selectedIds.size > 0 && !allSelected
  const selCount      = selectedIds.size
  const kpis = {
    total:      lista.length,
    potencial:  lista.reduce((s, r) => s + (r.valor ?? 0), 0),
    urgentes:   lista.filter(r => r.prioridade === 'urgente').length,
    contatados: lista.filter(r => r.status === 'contatado').length,
  }

  const waTemplates    = templates.filter(t => t.channel === 'whatsapp')
  const emailTemplates = templates.filter(t => t.channel === 'email')
  const previewClient  = previewId ? lista.find(r => r.id === previewId) : lista[0] ?? null
  const previewText    = previewClient && tplForm.body
    ? renderTemplate(tplForm.body, tplValues(previewClient)) : tplForm.body

  // ── render ───────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <input ref={fileRef} type="file" accept=".csv,.xls,.xlsx" aria-label="Importar planilha XLS ou XLSX" className="hidden" onChange={handleFileChange} />

      {/* Toast */}
      {toast && (
        <div className={cn('fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium',
          toast.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white')}>
          {toast.msg}
          <button type="button" title="Fechar" onClick={() => setToast(null)} className="ml-1 opacity-80 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-5xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800 shrink-0">
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">Importar Renovações — {csvRows.length} linha(s) detectada(s)</h3>
                <p className="text-xs text-gray-500 mt-0.5">Linhas sem Cliente ou Data Vencimento serão ignoradas.</p>
              </div>
              <button type="button" title="Fechar" onClick={() => { setShowImport(false); setCsvRows([]) }}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {csvRows.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum dado válido encontrado. Verifique o formato.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[1400px]">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 uppercase">
                        {CSV_FIELDS.map(f => <th key={f.key} className="px-3 py-2 text-left whitespace-nowrap">{f.label.replace(' (YYYY-MM-DD)','')}</th>)}
                        <th className="px-3 py-2 text-left">OK</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {csvRows.slice(0, 15).map((row, i) => {
                        const ok = !!(row.cliente?.trim() && row.data_vencimento?.trim())
                        return (
                          <tr key={i} className={cn(!ok && 'opacity-40')}>
                            {CSV_FIELDS.map(f => <td key={f.key} className="px-3 py-2 max-w-[120px] truncate text-gray-600 dark:text-gray-300">{row[f.key as string] || '—'}</td>)}
                            <td className="px-3 py-2">{ok ? <Check size={13} className="text-green-500" /> : <X size={13} className="text-red-400" />}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {csvRows.length > 15 && <p className="text-xs text-gray-400 mt-2 px-1">… e mais {csvRows.length - 15} linhas</p>}
                </div>
              )}
            </div>
            <div className="flex gap-2 p-5 border-t border-gray-200 dark:border-gray-800 shrink-0">
              <button type="button" onClick={() => void confirmarImport()}
                disabled={importing || !csvRows.filter(r => r.cliente?.trim() && r.data_vencimento?.trim()).length}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {importing ? 'Importando…' : `Importar ${csvRows.filter(r => r.cliente?.trim() && r.data_vencimento?.trim()).length} registros`}
              </button>
              <button type="button" onClick={() => { setShowImport(false); setCsvRows([]) }}
                className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      {editingContato && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800 shrink-0">
              <div>
                <h3 className="font-semibold text-gray-800 dark:text-gray-200">Editar contato da renovação</h3>
                <p className="text-xs text-gray-500 mt-0.5">Ajuste os dados do cliente sem sair da fila de renovações.</p>
              </div>
              <button type="button" title="Fechar" onClick={() => { setEditingContato(null); setContatoForm({ ...EMPTY_CONTATO }) }}>
                <X size={18} className="text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                Aqui você pode ajustar apenas <strong>e-mail</strong> e <strong>telefone</strong>. Nome, CPF, CNPJ e demais dados devem ser alterados no cadastro principal para refletir no sistema todo.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500">E-mail</span>
                  <input type="email" value={contatoForm.email} onChange={e => setContatoForm(p => ({ ...p, email: e.target.value }))}
                    className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500">Telefone</span>
                  <input type="text" value={contatoForm.telefone} onChange={e => setContatoForm(p => ({ ...p, telefone: e.target.value }))}
                    className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </label>
              </div>
            </div>
            <div className="flex gap-2 p-5 border-t border-gray-200 dark:border-gray-800 shrink-0">
              <button type="button" onClick={() => void salvarContato()}
                disabled={savingContato}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {savingContato ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {savingContato ? 'Salvando…' : 'Salvar contato'}
              </button>
              <button type="button" onClick={() => { setEditingContato(null); setContatoForm({ ...EMPTY_CONTATO }) }}
                className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto p-6 space-y-5">

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Renovações Pendentes', value: loading ? '…' : String(kpis.total),           color: 'bg-red-500',    sub: 'certificados'        },
            { label: 'Valor Potencial',       value: loading ? '…' : fmtCurrency(kpis.potencial), color: 'bg-green-500',  sub: 'receita estimada'    },
            { label: 'Urgentes (≤ 7 dias)',   value: loading ? '…' : String(kpis.urgentes),       color: 'bg-orange-500', sub: 'ação imediata'       },
            { label: 'Já Contatados',         value: loading ? '…' : String(kpis.contatados),     color: 'bg-blue-500',   sub: 'aguardando resposta' },
          ].map(k => (
            <div key={k.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <div className={cn('w-2 h-2 rounded-full mb-3', k.color)} />
              <p className="text-xl font-bold">{k.value}</p>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mt-0.5">{k.label}</p>
              <p className="text-xs text-gray-400">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Priority Segments */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['urgente','media','normal'] as PrioridadeRenovacao[]).map(p => {
            const cfg = PRIORIDADE_CONFIG[p]; const Icon = cfg.icon
            const count = lista.filter(r => r.prioridade === p).length
            return (
              <button key={p} type="button" onClick={() => setFiltro(filtro === p ? 'todos' : p)}
                className={cn('text-left rounded-xl border p-4 transition-all', cfg.bg,
                  filtro === p ? 'ring-2 ring-offset-1 ring-blue-500' : 'border-gray-200 dark:border-gray-800 hover:border-blue-300')}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={16} className={cfg.color} />
                  <span className={cn('text-sm font-semibold', cfg.color)}>{cfg.label}</span>
                </div>
                <p className="text-2xl font-bold">{loading ? '…' : count}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">certificados neste segmento</p>
              </button>
            )
          })}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <input type="text" placeholder="Buscar por cliente, CPF, CNPJ, pedido…"
            value={busca} onChange={e => setBusca(e.target.value)}
            className="flex-1 min-w-[200px] border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button type="button" title="Atualizar" onClick={() => void fetchRenovacoes()}
            className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
            <RefreshCw size={15} />
          </button>
          <button type="button" onClick={downloadSpreadsheetTemplate}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Download size={14} /> Modelo XLSX
          </button>
          <button type="button" onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 border border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 text-sm font-medium rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            <Upload size={14} /> Importar Planilha
          </button>
          <button type="button" onClick={() => void enviarMassa()} disabled={sendingId === 'massa'}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
            {sendingId === 'massa' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            WA em Massa
          </button>
          <button type="button"
            onClick={() => { setShowLinks(v => !v); if (!showLinks) void fetchLinks() }}
            className={cn('flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
              showLinks
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800')}>
            <Link2 size={14} /> Links Produtos
            {showLinks ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button type="button"
            onClick={() => { setShowTemplates(v => !v); if (!showTemplates) void fetchTemplates() }}
            className={cn('flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
              showTemplates
                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                : 'border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800')}>
            <MessageSquare size={14} /> Templates
            {showTemplates ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <button type="button"
            onClick={() => { setShowAutomation(v => !v); if (!showAutomation) { void fetchAutoRules(); void fetchN8nWebhookUrl() } }}
            className={cn('flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
              showAutomation
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                : 'border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800')}>
            <Zap size={14} /> Automações
            {showAutomation ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Template usado no envio de WhatsApp</span>
            <select
              value={selectedWaTplId}
              onChange={e => setSelectedWaTplId(e.target.value)}
              className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Padrão do canal</option>
              {waTemplates.map(tpl => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}{tpl.ativo ? ' (padrão)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-500">Template usado no envio de e-mail</span>
            <select
              value={selectedEmailTplId}
              onChange={e => setSelectedEmailTplId(e.target.value)}
              className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Padrão do canal</option>
              {emailTemplates.map(tpl => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}{tpl.ativo ? ' (padrão)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Automation Panel */}
        {showAutomation && (
          <div className="bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-purple-600 dark:text-purple-400" />
              <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-400">Lembretes Automáticos de Renovação</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              Regras disparadas via N8N. Clientes contatados são enviados automaticamente ao Kanban. Lembretes continuam até o vencimento enquanto o status for <em>Pendente</em>.
            </p>
            {loadingRules ? <p className="text-sm text-gray-400 animate-pulse">Carregando…</p>
            : autoRules.length === 0 ? <p className="text-sm text-gray-400">Tabela <code>automation_rules</code> não encontrada. Execute o SQL de integrações.</p>
            : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {autoRules.map(rule => (
                  <button key={rule.id} type="button" onClick={() => void toggleAutomation(rule)}
                    className={cn('flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                      rule.ativo ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
                                 : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300')}>
                    <div className={cn('w-2 h-2 rounded-full shrink-0', rule.ativo ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600')} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate text-gray-800 dark:text-gray-200">{rule.label}</p>
                      <p className="text-xs text-gray-400">{rule.channel === 'whatsapp_email' ? 'WhatsApp + Email' : rule.channel}</p>
                    </div>
                    <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full',
                      rule.ativo ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                 : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400')}>
                      {rule.ativo ? 'ON' : 'OFF'}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* ── Auto-Kanban quando cliente responde ── */}
            <div className="border-t border-purple-200 dark:border-purple-800 pt-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                    <Users size={14} /> Resposta do cliente → Kanban automático
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Quando o cliente responder a mensagem, um lead é criado no Kanban automaticamente.
                  </p>
                </div>
                <button type="button" onClick={toggleAutoKanban}
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors shrink-0',
                    autoKanban
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600')}>
                  {autoKanban ? '● ATIVO' : '○ INATIVO'}
                </button>
              </div>

              {/* Fluxo visual */}
              <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <span className="px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded font-medium">Cliente responde WhatsApp</span>
                <span>→</span>
                <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-medium">Chatwoot</span>
                <span>→</span>
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 rounded font-medium">N8N webhook</span>
                <span>→</span>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded font-medium">Supabase Realtime</span>
                <span>→</span>
                <span className="px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded font-medium">Lead criado no Kanban</span>
              </div>

              {/* Webhook URL do N8N */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  Configure este webhook no Chatwoot → Integrações → Webhooks:
                </p>
                {n8nWebhookUrl ? (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 truncate text-gray-700 dark:text-gray-300">
                      {n8nWebhookUrl}
                    </code>
                    <button type="button" title="Copiar URL"
                      onClick={() => { void navigator.clipboard.writeText(n8nWebhookUrl); showMsg('URL copiada!') }}
                      className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-xs">
                      Copiar
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">
                    URL não configurada. Acesse Configurações → Integrações → N8N para definir o webhook_url.
                  </p>
                )}
                <p className="text-xs text-gray-400">
                  O N8N deve inserir em <code>communication_events</code>: <code>event_type = &apos;message_received&apos;</code> e <code>contact = número do cliente</code>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Links de Produtos ────────────────────────────────── */}
        {showLinks && (
          <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Link2 size={16} className="text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Links de Renovação por Produto</h3>
              </div>
              <button type="button" onClick={abrirNovoLink}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors">
                <Plus size={13} /> Novo Link
              </button>
            </div>

            {loadingLinks ? (
              <p className="text-sm text-gray-400 animate-pulse">Carregando links…</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* ─ Tabela de links ─ */}
                <div className="space-y-2">
                  {links.length === 0 ? (
                    <p className="text-xs text-gray-400 pl-1">Nenhum link cadastrado. Execute o SQL <code>links_produtos_migration.sql</code> primeiro.</p>
                  ) : links.map(link => (
                    <div key={link.id}
                      className={cn('flex items-start gap-2 p-3 rounded-xl border bg-white dark:bg-gray-900 transition-colors',
                        editingLink?.id === link.id
                          ? 'border-emerald-400'
                          : 'border-gray-200 dark:border-gray-700 hover:border-emerald-300')}>
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{link.tipo_certificado}</p>
                        {link.link_renovacao ? (
                          <a href={link.link_renovacao} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline truncate">
                            <ExternalLink size={10} className="shrink-0" />
                            <span className="truncate">Renovação: {link.link_renovacao}</span>
                          </a>
                        ) : (
                          <p className="text-xs text-gray-400 italic">Link renovação não definido</p>
                        )}
                        {link.link_nova_emissao ? (
                          <a href={link.link_nova_emissao} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline truncate">
                            <ExternalLink size={10} className="shrink-0" />
                            <span className="truncate">Nova emissão: {link.link_nova_emissao}</span>
                          </a>
                        ) : (
                          <p className="text-xs text-gray-400 italic">Link nova emissão não definido</p>
                        )}
                        {link.descricao && (
                          <p className="text-xs text-gray-400">{link.descricao}</p>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button type="button" title="Editar" onClick={() => abrirEditarLink(link)}
                          className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-colors">
                          <Save size={13} />
                        </button>
                        <button type="button" title="Excluir" onClick={() => void deletarLink(link)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ─ Formulário de edição ─ */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {editingLink ? `Editando: ${editingLink.tipo_certificado}` : 'Novo Produto'}
                  </p>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Tipo de Certificado *</span>
                    <input type="text" value={linkForm.tipo_certificado}
                      onChange={e => setLinkForm(p => ({ ...p, tipo_certificado: e.target.value }))}
                      placeholder="Ex: e-CPF A3"
                      disabled={!!editingLink}
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed" />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Link de Renovação</span>
                    <input type="url" value={linkForm.link_renovacao}
                      onChange={e => setLinkForm(p => ({ ...p, link_renovacao: e.target.value }))}
                      placeholder="https://…"
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Link Nova Emissão</span>
                    <input type="url" value={linkForm.link_nova_emissao}
                      onChange={e => setLinkForm(p => ({ ...p, link_nova_emissao: e.target.value }))}
                      placeholder="https://…"
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Descrição</span>
                    <textarea value={linkForm.descricao}
                      onChange={e => setLinkForm(p => ({ ...p, descricao: e.target.value }))}
                      rows={2} placeholder="Observação opcional sobre este produto…"
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                  </label>

                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => void salvarLink()}
                      disabled={savingLink || !linkForm.tipo_certificado.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                      {savingLink ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {savingLink ? 'Salvando…' : 'Salvar'}
                    </button>
                    {(editingLink || linkForm.tipo_certificado) && (
                      <button type="button" onClick={() => { setEditingLink(null); setLinkForm({ ...EMPTY_LINK }) }}
                        className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Template Editor ──────────────────────────────────── */}
        {showTemplates && (
          <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800 rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">
                  Templates de Mensagem Automática
                </h3>
              </div>
              <button type="button" onClick={abrirNovoTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors">
                <Plus size={13} /> Novo Template
              </button>
            </div>

            {loadingTpls ? (
              <p className="text-sm text-gray-400 animate-pulse">Carregando templates…</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                {/* ─ Left: template lists ─ */}
                <div className="space-y-4">
                  {/* WhatsApp templates */}
                  <div>
                    <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-2 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                      WhatsApp ({waTemplates.length})
                    </p>
                    <div className="space-y-1.5">
                      {waTemplates.length === 0
                        ? <p className="text-xs text-gray-400 pl-3">Nenhum template de WhatsApp.</p>
                        : waTemplates.map(tpl => (
                          <div key={tpl.id}
                            onClick={() => toggleTplSelection(tpl)}
                            className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                              selectedWaTplId === tpl.id
                                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                : editingTpl?.id === tpl.id
                                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-green-300')}>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{tpl.name}</p>
                              <p className={cn('text-[11px]', selectedWaTplId === tpl.id ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-gray-500')}>
                                {selectedWaTplId === tpl.id ? '✓ Selecionado para envio' : tpl.ativo ? 'Padrão do canal' : 'Disponível'}
                              </p>
                              <p className="text-xs text-gray-400 truncate">{tpl.body.slice(0, 60)}…</p>
                            </div>
                            <label className="flex items-center gap-1 text-[11px] text-gray-500 shrink-0" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={tpl.ativo}
                                onChange={e => void definirTemplatePadrao(tpl, e.target.checked)}
                                title="Marcar como padrão do canal"
                              />
                              Padrão
                            </label>
                            <button type="button" title="Editar" onClick={e => { e.stopPropagation(); abrirEditarTemplate(tpl) }}
                              className="text-gray-400 hover:text-indigo-600 p-1 shrink-0">
                              <MessageSquare size={13} />
                            </button>
                            <button type="button" title="Excluir" onClick={e => { e.stopPropagation(); void deletarTemplate(tpl) }}
                              className="text-gray-400 hover:text-red-500 p-1 shrink-0">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Email templates */}
                  <div>
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-2 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                      E-mail ({emailTemplates.length})
                    </p>
                    <div className="space-y-1.5">
                      {emailTemplates.length === 0
                        ? <p className="text-xs text-gray-400 pl-3">Nenhum template de e-mail.</p>
                        : emailTemplates.map(tpl => (
                          <div key={tpl.id}
                            onClick={() => toggleTplSelection(tpl)}
                            className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                              selectedEmailTplId === tpl.id
                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                : editingTpl?.id === tpl.id
                                  ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-blue-300')}>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{tpl.name}</p>
                              <p className={cn('text-[11px]', selectedEmailTplId === tpl.id ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-gray-500')}>
                                {selectedEmailTplId === tpl.id ? '✓ Selecionado para envio' : tpl.ativo ? 'Padrão do canal' : 'Disponível'}
                              </p>
                              {tpl.subject && <p className="text-xs text-gray-500 truncate">Assunto: {tpl.subject}</p>}
                              <p className="text-xs text-gray-400 truncate">{tpl.body.slice(0, 50)}…</p>
                            </div>
                            <label className="flex items-center gap-1 text-[11px] text-gray-500 shrink-0" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={tpl.ativo}
                                onChange={e => void definirTemplatePadrao(tpl, e.target.checked)}
                                title="Marcar como padrão do canal"
                              />
                              Padrão
                            </label>
                            <button type="button" title="Editar" onClick={e => { e.stopPropagation(); abrirEditarTemplate(tpl) }}
                              className="text-gray-400 hover:text-indigo-600 p-1 shrink-0">
                              <MessageSquare size={13} />
                            </button>
                            <button type="button" title="Excluir" onClick={e => { e.stopPropagation(); void deletarTemplate(tpl) }}
                              className="text-gray-400 hover:text-red-500 p-1 shrink-0">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>

                {/* ─ Right: editor + preview ─ */}
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4">
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {editingTpl ? `Editando: ${editingTpl.name}` : 'Novo Template'}
                  </p>

                  {/* Name + Channel */}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">Nome do template *</span>
                      <input type="text" value={tplForm.name} onChange={e => setTplForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Ex: Lembrete 7 dias"
                        className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">Canal</span>
                      <select value={tplForm.channel} onChange={e => setTplForm(p => ({ ...p, channel: e.target.value as 'whatsapp' | 'email' }))}
                        className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="whatsapp">WhatsApp</option>
                        <option value="email">E-mail</option>
                      </select>
                    </label>
                  </div>

                  {/* Subject (email only) */}
                  {tplForm.channel === 'email' && (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500">Assunto do e-mail</span>
                      <input type="text" value={tplForm.subject} onChange={e => setTplForm(p => ({ ...p, subject: e.target.value }))}
                        placeholder="Ex: Renovação do seu certificado {{tipo_certificado}}"
                        className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </label>
                  )}

                  {/* Variable chips */}
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Inserir variável no cursor:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATE_VARS.map(v => (
                        <button key={v.key} type="button" onClick={() => insertVar(v.key)}
                          className="px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 font-mono transition-colors">
                          {v.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Body textarea */}
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500">Corpo da mensagem *</span>
                    <textarea ref={tplTextareaRef} value={tplForm.body}
                      onChange={e => setTplForm(p => ({ ...p, body: e.target.value }))}
                      rows={5} placeholder="Digite a mensagem. Clique nas variáveis acima para inserir dados do cliente."
                      className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y font-mono" />
                  </label>

                  {/* Preview */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-gray-500">Pré-visualização com dados reais:</p>
                      <div className="flex items-center gap-2">
                        <select title="Selecionar cliente para preview" value={previewId} onChange={e => setPreviewId(e.target.value)}
                          className="text-xs border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 bg-white dark:bg-gray-800 focus:outline-none max-w-[160px] truncate">
                          <option value="">— primeiro cliente —</option>
                          {lista.map(r => <option key={r.id} value={r.id}>{r.razao_social ?? r.cliente}</option>)}
                        </select>
                        <button type="button" title={showPreview ? 'Ocultar preview' : 'Mostrar preview'}
                          onClick={() => setShowPreview(v => !v)}
                          className="p-1 text-gray-400 hover:text-indigo-600">
                          {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                    {showPreview && (
                      <div className={cn(
                        'rounded-lg border p-3 text-xs whitespace-pre-wrap leading-relaxed',
                        tplForm.channel === 'whatsapp'
                          ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800 text-green-900 dark:text-green-200'
                          : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-200'
                      )}>
                        {previewText || <span className="text-gray-400 italic">Digite uma mensagem para ver o preview.</span>}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => void salvarTemplate()} disabled={savingTpl || !tplForm.name.trim() || !tplForm.body.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                      {savingTpl ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {savingTpl ? 'Salvando…' : 'Salvar Template'}
                    </button>
                    {(editingTpl || tplForm.name) && (
                      <button type="button" onClick={() => { setEditingTpl(null); setTplForm({ ...EMPTY_TPL }) }}
                        className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Bulk Action Bar ──────────────────────────────────── */}
        {selCount > 0 && (
          <div className="sticky top-0 z-10 bg-blue-600 text-white rounded-xl px-4 py-3 flex flex-wrap items-center gap-2 shadow-lg">
            <span className="text-sm font-semibold shrink-0">{selCount} selecionado(s)</span>
            <div className="flex-1" />
            <button type="button" disabled={bulkSending} onClick={() => void bulkEnviarWhatsApp()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 hover:bg-green-400 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
              {bulkSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              WA em Lote
            </button>
            <button type="button" disabled={bulkSending} onClick={() => void bulkEnviarEmail()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
              {bulkSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Email em Lote
            </button>
            <button type="button" disabled={bulkSending} onClick={() => void bulkMarcarRenovado()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
              <Check size={12} /> Marcar Renovado
            </button>
            <button type="button" disabled={bulkSending} onClick={() => void bulkMarcarNaoRenovado()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-400 hover:bg-red-300 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
              <X size={12} /> Não Renovado
            </button>
            <button type="button" disabled={bulkSending} onClick={() => void bulkKanban()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 hover:bg-purple-400 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
              <Users size={12} /> → Kanban
            </button>
            <button type="button" disabled={bulkSending} onClick={() => void bulkExcluirRenovacoes()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500 hover:bg-rose-400 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
              <Trash2 size={12} /> Excluir
            </button>
            <button type="button" onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-1 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white text-xs font-medium rounded-lg transition-colors">
              <X size={12} /> Limpar
            </button>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 text-red-600 dark:text-red-300 rounded-lg p-4 text-sm">{error}</div>
        )}

        {/* ── Wide Table ───────────────────────────────────────── */}
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[2200px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">
                  {/* Checkbox all */}
                  <th className="px-3 py-3 w-10">
                    <input type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleSelectAll}
                      aria-label="Selecionar todos"
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                  </th>
                  {['Ações','Pedido','Protocolo','Vencimento','Dias','Cliente','E-mail','Telefone','Produto','Valor','CPF','CNPJ','Razão Social','AGR','Vendedor','Contador','Status'].map(h => (
                    <th key={h} className="px-3 py-3 whitespace-nowrap font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <tr><td colSpan={18} className="px-5 py-10 text-center text-gray-400 animate-pulse">Carregando…</td></tr>
                ) : listagem.length === 0 ? (
                  <tr><td colSpan={18} className="px-5 py-10 text-center text-gray-400">Nenhuma renovação encontrada.</td></tr>
                ) : listagem.map(r => {
                  const pCfg    = PRIORIDADE_CONFIG[r.prioridade]
                  const sCfg    = STATUS_CONFIG[r.status]
                  const busy    = updatingId === r.id || sendingId === r.id
                  const sel     = selectedIds.has(r.id)

                  return (
                    <tr key={r.id}
                      className={cn(
                        'hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors',
                        sel  && 'bg-blue-50/60 dark:bg-blue-900/10',
                        busy && 'opacity-60'
                      )}>

                      {/* Checkbox */}
                      <td className="px-3 py-3">
                        <input type="checkbox" checked={sel} onChange={() => toggleSelect(r.id)}
                          aria-label={`Selecionar ${r.cliente}`}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                      </td>

                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          <button type="button" disabled={busy} onClick={() => void marcarRenovado(r)}
                            title={r.status === 'convertido' ? 'Desmarcar renovado' : 'Marcar como renovado'}
                            className={cn('p-1 rounded transition-colors disabled:opacity-40',
                              r.status === 'convertido'
                                ? 'text-green-700 bg-green-100 dark:bg-green-900/30 dark:text-green-400'
                                : 'text-gray-500 hover:text-green-700 hover:bg-green-50 dark:text-gray-400 dark:hover:bg-green-900/20 dark:hover:text-green-400')}>
                            <Check size={12} />
                          </button>
                          <button type="button" disabled={busy} onClick={() => void marcarNaoRenovado(r)}
                            title={r.status === 'perdido' ? 'Desmarcar não renovado' : 'Marcar como não renovado'}
                            className={cn('p-1 rounded transition-colors disabled:opacity-40',
                              r.status === 'perdido'
                                ? 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400'
                                : 'text-gray-500 hover:text-red-700 hover:bg-red-50 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400')}>
                            <X size={12} />
                          </button>
                          <button type="button" disabled={busy || !r.telefone} onClick={() => void enviarWhatsApp(r)}
                            title={r.telefone ? 'Enviar WhatsApp' : 'Cliente sem telefone'}
                            className="p-1 rounded text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20 disabled:opacity-30">
                            {sendingId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                          </button>
                          <button type="button" disabled={busy} onClick={() => abrirEditarContato(r)}
                            title="Editar contato"
                            className="p-1 rounded text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20 disabled:opacity-30"
                            hidden={!canEditCadastro}>
                            <Edit3 size={12} />
                          </button>
                          <button type="button" disabled={busy || !r.email} onClick={() => void enviarEmail(r)}
                            title={r.email ? 'Enviar e-mail' : 'Cliente sem e-mail'}
                            className="p-1 rounded text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 disabled:opacity-30">
                            <Mail size={12} />
                          </button>
                          <button type="button" disabled={busy} onClick={() => void criarLeadKanban(r)}
                            title="Criar lead no Kanban"
                            className="p-1 rounded text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20 disabled:opacity-30">
                            <Users size={12} />
                          </button>
                          <button type="button" disabled={busy || !r.telefone} onClick={() => openChat(r)}
                            title={r.telefone ? 'Abrir chat WhatsApp' : 'Cliente sem telefone'}
                            className="p-1 rounded text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20 disabled:opacity-30">
                            <MessageSquare size={12} />
                          </button>
                          <button type="button" disabled={busy} onClick={() => void cancelarFollowUps(r.id)}
                            title="Cancelar avisos automáticos agendados"
                            className="p-1 rounded text-orange-500 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-900/20 disabled:opacity-30">
                            <Bell size={12} className="line-through" />
                          </button>
                          <button type="button" disabled={busy} onClick={() => void excluirRenovacao(r)}
                            title="Excluir da lista de renovações"
                            className="p-1 rounded text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20 disabled:opacity-30"
                            hidden={!isAdmin}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{r.pedido ?? '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{r.protocolo ?? '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {new Date(r.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={cn('text-xs font-bold', pCfg.color)}>
                          {r.dias_restantes > 0 ? `${r.dias_restantes}d` : 'Vencido'}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-medium max-w-[140px]"><span className="truncate block">{r.cliente}</span></td>
                      <td className="px-3 py-3 text-xs text-gray-500 max-w-[160px]"><span className="truncate block">{r.email ?? '—'}</span></td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{r.telefone ?? '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{r.tipo_certificado}</td>
                      <td className="px-3 py-3 text-xs font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">{fmtCurrency(r.valor)}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{r.cpf ?? '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{r.cnpj ?? '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 max-w-[150px]"><span className="truncate block">{r.razao_social ?? '—'}</span></td>
                      <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{r.agr ?? '—'}</td>
                      <td className="px-3 py-3 text-xs text-gray-500 max-w-[110px]"><span className="truncate block">{r.vendedor ?? '—'}</span></td>
                      <td className="px-3 py-3 text-xs text-gray-500 max-w-[110px]"><span className="truncate block">{r.contador ?? '—'}</span></td>

                      {/* Status badge */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', sCfg.cls)}>{sCfg.label}</span>
                      </td>

                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  )
}

