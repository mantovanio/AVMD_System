import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Search, X, ChevronDown, ChevronUp, Loader2, RefreshCcw, Plus, Pencil, MessageCircle, Mail, LifeBuoy, Save, Upload, Check } from 'lucide-react'
import { getApiUrl } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { buscarCep } from '@/lib/cep'
import { buscarCnpj } from '@/lib/cnpj'
import { openCentralChat } from '@/lib/chatNavigation'
import { useAuth } from '@/contexts/AuthContext'
import { buildSafeIlikePattern, hasPerfil } from '@/lib/security'
import type { Agendamento, CommunicationOutbox, RenovacaoV2 } from '@/types'
import * as XLSX from 'xlsx'

type TipoCliente = 'pessoa_fisica' | 'pessoa_juridica'

interface Cliente {
  id: string
  tipo_cliente: TipoCliente
  cpf_cnpj: string
  nome: string
  nome_fantasia: string | null
  email: string | null
  telefone: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  inscricao_municipal: string | null
  inscricao_estadual: string | null
  iss_retido: boolean | null
  status: 'ativo' | 'inativo'
  metadata: Record<string, unknown> | null
  created_at: string
}

interface VendaResumida {
  id: string
  protocolo_numero: string | null
  tipo_produto: string
  valor_venda: number | null
  status_venda: string
  data_inicio_validade: string | null
  data_vencimento: string | null
  validado_safeweb: boolean | null
  vendedor_id: string | null
  agente_registro_id: string | null
  created_at: string
}

interface RenovacaoResumo extends RenovacaoV2 {}

interface ContatoHistorico {
  id: string
  origem: 'outbox' | 'evento'
  canal: string
  destino: string
  status: string
  assunto: string | null
  corpo: string
  created_at: string
}

interface PortalAccessSummary {
  profile_id: string
  clerk_user_id: string | null
  nome: string
  email: string | null
  status: 'ativo' | 'inativo'
  tipo_vinculo: string | null
}

interface ClienteDetalhe {
  vendas: VendaResumida[]
  renovacoes: RenovacaoResumo[]
  contatos: ContatoHistorico[]
  agendamentos: Agendamento[]
  portal_access: PortalAccessSummary | null
}

interface ClienteComVendas extends Cliente {
  total_vendas: number
  valor_total: number
  ultimo_produto: string | null
  ultima_compra: string | null
  ultimo_agente_id: string | null
}

type ClienteFormState = {
  tipo_cliente: TipoCliente
  cpf_cnpj: string
  nome: string
  nome_fantasia: string
  email: string
  telefone: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  inscricao_municipal: string
  inscricao_estadual: string
  iss_retido: boolean
  status: 'ativo' | 'inativo'
}

type ClienteModalState = { mode: 'novo' | 'editar'; cliente?: ClienteComVendas } | null

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]

type ClienteImportField =
  | 'tipo_cliente'
  | 'data_nascimento'
  | 'documento'
  | 'documento_titular'
  | 'cpf_cnpj'
  | 'cnpj'
  | 'cpf'
  | 'nome'
  | 'razao_social'
  | 'nome_fantasia'
  | 'email'
  | 'telefone'
  | 'cep'
  | 'logradouro'
  | 'numero'
  | 'complemento'
  | 'bairro'
  | 'cidade'
  | 'uf'
  | 'inscricao_municipal'
  | 'inscricao_estadual'
  | 'pedido'
  | 'protocolo'
  | 'produto'
  | 'tipo'
  | 'validade'
  | 'vencimento'
  | 'atendente'
  | 'ponto'
  | 'vendedor'
  | 'status_pedido'
  | 'valor_compra'
  | 'ar'
  | 'status'

const CLIENT_IMPORT_FIELDS: Array<{ key: ClienteImportField; label: string; required?: boolean }> = [
  { key: 'tipo_cliente', label: 'Tipo cliente (PF/PJ)' },
  { key: 'data_nascimento', label: 'Data de nascimento' },
  { key: 'documento', label: 'Documento (Safeweb)' },
  { key: 'documento_titular', label: 'Documento titular (CPF)' },
  { key: 'cpf_cnpj', label: 'CPF/CNPJ', required: true },
  { key: 'cpf', label: 'CPF' },
  { key: 'cnpj', label: 'CNPJ' },
  { key: 'nome', label: 'Nome / Razão social', required: true },
  { key: 'razao_social', label: 'Razão social' },
  { key: 'nome_fantasia', label: 'Nome fantasia' },
  { key: 'email', label: 'E-mail' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'cep', label: 'CEP' },
  { key: 'logradouro', label: 'Logradouro' },
  { key: 'numero', label: 'Número' },
  { key: 'complemento', label: 'Complemento' },
  { key: 'bairro', label: 'Bairro' },
  { key: 'cidade', label: 'Cidade' },
  { key: 'uf', label: 'UF' },
  { key: 'inscricao_municipal', label: 'Inscrição municipal' },
  { key: 'inscricao_estadual', label: 'Inscrição estadual' },
  { key: 'pedido', label: 'Pedido' },
  { key: 'protocolo', label: 'Protocolo' },
  { key: 'produto', label: 'Produto' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'validade', label: 'Validade' },
  { key: 'vencimento', label: 'Vencimento' },
  { key: 'atendente', label: 'Atendente' },
  { key: 'ponto', label: 'Ponto' },
  { key: 'vendedor', label: 'Vendedor' },
  { key: 'status_pedido', label: 'Status do pedido' },
  { key: 'valor_compra', label: 'Valor da compra' },
  { key: 'ar', label: 'AR' },
  { key: 'status', label: 'Status' },
]

const CLIENT_IMPORT_ALIASES: Record<string, ClienteImportField> = {
  tipo_cliente: 'tipo_cliente',
  tipo_de_cliente: 'tipo_cliente',
  tipo_pessoa: 'tipo_cliente',
  data_de_nascimento: 'data_nascimento',
  nascimento: 'data_nascimento',
  data_nascimento: 'data_nascimento',
  documento: 'documento',
  doc: 'documento',
  documento_cliente: 'documento',
  documento_safeweb: 'documento',
  documento_titular: 'documento_titular',
  doc_titular: 'documento_titular',
  cpf_titular: 'documento_titular',
  cpf: 'cpf',
  cnpj: 'cnpj',
  cpf_cnpj: 'cpf_cnpj',
  nome: 'nome',
  razao_social: 'razao_social',
  nome_cliente: 'nome',
  razao: 'nome',
  nome_fantasia: 'nome_fantasia',
  fantasia: 'nome_fantasia',
  email: 'email',
  e_mail: 'email',
  telefone: 'telefone',
  celular: 'telefone',
  cep: 'cep',
  logradouro: 'logradouro',
  endereco: 'logradouro',
  numero: 'numero',
  complemento: 'complemento',
  bairro: 'bairro',
  cidade: 'cidade',
  uf: 'uf',
  inscricao_municipal: 'inscricao_municipal',
  inscricao_estadual: 'inscricao_estadual',
  ie: 'inscricao_estadual',
  pedido: 'pedido',
  numero_pedido: 'pedido',
  protocolo: 'protocolo',
  numero_protocolo: 'protocolo',
  produto: 'produto',
  tipo_produto: 'produto',
  tipo_certificado: 'produto',
  tipo: 'tipo',
  validade: 'validade',
  data_validade: 'validade',
  vencimento: 'vencimento',
  data_vencimento: 'vencimento',
  atendente: 'atendente',
  ponto: 'ponto',
  ponto_atendimento: 'ponto',
  vendedor: 'vendedor',
  status_pedido: 'status_pedido',
  situacao_pedido: 'status_pedido',
  valor_compra: 'valor_compra',
  valor_da_compra: 'valor_compra',
  valor: 'valor_compra',
  ar: 'ar',
  agr: 'ar',
  status: 'status',
}

const CLIENT_IMPORT_MAX_BYTES = 8 * 1024 * 1024

function normalizeHeaderImport(header: string) {
  return header
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/"/g, '')
    .replace(/\s+/g, '_')
}

function cleanImportHeader(header: string) {
  return header.trim().replace(/"/g, '')
}

function normalizeDigits(v: string | null | undefined) {
  return (v ?? '').replace(/\D/g, '')
}

function normalizeImportDocument(v: string | null | undefined) {
  const digits = normalizeDigits(v)
  if (digits.length === 11 || digits.length === 14) return digits
  return ''
}

function emptyToNull(v: string | null | undefined) {
  const text = String(v ?? '').trim()
  return text || null
}

function isLikelyDate(v: string) {
  const raw = v.trim()
  if (!raw) return false
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return true
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}/.test(raw)) return true
  if (/^\d{4}\s+\d{1,2}:\d{2}:\d{2}-\d{1,2}-\d{1,2}$/.test(raw)) return true
  return false
}

