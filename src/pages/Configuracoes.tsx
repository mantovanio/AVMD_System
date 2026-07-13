import { useState, useEffect, useCallback } from 'react'
import { Loader2, MapPin, Pencil, X, Check, KeyRound, UserPlus, Eye, EyeOff, MessageCircle, Mail, Webhook, Save, Send, Trash2, Plus, ToggleLeft, ToggleRight, CreditCard, FileText, Upload, ShieldCheck, ChevronDown, ChevronRight, Users, Link, Network, Percent, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase, getEdgeFunctionUrl, getSupabaseAccessToken } from '@/lib/supabase'
import { getEvolutionConnectionTestUrl, getEvolutionWebhookConfigureUrl, getEvolutionWebhookUrl } from '@/lib/evolutionApi'
import { getApiUrl } from '@/lib/api'
import { createAdminManagedUser, deleteAdminManagedUser, updateAdminManagedPassword } from '@/lib/adminUsers'
import { DEFAULT_AGENCY_CONFIG, type AgencyConfig, fetchAgencyConfig } from '@/lib/agencyConfig'
import { DEFAULT_CONTACT_DOCUMENT_STORAGE, loadContactDocumentStorageConfig, type ContactDocumentStorageConfig } from '@/lib/contactDocumentStorage'
import { DEFAULT_CRM_CHAT_SETTINGS, loadCrmChatSettings } from '@/lib/crmChatSettings'
import { buildWhatsAppMetadata, getWhatsAppEngine, getWhatsAppEngineLabel, isWhatsAppIntegration, normalizeWhatsAppProvider } from '@/lib/whatsappIntegration'
import { DEFAULT_PERMISSIONS, PAGE_PERMISSIONS, hasPerfil, isAdminProfile } from '@/lib/security'
import { buscarCep } from '@/lib/cep'
import NfseDocumentPreview from '@/components/NfseDocumentPreview'
import ModulePageShell from '@/components/ModulePageShell'
import {
  DEFAULT_NFSE_AUTOMATION_SETTINGS,
  DEFAULT_NFSE_MODELO,
  normalizeNfseAutomationSettings,
  type NfseAutomationSettings,
  type NfseEmissionTrigger,
  type NfseModeloLayout,
} from '@/lib/nfse'
import { useAuth } from '@/contexts/AuthContext'
import type {
  AmbienteNfse,
  AutomationRule,
  CommunicationOutbox,
  ExternalIntegration,
  IntegrationProvider,
  IntegrationStatus,
  LojaMarketplace,
  NfseConfiguracao,
  Parceiro,
  PerfilAcesso,
  PermissaoPagina,
  PontoAtendimento,
  ProvedorNfse,
  NovoPontoAtendimento,
  Profile,
  TabelaPreco,
  TipoVinculoUsuario,
  WhatsAppEngine,
} from '@/types'

type Tab = 'geral' | 'integracoes' | 'automacoes' | 'usuarios' | 'permissoes' | 'pontos' | 'pagamentos' | 'fiscal' | 'privacidade'

const TABS: { id: Tab; label: string }[] = [
  { id: 'geral',        label: 'Geral'                  },
  { id: 'integracoes',  label: 'Integrações'            },
  { id: 'automacoes',   label: 'Automações'             },
  { id: 'usuarios',     label: 'Usuários'               },
  { id: 'permissoes',   label: 'Permissões'             },
  { id: 'pontos',       label: 'Pontos de Atendimento'  },
  { id: 'pagamentos',   label: 'Pagamentos'             },
  { id: 'fiscal',       label: 'Fiscal / NFS-e'         },
  { id: 'privacidade',  label: 'Privacidade (LGPD)'     },
]

const ADMIN_ONLY_TABS: Tab[] = ['fiscal', 'permissoes']

const PERFIL_LABEL: Record<PerfilAcesso, string> = {
  admin:           'Administrador',
  agente_registro: 'Agente de Registro',
  vendedor:        'Vendedor / Parceiro',
  usuario:         'Usuário',
}

