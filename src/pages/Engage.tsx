import { useEffect, useMemo, useState } from 'react'
import { Settings2, SlidersHorizontal, Plus, Send, Webhook, Inbox, SunMedium, MoonStar } from 'lucide-react'
import { getApiUrl } from '@/lib/api'

type EngageSummary = {
  contacts_active: number
  campaigns_active: number
  messages_sent: number
  replies_today: number
  opt_outs: number
  providers_active: number
  sender_accounts_active: number
  tasks_open: number
  events_today: number
}

type EngageContact = {
  id: string
  name: string
  email: string | null
  phone: string | null
  status: string
  score: number
  created_at: string
}

type EngageCampaign = {
  id: string
  name: string
  channel: string
  status: string
  scheduled_at: string | null
  created_at: string
}

type EngageProvider = {
  id: string
  key: string
  name: string
  channel: string
  status: string
  config_json?: Record<string, unknown>
}

type EngageTemplate = {
  id: string
  name: string
  channel: string
  approval_status: string
  created_at: string
}

type EngageSegment = {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

type EngageEvent = {
  id: string
  event_type: string
  created_at: string
}

type EngageTask = {
  id: string
  title: string
  type: string
  status: string
  due_at: string | null
  created_at: string
}

type ApiPayload<T> = { ok: boolean; [key: string]: unknown } & Record<string, T | undefined>

const defaultSummary: EngageSummary = {
  contacts_active: 0,
  campaigns_active: 0,
  messages_sent: 0,
  replies_today: 0,
  opt_outs: 0,
  providers_active: 0,
  sender_accounts_active: 0,
  tasks_open: 0,
  events_today: 0,
}

export default function Engage() {
  const [tab, setTab] = useState<'resumo' | 'campanhas' | 'configuracoes' | 'fila' | 'templates'>('resumo')
  const [summary, setSummary] = useState<EngageSummary>(defaultSummary)
  const [contacts, setContacts] = useState<EngageContact[]>([])
  const [campaigns, setCampaigns] = useState<EngageCampaign[]>([])
  const [providers, setProviders] = useState<EngageProvider[]>([])
  const [events, setEvents] = useState<EngageEvent[]>([])
  const [tasks, setTasks] = useState<EngageTask[]>([])
  const [inboxEvents, setInboxEvents] = useState<EngageEvent[]>([])
  const [inboxTasks, setInboxTasks] = useState<EngageTask[]>([])
  const [templates, setTemplates] = useState<EngageTemplate[]>([])
  const [segments, setSegments] = useState<EngageSegment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [contactForm, setContactForm] = useState({ name: '', email: '', phone: '', score: 0 })
  const [providerForm, setProviderForm] = useState({
    key: '',
    name: '',
    channel: 'whatsapp',
    base_url: '',
    api_token: '',
    instance_name: '',
    webhook_url: '',
    webhook_secret: '',
    account_id: '',
    app_id: '',
    app_secret: '',
    phone_number_id: '',
    access_token: '',
    verify_token: '',
    template_namespace: '',
    routing_mode: 'round_robin',
    delivery_mode: 'official',
    daily_limit: 0,
    hourly_limit: 0,
    priority: 100,
    risk_score: 0,
    anti_ban_delay_seconds: 0,
    status: 'ativo',
  })
  const [senderForm, setSenderForm] = useState({
    provider_id: '',
    label: '',
    phone_number: '',
    channel: 'whatsapp',
    daily_limit: 0,
    hourly_limit: 0,
    priority: 100,
    risk_score: 0,
  })
  const [campaignForm, setCampaignForm] = useState({ name: '', channel: 'whatsapp', scheduled_at: '' })
  const [queueForm, setQueueForm] = useState({ campaign_id: '', contact_id: '', body: '', channel: 'whatsapp' })
  const [taskForm, setTaskForm] = useState({ title: '', type: 'followup', due_at: '' })
  const [templateForm, setTemplateForm] = useState({ name: '', channel: 'whatsapp', body: '', approval_status: 'draft' })
  const [segmentForm, setSegmentForm] = useState({ name: '', description: '', is_active: true })

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [summaryRes, contactsRes, campaignsRes, providersRes, eventsRes, tasksRes, inboxRes, templatesRes, segmentsRes] = await Promise.all([
          fetch(getApiUrl('/engage/summary'), { signal: controller.signal }),
          fetch(getApiUrl('/engage/contacts'), { signal: controller.signal }),
          fetch(getApiUrl('/engage/campaigns'), { signal: controller.signal }),
          fetch(getApiUrl('/engage/providers'), { signal: controller.signal }),
          fetch(getApiUrl('/engage/events'), { signal: controller.signal }),
          fetch(getApiUrl('/engage/tasks'), { signal: controller.signal }),
          fetch(getApiUrl('/engage/inbox'), { signal: controller.signal }),
          fetch(getApiUrl('/engage/templates'), { signal: controller.signal }),
          fetch(getApiUrl('/engage/segments'), { signal: controller.signal }),
        ])

        const [summaryData, contactsData, campaignsData, providersData, eventsData, tasksData, inboxData, templatesData, segmentsData] = await Promise.all([
          summaryRes.json().catch(() => null),
          contactsRes.json().catch(() => null),
          campaignsRes.json().catch(() => null),
          providersRes.json().catch(() => null),
          eventsRes.json().catch(() => null),
          tasksRes.json().catch(() => null),
          inboxRes.json().catch(() => null),
          templatesRes.json().catch(() => null),
          segmentsRes.json().catch(() => null),
        ]) as [
          ApiPayload<EngageSummary>,
          ApiPayload<EngageContact[]>,
          ApiPayload<EngageCampaign[]>,
          ApiPayload<EngageProvider[]>,
          ApiPayload<EngageEvent[]>,
          ApiPayload<EngageTask[]>,
          ApiPayload<{ events?: EngageEvent[]; tasks?: EngageTask[] }>,
          ApiPayload<{ templates?: EngageTemplate[] }>,
          ApiPayload<{ segments?: EngageSegment[] }>,
        ]

        if (!summaryRes.ok || !contactsRes.ok || !campaignsRes.ok || !providersRes.ok || !eventsRes.ok || !tasksRes.ok || !inboxRes.ok || !templatesRes.ok || !segmentsRes.ok) {
          throw new Error('Nao foi possivel carregar os dados do Engage.')
        }

        if (!active) return
        setSummary(summaryData.summary ?? defaultSummary)
        setContacts(contactsData.contacts ?? [])
        setCampaigns(campaignsData.campaigns ?? [])
        setProviders(providersData.providers ?? [])
        setEvents(eventsData.events ?? [])
        setTasks(tasksData.tasks ?? [])
        const inboxPayload = inboxData as { events?: EngageEvent[]; tasks?: EngageTask[] } | null
        const templatesPayload = templatesData as { templates?: EngageTemplate[] } | null
        const segmentsPayload = segmentsData as { segments?: EngageSegment[] } | null
        setInboxEvents(inboxPayload?.events ?? [])
        setInboxTasks(inboxPayload?.tasks ?? [])
        setTemplates(templatesPayload?.templates ?? [])
        setSegments(segmentsPayload?.segments ?? [])
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Nao foi possivel carregar os dados do Engage.')
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
      controller.abort()
    }
  }, [])

  const stats = useMemo(() => [
    { label: 'Contatos prontos', value: summary.contacts_active },
    { label: 'Campanhas ativas', value: summary.campaigns_active },
    { label: 'Respostas hoje', value: summary.replies_today },
    { label: 'Bloqueios', value: summary.opt_outs },
  ], [summary])

  const latestContacts = contacts.slice(0, 5)
  const latestCampaigns = campaigns.slice(0, 5)
  const latestEvents = events.slice(0, 8)
  const latestTasks = tasks.slice(0, 8)
  const latestTemplates = templates.slice(0, 5)
  const latestSegments = segments.slice(0, 5)
  const themeIsDark = document.documentElement.classList.contains('dark')
  const providerConfigPreview = useMemo(() => {
    const preview = {
      base_url: providerForm.base_url,
      api_token: providerForm.api_token,
      instance_name: providerForm.instance_name,
      webhook_url: providerForm.webhook_url,
      webhook_secret: providerForm.webhook_secret,
      account_id: providerForm.account_id,
      app_id: providerForm.app_id,
      app_secret: providerForm.app_secret,
      phone_number_id: providerForm.phone_number_id,
      access_token: providerForm.access_token,
      verify_token: providerForm.verify_token,
      template_namespace: providerForm.template_namespace,
      routing_mode: providerForm.routing_mode,
      delivery_mode: providerForm.delivery_mode,
      daily_limit: providerForm.daily_limit,
      hourly_limit: providerForm.hourly_limit,
      priority: providerForm.priority,
      risk_score: providerForm.risk_score,
      anti_ban_delay_seconds: providerForm.anti_ban_delay_seconds,
    }
    return Object.fromEntries(Object.entries(preview).filter(([, value]) => value !== '' && value !== 0))
  }, [providerForm])

  async function refreshData() {
    const [summaryRes, contactsRes, campaignsRes, providersRes] = await Promise.all([
      fetch(getApiUrl('/engage/summary')),
      fetch(getApiUrl('/engage/contacts')),
      fetch(getApiUrl('/engage/campaigns')),
      fetch(getApiUrl('/engage/providers')),
    ])

    if (!summaryRes.ok || !contactsRes.ok || !campaignsRes.ok || !providersRes.ok) {
      throw new Error('Nao foi possivel atualizar os dados do Engage.')
    }

    const [summaryData, contactsData, campaignsData, providersData] = await Promise.all([
      summaryRes.json(),
      contactsRes.json(),
      campaignsRes.json(),
      providersRes.json(),
    ]) as [
      ApiPayload<EngageSummary>,
      ApiPayload<EngageContact[]>,
      ApiPayload<EngageCampaign[]>,
      ApiPayload<EngageProvider[]>,
    ]

    setSummary(summaryData.summary ?? defaultSummary)
    setContacts(contactsData.contacts ?? [])
    setCampaigns(campaignsData.campaigns ?? [])
    setProviders(providersData.providers ?? [])
  }

  async function submitJson(path: string, payload: Record<string, unknown>, successMessage: string) {
    setSaving(true)
    setActionMessage(null)
    try {
      const response = await fetch(getApiUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null
      if (!response.ok) {
        throw new Error(data?.error ?? 'Nao foi possivel salvar o registro.')
      }
      setActionMessage(successMessage)
      await refreshData()
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Nao foi possivel salvar o registro.')
    } finally {
      setSaving(false)
    }
  }

  async function createProviderFromForm() {
    const config_json = {
      base_url: providerForm.base_url || null,
      api_token: providerForm.api_token || null,
      instance_name: providerForm.instance_name || null,
      webhook_url: providerForm.webhook_url || null,
      webhook_secret: providerForm.webhook_secret || null,
      account_id: providerForm.account_id || null,
      app_id: providerForm.app_id || null,
      app_secret: providerForm.app_secret || null,
      phone_number_id: providerForm.phone_number_id || null,
      access_token: providerForm.access_token || null,
      verify_token: providerForm.verify_token || null,
      template_namespace: providerForm.template_namespace || null,
      routing_mode: providerForm.routing_mode,
      delivery_mode: providerForm.delivery_mode,
      daily_limit: providerForm.daily_limit,
      hourly_limit: providerForm.hourly_limit,
      priority: providerForm.priority,
      risk_score: providerForm.risk_score,
      anti_ban_delay_seconds: providerForm.anti_ban_delay_seconds,
    }

    await submitJson('/engage/providers', {
      key: providerForm.key,
      name: providerForm.name,
      channel: providerForm.channel,
      status: providerForm.status,
      config_json,
    }, 'Provedor criado com sucesso.')
  }

  async function createSenderFromForm() {
    await submitJson('/engage/sender-accounts', {
      provider_id: senderForm.provider_id,
      label: senderForm.label,
      phone_number: senderForm.phone_number || null,
      channel: senderForm.channel,
      daily_limit: senderForm.daily_limit,
      hourly_limit: senderForm.hourly_limit,
      priority: senderForm.priority,
      risk_score: senderForm.risk_score,
    }, 'Sender account criada com sucesso.')
  }

  return (
    <div className="h-full overflow-auto bg-slate-50 text-slate-900 dark:bg-[radial-gradient(circle_at_top,_#27354d_0,_#101724_42%,_#06080f_100%)] dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 dark:border-white/10 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-700/80 dark:text-cyan-300/80">Engage</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 dark:text-white">
              Campanhas, respostas e automações
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Módulo integrado ao AVMD System para operar e-mail, WhatsApp e Instagram com
              múltiplos provedores e múltiplos números.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-900 dark:text-cyan-100">
              segmentar · disparar · responder · converter · medir
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
              aria-label={themeIsDark ? 'Modo claro ativo' : 'Modo escuro ativo'}
            >
              {themeIsDark ? <SunMedium size={16} /> : <MoonStar size={16} />}
              {themeIsDark ? 'Tema escuro' : 'Tema claro'}
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[
            { id: 'resumo', label: 'Resumo', icon: Inbox },
            { id: 'campanhas', label: 'Campanhas', icon: Send },
            { id: 'configuracoes', label: 'Configurações', icon: Settings2 },
            { id: 'fila', label: 'Fila', icon: SlidersHorizontal },
            { id: 'templates', label: 'Templates', icon: Webhook },
          ].map(item => {
            const Icon = item.icon
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as typeof tab)}
                className={[
                  'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-slate-950 text-white dark:bg-white dark:text-slate-950'
                    : 'bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:ring-white/10 dark:hover:bg-white/10',
                ].join(' ')}
              >
                <Icon size={16} />
                {item.label}
              </button>
            )
          })}
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-100">
            {error}
          </div>
        )}
        {actionMessage && (
          <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
            {actionMessage}
          </div>
        )}

        {tab === 'resumo' && (
          <>
            <div className="grid gap-4 py-6 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map(item => (
                <div key={item.label} className="rounded-3xl border border-slate-200 bg-white p-5 backdrop-blur dark:border-white/10 dark:bg-white/5">
                  <p className="text-sm text-slate-600 dark:text-slate-300">{item.label}</p>
                  <p className="mt-3 text-3xl font-semibold text-slate-950 dark:text-white">{loading ? '—' : item.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-slate-950/60 dark:shadow-2xl dark:shadow-cyan-950/40 dark:backdrop-blur-xl">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-cyan-700/70 dark:text-cyan-300/70">Canais</p>
                    <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">Multicanal sem retrabalho</h2>
                  </div>
                  <div className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    {summary.providers_active} provedores ativos
                  </div>
                </div>

                <div className="mt-6 grid gap-3">
                  {[
                    { title: 'E-mail marketing', text: 'Disparo em escala com métricas de entrega, abertura, clique, bounce e descadastro.', icon: Plus },
                    { title: 'WhatsApp oficial', text: 'API da Meta com templates aprovados, respostas rastreáveis e governança por reputação.', icon: Webhook },
                    { title: 'Instagram', text: 'Canal de relacionamento e resposta dentro das permissões oficiais, conectado ao funil.', icon: Inbox },
                  ].map((channel, index) => {
                    const Icon = channel.icon
                    return (
                      <div key={channel.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/8 dark:bg-white/4">
                        <div className="flex items-center justify-between gap-4">
                          <h3 className="font-medium text-slate-950 dark:text-white">{channel.title}</h3>
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-cyan-200">
                            <Icon size={16} />
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{channel.text}</p>
                        <p className="mt-3 text-xs uppercase tracking-[0.24em] text-slate-400">0{index + 1}</p>
                      </div>
                    )
                  })}
                </div>
              </section>

              <section className="grid gap-6">
                <div className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60">
                  <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Roteamento</p>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">
                    Múltiplos números e múltiplos provedores
                  </h2>
                  <div className="mt-5 grid gap-3">
                    {providers.map(item => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                        <p className="text-sm uppercase tracking-[0.24em] text-cyan-700/70 dark:text-cyan-300/70">{item.name}</p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.key} · {item.channel} · {item.status}</p>
                      </div>
                    ))}
                    {!providers.length && !loading && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                        Nenhum provedor cadastrado ainda. A estrutura está pronta para receber Meta, Evolution API e Z-API.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-white/5">
                  <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Fila de disparo</p>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    O backend já expõe a base para campanhas, contatos, provedores e números.
                    A próxima camada conecta templates, envio, webhooks e automações.
                  </p>
                </div>
              </section>
            </div>
          </>
        )}

        {tab === 'campanhas' && (
          <section className="mt-6 grid gap-6 lg:grid-cols-3">
            <article className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/40">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Novo contato</p>
              <div className="mt-4 grid gap-3">
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Nome" value={contactForm.name} onChange={e => setContactForm(v => ({ ...v, name: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" placeholder="E-mail" value={contactForm.email} onChange={e => setContactForm(v => ({ ...v, email: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Telefone" value={contactForm.phone} onChange={e => setContactForm(v => ({ ...v, phone: e.target.value }))} />
                <input type="number" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Score" value={contactForm.score} onChange={e => setContactForm(v => ({ ...v, score: Number(e.target.value || 0) }))} />
                <button type="button" disabled={saving} onClick={() => submitJson('/engage/contacts', { ...contactForm }, 'Contato criado com sucesso.')}
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-slate-950">
                  Criar contato
                </button>
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/40">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Nova campanha</p>
              <div className="mt-4 grid gap-3">
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Nome da campanha" value={campaignForm.name} onChange={e => setCampaignForm(v => ({ ...v, name: e.target.value }))} />
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" value={campaignForm.channel} onChange={e => setCampaignForm(v => ({ ...v, channel: e.target.value }))}>
                  <option value="whatsapp">whatsapp</option>
                  <option value="email">email</option>
                  <option value="instagram">instagram</option>
                </select>
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Agendamento opcional" value={campaignForm.scheduled_at} onChange={e => setCampaignForm(v => ({ ...v, scheduled_at: e.target.value }))} />
                <button type="button" disabled={saving} onClick={() => submitJson('/engage/campaigns', { ...campaignForm, scheduled_at: campaignForm.scheduled_at || null }, 'Campanha criada com sucesso.')}
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-slate-950">
                  Criar campanha
                </button>
              </div>
            </article>

            <article className="rounded-3xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/40">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Resumo operacional</p>
              <ul className="mt-4 grid gap-3 text-sm text-slate-700 dark:text-slate-200">
                <li>Mensagens enviadas: {loading ? '—' : summary.messages_sent}</li>
                <li>Respostas hoje: {loading ? '—' : summary.replies_today}</li>
                <li>Opt-out registrados: {loading ? '—' : summary.opt_outs}</li>
                <li>Sender accounts: {loading ? '—' : summary.sender_accounts_active}</li>
                <li>Tarefas abertas: {loading ? '—' : summary.tasks_open}</li>
                <li>Eventos hoje: {loading ? '—' : summary.events_today}</li>
              </ul>
              <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
                A base já está pronta para expandir para templates, mensagens, webhooks e fila de disparo controlada.
              </p>
            </article>
          </section>
        )}

        {tab === 'fila' && (
          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Enfileirar disparo</p>
              <div className="mt-4 grid gap-3">
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" value={queueForm.campaign_id} onChange={e => setQueueForm(v => ({ ...v, campaign_id: e.target.value }))}>
                  <option value="">Escolha uma campanha</option>
                  {campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                </select>
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" value={queueForm.contact_id} onChange={e => setQueueForm(v => ({ ...v, contact_id: e.target.value }))}>
                  <option value="">Escolha um contato</option>
                  {contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
                </select>
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" value={queueForm.channel} onChange={e => setQueueForm(v => ({ ...v, channel: e.target.value }))}>
                  <option value="whatsapp">whatsapp</option>
                  <option value="email">email</option>
                  <option value="instagram">instagram</option>
                </select>
                <textarea className="min-h-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Texto do disparo" value={queueForm.body} onChange={e => setQueueForm(v => ({ ...v, body: e.target.value }))} />
                <button type="button" disabled={saving} onClick={() => submitJson('/engage/queue', { ...queueForm }, 'Disparo enfileirado com sucesso.')}
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-slate-950">
                  Enfileirar disparo
                </button>
              </div>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Criar tarefa</p>
              <div className="mt-4 grid gap-3">
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Título da tarefa" value={taskForm.title} onChange={e => setTaskForm(v => ({ ...v, title: e.target.value }))} />
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" value={taskForm.type} onChange={e => setTaskForm(v => ({ ...v, type: e.target.value }))}>
                  <option value="followup">followup</option>
                  <option value="manual">manual</option>
                  <option value="call">call</option>
                </select>
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Prazo opcional" value={taskForm.due_at} onChange={e => setTaskForm(v => ({ ...v, due_at: e.target.value }))} />
                <button type="button" disabled={saving} onClick={() => submitJson('/engage/tasks', { ...taskForm, due_at: taskForm.due_at || null }, 'Tarefa criada com sucesso.')}
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-slate-950">
                  Criar tarefa
                </button>
              </div>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Eventos recentes</p>
              <div className="mt-4 space-y-3">
                {latestEvents.map(event => (
                  <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                    <p className="font-medium text-slate-950 dark:text-white">{event.event_type}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{event.created_at}</p>
                  </div>
                ))}
                {!latestEvents.length && !loading && <div className="text-sm text-slate-500 dark:text-slate-400">Nenhum evento registrado.</div>}
              </div>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Tarefas abertas</p>
              <div className="mt-4 space-y-3">
                {latestTasks.map(task => (
                  <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                    <p className="font-medium text-slate-950 dark:text-white">{task.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{task.type} · {task.status} {task.due_at ? `· ${task.due_at}` : ''}</p>
                  </div>
                ))}
                {!latestTasks.length && !loading && <div className="text-sm text-slate-500 dark:text-slate-400">Nenhuma tarefa aberta.</div>}
              </div>
            </article>
          </section>
        )}

        {tab === 'configuracoes' && (
          <section className="mt-6 grid gap-6 xl:grid-cols-3">
            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Webhook do Engage</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">Receber respostas</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                O backend já aceita eventos de entrada em `/api/webhooks/engage`. Isso registra
                mensagem, conversa e tarefa de follow-up quando a resposta chega.
              </p>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                Payload mínimo: `contact_id`, `channel`, `event_type` e `message`.
              </div>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Integrações API</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">Meta, Evolution e Z-API</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                Estes campos cobrem a maior parte das credenciais e rotas que precisamos para operar múltiplos provedores
                com rastreio, fallback e governança de envio.
              </p>
              <div className="mt-5 grid gap-3 text-sm">
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Base URL da API" value={providerForm.base_url} onChange={e => setProviderForm(v => ({ ...v, base_url: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="API token" value={providerForm.api_token} onChange={e => setProviderForm(v => ({ ...v, api_token: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Nome da instância" value={providerForm.instance_name} onChange={e => setProviderForm(v => ({ ...v, instance_name: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Webhook URL" value={providerForm.webhook_url} onChange={e => setProviderForm(v => ({ ...v, webhook_url: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Webhook secret" value={providerForm.webhook_secret} onChange={e => setProviderForm(v => ({ ...v, webhook_secret: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Account ID / WABA ID" value={providerForm.account_id} onChange={e => setProviderForm(v => ({ ...v, account_id: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="App ID" value={providerForm.app_id} onChange={e => setProviderForm(v => ({ ...v, app_id: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="App Secret" value={providerForm.app_secret} onChange={e => setProviderForm(v => ({ ...v, app_secret: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Phone Number ID" value={providerForm.phone_number_id} onChange={e => setProviderForm(v => ({ ...v, phone_number_id: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Access token" value={providerForm.access_token} onChange={e => setProviderForm(v => ({ ...v, access_token: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Verify token" value={providerForm.verify_token} onChange={e => setProviderForm(v => ({ ...v, verify_token: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Template namespace" value={providerForm.template_namespace} onChange={e => setProviderForm(v => ({ ...v, template_namespace: e.target.value }))} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" value={providerForm.routing_mode} onChange={e => setProviderForm(v => ({ ...v, routing_mode: e.target.value }))}>
                    <option value="round_robin">round_robin</option>
                    <option value="priority">priority</option>
                    <option value="weighted">weighted</option>
                    <option value="manual">manual</option>
                  </select>
                  <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" value={providerForm.delivery_mode} onChange={e => setProviderForm(v => ({ ...v, delivery_mode: e.target.value }))}>
                    <option value="official">official</option>
                    <option value="hybrid">hybrid</option>
                    <option value="fallback">fallback</option>
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input type="number" className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Limite diário" value={providerForm.daily_limit} onChange={e => setProviderForm(v => ({ ...v, daily_limit: Number(e.target.value || 0) }))} />
                  <input type="number" className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Limite por hora" value={providerForm.hourly_limit} onChange={e => setProviderForm(v => ({ ...v, hourly_limit: Number(e.target.value || 0) }))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <input type="number" className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Prioridade" value={providerForm.priority} onChange={e => setProviderForm(v => ({ ...v, priority: Number(e.target.value || 0) }))} />
                  <input type="number" className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Risco" value={providerForm.risk_score} onChange={e => setProviderForm(v => ({ ...v, risk_score: Number(e.target.value || 0) }))} />
                  <input type="number" className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Delay anti-ban (s)" value={providerForm.anti_ban_delay_seconds} onChange={e => setProviderForm(v => ({ ...v, anti_ban_delay_seconds: Number(e.target.value || 0) }))} />
                </div>
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" value={providerForm.status} onChange={e => setProviderForm(v => ({ ...v, status: e.target.value }))}>
                  <option value="ativo">ativo</option>
                  <option value="pausado">pausado</option>
                  <option value="manutencao">manutencao</option>
                </select>
                <button type="button" disabled={saving} onClick={createProviderFromForm} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-slate-950">
                  Salvar provedor
                </button>
              </div>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Campos salvos</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">Estrutura pronta para vários provedores</h2>
              <div className="mt-4 space-y-3">
                {providers.slice(0, 5).map(provider => {
                  const config = provider.config_json ?? {}
                  return (
                    <div key={provider.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                      <p className="font-medium text-slate-950 dark:text-white">{provider.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{provider.key} · {provider.channel} · {provider.status}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                        {'base_url' in config && <span>base url</span>}
                        {'api_token' in config && <span>api token</span>}
                        {'webhook_url' in config && <span>webhook</span>}
                        {'instance_name' in config && <span>instância</span>}
                        {'phone_number_id' in config && <span>phone id</span>}
                      </div>
                    </div>
                  )
                })}
                {!providers.length && <div className="text-sm text-slate-500 dark:text-slate-400">Nenhum provedor configurado ainda.</div>}
              </div>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60 lg:col-span-2">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Preview da configuração</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">Payload que vai para o banco</h2>
              <pre className="mt-4 overflow-auto rounded-2xl border border-slate-200 bg-slate-950 p-4 text-xs text-slate-100 dark:border-white/10">
{JSON.stringify(providerConfigPreview, null, 2)}
              </pre>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Sender accounts</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">Múltiplos números por provedor</h2>
              <div className="mt-4 grid gap-3">
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" value={senderForm.provider_id} onChange={e => setSenderForm(v => ({ ...v, provider_id: e.target.value }))}>
                  <option value="">Selecione o provedor</option>
                  {providers.map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                </select>
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Rótulo do número" value={senderForm.label} onChange={e => setSenderForm(v => ({ ...v, label: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Telefone" value={senderForm.phone_number} onChange={e => setSenderForm(v => ({ ...v, phone_number: e.target.value }))} />
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" value={senderForm.channel} onChange={e => setSenderForm(v => ({ ...v, channel: e.target.value }))}>
                  <option value="whatsapp">whatsapp</option>
                  <option value="email">email</option>
                  <option value="instagram">instagram</option>
                </select>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input type="number" className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Limite diário" value={senderForm.daily_limit} onChange={e => setSenderForm(v => ({ ...v, daily_limit: Number(e.target.value || 0) }))} />
                  <input type="number" className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Limite por hora" value={senderForm.hourly_limit} onChange={e => setSenderForm(v => ({ ...v, hourly_limit: Number(e.target.value || 0) }))} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input type="number" className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Prioridade" value={senderForm.priority} onChange={e => setSenderForm(v => ({ ...v, priority: Number(e.target.value || 0) }))} />
                  <input type="number" className="rounded-xl border border-slate-200 bg-white px-3 py-2 outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Risco" value={senderForm.risk_score} onChange={e => setSenderForm(v => ({ ...v, risk_score: Number(e.target.value || 0) }))} />
                </div>
                <button type="button" disabled={saving} onClick={createSenderFromForm} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-slate-950">
                  Salvar sender
                </button>
              </div>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60 lg:col-span-2">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Inbox operacional</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-white">Respostas recentes</h2>
              <div className="mt-4 space-y-3">
                {inboxEvents.slice(0, 5).map(event => (
                  <div key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                    <p className="font-medium text-slate-950 dark:text-white">{event.event_type}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{event.created_at}</p>
                  </div>
                ))}
                {!inboxEvents.length && <div className="text-sm text-slate-500 dark:text-slate-400">Nenhuma resposta registrada ainda.</div>}
              </div>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60 lg:col-span-2">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Tarefas da inbox</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {inboxTasks.slice(0, 6).map(task => (
                  <div key={task.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                    <p className="font-medium text-slate-950 dark:text-white">{task.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{task.type} · {task.status}</p>
                  </div>
                ))}
                {!inboxTasks.length && <div className="text-sm text-slate-500 dark:text-slate-400">Nenhuma tarefa pendente.</div>}
              </div>
            </article>
          </section>
        )}

        {tab === 'templates' && (
          <section className="mt-6 grid gap-6 lg:grid-cols-2">
            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Novo template</p>
              <div className="mt-4 grid gap-3">
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Nome" value={templateForm.name} onChange={e => setTemplateForm(v => ({ ...v, name: e.target.value }))} />
                <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" value={templateForm.channel} onChange={e => setTemplateForm(v => ({ ...v, channel: e.target.value }))}>
                  <option value="whatsapp">whatsapp</option>
                  <option value="email">email</option>
                  <option value="instagram">instagram</option>
                </select>
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Status de aprovação" value={templateForm.approval_status} onChange={e => setTemplateForm(v => ({ ...v, approval_status: e.target.value }))} />
                <textarea className="min-h-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Conteúdo do template" value={templateForm.body} onChange={e => setTemplateForm(v => ({ ...v, body: e.target.value }))} />
                <button type="button" disabled={saving} onClick={() => submitJson('/engage/templates', { ...templateForm }, 'Template criado com sucesso.')}
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-slate-950">
                  Criar template
                </button>
              </div>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Novo segmento</p>
              <div className="mt-4 grid gap-3">
                <input className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Nome do segmento" value={segmentForm.name} onChange={e => setSegmentForm(v => ({ ...v, name: e.target.value }))} />
                <textarea className="min-h-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-white/10 dark:bg-slate-900" placeholder="Descrição / regra" value={segmentForm.description} onChange={e => setSegmentForm(v => ({ ...v, description: e.target.value }))} />
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={segmentForm.is_active} onChange={e => setSegmentForm(v => ({ ...v, is_active: e.target.checked }))} />
                  Segmento ativo
                </label>
                <button type="button" disabled={saving} onClick={() => submitJson('/engage/segments', { ...segmentForm, description: segmentForm.description || null }, 'Segmento criado com sucesso.')}
                  className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-slate-950">
                  Criar segmento
                </button>
              </div>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Templates recentes</p>
              <div className="mt-4 space-y-3">
                {latestTemplates.map(item => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                    <p className="font-medium text-slate-950 dark:text-white">{item.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.channel} · {item.approval_status}</p>
                  </div>
                ))}
                {!latestTemplates.length && <div className="text-sm text-slate-500 dark:text-slate-400">Nenhum template cadastrado.</div>}
              </div>
            </article>

            <article className="rounded-[2rem] border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-slate-950/60">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-700/70 dark:text-cyan-300/70">Segmentos recentes</p>
              <div className="mt-4 space-y-3">
                {latestSegments.map(item => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
                    <p className="font-medium text-slate-950 dark:text-white">{item.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.description ?? 'Sem descrição'} · {item.is_active ? 'ativo' : 'inativo'}</p>
                  </div>
                ))}
                {!latestSegments.length && <div className="text-sm text-slate-500 dark:text-slate-400">Nenhum segmento cadastrado.</div>}
              </div>
            </article>
          </section>
        )}
      </div>
    </div>
  )
}