function scoreImportFieldForHeader(field: ClienteImportField, header: string, samples: string[]) {
  const normalized = normalizeHeaderImport(header)
  const sampleValues = samples.filter(Boolean)
  let score = 0

  if (CLIENT_IMPORT_ALIASES[normalized] === field) score += 100
  if (normalizeHeaderImport(field) === normalized) score += 90
  if (normalizeHeaderImport(CLIENT_IMPORT_FIELDS.find(f => f.key === field)?.label ?? '') === normalized) score += 70

  const digits = sampleValues.map(normalizeDigits).filter(Boolean)
  const dateSamples = sampleValues.filter(isLikelyDate)

  switch (field) {
    case 'cpf':
      if (digits.some(v => v.length === 11)) score += 60
      if (normalized.includes('cpf') && !normalized.includes('cnpj')) score += 20
      break
    case 'cnpj':
      if (digits.some(v => v.length === 14)) score += 60
      if (normalized.includes('cnpj')) score += 40
      break
    case 'cpf_cnpj':
    case 'documento':
      if (digits.some(v => v.length === 11 || v.length === 14)) score += 60
      if (normalized.includes('doc')) score += 20
      break
    case 'documento_titular':
      if (digits.some(v => v.length === 11)) score += 70
      if (normalized.includes('titular') || normalized.includes('tit')) score += 30
      break
    case 'data_nascimento':
    case 'validade':
    case 'vencimento':
      if (dateSamples.length >= Math.max(1, Math.ceil(sampleValues.length * 0.6))) score += 60
      if (normalized.includes('data') || normalized.includes('nasc') || normalized.includes('venc') || normalized.includes('valid')) score += 20
      break
    case 'pedido':
    case 'protocolo':
      if (normalized.includes('pedido') || normalized.includes('protocolo')) score += 50
      break
    case 'produto':
    case 'tipo':
      if (normalized.includes('produto') || normalized.includes('tipo')) score += 50
      break
    case 'valor_compra':
      if (sampleValues.some(v => /\d+[,.]\d{2}/.test(v) || /^\d+$/.test(v))) score += 60
      if (normalized.includes('valor') || normalized.includes('preco') || normalized.includes('compra')) score += 20
      break
    case 'status_pedido':
      if (normalized.includes('status')) score += 40
      if (sampleValues.some(v => /pendente|aprov|cancel|emit|pago|aguard/i.test(v))) score += 20
      break
    case 'ar':
      if (normalized === 'ar' || normalized.includes('agente') || normalized.includes('ponto')) score += 40
      break
    default:
      break
  }

  return score
}

function guessClientColumnMap(headers: string[], rows: Record<string, string>[] = []): Partial<Record<ClienteImportField, string>> {
  const map: Partial<Record<ClienteImportField, string>> = {}
  const sampleRows = rows.slice(0, 5)
  for (const header of headers) {
    const normalized = normalizeHeaderImport(header)
    const byKey = CLIENT_IMPORT_FIELDS.find(f => f.key === normalized)?.key
    const byAlias = CLIENT_IMPORT_ALIASES[normalized]
    const byLabel = CLIENT_IMPORT_FIELDS.find(f => normalizeHeaderImport(f.label) === normalized)?.key
    const key = byKey ?? byAlias ?? byLabel
    if (key && !map[key]) map[key] = header

    if (key) continue

    let bestField: ClienteImportField | null = null
    let bestScore = 0
    const sampleValues = sampleRows.map(row => String(row[header] ?? '').trim()).filter(Boolean)
    for (const candidate of CLIENT_IMPORT_FIELDS.map(f => f.key)) {
      const score = scoreImportFieldForHeader(candidate, header, sampleValues)
      if (score > bestScore) {
        bestScore = score
        bestField = candidate
      }
    }

    if (bestField && bestScore >= 60 && !map[bestField]) map[bestField] = header
  }
  return map
}

function applyClientColumnMap(
  rows: Record<string, string>[],
  map: Partial<Record<ClienteImportField, string>>,
) {
  return rows.map(row => {
    const next: Record<string, string> = {}
    for (const field of CLIENT_IMPORT_FIELDS) {
      const source = map[field.key]
      next[field.key] = source ? String(row[source] ?? '').trim() : ''
    }
    return next
  })
}

function detectCsvDelimiter(headerLine: string) {
  const candidates = [',', ';', '\t'] as const
  let best: string = candidates[0]
  let bestCount = -1
  for (const delimiter of candidates) {
    const count = headerLine.split(delimiter).length
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

function parseCsvLine(line: string, delimiter: string) {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (ch === delimiter && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }
    current += ch
  }

  values.push(current)
  return values.map(value => value.trim())
}

function parseClientCsv(raw: string) {
  const normalized = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  const lines = normalized.split('\n')
  if (lines.length < 2) return [] as Record<string, string>[]

  const delimiter = detectCsvDelimiter(lines[0])
  const headers = parseCsvLine(lines[0], delimiter).map(cleanImportHeader)

  return lines.slice(1).filter(line => line.trim()).map(line => {
    const values = parseCsvLine(line, delimiter)
    return Object.fromEntries(headers.map((header, i) => [header, String(values[i] ?? '').replace(/^"|"$/g, '').trim()]))
  })
}

function parseClientSpreadsheet(buffer: ArrayBuffer, fileName: string) {
  if (buffer.byteLength > CLIENT_IMPORT_MAX_BYTES) {
    throw new Error('Arquivo muito grande. Limite de 8 MB.')
  }
  if (fileName.toLowerCase().endsWith('.csv')) {
    const utf8 = new TextDecoder('utf-8').decode(buffer)
    const text = utf8.includes('\uFFFD') ? new TextDecoder('latin1').decode(buffer) : utf8
    return parseClientCsv(text)
  }
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const firstSheet = workbook.SheetNames[0]
  if (!firstSheet) return [] as Record<string, string>[]
  const sheet = workbook.Sheets[firstSheet]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true })
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => {
    const key = cleanImportHeader(k)
    if (v instanceof Date) {
      const y = v.getFullYear()
      const m = String(v.getMonth() + 1).padStart(2, '0')
      const d = String(v.getDate()).padStart(2, '0')
      return [key, `${d}/${m}/${y}`]
    }
    return [key, String(v ?? '').trim()]
  })))
}

function emptyClienteForm(): ClienteFormState {
  return {
    tipo_cliente: 'pessoa_fisica',
    cpf_cnpj: '',
    nome: '',
    nome_fantasia: '',
    email: '',
    telefone: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    inscricao_municipal: '',
    inscricao_estadual: '',
    iss_retido: false,
    status: 'ativo',
  }
}

function formatDoc(v: string) {
  if (v.length === 11) return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (v.length === 14) return v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return v
}

function buildPhoneCandidates(phone: string | null) {
  const digits = normalizeDigits(phone)
  if (!digits) return []

  const variants = new Set<string>([phone ?? '', digits])
  if (digits.length >= 10) variants.add(`+55${digits}`)
  if (digits.startsWith('55') && digits.length > 11) variants.add(`+${digits}`)
  return [...variants].filter(Boolean)
}