const PERFIL_COLOR: Record<PerfilAcesso, string> = {
  admin:           'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  agente_registro: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  vendedor:        'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  usuario:         'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

const TIPO_VINCULO_LABEL: Record<TipoVinculoUsuario, string> = {
  agente_registro: 'Agente de Registro',
  parceiro:        'Parceiro',
  vendedor:        'Vendedor',
  contador:        'Contador',
  usuario_comum:   'Usuário comum',
  cliente_portal:  'Cliente do portal',
}

type UserEditForm = {
  nome: string
  email: string
  perfil: PerfilAcesso
  status: 'ativo' | 'inativo'
  tipo_vinculo: TipoVinculoUsuario
  parceiro_id: string
  vinculo_nome: string
  documento: string
  telefone: string
  cidade: string
  observacoes: string
  permissoes: PermissaoPagina[]
}

type ModalSenha = { userId: string; nome: string } | null
type ModalNovoUsuario = { aberto: boolean }
const ADMIN_INITIAL_PASSWORD = '1234qwer'

function validateStrongPassword(value: string) {
  const password = value.trim()
  if (password.length < 8) return 'Use pelo menos 8 caracteres.'
  if (!/[A-Z]/.test(password)) return 'Inclua pelo menos 1 letra maiúscula.'
  if (!/[a-z]/.test(password)) return 'Inclua pelo menos 1 letra minúscula.'
  if (!/\d/.test(password)) return 'Inclua pelo menos 1 número.'
  return null
}

const PROVIDER_LABEL: Record<IntegrationProvider, string> = {
  evolution:         'WhatsApp API',
  chatwoot:          'Chatwoot / WhatsApp (Atendimento)',
  chatwoot_disparo:  'Chatwoot / WhatsApp (Disparos)',
  email_smtp:        'Email SMTP',
  n8n:               'N8N Webhooks',
  gestao_ar:         'CertiID / Gestão AR',
  safe2pay:          'Safe2Pay',
  safeweb:           'Safeweb',
  supabase:          'Supabase',
}

const STATUS_LABEL: Record<IntegrationStatus, string> = {
  ativo: 'Conectado',
  pendente: 'Configurar',
  erro: 'Erro',
  inativo: 'Inativo',
}

const STATUS_CLASS: Record<IntegrationStatus, string> = {
  ativo: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pendente: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  erro: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  inativo: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

function integrationOperationalLabel(integracao: Pick<ExternalIntegration, 'status' | 'last_error' | 'last_test_at'>) {
  if (integracao.status === 'ativo') {
    return {
      title: 'Operando normalmente',
      detail: integracao.last_test_at
        ? `Validado em ${new Date(integracao.last_test_at).toLocaleString('pt-BR')}`
        : 'Conexao pronta para uso.',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300',
      dot: 'bg-emerald-500',
    }
  }

  if (integracao.status === 'pendente') {
    return {
      title: 'Aguardando validacao',
      detail: integracao.last_error || 'Preencha os dados e salve para conectar automaticamente.',
      tone: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300',
      dot: 'bg-amber-500',
    }
  }

  return {
    title: integracao.status === 'inativo' ? 'Canal inativo' : 'Canal com falha',
    detail: integracao.last_error || 'A integracao nao respondeu corretamente.',
    tone: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300',
    dot: 'bg-red-500',
  }
}

function providerIcon(provider: IntegrationProvider, forceWhatsApp = false) {
  if (forceWhatsApp || provider === 'evolution' || provider === 'chatwoot' || provider === 'chatwoot_disparo') return MessageCircle
  if (provider === 'email_smtp') return Mail
  return Webhook
}

const WHATSAPP_ENGINE_OPTIONS: WhatsAppEngine[] = ['evolution', 'zapi', 'custom']

function automationChannelLabel(channel: AutomationRule['channel']) {
  const labels: Record<AutomationRule['channel'], string> = {
    whatsapp: 'WhatsApp',
    email: 'Email',
    whatsapp_email: 'WhatsApp + Email',
    webhook: 'Webhook',
  }
  return labels[channel]
}

function ModalOverlay({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">{titulo}</h3>
          <button type="button" onClick={onClose} title="Fechar" className="w-7 h-7 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors">
            <X size={15} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function CampoSenha({ label, value, onChange, autoFocus }: { label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoFocus={autoFocus}
          className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 pr-9 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Mínimo 8 caracteres"
        />
        <button type="button" onClick={() => setShow(s => !s)}
          title={show ? 'Ocultar senha' : 'Mostrar senha'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  )
}

function AbaGeral() {
  const { profile } = useAuth()
  const isAdmin = isAdminProfile(profile)
  const [form, setForm] = useState<AgencyConfig>(DEFAULT_AGENCY_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [chatSettingsSignOutgoing, setChatSettingsSignOutgoing] = useState(DEFAULT_CRM_CHAT_SETTINGS.sign_outgoing_messages)
  const [chatSettingsLoading, setChatSettingsLoading] = useState(true)
  const [chatSettingsSaving, setChatSettingsSaving] = useState(false)
  const [chatSettingsOk, setChatSettingsOk] = useState(false)
  const [chatSettingsError, setChatSettingsError] = useState<string | null>(null)
  const [timeoutEnabled, setTimeoutEnabled] = useState(true)
  const [timeoutMinutes, setTimeoutMinutes] = useState(10)
  const [timeoutLoading, setTimeoutLoading] = useState(true)
  const [timeoutSaving, setTimeoutSaving] = useState(false)
  const [timeoutOk, setTimeoutOk] = useState(false)
  const [timeoutError, setTimeoutError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setErro(null)
    setChatSettingsLoading(true)
    setChatSettingsError(null)
    setTimeoutLoading(true)
    setTimeoutError(null)
    const [{ data, error }, chatSettings, timeoutRes] = await Promise.all([
      fetchAgencyConfig(),
      loadCrmChatSettings(),
      fetch(getApiUrl('/chat/crm/config')).then(r => r.json()).catch(() => null),
    ])

    if (error) {
      setErro(`Erro ao carregar configurações: ${error.message}. Execute sql/settings_users_permissions_migration.sql no Supabase.`)
      setLoading(false)
      setChatSettingsLoading(false)
      setTimeoutLoading(false)
      return
    }

    setForm(data)
    setLoading(false)
    setChatSettingsSignOutgoing(chatSettings.data.sign_outgoing_messages)
    setChatSettingsLoading(false)
    if (timeoutRes?.ok) {
      setTimeoutEnabled(timeoutRes.enabled)
      setTimeoutMinutes(timeoutRes.minutes)
    }
    setTimeoutLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function updateField<K extends keyof AgencyConfig>(key: K, value: AgencyConfig[K]) {
    setOk(false)
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function salvar() {
    if (!isAdmin) return
    setSaving(true)
    setErro(null)
    setOk(false)
    const response = await fetch(getApiUrl('/app-settings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'agency', value: form, updated_by: profile?.id ?? null }),
    }).catch(() => null)
    setSaving(false)
    const payload = await response?.json().catch(() => null) as { ok?: boolean; error?: string } | null
    if (!response?.ok || !payload?.ok) {
      setErro(`Erro ao salvar: ${payload?.error ?? 'Não foi possível salvar a configuração da agência.'}`)
      return
    }
    setOk(true)
  }

  async function salvarChatSettings() {
    if (!isAdmin) return
    setChatSettingsSaving(true)
    setChatSettingsError(null)
    setChatSettingsOk(false)
    const response = await fetch(getApiUrl('/app-settings'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: 'crm_chat_settings',
        value: { sign_outgoing_messages: chatSettingsSignOutgoing },
        updated_by: profile?.id ?? null,
      }),
    }).catch(() => null)
    setChatSettingsSaving(false)
    const payload = await response?.json().catch(() => null) as { ok?: boolean; error?: string } | null
    if (!response?.ok || !payload?.ok) {
      setChatSettingsError(`Erro ao salvar configuração do chat: ${payload?.error ?? 'Não foi possível salvar a preferência do chat.'}`)
      return
    }
    setChatSettingsOk(true)
  }

  async function salvarTimeoutConfig() {
    if (!isAdmin) return
    setTimeoutSaving(true)
    setTimeoutError(null)
    setTimeoutOk(false)
    try {
      const res = await fetch(getApiUrl('/chat/crm/config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: timeoutEnabled, minutes: timeoutMinutes }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Erro ao salvar')
      setTimeoutOk(true)
    } catch (err) {
      setTimeoutError(err instanceof Error ? err.message : 'Erro ao salvar')
    }
    setTimeoutSaving(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="font-semibold text-gray-800 dark:text-gray-200">Informações da Agência</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Esses dados são salvos no Supabase e podem ser usados como referência nas telas do sistema.
        </p>
      </div>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
        <ConfigInput label="Nome da Agência" value={form.nome_agencia} onChange={v => updateField('nome_agencia', v)} />
        <ConfigInput label="Responsável" value={form.responsavel} onChange={v => updateField('responsavel', v)} />
        <ConfigInput label="Telefone" value={form.telefone} onChange={v => updateField('telefone', v)} />
        <ConfigInput label="Cidade" value={form.cidade} onChange={v => updateField('cidade', v)} />
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Identidade visual do login</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Aqui você pode trocar separadamente a imagem do login e a imagem da parte interna do sistema.
          </p>
        </div>
        <ConfigInput
          label="URL da logomarca do login"
          value={form.logo_login_url}
          onChange={v => updateField('logo_login_url', v)}
          placeholder="https://seusite.com/logo-login.png"
        />
        <ConfigInput
          label="URL da logomarca interna"
          value={form.logo_interna_url}
          onChange={v => updateField('logo_interna_url', v)}
          placeholder="https://seusite.com/logo-interna.png"
        />
        <ConfigInput
          label="URL da logomarca antiga"
          value={form.logo_url}
          onChange={v => updateField('logo_url', v)}
          placeholder="https://seusite.com/logo.png"
        />
        <ConfigInput label="Título do login" value={form.login_titulo} onChange={v => updateField('login_titulo', v)} />
        <ConfigInput label="Subtítulo do login" value={form.login_subtitulo} onChange={v => updateField('login_subtitulo', v)} />
        <div className="grid gap-4 md:grid-cols-3">
          <ConfigInput label="Cor principal" value={form.cor_primaria} onChange={v => updateField('cor_primaria', v)} placeholder="#2563eb" />
          <ConfigInput label="Fundo inicial" value={form.fundo_inicio} onChange={v => updateField('fundo_inicio', v)} placeholder="#172554" />
          <ConfigInput label="Fundo final" value={form.fundo_fim} onChange={v => updateField('fundo_fim', v)} placeholder="#1e3a8a" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div
            className="rounded-2xl p-5 text-white border border-white/10 shadow-inner"
            style={{ background: `linear-gradient(135deg, ${form.fundo_inicio}, ${form.fundo_fim})` }}
          >
            <p className="text-xs uppercase tracking-wide text-white/70 mb-3">Prévia do login</p>
            <div className="flex items-center gap-4">
              {form.logo_login_url.trim() ? (
                <img
                  src={form.logo_login_url}
                  alt={form.login_titulo}
                  className="w-14 h-14 rounded-2xl object-contain bg-white/10 p-2"
                />
              ) : (
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                  style={{ backgroundColor: form.cor_primaria }}
                >
                  <span className="text-lg font-bold">ID</span>
                </div>
              )}
              <div>
                <p className="text-lg font-semibold">{form.login_titulo}</p>
                <p className="text-sm text-white/80">{form.login_subtitulo}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl p-5 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
            <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">Prévia interna</p>
            <div className="flex items-center gap-4">
              {form.logo_interna_url.trim() ? (
                <img
                  src={form.logo_interna_url}
                  alt={form.nome_agencia}
                  className="w-14 h-14 rounded-2xl object-contain bg-gray-50 dark:bg-gray-900 p-2 border border-gray-200 dark:border-gray-800"
                />
              ) : (
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shadow-lg"
                  style={{ backgroundColor: form.cor_primaria }}
                >
                  <span className="text-lg font-bold">ID</span>
                </div>
              )}
              <div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{form.nome_agencia}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Barra lateral e topo do sistema</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Chat e assinaturas</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Decide se as mensagens enviadas pelo CRM saem assinadas com o nome do usuário logado.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Assinar mensagens enviadas</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Quando ativado, o texto sai como “— Nome do usuário”. Quando desativado, a mensagem sai limpa.
              </p>
            </div>
            <button
              type="button"
              disabled={!isAdmin || chatSettingsLoading}
              onClick={() => {
                setChatSettingsOk(false)
                setChatSettingsError(null)
                setChatSettingsSignOutgoing(prev => !prev)
              }}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-60"
            >
              {chatSettingsSignOutgoing ? <ToggleRight size={18} className="text-emerald-600" /> : <ToggleLeft size={18} className="text-slate-400" />}
              {chatSettingsSignOutgoing ? 'Ligado' : 'Desligado'}
            </button>
          </div>
          {chatSettingsError && (
            <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {chatSettingsError}
            </p>
          )}
          {chatSettingsOk && (
            <p className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
              Preferência de assinatura salva.
            </p>
          )}
          <button
            type="button"
            onClick={salvarChatSettings}
            disabled={!isAdmin || chatSettingsSaving || chatSettingsLoading}
            className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors inline-flex items-center gap-2"
          >
            {chatSettingsSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {chatSettingsSaving ? 'Salvando...' : 'Salvar preferência do chat'}
          </button>

          <hr className="border-gray-200 dark:border-gray-800" />

          <div>
            <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <Clock size={16} /> Timeout de atendimento
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Quando um contato ficar sem resposta por mais de X minutos, a Clara tenta responder automaticamente.
            </p>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Timeout automático</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {timeoutEnabled ? 'Ativado — Clara responde após inatividade' : 'Desativado — Clara não intervém'}
              </p>
            </div>
            <button
              type="button"
              disabled={!isAdmin || timeoutLoading}
              onClick={() => {
                setTimeoutOk(false)
                setTimeoutError(null)
                setTimeoutEnabled(prev => !prev)
              }}
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-60"
            >
              {timeoutEnabled ? <ToggleRight size={18} className="text-emerald-600" /> : <ToggleLeft size={18} className="text-slate-400" />}
              {timeoutEnabled ? 'Ligado' : 'Desligado'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">Minutos:</label>
            <input
              type="number"
              min={1}
              max={120}
              value={timeoutMinutes}
              onChange={e => {
                setTimeoutOk(false)
                setTimeoutError(null)
                setTimeoutMinutes(Number(e.target.value) || 10)
              }}
              disabled={!isAdmin || timeoutLoading || !timeoutEnabled}
              className="w-20 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 disabled:opacity-60"
            />
          </div>
          {timeoutError && (
            <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {timeoutError}
            </p>
          )}
          {timeoutOk && (
            <p className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
              Configuração de timeout salva.
            </p>
          )}
          <button
            type="button"
            onClick={salvarTimeoutConfig}
            disabled={!isAdmin || timeoutSaving || timeoutLoading}
            className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors inline-flex items-center gap-2"
          >
            {timeoutSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {timeoutSaving ? 'Salvando...' : 'Salvar configuração de timeout'}
          </button>
        </div>

        {erro && (
          <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
            {erro}
          </p>
        )}
        {ok && (
          <p className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
            Configurações salvas.
          </p>
        )}

        <button type="button" onClick={salvar} disabled={!isAdmin || saving}
          className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors inline-flex items-center gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>
    </div>
  )
}

function AbaUsuarios() {
  const { profile: myProfile } = useAuth()
  const isAdmin = isAdminProfile(myProfile)

  const [users, setUsers]           = useState<Profile[]>([])
  const [parceiros, setParceiros]   = useState<Parceiro[]>([])
  const [tabelas, setTabelas]       = useState<TabelaPreco[]>([])
  const [lojas, setLojas]           = useState<LojaMarketplace[]>([])
  const [loading, setLoading]       = useState(true)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editForm, setEditForm]     = useState<UserEditForm | null>(null)
  const [saving, setSaving]         = useState(false)
  const [editErro, setEditErro]     = useState<string | null>(null)

  // Acesso a conversas
  const [convAccess, setConvAccess] = useState<{ id: string; telefone: string }[]>([])
  const [novoTelefone, setNovoTelefone] = useState('')
  const [savingConvAccess, setSavingConvAccess] = useState(false)

  // loja do vendedor (edit inline)
  const [editLojaUserId, setEditLojaUserId] = useState<string | null>(null)
  const [editLojaForm, setEditLojaForm] = useState<{ nome: string; tabela_preco_id: string } | null>(null)
  const [salvandoLoja, setSalvandoLoja] = useState(false)

  // loja do vendedor (criação)
  const [novoLojaNome, setNovoLojaNome] = useState('')
  const [novoLojaTabelaId, setNovoLojaTabelaId] = useState('')

  // Modal alterar senha
  const [modalSenha, setModalSenha]   = useState<ModalSenha>(null)
  const [novaSenha, setNovaSenha]     = useState('')
  const [confirmSenha, setConfirmSenha] = useState('')
  const [senhaErro, setSenhaErro]     = useState<string | null>(null)
  const [senhaOk, setSenhaOk]         = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  const [toastU, setToastU] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  // Confirmação de exclusão de usuário
  const [confirmExcluirUser, setConfirmExcluirUser] = useState<Profile | null>(null)
  const [excluindoUser, setExcluindoUser]           = useState(false)

  // Modal novo usuário
  const [novoModal, setNovoModal]     = useState<ModalNovoUsuario>({ aberto: false })
  const [novoNome, setNovoNome]       = useState('')
  const [novoEmail, setNovoEmail]     = useState('')
  const [novoPerfil, setNovoPerfil]   = useState<PerfilAcesso>('usuario')
  const [novoSenhaU, setNovoSenhaU]   = useState('')
  const [criandoUser, setCriandoUser] = useState(false)
  const [criadoOk, setCriadoOk]       = useState(false)
  const [criadoErro, setCriadoErro]   = useState<string | null>(null)

  function showMsgU(msg: string, type: 'ok' | 'err' = 'err') {
    setToastU({ msg, type })
    setTimeout(() => setToastU(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [usersRes, { data: parceirosData }, { data: tabelasData }, { data: lojasData }] = await Promise.all([
      fetch(getApiUrl('/profiles')).then(r => r.json() as Promise<{ ok: boolean; profiles: Profile[]; error?: string }>),
      supabase.from('parceiros').select('*').order('nome', { ascending: true }),
      supabase.from('tabelas_preco').select('id, nome, ativo').eq('ativo', true).order('nome'),
      supabase.from('lojas_marketplace').select('*').eq('owner_tipo', 'vendedor'),
    ])
    setUsers(usersRes.ok ? (usersRes.profiles ?? []) : [])
    setParceiros((parceirosData ?? []) as Parceiro[])
    setTabelas((tabelasData ?? []) as TabelaPreco[])
    setLojas((lojasData ?? []) as LojaMarketplace[])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (isAdmin) void load()
  }, [isAdmin, load])

  function getAuthUserId(user: Profile) {
    return user.clerk_user_id ?? user.id
  }

  async function saveEdit(userId: string) {
    if (!editForm) return
    if (editForm.permissoes.length === 0) {
      setEditErro('Selecione pelo menos uma permissão.')
      return
    }
    setSaving(true)
    setEditErro(null)
    const payload = {
      nome: editForm.nome.trim(),
      email: editForm.email.trim(),
      perfil: editForm.perfil,
      status: editForm.status,
      tipo_vinculo: editForm.tipo_vinculo,
      parceiro_id: editForm.tipo_vinculo === 'parceiro' && editForm.parceiro_id ? editForm.parceiro_id : null,
      vinculo_nome: editForm.vinculo_nome.trim() || null,
      documento: editForm.documento.trim() || null,
      telefone: editForm.telefone.trim() || null,
      cidade: editForm.cidade.trim() || null,
      observacoes: editForm.observacoes.trim() || null,
      permissoes: editForm.perfil === 'admin' ? DEFAULT_PERMISSIONS.admin : editForm.permissoes,
    }
    const response = await fetch(getApiUrl(`/profiles/${userId}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null
    setSaving(false)
    if (!response.ok || !result?.ok) {
      setEditErro(result?.error ?? 'Erro ao salvar usuário.')
      return
    }
    setEditingId(null)
    setEditForm(null)
    void load()
  }

  async function toggleStatus(u: Profile) {
    const novoStatus = u.status === 'ativo' ? 'inativo' : 'ativo'
    await fetch(getApiUrl(`/profiles/${u.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novoStatus }),
    })
    void load()
  }

  async function excluirUsuario() {
    if (!confirmExcluirUser) return
    setExcluindoUser(true)
    try {
      await deleteAdminManagedUser({ userId: getAuthUserId(confirmExcluirUser) })
      setConfirmExcluirUser(null)
      void load()
    } catch (error) {
      showMsgU(error instanceof Error ? error.message : 'Erro ao excluir usuário.')
    } finally {
      setExcluindoUser(false)
    }
  }

  function startEdit(u: Profile) {
    setEditingId(u.id)
    setEditErro(null)
    setEditForm({
      nome: u.nome,
      email: u.email,
      perfil: u.perfil,
      status: u.status,
      tipo_vinculo: u.tipo_vinculo ?? 'usuario_comum',
      parceiro_id: u.parceiro_id ?? '',
      vinculo_nome: u.vinculo_nome ?? '',
      documento: u.documento ?? '',
      telefone: u.telefone ?? '',
      cidade: u.cidade ?? '',
      observacoes: u.observacoes ?? '',
      permissoes: u.permissoes && u.permissoes.length > 0 ? u.permissoes : DEFAULT_PERMISSIONS[u.perfil],
    })
    setNovoTelefone('')
    fetch(getApiUrl(`/chat/user-conversation-access?user_id=${u.id}`))
      .then(r => r.json())
      .then(res => {
        if (res.ok) setConvAccess(res.data ?? [])
        else setConvAccess([])
      })
      .catch(() => setConvAccess([]))
  }

  function updateEdit<K extends keyof UserEditForm>(key: K, value: UserEditForm[K]) {
    setEditErro(null)
    setEditForm(prev => {
      if (!prev) return prev
      const next = { ...prev, [key]: value }
      if (key === 'perfil') {
        const perfil = value as PerfilAcesso
        next.permissoes = DEFAULT_PERMISSIONS[perfil]
      }
      if (key === 'tipo_vinculo' && value !== 'parceiro') {
        next.parceiro_id = ''
      }
      return next
    })
  }

  function togglePermissao(permission: PermissaoPagina) {
    setEditErro(null)
    setEditForm(prev => {
      if (!prev || prev.perfil === 'admin') return prev
      const has = prev.permissoes.includes(permission)
      const permissoes = has
        ? prev.permissoes.filter(p => p !== permission)
        : [...prev.permissoes, permission]
      return { ...prev, permissoes }
    })
  }

  function abrirModalSenha(u: Profile) {
    setModalSenha({ userId: getAuthUserId(u), nome: u.nome })
    setNovaSenha('')
    setConfirmSenha('')
    setSenhaErro(null)
    setSenhaOk(false)
  }

  function fecharModalSenha() {
    setModalSenha(null)
    setSenhaErro(null)
    setSenhaOk(false)
  }

  async function salvarSenha() {
    setSenhaErro(null)
    if (novaSenha.length < 8) { setSenhaErro('A senha deve ter pelo menos 8 caracteres.'); return }
    if (novaSenha !== confirmSenha) { setSenhaErro('As senhas não coincidem.'); return }
    setSalvandoSenha(true)
    try {
      await updateAdminManagedPassword({ userId: modalSenha!.userId, password: novaSenha })
      setSenhaOk(true)
    } catch (error) {
      setSenhaErro(error instanceof Error ? error.message : 'Erro ao atualizar senha.')
    } finally {
      setSalvandoSenha(false)
    }
  }

  function slugifyNomeLoja(value: string) {
    return value
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  }

  async function salvarLojaVendedor(userId: string) {
    if (!editLojaForm?.nome.trim() || !editLojaForm.tabela_preco_id) {
      showMsgU('Preencha nome da loja e tabela de preço.')
      return
    }
    setSalvandoLoja(true)
    const lojaExistente = lojas.find(l => l.owner_profile_id === userId)
    const payload = {
      nome_loja: editLojaForm.nome.trim(),
      slug: slugifyNomeLoja(editLojaForm.nome),
      tabela_preco_id: editLojaForm.tabela_preco_id,
      owner_tipo: 'vendedor' as const,
      owner_profile_id: userId,
      ativo: true,
      configuracoes: lojaExistente?.configuracoes ?? { modo_exibicao: 'vitrine', item_fixo_id: null },
    }
    if (lojaExistente) {
      await supabase.from('lojas_marketplace').update(payload).eq('id', lojaExistente.id)
    } else {
      await supabase.from('lojas_marketplace').insert([payload])
    }
    setSalvandoLoja(false)
    setEditLojaUserId(null)
    setEditLojaForm(null)
    void load()
    showMsgU('Loja salva!', 'ok')
  }

  function abrirNovoUsuario() {
    setNovoNome(''); setNovoEmail(''); setNovoPerfil('usuario'); setNovoSenhaU('')
    setNovoLojaNome(''); setNovoLojaTabelaId('')
    setCriadoOk(false); setCriadoErro(null)
    setNovoModal({ aberto: true })
  }

  function handleNovoPerfilChange(perfil: PerfilAcesso) {
    setNovoPerfil(perfil)
    if (perfil === 'admin' && !novoSenhaU.trim()) {
      setNovoSenhaU(ADMIN_INITIAL_PASSWORD)
    }
  }

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault()
    setCriadoErro(null)
    const passwordError = validateStrongPassword(novoSenhaU)
    if (passwordError) { setCriadoErro(passwordError); return }
    setCriandoUser(true)
    try {
      const result = await createAdminManagedUser({
        nome: novoNome,
        email: novoEmail,
        senha: novoSenhaU,
        perfil: novoPerfil,
        permissoes: DEFAULT_PERMISSIONS[novoPerfil],
      })
      if (novoPerfil === 'vendedor' && novoLojaNome.trim() && novoLojaTabelaId && result.userId) {
        await supabase.from('lojas_marketplace').insert([{
          nome_loja: novoLojaNome.trim(),
          slug: slugifyNomeLoja(novoLojaNome),
          tabela_preco_id: novoLojaTabelaId,
          owner_tipo: 'vendedor',
          owner_profile_id: result.userId,
          ativo: true,
          configuracoes: { modo_exibicao: 'vitrine', item_fixo_id: null },
        }])
      }
      setCriadoOk(true)
      void load()
    } catch (error) {
      setCriadoErro(error instanceof Error ? error.message : 'Erro ao criar usuário.')
      return
    } finally {
      setCriandoUser(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-xl p-4 text-sm">
        O gerenciamento de usuários é exclusivo para administradores.
      </div>
    )
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  }

  return (
    <>
      {/* ── Modal Alterar Senha ── */}
      {modalSenha && (
        <ModalOverlay titulo={`Alterar senha — ${modalSenha.nome}`} onClose={fecharModalSenha}>
          {senhaOk ? (
            <div className="text-center space-y-3 py-2">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                <Check size={22} className="text-green-600 dark:text-green-400" />
              </div>
              <p className="font-semibold text-gray-900 dark:text-white">Senha alterada!</p>
              <button type="button" onClick={fecharModalSenha}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline">Fechar</button>
            </div>
          ) : (
            <div className="space-y-4">
              <CampoSenha label="Nova senha" value={novaSenha} onChange={setNovaSenha} autoFocus />
              <CampoSenha label="Confirmar senha" value={confirmSenha} onChange={setConfirmSenha} />
              {senhaErro && (
                <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  ⚠ {senhaErro}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={fecharModalSenha}
                  className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  Cancelar
                </button>
                <button type="button" onClick={salvarSenha} disabled={salvandoSenha}
                  className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium transition-colors flex items-center justify-center gap-2">
                  {salvandoSenha ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : 'Salvar senha'}
                </button>
              </div>
            </div>
          )}
        </ModalOverlay>
      )}

      {/* ── Modal Confirmar Exclusão de Usuário ── */}
      {confirmExcluirUser && (
        <ModalOverlay titulo="Excluir usuário" onClose={() => { if (!excluindoUser) setConfirmExcluirUser(null) }}>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                <Trash2 size={18} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">Excluir usuário</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Esta ação não pode ser desfeita.</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              Tem certeza que deseja excluir permanentemente o usuário{' '}
              <strong className="text-gray-900 dark:text-white">{confirmExcluirUser.nome}</strong>?{' '}
              O acesso será removido imediatamente.
            </p>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setConfirmExcluirUser(null)} disabled={excluindoUser}
                className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
                Cancelar
              </button>
              <button type="button" onClick={excluirUsuario} disabled={excluindoUser}
                className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-medium transition-colors flex items-center justify-center gap-2">
                {excluindoUser ? <><Loader2 size={14} className="animate-spin" /> Excluindo...</> : <><Trash2 size={14} /> Excluir</>}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Modal Novo Usuário ── */}
      {novoModal.aberto && (
        <ModalOverlay titulo="Criar novo usuário" onClose={() => setNovoModal({ aberto: false })}>
          {criadoOk ? (
            <div className="space-y-4 py-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                  <Check size={20} className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">Usuário criado!</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{novoEmail} já pode fazer login.</p>
                </div>
              </div>
              {novoPerfil === 'agente_registro' && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
                  <p className="text-xs font-bold text-amber-700 dark:text-amber-300">Próximos passos obrigatórios</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">Este agente ainda não consegue lançar vendas. Faça agora:</p>
                  <div className="space-y-2">
                    <div className="flex gap-2 items-start">
                      <span className="text-amber-500 font-bold text-xs shrink-0">1.</span>
                      <div>
                        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Vincular ao Ponto de Atendimento</p>
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">Comercial → aba Agentes → Pontos de Atendimento → edite o ponto → adicione <strong>{novoNome}</strong>.</p>
                      </div>
                    </div>
                    <div className="flex gap-2 items-start">
                      <span className="text-amber-500 font-bold text-xs shrink-0">2.</span>
                      <div>
                        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">Liberar Tabela de Preço</p>
                        <p className="text-[11px] text-amber-600 dark:text-amber-400">Comercial → aba Agentes → Tabelas por Agente → vincule a tabela a <strong>{novoNome}</strong>.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {novoPerfil === 'vendedor' && (
                <div className="rounded-xl border border-blue-200 dark:border-blue-900/30 bg-blue-50 dark:bg-blue-950/20 p-3 space-y-1">
                  <p className="text-xs font-bold text-blue-700 dark:text-blue-300">Pronto para usar</p>
                  <p className="text-[11px] text-blue-600 dark:text-blue-400">
                    <strong>{novoNome}</strong> já aparece como opção de Contador/Parceiro no lançamento de vendas.
                    {!novoLojaNome.trim() && ' Se quiser criar uma loja do marketplace depois, edite o usuário aqui em Configurações.'}
                  </p>
                </div>
              )}
              {(novoPerfil === 'admin' || novoPerfil === 'usuario') && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-3">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {novoPerfil === 'admin'
                      ? `${novoNome} tem acesso completo ao sistema e já pode usar todas as funcionalidades.`
                      : `${novoNome} tem acesso de leitura. Para ampliar permissões, edite o perfil do usuário.`}
                  </p>
                </div>
              )}
              <button type="button" onClick={() => setNovoModal({ aberto: false })}
                className="w-full px-4 py-2.5 text-sm rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium transition-colors">
                Fechar
              </button>
            </div>
          ) : (
            <form onSubmit={criarUsuario} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome completo</label>
                <input type="text" value={novoNome} onChange={e => setNovoNome(e.target.value)} required autoFocus
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
                <input type="email" value={novoEmail} onChange={e => setNovoEmail(e.target.value)} required
                  placeholder="usuario@email.com"
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <CampoSenha label="Senha inicial" value={novoSenhaU} onChange={setNovoSenhaU} />
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Perfil de acesso</label>
                <select value={novoPerfil} onChange={e => handleNovoPerfilChange(e.target.value as PerfilAcesso)}
                  title="Perfil de acesso" aria-label="Perfil de acesso"
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="admin">Administrador</option>
                  <option value="agente_registro">Agente de Registro</option>
                  <option value="vendedor">Vendedor / Parceiro</option>
                  <option value="usuario">Usuário</option>
                </select>
              </div>
              {/* ── Guia do perfil selecionado ── */}
              {novoPerfil === 'agente_registro' && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-1.5">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">⚠ Agente de Registro — configurações obrigatórias após criar</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                    Para este usuário conseguir lançar vendas, você precisará fazer mais 2 passos depois que clicar em Criar:
                  </p>
                  <ol className="text-[11px] text-amber-700 dark:text-amber-400 space-y-1 pl-3 list-decimal">
                    <li><strong>Vincular a um Ponto de Atendimento</strong> — vá em Comercial → aba Agentes → seção Pontos de Atendimento, edite o ponto e adicione este agente.</li>
                    <li><strong>Liberar uma Tabela de Preço</strong> — na mesma aba Agentes, seção Tabelas por Agente, vincule o agente à tabela que ele poderá usar.</li>
                  </ol>
                  <p className="text-[11px] text-amber-600 dark:text-amber-500">Sem esses dois passos o sistema bloqueará o lançamento de vendas para este agente.</p>
                </div>
              )}
              {novoPerfil === 'usuario' && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 p-3">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Usuário — acesso de leitura</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    Pode consultar informações do sistema, mas não lança vendas nem altera cadastros. Não há configurações adicionais necessárias.
                  </p>
                </div>
              )}
              {novoPerfil === 'admin' && (
                <div className="rounded-xl border border-purple-200 dark:border-purple-800/40 bg-purple-50/60 dark:bg-purple-950/20 p-3">
                  <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Administrador — acesso total</p>
                  <p className="text-[11px] text-purple-600 dark:text-purple-400 leading-relaxed">
                    Acesso completo ao sistema: vendas, cadastros, configurações, exclusões e relatórios. Não há configurações adicionais necessárias.
                  </p>
                </div>
              )}
              {novoPerfil === 'vendedor' && (
                <div className="rounded-xl border border-blue-200 dark:border-blue-900/30 bg-blue-50/60 dark:bg-blue-950/20 p-3 space-y-2">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Vendedor / Parceiro</p>
                  <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-relaxed">
                    Aparece como opção de Contador/Parceiro no lançamento de vendas. Loja do Marketplace é opcional — configure agora ou depois na edição do usuário.
                  </p>
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Loja do Marketplace (opcional)</p>
                  <p className="text-[11px] text-blue-600 dark:text-blue-400">Configure a loja agora ou depois, na edição do usuário.</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome da loja</label>
                    <input type="text" value={novoLojaNome} onChange={e => setNovoLojaNome(e.target.value)}
                      placeholder="Ex: Loja do João Silva"
                      className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  {novoLojaNome.trim() && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tabela de preço</label>
                      <select value={novoLojaTabelaId} onChange={e => setNovoLojaTabelaId(e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Selecione</option>
                        {tabelas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              )}
              {criadoErro && (
                <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                  ⚠ {criadoErro}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setNovoModal({ aberto: false })}
                  className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={criandoUser}
                  className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium transition-colors flex items-center justify-center gap-2">
                  {criandoUser ? <><Loader2 size={14} className="animate-spin" /> Criando...</> : 'Criar usuário'}
                </button>
              </div>
            </form>
          )}
        </ModalOverlay>
      )}

      {/* ── Lista de usuários ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800 dark:text-gray-200">Usuários do Sistema</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Aqui aparecem apenas usuários internos da plataforma. Clientes do portal são gerenciados na tela de Clientes.
            </p>
          </div>
          <button type="button" onClick={abrirNovoUsuario}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors">
            <UserPlus size={14} /> Novo usuário
          </button>
        </div>

        <div className="space-y-3">
          {users.map(u => (
            <div key={u.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0',
                    u.perfil === 'admin' ? 'bg-purple-600' :
                    u.perfil === 'agente_registro' ? 'bg-green-600' :
                    u.perfil === 'vendedor' ? 'bg-blue-600' : 'bg-gray-500'
                  )}>
                    {u.nome.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">{u.nome}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                  {editingId === u.id ? (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => saveEdit(u.id)} disabled={saving || !editForm} title="Salvar"
                        className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center hover:bg-green-200 transition-colors disabled:opacity-60">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      </button>
                      <button type="button" onClick={() => { setEditingId(null); setEditForm(null); setEditErro(null) }} title="Cancelar"
                        className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', PERFIL_COLOR[u.perfil])}>
                        {PERFIL_LABEL[u.perfil]}
                      </span>
                      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                        u.status === 'ativo'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400')}>
                        {u.status === 'ativo' ? 'Ativo' : 'Aguardando liberação'}
                      </span>

                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => startEdit(u)} title="Editar perfil"
                            className="w-7 h-7 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-200 flex items-center justify-center transition-colors">
                            <Pencil size={13} />
                          </button>
                          <button type="button" onClick={() => abrirModalSenha(u)} title="Alterar senha"
                            className="w-7 h-7 rounded-lg text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center transition-colors">
                            <KeyRound size={13} />
                          </button>
                          {u.id !== myProfile?.id && (
                            <>
                              <button type="button" onClick={() => toggleStatus(u)}
                                className={cn('text-xs px-2 py-1 rounded-lg font-medium transition-colors',
                                  u.status === 'ativo'
                                    ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                                    : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20')}
                                title={u.status === 'ativo' ? 'Desativar' : 'Liberar acesso'}>
                                {u.status === 'ativo' ? 'Desativar' : 'Liberar'}
                              </button>
                              <button type="button" onClick={() => setConfirmExcluirUser(u)}
                                title="Excluir usuário"
                                className="w-7 h-7 rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 flex items-center justify-center transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {u.id === myProfile?.id && !isAdmin && (
                        <span className="text-xs text-gray-400 dark:text-gray-600 italic">você</span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {editingId === u.id && editForm && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <ConfigInput label="Nome" value={editForm.nome} onChange={v => updateEdit('nome', v)} />
                    <ConfigInput label="Email" type="email" value={editForm.email} onChange={v => updateEdit('email', v)} />
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Perfil de acesso</span>
                      <select value={editForm.perfil} onChange={e => updateEdit('perfil', e.target.value as PerfilAcesso)}
                        className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="admin">Administrador</option>
                        <option value="agente_registro">Agente de Registro</option>
                        <option value="vendedor">Vendedor / Parceiro</option>
                        <option value="usuario">Usuário</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Status</span>
                      <select value={editForm.status} onChange={e => updateEdit('status', e.target.value as 'ativo' | 'inativo')}
                        disabled={u.id === myProfile?.id}
                        className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60">
                        <option value="ativo">Ativo</option>
                        <option value="inativo">Aguardando liberação</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Vínculo do usuário</span>
                      <select value={editForm.tipo_vinculo} onChange={e => updateEdit('tipo_vinculo', e.target.value as TipoVinculoUsuario)}
                        className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {Object.entries(TIPO_VINCULO_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                    {editForm.tipo_vinculo === 'parceiro' ? (
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Parceiro vinculado</span>
                        <select value={editForm.parceiro_id} onChange={e => {
                          const parceiro = parceiros.find(p => p.id === e.target.value)
                          updateEdit('parceiro_id', e.target.value)
                          if (parceiro) updateEdit('vinculo_nome', parceiro.nome)
                        }}
                          className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                          <option value="">Selecione...</option>
                          {parceiros.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                      </label>
                    ) : (
                      <ConfigInput label="Nome do vínculo" value={editForm.vinculo_nome} onChange={v => updateEdit('vinculo_nome', v)} placeholder="Nome do AR, vendedor ou contador" />
                    )}
                    <ConfigInput label="Documento" value={editForm.documento} onChange={v => updateEdit('documento', v)} placeholder="CPF, CNPJ ou código interno" />
                    <ConfigInput label="Telefone" value={editForm.telefone} onChange={v => updateEdit('telefone', v)} />
                    <ConfigInput label="Cidade" value={editForm.cidade} onChange={v => updateEdit('cidade', v)} />
                  </div>

                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Observações</span>
                    <textarea value={editForm.observacoes} onChange={e => updateEdit('observacoes', e.target.value)}
                      rows={3}
                      className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      placeholder="Anotações administrativas sobre este usuário" />
                  </label>

                  <div>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div>
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Permissões na plataforma</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Marque o que este usuário pode acessar no menu lateral.</p>
                      </div>
                      {editForm.perfil !== 'admin' && (
                        <button type="button" onClick={() => updateEdit('permissoes', DEFAULT_PERMISSIONS[editForm.perfil])}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                          Usar padrão do perfil
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
                      {PAGE_PERMISSIONS.map(permission => (
                        <label key={permission.id}
                          className={cn('border rounded-xl p-3 flex items-start gap-2 text-sm transition-colors',
                            editForm.permissoes.includes(permission.id)
                              ? 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900',
                            editForm.perfil === 'admin' && 'opacity-70')}>
                          <input type="checkbox"
                            checked={editForm.permissoes.includes(permission.id)}
                            disabled={editForm.perfil === 'admin'}
                            onChange={() => togglePermissao(permission.id)}
                            className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          <span>
                            <span className="block text-xs font-medium text-gray-800 dark:text-gray-200">{permission.label}</span>
                            <span className="block text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{permission.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {editForm.perfil === 'vendedor' && (() => {
                    const lojaDoVendedor = lojas.find(l => l.owner_profile_id === u.id)
                    const isEditingLoja = editLojaUserId === u.id
                    return (
                      <div className="rounded-xl border border-blue-200 dark:border-blue-900/30 bg-blue-50/60 dark:bg-blue-950/20 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Loja do Marketplace</p>
                          {!isEditingLoja && (
                            <button type="button"
                              onClick={() => {
                                setEditLojaUserId(u.id)
                                setEditLojaForm({
                                  nome: lojaDoVendedor?.nome_loja ?? '',
                                  tabela_preco_id: lojaDoVendedor?.tabela_preco_id ?? (tabelas[0]?.id ?? ''),
                                })
                              }}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                              {lojaDoVendedor ? 'Editar loja' : 'Criar loja'}
                            </button>
                          )}
                        </div>
                        {!isEditingLoja && lojaDoVendedor && (
                          <div className="text-sm">
                            <p className="font-medium text-gray-800 dark:text-gray-100">{lojaDoVendedor.nome_loja}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{tabelas.find(t => t.id === lojaDoVendedor.tabela_preco_id)?.nome ?? '—'} · /{lojaDoVendedor.slug}</p>
                          </div>
                        )}
                        {!isEditingLoja && !lojaDoVendedor && (
                          <p className="text-xs text-blue-600/70 dark:text-blue-400/70">Nenhuma loja configurada ainda.</p>
                        )}
                        {isEditingLoja && editLojaForm && (
                          <div className="space-y-2">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Nome da loja</label>
                              <input type="text" value={editLojaForm.nome}
                                onChange={e => setEditLojaForm(p => p ? { ...p, nome: e.target.value } : p)}
                                placeholder="Ex: Loja do João Silva"
                                className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tabela de preço</label>
                              <select value={editLojaForm.tabela_preco_id}
                                onChange={e => setEditLojaForm(p => p ? { ...p, tabela_preco_id: e.target.value } : p)}
                                className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">Selecione</option>
                                {tabelas.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                              </select>
                            </div>
                            <div className="flex gap-2 pt-1">
                              <button type="button"
                                onClick={() => { setEditLojaUserId(null); setEditLojaForm(null) }}
                                className="px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                Cancelar
                              </button>
                              <button type="button" onClick={() => void salvarLojaVendedor(u.id)} disabled={salvandoLoja}
                                className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium transition-colors flex items-center gap-1.5">
                                {salvandoLoja ? <><Loader2 size={11} className="animate-spin" /> Salvando...</> : <><Check size={11} /> Salvar loja</>}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Acesso a Conversas */}
                  <div className="rounded-xl border border-purple-200 dark:border-purple-900/30 bg-purple-50/60 dark:bg-purple-950/20 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">Acesso a Conversas</p>
                        <p className="text-xs text-purple-600/70 dark:text-purple-400/70">Números que este usuário pode ver no chat independente do vínculo.</p>
                      </div>
                    </div>
                    {convAccess.length === 0 && (
                      <p className="text-xs text-purple-600/50 dark:text-purple-400/50">Nenhum número liberado manualmente.</p>
                    )}
                    {convAccess.length > 0 && (
                      <div className="space-y-1">
                        {convAccess.map(ac => (
                          <div key={ac.id} className="flex items-center justify-between gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-1.5 border border-purple-100 dark:border-purple-900/20">
                            <span className="text-sm text-gray-700 dark:text-gray-300 font-mono">{ac.telefone}</span>
                            <button type="button" title="Remover" disabled={savingConvAccess}
                              onClick={() => {
                                setSavingConvAccess(true)
                                fetch(getApiUrl(`/chat/user-conversation-access/${ac.id}`), {
                                  method: 'DELETE',
                                })
                                  .then(r => r.json())
                                  .then(res => {
                                    if (res.ok) setConvAccess(prev => prev.filter(x => x.id !== ac.id))
                                    else showMsgU('Erro ao remover', 'err')
                                  })
                                  .catch(() => showMsgU('Erro ao remover', 'err'))
                                  .finally(() => setSavingConvAccess(false))
                              }}
                              className="text-gray-400 hover:text-red-500 disabled:opacity-50 transition-colors">
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input type="text" value={novoTelefone}
                        onChange={e => setNovoTelefone(e.target.value)}
                        placeholder="+5511999999999"
                        className="flex-1 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono" />
                      <button type="button" disabled={savingConvAccess || !novoTelefone.trim()}
                        onClick={() => {
                          setSavingConvAccess(true)
                          fetch(getApiUrl('/chat/user-conversation-access'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ user_id: u.id, telefone: novoTelefone.trim() }),
                          })
                            .then(r => r.json())
                            .then(res => {
                              if (res.ok) {
                                setConvAccess(prev => [...prev, { id: res.id, telefone: novoTelefone.trim() }])
                                setNovoTelefone('')
                              } else showMsgU(res.error ?? 'Erro ao adicionar', 'err')
                            })
                            .catch(() => showMsgU('Erro ao adicionar', 'err'))
                            .finally(() => setSavingConvAccess(false))
                        }}
                        className="px-3 py-1.5 text-xs rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-medium transition-colors flex items-center gap-1.5 shrink-0">
                        {savingConvAccess ? <Loader2 size={11} className="animate-spin" /> : <><Plus size={11} /> Adicionar</>}
                      </button>
                    </div>
                  </div>

                  {editErro && (
                    <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
                      {editErro}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}

          {users.length === 0 && (
            <div className="text-center py-10 text-gray-400 dark:text-gray-600">
              <p className="text-sm">Nenhum usuário cadastrado ainda.</p>
            </div>
          )}
        </div>
      </div>
      {toastU && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium',
          toastU.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
        )}>
          {toastU.msg}
          <button type="button" title="Fechar" onClick={() => setToastU(null)} className="ml-1 opacity-80 hover:opacity-100"><X size={14} /></button>
        </div>
      )}
    </>
  )
}

const EDGE_FN_EVOLUTION = getEvolutionWebhookUrl()

function getWhatsAppEngineFromForm(form: Partial<ExternalIntegration> | null | undefined): WhatsAppEngine {
  return getWhatsAppEngine({ provider: form?.provider ?? 'evolution', metadata: form?.metadata ?? {} })
}

function setWhatsAppEngineOnForm(form: Partial<ExternalIntegration>, engine: WhatsAppEngine): Partial<ExternalIntegration> {
  const providerBase = form.provider ?? 'evolution'
  return {
    ...form,
    provider: normalizeWhatsAppProvider(providerBase, engine),
    metadata: buildWhatsAppMetadata(form, engine),
  }
}

function whatsAppBaseUrlPlaceholder(engine: WhatsAppEngine) {
  if (engine === 'evolution') return 'https://sua-evolution-api.com'
  if (engine === 'zapi') return 'https://api.z-api.io'
  return 'https://seu-orquestrador.com'
}

function getPrimaryWhatsAppIntegration(list: ExternalIntegration[]) {
  return (
    list.find(item => isWhatsAppIntegration(item) && getWhatsAppEngine(item) === 'evolution' && !!item.instance_name) ??
    list.find(item => isWhatsAppIntegration(item) && getWhatsAppEngine(item) === 'evolution') ??
    list.find(item => isWhatsAppIntegration(item)) ??
    list.find(item => item.provider === 'evolution' && !!item.instance_name) ??
    list.find(item => item.provider === 'evolution') ??
    list.find(item => item.provider === 'chatwoot_disparo') ??
    list.find(item => item.provider === 'chatwoot') ??
    null
  )
}

function toUnifiedWhatsAppIntegration(source: ExternalIntegration): ExternalIntegration {
  const engine = source.provider === 'chatwoot' || source.provider === 'chatwoot_disparo'
    ? 'custom'
    : getWhatsAppEngine(source)

  return {
    ...source,
    provider: 'evolution',
    name: 'WhatsApp API',
    description: 'Canal híbrido de WhatsApp para atendimento, disparos e automações.',
    metadata: buildWhatsAppMetadata(source, engine),
  }
}

function getWhatsAppDisplayName(integration: Pick<ExternalIntegration, 'name' | 'instance_name'>) {
  const rawName = integration.name?.trim() ?? ''
  if (rawName && rawName !== 'WhatsApp API') return rawName
  const instance = integration.instance_name?.trim() ?? ''
  if (instance) return instance
  return 'Número sem nome'
}

async function testarEvolution(baseUrl: string, token: string, instanceName: string): Promise<{ ok: boolean; erro: string | null }> {
  try {
    const res = await fetch(getEvolutionConnectionTestUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_url: baseUrl, api_token: token, instance_name: instanceName }),
      signal: AbortSignal.timeout(12000),
    })
    const data = await res.json() as { ok: boolean; error?: string; state?: string }
    if (data.ok) return { ok: true, erro: null }
    return { ok: false, erro: data.error ?? `Estado: ${data.state ?? 'desconhecido'}` }
  } catch {
    return { ok: false, erro: 'Sem conexão com o servidor' }
  }
}

async function configurarWebhookEvolution(baseUrl: string, token: string, instanceName: string, webhookUrl: string): Promise<{ ok: boolean; erro: string | null }> {
  try {
    const res = await fetch(getEvolutionWebhookConfigureUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_url: baseUrl,
        api_token: token,
        instance_name: instanceName,
        webhook_url: webhookUrl || EDGE_FN_EVOLUTION,
      }),
      signal: AbortSignal.timeout(12000),
    })
    const data = await res.json() as { ok: boolean; error?: string }
    if (data.ok) return { ok: true, erro: null }
    return { ok: false, erro: data.error ?? 'Falha ao configurar webhook' }
  } catch {
    return { ok: false, erro: 'Sem conexão com o servidor' }
  }
}

function isHttpUrl(value: string | null | undefined) {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeHttpUrlInput(value: string | null | undefined) {
  const raw = (value ?? '').trim()
  if (!raw) return ''
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : ('https://' + raw.replace(/^\/+/, ''))
  return withProtocol.replace(/\/+$/, '')
}

function getMissingFields(fields: Array<[string, string | number | null | undefined]>) {
  return fields.filter(([, value]) => value === null || value === undefined || String(value).trim() === '').map(([label]) => label)
}

function normalizeWhatsAppInstanceName(value: string | null | undefined) {
  return (value ?? '').trim()
}

function buildEvolutionGuideState(input: Partial<ExternalIntegration> | null | undefined) {
  const baseUrl = normalizeHttpUrlInput(input?.base_url)
  const token = (input?.api_token ?? '').trim()
  const instanceName = normalizeWhatsAppInstanceName(input?.instance_name)
  const rawWebhook = (input?.webhook_url ?? '').trim()
  const recommendedWebhook = EDGE_FN_EVOLUTION
  const webhookUrl = rawWebhook || recommendedWebhook
  const hasCredentials = Boolean(baseUrl && token && instanceName)
  const isConnected = input?.status === 'ativo'

  return {
    recommendedWebhook,
    steps: [
      {
        id: 'dados',
        done: hasCredentials,
        title: '1. Preencha os dados principais',
        detail: hasCredentials
          ? 'URL, token e instância informados.'
          : 'Informe URL da Evolution, token e nome exato da instância.',
      },
      {
        id: 'webhook',
        done: Boolean(webhookUrl),
        title: '2. Confirme o webhook automático',
        detail: rawWebhook
          ? `Webhook configurado: ${webhookUrl}`
          : 'O AVMD já sugere o webhook correto automaticamente.',
      },
      {
        id: 'status',
        done: isConnected,
        title: '3. Salve para validar a conexão',
        detail: isConnected
          ? 'Canal ativo e pronto para uso no chat.'
          : (input?.last_error ?? 'Ao salvar, o AVMD testa a conexão e atualiza o status sozinho.'),
      },
    ],
  }
}

function createEmptyIntegrationDraft(provider: IntegrationProvider): Partial<ExternalIntegration> {
  if (provider === 'email_smtp') {
    return {
      status: 'pendente',
      provider,
      name: 'Email SMTP',
      port: 587,
    }
  }

  if (provider === 'n8n') {
    return {
      status: 'pendente',
      provider,
      name: 'N8N Webhooks',
    }
  }

  if (provider === 'chatwoot' || provider === 'chatwoot_disparo') {
    return {
      status: 'pendente',
      provider,
      name: PROVIDER_LABEL[provider],
    }
  }

  return {
    status: 'pendente',
    provider,
  }
}

function AbaIntegracoes() {
  const { profile } = useAuth()
  const isAdmin = isAdminProfile(profile)
  const providersOcultosDaAba: IntegrationProvider[] = ['safe2pay', 'chatwoot', 'chatwoot_disparo']

  const [integracoes, setIntegracoes] = useState<ExternalIntegration[]>([])
  const [outbox, setOutbox] = useState<CommunicationOutbox[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [editing, setEditing] = useState<ExternalIntegration | null>(null)
  const [form, setForm] = useState<Partial<ExternalIntegration>>({})
  const [saving, setSaving] = useState(false)
  const [testando, setTestando] = useState<IntegrationProvider | null>(null)
  const [novaModal, setNovaModal] = useState(false)
  const [novaForm, setNovaForm] = useState<Partial<ExternalIntegration>>({ status: 'pendente' as IntegrationStatus })
  const [novaProvider, setNovaProvider] = useState<IntegrationProvider>('evolution')
  const [criando, setCriando] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<ExternalIntegration | null>(null)
  const [deletando, setDeletando] = useState(false)
  const [toastI, setToastI] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [whatsAppHubOpen, setWhatsAppHubOpen] = useState(false)
  const [showAdvancedWhatsAppEdit, setShowAdvancedWhatsAppEdit] = useState(false)
  const [showAdvancedWhatsAppNew, setShowAdvancedWhatsAppNew] = useState(false)
  const [documentStorage, setDocumentStorage] = useState<ContactDocumentStorageConfig>(DEFAULT_CONTACT_DOCUMENT_STORAGE)
    const [savingDocumentStorage, setSavingDocumentStorage] = useState(false)

    function showMsgI(msg: string, type: 'ok' | 'err' = 'err') {
      setToastI({ msg, type })
      setTimeout(() => setToastI(null), 4000)
    }

    async function validarIntegracaoAutomatica(integracao: ExternalIntegration): Promise<{ status: IntegrationStatus; lastError: string | null; webhookUrl?: string | null }> {
      if (integracao.provider === 'evolution') {
        const baseUrl = normalizeHttpUrlInput(integracao.base_url)
        const token = (integracao.api_token ?? '').trim()
        const instanceName = normalizeWhatsAppInstanceName(integracao.instance_name)
        const missing = getMissingFields([
          ['URL base', baseUrl],
          ['Token / API Key', token],
          ['Instância', instanceName],
        ])
        if (missing.length) {
          return { status: 'erro', lastError: `Campos obrigatórios ausentes: ${missing.join(', ')}` }
        }

        const resultado = await testarEvolution(baseUrl, token, instanceName)
        if (!resultado.ok) {
          return { status: 'erro', lastError: resultado.erro }
        }

        const webhookUrl = (integracao.webhook_url ?? EDGE_FN_EVOLUTION).trim() || EDGE_FN_EVOLUTION
        const webhookResultado = await configurarWebhookEvolution(
          baseUrl,
          token,
          instanceName,
          webhookUrl,
        )
        if (!webhookResultado.ok) {
          return { status: 'erro', lastError: webhookResultado.erro, webhookUrl }
        }

        return { status: 'ativo', lastError: null, webhookUrl }
      }

      if (integracao.provider === 'email_smtp') {
        const missing = getMissingFields([
          ['Servidor SMTP', integracao.host],
          ['Porta', integracao.port],
          ['Usuário SMTP', integracao.username],
          ['Senha / App Password', integracao.api_token],
          ['Email do remetente', integracao.sender_email],
        ])
        return missing.length
          ? { status: 'erro', lastError: `Campos obrigatórios ausentes: ${missing.join(', ')}` }
          : { status: 'ativo', lastError: null }
      }

      if (integracao.provider === 'n8n') {
        const missing = getMissingFields([
          ['Webhook', integracao.webhook_url],
        ])
        if (missing.length) {
          return { status: 'erro', lastError: `Campos obrigatórios ausentes: ${missing.join(', ')}` }
        }
        return isHttpUrl(integracao.webhook_url)
          ? { status: 'ativo', lastError: null }
          : { status: 'erro', lastError: 'Webhook N8N inválido' }
      }

      if (integracao.provider === 'safe2pay' || integracao.provider === 'safeweb' || integracao.provider === 'supabase' || integracao.provider === 'gestao_ar') {
        const urlBaseOk = !integracao.base_url || isHttpUrl(integracao.base_url)
        const webhookOk = !integracao.webhook_url || isHttpUrl(integracao.webhook_url)
        const hasSomething = Boolean(integracao.base_url || integracao.webhook_url || integracao.api_token || integracao.sender_email)
        if (!hasSomething) {
          return { status: 'erro', lastError: 'Integração sem dados mínimos para validação' }
        }
        if (!urlBaseOk) {
          return { status: 'erro', lastError: 'URL base inválida' }
        }
        if (!webhookOk) {
          return { status: 'erro', lastError: 'Webhook inválido' }
        }
        return { status: 'ativo', lastError: null }
      }

      return { status: integracao.status, lastError: integracao.last_error }
    }

    async function validarIntegracoesAutomaticamente(lista: ExternalIntegration[]) {
      const candidatas = lista.filter(integracao =>
        integracao.provider === 'evolution'
        || integracao.provider === 'email_smtp'
        || integracao.provider === 'n8n'
        || integracao.provider === 'safe2pay'
        || integracao.provider === 'safeweb'
        || integracao.provider === 'supabase'
        || integracao.provider === 'gestao_ar'
      )

      for (const integracao of candidatas) {
        try {
          const resultado = await validarIntegracaoAutomatica(integracao)
          if (!resultado) continue

          const webhookUrl = resultado.webhookUrl ?? integracao.webhook_url
          const patch: Partial<ExternalIntegration> = {
            status: resultado.status,
            last_test_at: new Date().toISOString(),
            last_error: resultado.lastError,
          }
          if (resultado.webhookUrl !== undefined) {
            patch.webhook_url = webhookUrl ?? null
          }

          await fetch(getApiUrl(`/integrations/${integracao.id}`), {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
          })
          setIntegracoes(prev => prev.map(item => (
            item.id === integracao.id
              ? { ...item, ...patch } as ExternalIntegration
              : item
          )))
        } catch (error) {
          console.error('[auto-validate integration error]', integracao.provider, integracao.id, error)
        }
      }
    }

    const load = useCallback(async () => {
      setLoading(true)
      setErro(null)
    const [integracoesRes, outboxRes] = await Promise.all([
      fetch(getApiUrl('/integrations')).then(r => r.json() as Promise<{ ok: boolean; integrations: ExternalIntegration[]; error?: string }>),
      supabase.from('communication_outbox').select('*').order('created_at', { ascending: false }).limit(8),
    ])

    if (!integracoesRes.ok) {
      setErro(integracoesRes.error ?? 'Erro ao carregar integrações')
      setLoading(false)
      return
    }

    const lista = (integracoesRes.integrations ?? []) as ExternalIntegration[]
    setIntegracoes(lista)
    setOutbox((outboxRes.data ?? []) as CommunicationOutbox[])
    try {
      const cfg = await loadContactDocumentStorageConfig()
      setDocumentStorage(cfg)
    } catch {
      setDocumentStorage(DEFAULT_CONTACT_DOCUMENT_STORAGE)
    }
    setLoading(false)

    void validarIntegracoesAutomaticamente(lista)
  }, [])

  useEffect(() => { void load() }, [load])

  function startEdit(integracao: ExternalIntegration) {
    setShowAdvancedWhatsAppEdit(false)
    setEditing(integracao)
    setForm({ ...integracao })
  }

  function startEditWhatsApp(integracao: ExternalIntegration) {
    const unified = toUnifiedWhatsAppIntegration(integracao)
    setWhatsAppHubOpen(false)
    setShowAdvancedWhatsAppEdit(false)
    setEditing(unified)
    setForm({ ...unified })
  }

  function closeEdit() {
    setShowAdvancedWhatsAppEdit(false)
    setEditing(null)
    setForm({})
  }

  function openWhatsAppHub() {
    setWhatsAppHubOpen(true)
  }

  async function salvarDocumentStorage() {
    if (!isAdmin) return
    setSavingDocumentStorage(true)
    const { error } = await supabase
      .from('app_settings')
      .upsert({
        key: 'contact_document_storage',
        value: documentStorage,
        updated_by: profile?.id ?? null,
      }, { onConflict: 'key' })
    setSavingDocumentStorage(false)
    if (error) {
      showMsgI(`Erro ao salvar armazenamento de documentos: ${error.message}`)
      return
    }
    showMsgI('Armazenamento de documentos atualizado.', 'ok')
  }

  function closeWhatsAppHub() {
    setWhatsAppHubOpen(false)
  }

  async function salvarIntegracao() {
    if (!editing) return
    setSaving(true)

    let statusFinal: IntegrationStatus = editing.status ?? 'pendente'
    let lastError: string | null = editing.last_error ?? null
    let lastTestAt: string | null = editing.last_test_at ?? null

    const editingIsWhatsApp = isWhatsAppIntegration(editing) || editing.provider === 'evolution'

      if (editingIsWhatsApp) {
        const baseUrl  = normalizeHttpUrlInput(form.base_url)
        const token    = (form.api_token     ?? '').trim()
        const instance = normalizeWhatsAppInstanceName(form.instance_name)
        const webhook  = (form.webhook_url   ?? EDGE_FN_EVOLUTION).trim() || EDGE_FN_EVOLUTION
        const engine = getWhatsAppEngineFromForm({ ...editing, ...form })
        if (engine === 'evolution' && baseUrl && token && instance) {
          const resultado = await testarEvolution(baseUrl, token, instance)
          statusFinal = resultado.ok ? 'ativo' : 'erro'
          lastError = resultado.erro
          lastTestAt = new Date().toISOString()
          if (resultado.ok) {
            const webhookResultado = await configurarWebhookEvolution(baseUrl, token, instance, webhook)
            if (!webhookResultado.ok) {
              lastError = webhookResultado.erro
              statusFinal = 'erro'
            }
          }
        } else {
          statusFinal = 'pendente'
          lastError = null
        }
      }

    const engineAtual = getWhatsAppEngineFromForm({ ...editing, ...form })
    const providerFinal = editingIsWhatsApp ? normalizeWhatsAppProvider(editing.provider, engineAtual) : editing.provider
    const metadataFinal = editingIsWhatsApp
      ? buildWhatsAppMetadata({ ...editing, ...form }, engineAtual)
      : (form.metadata ?? editing.metadata ?? {})

    const saveRes = await fetch(getApiUrl(`/integrations/${editing.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: providerFinal,
        name: form.name,
        description: form.description,
        status: statusFinal,
        base_url: editingIsWhatsApp ? (normalizeHttpUrlInput(form.base_url) || null) : (form.base_url || null),
        webhook_url: form.webhook_url || null,
        api_token:     form.api_token     || null,
        account_id:    form.account_id    || null,
        inbox_id:      form.inbox_id      || null,
        instance_name: editingIsWhatsApp ? normalizeWhatsAppInstanceName(form.instance_name) || null : form.instance_name || null,
        sender_name: form.sender_name || null,
        sender_email: form.sender_email || null,
        host: form.host || null,
        port: form.port || null,
        username: form.username || null,
        metadata: metadataFinal,
        last_test_at: lastTestAt,
        last_error: lastError,
      }),
    })
    const saveData = await saveRes.json() as { ok: boolean; error?: string }
    setSaving(false)

    if (!saveData.ok) {
      showMsgI('Erro ao salvar: ' + (saveData.error ?? 'erro desconhecido'))
      return
    }

    closeEdit()
    void load()
  }

  async function registrarTeste(integracao: ExternalIntegration) {
    setTestando(integracao.provider)

      if (isWhatsAppIntegration(integracao) || integracao.provider === 'evolution') {
        const engine = getWhatsAppEngine(integracao)
        if (engine !== 'evolution') {
          showMsgI(`Teste automático indisponível para ${getWhatsAppEngineLabel(engine)}. Use o webhook/orquestrador configurado.`, 'ok')
          setTestando(null)
        return
      }
      const baseUrl = normalizeHttpUrlInput(integracao.base_url)
      const token = (integracao.api_token ?? '').trim()
      const instanceName = normalizeWhatsAppInstanceName(integracao.instance_name)
      if (!baseUrl || !token || !instanceName) {
        showMsgI('Configure URL base, token e identificador da instância primeiro.')
        setTestando(null)
        return
      }
        try {
          const resultado = await testarEvolution(baseUrl, token, instanceName)
          const novoStatus: IntegrationStatus = resultado.ok ? 'ativo' : 'erro'
          let lastError = resultado.erro
          if (resultado.ok) {
            const webhookResultado = await configurarWebhookEvolution(
              baseUrl,
              token,
              instanceName,
              (integracao.webhook_url ?? EDGE_FN_EVOLUTION).trim() || EDGE_FN_EVOLUTION,
            )
            if (!webhookResultado.ok) {
              lastError = webhookResultado.erro
            }
          }
          await fetch(getApiUrl(`/integrations/${integracao.id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: resultado.ok && !lastError ? novoStatus : 'erro',
              last_test_at: new Date().toISOString(),
              last_error: lastError,
            }),
          })
          if (resultado.ok && !lastError) {
            showMsgI('Canal WhatsApp conectado com sucesso!', 'ok')
          } else if (resultado.ok && lastError) {
            showMsgI('Conexão ok, mas falha ao registrar webhook: ' + lastError)
          } else {
            showMsgI('Falha na conexão: ' + (lastError ?? 'erro desconhecido'))
          }
        } catch (e) {
          showMsgI('Erro ao testar: ' + String(e))
        }
      setTestando(null)
      void load()
      return
    } else if (integracao.provider === 'email_smtp') {
      await supabase.from('communication_outbox').insert([{
        channel: 'email',
        provider: 'email_smtp',
        to_address: integracao.sender_email || integracao.username || 'teste@email.com',
        subject: 'Teste de email - AR CERTI ID',
        body: 'Mensagem de teste do CRM AR CERTI ID via SMTP.',
        payload: { integration_id: integracao.id, test: true },
      }])
    } else if (integracao.provider === 'n8n') {
      await supabase.from('communication_outbox').insert([{
        channel: 'webhook',
        provider: 'n8n',
        to_address: integracao.webhook_url || 'n8n',
        body: 'Teste de webhook N8N',
        payload: { integration_id: integracao.id, test: true },
      }])
    }

    await fetch(getApiUrl(`/integrations/${integracao.id}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ last_test_at: new Date().toISOString(), last_error: null }),
    })

    setTestando(null)
    void load()
  }

  function providersDisponiveis(): IntegrationProvider[] {
    const usados = new Set(integracoes.map(i => i.provider))
    return (Object.keys(PROVIDER_LABEL) as IntegrationProvider[]).filter(p => {
      if (providersOcultosDaAba.includes(p)) return false
      if (p === 'evolution') return true
      return !usados.has(p)
    })
  }

  const whatsappIntegracoes = integracoes.filter(i => isWhatsAppIntegration(i) || i.provider === 'evolution' || i.provider === 'chatwoot' || i.provider === 'chatwoot_disparo')
  const integracoesVisiveis = integracoes.filter(i => !providersOcultosDaAba.includes(i.provider))

  function abrirNovaIntegracao() {
    const disponiveis = providersDisponiveis()
    if (disponiveis.length === 0) return
    setShowAdvancedWhatsAppNew(false)
    setNovaProvider(disponiveis[0])
    setNovaForm(createEmptyIntegrationDraft(disponiveis[0]))
    setNovaModal(true)
  }

  function abrirNovoNumeroWhatsApp() {
    setShowAdvancedWhatsAppNew(false)
    setNovaProvider('evolution')
    setNovaForm(setWhatsAppEngineOnForm({
      status: 'pendente' as IntegrationStatus,
      provider: 'evolution',
      name: 'WhatsApp API',
      webhook_url: EDGE_FN_EVOLUTION,
    }, 'evolution'))
    setNovaModal(true)
  }

  async function criarIntegracao() {
    setCriando(true)
    const creatingWhatsApp = novaProvider === 'evolution'
    const engineNovo = getWhatsAppEngineFromForm({ provider: novaProvider, metadata: novaForm.metadata ?? {} })
    const providerFinal = creatingWhatsApp ? normalizeWhatsAppProvider(novaProvider, engineNovo) : novaProvider
    const criarRes = await fetch(getApiUrl('/integrations'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: providerFinal,
        name: novaForm.name || (providerFinal === 'evolution' || providerFinal === 'n8n' ? 'WhatsApp API' : PROVIDER_LABEL[providerFinal]),
        description: novaForm.description ?? null,
        status: 'pendente',
        base_url: novaForm.base_url || null,
        webhook_url: creatingWhatsApp ? ((novaForm.webhook_url ?? '').trim() || EDGE_FN_EVOLUTION) : (novaForm.webhook_url || null),
        api_token: novaForm.api_token || null,
        account_id: novaForm.account_id || null,
        inbox_id: novaForm.inbox_id || null,
        instance_name: creatingWhatsApp ? normalizeWhatsAppInstanceName(novaForm.instance_name) || null : (novaForm.instance_name || null),
        sender_name: novaForm.sender_name || null,
        sender_email: novaForm.sender_email || null,
        host: novaForm.host || null,
        port: novaForm.port || null,
        username: novaForm.username || null,
        metadata: creatingWhatsApp
          ? buildWhatsAppMetadata({ provider: providerFinal, metadata: novaForm.metadata ?? {} }, engineNovo)
          : {},
      }),
    })
    const criarData = await criarRes.json() as { ok: boolean; error?: string }
    setCriando(false)
    if (!criarData.ok) { showMsgI('Erro ao criar: ' + (criarData.error ?? 'erro desconhecido')); return }
    setShowAdvancedWhatsAppNew(false)
    setNovaModal(false)
    void load()
  }

  async function deletarIntegracao() {
    if (!confirmDelete) return
    setDeletando(true)
    const delRes = await fetch(getApiUrl(`/integrations/${confirmDelete.id}`), { method: 'DELETE' })
    const delData = await delRes.json() as { ok: boolean; error?: string }
    setDeletando(false)
    if (!delData.ok) { showMsgI('Erro ao remover: ' + (delData.error ?? 'erro desconhecido')); setConfirmDelete(null); return }
    setConfirmDelete(null)
    void load()
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  }

  if (erro) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg p-4 text-sm">
        Erro ao carregar integrações: {erro}. Execute o SQL <strong>sql/integrations_schema.sql</strong> no Supabase.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {editing && (
        <ModalOverlay titulo={`Configurar ${isWhatsAppIntegration(editing) ? 'WhatsApp API' : PROVIDER_LABEL[editing.provider]}`} onClose={closeEdit}>
          <div className="space-y-3">
            {(isWhatsAppIntegration(editing) || editing.provider === 'evolution') ? (
              <div className="space-y-3">
                <p className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
                  Canal WhatsApp híbrido. Você pode manter Evolution agora e trocar depois para Z-API ou outro conector sem mudar a tela de operação.
                </p>
                <div className={cn('rounded-xl border px-3 py-3', integrationOperationalLabel(editing).tone)}>
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2.5 w-2.5 rounded-full', integrationOperationalLabel(editing).dot)} />
                    <p className="text-xs font-semibold uppercase tracking-[0.16em]">
                      {integrationOperationalLabel(editing).title}
                    </p>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed">
                    {integrationOperationalLabel(editing).detail}
                  </p>
                  <p className="mt-2 text-[11px] opacity-90">
                    Ao salvar, o sistema testa a Evolution, tenta registrar o webhook e atualiza o marcador automaticamente.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900/60 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Configuracao guiada da Evolution</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Preencha os campos abaixo e o AVMD faz o teste e o vinculo do webhook automaticamente.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {buildEvolutionGuideState({ ...editing, ...form }).steps.map(step => (
                      <div key={step.id} className={cn(
                        'rounded-xl border px-3 py-2.5',
                        step.done
                          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/40',
                      )}>
                        <div className="flex items-start gap-2">
                          <span className={cn(
                            'mt-0.5 h-2.5 w-2.5 rounded-full',
                            step.done ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
                          )} />
                          <div>
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{step.title}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{step.detail}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2">
                    <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200">Webhook que o AVMD vai usar</p>
                    <p className="mt-1 break-all text-[11px] text-slate-500 dark:text-slate-400">{buildEvolutionGuideState({ ...editing, ...form }).recommendedWebhook}</p>
                  </div>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Motor WhatsApp</span>
                  <select
                    value={getWhatsAppEngineFromForm({ ...editing, ...form })}
                    onChange={e => setForm(prev => setWhatsAppEngineOnForm({ ...editing, ...prev }, e.target.value as WhatsAppEngine))}
                    className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {WHATSAPP_ENGINE_OPTIONS.map(engine => (
                      <option key={engine} value={engine}>{getWhatsAppEngineLabel(engine)}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (editing.provider === 'chatwoot' || editing.provider === 'chatwoot_disparo') ? (
              <p className="text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
                {editing.provider === 'chatwoot_disparo'
                  ? 'Legado de disparos WhatsApp.'
                  : 'Legado de atendimento WhatsApp.'}
              </p>
            ) : (
              <div className="rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/20 px-3 py-2">
                <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Status automático</p>
                <p className="text-[11px] text-blue-600/80 dark:text-blue-300/80 mt-1">
                  O sistema valida a integração sozinho e atualiza o status sem clique manual.
                </p>
              </div>
            )}

            <ConfigInput
              label={(isWhatsAppIntegration(editing) || editing.provider === 'evolution') ? 'URL da Evolution' : 'URL base / API'}
              value={form.base_url ?? ''}
              onChange={base_url => setForm(p => ({ ...p, base_url }))}
              placeholder={(isWhatsAppIntegration(editing) || editing.provider === 'evolution') ? whatsAppBaseUrlPlaceholder(getWhatsAppEngineFromForm({ ...editing, ...form })) : 'https://chatwoot.seudominio.com'}
            />
            {!(isWhatsAppIntegration(editing) || editing.provider === 'evolution') && (
              <ConfigInput label="Webhook de entrada/saída" value={form.webhook_url ?? ''} onChange={webhook_url => setForm(p => ({ ...p, webhook_url }))} placeholder="https://..." />
            )}

            {(isWhatsAppIntegration(editing) || editing.provider === 'evolution') && (
              <>
                <ConfigInput
                  label="Apelido do número"
                  value={form.name ?? ''}
                  onChange={name => setForm(p => ({ ...p, name }))}
                  placeholder="Atendimento, Renovações, Financeiro..."
                />
                <ConfigInput
                  label="Nome da instância na Evolution"
                  value={form.instance_name ?? ''}
                  onChange={instance_name => setForm(p => ({ ...p, instance_name }))}
                  placeholder={getWhatsAppEngineFromForm({ ...editing, ...form }) === 'evolution' ? 'minha_instancia' : 'instancia_principal'}
                />
                <p className="text-[11px] text-gray-400 dark:text-gray-500 -mt-1">
                  Use o nome exato da instância na Evolution. No seu caso: `atendimento` e `CertiID`.
                </p>
                <ConfigInput label="Token da Evolution" type="password" value={form.api_token ?? ''} onChange={api_token => setForm(p => ({ ...p, api_token }))} />
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Webhook automatico do AVMD</p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Esse endereco ja e sugerido automaticamente. Normalmente voce nao precisa alterar.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedWhatsAppEdit(prev => !prev)}
                      className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {showAdvancedWhatsAppEdit ? 'Ocultar avancado' : 'Mostrar configuracao avancada'}
                    </button>
                  </div>
                  <p className="mt-2 break-all text-[11px] text-slate-600 dark:text-slate-300">
                    {(form.webhook_url ?? '').trim() || EDGE_FN_EVOLUTION}
                  </p>
                  {showAdvancedWhatsAppEdit && (
                    <div className="mt-3">
                      <ConfigInput label="Webhook avancado" value={form.webhook_url ?? ''} onChange={webhook_url => setForm(p => ({ ...p, webhook_url }))} placeholder={EDGE_FN_EVOLUTION} />
                    </div>
                  )}
                </div>
              </>
            )}
            {(editing.provider === 'chatwoot' || editing.provider === 'chatwoot_disparo') && (
              <>
                <ConfigInput label="Account ID" value={form.account_id ?? ''} onChange={account_id => setForm(p => ({ ...p, account_id }))} />
                <ConfigInput label={editing.provider === 'chatwoot_disparo' ? 'Inbox ID (Disparos)' : 'Inbox ID WhatsApp'} value={form.inbox_id ?? ''} onChange={inbox_id => setForm(p => ({ ...p, inbox_id }))} />
                <ConfigInput label="Access Token / API Token" type="password" value={form.api_token ?? ''} onChange={api_token => setForm(p => ({ ...p, api_token }))} />
              </>
            )}

            {editing.provider === 'email_smtp' && (
              <>
                <ConfigInput label="Servidor SMTP" value={form.host ?? ''} onChange={host => setForm(p => ({ ...p, host }))} placeholder="smtp.gmail.com" />
                <ConfigInput label="Porta" type="number" value={String(form.port ?? '')} onChange={port => setForm(p => ({ ...p, port: Number(port) || null }))} placeholder="587" />
                <ConfigInput label="Usuário SMTP" value={form.username ?? ''} onChange={username => setForm(p => ({ ...p, username }))} />
                <ConfigInput label="Senha / App Password" type="password" value={form.api_token ?? ''} onChange={api_token => setForm(p => ({ ...p, api_token }))} />
                <ConfigInput label="Nome do remetente" value={form.sender_name ?? ''} onChange={sender_name => setForm(p => ({ ...p, sender_name }))} />
                <ConfigInput label="Email do remetente" type="email" value={form.sender_email ?? ''} onChange={sender_email => setForm(p => ({ ...p, sender_email }))} />
              </>
            )}

            <div className="flex gap-2 pt-2">
              <button type="button" onClick={closeEdit}
                className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
                Cancelar
              </button>
              <button type="button" onClick={salvarIntegracao} disabled={saving || !isAdmin}
                className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {(isWhatsAppIntegration(editing) || editing.provider === 'evolution') ? 'Salvar e conectar' : 'Salvar'}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {confirmDelete && (
        <ModalOverlay titulo="Remover integração" onClose={() => setConfirmDelete(null)}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Deseja remover <strong className="text-gray-900 dark:text-white">{confirmDelete.name}</strong>?
              Todas as credenciais configuradas serão apagadas.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)}
                className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button type="button" onClick={deletarIntegracao} disabled={deletando}
                className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-medium flex items-center justify-center gap-2 transition-colors">
                {deletando ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Remover
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {novaModal && (
        <ModalOverlay titulo="Nova Integração" onClose={() => setNovaModal(false)}>
          <div className="space-y-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Tipo de integração</span>
              <select value={novaProvider} onChange={e => {
                const provider = e.target.value as IntegrationProvider
                setShowAdvancedWhatsAppNew(false)
                setNovaProvider(provider)
                setNovaForm(provider === 'evolution'
                  ? setWhatsAppEngineOnForm({ status: 'pendente' as IntegrationStatus, provider: 'evolution', name: 'WhatsApp API', webhook_url: EDGE_FN_EVOLUTION }, 'evolution')
                  : createEmptyIntegrationDraft(provider))
              }}
                className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                {providersDisponiveis().map(p => (
                  <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
                ))}
              </select>
            </label>
            <div className="rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/20 px-3 py-2">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300">Status automático</p>
              <p className="text-[11px] text-blue-600/80 dark:text-blue-300/80 mt-1">
                Ao salvar, o sistema testa a integração e ajusta o status automaticamente.
              </p>
            </div>
            {novaProvider === 'evolution' && (
              <>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/90 dark:bg-slate-900/60 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Configuracao guiada da Evolution</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Cadastre o numero, salve e o AVMD tenta validar a conexao automaticamente.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {buildEvolutionGuideState({ status: 'pendente', ...novaForm, webhook_url: novaForm.webhook_url ?? EDGE_FN_EVOLUTION }).steps.map(step => (
                      <div key={step.id} className={cn(
                        'rounded-xl border px-3 py-2.5',
                        step.done
                          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20'
                          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/40',
                      )}>
                        <div className="flex items-start gap-2">
                          <span className={cn(
                            'mt-0.5 h-2.5 w-2.5 rounded-full',
                            step.done ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
                          )} />
                          <div>
                            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{step.title}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{step.detail}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-3 py-2">
                    <p className="text-[11px] font-medium text-slate-700 dark:text-slate-200">Webhook que o AVMD vai usar</p>
                    <p className="mt-1 break-all text-[11px] text-slate-500 dark:text-slate-400">{EDGE_FN_EVOLUTION}</p>
                  </div>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Motor WhatsApp</span>
                <select
                  value={getWhatsAppEngineFromForm({ provider: novaProvider, metadata: novaForm.metadata ?? {} })}
                  onChange={e => setNovaForm(f => setWhatsAppEngineOnForm({ ...f, provider: novaProvider }, e.target.value as WhatsAppEngine))}
                  className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {WHATSAPP_ENGINE_OPTIONS.map(engine => (
                    <option key={engine} value={engine}>{getWhatsAppEngineLabel(engine)}</option>
                  ))}
                </select>
              </label>
              </>
            )}
            {novaProvider === 'email_smtp' && (
              <div className="rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-950/20 px-3 py-2">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Configuração de envio</p>
                <p className="text-[11px] text-emerald-600/80 dark:text-emerald-300/80 mt-1">
                  Aqui você configura apenas o envio de e-mails do CRM. A leitura da caixa de entrada de agendamentos deve ficar no n8n/automação.
                </p>
              </div>
            )}
            {novaProvider !== 'email_smtp' && (
              <>
                <ConfigInput
                  label={novaProvider === 'evolution' ? 'URL da Evolution' : 'URL base / API'}
                  value={novaForm.base_url ?? ''}
                  onChange={v => setNovaForm(f => ({ ...f, base_url: v }))}
                  placeholder={novaProvider === 'evolution'
                    ? whatsAppBaseUrlPlaceholder(getWhatsAppEngineFromForm({ provider: novaProvider, metadata: novaForm.metadata ?? {} }))
                    : 'https://...'}
                />
                {novaProvider !== 'evolution' && (
                  <ConfigInput label="Webhook" value={novaForm.webhook_url ?? ''} onChange={v => setNovaForm(f => ({ ...f, webhook_url: v }))} placeholder="https://..." />
                )}
              </>
            )}
            {novaProvider === 'evolution' && (
              <>
                <ConfigInput label="Apelido do número" value={novaForm.name ?? ''} onChange={v => setNovaForm(f => ({ ...f, name: v }))} placeholder="Atendimento, Renovações, Financeiro..." />
                <ConfigInput label="Nome da instância na Evolution" value={novaForm.instance_name ?? ''} onChange={v => setNovaForm(f => ({ ...f, instance_name: v }))} placeholder="instancia_principal" />
                <p className="text-[11px] text-gray-400 dark:text-gray-500 -mt-1">
                  Use o nome exato da instância na Evolution. No seu caso: `atendimento` e `CertiID`.
                </p>
                <ConfigInput label="Token da Evolution" type="password" value={novaForm.api_token ?? ''} onChange={v => setNovaForm(f => ({ ...f, api_token: v }))} />
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Webhook automatico do AVMD</p>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Esse endereco ja vem preenchido pelo sistema. So altere se voce realmente usar um webhook diferente.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedWhatsAppNew(prev => !prev)}
                      className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      {showAdvancedWhatsAppNew ? 'Ocultar avancado' : 'Mostrar configuracao avancada'}
                    </button>
                  </div>
                  <p className="mt-2 break-all text-[11px] text-slate-600 dark:text-slate-300">
                    {(novaForm.webhook_url ?? '').trim() || EDGE_FN_EVOLUTION}
                  </p>
                  {showAdvancedWhatsAppNew && (
                    <div className="mt-3">
                      <ConfigInput label="Webhook avancado" value={novaForm.webhook_url ?? ''} onChange={v => setNovaForm(f => ({ ...f, webhook_url: v }))} placeholder={EDGE_FN_EVOLUTION} />
                    </div>
                  )}
                </div>
              </>
            )}
            {(novaProvider === 'chatwoot' || novaProvider === 'chatwoot_disparo') && (
              <>
                <ConfigInput label="Account ID" value={novaForm.account_id ?? ''} onChange={v => setNovaForm(f => ({ ...f, account_id: v }))} />
                <ConfigInput label={novaProvider === 'chatwoot_disparo' ? 'Inbox ID (Disparos)' : 'Inbox ID WhatsApp'} value={novaForm.inbox_id ?? ''} onChange={v => setNovaForm(f => ({ ...f, inbox_id: v }))} />
                <ConfigInput label="API Token" type="password" value={novaForm.api_token ?? ''} onChange={v => setNovaForm(f => ({ ...f, api_token: v }))} />
              </>
            )}
            {novaProvider === 'email_smtp' && (
              <>
                <ConfigInput label="Nome da integração" value={novaForm.name ?? ''} onChange={v => setNovaForm(f => ({ ...f, name: v }))} placeholder="Email CertiID, Email Certifast..." />
                <ConfigInput label="Servidor SMTP" value={novaForm.host ?? ''} onChange={v => setNovaForm(f => ({ ...f, host: v }))} placeholder="smtp.gmail.com" />
                <ConfigInput label="Porta" type="number" value={String(novaForm.port ?? '')} onChange={v => setNovaForm(f => ({ ...f, port: Number(v) || null }))} placeholder="587" />
                <ConfigInput label="Usuário SMTP" value={novaForm.username ?? ''} onChange={v => setNovaForm(f => ({ ...f, username: v }))} placeholder="contato@seudominio.com.br" />
                <ConfigInput label="Senha / App Password" type="password" value={novaForm.api_token ?? ''} onChange={v => setNovaForm(f => ({ ...f, api_token: v }))} />
                <ConfigInput label="Nome remetente" value={novaForm.sender_name ?? ''} onChange={v => setNovaForm(f => ({ ...f, sender_name: v }))} placeholder="CertiID" />
                <ConfigInput label="Email remetente" type="email" value={novaForm.sender_email ?? ''} onChange={v => setNovaForm(f => ({ ...f, sender_email: v }))} placeholder="contato@certiid.com.br" />
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 px-3 py-2">
                  <p className="text-[11px] font-medium text-slate-700 dark:text-slate-300">Para seu cenário</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Crie uma integração SMTP para `contato@certiid.com.br` e outra para `contato@certifast.com.br`. A entrada desses e-mails de agendamento deve ser monitorada no n8n, não aqui.
                  </p>
                </div>
              </>
            )}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => setNovaModal(false)}
                className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button type="button" onClick={criarIntegracao} disabled={criando}
                className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium flex items-center justify-center gap-2 transition-colors">
                {criando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Criar
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {whatsAppHubOpen && (
        <ModalOverlay titulo="WhatsApp API — Números e Instâncias" onClose={closeWhatsAppHub}>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/40 p-3">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Canal híbrido de WhatsApp</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Cada número pode usar um motor diferente. Exemplo: uma instância em Evolution e outra em Z-API.
                </p>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={abrirNovoNumeroWhatsApp}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <Plus size={13} /> Novo número
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-1">
              {whatsappIntegracoes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400">
                  Nenhum número configurado ainda.
                </div>
              ) : whatsappIntegracoes.map(int => {
                const unified = toUnifiedWhatsAppIntegration(int)
                const engine = getWhatsAppEngine(unified)
                return (
                  <div key={int.id} className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 bg-white dark:bg-gray-900">
                    <div className={cn('mb-3 rounded-xl border px-3 py-2 text-[11px]', integrationOperationalLabel(unified).tone)}>
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 rounded-full', integrationOperationalLabel(unified).dot)} />
                        <span className="font-semibold uppercase tracking-[0.16em]">{integrationOperationalLabel(unified).title}</span>
                      </div>
                      <p className="mt-1">{integrationOperationalLabel(unified).detail}</p>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {getWhatsAppDisplayName(int)}
                          </p>
                          <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            {getWhatsAppEngineLabel(engine)}
                          </span>
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_CLASS[int.status])}>
                            {STATUS_LABEL[int.status]}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {int.base_url && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 text-[11px] text-gray-600 dark:text-gray-300 break-all">
                              {int.base_url}
                            </span>
                          )}
                          {int.instance_name && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 text-[11px] text-gray-600 dark:text-gray-300">
                              Instância: {int.instance_name}
                            </span>
                          )}
                          {int.name && int.name !== 'WhatsApp API' && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 text-[11px] text-gray-600 dark:text-gray-300">
                              Apelido: {int.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void registrarTeste(unified)}
                          disabled={testando === unified.provider}
                          title="Testar"
                          className="w-8 h-8 rounded-lg text-gray-400 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-600 dark:hover:text-green-400 flex items-center justify-center"
                        >
                          {testando === unified.provider ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditWhatsApp(int)}
                          title="Configurar"
                          className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-200 flex items-center justify-center"
                        >
                          <Pencil size={14} />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(int)}
                            title="Remover número"
                            className="w-8 h-8 rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 dark:hover:text-red-400 flex items-center justify-center transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </ModalOverlay>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">Integrações Externas</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Configure o canal híbrido de WhatsApp, email e webhooks sem prender a operação a um único fornecedor.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && providersDisponiveis().length > 0 && (
            <button type="button" onClick={abrirNovaIntegracao}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap">
              <Plus size={13} /> Nova integração
            </button>
          )}
          <div className="grid grid-cols-3 gap-2">
            <SummaryChip label="Conectados" value={integracoesVisiveis.filter(i => i.status === 'ativo').length} tone="green" />
            <SummaryChip label="Pendentes" value={integracoesVisiveis.filter(i => i.status === 'pendente').length} tone="yellow" />
            <SummaryChip label="Fila" value={outbox.length} tone="blue" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {integracoesVisiveis.map(int => {
          const Icon = providerIcon(int.provider, isWhatsAppIntegration(int))
          return (
            <div key={int.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
              <div className={cn('mb-3 rounded-xl border px-3 py-2 text-[11px]', integrationOperationalLabel(int).tone)}>
                <div className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full', integrationOperationalLabel(int).dot)} />
                  <span className="font-semibold uppercase tracking-[0.16em]">{integrationOperationalLabel(int).title}</span>
                </div>
                <p className="mt-1">{integrationOperationalLabel(int).detail}</p>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                    int.status === 'ativo'
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : int.status === 'erro'
                        ? 'bg-red-50 dark:bg-red-900/20'
                        : 'bg-blue-50 dark:bg-blue-900/20'
                  )}>
                    <Icon size={17} className="text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{int.name}</p>
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        {isWhatsAppIntegration(int) ? `WhatsApp API · ${getWhatsAppEngineLabel(getWhatsAppEngine(int))}` : PROVIDER_LABEL[int.provider]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{int.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {isWhatsAppIntegration(int) && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 text-[11px] text-gray-600 dark:text-gray-300">
                          {int.instance_name || getWhatsAppDisplayName(int)}
                        </span>
                      )}
                      {(int.base_url || int.webhook_url) && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 text-[11px] text-gray-600 dark:text-gray-300 break-all">
                          {int.base_url || int.webhook_url}
                        </span>
                      )}
                      {int.host && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 text-[11px] text-gray-600 dark:text-gray-300">
                          SMTP {int.host}{int.port ? `:${int.port}` : ''}
                        </span>
                      )}
                      {int.inbox_id && (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-50 dark:bg-gray-800 text-[11px] text-gray-600 dark:text-gray-300">
                          Inbox #{int.inbox_id}
                        </span>
                      )}
                    </div>
                    {int.last_test_at && (
                      <p className="text-xs text-gray-400 mt-2">Último teste: {new Date(int.last_test_at).toLocaleString('pt-BR')}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_CLASS[int.status])}>
                    {STATUS_LABEL[int.status]}
                  </span>
                  <div className="flex items-center gap-1">
                    {((['evolution', 'chatwoot', 'chatwoot_disparo', 'email_smtp', 'n8n'] as IntegrationProvider[]).includes(int.provider) || isWhatsAppIntegration(int)) && (
                      <button type="button" onClick={() => registrarTeste(int)} disabled={testando === int.provider}
                        title="Registrar teste na fila"
                        className="w-8 h-8 rounded-lg text-gray-400 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-600 dark:hover:text-green-400 flex items-center justify-center">
                        {testando === int.provider ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      </button>
                    )}
                    <button type="button" onClick={() => startEdit(int)} title="Configurar"
                      className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-200 flex items-center justify-center">
                      <Pencil size={14} />
                    </button>
                    {isAdmin && (
                      <button type="button" onClick={() => setConfirmDelete(int)} title="Remover integração"
                        className="w-8 h-8 rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 dark:hover:text-red-400 flex items-center justify-center transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Documentos do contato</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Defina se os anexos do popup do chat serão gravados no Supabase Storage ou em um caminho do seu servidor.
            </p>
          </div>
          <span className="px-2 py-1 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {documentStorage.mode === 'server' ? 'Servidor próprio' : 'Supabase Storage'}
          </span>
        </div>

        <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-2">
          {[
            { id: 'supabase', label: 'Supabase Storage' },
            { id: 'server', label: 'Servidor próprio' },
          ].map(option => (
            <button
              key={option.id}
              type="button"
              onClick={() => setDocumentStorage(prev => ({ ...prev, mode: option.id as ContactDocumentStorageConfig['mode'] }))}
              className={cn(
                'px-3 py-2 text-xs font-medium rounded-md transition-colors',
                documentStorage.mode === option.id
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {documentStorage.mode === 'supabase' ? (
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigInput
              label="Bucket do Supabase"
              value={documentStorage.supabase_bucket}
              onChange={v => setDocumentStorage(prev => ({ ...prev, supabase_bucket: v }))}
              placeholder="chat-lead-documentos"
            />
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">
              Recomendado para começar. Mais simples de manter, com leitura e exclusão dentro do próprio sistema.
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <ConfigInput
              label="URL de upload"
              value={documentStorage.server_upload_url}
              onChange={v => setDocumentStorage(prev => ({ ...prev, server_upload_url: v }))}
              placeholder="https://seuservidor.com/api/chat-docs/upload"
            />
            <ConfigInput
              label="URL de exclusão"
              value={documentStorage.server_delete_url}
              onChange={v => setDocumentStorage(prev => ({ ...prev, server_delete_url: v }))}
              placeholder="https://seuservidor.com/api/chat-docs/delete"
            />
            <ConfigInput
              label="Base pública dos arquivos"
              value={documentStorage.server_public_base_url}
              onChange={v => setDocumentStorage(prev => ({ ...prev, server_public_base_url: v }))}
              placeholder="https://seuservidor.com/uploads/chat-leads"
            />
            <ConfigInput
              label="Token do servidor"
              value={documentStorage.server_auth_token}
              onChange={v => setDocumentStorage(prev => ({ ...prev, server_auth_token: v }))}
              placeholder="Bearer/Token para upload e exclusão"
            />
          </div>
        )}

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => void salvarDocumentStorage()}
            disabled={savingDocumentStorage}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50"
          >
            {savingDocumentStorage ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar armazenamento
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Fila de Comunicação</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">
              {['Canal', 'Destino', 'Status', 'Criado em'].map(h => <th key={h} className="px-5 py-3">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {outbox.length === 0 ? (
              <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Nenhum envio registrado ainda.</td></tr>
            ) : outbox.map(item => (
              <tr key={item.id}>
                <td className="px-5 py-3">{item.channel}</td>
                <td className="px-5 py-3 text-gray-500">{item.to_address}</td>
                <td className="px-5 py-3">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">{item.status}</span>
                </td>
                <td className="px-5 py-3 text-gray-400 text-xs">{new Date(item.created_at).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {toastI && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium',
          toastI.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
        )}>
          {toastI.msg}
          <button type="button" title="Fechar" onClick={() => setToastI(null)} className="ml-1 opacity-80 hover:opacity-100"><X size={14} /></button>
        </div>
      )}
    </div>
  )
}

function AbaAutomacoes() {
  const { profile } = useAuth()
  const isAdmin = isAdminProfile(profile)
  const [automacoes, setAutomacoes] = useState<AutomationRule[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [schemaPronto, setSchemaPronto] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [toastA, setToastA] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  function showMsgA(msg: string, type: 'ok' | 'err' = 'err') {
    setToastA({ msg, type })
    setTimeout(() => setToastA(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const resp = await fetch(getApiUrl('/automation/rules'))
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error ?? `Erro ${resp.status}`)
      setAutomacoes((data.rules ?? []) as AutomationRule[])
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar automações')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function toggleAutomacao(rule: AutomationRule) {
    setSavingId(rule.id)
    setAutomacoes(prev => prev.map(a => a.id === rule.id ? { ...a, ativo: !a.ativo } : a))
    try {
      const resp = await fetch(getApiUrl(`/automation/rules/${rule.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !rule.ativo }),
      })
      if (!resp.ok) throw new Error()
    } catch {
      setAutomacoes(prev => prev.map(a => a.id === rule.id ? { ...a, ativo: rule.ativo } : a))
      showMsgA('Erro ao atualizar automação')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  }

  if (erro) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg p-4 text-sm">
        Erro ao carregar automações: {erro}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-gray-800 dark:text-gray-200">Regras de Automação</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Essas regras alimentam a fila de comunicação para WhatsApp, email e webhooks.
        </p>
      </div>
      {!schemaPronto && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 rounded-lg p-4 text-sm">
          O schema de automações ainda não foi aplicado no Supabase. Execute <strong>sql/integrations_schema.sql</strong> para liberar essa aba.
        </div>
      )}
      <div className="space-y-3">
        {automacoes.map(a => (
          <div key={a.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-sm">{a.label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Canal: {automationChannelLabel(a.channel)} · Gatilho: {a.trigger_key}
              </p>
            </div>
            <button
              type="button"
              disabled={!isAdmin || !schemaPronto || savingId === a.id}
              onClick={() => toggleAutomacao(a)}
              className={cn('relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50',
                a.ativo ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700')}
            >
              <span className={cn('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
                a.ativo ? 'translate-x-5' : 'translate-x-0')} />
            </button>
          </div>
        ))}
      </div>
      {toastA && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium',
          toastA.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
        )}>
          {toastA.msg}
          <button type="button" title="Fechar" onClick={() => setToastA(null)} className="ml-1 opacity-80 hover:opacity-100"><X size={14} /></button>
        </div>
      )}
    </div>
  )
}

function ConfigInput({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>
  )
}

function SummaryChip({ label, value, tone }: { label: string; value: number; tone: 'green' | 'yellow' | 'blue' }) {
  const toneClass: Record<'green' | 'yellow' | 'blue', string> = {
    green: 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400',
    yellow: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
    blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
  }
  return (
    <div className={cn('rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-800', toneClass[tone])}>
      <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
      <p className="text-sm font-semibold leading-none mt-1">{value}</p>
    </div>
  )
}

// ── Aba Pontos de Atendimento ─────────────────────────────────

type ProfileH = {
  id: string; nome: string; email: string | null; perfil: string; status: string
  nivel_hierarquia: number; parent_profile_id: string | null
  ponto_atendimento_id: string | null; link_loja: string | null; supervisao_pct: number
}
type FaixaH = {
  id: string; profile_id: string; tipo_comissao: string; faixa: string
  min_emissoes: number; max_emissoes: number | null; percentual: number
  valor_exemplo: number | null; ordem: number; ativo: boolean
}
type RemuneracaoRegraH = {
  id: string
  profile_id: string
  ponto_atendimento_id: string | null
  escopo: 'validacao' | 'venda'
  tipo_calculo: 'fixa' | 'percentual'
  documento_tipo: 'geral' | 'cpf' | 'cnpj'
  valor: number
  ativo: boolean
}
type ModeloNegocioH = {
  id: string
  profile_id: string
  ponto_atendimento_id: string | null
  modo_operacao: 'comissao' | 'revenda'
  ativo: boolean
}
type RevendaPrecoBaseH = {
  id: string
  profile_id: string
  ponto_atendimento_id: string
  tabela_preco_item_id: string
  valor_base: number
  ativo: boolean
  tabela_nome?: string | null
  produto_nome?: string | null
}
type RepasseRegraH = {
  id: string
  parent_profile_id: string
  child_profile_id: string
  ponto_atendimento_id: string
  escopo: 'validacao' | 'venda' | 'margem_revenda'
  tipo_calculo: 'fixa' | 'percentual'
  valor: number
  ativo: boolean
  parent_nome?: string | null
}
type TabelaPrecoItemResumoH = {
  id: string
  tabela_preco_id: string
  tabela_nome: string | null
  certificado_id: string | null
  produto_nome: string | null
  valor: number | null
  valor_custo: number | null
  ativo: boolean
}

const TIPO_COMISSAO_LABEL: Record<string, string> = {
  validacao:   'Validação',
  venda_direta: 'Venda direta',
}
const ESCOPO_REMUNERACAO_LABEL: Record<'validacao' | 'venda', string> = { validacao: 'Validação', venda: 'Venda' }
const ESCOPO_REPASSE_LABEL: Record<'validacao' | 'venda' | 'margem_revenda', string> = { validacao: 'Validação', venda: 'Venda', margem_revenda: 'Margem de revenda' }
const TIPO_CALCULO_LABEL: Record<'fixa' | 'percentual', string> = { fixa: 'Valor fixo', percentual: 'Percentual' }
const DOCUMENTO_TIPO_LABEL: Record<'geral' | 'cpf' | 'cnpj', string> = { geral: 'Geral', cpf: 'CPF', cnpj: 'CNPJ' }
const MODO_OPERACAO_LABEL: Record<'comissao' | 'revenda', string> = { comissao: 'Comissão', revenda: 'Revenda' }

function FaixasPanel({ profileId, onClose }: { profileId: string; onClose: () => void }) {
  const [faixas, setFaixas] = useState<FaixaH[]>([])
  const [loading, setLoading] = useState(true)
  const [tipo, setTipo] = useState<'validacao' | 'venda_direta'>('validacao')
  const [form, setForm] = useState({ faixa: '', min_emissoes: 1, max_emissoes: '', percentual: '', valor_exemplo: '', ordem: 1 })
  const [editingFaixaId, setEditingFaixaId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(getApiUrl(`/hierarquia/faixas/${profileId}`))
    const d = await r.json()
    setFaixas((d.faixas ?? []) as FaixaH[])
    setLoading(false)
  }, [profileId])

  useEffect(() => { void load() }, [load])

  const doFaixasByTipo = faixas.filter(f => f.tipo_comissao === tipo).sort((a, b) => a.ordem - b.ordem)

  function editFaixa(f: FaixaH) {
    setEditingFaixaId(f.id)
    setForm({ faixa: f.faixa, min_emissoes: f.min_emissoes, max_emissoes: String(f.max_emissoes ?? ''), percentual: String(f.percentual), valor_exemplo: String(f.valor_exemplo ?? ''), ordem: f.ordem })
    setTipo(f.tipo_comissao as 'validacao' | 'venda_direta')
  }

  async function salvarFaixa() {
    if (!form.faixa.trim() || !form.percentual) return
    setSaving(true)
    await fetch(getApiUrl('/hierarquia/faixas'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingFaixaId,
        profile_id: profileId,
        tipo_comissao: tipo,
        faixa: form.faixa.trim(),
        min_emissoes: Number(form.min_emissoes),
        max_emissoes: form.max_emissoes ? Number(form.max_emissoes) : null,
        percentual: Number(form.percentual),
        valor_exemplo: form.valor_exemplo ? Number(form.valor_exemplo) : null,
        ordem: Number(form.ordem),
      }),
    })
    setEditingFaixaId(null)
    setForm({ faixa: '', min_emissoes: 1, max_emissoes: '', percentual: '', valor_exemplo: '', ordem: (doFaixasByTipo.length + 1) })
    setSaving(false)
    void load()
  }

  async function deletarFaixa(id: string) {
    await fetch(getApiUrl(`/hierarquia/faixas/${id}/${profileId}`), { method: 'DELETE' })
    void load()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Percent size={15} className="text-blue-500" /> Faixas de Comissão</h3>
          <button type="button" title="Fechar" onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="flex gap-2 px-5 pt-4">
          {(['validacao', 'venda_direta'] as const).map(t => (
            <button key={t} type="button" onClick={() => setTipo(t)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', tipo === t ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400')}>
              {TIPO_COMISSAO_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-4">
          {loading ? <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gray-400" /></div> : (
            <>
              {doFaixasByTipo.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Nenhuma faixa configurada para {TIPO_COMISSAO_LABEL[tipo].toLowerCase()}.</p>}
              {doFaixasByTipo.map(f => (
                <div key={f.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{f.faixa}</p>
                    <p className="text-xs text-gray-500">{f.min_emissoes}{f.max_emissoes ? `–${f.max_emissoes}` : '+'} emissões → <strong>{Number(f.percentual).toFixed(2)}%</strong></p>
                  </div>
                  <button type="button" title="Editar" onClick={() => editFaixa(f)} className="w-7 h-7 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-center"><Pencil size={13} /></button>
                  <button type="button" title="Excluir" onClick={() => void deletarFaixa(f.id)} className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center"><Trash2 size={13} /></button>
                </div>
              ))}
            </>
          )}

          <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium text-gray-500">{editingFaixaId ? 'Editando faixa' : `Nova faixa — ${TIPO_COMISSAO_LABEL[tipo]}`}</p>
            <input type="text" placeholder="Nome da faixa (ex: Bronze, Prata)" value={form.faixa} onChange={e => setForm(p => ({ ...p, faixa: e.target.value }))}
              className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">Mín emissões</span>
                <input type="number" min={1} value={form.min_emissoes} onChange={e => setForm(p => ({ ...p, min_emissoes: Number(e.target.value) }))}
                  className="border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">Máx (vazio=ilimitado)</span>
                <input type="number" min={1} value={form.max_emissoes} onChange={e => setForm(p => ({ ...p, max_emissoes: e.target.value }))}
                  className="border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">% Comissão</span>
                <input type="number" step="0.01" min={0} value={form.percentual} onChange={e => setForm(p => ({ ...p, percentual: e.target.value }))}
                  className="border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void salvarFaixa()} disabled={saving || !form.faixa.trim() || !form.percentual}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {editingFaixaId ? 'Salvar' : 'Adicionar'}
              </button>
              {editingFaixaId && <button type="button" onClick={() => { setEditingFaixaId(null); setForm({ faixa: '', min_emissoes: 1, max_emissoes: '', percentual: '', valor_exemplo: '', ordem: 1 }) }} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancelar</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


function RemuneracaoPanel({ profileId, pontoId, onClose }: { profileId: string; pontoId: string; onClose: () => void }) {
  const [regras, setRegras] = useState<RemuneracaoRegraH[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<{ escopo: 'validacao' | 'venda'; tipo_calculo: 'fixa' | 'percentual'; documento_tipo: 'geral' | 'cpf' | 'cnpj'; valor: string; ativo: boolean }>({
    escopo: 'validacao',
    tipo_calculo: 'fixa',
    documento_tipo: 'geral',
    valor: '',
    ativo: true,
  })

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch(getApiUrl(`/hierarquia/remuneracao/${profileId}/${pontoId}`))
    const d = await r.json()
    setRegras((d.regras ?? []) as RemuneracaoRegraH[])
    setLoading(false)
  }, [profileId, pontoId])

  useEffect(() => { void load() }, [load])

  function editar(regra: RemuneracaoRegraH) {
    setEditingId(regra.id)
    setForm({
      escopo: regra.escopo,
      tipo_calculo: regra.tipo_calculo,
      documento_tipo: regra.documento_tipo,
      valor: String(regra.valor ?? ''),
      ativo: regra.ativo,
    })
  }

  async function salvar() {
    if (!form.valor.trim()) return
    setSaving(true)
    await fetch(getApiUrl('/hierarquia/remuneracao'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingId,
        profile_id: profileId,
        ponto_atendimento_id: pontoId,
        escopo: form.escopo,
        tipo_calculo: form.tipo_calculo,
        documento_tipo: form.documento_tipo,
        valor: Number(form.valor),
        ativo: form.ativo,
      }),
    })
    setEditingId(null)
    setForm({ escopo: 'validacao', tipo_calculo: 'fixa', documento_tipo: 'geral', valor: '', ativo: true })
    setSaving(false)
    void load()
  }

  async function remover(id: string) {
    await fetch(getApiUrl(`/hierarquia/remuneracao/${id}/${profileId}`), { method: 'DELETE' })
    void load()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2"><CreditCard size={15} className="text-emerald-600" /> Remuneração do Agente</h3>
          <button type="button" title="Fechar" onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {loading ? <div className="flex justify-center py-6"><Loader2 size={20} className="animate-spin text-gray-400" /></div> : (
            <div className="space-y-2">
              {regras.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Nenhuma regra cadastrada para este agente neste ponto.</p>}
              {regras.map(regra => (
                <div key={regra.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{ESCOPO_REMUNERACAO_LABEL[regra.escopo]} · {DOCUMENTO_TIPO_LABEL[regra.documento_tipo]}</p>
                    <p className="text-xs text-gray-500">{TIPO_CALCULO_LABEL[regra.tipo_calculo]}: <strong>{regra.tipo_calculo === 'percentual' ? `${Number(regra.valor).toFixed(2)}%` : `R$ ${Number(regra.valor).toFixed(2)}`}</strong></p>
                  </div>
                  <button type="button" title="Editar" onClick={() => editar(regra)} className="w-7 h-7 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-center"><Pencil size={13} /></button>
                  <button type="button" title="Excluir" onClick={() => void remover(regra.id)} className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}

          <div className="border border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-3 space-y-3">
            <p className="text-xs font-medium text-gray-500">{editingId ? 'Editar regra' : 'Nova regra de remuneração'}</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <select value={form.escopo} onChange={e => setForm(p => ({ ...p, escopo: e.target.value as 'validacao' | 'venda' }))} className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="validacao">Validação</option>
                <option value="venda">Venda</option>
              </select>
              <select value={form.tipo_calculo} onChange={e => setForm(p => ({ ...p, tipo_calculo: e.target.value as 'fixa' | 'percentual' }))} className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="fixa">Valor fixo</option>
                <option value="percentual">Percentual</option>
              </select>
              <select value={form.documento_tipo} onChange={e => setForm(p => ({ ...p, documento_tipo: e.target.value as 'geral' | 'cpf' | 'cnpj' }))} className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="geral">Geral</option>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
              </select>
              <input type="number" min={0} step="0.01" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} placeholder={form.tipo_calculo === 'percentual' ? 'Ex: 8.5' : 'Ex: 25'} className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => void salvar()} disabled={saving || !form.valor.trim()} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                {editingId ? 'Salvar' : 'Adicionar'}
              </button>
              {editingId && <button type="button" onClick={() => { setEditingId(null); setForm({ escopo: 'validacao', tipo_calculo: 'fixa', documento_tipo: 'geral', valor: '', ativo: true }) }} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancelar</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ModeloComercialPanel({
  profile,
  pontoId,
  allProfiles,
  onClose,
}: {
  profile: ProfileH
  pontoId: string
  allProfiles: ProfileH[]
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [savingModelo, setSavingModelo] = useState(false)
  const [modoOperacao, setModoOperacao] = useState<'comissao' | 'revenda'>('comissao')
  const [modeloAtual, setModeloAtual] = useState<ModeloNegocioH | null>(null)
  const [itensTabela, setItensTabela] = useState<TabelaPrecoItemResumoH[]>([])
  const [precosBase, setPrecosBase] = useState<RevendaPrecoBaseH[]>([])
  const [repasses, setRepasses] = useState<RepasseRegraH[]>([])
  const [savingPreco, setSavingPreco] = useState(false)
  const [savingRepasse, setSavingRepasse] = useState(false)
  const [editingPrecoId, setEditingPrecoId] = useState<string | null>(null)
  const [editingRepasseId, setEditingRepasseId] = useState<string | null>(null)
  const [precoForm, setPrecoForm] = useState({ tabela_preco_item_id: '', valor_base: '' })
  const [repasseForm, setRepasseForm] = useState<{ parent_profile_id: string; escopo: 'validacao' | 'venda' | 'margem_revenda'; tipo_calculo: 'fixa' | 'percentual'; valor: string }>({
    parent_profile_id: '',
    escopo: 'margem_revenda',
    tipo_calculo: 'percentual',
    valor: '',
  })

  const perfisElegiveis = allProfiles.filter(item => item.id !== profile.id && (item.perfil === 'agente_registro' || item.perfil === 'vendedor'))

  const load = useCallback(async () => {
    setLoading(true)
    const [modeloResp, itensResp, precosResp, repassesResp] = await Promise.all([
      fetch(getApiUrl(`/hierarquia/modelo-comercial/${profile.id}/${pontoId}`)),
      fetch(getApiUrl('/hierarquia/tabela-itens')),
      fetch(getApiUrl(`/hierarquia/revenda-precos/${profile.id}/${pontoId}`)),
      fetch(getApiUrl(`/hierarquia/repasses/${profile.id}/${pontoId}`)),
    ])
    const [modeloData, itensData, precosData, repassesData] = await Promise.all([
      modeloResp.json(),
      itensResp.json(),
      precosResp.json(),
      repassesResp.json(),
    ])
    setModeloAtual((modeloData.modelo ?? null) as ModeloNegocioH | null)
    setModoOperacao(((modeloData.modelo?.modo_operacao as 'comissao' | 'revenda' | undefined) ?? 'comissao'))
    setItensTabela((itensData.itens ?? []) as TabelaPrecoItemResumoH[])
    setPrecosBase((precosData.precos ?? []) as RevendaPrecoBaseH[])
    setRepasses((repassesData.regras ?? []) as RepasseRegraH[])
    setLoading(false)
  }, [profile.id, pontoId])

  useEffect(() => { void load() }, [load])

  async function salvarModelo() {
    setSavingModelo(true)
    const response = await fetch(getApiUrl('/hierarquia/modelo-comercial'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: profile.id,
        ponto_atendimento_id: pontoId,
        modo_operacao: modoOperacao,
        ativo: true,
      }),
    })
    const data = await response.json()
    setModeloAtual((data.modelo ?? null) as ModeloNegocioH | null)
    setSavingModelo(false)
  }

  function editarPreco(preco: RevendaPrecoBaseH) {
    setEditingPrecoId(preco.id)
    setPrecoForm({ tabela_preco_item_id: preco.tabela_preco_item_id, valor_base: String(preco.valor_base ?? '') })
  }

  async function salvarPreco() {
    if (!precoForm.tabela_preco_item_id || !precoForm.valor_base.trim()) return
    setSavingPreco(true)
    await fetch(getApiUrl('/hierarquia/revenda-precos'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingPrecoId,
        profile_id: profile.id,
        ponto_atendimento_id: pontoId,
        tabela_preco_item_id: precoForm.tabela_preco_item_id,
        valor_base: Number(precoForm.valor_base),
        ativo: true,
      }),
    })
    setEditingPrecoId(null)
    setPrecoForm({ tabela_preco_item_id: '', valor_base: '' })
    setSavingPreco(false)
    void load()
  }

  async function removerPreco(id: string) {
    await fetch(getApiUrl(`/hierarquia/revenda-precos/${id}/${profile.id}`), { method: 'DELETE' })
    void load()
  }

  function editarRepasse(regra: RepasseRegraH) {
    setEditingRepasseId(regra.id)
    setRepasseForm({
      parent_profile_id: regra.parent_profile_id,
      escopo: regra.escopo,
      tipo_calculo: regra.tipo_calculo,
      valor: String(regra.valor ?? ''),
    })
  }

  async function salvarRepasse() {
    if (!repasseForm.parent_profile_id || !repasseForm.valor.trim()) return
    setSavingRepasse(true)
    await fetch(getApiUrl('/hierarquia/repasses'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingRepasseId,
        parent_profile_id: repasseForm.parent_profile_id,
        child_profile_id: profile.id,
        ponto_atendimento_id: pontoId,
        escopo: repasseForm.escopo,
        tipo_calculo: repasseForm.tipo_calculo,
        valor: Number(repasseForm.valor),
        ativo: true,
      }),
    })
    setEditingRepasseId(null)
    setRepasseForm({ parent_profile_id: '', escopo: 'margem_revenda', tipo_calculo: 'percentual', valor: '' })
    setSavingRepasse(false)
    void load()
  }

  async function removerRepasse(id: string) {
    await fetch(getApiUrl(`/hierarquia/repasses/${id}/${profile.id}`), { method: 'DELETE' })
    void load()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2"><Network size={15} className="text-amber-600" /> Modelo Comercial</h3>
            <p className="text-xs text-gray-500 mt-1">Defina se este perfil opera por comissão ou por revenda neste ponto.</p>
          </div>
          <button type="button" title="Fechar" onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {loading ? <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin text-gray-400" /></div> : (
            <>
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Modo de operação</p>
                    <p className="text-xs text-gray-500">Atual: {MODO_OPERACAO_LABEL[(modeloAtual?.modo_operacao ?? 'comissao') as 'comissao' | 'revenda']}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select value={modoOperacao} onChange={e => setModoOperacao(e.target.value as 'comissao' | 'revenda')} className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="comissao">Comissão</option>
                      <option value="revenda">Revenda</option>
                    </select>
                    <button type="button" onClick={() => void salvarModelo()} disabled={savingModelo} className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2">
                      {savingModelo ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Salvar modo
                    </button>
                  </div>
                </div>
              </div>

              {modoOperacao === 'revenda' && (
                <>
                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Preço base da revenda</p>
                      <p className="text-xs text-gray-500">Esse é o custo base do perfil por produto. O valor cobrado acima disso vira margem de revenda.</p>
                    </div>
                    <div className="space-y-2">
                      {precosBase.length === 0 && <p className="text-xs text-gray-400">Nenhum preço base configurado.</p>}
                      {precosBase.map(preco => (
                        <div key={preco.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{preco.produto_nome ?? 'Produto'} <span className="text-gray-400">· {preco.tabela_nome ?? 'Tabela'}</span></p>
                            <p className="text-xs text-gray-500">Base: <strong>R$ {Number(preco.valor_base ?? 0).toFixed(2)}</strong></p>
                          </div>
                          <button type="button" title="Editar" onClick={() => editarPreco(preco)} className="w-7 h-7 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center"><Pencil size={13} /></button>
                          <button type="button" title="Excluir" onClick={() => void removerPreco(preco.id)} className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 size={13} /></button>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <select value={precoForm.tabela_preco_item_id} onChange={e => setPrecoForm(p => ({ ...p, tabela_preco_item_id: e.target.value }))} className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Selecione o produto</option>
                        {itensTabela.map(item => (
                          <option key={item.id} value={item.id}>{item.tabela_nome ?? 'Tabela'} · {item.produto_nome ?? 'Produto'} · Venda R$ {Number(item.valor ?? 0).toFixed(2)}</option>
                        ))}
                      </select>
                      <input type="number" min={0} step="0.01" value={precoForm.valor_base} onChange={e => setPrecoForm(p => ({ ...p, valor_base: e.target.value }))} placeholder="Preço base" className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void salvarPreco()} disabled={savingPreco || !precoForm.tabela_preco_item_id || !precoForm.valor_base.trim()} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {savingPreco ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        {editingPrecoId ? 'Salvar base' : 'Adicionar base'}
                      </button>
                      {editingPrecoId && <button type="button" onClick={() => { setEditingPrecoId(null); setPrecoForm({ tabela_preco_item_id: '', valor_base: '' }) }} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancelar</button>}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Repasses da estrutura</p>
                      <p className="text-xs text-gray-500">Define quanto este perfil repassa para quem está acima dele ou na estrutura dele, inclusive sobre a margem de revenda.</p>
                    </div>
                    <div className="space-y-2">
                      {repasses.length === 0 && <p className="text-xs text-gray-400">Nenhuma regra de repasse configurada.</p>}
                      {repasses.map(regra => (
                        <div key={regra.id} className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{regra.parent_nome ?? 'Perfil superior'} · {ESCOPO_REPASSE_LABEL[regra.escopo]}</p>
                            <p className="text-xs text-gray-500">{TIPO_CALCULO_LABEL[regra.tipo_calculo]}: <strong>{regra.tipo_calculo === 'percentual' ? `${Number(regra.valor).toFixed(2)}%` : `R$ ${Number(regra.valor).toFixed(2)}`}</strong></p>
                          </div>
                          <button type="button" title="Editar" onClick={() => editarRepasse(regra)} className="w-7 h-7 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center"><Pencil size={13} /></button>
                          <button type="button" title="Excluir" onClick={() => void removerRepasse(regra.id)} className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center"><Trash2 size={13} /></button>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <select value={repasseForm.parent_profile_id} onChange={e => setRepasseForm(p => ({ ...p, parent_profile_id: e.target.value }))} className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Quem recebe</option>
                        {perfisElegiveis.map(item => (
                          <option key={item.id} value={item.id}>{item.nome} · {item.perfil === 'agente_registro' ? 'Agente' : 'Vendedor'}</option>
                        ))}
                      </select>
                      <select value={repasseForm.escopo} onChange={e => setRepasseForm(p => ({ ...p, escopo: e.target.value as 'validacao' | 'venda' | 'margem_revenda' }))} className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="margem_revenda">Margem de revenda</option>
                        <option value="venda">Venda</option>
                        <option value="validacao">Validação</option>
                      </select>
                      <select value={repasseForm.tipo_calculo} onChange={e => setRepasseForm(p => ({ ...p, tipo_calculo: e.target.value as 'fixa' | 'percentual' }))} className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="percentual">Percentual</option>
                        <option value="fixa">Valor fixo</option>
                      </select>
                      <input type="number" min={0} step="0.01" value={repasseForm.valor} onChange={e => setRepasseForm(p => ({ ...p, valor: e.target.value }))} placeholder="Valor" className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => void salvarRepasse()} disabled={savingRepasse || !repasseForm.parent_profile_id || !repasseForm.valor.trim()} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {savingRepasse ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        {editingRepasseId ? 'Salvar repasse' : 'Adicionar repasse'}
                      </button>
                      {editingRepasseId && <button type="button" onClick={() => { setEditingRepasseId(null); setRepasseForm({ parent_profile_id: '', escopo: 'margem_revenda', tipo_calculo: 'percentual', valor: '' }) }} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancelar</button>}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}


function ProfileNode({
  profile, allProfiles, depth, pontoId, onRefresh, availableVendedores,
}: {
  profile: ProfileH
  allProfiles: ProfileH[]
  depth: number
  pontoId: string
  onRefresh: () => void
  availableVendedores: ProfileH[]
}) {
  const children = allProfiles.filter(p => p.parent_profile_id === profile.id)
  const [expanded, setExpanded] = useState(true)
  const [showFaixas, setShowFaixas] = useState(false)
  const [showRemuneracao, setShowRemuneracao] = useState(false)
  const [showModeloComercial, setShowModeloComercial] = useState(false)
  const [showAddChild, setShowAddChild] = useState(false)
  const [selectedChild, setSelectedChild] = useState('')
  const [supervisaoVal, setSupervisaoVal] = useState(String(profile.supervisao_pct ?? 0))
  const [linkLojaVal, setLinkLojaVal] = useState(profile.link_loja ?? '')
  const [editingConfig, setEditingConfig] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [addingChild, setAddingChild] = useState(false)
  const [removendo, setRemovendo] = useState(false)

  const isAgente = profile.perfil === 'agente_registro'
  const canHaveChildren = depth < 3
  const indent = depth * 20

  async function salvarConfig() {
    setSavingConfig(true)
    await fetch(getApiUrl(`/hierarquia/profile/${profile.id}/config`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supervisao_pct: Number(supervisaoVal), link_loja: linkLojaVal.trim() || null }),
    })
    setSavingConfig(false)
    setEditingConfig(false)
    onRefresh()
  }

  async function vincularFilho() {
    if (!selectedChild) return
    setAddingChild(true)
    await fetch(getApiUrl('/hierarquia/vendedor/vincular'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendedorId: selectedChild, parentId: profile.id, nivel: depth + 1 }),
    })
    setAddingChild(false)
    setShowAddChild(false)
    setSelectedChild('')
    onRefresh()
  }

  async function remover() {
    if (!confirm(`Remover ${profile.nome} da hierarquia?`)) return
    setRemovendo(true)
    if (isAgente) {
      await fetch(getApiUrl('/hierarquia/agente/desvincular'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: profile.id, pontoId }),
      })
    } else {
      await fetch(getApiUrl('/hierarquia/vendedor/desvincular'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendedorId: profile.id }),
      })
    }
    setRemovendo(false)
    onRefresh()
  }

  const levelColors = ['text-blue-600', 'text-emerald-600', 'text-violet-600', 'text-amber-600']
  const levelBg = ['bg-blue-50 dark:bg-blue-900/20', 'bg-emerald-50 dark:bg-emerald-900/20', 'bg-violet-50 dark:bg-violet-900/20', 'bg-amber-50 dark:bg-amber-900/20']
  const levelLabel = isAgente ? 'Agente' : `Vendedor N${depth}`

  return (
    <div style={{ marginLeft: `${indent}px` }}>
      <div className={cn('rounded-xl border border-gray-200 dark:border-gray-800 mb-2 overflow-hidden', profile.status === 'inativo' && 'opacity-60')}>
        <div className={cn('flex items-center gap-2 px-3 py-2.5', levelBg[depth])}>
          {children.length > 0 && (
            <button type="button" onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-gray-600 shrink-0">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
          {children.length === 0 && <div className="w-4 shrink-0" />}

          <span className={cn('text-xs font-bold uppercase tracking-wide shrink-0', levelColors[depth])}>{levelLabel}</span>
          <span className="font-medium text-sm text-gray-800 dark:text-gray-200 truncate">{profile.nome}</span>
          {profile.email && <span className="text-xs text-gray-400 truncate hidden md:block">{profile.email}</span>}

          {profile.link_loja && (
            <span className="flex items-center gap-1 text-xs text-gray-500 bg-white dark:bg-gray-800 px-2 py-0.5 rounded-full shrink-0">
              <Link size={10} />/loja/{profile.link_loja}
            </span>
          )}

          {Number(profile.supervisao_pct) > 0 && (
            <span className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded-full shrink-0">
              supervisão {Number(profile.supervisao_pct).toFixed(1)}%
            </span>
          )}

          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button type="button" title="Faixas de comissão" onClick={() => setShowFaixas(true)}
              className="w-7 h-7 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-center">
              <Percent size={13} />
            </button>
            {isAgente && (
              <button type="button" title="Remuneração" onClick={() => setShowRemuneracao(true)}
                className="w-7 h-7 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center justify-center">
                <CreditCard size={13} />
              </button>
            )}
            <button type="button" title="Modelo comercial" onClick={() => setShowModeloComercial(true)}
              className="w-7 h-7 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center justify-center">
              <Network size={13} />
            </button>
            <button type="button" title="Configurar" onClick={() => setEditingConfig(v => !v)}
              className="w-7 h-7 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white dark:hover:bg-gray-800 flex items-center justify-center">
              <Pencil size={13} />
            </button>
            {canHaveChildren && (
              <button type="button" title="Adicionar vendedor" onClick={() => setShowAddChild(v => !v)}
                className="w-7 h-7 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center justify-center">
                <Plus size={13} />
              </button>
            )}
            <button type="button" title="Remover da hierarquia" onClick={() => void remover()} disabled={removendo}
              className="w-7 h-7 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center">
              {removendo ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
            </button>
          </div>
        </div>

        {editingConfig && (
          <div className="bg-white dark:bg-gray-900 px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-3 items-end">
            {!isAgente && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">Link da loja (slug)</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">/loja/</span>
                  <input type="text" value={linkLojaVal} onChange={e => setLinkLojaVal(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                    placeholder="meu-nome" className="border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm w-32 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}
            {canHaveChildren && (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-500">Supervisão de rede (%)</span>
                <input type="number" step="0.1" min={0} max={100} value={supervisaoVal} onChange={e => setSupervisaoVal(e.target.value)}
                  className="border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm w-24 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            )}
            <button type="button" onClick={() => void salvarConfig()} disabled={savingConfig}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {savingConfig ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Salvar
            </button>
            <button type="button" onClick={() => setEditingConfig(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancelar</button>
          </div>
        )}

        {showAddChild && (
          <div className="bg-white dark:bg-gray-900 px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex gap-2 items-end flex-wrap">
            <div className="flex flex-col gap-1 flex-1 min-w-48">
              <span className="text-xs text-gray-500">Vincular vendedor existente</span>
              <select value={selectedChild} onChange={e => setSelectedChild(e.target.value)}
                className="border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Selecione…</option>
                {availableVendedores.map(v => (
                  <option key={v.id} value={v.id}>{v.nome} {v.email ? `(${v.email})` : ''}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => void vincularFilho()} disabled={!selectedChild || addingChild}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50">
              {addingChild ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Vincular
            </button>
            <button type="button" onClick={() => setShowAddChild(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancelar</button>
          </div>
        )}
      </div>

      {expanded && children.map(child => (
        <ProfileNode key={child.id} profile={child} allProfiles={allProfiles} depth={depth + 1}
          pontoId={pontoId} onRefresh={onRefresh} availableVendedores={availableVendedores} />
      ))}

      {showFaixas && <FaixasPanel profileId={profile.id} onClose={() => setShowFaixas(false)} />}
      {showRemuneracao && <RemuneracaoPanel profileId={profile.id} pontoId={pontoId} onClose={() => setShowRemuneracao(false)} />}
      {showModeloComercial && <ModeloComercialPanel profile={profile} pontoId={pontoId} allProfiles={allProfiles} onClose={() => setShowModeloComercial(false)} />}
    </div>
  )
}

function PontoHierarquiaPanel({ ponto, onClose }: { ponto: PontoAtendimento; onClose: () => void }) {
  const [profiles, setProfiles] = useState<ProfileH[]>([])
  const [availableAgentes, setAvailableAgentes] = useState<ProfileH[]>([])
  const [availableVendedores, setAvailableVendedores] = useState<ProfileH[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddAgente, setShowAddAgente] = useState(false)
  const [selectedAgente, setSelectedAgente] = useState('')
  const [addingAgente, setAddingAgente] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [treeResp, agentesResp, vendResp] = await Promise.all([
      fetch(getApiUrl(`/hierarquia/ponto/${ponto.id}`)),
      fetch(getApiUrl(`/hierarquia/agentes-disponiveis?pontoId=${ponto.id}`)),
      fetch(getApiUrl('/hierarquia/vendedores-disponiveis')),
    ])
    const [tree, ag, vd] = await Promise.all([treeResp.json(), agentesResp.json(), vendResp.json()])
    setProfiles((tree.profiles ?? []) as ProfileH[])
    setAvailableAgentes((ag.profiles ?? []) as ProfileH[])
    setAvailableVendedores((vd.profiles ?? []) as ProfileH[])
    setLoading(false)
  }, [ponto.id])

  useEffect(() => { void load() }, [load])

  async function vincularAgente() {
    if (!selectedAgente) return
    setAddingAgente(true)
    await fetch(getApiUrl('/hierarquia/agente/vincular'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: selectedAgente, pontoId: ponto.id }),
    })
    setAddingAgente(false)
    setShowAddAgente(false)
    setSelectedAgente('')
    void load()
  }

  const agentes = profiles.filter(p => p.perfil === 'agente_registro')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Network size={16} className="text-blue-500" />
            <div>
              <h3 className="font-semibold text-gray-800 dark:text-gray-200">{ponto.nome}</h3>
              <p className="text-xs text-gray-500">Hierarquia e comissões</p>
            </div>
          </div>
          <button type="button" title="Fechar" onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
          ) : agentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400">
              <Users size={32} className="mb-2 opacity-40" />
              <p className="text-sm font-medium">Nenhum agente vinculado</p>
              <p className="text-xs mt-1">Vincule um Agente de Registro para configurar a hierarquia.</p>
            </div>
          ) : (
            agentes.map(agente => (
              <ProfileNode key={agente.id} profile={agente} allProfiles={profiles} depth={0}
                pontoId={ponto.id} onRefresh={load} availableVendedores={availableVendedores} />
            ))
          )}

          {showAddAgente ? (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 flex gap-2 items-end flex-wrap">
              <div className="flex flex-col gap-1 flex-1 min-w-48">
                <span className="text-xs text-gray-500">Agente de Registro disponível</span>
                <select value={selectedAgente} onChange={e => setSelectedAgente(e.target.value)}
                  className="border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Selecione…</option>
                  {availableAgentes.map(a => (
                    <option key={a.id} value={a.id}>{a.nome} {a.email ? `(${a.email})` : ''}</option>
                  ))}
                </select>
              </div>
              <button type="button" onClick={() => void vincularAgente()} disabled={!selectedAgente || addingAgente}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {addingAgente ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Vincular
              </button>
              <button type="button" onClick={() => setShowAddAgente(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancelar</button>
            </div>
          ) : (
            <button type="button" onClick={() => setShowAddAgente(true)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-gray-500 hover:text-blue-600 border border-dashed border-gray-300 dark:border-gray-700 hover:border-blue-400 rounded-xl transition-colors">
              <Plus size={13} /> Vincular agente a este ponto
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const EMPTY_PONTO: NovoPontoAtendimento = {
  codigo: null, nome: '', endereco: null,
  cidade: null, uf: null, status: 'ativo', metadata: {},
}

function AbaPontos() {
  const { profile } = useAuth()
  const isAdmin = isAdminProfile(profile)
  const [pontos, setPontos]     = useState<PontoAtendimento[]>([])
  const [loading, setLoading]   = useState(true)
  const [erro, setErro]         = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm]         = useState<NovoPontoAtendimento>(EMPTY_PONTO)
  const [cepPa, setCepPa]       = useState('')
  const [numeroPa, setNumeroPa]         = useState('')
  const [complementoPa, setComplementoPa] = useState('')
  const [saving, setSaving]     = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [toastP, setToastP] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [hierarquiaPonto, setHierarquiaPonto] = useState<PontoAtendimento | null>(null)

  function showMsgP(msg: string, type: 'ok' | 'err' = 'err') {
    setToastP({ msg, type })
    setTimeout(() => setToastP(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const resp = await fetch(getApiUrl('/config/pontos'))
      const data = await resp.json()
      if (!resp.ok) throw new Error(data?.error ?? `Erro ${resp.status}`)
      setPontos((data.pontos ?? []) as PontoAtendimento[])
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar pontos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  function abrirNovo() {
    setEditingId(null)
    setForm({ ...EMPTY_PONTO })
    setCepPa(''); setNumeroPa(''); setComplementoPa('')
    setShowForm(true)
  }

  function abrirEditar(p: PontoAtendimento) {
    setEditingId(p.id)
    setForm({ codigo: p.codigo, nome: p.nome, endereco: p.endereco, cidade: p.cidade, uf: p.uf, status: p.status, metadata: p.metadata })
    setCepPa('')
    setNumeroPa(String(p.metadata?.numero ?? ''))
    setComplementoPa(String(p.metadata?.complemento ?? ''))
    setShowForm(true)
  }

  async function salvar() {
    if (!form.nome.trim()) return
    setSaving(true)
    const payload = {
      ...form,
      nome: form.nome.trim(),
      codigo: form.codigo?.trim() || null,
      endereco: form.endereco?.trim() || null,
      cidade: form.cidade?.trim() || null,
      uf: form.uf?.trim() || null,
      metadata: { ...form.metadata, numero: numeroPa.trim() || null, complemento: complementoPa.trim() || null },
    }
    const resp = await fetch(getApiUrl('/config/pontos'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingId ? { ...payload, id: editingId } : payload),
    })
    setSaving(false)
    if (!resp.ok) { const d = await resp.json().catch(() => null); showMsgP('Erro: ' + (d?.error ?? 'falha')); return }
    setShowForm(false)
    setEditingId(null)
    setForm({ ...EMPTY_PONTO })
    void load()
  }

  async function toggleStatus(p: PontoAtendimento) {
    setTogglingId(p.id)
    const novoStatus = p.status === 'ativo' ? 'inativo' : 'ativo'
    setPontos(prev => prev.map(x => x.id === p.id ? { ...x, status: novoStatus } : x))
    const resp = await fetch(getApiUrl(`/config/pontos/${p.id}/status`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novoStatus }),
    })
    setTogglingId(null)
    if (!resp.ok) {
      setPontos(prev => prev.map(x => x.id === p.id ? { ...x, status: p.status } : x))
      showMsgP('Erro ao atualizar status')
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>

  if (erro) return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg p-4 text-sm">
      Erro ao carregar pontos de atendimento: {erro}
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">Pontos de Atendimento</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Gerencie os pontos, agentes e hierarquia de vendedores com suas comissões.</p>
        </div>
        {isAdmin && (
          <button type="button" onClick={abrirNovo}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={13} /> Novo Ponto
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              {editingId ? 'Editar Ponto' : 'Novo Ponto de Atendimento'}
            </h3>
            <button type="button" title="Fechar" onClick={() => setShowForm(false)}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Código</span>
              <input type="text" value={form.codigo ?? ''} onChange={e => setForm(p => ({ ...p, codigo: e.target.value || null }))}
                placeholder="ex: PA-001"
                className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs text-gray-500">Nome *</span>
              <input type="text" value={form.nome} onChange={e => setForm(p => ({ ...p, nome: e.target.value }))}
                placeholder="ex: Balcão Principal"
                className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">CEP</span>
              <input type="text" placeholder="00000-000" value={cepPa} onChange={e => setCepPa(e.target.value)}
                onBlur={async () => {
                  const r = await buscarCep(cepPa)
                  if (!r) return
                  setForm(p => ({
                    ...p,
                    endereco: r.logradouro ? `${r.logradouro}, ${r.bairro}`.trim().replace(/, $/, '') : p.endereco,
                    cidade:   r.localidade || p.cidade,
                    uf:       r.uf         || p.uf,
                  }))
                }}
                className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs text-gray-500">Logradouro</span>
              <input type="text" title="Logradouro" placeholder="Rua / Avenida" value={form.endereco ?? ''} onChange={e => setForm(p => ({ ...p, endereco: e.target.value || null }))}
                className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Número</span>
              <input type="text" placeholder="ex: 123" value={numeroPa} onChange={e => setNumeroPa(e.target.value)}
                className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs text-gray-500">Complemento</span>
              <input type="text" placeholder="ex: Sala 5, 2º andar" value={complementoPa} onChange={e => setComplementoPa(e.target.value)}
                className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Cidade</span>
              <input type="text" title="Cidade" placeholder="ex: São Paulo" value={form.cidade ?? ''} onChange={e => setForm(p => ({ ...p, cidade: e.target.value || null }))}
                className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">UF</span>
              <input type="text" maxLength={2} value={form.uf ?? ''} onChange={e => setForm(p => ({ ...p, uf: e.target.value.toUpperCase() || null }))}
                placeholder="SP"
                className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Status</span>
              <select title="Status do ponto de atendimento" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as 'ativo' | 'inativo' }))}
                className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => void salvar()} disabled={saving || !form.nome.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">Cancelar</button>
          </div>
        </div>
      )}

      {pontos.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
          <MapPin size={32} className="mb-2 opacity-40" />
          <p className="font-medium text-sm">Nenhum ponto cadastrado</p>
          <p className="text-xs mt-1">Crie ao menos um para poder lançar vendas.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pontos.map(p => (
            <div key={p.id} className={cn('bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden', p.status === 'inativo' && 'opacity-60')}>
              <div className="flex items-center gap-3 px-4 py-3">
                <MapPin size={15} className="text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-800 dark:text-gray-200">{p.nome}</p>
                  <p className="text-xs text-gray-500">{[p.cidade, p.uf].filter(Boolean).join(' — ') || p.endereco || 'Sem endereço'}</p>
                </div>
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium shrink-0',
                  p.status === 'ativo'
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400')}>
                  {p.status === 'ativo' ? 'Ativo' : 'Inativo'}
                </span>
                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" title="Hierarquia e comissões" onClick={() => setHierarquiaPonto(p)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors">
                      <Network size={13} /> Hierarquia
                    </button>
                    <button type="button" title="Editar" onClick={() => abrirEditar(p)}
                      className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200 flex items-center justify-center transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button type="button" title={p.status === 'ativo' ? 'Desativar' : 'Ativar'} onClick={() => void toggleStatus(p)} disabled={togglingId === p.id}
                      className={cn('w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                        p.status === 'ativo' ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800')}>
                      {togglingId === p.id ? <Loader2 size={16} className="animate-spin" /> : p.status === 'ativo' ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {hierarquiaPonto && <PontoHierarquiaPanel ponto={hierarquiaPonto} onClose={() => setHierarquiaPonto(null)} />}

      {toastP && (
        <div className={cn(
          'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium',
          toastP.type === 'ok' ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
        )}>
          {toastP.msg}
          <button type="button" title="Fechar" onClick={() => setToastP(null)} className="ml-1 opacity-80 hover:opacity-100"><X size={14} /></button>
        </div>
      )}
    </div>
  )
}

type PaymentMethodId = 'safe2pay' | 'mercado_pago' | 'itau' | 'inter' | 'c6'
type PaymentMethodEnv = 'sandbox' | 'producao'
type PaymentSubTab = 'gateway' | 'meios'

type PaymentMethodConfig = {
  id: PaymentMethodId
  label: string
  categoria: 'gateway' | 'banco'
  enabled: boolean
  is_default: boolean
  ambiente: PaymentMethodEnv
  client_id: string
  secret_key: string
  webhook_url: string
  webhook_secret: string
  observacoes: string
}

type PaymentRuntimeConfig = {
  modo_teste_geral: boolean
  bloquear_integracoes_reais: boolean
  aviso_checkout: string
}

const DEFAULT_PAYMENT_RUNTIME: PaymentRuntimeConfig = {
  modo_teste_geral: true,
  bloquear_integracoes_reais: true,
  aviso_checkout: 'Ambiente de testes ativo. Use apenas clientes, pagamentos e emissoes de homologacao.',
}

const PAYMENT_METHOD_PRESETS: PaymentMethodConfig[] = [
  { id: 'safe2pay',      label: 'Safe2Pay',      categoria: 'gateway', enabled: false, is_default: false, ambiente: 'sandbox', client_id: '', secret_key: '', webhook_url: '', webhook_secret: '', observacoes: '' },
  { id: 'mercado_pago', label: 'Mercado Pago', categoria: 'gateway', enabled: false, is_default: false, ambiente: 'sandbox', client_id: '', secret_key: '', webhook_url: '', webhook_secret: '', observacoes: '' },
  { id: 'itau',         label: 'Itaú',         categoria: 'banco',   enabled: false, is_default: false, ambiente: 'sandbox', client_id: '', secret_key: '', webhook_url: '', webhook_secret: '', observacoes: '' },
  { id: 'inter',        label: 'Inter',        categoria: 'banco',   enabled: false, is_default: false, ambiente: 'sandbox', client_id: '', secret_key: '', webhook_url: '', webhook_secret: '', observacoes: '' },
  { id: 'c6',           label: 'C6 Bank',      categoria: 'banco',   enabled: false, is_default: false, ambiente: 'sandbox', client_id: '', secret_key: '', webhook_url: '', webhook_secret: '', observacoes: '' },
]

// ── Aba Pagamentos ─────────────────────────────────────────────
function AbaPagamentos() {
  const { profile } = useAuth()
  const isAdmin = isAdminProfile(profile)
  const [subtab, setSubtab] = useState<PaymentSubTab>('gateway')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [integration, setIntegration] = useState<any>(null)
  const [prodKey, setProdKey] = useState('')
  const [prodSecret, setProdSecret] = useState('')
  const [sandboxKey, setSandboxKey] = useState('')
  const [sandboxSecret, setSandboxSecret] = useState('')
  const [isSandbox, setIsSandbox] = useState(false)
  const [webhookUrl, setWebhookUrl] = useState('')

  const [editingProd, setEditingProd] = useState(false)
  const [editingProdSecret, setEditingProdSecret] = useState(false)
  const [editingSandbox, setEditingSandbox] = useState(false)
  const [editingSandboxSecret, setEditingSandboxSecret] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>(PAYMENT_METHOD_PRESETS)
  const [selectedMethodId, setSelectedMethodId] = useState<PaymentMethodId>('mercado_pago')
  const [paymentRuntime, setPaymentRuntime] = useState<PaymentRuntimeConfig>(DEFAULT_PAYMENT_RUNTIME)

  const load = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const [integrationRes, methodsRes, runtimeRes] = await Promise.all([
      supabase.from('external_integrations').select('*').eq('provider', 'safe2pay').maybeSingle(),
      fetch(getApiUrl('/app-settings?keys=payment_methods')).then(response => response.json()),
      fetch(getApiUrl('/app-settings?keys=payment_runtime')).then(response => response.json()),
    ])

    if (integrationRes.error || !methodsRes.ok || !runtimeRes.ok) {
      setErro(integrationRes.error?.message ?? methodsRes.error ?? runtimeRes.error ?? 'Erro ao carregar gateways.')
      setLoading(false)
      return
    }

    const data = integrationRes.data
    const metadata = ((data?.metadata ?? {}) as Record<string, unknown>)
    if (data) {
      setIntegration(data)
      setWebhookUrl(data.webhook_url || '')
      setIsSandbox(data.metadata?.is_sandbox === true)
      
      if (data.api_token) {
        setProdKey(`••••••••••••••••${data.api_token.slice(-4)}`)
        setEditingProd(false)
      } else {
        setProdKey('')
        setEditingProd(true)
      }
      if (metadata.secret_key_producao) {
        const secret = String(metadata.secret_key_producao)
        setProdSecret(`••••••••••••••••${secret.slice(-4)}`)
        setEditingProdSecret(false)
      } else {
        setProdSecret('')
        setEditingProdSecret(true)
      }

      if (metadata.api_key_sandbox) {
        const sandboxToken = String(metadata.api_key_sandbox)
        setSandboxKey(`••••••••••••••••${sandboxToken.slice(-4)}`)
        setEditingSandbox(false)
      } else {
        setSandboxKey('')
        setEditingSandbox(true)
      }
      if (metadata.secret_key_sandbox) {
        const sandboxSecretValue = String(metadata.secret_key_sandbox)
        setSandboxSecret(`••••••••••••••••${sandboxSecretValue.slice(-4)}`)
        setEditingSandboxSecret(false)
      } else {
        setSandboxSecret('')
        setEditingSandboxSecret(true)
      }
    } else {
      setIntegration(null)
      setWebhookUrl('')
      setIsSandbox(false)
      setProdKey('')
      setProdSecret('')
      setSandboxKey('')
      setSandboxSecret('')
      setEditingProd(true)
      setEditingProdSecret(true)
      setEditingSandbox(true)
      setEditingSandboxSecret(true)
    }

    const savedPaymentMethods = methodsRes.settings?.payment_methods?.methods
    if (Array.isArray(savedPaymentMethods)) {
      const merged = PAYMENT_METHOD_PRESETS.map(preset => {
        const saved = savedPaymentMethods.find((item: PaymentMethodConfig) => item.id === preset.id)
        return saved ? { ...preset, ...saved } : preset
      })
      const safe2payGateway = merged.find(item => item.id === 'safe2pay')
      if (safe2payGateway) {
        safe2payGateway.enabled = !!data
        safe2payGateway.ambiente = (data?.metadata?.is_sandbox === true ? 'sandbox' : 'producao') as PaymentMethodEnv
        safe2payGateway.client_id = data?.metadata?.is_sandbox === true
          ? String(metadata.api_key_sandbox ?? safe2payGateway.client_id ?? '')
          : String(data?.api_token ?? safe2payGateway.client_id ?? '')
        safe2payGateway.secret_key = data?.metadata?.is_sandbox === true
          ? String(metadata.secret_key_sandbox ?? safe2payGateway.secret_key ?? '')
          : String(metadata.secret_key_producao ?? safe2payGateway.secret_key ?? '')
        safe2payGateway.webhook_url = data?.webhook_url ?? safe2payGateway.webhook_url ?? ''
      }
      setPaymentMethods(merged)
      const active = merged.find(item => item.is_default) ?? merged[0]
      setSelectedMethodId(active.id)
    } else {
      const defaults = PAYMENT_METHOD_PRESETS.map(item => {
        if (item.id !== 'safe2pay') return item
        return {
          ...item,
          enabled: !!data,
          is_default: item.is_default,
          ambiente: (data?.metadata?.is_sandbox === true ? 'sandbox' : 'producao') as PaymentMethodEnv,
        }
      })
      setPaymentMethods(defaults)
      setSelectedMethodId(PAYMENT_METHOD_PRESETS[0].id)
    }

    const runtimeValue = runtimeRes.settings?.payment_runtime
    setPaymentRuntime({
      modo_teste_geral: runtimeValue?.modo_teste_geral ?? DEFAULT_PAYMENT_RUNTIME.modo_teste_geral,
      bloquear_integracoes_reais: runtimeValue?.bloquear_integracoes_reais ?? DEFAULT_PAYMENT_RUNTIME.bloquear_integracoes_reais,
      aviso_checkout: runtimeValue?.aviso_checkout ?? DEFAULT_PAYMENT_RUNTIME.aviso_checkout,
    })

    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function salvar() {
    if (!isAdmin) return
    setSaving(true)
    setErro(null)
    setSuccessMessage(null)

    const methodBeingSaved = paymentMethods.find(item => item.id === selectedMethodId) ?? paymentMethods[0]

    const meta = {
      ...(integration?.metadata || {}),
      is_sandbox: isSandbox,
    }

    const payload: any = {
      webhook_url: webhookUrl || null,
      status: (prodKey || sandboxKey || prodSecret || sandboxSecret) ? 'ativo' : 'pendente',
    }

    if (editingProd) {
      payload.api_token = prodKey.trim() || null
    }
    if (editingProdSecret) {
      meta.secret_key_producao = prodSecret.trim() || null
    }
    if (editingSandbox) {
      meta.api_key_sandbox = sandboxKey.trim() || null
    }
    if (editingSandboxSecret) {
      meta.secret_key_sandbox = sandboxSecret.trim() || null
    }

    payload.metadata = meta

    const paymentMethodsToSave = paymentMethods.map(method => {
      if (method.id !== 'safe2pay') return method
      return {
        ...method,
        enabled: method.enabled || !!(prodKey || sandboxKey || integration),
        is_default: method.is_default,
        ambiente: (isSandbox ? 'sandbox' : 'producao') as PaymentMethodEnv,
        client_id: isSandbox
          ? (editingSandbox ? sandboxKey.trim() : String(meta.api_key_sandbox ?? method.client_id ?? ''))
          : (editingProd ? prodKey.trim() : String(payload.api_token ?? method.client_id ?? '')),
        secret_key: isSandbox
          ? (editingSandboxSecret ? sandboxSecret.trim() : String(meta.secret_key_sandbox ?? method.secret_key ?? ''))
          : (editingProdSecret ? prodSecret.trim() : String(meta.secret_key_producao ?? method.secret_key ?? '')),
        webhook_url: webhookUrl.trim(),
      }
    })

    const shouldSaveSafe2PayIntegration = selectedMethodId === 'safe2pay'

    const [safe2payRes, methodsSaveRes, runtimeSaveRes] = await Promise.all([
      shouldSaveSafe2PayIntegration
        ? supabase
            .from('external_integrations')
            .update(payload)
            .eq('provider', 'safe2pay')
        : Promise.resolve({ error: null }),
      fetch(getApiUrl('/app-settings'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          key: 'payment_methods',
          value: {
            methods: paymentMethodsToSave,
            default_method_id: paymentMethodsToSave.find(item => item.is_default)?.id ?? null,
          },
        }),
      }).then(async response => ({ error: response.ok ? null : new Error((await response.json()).error ?? 'Erro ao salvar meios de pagamento') })),
      fetch(getApiUrl('/app-settings'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          key: 'payment_runtime',
          value: paymentRuntime,
        }),
      }).then(async response => ({ error: response.ok ? null : new Error((await response.json()).error ?? 'Erro ao salvar ambiente de pagamento') })),
    ])

    setSaving(false)
    if (safe2payRes.error || methodsSaveRes.error || runtimeSaveRes.error) {
      const detail = safe2payRes.error?.message ?? methodsSaveRes.error?.message ?? runtimeSaveRes.error?.message ?? 'Erro desconhecido.'
      setErro(`Não foi possível salvar ${methodBeingSaved.label}: ${detail}`)
      return
    }

    const environmentLabel = methodBeingSaved.ambiente === 'producao' ? 'Produção' : 'Sandbox / Testes'
    const statusDetail = !methodBeingSaved.enabled
      ? 'As credenciais foram salvas, mas a integração permanece desativada.'
      : methodBeingSaved.is_default
        ? `A integração está ativa em ${environmentLabel} e definida como principal.`
        : `A integração está ativa em ${environmentLabel}, mas ainda não é a principal.`
    setSuccessMessage(`${methodBeingSaved.label} salvo com sucesso. ${statusDetail}`)
    setPaymentMethods(paymentMethodsToSave)
    void load()
  }

  function updateMethod(methodId: PaymentMethodId, patch: Partial<PaymentMethodConfig>) {
    setSuccessMessage(null)
    setPaymentMethods(prev => prev.map(item => {
      if (item.id !== methodId) return item
      return { ...item, ...patch }
    }))
  }

  function setMethodAsDefault(methodId: PaymentMethodId) {
    setSuccessMessage(null)
    setPaymentMethods(prev => prev.map(item => ({
      ...item,
      enabled: item.id === methodId ? true : item.enabled,
      is_default: item.id === methodId,
    })))
  }

  const selectedMethod = paymentMethods.find(item => item.id === selectedMethodId) ?? paymentMethods[0]
  const currentGateway = paymentMethods.find(item => item.is_default) ?? null

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>

  return (
    <div className="max-w-5xl space-y-5">
      <div>
        <h2 className="font-semibold text-gray-800 dark:text-gray-200">Pagamentos e meios habilitados</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Você pode chavear o meio principal de recebimento quando quiser e manter os outros prontos para ativação.
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-2">
        {[
          { id: 'gateway', label: 'Gateway atual' },
          { id: 'meios', label: 'Meios de pagamento' },
        ].map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSubtab(item.id as PaymentSubTab)}
            className={cn(
              'px-3 py-2 text-xs font-medium rounded-md transition-colors',
              subtab === item.id
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {subtab === 'gateway' && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <div className={cn(
            'rounded-xl border p-4',
            currentGateway?.enabled
              ? 'border-green-200 bg-green-50/70 dark:border-green-900/40 dark:bg-green-950/20'
              : 'border-amber-200 bg-amber-50/70 dark:border-amber-900/40 dark:bg-amber-950/20'
          )}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Gateway selecionado para as vendas</p>
                <h3 className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {currentGateway?.label ?? 'Nenhum gateway selecionado'}
                </h3>
                <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                  {currentGateway?.enabled
                    ? `${currentGateway.ambiente === 'producao' ? 'Produção' : 'Sandbox / Testes'} · ativo e visível no checkout.`
                    : currentGateway
                      ? 'Selecionado como principal, porém está desativado e não aparecerá no checkout.'
                      : 'Escolha e ative um gateway em Meios de pagamento.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (currentGateway) setSelectedMethodId(currentGateway.id)
                  setSubtab('meios')
                }}
                className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700"
              >
                {currentGateway ? `Configurar ${currentGateway.label}` : 'Escolher gateway'}
              </button>
            </div>
          </div>

          {currentGateway?.enabled && paymentRuntime.bloquear_integracoes_reais && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-300">
              O gateway está configurado, mas as chamadas externas estão bloqueadas. Para testar o Sandbox do {currentGateway.label}, desligue “Bloquear integrações reais” e salve.
            </div>
          )}

          <div className="rounded-xl border border-amber-200 dark:border-amber-900/30 bg-amber-50/70 dark:bg-amber-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Ambiente global de testes</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400">Liga a operacao de homologacao para o time testar sem confundir com producao.</p>
              </div>
              <button
                type="button"
                disabled={!isAdmin}
                onClick={() => setPaymentRuntime(prev => ({ ...prev, modo_teste_geral: !prev.modo_teste_geral }))}
                className={cn('relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50',
                  paymentRuntime.modo_teste_geral ? 'bg-amber-500' : 'bg-gray-200 dark:bg-gray-700')}
              >
                <span className={cn('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
                  paymentRuntime.modo_teste_geral ? 'translate-x-5' : 'translate-x-0')} />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Bloquear integracoes reais</p>
                <p className="text-[10px] text-gray-400">Marca checkout e vendas como teste para evitar uso acidental em producao.</p>
              </div>
              <button
                type="button"
                disabled={!isAdmin}
                onClick={() => setPaymentRuntime(prev => ({ ...prev, bloquear_integracoes_reais: !prev.bloquear_integracoes_reais }))}
                className={cn('relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50',
                  paymentRuntime.bloquear_integracoes_reais ? 'bg-amber-500' : 'bg-gray-200 dark:bg-gray-700')}
              >
                <span className={cn('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
                  paymentRuntime.bloquear_integracoes_reais ? 'translate-x-5' : 'translate-x-0')} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Aviso para checkout e operacao</label>
              <textarea
                value={paymentRuntime.aviso_checkout}
                onChange={e => setPaymentRuntime(prev => ({ ...prev, aviso_checkout: e.target.value }))}
                rows={2}
                className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Mensagem mostrada quando o ambiente de testes estiver ativo."
              />
            </div>
          </div>
        </div>
      )}

      {subtab === 'meios' && (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Meios cadastrados</p>
            {paymentMethods.map(method => (
              <button
                key={method.id}
                type="button"
                onClick={() => setSelectedMethodId(method.id)}
                className={cn(
                  'w-full text-left rounded-xl border p-3 transition-colors',
                  selectedMethodId === method.id
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{method.label}</span>
                  {method.is_default && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Principal</span>}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {method.enabled ? 'Ativo para uso' : 'Desligado'} • {method.ambiente === 'producao' ? 'Produção' : 'Sandbox'}
                </p>
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{selectedMethod.label}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Cadastre as credenciais e chaveie esse meio quando quiser usar no operacional.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ConfigInput label={selectedMethod.id === 'mercado_pago' ? 'Public Key / Chave pública' : 'Client ID / Chave pública'} value={selectedMethod.client_id} onChange={v => updateMethod(selectedMethod.id, { client_id: v })} placeholder="Ex: APP_USR..." />
              <ConfigInput type="password" label={selectedMethod.id === 'mercado_pago' ? 'Access Token' : 'Token secreto'} value={selectedMethod.secret_key} onChange={v => updateMethod(selectedMethod.id, { secret_key: v })} placeholder="Ex: APP_USR..." />
              <ConfigInput label="Webhook / retorno" value={selectedMethod.webhook_url} onChange={v => updateMethod(selectedMethod.id, { webhook_url: v })} placeholder="https://..." />
              <ConfigInput type="password" label="Chave secreta do webhook" value={selectedMethod.webhook_secret} onChange={v => updateMethod(selectedMethod.id, { webhook_secret: v })} placeholder="Gerada no painel do Mercado Pago" />
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">Ambiente</span>
                <select
                  value={selectedMethod.ambiente}
                  onChange={e => updateMethod(selectedMethod.id, { ambiente: e.target.value as PaymentMethodEnv })}
                  className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="sandbox">Sandbox / Testes</option>
                  <option value="producao">Produção</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-100 dark:border-gray-800">
                <div>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Habilitar este meio agora</p>
                  <p className="text-[10px] text-gray-400">Liga ou desliga sem perder o cadastro.</p>
                </div>
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => updateMethod(selectedMethod.id, { enabled: !selectedMethod.enabled })}
                  className={cn('relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50',
                    selectedMethod.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700')}
                >
                  <span className={cn('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
                    selectedMethod.enabled ? 'translate-x-5' : 'translate-x-0')} />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-100 dark:border-gray-800">
                <div>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Definir como principal</p>
                  <p className="text-[10px] text-gray-400">Esse será o meio preferencial do momento.</p>
                </div>
                <button
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => setMethodAsDefault(selectedMethod.id)}
                  className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  Tornar principal
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Observações</label>
              <textarea
                value={selectedMethod.observacoes}
                onChange={e => updateMethod(selectedMethod.id, { observacoes: e.target.value })}
                rows={3}
                placeholder="Ex: usar para PIX no horário comercial, homologação aprovada, conta matriz..."
                className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {erro && (
        <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
          {erro}
        </p>
      )}
      {successMessage && (
        <p className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
          {successMessage}
        </p>
      )}

      <button type="button" onClick={salvar} disabled={!isAdmin || saving}
        className="mt-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors inline-flex items-center gap-2">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        {saving ? 'Salvando...' : 'Salvar Alterações'}
      </button>
    </div>
  )
}

// ── Aba Fiscal / NFS-e ───────────────────────────────────────
type FiscalSubTab = 'configuracoes' | 'modelo'

type FiscalProviderTestResult = {
  ok: boolean
  message?: string
  error?: string
  next_step?: string
  tls_warning?: string | null
  checks?: Record<string, boolean>
  certificado?: {
    commonName?: string
    organization?: string
    serialNumber?: string
    validFrom?: string
    validTo?: string
  }
}

const NFSE_GATILHO_LABELS: Record<NfseEmissionTrigger, string> = {
  manual: 'Somente manual',
  antes_pagamento: 'Antes do pagamento',
  apos_pagamento: 'Após pagamento compensado',
  apos_agendamento: 'Após agendamento confirmado',
  apos_validacao: 'Após validação realizada',
  apos_protocolo: 'Após protocolo gerado',
  apos_emissao_certificado: 'Após emissão do certificado',
}

const NFSE_PROVIDER_LABELS: Record<ProvedorNfse, string> = {
  nacional: 'Emissor Nacional',
  gissonline: 'GISSONLINE',
  municipal: 'Portal Municipal',
}

const NFSE_AMBIENTE_LABELS: Record<AmbienteNfse, string> = {
  homologacao: 'Homologação',
  producao_restrita: 'Produção restrita',
  producao: 'Produção real',
}

type NfsePreset = {
  id: string
  label: string
  municipio_nome: string
  municipio_codigo_ibge: string
  provedor: ProvedorNfse
  observacoes: string
  payload_reforma_tributaria?: Record<string, unknown>
}

const NFSE_PRESETS: NfsePreset[] = [
  {
    id: 'sjc-atual',
    label: 'São José dos Campos - modelo atual',
    municipio_nome: 'São José dos Campos',
    municipio_codigo_ibge: '3549904',
    provedor: 'municipal',
    observacoes: 'Perfil para a Nota Joseense, que continua valendo até 31 de agosto de 2026.',
    payload_reforma_tributaria: {
      municipal_adapter: 'nota_joseense',
      municipal_portal_url: 'https://notajoseense.sjc.sp.gov.br/notafiscal/paginas/portal/#/login',
      planned_migration_provider: 'nacional',
      planned_migration_date: '2026-09-01',
      national_portal_url: 'https://www.nfse.gov.br/EmissorNacional/Login',
    },
  },
  {
    id: 'sjc-nacional',
    label: 'São José dos Campos - Emissor Nacional',
    municipio_nome: 'São José dos Campos',
    municipio_codigo_ibge: '3549904',
    provedor: 'nacional',
    observacoes: 'Deixe este perfil pronto agora e ative somente em 1º de setembro de 2026.',
    payload_reforma_tributaria: {
      source_transition: 'nota_joseense',
      planned_activation_date: '2026-09-01',
      national_portal_url: 'https://www.nfse.gov.br/EmissorNacional/Login',
      municipal_portal_url: 'https://notajoseense.sjc.sp.gov.br/notafiscal/paginas/portal/#/login',
      suggested_environment: 'producao_restrita',
    },
  },
  {
    id: 'sbc',
    label: 'São Bernardo do Campo',
    municipio_nome: 'São Bernardo do Campo',
    municipio_codigo_ibge: '3548708',
    provedor: 'gissonline',
    observacoes: 'Município opera com fluxo orientado por GISSONLINE e portal NFS-e local.',
  },
]

function createEmptyFiscalForm(preset?: typeof NFSE_PRESETS[number]): Partial<NfseConfiguracao> {
  const suggestedEnvironment = String(preset?.payload_reforma_tributaria?.suggested_environment ?? '').trim() as AmbienteNfse
  return {
    identificador: preset ? `Perfil ${preset.label}` : '',
    municipio_nome: preset?.municipio_nome ?? '',
    municipio_codigo_ibge: preset?.municipio_codigo_ibge ?? '',
    provedor: preset?.provedor ?? 'municipal',
    ativo: true,
    cadastro_base_emitente_id: null,
    cnpj_emitente: '',
    inscricao_municipal: '',
    inscricao_estadual: '',
    cnae: '',
    ambiente: suggestedEnvironment || 'homologacao',
    natureza_operacao: '',
    simples_nacional: false,
    regime_especial: '',
    exigibilidade_iss: '',
    incentivo_fiscal: false,
    tipo_rps: '',
    serie_rps: '',
    numero_rps_atual: 1,
    codigo_servico_municipio: '',
    codigo_tributacao_municipio: '',
    codigo_cfps: '',
    codigo_cst: '',
    aliquota_iss: 0,
    aliquota_pis: 0,
    aliquota_cofins: 0,
    aliquota_inss: 0,
    aliquota_ir: 0,
    aliquota_csll: 0,
    usuario_prefeitura: '',
    senha_prefeitura: '',
    chave_autenticacao: '',
    usa_certificado_digital: false,
    certificado_pfx_path: null,
    certificado_senha: null,
    observacoes: preset?.observacoes ?? '',
    robo_ligado: false,
    payload_reforma_tributaria: preset?.payload_reforma_tributaria ?? {},
  }
}

function AbaFiscal() {
  const { profile } = useAuth()
  const isAdmin = isAdminProfile(profile)
  const [subtab, setSubtab] = useState<FiscalSubTab>('configuracoes')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingModelo, setSavingModelo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [okModelo, setOkModelo] = useState(false)
  const [showPreviewNotaTelaCheia, setShowPreviewNotaTelaCheia] = useState(false)
  const [testandoGissOnline, setTestandoGissOnline] = useState(false)
  const [resultadoTesteGissOnline, setResultadoTesteGissOnline] = useState<FiscalProviderTestResult | null>(null)
  const [testandoNotaJoseense, setTestandoNotaJoseense] = useState(false)
  const [resultadoTesteNotaJoseense, setResultadoTesteNotaJoseense] = useState<FiscalProviderTestResult | null>(null)
  const [showSenhaPrefeitura, setShowSenhaPrefeitura] = useState(false)
  const [showCertSenha, setShowCertSenha] = useState(false)
  const [certFile, setCertFile] = useState<File | null>(null)
  const [uploadingCert, setUploadingCert] = useState(false)
  const [configuracoes, setConfiguracoes] = useState<NfseConfiguracao[]>([])
  const [form, setForm] = useState<Partial<NfseConfiguracao>>(createEmptyFiscalForm())
  const [modeloNota, setModeloNota] = useState<NfseModeloLayout>(DEFAULT_NFSE_MODELO)
  const [automacaoNfse, setAutomacaoNfse] = useState<NfseAutomationSettings>(DEFAULT_NFSE_AUTOMATION_SETTINGS)
  const [salvandoAutomacaoNfse, setSalvandoAutomacaoNfse] = useState(false)
  const [okAutomacaoNfse, setOkAutomacaoNfse] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const [configsRes, modeloRes, automacaoRes] = await Promise.all([
      supabase
        .from('nfse_configuracoes')
        .select('*')
        .order('municipio_nome', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'nfse_modelo_layout')
        .maybeSingle(),
      supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'nfse_automation_settings')
        .maybeSingle(),
    ])

    if (configsRes.error) {
      setErro(configsRes.error.message)
      setLoading(false)
      return
    }

    const lista = (configsRes.data ?? []) as NfseConfiguracao[]
    setConfiguracoes(lista)
    setForm(prev => {
      if (prev.id) {
        const atualizada = lista.find(item => item.id === prev.id)
        if (atualizada) return atualizada
      }
      return lista[0] ?? createEmptyFiscalForm()
    })
    if (modeloRes.data?.value) {
      setModeloNota({ ...DEFAULT_NFSE_MODELO, ...modeloRes.data.value })
    }
    if (automacaoRes.data?.value) {
      setAutomacaoNfse(normalizeNfseAutomationSettings(automacaoRes.data.value as Partial<NfseAutomationSettings>))
    } else {
      setAutomacaoNfse(DEFAULT_NFSE_AUTOMATION_SETTINGS)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const payloadFiscal = (form.payload_reforma_tributaria ?? {}) as Record<string, unknown>
  const municipalAdapter = String(payloadFiscal.municipal_adapter ?? 'generico')
  const portalMunicipalUrl = String(payloadFiscal.municipal_portal_url ?? '')
  const portalNacionalUrl = String(payloadFiscal.national_portal_url ?? '')

  function selecionarConfiguracao(config: NfseConfiguracao) {
    setOk(false)
    setErro(null)
    setShowSenhaPrefeitura(false)
    setForm(config)
  }

  function novaConfiguracao(preset?: typeof NFSE_PRESETS[number]) {
    setOk(false)
    setErro(null)
    setShowSenhaPrefeitura(false)
    setForm(createEmptyFiscalForm(preset))
  }

  function updateField<K extends keyof NfseConfiguracao>(key: K, value: NfseConfiguracao[K]) {
    setOk(false)
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function uploadCertificado() {
    if (!certFile || !form.cnpj_emitente?.trim()) {
      setErro('Selecione um arquivo e certifique-se de que o CNPJ do emitente está preenchido.')
      return
    }
    setUploadingCert(true)
    setErro(null)
    const cnpjClean = form.cnpj_emitente.replace(/\D/g, '')
    const ext = certFile.name.split('.').pop()?.toLowerCase() ?? 'pfx'
    const path = `${cnpjClean}/certificado.${ext}`
    const { error: upErr } = await supabase.storage
      .from('certificados-digitais')
      .upload(path, certFile, { upsert: true, contentType: 'application/x-pkcs12' })
    setUploadingCert(false)
    if (upErr) { setErro('Erro ao enviar certificado: ' + upErr.message); return }
    updateField('certificado_pfx_path', path)
    setCertFile(null)
  }

  async function removerCertificado() {
    if (!form.certificado_pfx_path) return
    if (!confirm('Remover o certificado digital vinculado?')) return
    await supabase.storage.from('certificados-digitais').remove([form.certificado_pfx_path])
    updateField('certificado_pfx_path', null)
    updateField('certificado_senha', null)
  }

  async function salvar() {
    if (!isAdmin) return
    setSaving(true)
    setErro(null)
    setOk(false)

    if (!form.municipio_nome?.trim()) {
      setErro('Informe o município da configuração fiscal.')
      setSaving(false)
      return
    }

    if (!form.cnpj_emitente?.trim()) {
      setErro('CNPJ do emitente é obrigatório.')
      setSaving(false)
      return
    }

    const payload = {
      ...createEmptyFiscalForm(),
      ...form,
      identificador: form.identificador?.trim() || null,
      municipio_nome: form.municipio_nome?.trim() || '',
      municipio_codigo_ibge: form.municipio_codigo_ibge?.trim() || null,
      cnpj_emitente: form.cnpj_emitente?.trim() || '',
      inscricao_municipal: form.inscricao_municipal?.trim() || null,
      inscricao_estadual: form.inscricao_estadual?.trim() || null,
      cnae: form.cnae?.trim() || null,
      natureza_operacao: form.natureza_operacao?.trim() || null,
      regime_especial: form.regime_especial?.trim() || null,
      exigibilidade_iss: form.exigibilidade_iss?.trim() || null,
      tipo_rps: form.tipo_rps?.trim() || null,
      serie_rps: form.serie_rps?.trim() || null,
      codigo_servico_municipio: form.codigo_servico_municipio?.trim() || null,
      codigo_tributacao_municipio: form.codigo_tributacao_municipio?.trim() || null,
      codigo_cfps: form.codigo_cfps?.trim() || null,
      codigo_cst: form.codigo_cst?.trim() || null,
      usuario_prefeitura: form.usuario_prefeitura?.trim() || null,
      senha_prefeitura: form.senha_prefeitura?.trim() || null,
      chave_autenticacao: form.chave_autenticacao?.trim() || null,
      observacoes: form.observacoes?.trim() || null,
      updated_by: profile?.id ?? null,
      updated_at: new Date().toISOString(),
    }

    const query = form.id
      ? supabase.from('nfse_configuracoes').update(payload).eq('id', form.id)
      : supabase.from('nfse_configuracoes').insert([payload])

    const { error } = await query
    setSaving(false)
    if (error) {
      setErro(error.message)
      return
    }

    setOk(true)
    void load()
  }

  async function salvarModeloNota() {
    if (!isAdmin) return
    setSavingModelo(true)
    setErro(null)
    setOkModelo(false)
    const { error } = await supabase
      .from('app_settings')
      .upsert({
        key: 'nfse_modelo_layout',
        value: modeloNota,
        updated_by: profile?.id ?? null,
      }, { onConflict: 'key' })
    setSavingModelo(false)
    if (error) {
      setErro(error.message)
      return
    }
    setOkModelo(true)
  }

  async function salvarAutomacaoNfse() {
    if (!isAdmin) return
    setSalvandoAutomacaoNfse(true)
    setErro(null)
    setOkAutomacaoNfse(false)
    const { error } = await supabase
      .from('app_settings')
      .upsert({
        key: 'nfse_automation_settings',
        value: automacaoNfse,
        updated_by: profile?.id ?? null,
      }, { onConflict: 'key' })
    setSalvandoAutomacaoNfse(false)
    if (error) {
      setErro(error.message)
      return
    }
    setOkAutomacaoNfse(true)
  }

  async function testarConexaoGissOnline() {
    if (!form.id) {
      setErro('Salve a configuração fiscal antes de testar o GISSONLINE.')
      return
    }

    setTestandoGissOnline(true)
    setResultadoTesteGissOnline(null)
    setErro(null)

    try {
      const accessToken = await getSupabaseAccessToken()
      const response = await fetch(getEdgeFunctionUrl('nfse-gissonline-test'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ configuracao_id: form.id }),
        signal: AbortSignal.timeout(20000),
      })

      const data = await response.json() as FiscalProviderTestResult
      setResultadoTesteGissOnline(data)
      if (!response.ok || !data.ok) {
        setErro(data.error ?? 'Seu teste com o GISSONLINE não foi concluído.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha de comunicação.'
      setErro(`Não foi possível executar o teste com o GISSONLINE: ${message}`)
    } finally {
      setTestandoGissOnline(false)
    }
  }

  async function testarConexaoNotaJoseense() {
    if (!form.id) {
      setErro('Salve a configuração fiscal antes de testar a Nota Joseense.')
      return
    }

    setTestandoNotaJoseense(true)
    setResultadoTesteNotaJoseense(null)
    setErro(null)

    try {
      const accessToken = await getSupabaseAccessToken()
      const response = await fetch(getEdgeFunctionUrl('nfse-nota-joseense-test'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ configuracao_id: form.id }),
        signal: AbortSignal.timeout(20000),
      })

      const data = await response.json() as FiscalProviderTestResult
      setResultadoTesteNotaJoseense(data)
      if (!response.ok || !data.ok) {
        setErro(data.error ?? 'Seu teste com a Nota Joseense não foi concluído.')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha de comunicação.'
      setErro(`Não foi possível executar o teste com a Nota Joseense: ${message}`)
    } finally {
      setTestandoNotaJoseense(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-400" /></div>

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h2 className="font-semibold text-gray-800 dark:text-gray-200">Configurações Fiscais por Prefeitura</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          O sistema agora aceita múltiplos perfis fiscais por município. Isso é obrigatório para ligar São José dos Campos e São Bernardo do Campo separadamente.
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-800 pb-2">
        {[
          { id: 'configuracoes', label: 'Perfis por prefeitura' },
          { id: 'modelo', label: 'Modelo da nota' },
        ].map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setSubtab(item.id as FiscalSubTab)}
            className={cn(
              'px-3 py-2 text-xs font-medium rounded-md transition-colors',
              subtab === item.id
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {subtab === 'configuracoes' && (
      <>
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {NFSE_PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              onClick={() => novaConfiguracao(preset)}
              className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Novo perfil {preset.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => novaConfiguracao()}
            className="px-3 py-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Nova configuração manual
          </button>
        </div>

        {configuracoes.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {configuracoes.map(config => {
              const ativo = form.id === config.id
              return (
                <button
                  key={config.id}
                  type="button"
                  onClick={() => selecionarConfiguracao(config)}
                  className={cn(
                    'text-left rounded-xl border p-4 transition-colors',
                    ativo
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 hover:bg-gray-100 dark:hover:bg-gray-900'
                  )}
                >
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{config.identificador || config.municipio_nome}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {config.municipio_nome} • {NFSE_PROVIDER_LABELS[config.provedor]}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    CNPJ {config.cnpj_emitente} • {NFSE_AMBIENTE_LABELS[config.ambiente] ?? 'Homologação'}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center gap-2">
            <MapPin size={16} className="text-blue-500" /> Perfil da Prefeitura
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ConfigInput label="Identificador interno" value={form.identificador || ''} onChange={v => updateField('identificador', v)} placeholder="Ex: Matriz SJC" />
            <ConfigInput label="Município *" value={form.municipio_nome || ''} onChange={v => updateField('municipio_nome', v)} placeholder="Ex: São José dos Campos" />
            <ConfigInput label="Código IBGE" value={form.municipio_codigo_ibge || ''} onChange={v => updateField('municipio_codigo_ibge', v)} placeholder="Ex: 3549904" />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Provedor</span>
              <select
                value={form.provedor || 'municipal'}
                onChange={e => updateField('provedor', e.target.value as ProvedorNfse)}
                className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="nacional">Emissor Nacional</option>
                <option value="gissonline">GISSONLINE</option>
                <option value="municipal">Portal Municipal</option>
              </select>
            </label>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center gap-2">
            <FileText size={16} className="text-blue-500" /> Dados do Emitente
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ConfigInput label="CNPJ Emitente *" value={form.cnpj_emitente || ''} onChange={v => updateField('cnpj_emitente', v)} placeholder="00.000.000/0000-00" />
            <ConfigInput label="Inscrição Municipal" value={form.inscricao_municipal || ''} onChange={v => updateField('inscricao_municipal', v)} placeholder="Insira a IM" />
            <ConfigInput label="Inscrição Estadual" value={form.inscricao_estadual || ''} onChange={v => updateField('inscricao_estadual', v)} placeholder="Insira a IE" />
            <ConfigInput label="CNAE Principal" value={form.cnae || ''} onChange={v => updateField('cnae', v)} placeholder="ex: 6202-3/00" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center gap-2">
            <CreditCard size={16} className="text-green-500" /> Impostos e Alíquotas (%)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              ['aliquota_iss', 'Alíquota ISS (%)'],
              ['aliquota_pis', 'PIS (%)'],
              ['aliquota_cofins', 'COFINS (%)'],
              ['aliquota_inss', 'INSS (%)'],
              ['aliquota_ir', 'IR (%)'],
              ['aliquota_csll', 'CSLL (%)'],
            ].map(([field, label]) => (
              <label key={field} className="flex flex-col gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={Number(form[field as keyof NfseConfiguracao] ?? 0)}
                  onChange={e => updateField(field as keyof NfseConfiguracao, (parseFloat(e.target.value) || 0) as never)}
                  className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center gap-2">
            <Webhook size={16} className="text-purple-500" /> Serviços e Enquadramentos
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <ConfigInput label="Código do Serviço" value={form.codigo_servico_municipio || ''} onChange={v => updateField('codigo_servico_municipio', v)} placeholder="ex: 1.05" />
            <ConfigInput label="Código de Tributação" value={form.codigo_tributacao_municipio || ''} onChange={v => updateField('codigo_tributacao_municipio', v)} placeholder="ex: 620230000" />
            <ConfigInput label="Código CFPS" value={form.codigo_cfps || ''} onChange={v => updateField('codigo_cfps', v)} placeholder="ex: 9201" />
            <ConfigInput label="Código CST / CSOSN" value={form.codigo_cst || ''} onChange={v => updateField('codigo_cst', v)} placeholder="ex: 101" />
            <ConfigInput label="Natureza da Operação" value={form.natureza_operacao || ''} onChange={v => updateField('natureza_operacao', v)} placeholder="ex: Tributação no município" />
            <ConfigInput label="Regime Especial" value={form.regime_especial || ''} onChange={v => updateField('regime_especial', v)} placeholder="ex: Microempresa municipal" />
            <ConfigInput label="Exigibilidade do ISS" value={form.exigibilidade_iss || ''} onChange={v => updateField('exigibilidade_iss', v)} placeholder="ex: Exigível" />
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center gap-2">
            <KeyRound size={16} className="text-amber-500" /> RPS, acesso e autenticação
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ConfigInput label="Série do RPS" value={form.serie_rps || ''} onChange={v => updateField('serie_rps', v)} placeholder="ex: NF" />
            <ConfigInput label="Tipo do RPS" value={form.tipo_rps || ''} onChange={v => updateField('tipo_rps', v)} placeholder="ex: RPS" />
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Próximo Número RPS</span>
              <input
                type="number"
                min="1"
                value={form.numero_rps_atual || 1}
                onChange={e => updateField('numero_rps_atual', parseInt(e.target.value) || 1)}
                className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <ConfigInput label="Usuário da Prefeitura" value={form.usuario_prefeitura || ''} onChange={v => updateField('usuario_prefeitura', v)} placeholder="Login do portal ou API" />
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Senha da Prefeitura</label>
              <div className="relative">
                <input
                  type={showSenhaPrefeitura ? 'text' : 'password'}
                  value={form.senha_prefeitura || ''}
                  onChange={e => updateField('senha_prefeitura', e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 pr-10 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Senha ou token secreto"
                />
                <button
                  type="button"
                  onClick={() => setShowSenhaPrefeitura(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  title={showSenhaPrefeitura ? 'Ocultar senha da prefeitura' : 'Mostrar senha da prefeitura'}
                >
                  {showSenhaPrefeitura ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <ConfigInput label="Chave de Autenticação" value={form.chave_autenticacao || ''} onChange={v => updateField('chave_autenticacao', v)} placeholder="Token, chave API ou código liberado" />
            {form.provedor === 'municipal' && (
              <>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Adaptador municipal</span>
                  <select
                    value={municipalAdapter}
                    onChange={e => updateField('payload_reforma_tributaria', {
                      ...payloadFiscal,
                      municipal_adapter: e.target.value,
                    } as NfseConfiguracao['payload_reforma_tributaria'])}
                    className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="generico">Portal municipal genérico</option>
                    <option value="nota_joseense">Nota Joseense</option>
                  </select>
                </label>
                <ConfigInput
                  label="URL do portal municipal"
                  value={portalMunicipalUrl}
                  onChange={v => updateField('payload_reforma_tributaria', {
                    ...payloadFiscal,
                    municipal_portal_url: v,
                  } as NfseConfiguracao['payload_reforma_tributaria'])}
                  placeholder="Ex: https://notajoseense.sjc.sp.gov.br/notafiscal/paginas/portal/#/login"
                />
              </>
            )}
            {form.provedor === 'nacional' && (
              <ConfigInput
                label="URL do portal nacional"
                value={portalNacionalUrl}
                onChange={v => updateField('payload_reforma_tributaria', {
                  ...payloadFiscal,
                  national_portal_url: v,
                } as NfseConfiguracao['payload_reforma_tributaria'])}
                placeholder="Ex: https://www.nfse.gov.br/EmissorNacional/Login"
              />
            )}
            {form.provedor === 'gissonline' && (
              <ConfigInput
                label="Host / URL WSDL GISSONLINE"
                value={String(payloadFiscal.gissonline_ws_host ?? '')}
                onChange={v => updateField('payload_reforma_tributaria', {
                  ...payloadFiscal,
                  gissonline_ws_host: v,
                } as NfseConfiguracao['payload_reforma_tributaria'])}
                placeholder="Ex: ws-seumunicipio.giss.com.br ou URL completa"
              />
            )}
          </div>

          {form.provedor === 'municipal' && municipalAdapter === 'nota_joseense' && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50 dark:bg-blue-950/20 p-4 space-y-2">
              <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Fluxo atual de São José dos Campos</p>
              <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
                Use este perfil para a Nota Joseense até 31 de agosto de 2026. Deixe o perfil do Emissor Nacional salvo em paralelo e ative a troca somente em 1º de setembro de 2026.
              </p>
              <div className="grid gap-2 md:grid-cols-2 text-[11px] text-blue-900 dark:text-blue-200">
                <div>Portal atual: {portalMunicipalUrl || 'Não informado'}</div>
                <div>Portal futuro: {portalNacionalUrl || 'Não informado'}</div>
              </div>
              <div className="grid gap-2 md:grid-cols-2 text-[11px]">
                <a href={portalMunicipalUrl || '#'} target="_blank" rel="noreferrer" className="text-blue-700 dark:text-blue-300 underline underline-offset-2 break-all">
                  Abrir portal atual da Nota Joseense
                </a>
                <a href={portalNacionalUrl || '#'} target="_blank" rel="noreferrer" className="text-blue-700 dark:text-blue-300 underline underline-offset-2 break-all">
                  Abrir portal futuro do Emissor Nacional
                </a>
              </div>
            </div>
          )}

          {form.provedor === 'municipal' && municipalAdapter === 'nota_joseense' && (
            <div className="rounded-xl border border-sky-200 dark:border-sky-900/40 bg-sky-50 dark:bg-sky-950/20 p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">Teste técnico da Nota Joseense</p>
                <p className="text-[11px] text-sky-700/80 dark:text-sky-300/80 mt-1">
                  Esse teste confirma se o perfil fiscal está completo, se o certificado A1 pode ser lido e se o portal atual da Nota Joseense está acessível. A emissão automática real ainda depende do manual oficial de RPS e upload do município.
                </p>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-sky-200/70 dark:border-sky-900/40 bg-white/70 dark:bg-sky-950/10 p-3">
                  <p className="text-[11px] font-semibold text-sky-900 dark:text-sky-200">O que já valida hoje</p>
                  <p className="text-[11px] text-sky-800/80 dark:text-sky-300/80 mt-1">
                    Perfil fiscal, certificado A1, login público e portal atual do contribuinte.
                  </p>
                </div>
                <div className="rounded-lg border border-sky-200/70 dark:border-sky-900/40 bg-white/70 dark:bg-sky-950/10 p-3">
                  <p className="text-[11px] font-semibold text-sky-900 dark:text-sky-200">O que ainda falta para emitir sozinho</p>
                  <p className="text-[11px] text-sky-800/80 dark:text-sky-300/80 mt-1">
                    Manual oficial do RPS, layout do arquivo, URL de upload e retorno técnico da prefeitura.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/20 p-3">
                <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">Para emitir uma nota real ainda esta semana</p>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-1">
                  Use o portal atual da Nota Joseense com valor baixo e cliente real de teste operacional. Essa emissão será fiscalmente válida e é o caminho mais seguro enquanto a automação do portal municipal ainda depende do manual oficial.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void testarConexaoNotaJoseense()}
                disabled={!isAdmin || testandoNotaJoseense}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white text-xs font-medium inline-flex items-center gap-2 transition-colors"
              >
                {testandoNotaJoseense ? <Loader2 size={13} className="animate-spin" /> : <Webhook size={13} />}
                {testandoNotaJoseense ? 'Testando Nota Joseense...' : 'Testar conexão Nota Joseense'}
              </button>

              {resultadoTesteNotaJoseense && (
                <div className={cn(
                  'rounded-xl border p-3 space-y-2',
                  resultadoTesteNotaJoseense.ok
                    ? 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20'
                    : 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20'
                )}>
                  <p className={cn(
                    'text-xs font-semibold',
                    resultadoTesteNotaJoseense.ok ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                  )}>
                    {resultadoTesteNotaJoseense.ok
                      ? resultadoTesteNotaJoseense.message ?? 'Seu teste foi concluído com sucesso.'
                      : resultadoTesteNotaJoseense.error ?? 'Seu teste retornou pendências.'}
                  </p>

                  {resultadoTesteNotaJoseense.certificado && (
                    <div className="grid gap-2 md:grid-cols-2 text-[11px] text-gray-700 dark:text-gray-300">
                      <div>Certificado: {resultadoTesteNotaJoseense.certificado.commonName || '—'}</div>
                      <div>Empresa: {resultadoTesteNotaJoseense.certificado.organization || '—'}</div>
                      <div>Validade inicial: {resultadoTesteNotaJoseense.certificado.validFrom ? new Date(resultadoTesteNotaJoseense.certificado.validFrom).toLocaleString('pt-BR') : '—'}</div>
                      <div>Validade final: {resultadoTesteNotaJoseense.certificado.validTo ? new Date(resultadoTesteNotaJoseense.certificado.validTo).toLocaleString('pt-BR') : '—'}</div>
                    </div>
                  )}

                  {resultadoTesteNotaJoseense.checks && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(resultadoTesteNotaJoseense.checks).map(([key, passed]) => (
                        <span
                          key={key}
                          className={cn(
                            'px-2 py-1 rounded-full text-[10px] font-medium',
                            passed
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          )}
                        >
                          {key.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}

                  {resultadoTesteNotaJoseense.next_step && (
                    <p className="text-[11px] text-gray-600 dark:text-gray-400">{resultadoTesteNotaJoseense.next_step}</p>
                  )}

                  {resultadoTesteNotaJoseense.tls_warning && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">{resultadoTesteNotaJoseense.tls_warning}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {form.provedor === 'nacional' && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 p-4 space-y-2">
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Perfil preparado para a virada</p>
              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
                Para São José dos Campos, deixe este perfil salvo agora e faça a ativação somente quando a mudança oficial entrar em vigor em 1º de setembro de 2026.
              </p>
              <div className="text-[11px] text-emerald-900 dark:text-emerald-200">
                Portal nacional: {portalNacionalUrl || 'Não informado'}
              </div>
            </div>
          )}

          {form.provedor === 'nacional' && form.ambiente === 'producao_restrita' && (
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-950/20 p-4 space-y-2">
              <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">Ambiente de testes sem valor fiscal</p>
              <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80">
                Use este ambiente para emissão e cancelamento de testes no Emissor Nacional sem gerar nota fiscal real em produção.
              </p>
            </div>
          )}

          {form.provedor === 'nacional' && form.ambiente === 'producao' && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 p-4 space-y-2">
              <p className="text-xs font-semibold text-red-800 dark:text-red-300">Atenção ao ambiente real</p>
              <p className="text-[11px] text-red-700/80 dark:text-red-300/80">
                Toda emissão neste ambiente terá efeito fiscal real. Use produção apenas quando quiser gerar documento válido e definitivo.
              </p>
            </div>
          )}

          {form.provedor === 'gissonline' && (
            <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
              <div>
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Teste técnico do GISSONLINE</p>
                <p className="text-[11px] text-amber-700/80 dark:text-amber-300/80 mt-1">
                  Esse teste valida a configuração fiscal, a leitura do certificado A1 salvo no bucket e o acesso ao ambiente oficial de homologação do GISSONLINE.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void testarConexaoGissOnline()}
                disabled={!isAdmin || testandoGissOnline}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-medium inline-flex items-center gap-2 transition-colors"
              >
                {testandoGissOnline ? <Loader2 size={13} className="animate-spin" /> : <Webhook size={13} />}
                {testandoGissOnline ? 'Testando GISSONLINE...' : 'Testar conexão GISSONLINE'}
              </button>

              {resultadoTesteGissOnline && (
                <div className={cn(
                  'rounded-xl border p-3 space-y-2',
                  resultadoTesteGissOnline.ok
                    ? 'border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20'
                    : 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/20'
                )}>
                  <p className={cn(
                    'text-xs font-semibold',
                    resultadoTesteGissOnline.ok ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'
                  )}>
                    {resultadoTesteGissOnline.ok
                      ? resultadoTesteGissOnline.message ?? 'Seu teste foi concluído com sucesso.'
                      : resultadoTesteGissOnline.error ?? 'Seu teste retornou pendências.'}
                  </p>

                  {resultadoTesteGissOnline.certificado && (
                    <div className="grid gap-2 md:grid-cols-2 text-[11px] text-gray-700 dark:text-gray-300">
                      <div>Certificado: {resultadoTesteGissOnline.certificado.commonName || '—'}</div>
                      <div>Empresa: {resultadoTesteGissOnline.certificado.organization || '—'}</div>
                      <div>Validade inicial: {resultadoTesteGissOnline.certificado.validFrom ? new Date(resultadoTesteGissOnline.certificado.validFrom).toLocaleString('pt-BR') : '—'}</div>
                      <div>Validade final: {resultadoTesteGissOnline.certificado.validTo ? new Date(resultadoTesteGissOnline.certificado.validTo).toLocaleString('pt-BR') : '—'}</div>
                    </div>
                  )}

                  {resultadoTesteGissOnline.checks && (
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(resultadoTesteGissOnline.checks).map(([key, passed]) => (
                        <span
                          key={key}
                          className={cn(
                            'px-2 py-1 rounded-full text-[10px] font-medium',
                            passed
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                          )}
                        >
                          {key.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}

                  {resultadoTesteGissOnline.next_step && (
                    <p className="text-[11px] text-gray-600 dark:text-gray-400">{resultadoTesteGissOnline.next_step}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-500" /> Certificado Digital A1
          </h3>

          {form.certificado_pfx_path ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Certificado vinculado</p>
                  <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/70 truncate">{form.certificado_pfx_path}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void removerCertificado()}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 transition-colors"
              >
                <Trash2 size={13} /> Remover
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-950 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors">
                  <Upload size={14} className="text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {certFile ? certFile.name : 'Selecionar arquivo .pfx ou .p12'}
                  </span>
                  <input
                    type="file"
                    accept=".pfx,.p12"
                    className="sr-only"
                    onChange={e => setCertFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void uploadCertificado()}
                  disabled={!certFile || uploadingCert}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-colors"
                >
                  {uploadingCert ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {uploadingCert ? 'Enviando…' : 'Vincular'}
                </button>
              </div>
              <p className="text-[11px] text-gray-400">Arquivo A1 (.pfx ou .p12) da empresa emitente. Armazenado em bucket privado — não fica exposto publicamente.</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Senha do certificado</label>
            <div className="relative max-w-xs">
              <input
                type={showCertSenha ? 'text' : 'password'}
                value={form.certificado_senha || ''}
                onChange={e => updateField('certificado_senha', e.target.value || null)}
                placeholder="Senha do arquivo .pfx"
                className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 pr-10 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowCertSenha(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                title={showCertSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showCertSenha ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Salva junto com a configuração ao clicar em "Salvar Configuração Fiscal".</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center gap-2">
            <Save size={16} className="text-blue-500" /> Operação automática
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Ambiente de Operação</span>
              <select
                value={form.ambiente || 'homologacao'}
                onChange={e => updateField('ambiente', e.target.value as NfseConfiguracao['ambiente'])}
                className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="homologacao">Homologação</option>
                <option value="producao_restrita">Produção restrita</option>
                <option value="producao">Produção</option>
              </select>
            </label>
            <div className="grid gap-3">
              {[
                ['ativo', 'Configuração ativa', 'Permite usar esse perfil nas emissões.'],
                ['robo_ligado', 'Robô de faturamento ligado', 'Emite automaticamente após confirmação de pagamento.'],
                ['simples_nacional', 'Optante pelo Simples Nacional', 'Usa o enquadramento simplificado na montagem fiscal.'],
                ['incentivo_fiscal', 'Incentivo fiscal', 'Marca benefícios ou fomento municipal aplicável.'],
                ['usa_certificado_digital', 'Usa certificado digital', 'Indica que esse município exige fluxo por certificado.'],
              ].map(([field, title, desc]) => (
                <div key={field} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{title}</p>
                    <p className="text-[10px] text-gray-400">{desc}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => updateField(field as keyof NfseConfiguracao, (!form[field as keyof NfseConfiguracao]) as never)}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50',
                      form[field as keyof NfseConfiguracao] ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
                        form[field as keyof NfseConfiguracao] ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Observações operacionais</label>
              <textarea
                value={form.observacoes || ''}
                onChange={e => updateField('observacoes', e.target.value)}
                rows={4}
                placeholder="Ex: São José migra para Emissor Nacional em 01/09/2026. São Bernardo opera hoje com GISSONLINE."
                className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-100 dark:border-gray-800 pb-2 flex items-center gap-2">
            <FileText size={16} className="text-indigo-500" /> Regra de emissão da NFS-e
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Etapa para liberar a emissão</span>
              <select
                value={automacaoNfse.gatilho_emissao}
                onChange={e => setAutomacaoNfse(prev => ({ ...prev, gatilho_emissao: e.target.value as NfseEmissionTrigger }))}
                className="border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.entries(NFSE_GATILHO_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-3">
              {[
                ['permitir_emissao_manual_rapida', 'Atalho rápido no Comercial', 'Permite emitir NFS-e direto pela ação da venda, respeitando a etapa configurada.'],
                ['permitir_emissao_lote_comercial', 'Emissão em lote no Comercial', 'Permite selecionar várias vendas e emitir NFS-e em lote quando elegíveis.'],
                ['permitir_emissao_manual_fora_etapa', 'Permitir emissão fora da etapa', 'Permite emitir a nota manualmente mesmo antes da etapa automática configurada.'],
                ['exigir_justificativa_fora_etapa', 'Exigir justificativa da exceção', 'Quando emitir fora da etapa, exige um motivo e registra essa decisão.'],
              ].map(([field, title, desc]) => (
                <div key={field} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-100 dark:border-gray-800">
                  <div>
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{title}</p>
                    <p className="text-[10px] text-gray-400">{desc}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => setAutomacaoNfse(prev => ({ ...prev, [field]: !prev[field as keyof NfseAutomationSettings] } as NfseAutomationSettings))}
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50',
                      automacaoNfse[field as keyof NfseAutomationSettings] ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
                        automacaoNfse[field as keyof NfseAutomationSettings] ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/70 dark:bg-indigo-950/20 px-4 py-3">
            <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
              Regra atual: {NFSE_GATILHO_LABELS[automacaoNfse.gatilho_emissao]}.
            </p>
            <p className="text-[11px] text-indigo-600 dark:text-indigo-400 mt-1">
              A emissão manual e em lote no Comercial respeitará essa etapa antes de disparar a nota.
            </p>
          </div>
          {okAutomacaoNfse && (
            <p className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
              Regra de emissão da NFS-e salva.
            </p>
          )}
          <button
            type="button"
            onClick={salvarAutomacaoNfse}
            disabled={!isAdmin || salvandoAutomacaoNfse}
            className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors inline-flex items-center gap-2"
          >
            {salvandoAutomacaoNfse ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {salvandoAutomacaoNfse ? 'Salvando...' : 'Salvar Regra da NFS-e'}
          </button>
        </div>

        {erro && <p className="text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{erro}</p>}
        {ok && <p className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">Configuração fiscal salva com sucesso.</p>}

        <button
          type="button"
          onClick={salvar}
          disabled={!isAdmin || saving}
          className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors inline-flex items-center gap-2"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'Salvando...' : 'Salvar Configuração Fiscal'}
        </button>
      </div>
      </>
      )}

      {subtab === 'modelo' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Editor do modelo da nota</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Aqui você ajusta a apresentação visual do corpo da NFS-e. A prévia ao lado segue o padrão municipal, com prestador, tomador, discriminação dos serviços e blocos fiscais.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ConfigInput label="Nome do modelo" value={modeloNota.nome_modelo} onChange={v => setModeloNota(prev => ({ ...prev, nome_modelo: v }))} placeholder="Ex: Modelo CertiID Premium" />
              <ConfigInput label="Cor principal" value={modeloNota.cor_primaria} onChange={v => setModeloNota(prev => ({ ...prev, cor_primaria: v }))} placeholder="#1d4ed8" />
              <ConfigInput label="Título" value={modeloNota.titulo} onChange={v => setModeloNota(prev => ({ ...prev, titulo: v }))} placeholder="Nota Fiscal de Serviços" />
              <ConfigInput label="Subtítulo" value={modeloNota.subtitulo} onChange={v => setModeloNota(prev => ({ ...prev, subtitulo: v }))} placeholder="Descrição secundária da nota" />
              <div className="md:col-span-2">
                <ConfigInput label="Título do bloco de serviço" value={modeloNota.bloco_servico_titulo} onChange={v => setModeloNota(prev => ({ ...prev, bloco_servico_titulo: v }))} placeholder="Detalhamento do serviço prestado" />
              </div>
            </div>

            <div className="grid gap-4">
              {[
                ['mensagem_destaque', 'Mensagem de destaque', 'Mensagem de abertura ou destaque fiscal/comercial.'],
                ['observacao_padrao', 'Observação padrão', 'Texto padrão antes do fechamento da nota.'],
                ['rodape', 'Rodapé', 'Informação final exibida no pé do documento.'],
              ].map(([field, label, placeholder]) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
                  <textarea
                    value={modeloNota[field as keyof NfseModeloLayout] as string}
                    onChange={e => setModeloNota(prev => ({ ...prev, [field]: e.target.value }))}
                    rows={3}
                    placeholder={placeholder}
                    className="w-full border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-100 dark:border-gray-800">
              <div>
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Mostrar identidade visual no topo</p>
                <p className="text-[10px] text-gray-400">Deixa o modelo pronto para exibir a logo interna da operação.</p>
              </div>
              <button
                type="button"
                disabled={!isAdmin}
                onClick={() => setModeloNota(prev => ({ ...prev, mostrar_logo: !prev.mostrar_logo }))}
                className={cn('relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-50',
                  modeloNota.mostrar_logo ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700')}
              >
                <span className={cn('pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200',
                  modeloNota.mostrar_logo ? 'translate-x-5' : 'translate-x-0')} />
              </button>
            </div>

            {okModelo && <p className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">Modelo da nota salvo.</p>}

            <button
              type="button"
              onClick={salvarModeloNota}
              disabled={!isAdmin || savingModelo}
              className="px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors inline-flex items-center gap-2"
            >
              {savingModelo ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {savingModelo ? 'Salvando...' : 'Salvar Modelo da Nota'}
            </button>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Prévia do modelo</p>
              <button
                type="button"
                onClick={() => setShowPreviewNotaTelaCheia(true)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Abrir nota em tela cheia
              </button>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-3">
              <NfseDocumentPreview
                modelo={modeloNota}
                configuracao={form}
                fallbackDiscriminacao={modeloNota.mensagem_destaque}
                className="min-w-[780px]"
              />
            </div>
          </div>
        </div>
      )}

      {showPreviewNotaTelaCheia && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm p-4">
          <div className="h-full w-full rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-800 flex flex-col">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Prévia da NFS-e</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Visualização ampliada do modelo da nota.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewNotaTelaCheia(false)}
                className="w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-950 p-5">
              <NfseDocumentPreview
                modelo={modeloNota}
                configuracao={form}
                fallbackDiscriminacao={modeloNota.mensagem_destaque}
                className="min-w-[1100px] mx-auto"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Aba Permissões (Módulos, Perfis e Pacotes) ────────────────────────────

type NivelAcesso = 'nenhum' | 'visualizar' | 'editar' | 'admin'

const NIVEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'herdar',     label: 'Herança'    },
  { value: 'nenhum',     label: 'Nenhum'     },
  { value: 'visualizar', label: 'Visualizar' },
  { value: 'editar',     label: 'Editar'     },
  { value: 'admin',      label: 'Admin'      },
]

const NIVEL_CORES: Record<string, string> = {
  admin:      'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  editar:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  visualizar: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  nenhum:     'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
  herdar:     'bg-gray-50 text-gray-400 dark:bg-gray-800/50 dark:text-gray-500',
}

type ModuloData = {
  id: string
  chave: string
  nome: string
  grupo: string
  icone: string | null
  rota: string | null
  ordem: number
}

type PerfilData = {
  id: string
  nome: string
  descricao: string | null
  nivel: number
}

type PerfilModuloData = {
  modulo_id: string
  nivel_acesso: string
  chave: string
  nome: string
  grupo: string
}

function AbaPermissoes() {
  const { profile } = useAuth()
  const isAdmin = isAdminProfile(profile)

  const [modulos, setModulos] = useState<ModuloData[]>([])
  const [perfis, setPerfis] = useState<PerfilData[]>([])
  const [perfilModulos, setPerfilModulos] = useState<Record<string, PerfilModuloData[]>>({})
  const [expandedPerfil, setExpandedPerfil] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadData() {
    setLoading(true)
    try {
      const [modRes, perfRes] = await Promise.all([
        fetch(getApiUrl('/permissoes/modulos')).then(r => r.json()),
        fetch(getApiUrl('/permissoes/perfis')).then(r => r.json()),
      ])
      if (modRes.ok) setModulos(modRes.modulos)
      if (perfRes.ok) setPerfis(perfRes.perfis)
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function loadPerfilModulos(perfilId: string) {
    if (perfilModulos[perfilId]) {
      setExpandedPerfil(expandedPerfil === perfilId ? null : perfilId)
      return
    }
    try {
      const res = await fetch(getApiUrl(`/permissoes/perfis/${perfilId}/modulos`)).then(r => r.json())
      if (res.ok) {
        setPerfilModulos(prev => ({ ...prev, [perfilId]: res.modulos }))
        setExpandedPerfil(perfilId)
      }
    } catch { /* ignore */ }
  }

  useEffect(() => { void loadData() }, [])

  const grupos = ['operacao', 'relacionamento', 'gestao', 'sistema', 'comercial']
  const grupoLabels: Record<string, string> = {
    operacao:       'Operação',
    relacionamento: 'Relacionamento',
    gestao:         'Gestão',
    sistema:        'Sistema',
    comercial:      'Comercial',
  }

  if (!isAdmin) {
    return (
      <div className="text-sm text-gray-500 dark:text-gray-400 p-4">
        Apenas administradores podem gerenciar permissões.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <ShieldCheck size={20} className="text-blue-500" />
          Permissões do Sistema
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Gerencie quais módulos cada perfil de acesso pode visualizar, editar ou administrar.
        </p>
      </div>

      {/* Perfis de Acesso */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Perfis de Acesso</h3>
        {perfis.map(perfil => (
          <div key={perfil.id} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              type="button"
              onClick={() => void loadPerfilModulos(perfil.id)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs">
                  {perfil.nome.charAt(0)}
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{perfil.nome}</span>
                  {perfil.descricao && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{perfil.descricao}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-400 dark:text-gray-500">Nível {perfil.nivel}</span>
                {expandedPerfil === perfil.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>
            </button>

            {expandedPerfil === perfil.id && (
              <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-4">
                {grupos.map(grupo => {
                  const modulosGrupo = modulos.filter(m => m.grupo === grupo)
                  if (modulosGrupo.length === 0) return null
                  const modulosComPermissao = perfilModulos[perfil.id] ?? []
                  return (
                    <div key={grupo}>
                      <h4 className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                        {grupoLabels[grupo] ?? grupo}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {modulosGrupo.map(mod => {
                          const permissao = modulosComPermissao.find(p => p.modulo_id === mod.id)
                          const nivelAtual: string = permissao?.nivel_acesso ?? 'nenhum'
                          return (
                            <div key={mod.id}
                              className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                            >
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{mod.nome}</span>
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${NIVEL_CORES[nivelAtual] ?? ''}`}>
                                {NIVEL_OPTIONS.find(o => o.value === nivelAtual)?.label ?? nivelAtual}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Legenda */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-purple-500" /> Admin
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-500" /> Editar
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500" /> Visualizar
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600" /> Nenhum
        </span>
      </div>

      {/* ── Sobrescrita por Usuário ─────────────────────────── */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Users size={16} />
          Sobrescrita Individual por Usuário
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Selecione um usuário para sobrescrever as permissões do perfil dele em módulos específicos.
        </p>
        <UserOverrideSection modulos={modulos} grupos={grupos} grupoLabels={grupoLabels} />
      </div>

      {/* ── Pacotes de Negócio ───────────────────────────────── */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <CreditCard size={16} />
          Pacotes de Negócio
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Defina quais módulos cada pacote de negócio inclui. O pacote do parceiro determina os módulos disponíveis para os usuários daquela organização.
        </p>
        <PacotesSection modulos={modulos} grupos={grupos} grupoLabels={grupoLabels} />
      </div>
    </div>
  )
}

function UserOverrideSection({
  modulos,
  grupos,
  grupoLabels,
}: {
  modulos: ModuloData[]
  grupos: string[]
  grupoLabels: Record<string, string>
}) {
  const [users, setUsers] = useState<{ id: string; nome: string; email: string | null; perfil: string }[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [originalOverrides, setOriginalOverrides] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(true)

  useEffect(() => {
    fetch(getApiUrl('/profiles'))
      .then(res => res.json())
      .then(data => {
        if (data.ok) setUsers(data.profiles ?? [])
        setLoadingUsers(false)
      })
      .catch(() => setLoadingUsers(false))
  }, [])

  async function loadUserOverrides(userId: string) {
    try {
      const [permRes, ovRes] = await Promise.all([
        fetch(getApiUrl(`/permissoes/profile/${userId}`)).then(r => r.json()),
        fetch(getApiUrl(`/permissoes/profile/${userId}/overrides`)).then(r => r.json()),
      ])
      const ovMap: Record<string, string> = {}
      if (ovRes.ok) {
        for (const ov of ovRes.overrides ?? []) {
          ovMap[ov.modulo_id] = ov.nivel_acesso
        }
      }
      if (permRes.ok) {
        for (const p of permRes.permissoes ?? []) {
          if (!(p.id in ovMap)) {
            ovMap[p.id] = 'herdar'
          }
        }
      }
      setOverrides(ovMap)
      setOriginalOverrides({ ...ovMap })
    } catch { /* ignore */ }
  }

  function handleUserSelect(userId: string) {
    setSelectedUserId(userId)
    setSaved(false)
    if (userId) void loadUserOverrides(userId)
  }

  function handleNivelChange(moduloId: string, nivel: string) {
    setOverrides(prev => ({ ...prev, [moduloId]: nivel }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    try {
      const ovList = Object.entries(overrides)
        .filter(([_, nivel]) => nivel !== 'herdar')
        .map(([modulo_id, nivel_acesso]) => ({ modulo_id, nivel_acesso }))
      const res = await fetch(getApiUrl(`/permissoes/profile/${selectedUserId}/overrides`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: ovList }),
      })
      const data = await res.json()
      if (data.ok) {
        setSaved(true)
        setOriginalOverrides({ ...overrides })
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  const hasChanges = JSON.stringify(overrides) !== JSON.stringify(originalOverrides)

  const selectedUser = users.find(u => u.id === selectedUserId)

  return (
    <div className="space-y-4">
      {/* User selector */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <select
            value={selectedUserId}
            onChange={e => handleUserSelect(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
          >
            <option value="">Selecione um usuário...</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.nome} {u.email ? `(${u.email})` : ''} — {u.perfil}
              </option>
            ))}
          </select>
        </div>
        {loadingUsers && <Loader2 size={16} className="animate-spin text-gray-400" />}
      </div>

      {selectedUserId && selectedUser && (
        <>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Perfil base: <span className="font-medium text-gray-700 dark:text-gray-300">{selectedUser.perfil}</span>
            {' · '}
            <span className="text-gray-400">Valores marcados como "Herança" usam a permissão do perfil</span>
          </div>

          <div className="space-y-4">
            {grupos.map(grupo => {
              const modulosGrupo = modulos.filter(m => m.grupo === grupo)
              if (modulosGrupo.length === 0) return null
              return (
                <div key={grupo}>
                  <h4 className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                    {grupoLabels[grupo] ?? grupo}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {modulosGrupo.map(mod => {
                      const nivelAtual = overrides[mod.id] ?? 'herdar'
                      return (
                        <div key={mod.id}
                          className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                        >
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{mod.nome}</span>
                          <select
                            value={nivelAtual}
                            onChange={e => handleNivelChange(mod.id, e.target.value)}
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border-0 cursor-pointer appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 ${NIVEL_CORES[nivelAtual] ?? ''}`}
                          >
                            {NIVEL_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              <Save size={15} />
              {saving ? 'Salvando...' : 'Salvar Sobrescritas'}
            </button>
            {saved && (
              <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <Check size={14} /> Salvo
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}


function PacotesSection({
  modulos,
  grupos,
  grupoLabels,
}: {
  modulos: ModuloData[]
  grupos: string[]
  grupoLabels: Record<string, string>
}) {
  const [pacotes, setPacotes] = useState<{ id: string; nome: string; descricao: string | null }[]>([])
  const [pacoteModulos, setPacoteModulos] = useState<Record<string, string[]>>({})
  const [editPacote, setEditPacote] = useState<string | null>(null)
  const [editModulos, setEditModulos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(getApiUrl('/permissoes/pacotes'))
      .then(r => r.json())
      .then(data => { if (data.ok) setPacotes(data.pacotes) })
  }, [])

  async function loadPacoteModulos(id: string) {
    if (pacoteModulos[id]) { setEditPacote(editPacote === id ? null : id); return }
    try {
      const res = await fetch(getApiUrl(`/permissoes/pacotes/${id}/modulos`)).then(r => r.json())
      if (res.ok) {
        setPacoteModulos(prev => ({ ...prev, [id]: res.modulos }))
        setEditPacote(id)
        setEditModulos(res.modulos)
      }
    } catch { /* ignore */ }
  }

  function toggleModulo(chave: string) {
    setEditModulos(prev =>
      prev.includes(chave) ? prev.filter(c => c !== chave) : [...prev, chave],
    )
    setSaved(false)
  }

  async function savePacoteModulos() {
    if (!editPacote) return
    setSaving(true)
    try {
      const res = await fetch(getApiUrl(`/permissoes/pacotes/${editPacote}/modulos`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modulos: editModulos }),
      })
      const data = await res.json()
      if (data.ok) {
        setPacoteModulos(prev => ({ ...prev, [editPacote]: editModulos }))
        setSaved(true)
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      {pacotes.map(pacote => {
        const expanded = editPacote === pacote.id
        const modList = pacoteModulos[pacote.id] ?? []
        return (
          <div key={pacote.id} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              type="button"
              onClick={() => { void loadPacoteModulos(pacote.id) }}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  {pacote.nome.charAt(0)}
                </div>
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{pacote.nome}</span>
                  {pacote.descricao && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{pacote.descricao}</p>
                  )}
                </div>
              </div>
              {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
            </button>

            {expanded && (
              <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 space-y-4">
                {grupos.map(grupo => {
                  const modulosGrupo = modulos.filter(m => m.grupo === grupo)
                  if (modulosGrupo.length === 0) return null
                  return (
                    <div key={grupo}>
                      <h4 className="text-[11px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                        {grupoLabels[grupo] ?? grupo}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {modulosGrupo.map(mod => {
                          const isSelected = editModulos.includes(mod.chave)
                          return (
                            <button
                              key={mod.id}
                              type="button"
                              onClick={() => toggleModulo(mod.chave)}
                              className={cn(
                                'flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left',
                                isSelected
                                  ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                  : 'bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 border border-transparent hover:border-gray-200 dark:hover:border-gray-700',
                              )}
                            >
                              <span>{mod.nome}</span>
                              {isSelected ? <Check size={14} className="shrink-0 text-emerald-500" /> : <Plus size={14} className="shrink-0 text-gray-400" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={savePacoteModulos}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                  >
                    <Save size={15} />
                    {saving ? 'Salvando...' : 'Salvar Pacote'}
                  </button>
                  {saved && (
                    <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <Check size={14} /> Salvo
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function Configuracoes() {
  const { profile } = useAuth()
  const isAdmin = isAdminProfile(profile)
  const tabsDisponiveis = TABS.filter(t => !ADMIN_ONLY_TABS.includes(t.id) || isAdmin)
  const [tab, setTab] = useState<Tab>(tabsDisponiveis[0]?.id ?? 'geral')

  useEffect(() => {
    if (!tabsDisponiveis.some(t => t.id === tab)) {
      setTab(tabsDisponiveis[0]?.id ?? 'geral')
    }
  }, [tab, tabsDisponiveis])

  return (
    <ModulePageShell
      tabs={tabsDisponiveis}
      activeTab={tab}
      onTabChange={setTab}
      storageKey="module-submenu-configuracoes"
      menuLabel="Configurações"
    >
      <div className="space-y-6">
        {/* GERAL */}
        {tab === 'geral' && (
          <AbaGeral />
        )}

        {/* INTEGRAÇÕES */}
        {tab === 'integracoes' && <AbaIntegracoes />}

        {/* AUTOMAÇÕES */}
        {tab === 'automacoes' && <AbaAutomacoes />}

        {/* USUÁRIOS */}
        {tab === 'usuarios' && <AbaUsuarios />}

        {/* PERMISSÕES */}
        {tab === 'permissoes' && <AbaPermissoes />}

        {/* PONTOS DE ATENDIMENTO */}
        {tab === 'pontos' && <AbaPontos />}

        {/* PAGAMENTOS */}
        {tab === 'pagamentos' && <AbaPagamentos />}

        {/* FISCAL */}
        {tab === 'fiscal' && <AbaFiscal />}

        {/* PRIVACIDADE LGPD */}
        {tab === 'privacidade' && <AbaPrivacidade />}
      </div>
    </ModulePageShell>
  )
}

// ── Aba Privacidade (LGPD Art. 18) ─────────────────────────────────────────

function AbaPrivacidade() {
  const { profile } = useAuth()
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [solicitacoes, setSolicitacoes] = useState<{ id: string; status: string; solicitado_em: string }[]>([])

  useEffect(() => {
    if (!profile?.id) return
    void supabase
      .from('lgpd_solicitacoes_exclusao')
      .select('id, status, solicitado_em')
      .eq('profile_id', profile.id)
      .order('solicitado_em', { ascending: false })
      .then(({ data }) => setSolicitacoes(data ?? []))
  }, [profile?.id, enviado])

  async function handleSolicitarExclusao(e: React.FormEvent) {
    e.preventDefault()
    if (!profile?.id) return
    setErro(null)
    setLoading(true)
    const { error } = await supabase.from('lgpd_solicitacoes_exclusao').insert({
      profile_id: profile.id,
      email: profile.email ?? '',
      motivo: motivo.trim() || null,
    })
    setLoading(false)
    if (error) { setErro('Não foi possível registrar sua solicitação.'); return }
    setEnviado(true)
    setMotivo('')
  }

  const jaTemPendente = solicitacoes.some(s => s.status === 'pendente' || s.status === 'aprovada')

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Privacidade e Dados Pessoais</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Conforme a LGPD (Lei 13.709/2018), você tem direito de acessar, corrigir e solicitar a exclusão dos seus dados pessoais.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <h3 className="font-medium text-gray-800 dark:text-gray-200 text-sm">Seus dados armazenados</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-disc list-inside">
          <li>Nome completo, e-mail e telefone (perfil)</li>
          <li>Histórico de atividades no sistema</li>
          <li>Documentos e registros associados à sua conta</li>
        </ul>
        <p className="text-xs text-gray-500 dark:text-gray-500">
          Para corrigir seus dados, edite seu perfil nas configurações gerais. Para dúvidas, contate o encarregado de dados.
        </p>
      </div>

      <div className="rounded-xl border border-red-200 dark:border-red-900/40 p-5 space-y-4">
        <h3 className="font-medium text-red-700 dark:text-red-400 text-sm">Solicitar exclusão de dados (Art. 18, IV LGPD)</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Ao solicitar a exclusão, seus dados pessoais serão anonimizados. O prazo de resposta é de até 15 dias úteis.
        </p>

        {enviado && (
          <div className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
            Solicitação registrada. Você será notificado quando for processada.
          </div>
        )}

        {jaTemPendente && !enviado && (
          <div className="text-sm text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg px-3 py-2">
            Você já possui uma solicitação em andamento.
          </div>
        )}

        {!jaTemPendente && !enviado && (
          <form onSubmit={handleSolicitarExclusao} className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">Motivo (opcional)</label>
              <textarea
                value={motivo}
                onChange={e => setMotivo(e.target.value)}
                rows={3}
                maxLength={500}
                className="w-full text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-white resize-none"
                placeholder="Descreva o motivo da solicitação..."
              />
            </div>
            {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
            <button
              type="submit"
              disabled={loading}
              className="text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg px-4 py-2 transition-colors"
            >
              {loading ? 'Registrando...' : 'Solicitar exclusão dos meus dados'}
            </button>
          </form>
        )}

        {solicitacoes.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Histórico de solicitações</p>
            {solicitacoes.map(s => (
              <div key={s.id} className="text-xs text-gray-500 dark:text-gray-500 flex justify-between">
                <span>{new Date(s.solicitado_em).toLocaleDateString('pt-BR')}</span>
                <span className="capitalize">{s.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-xs text-gray-500 dark:text-gray-500 space-y-1">
        <p><strong>Encarregado de Dados (DPO):</strong> contato@certiid.com.br</p>
        <p><strong>Base legal:</strong> LGPD Art. 7, I (consentimento) — Art. 18, IV (exclusão)</p>
        <p><strong>Autoridade supervisora:</strong> <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="underline">ANPD — Autoridade Nacional de Proteção de Dados</a></p>
      </div>
    </div>
  )
}