function formatCurrency(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(v: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  return d.toLocaleDateString('pt-BR')
}

function formatDateTime(v: string | null) {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  return d.toLocaleString('pt-BR')
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  emitido:      { label: 'Emitido',      cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  vendido:      { label: 'Vendido',      cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelado:    { label: 'Cancelado',    cls: 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400' },
  agendado:     { label: 'Agendado',     cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400' },
  em_validacao: { label: 'Em validação', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' },
  rascunho:     { label: 'Rascunho',     cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
}

export default function Clientes() {
  const { profile } = useAuth()
  const canAccessChat = hasPerfil(profile, 'admin', 'agente_registro', 'usuario')
  const fileImportRef = useRef<HTMLInputElement>(null)
  const [clientes, setClientes] = useState<ClienteComVendas[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [filterTipo, setFilterTipo] = useState<'' | TipoCliente>('')
  const [filterStatus, setFilterStatus] = useState<'' | 'ativo' | 'inativo'>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detalhes, setDetalhes] = useState<Record<string, ClienteDetalhe>>({})
  const [loadingDetalhe, setLoadingDetalhe] = useState<string | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})
  const [profileNomes, setProfileNomes] = useState<Map<string, string>>(new Map())
  const [pageSize, setPageSize] = useState(50)
  const [clienteModal, setClienteModal] = useState<ClienteModalState>(null)
  const [clienteForm, setClienteForm] = useState<ClienteFormState>(emptyClienteForm())
  const [savingCliente, setSavingCliente] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [importRawRows, setImportRawRows] = useState<Record<string, string>[]>([])
  const [importHeaders, setImportHeaders] = useState<string[]>([])
  const [importColumnMap, setImportColumnMap] = useState<Partial<Record<ClienteImportField, string>>>({})
  const [importingClientes, setImportingClientes] = useState(false)
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null)
  const [importResult, setImportResult] = useState<{
    criados: number
    atualizados: number
    ignorados: number
    ignoradosDuplicidade: number
    resumoIgnorados: {
      semDocumento: number
      semNome: number
      duplicidadeHistorico: number
    }
    erros: Array<{ linha: number; motivo: string; cpf_cnpj?: string; nome?: string }>
  } | null>(null)

  const mappedImportRows = useMemo(
    () => applyClientColumnMap(importRawRows, importColumnMap),
    [importRawRows, importColumnMap],
  )
  const autoImportMap = useMemo(
    () => guessClientColumnMap(importHeaders, importRawRows),
    [importHeaders, importRawRows],
  )
  const detectedImportFields = useMemo(
    () => CLIENT_IMPORT_FIELDS
      .map(field => ({ field, header: autoImportMap[field.key] }))
      .filter(item => item.header),
    [autoImportMap],
  )
  const importValidationSummary = useMemo(() => {
    const details = mappedImportRows.map((row, index) => {
      const rawDoc = row.documento || row.cpf_cnpj || row.cpf || row.cnpj || ''
      const doc = normalizeImportDocument(rawDoc)
      const nome = (row.nome || row.razao_social || '').trim()
      if (!doc && !nome) return { index, reason: 'Sem CPF/CNPJ e sem nome' }
      if (!doc) return { index, reason: 'CPF/CNPJ ausente ou inválido' }
      if (!nome) return { index, reason: 'Nome/Razão social ausente' }
      return { index, reason: null as string | null }
    })

    const accepted = details.filter(item => !item.reason).length
    const rejected = details.length - accepted
    const reasons = details
      .filter(item => item.reason)
      .reduce<Record<string, number>>((acc, item) => {
        acc[item.reason as string] = (acc[item.reason as string] ?? 0) + 1
        return acc
      }, {})

    return {
      total: details.length,
      accepted,
      rejected,
      reasons,
      samples: details.filter(item => item.reason).slice(0, 5),
    }
  }, [mappedImportRows])
  const validImportRows = useMemo(
    () => mappedImportRows.filter(r => {
      const doc = normalizeImportDocument(r.documento || r.cpf_cnpj || r.cpf || r.cnpj)
      const nome = (r.nome || r.razao_social || '').trim()
      return !!(doc && nome)
    }),
    [mappedImportRows],
  )

  function resetImportState() {
    setShowImportModal(false)
    setImportRawRows([])
    setImportHeaders([])
    setImportColumnMap({})
    setImportingClientes(false)
    setImportProgress(null)
    setImportResult(null)
  }

  function openImportModal() {
    fileImportRef.current?.click()
  }

  function handleImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const result = ev.target?.result
        if (!(result instanceof ArrayBuffer)) return
        const rows = parseClientSpreadsheet(result, file.name)
        const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r)).map(cleanImportHeader).filter(Boolean)))
        setImportRawRows(rows)
        setImportHeaders(headers)
        setImportColumnMap(guessClientColumnMap(headers, rows))
        setImportResult(null)
        setShowImportModal(true)
      } catch (err) {
        alert(String(err))
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function confirmarImportacaoClientes() {
    if (!validImportRows.length) return
    setImportingClientes(true)
    setImportResult(null)

    const payload = validImportRows.map(row => ({
      tipo_cliente: emptyToNull(row.tipo_cliente || row.tipo),
      data_nascimento: emptyToNull(row.data_nascimento),
      documento: emptyToNull(normalizeImportDocument(row.documento)),
      documento_titular: emptyToNull(normalizeImportDocument(row.documento_titular)),
      cpf_cnpj: emptyToNull(normalizeImportDocument(row.cpf_cnpj || row.documento || row.cpf || row.cnpj)),
      cpf: emptyToNull(normalizeImportDocument(row.cpf)),
      cnpj: emptyToNull(normalizeImportDocument(row.cnpj)),
      nome: emptyToNull(row.nome || row.razao_social),
      razao_social: emptyToNull(row.razao_social),
      nome_fantasia: emptyToNull(row.nome_fantasia),
      email: emptyToNull(row.email),
      telefone: emptyToNull(row.telefone),
      cep: emptyToNull(row.cep),
      logradouro: emptyToNull(row.logradouro),
      numero: emptyToNull(row.numero),
      complemento: emptyToNull(row.complemento),
      bairro: emptyToNull(row.bairro),
      cidade: emptyToNull(row.cidade),
      uf: emptyToNull(row.uf),
      inscricao_municipal: emptyToNull(row.inscricao_municipal),
      inscricao_estadual: emptyToNull(row.inscricao_estadual),
      pedido: emptyToNull(row.pedido),
      protocolo: emptyToNull(row.protocolo),
      produto: emptyToNull(row.produto),
      tipo: emptyToNull(row.tipo),
      validade: emptyToNull(row.validade),
      vencimento: emptyToNull(row.vencimento),
      atendente: emptyToNull(row.atendente),
      ponto: emptyToNull(row.ponto),
      vendedor: emptyToNull(row.vendedor),
      status_pedido: emptyToNull(row.status_pedido),
      valor_compra: emptyToNull(row.valor_compra),
      ar: emptyToNull(row.ar),
      status: emptyToNull(row.status),
    }))

    const BATCH_SIZE = 300
    const resume = {
      criados: 0,
      atualizados: 0,
      ignorados: 0,
      ignoradosDuplicidade: 0,
      resumoIgnorados: {
        semDocumento: 0,
        semNome: 0,
        duplicidadeHistorico: 0,
      },
      erros: [] as Array<{ linha: number; motivo: string; cpf_cnpj?: string; nome?: string }>,
    }

    try {
      for (let i = 0; i < payload.length; i += BATCH_SIZE) {
        const chunk = payload.slice(i, i + BATCH_SIZE)
        setImportProgress({ done: i, total: payload.length })
        const response = await fetch(getApiUrl('/comercial/clientes/import'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: chunk }),
        })
        const data = await response.json().catch(() => null) as {
          ok?: boolean
          criados?: number
          atualizados?: number
          ignorados?: number
          ignorados_duplicidade?: number
          resumo_ignorados?: {
            sem_documento?: number
            sem_nome?: number
            duplicidade_historico?: number
          }
          erros?: Array<{ linha: number; motivo: string; cpf_cnpj?: string; nome?: string }>
          error?: string
        } | null
        if (!response.ok || !data?.ok) {
          throw new Error(data?.error ?? `Falha no lote ${Math.floor(i / BATCH_SIZE) + 1}`)
        }

        resume.criados += data.criados ?? 0
        resume.atualizados += data.atualizados ?? 0
        resume.ignorados += data.ignorados ?? 0
        resume.ignoradosDuplicidade += data.ignorados_duplicidade ?? 0
        resume.resumoIgnorados.semDocumento += data.resumo_ignorados?.sem_documento ?? 0
        resume.resumoIgnorados.semNome += data.resumo_ignorados?.sem_nome ?? 0
        resume.resumoIgnorados.duplicidadeHistorico += data.resumo_ignorados?.duplicidade_historico ?? 0
        if (data.erros?.length) resume.erros.push(...data.erros)
        setImportProgress({ done: Math.min(i + chunk.length, payload.length), total: payload.length })
      }

      setImportResult({
        criados: resume.criados,
        atualizados: resume.atualizados,
        ignorados: resume.ignorados,
        ignoradosDuplicidade: resume.ignoradosDuplicidade,
        resumoIgnorados: resume.resumoIgnorados,
        erros: resume.erros.slice(0, 50),
      })
      alert(
        `Importação concluída. Criados: ${resume.criados}; Atualizados: ${resume.atualizados}; Ignorados por validação: ${resume.ignorados}; Ignorados por duplicidade de histórico: ${resume.ignoradosDuplicidade}.`
      )
      setSearch('')
      setSearchInput('')
      setFilterTipo('')
      setFilterStatus('')
      setPage(0)
      await fetchClientes({ page: 0, pageSize, search: '', filterTipo: '', filterStatus: '' })
    } catch (err) {
      alert('Erro ao importar carteira: ' + String(err))
    } finally {
      setImportingClientes(false)
      setImportProgress(null)
    }
  }

  async function resolveProfiles(ids: string[]) {
    const unknown = ids.filter(id => !profileNomes.has(id))
    if (!unknown.length) return
    const { data } = await supabase.from('profiles').select('id, nome').in('id', unknown)
    if (data?.length) {
      setProfileNomes(prev => {
        const next = new Map(prev)
        for (const p of data) next.set(p.id as string, p.nome as string)
        return next
      })
    }
  }

  const fetchClientes = useCallback(async (overrides?: {
    page?: number
    pageSize?: number
    search?: string
    filterTipo?: '' | TipoCliente
    filterStatus?: '' | 'ativo' | 'inativo'
  }) => {
    setLoading(true)
    try {
      const effectivePage = overrides?.page ?? page
      const effectivePageSize = overrides?.pageSize ?? pageSize
      const effectiveSearch = overrides?.search ?? search
      const effectiveFilterTipo = overrides?.filterTipo ?? filterTipo
      const effectiveFilterStatus = overrides?.filterStatus ?? filterStatus

      const response = await fetch(getApiUrl('/comercial/clientes'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: effectivePage,
          pageSize: effectivePageSize,
          search: effectiveSearch,
          filterTipo: effectiveFilterTipo,
          filterStatus: effectiveFilterStatus,
        }),
      })
      const payload = await response.json().catch(() => null) as {
        ok?: boolean
        clientes?: Cliente[]
        total?: number
        error?: string
      } | null

      if (!response.ok || !payload?.ok) {
        console.error(payload?.error ?? 'Falha ao carregar clientes')
        return
      }

      const data = payload.clientes ?? []
      const ids = data.map(c => c.id as string)
      setTotal(payload.total ?? data.length)

      if (ids.length === 0) { setClientes([]); return }

      const { data: vendasData } = await supabase
        .from('vendas_certificados')
        .select('cadastro_base_id, tipo_produto, valor_venda, created_at, vendedor_id, agente_registro_id')
        .in('cadastro_base_id', ids)

      const vendasPorCliente = new Map<string, {
        count: number; valor: number
        ultimo_produto: string | null; ultima: string | null
        ultimo_agente_id: string | null
      }>()

      const agentIds: string[] = []

      for (const v of vendasData ?? []) {
        const cid = v.cadastro_base_id as string
        const cur = vendasPorCliente.get(cid) ?? { count: 0, valor: 0, ultimo_produto: null, ultima: null, ultimo_agente_id: null }
        cur.count++
        cur.valor += (v.valor_venda as number) ?? 0
        if (!cur.ultima || (v.created_at as string) > cur.ultima) {
          cur.ultima = v.created_at as string
          cur.ultimo_produto = v.tipo_produto as string
          cur.ultimo_agente_id = (v.agente_registro_id ?? v.vendedor_id) as string | null
        }
        vendasPorCliente.set(cid, cur)
        if (v.vendedor_id) agentIds.push(v.vendedor_id as string)
        if (v.agente_registro_id) agentIds.push(v.agente_registro_id as string)
      }

      void resolveProfiles([...new Set(agentIds)])

      setClientes(data.map(c => {
        const res = vendasPorCliente.get(c.id as string)
        return {
          ...(c as Cliente),
          total_vendas:    res?.count ?? 0,
          valor_total:     res?.valor ?? 0,
          ultimo_produto:  res?.ultimo_produto ?? null,
          ultima_compra:   res?.ultima ?? null,
          ultimo_agente_id: res?.ultimo_agente_id ?? null,
        }
      }))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, search, filterTipo, filterStatus])

  useEffect(() => { void fetchClientes() }, [fetchClientes])

  async function toggleExpand(cliente: ClienteComVendas) {
    if (expandedId === cliente.id) { setExpandedId(null); return }
    setExpandedId(cliente.id)
    if (detalhes[cliente.id]) return

    setLoadingDetalhe(cliente.id)

    const doc = normalizeDigits(cliente.cpf_cnpj)
    const phoneCandidates = buildPhoneCandidates(cliente.telefone)
    const email = cliente.email?.trim() ?? null

    const vendasPromise = supabase
      .from('vendas_certificados')
      .select('id, protocolo_numero, tipo_produto, valor_venda, status_venda, data_inicio_validade, data_vencimento, validado_safeweb, vendedor_id, agente_registro_id, created_at')
      .eq('cadastro_base_id', cliente.id)
      .order('created_at', { ascending: false })
      .limit(20)

    const agendamentosPromise = phoneCandidates.length > 0
      ? supabase.from('agendamentos').select('*').in('telefone', phoneCandidates).order('data_hora', { ascending: false }).limit(20)
      : supabase.from('agendamentos').select('*').eq('cliente', cliente.nome).order('data_hora', { ascending: false }).limit(20)

    const contatosOutboxPromise = [email, ...phoneCandidates].filter(Boolean).length > 0
      ? supabase.from('communication_outbox').select('*').in('to_address', [email, ...phoneCandidates].filter(Boolean) as string[]).order('created_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null } as { data: CommunicationOutbox[]; error: null })

    const contatosEventosPromise = phoneCandidates.length > 0
      ? supabase.from('communication_events').select('id, source, event_type, conversation_id, contact, payload, created_at').in('contact', phoneCandidates).order('created_at', { ascending: false }).limit(20)
      : Promise.resolve({ data: [], error: null } as { data: Record<string, unknown>[]; error: null })

    const renovacaoOps = [
      supabase.from('renovacoes').select('*').eq('cadastro_base_id', cliente.id).is('deleted_at', null).order('data_vencimento', { ascending: true }).limit(20),
    ]

    if (doc) {
      if (doc.length === 11) renovacaoOps.push(supabase.from('renovacoes').select('*').eq('cpf', doc).is('deleted_at', null).order('data_vencimento', { ascending: true }).limit(20))
      if (doc.length === 14) renovacaoOps.push(supabase.from('renovacoes').select('*').eq('cnpj', doc).is('deleted_at', null).order('data_vencimento', { ascending: true }).limit(20))
    }
    if (email) renovacaoOps.push(supabase.from('renovacoes').select('*').eq('email', email).is('deleted_at', null).order('data_vencimento', { ascending: true }).limit(20))
    if (phoneCandidates.length > 0) renovacaoOps.push(supabase.from('renovacoes').select('*').in('telefone', phoneCandidates).is('deleted_at', null).order('data_vencimento', { ascending: true }).limit(20))

    const portalAccessPromise = fetch(getApiUrl('/comercial/clientes/access'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: cliente.id }),
    })
      .then(res => res.json())
      .catch(() => ({ ok: false, access: null }))

    const [
      { data: vendasData },
      { data: agendamentosData },
      { data: outboxData },
      { data: eventosData },
      renovacaoResults,
      portalAccessResponse,
    ] = await Promise.all([
      vendasPromise,
      agendamentosPromise,
      contatosOutboxPromise,
      contatosEventosPromise,
      Promise.all(renovacaoOps),
      portalAccessPromise,
    ])

    const ids: string[] = []
    for (const v of vendasData ?? []) {
      if (v.vendedor_id) ids.push(v.vendedor_id as string)
      if (v.agente_registro_id) ids.push(v.agente_registro_id as string)
    }
    void resolveProfiles([...new Set(ids)])

    const renovacoesMap = new Map<string, RenovacaoResumo>()
    for (const res of renovacaoResults) {
      for (const row of (res.data ?? []) as RenovacaoResumo[]) renovacoesMap.set(row.id, row)
    }

    const contatosOutbox = ((outboxData ?? []) as CommunicationOutbox[]).map(item => ({
      id: item.id,
      origem: 'outbox' as const,
      canal: item.channel,
      destino: item.to_address,
      status: item.status,
      assunto: item.subject,
      corpo: item.body,
      created_at: item.created_at,
    }))

    const contatosEventos = ((eventosData ?? []) as Record<string, unknown>[]).map(item => {
      const payload = (item.payload ?? {}) as Record<string, unknown>
      const data = (payload.data ?? {}) as Record<string, unknown>
      return {
        id: String(item.id ?? `${item.contact}-${item.created_at}`),
        origem: 'evento' as const,
        canal: String(item.source ?? 'chatwoot'),
        destino: String(item.contact ?? '—'),
        status: String(item.event_type ?? 'evento'),
        assunto: data.sender ? `Conversa ${item.conversation_id ?? ''}`.trim() : null,
        corpo: String(data.content ?? payload.content ?? 'Evento sem conteúdo textual'),
        created_at: String(item.created_at ?? ''),
      }
    })

    const contatos = [...contatosOutbox, ...contatosEventos]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 25)

    setDetalhes(prev => ({
      ...prev,
      [cliente.id]: {
        vendas: (vendasData ?? []) as VendaResumida[],
        renovacoes: [...renovacoesMap.values()].sort((a, b) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime()),
        contatos,
        agendamentos: (agendamentosData ?? []) as Agendamento[],
        portal_access: (portalAccessResponse?.ok ? portalAccessResponse.access : null) as PortalAccessSummary | null,
      },
    }))

    setLoadingDetalhe(null)
  }

  function openNewCliente() {
    setClienteModal({ mode: 'novo' })
    setClienteForm(emptyClienteForm())
  }

  function openEditCliente(cliente: ClienteComVendas) {
    setClienteModal({ mode: 'editar', cliente })
    setClienteForm({
      tipo_cliente: cliente.tipo_cliente,
      cpf_cnpj: cliente.cpf_cnpj,
      nome: cliente.nome,
      nome_fantasia: cliente.nome_fantasia ?? '',
      email: cliente.email ?? '',
      telefone: cliente.telefone ?? '',
      cep: cliente.cep ?? '',
      logradouro: cliente.logradouro ?? '',
      numero: cliente.numero ?? '',
      complemento: cliente.complemento ?? '',
      bairro: cliente.bairro ?? '',
      cidade: cliente.cidade ?? '',
      uf: cliente.uf ?? '',
      inscricao_municipal: cliente.inscricao_municipal ?? '',
      inscricao_estadual: cliente.inscricao_estadual ?? '',
      iss_retido: cliente.iss_retido ?? false,
      status: cliente.status,
    })
  }

  async function saveCliente() {
    setSavingCliente(true)
    const cpfCnpj = normalizeDigits(clienteForm.cpf_cnpj)
    const cep = normalizeDigits(clienteForm.cep)
    const telefone = normalizeDigits(clienteForm.telefone)

    if (!cpfCnpj || !clienteForm.nome.trim()) {
      setSavingCliente(false)
      alert('Preencha ao menos CPF/CNPJ e nome do cliente.')
      return
    }

    const payload = {
      id: clienteModal?.mode === 'editar' && clienteModal.cliente ? clienteModal.cliente.id : undefined,
      tipo_cliente: clienteForm.tipo_cliente,
      tipo_cadastro: 'cliente',
      cpf_cnpj: cpfCnpj,
      nome: clienteForm.nome.trim(),
      nome_fantasia: clienteForm.nome_fantasia.trim() || null,
      email: clienteForm.email.trim() || null,
      telefone: telefone || null,
      cep: cep || null,
      logradouro: clienteForm.logradouro.trim() || null,
      numero: clienteForm.numero.trim() || null,
      complemento: clienteForm.complemento.trim() || null,
      bairro: clienteForm.bairro.trim() || null,
      cidade: clienteForm.cidade.trim() || null,
      uf: clienteForm.uf.trim().toUpperCase() || null,
      inscricao_municipal: clienteForm.inscricao_municipal.trim() || null,
      inscricao_estadual: clienteForm.inscricao_estadual.trim() || null,
      iss_retido: clienteForm.iss_retido,
      status: clienteForm.status,
    }

    try {
      const response = await fetch(getApiUrl('/comercial/clientes/save'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => null) as {
        ok?: boolean
        error?: string
      } | null

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error ?? 'Falha ao salvar cliente.')
      }

      setClienteModal(null)
      await fetchClientes()
    } catch (error) {
      console.error('Falha ao salvar cliente', { error, payload })
      alert(error instanceof Error ? error.message : 'Erro ao salvar cliente.')
    } finally {
      setSavingCliente(false)
    }
  }

  async function ensureLeadForCliente(cliente: ClienteComVendas) {
    const phoneCandidates = buildPhoneCandidates(cliente.telefone)
    let existingLead: Record<string, unknown> | null = null

    if (phoneCandidates.length > 0) {
      const { data } = await supabase
        .from('leads_contabilidade')
        .select('id, nome_lead, whatsapp_lead, evolution_remote_jid, evolution_instance')
        .in('whatsapp_lead', phoneCandidates)
        .order('created_at', { ascending: false })
        .limit(1)
      existingLead = (data?.[0] as Record<string, unknown> | undefined) ?? null
    }

    if (!existingLead) {
      const { data } = await supabase
        .from('leads_contabilidade')
        .insert([{
          nome_lead: cliente.nome,
          whatsapp_lead: cliente.telefone ?? null,
          motivo_contato: cliente.ultimo_produto ?? (cliente.tipo_cliente === 'pessoa_juridica' ? 'Cliente PJ' : 'Cliente PF'),
          resumo_conversa: `Contato criado a partir da base de clientes em ${new Date().toLocaleString('pt-BR')}.`,
          ultima_mensagem: null,
          status: 'cliente',
        }])
        .select('id, nome_lead, whatsapp_lead, evolution_remote_jid, evolution_instance')
        .single()
      existingLead = (data as Record<string, unknown> | null) ?? null
    }

    return existingLead
  }

  async function openChatFromCliente(cliente: ClienteComVendas) {
    if (!canAccessChat) {
      alert('Somente administradores, agentes de registro e operadores podem acessar o chat.')
      return
    }
    const lead = await ensureLeadForCliente(cliente)
    const phone = (lead?.whatsapp_lead as string | null) ?? cliente.telefone
    if (!phone) {
      alert('Este cliente ainda nao possui telefone cadastrado para abrir conversa.')
      return
    }
    openCentralChat({
      phone,
      contactName: (lead?.nome_lead as string | null) ?? cliente.nome,
      context: {
        origem: 'clientes',
        cliente_id: cliente.id,
        lead_id: lead?.id ? String(lead.id) : '',
        tipo_cliente: cliente.tipo_cliente,
      },
    })
  }

  async function openKanbanFromCliente(cliente: ClienteComVendas) {
    if (!canAccessChat) {
      alert('Somente administradores, agentes de registro e operadores podem acessar o chat.')
      return
    }
    const lead = await ensureLeadForCliente(cliente)
    const phone = (lead?.whatsapp_lead as string | null) ?? cliente.telefone
    if (!phone) {
      alert('Este cliente ainda nao possui telefone cadastrado para abrir conversa.')
      return
    }
    openCentralChat({
      phone,
      contactName: (lead?.nome_lead as string | null) ?? cliente.nome,
      context: {
        origem: 'clientes',
        cliente_id: cliente.id,
        lead_id: lead?.id ? String(lead.id) : '',
        foco: 'kanban',
      },
    })
  }

  async function togglePortalAccess(cliente: ClienteComVendas, currentStatus: 'ativo' | 'inativo') {
    const nextStatus = currentStatus === 'ativo' ? 'inativo' : 'ativo'
    const response = await fetch(getApiUrl('/comercial/clientes/access/status'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId: cliente.id, status: nextStatus }),
    })
    const data = await response.json().catch(() => null) as { ok?: boolean; error?: string; access?: PortalAccessSummary } | null
    if (!response.ok || !data?.ok) {
      alert(data?.error ?? 'Nao foi possivel atualizar o acesso do cliente.')
      return
    }
    setDetalhes(prev => {
      const detalheAtual = prev[cliente.id]
      if (!detalheAtual?.portal_access) return prev

      const proximoDetalhe: ClienteDetalhe = {
        ...detalheAtual,
        portal_access: {
          ...detalheAtual.portal_access,
          status: nextStatus,
        },
      }

      return {
        ...prev,
        [cliente.id]: proximoDetalhe,
      }
    })
  }

  function isSectionCollapsed(clienteId: string, section: string) {
    return collapsedSections[`${clienteId}:${section}`] ?? false
  }

  function toggleSectionCollapsed(clienteId: string, section: string) {
    const key = `${clienteId}:${section}`
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function applySearch() {
    setPage(0)
    setSearch(searchInput)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="flex flex-col h-full">
      <input
        ref={fileImportRef}
        type="file"
        accept=".csv,.xls,.xlsx"
        aria-label="Selecionar planilha de clientes"
        title="Selecionar planilha de clientes"
        className="hidden"
        onChange={handleImportFileChange}
      />

      {/* toolbar */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-wrap items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0 max-w-sm">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applySearch()}
              placeholder="Nome, CPF/CNPJ..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button type="button" onClick={applySearch}
            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
            Buscar
          </button>
          {search && (
            <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(0) }}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={14} />
            </button>
          )}
        </div>

        <select value={filterTipo} onChange={e => { setFilterTipo(e.target.value as '' | TipoCliente); setPage(0) }}
          className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os tipos</option>
          <option value="pessoa_fisica">Pessoa Física</option>
          <option value="pessoa_juridica">Pessoa Jurídica</option>
        </select>

        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value as '' | 'ativo' | 'inativo'); setPage(0) }}
          className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="inativo">Inativo</option>
        </select>

        <button type="button" onClick={() => void fetchClientes()} title="Atualizar"
          className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
          <RefreshCcw size={14} />
        </button>

        <button
          type="button"
          onClick={openImportModal}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/10 text-sm font-medium"
        >
          <Upload size={14} /> Importar carteira
        </button>

        <button
          type="button"
          onClick={openNewCliente}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
        >
          <Plus size={14} /> Novo cliente
        </button>

        <span className="text-xs text-gray-400 ml-auto">{total.toLocaleString('pt-BR')} clientes</span>
      </div>

      {/* table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 size={20} className="animate-spin mr-2" /> Carregando...
          </div>
        ) : clientes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <p className="font-medium">Nenhum cliente encontrado.</p>
            {search && <p className="text-sm mt-1">Tente uma busca diferente.</p>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 dark:bg-gray-800/80 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">
                <th className="px-4 py-3 font-medium"></th>
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">CPF / CNPJ</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Cidade/UF</th>
                <th className="px-4 py-3 font-medium hidden lg:table-cell">Contato</th>
                <th className="px-4 py-3 font-medium text-center">Vendas</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Último produto</th>
                <th className="px-4 py-3 font-medium hidden xl:table-cell">Último atendimento</th>
                <th className="px-4 py-3 font-medium text-right hidden lg:table-cell">Valor total</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {clientes.map(c => {
                const detalhe = detalhes[c.id]
                const contatoMaisRecente = detalhe?.contatos[0] ?? null
                const renovacoesAbertas = detalhe?.renovacoes.filter(r => r.status !== 'convertido' && r.status !== 'perdido').length ?? 0
                const agendamentosPendentes = detalhe?.agendamentos.filter(a => a.status === 'aguardando' || a.status === 'confirmado').length ?? 0
                const comprasHistorico = Array.isArray((c.metadata as { compras_historico?: unknown[] } | null)?.compras_historico)
                  ? (((c.metadata as { compras_historico?: unknown[] }).compras_historico ?? []) as Array<Record<string, unknown>>)
                  : []
                const portalCollapsed = isSectionCollapsed(c.id, 'portal')
                const vendasCollapsed = isSectionCollapsed(c.id, 'vendas')
                const renovacoesCollapsed = isSectionCollapsed(c.id, 'renovacoes')
                const contatosCollapsed = isSectionCollapsed(c.id, 'contatos')
                const comprasCollapsed = isSectionCollapsed(c.id, 'compras')
                const agendamentosCollapsed = isSectionCollapsed(c.id, 'agendamentos')

                return (
                <Fragment key={c.id}>
                  <tr key={c.id}
                    onClick={() => void toggleExpand(c)}
                    className={cn('hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors',
                      expandedId === c.id && 'bg-blue-50/50 dark:bg-blue-900/10')}>
                    <td className="px-4 py-3 text-gray-400">
                      {expandedId === c.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800 dark:text-gray-100 truncate max-w-[200px]">{c.nome}</p>
                      {c.nome_fantasia && c.nome_fantasia !== c.nome && (
                        <p className="text-xs text-gray-400 truncate max-w-[200px]">{c.nome_fantasia}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">
                      {formatDoc(c.cpf_cnpj)}
                      <span className="ml-1.5 text-[10px] font-sans text-gray-400">
                        {c.tipo_cliente === 'pessoa_fisica' ? 'PF' : 'PJ'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      {c.cidade ? `${c.cidade}${c.uf ? ` / ${c.uf}` : ''}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">
                      <p className="truncate max-w-[160px]">{c.email ?? '—'}</p>
                      {c.telefone && <p className="text-xs text-gray-400">{c.telefone}</p>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('text-sm font-semibold', c.total_vendas > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-300')}>
                        {c.total_vendas}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                      <p className="truncate max-w-[140px]">{c.ultimo_produto ?? '—'}</p>
                      {c.ultima_compra && <p className="text-xs text-gray-400">{formatDate(c.ultima_compra)}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden xl:table-cell">
                      {c.ultimo_agente_id ? (profileNomes.get(c.ultimo_agente_id) ?? '—') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      {c.valor_total > 0
                        ? <span className="text-green-600 dark:text-green-400 font-medium">{formatCurrency(c.valor_total)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
                        c.status === 'ativo'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400')}>
                        {c.status === 'ativo' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                  </tr>

                  {/* expanded: histórico de vendas */}
                  {expandedId === c.id && (
                    <tr key={`${c.id}-detail`} className="bg-blue-50/30 dark:bg-blue-900/5">
                      <td colSpan={10} className="px-6 pb-4 pt-2">
                        {loadingDetalhe === c.id ? (
                          <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                            <Loader2 size={12} className="animate-spin" /> Carregando dossiê do cliente...
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <ActionToolbarBtn icon={Pencil} label="Editar cliente" onClick={() => openEditCliente(c)} />
                              {canAccessChat && <ActionToolbarBtn icon={MessageCircle} label="Abrir chat" onClick={() => void openChatFromCliente(c)} />}
                              {canAccessChat && <ActionToolbarBtn icon={LifeBuoy} label="Ir para o Kanban" onClick={() => void openKanbanFromCliente(c)} />}
                              <ActionToolbarBtn
                                icon={Mail}
                                label="E-mail"
                                onClick={() => {
                                  if (!c.email) {
                                    alert('Este cliente ainda nao possui e-mail cadastrado.')
                                    return
                                  }
                                  window.location.href = `mailto:${c.email}`
                                }}
                              />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                              <InfoMini label="Cadastro desde" value={formatDate(c.created_at)} />
                              <InfoMini label="Renovações em aberto" value={String(renovacoesAbertas)} />
                              <InfoMini label="Agendamentos pendentes" value={String(agendamentosPendentes)} />
                              <InfoMini label="Último contato" value={contatoMaisRecente ? formatDateTime(contatoMaisRecente.created_at) : '—'} />
                              <InfoMini label="Endereço" value={c.cidade ? `${c.cidade}${c.uf ? ` / ${c.uf}` : ''}` : 'Não informado'} />
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                              <div className="bg-white dark:bg-gray-900 rounded-xl border border-blue-100 dark:border-blue-900/20 overflow-hidden xl:col-span-2">
                                <SectionTitle
                                  title="Acesso do portal"
                                  count={detalhe?.portal_access ? 1 : 0}
                                  collapsible
                                  collapsed={portalCollapsed}
                                  onToggle={() => toggleSectionCollapsed(c.id, 'portal')}
                                />
                                {!portalCollapsed && (!detalhe?.portal_access ? (
                                  <EmptySection label="Este cliente ainda não possui um acesso de portal vinculado." />
                                ) : (
                                  <div className="px-4 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                    <div>
                                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{detalhe.portal_access.nome}</p>
                                      <p className="text-xs text-gray-500 mt-1">{detalhe.portal_access.email ?? c.email ?? 'Sem e-mail informado'}</p>
                                      <div className="mt-2 flex items-center gap-2">
                                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
                                          detalhe.portal_access.status === 'ativo'
                                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400')}>
                                          {detalhe.portal_access.status === 'ativo' ? 'Liberado' : 'Aguardando/liberação bloqueada'}
                                        </span>
                                        <span className="text-xs text-gray-400">Cliente do portal</span>
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void togglePortalAccess(c, detalhe.portal_access!.status)}
                                        className={cn('px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                                          detalhe.portal_access.status === 'ativo'
                                            ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400'
                                            : 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400')}
                                      >
                                        {detalhe.portal_access.status === 'ativo' ? 'Desativar acesso' : 'Liberar acesso'}
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div className="bg-white dark:bg-gray-900 rounded-xl border border-blue-100 dark:border-blue-900/20 overflow-hidden">
                                <SectionTitle
                                  title="Histórico de vendas"
                                  count={detalhe?.vendas.length ?? 0}
                                  collapsible
                                  collapsed={vendasCollapsed}
                                  onToggle={() => toggleSectionCollapsed(c.id, 'vendas')}
                                />
                                {!vendasCollapsed && (!(detalhe?.vendas.length) ? (
                                  <EmptySection label="Nenhuma venda registrada para este cliente." />
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-gray-400 uppercase tracking-wide">
                                          <th className="px-4 py-2 text-left font-medium">Protocolo</th>
                                          <th className="px-4 py-2 text-left font-medium">Produto</th>
                                          <th className="px-4 py-2 text-left font-medium">Valor</th>
                                          <th className="px-4 py-2 text-left font-medium">Status</th>
                                          <th className="px-4 py-2 text-left font-medium">Vendedor</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-blue-100 dark:divide-blue-900/20">
                                        {detalhe.vendas.map(v => {
                                          const st = STATUS_LABEL[v.status_venda] ?? { label: v.status_venda, cls: 'bg-gray-100 text-gray-500' }
                                          return (
                                            <tr key={v.id} className="text-gray-600 dark:text-gray-300">
                                              <td className="px-4 py-2 font-mono">{v.protocolo_numero ?? '—'}</td>
                                              <td className="px-4 py-2">{v.tipo_produto}</td>
                                              <td className="px-4 py-2 font-medium text-green-600 dark:text-green-400">{v.valor_venda ? formatCurrency(v.valor_venda) : '—'}</td>
                                              <td className="px-4 py-2"><span className={cn('px-1.5 py-0.5 rounded font-medium', st.cls)}>{st.label}</span></td>
                                              <td className="px-4 py-2 text-gray-500">{v.vendedor_id ? (profileNomes.get(v.vendedor_id) ?? '—') : '—'}</td>
                                            </tr>
                                          )
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                ))}
                              </div>

                              <div className="bg-white dark:bg-gray-900 rounded-xl border border-blue-100 dark:border-blue-900/20 overflow-hidden">
                                <SectionTitle
                                  title="Renovações"
                                  count={detalhe?.renovacoes.length ?? 0}
                                  collapsible
                                  collapsed={renovacoesCollapsed}
                                  onToggle={() => toggleSectionCollapsed(c.id, 'renovacoes')}
                                />
                                {!renovacoesCollapsed && (!(detalhe?.renovacoes.length) ? (
                                  <EmptySection label="Nenhuma renovação encontrada para este cliente." />
                                ) : (
                                  <div className="divide-y divide-blue-100 dark:divide-blue-900/20">
                                    {detalhe.renovacoes.slice(0, 8).map(r => (
                                      <div key={r.id} className="px-4 py-3 flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{r.tipo_certificado}</p>
                                          <p className="text-xs text-gray-500">
                                            Vence em {formatDate(r.data_vencimento)} · {r.telefone ?? r.email ?? 'Sem contato'}
                                          </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                                            r.status === 'convertido' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                                            r.status === 'perdido' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                                            r.status === 'contatado' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                                            r.status === 'pendente' && 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
                                          )}>
                                            {r.status}
                                          </span>
                                          <p className="text-xs text-gray-400 mt-1">{r.valor ? formatCurrency(r.valor) : 'Sem valor'}</p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>

                              <div className="bg-white dark:bg-gray-900 rounded-xl border border-blue-100 dark:border-blue-900/20 overflow-hidden">
                                <SectionTitle
                                  title="Histórico de contato"
                                  count={detalhe?.contatos.length ?? 0}
                                  collapsible
                                  collapsed={contatosCollapsed}
                                  onToggle={() => toggleSectionCollapsed(c.id, 'contatos')}
                                />
                                {!contatosCollapsed && (!(detalhe?.contatos.length) ? (
                                  <EmptySection label="Nenhum contato encontrado nas filas e eventos." />
                                ) : (
                                  <div className="divide-y divide-blue-100 dark:divide-blue-900/20">
                                    {detalhe.contatos.slice(0, 8).map(item => (
                                      <div key={item.id} className="px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{item.canal} · {item.status}</p>
                                          <span className="text-xs text-gray-400">{formatDateTime(item.created_at)}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">{item.destino}</p>
                                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 line-clamp-2">{item.assunto ? `${item.assunto} · ` : ''}{item.corpo}</p>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>

                              <div className="bg-white dark:bg-gray-900 rounded-xl border border-blue-100 dark:border-blue-900/20 overflow-hidden">
                                <SectionTitle
                                  title="Histórico de compras (importação)"
                                  count={comprasHistorico.length}
                                  collapsible
                                  collapsed={comprasCollapsed}
                                  onToggle={() => toggleSectionCollapsed(c.id, 'compras')}
                                />
                                {!comprasCollapsed && (!comprasHistorico.length ? (
                                  <EmptySection label="Nenhum histórico de compras importado para este cliente." />
                                ) : (
                                  <div className="divide-y divide-blue-100 dark:divide-blue-900/20">
                                    {comprasHistorico.slice(-8).reverse().map((item, idx) => (
                                      <div key={`${c.id}-hist-${idx}`} className="px-4 py-3">
                                        <div className="flex items-center justify-between gap-3">
                                          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{String(item.produto ?? item.tipo ?? 'Compra importada')}</p>
                                          <span className="text-xs text-gray-400">{formatDateTime(String(item.imported_at ?? ''))}</span>
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">
                                          Pedido: {String(item.pedido ?? '—')} · Protocolo: {String(item.protocolo ?? '—')} · Vencimento: {String(item.vencimento ?? item.validade ?? '—')}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                          Status: {String(item.status_pedido ?? '—')} · Vendedor: {String(item.vendedor ?? '—')} · AR: {String(item.ar ?? item.ponto ?? '—')}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>

                              <div className="bg-white dark:bg-gray-900 rounded-xl border border-blue-100 dark:border-blue-900/20 overflow-hidden">
                                <SectionTitle
                                  title="Agendamentos"
                                  count={detalhe?.agendamentos.length ?? 0}
                                  collapsible
                                  collapsed={agendamentosCollapsed}
                                  onToggle={() => toggleSectionCollapsed(c.id, 'agendamentos')}
                                />
                                {!agendamentosCollapsed && (!(detalhe?.agendamentos.length) ? (
                                  <EmptySection label="Nenhum agendamento encontrado para este cliente." />
                                ) : (
                                  <div className="divide-y divide-blue-100 dark:divide-blue-900/20">
                                    {detalhe.agendamentos.slice(0, 8).map(a => (
                                      <div key={a.id} className="px-4 py-3 flex items-start justify-between gap-4">
                                        <div>
                                          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{a.servico}</p>
                                          <p className="text-xs text-gray-500">{formatDateTime(a.data_hora)} · {a.telefone ?? 'Sem telefone'}</p>
                                        </div>
                                        <span className="text-xs text-gray-500 capitalize">{a.status}</span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )})}
            </tbody>
          </table>
        )}
      </div>

      {/* pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              Página {page + 1} de {totalPages} — {total.toLocaleString('pt-BR')} clientes
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Mostrar</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(0) }}
                className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PAGE_SIZE_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <span className="text-xs text-gray-400">por página</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Anterior
            </button>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Próxima
            </button>
          </div>
        </div>
      )}

      {clienteModal && (
        <ClienteEditorModal
          mode={clienteModal.mode}
          form={clienteForm}
          onClose={() => setClienteModal(null)}
          onSave={() => void saveCliente()}
          onChange={setClienteForm}
          saving={savingCliente}
        />
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-6xl max-h-[90vh] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">Importar carteira de clientes</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Mapeie as colunas da planilha e confirme a importação.</p>
              </div>
              <button type="button" title="Fechar" onClick={resetImportState} className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400">
                <span className="sr-only">Fechar importação</span>
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-4">
              <div className="rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/60 dark:bg-blue-900/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Sugestão automática de encaixe</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">O sistema tentou identificar os campos com base no cabeçalho e nas primeiras linhas da planilha.</p>
                  </div>
                  <p className="text-xs text-gray-400">{detectedImportFields.length} campo(s) detectado(s)</p>
                </div>
                {detectedImportFields.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {detectedImportFields.slice(0, 12).map(({ field, header }) => (
                      <span key={field.key} className="inline-flex items-center gap-2 rounded-full bg-white/90 dark:bg-gray-900 px-3 py-1 text-xs text-gray-700 dark:text-gray-200 border border-blue-100 dark:border-blue-900/30">
                        <strong>{field.label}</strong>
                        <span className="text-gray-400">→</span>
                        <span className="text-blue-700 dark:text-blue-300">{header}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Não consegui sugerir mapeamento automático para esta planilha; faça o encaixe manual.</p>
                )}
              </div>

              <div className="rounded-xl border border-amber-100 dark:border-amber-900/30 bg-amber-50/60 dark:bg-amber-900/10 p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Validação da planilha</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Mostra quantas linhas têm dados suficientes para entrar na base.</p>
                  </div>
                  <p className="text-xs text-gray-400">{importValidationSummary.accepted} aceitas · {importValidationSummary.rejected} rejeitadas</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-white/90 dark:bg-gray-900 px-3 py-2 border border-amber-100 dark:border-amber-900/20">
                    <p className="text-lg font-bold text-emerald-600">{importValidationSummary.accepted}</p>
                    <p className="text-xs text-gray-500">Válidas para importar</p>
                  </div>
                  <div className="rounded-lg bg-white/90 dark:bg-gray-900 px-3 py-2 border border-amber-100 dark:border-amber-900/20">
                    <p className="text-lg font-bold text-amber-600">{importValidationSummary.rejected}</p>
                    <p className="text-xs text-gray-500">Serão ignoradas</p>
                  </div>
                  <div className="rounded-lg bg-white/90 dark:bg-gray-900 px-3 py-2 border border-amber-100 dark:border-amber-900/20">
                    <p className="text-lg font-bold text-blue-600">{importValidationSummary.total}</p>
                    <p className="text-xs text-gray-500">Linhas lidas</p>
                  </div>
                </div>
                {Object.keys(importValidationSummary.reasons).length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {Object.entries(importValidationSummary.reasons).map(([reason, count]) => (
                      <span key={reason} className="inline-flex items-center gap-2 rounded-full bg-white/90 dark:bg-gray-900 px-3 py-1 text-xs text-gray-700 dark:text-gray-200 border border-amber-100 dark:border-amber-900/20">
                        <strong>{count}</strong>
                        <span>{reason}</span>
                      </span>
                    ))}
                  </div>
                )}
                {importValidationSummary.samples.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {importValidationSummary.samples.map(sample => (
                      <p key={sample.index} className="text-xs text-amber-700 dark:text-amber-300">
                        Linha {sample.index + 1}: {sample.reason}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  {CLIENT_IMPORT_FIELDS.map(field => (
                    <label key={field.key} className="text-xs text-gray-600 dark:text-gray-300 space-y-1 block">
                      <span className="font-medium">{field.label}{field.required ? ' *' : ''}</span>
                      <select
                        aria-label={`Mapear coluna para ${field.label}`}
                        title={`Mapear coluna para ${field.label}`}
                        value={importColumnMap[field.key] ?? ''}
                        onChange={e => setImportColumnMap(prev => ({ ...prev, [field.key]: e.target.value || undefined }))}
                        className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1.5 text-xs"
                      >
                        <option value="">Não mapear</option>
                        {importHeaders.map(header => (
                          <option key={`${field.key}-${header}`} value={header}>{header}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                <table className="w-full min-w-[1300px] text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 uppercase">
                      {CLIENT_IMPORT_FIELDS.map(field => <th key={field.key} className="px-3 py-2 text-left">{field.label}</th>)}
                      <th className="px-3 py-2 text-left">OK</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {mappedImportRows.slice(0, 12).map((row, idx) => {
                      const ok = !!((row.documento || row.cpf_cnpj || row.cpf || row.cnpj || '').trim() && (row.nome || row.razao_social || '').trim())
                      return (
                        <tr key={idx} className={cn(!ok && 'opacity-50')}>
                          {CLIENT_IMPORT_FIELDS.map(field => (
                            <td key={`${idx}-${field.key}`} className="px-3 py-2 truncate max-w-[180px] text-gray-700 dark:text-gray-300">{row[field.key] || '—'}</td>
                          ))}
                          <td className="px-3 py-2">{ok ? <Check size={12} className="text-green-600" /> : <X size={12} className="text-red-500" />}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {importResult && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-center">
                    <div className="rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2">
                      <p className="text-xl font-bold text-green-600">{importResult.criados}</p>
                      <p className="text-xs text-green-700 dark:text-green-400">Criados</p>
                    </div>
                    <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 px-3 py-2">
                      <p className="text-xl font-bold text-blue-600">{importResult.atualizados}</p>
                      <p className="text-xs text-blue-700 dark:text-blue-400">Atualizados</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
                      <p className="text-xl font-bold text-amber-600">{importResult.ignorados}</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400">Ignorados (validação)</p>
                    </div>
                    <div className="rounded-lg bg-violet-50 dark:bg-violet-900/20 px-3 py-2">
                      <p className="text-xl font-bold text-violet-600">{importResult.ignoradosDuplicidade}</p>
                      <p className="text-xs text-violet-700 dark:text-violet-400">Ignorados (duplicidade)</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/90 dark:bg-gray-900 px-3 py-1 text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-800">
                      <strong>{importResult.resumoIgnorados.semDocumento}</strong>
                      <span>sem documento</span>
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/90 dark:bg-gray-900 px-3 py-1 text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-800">
                      <strong>{importResult.resumoIgnorados.semNome}</strong>
                      <span>sem nome</span>
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/90 dark:bg-gray-900 px-3 py-1 text-xs text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-800">
                      <strong>{importResult.resumoIgnorados.duplicidadeHistorico}</strong>
                      <span>duplicidade de histórico</span>
                    </span>
                  </div>
                  {importResult.erros.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-red-600 mb-1">Erros (primeiros 50)</p>
                      <div className="max-h-28 overflow-y-auto space-y-1">
                        {importResult.erros.map((err, i) => (
                          <div key={`${err.linha}-${i}`} className="text-xs text-red-600 bg-red-50 dark:bg-red-900/10 px-2 py-1 rounded">
                            Linha {err.linha}: {err.motivo}{err.cpf_cnpj ? ` (${err.cpf_cnpj})` : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500">
                {validImportRows.length} registro(s) válidos de {mappedImportRows.length}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={resetImportState} className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">Fechar</button>
                <button
                  type="button"
                  onClick={() => void confirmarImportacaoClientes()}
                  disabled={importingClientes || validImportRows.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {importingClientes ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {importingClientes
                    ? `Importando ${importProgress?.done ?? 0}/${importProgress?.total ?? validImportRows.length}...`
                    : `Importar ${validImportRows.length} clientes`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-blue-100 dark:border-blue-900/20 bg-white dark:bg-gray-900 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mt-1">{value}</p>
    </div>
  )
}

function SectionTitle({
  title,
  count,
  collapsible = false,
  collapsed = false,
  onToggle,
}: {
  title: string
  count: number
  collapsible?: boolean
  collapsed?: boolean
  onToggle?: () => void
}) {
  return (
    <div className="px-4 py-3 border-b border-blue-100 dark:border-blue-900/20 bg-blue-50/60 dark:bg-blue-900/10 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">{count}</span>
        {collapsible && (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation()
              onToggle?.()
            }}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 dark:border-blue-900/40 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100/70 dark:hover:bg-blue-900/30 transition-colors"
          >
            {collapsed ? 'Expandir' : 'Ocultar'}
            {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          </button>
        )}
      </div>
    </div>
  )
}

function EmptySection({ label }: { label: string }) {
  return <div className="px-4 py-6 text-sm text-gray-400">{label}</div>
}

function ActionToolbarBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Pencil
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-blue-100 dark:border-blue-900/20 bg-white dark:bg-gray-900 text-sm text-gray-700 dark:text-gray-200 hover:border-blue-300 hover:text-blue-700 transition-colors"
    >
      <Icon size={14} />
      {label}
    </button>
  )
}

function ClienteEditorModal({
  mode,
  form,
  onClose,
  onSave,
  onChange,
  saving,
}: {
  mode: 'novo' | 'editar'
  form: ClienteFormState
  onClose: () => void
  onSave: () => void
  onChange: (next: ClienteFormState) => void
  saving: boolean
}) {
  const [cepLoading, setCepLoading] = useState(false)
  const [cnpjLoading, setCnpjLoading] = useState(false)

  async function handleCepBlur() {
    const cep = normalizeDigits(form.cep)
    if (cep.length !== 8) return

    setCepLoading(true)
    const r = await buscarCep(cep)
    setCepLoading(false)
    if (!r) return

    onChange({
      ...form,
      logradouro: form.logradouro || r.logradouro,
      bairro: form.bairro || r.bairro,
      cidade: form.cidade || r.localidade,
      uf: form.uf || r.uf,
    })
  }

  async function handleCnpjBlur() {
    const cnpj = normalizeDigits(form.cpf_cnpj)
    if (cnpj.length !== 14) return

    setCnpjLoading(true)
    const result = await buscarCnpj(cnpj)
    setCnpjLoading(false)
    if (!result) return

    onChange({
      ...form,
      tipo_cliente: 'pessoa_juridica',
      nome: form.nome || result.razao_social,
      nome_fantasia: form.nome_fantasia || result.nome_fantasia || '',
      cep: form.cep || result.cep || '',
      logradouro: form.logradouro || result.logradouro || '',
      numero: form.numero || result.numero || '',
      complemento: form.complemento || result.complemento || '',
      bairro: form.bairro || result.bairro || '',
      cidade: form.cidade || result.municipio || '',
      uf: form.uf || result.uf || '',
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-5xl max-h-[92vh] rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">{mode === 'novo' ? 'Novo cliente' : 'Editar cliente'}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Cadastre e ajuste o contato sem sair da tela de clientes.</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ModalField label="Tipo">
            <select
              value={form.tipo_cliente}
              onChange={e => onChange({ ...form, tipo_cliente: e.target.value as TipoCliente })}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm"
            >
              <option value="pessoa_fisica">Pessoa Física</option>
              <option value="pessoa_juridica">Pessoa Jurídica</option>
            </select>
          </ModalField>
          <ModalField label="CPF / CNPJ">
            <div className="relative">
              <input
                value={form.cpf_cnpj}
                onChange={e => onChange({ ...form, cpf_cnpj: e.target.value })}
                onBlur={() => void handleCnpjBlur()}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 pr-10 text-sm"
              />
              {cnpjLoading && (
                <span className="absolute inset-y-0 right-3 flex items-center text-gray-400">
                  <Loader2 size={15} className="animate-spin" />
                </span>
              )}
            </div>
          </ModalField>
          <ModalField label="Nome / Razão social">
            <input value={form.nome} onChange={e => onChange({ ...form, nome: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Nome fantasia">
            <input value={form.nome_fantasia} onChange={e => onChange({ ...form, nome_fantasia: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="E-mail">
            <input value={form.email} onChange={e => onChange({ ...form, email: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Telefone">
            <input value={form.telefone} onChange={e => onChange({ ...form, telefone: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="CEP">
            <div className="relative">
              <input
                value={form.cep}
                onChange={e => onChange({ ...form, cep: e.target.value })}
                onBlur={() => void handleCepBlur()}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 pr-10 text-sm"
              />
              {cepLoading && (
                <span className="absolute inset-y-0 right-3 flex items-center text-gray-400">
                  <Loader2 size={15} className="animate-spin" />
                </span>
              )}
            </div>
          </ModalField>
          <ModalField label="Cidade">
            <input value={form.cidade} onChange={e => onChange({ ...form, cidade: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="UF">
            <input value={form.uf} onChange={e => onChange({ ...form, uf: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Inscrição Municipal">
            <input value={form.inscricao_municipal} onChange={e => onChange({ ...form, inscricao_municipal: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Inscrição Estadual">
            <input value={form.inscricao_estadual} onChange={e => onChange({ ...form, inscricao_estadual: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Logradouro" className="md:col-span-2">
            <input value={form.logradouro} onChange={e => onChange({ ...form, logradouro: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Número">
            <input value={form.numero} onChange={e => onChange({ ...form, numero: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Bairro">
            <input value={form.bairro} onChange={e => onChange({ ...form, bairro: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Complemento" className="md:col-span-2">
            <input value={form.complemento} onChange={e => onChange({ ...form, complemento: e.target.value })} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm" />
          </ModalField>
          <ModalField label="Retém ISS?">
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-3 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={form.iss_retido}
                onChange={e => onChange({ ...form, iss_retido: e.target.checked })}
              />
              Marque quando o cliente tiver ISS retido
            </label>
          </ModalField>
          <ModalField label="Status">
            <select
              value={form.status}
              onChange={e => onChange({ ...form, status: e.target.value as 'ativo' | 'inativo' })}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-sm"
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </ModalField>
        </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
            Cancelar
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar cliente
          </button>
        </div>
      </div>
    </div>
  )
}

function ModalField({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  )
}
