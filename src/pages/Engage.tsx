import { useEffect, useMemo, useState } from 'react'
import { getApiUrl } from '@/lib/api'

type EngageSummary = {
  contacts_active: number
  campaigns_active: number
  messages_sent: number
  replies_today: number
  opt_outs: number
  providers_active: number
  sender_accounts_active: number
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
}

export default function Engage() {
  const [summary, setSummary] = useState<EngageSummary>(defaultSummary)
  const [contacts, setContacts] = useState<EngageContact[]>([])
  const [campaigns, setCampaigns] = useState<EngageCampaign[]>([])
  const [providers, setProviders] = useState<EngageProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const controller = new AbortController()

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [summaryRes, contactsRes, campaignsRes, providersRes] = await Promise.all([
          fetch(getApiUrl('/engage/summary'), { signal: controller.signal }),
          fetch(getApiUrl('/engage/contacts'), { signal: controller.signal }),
          fetch(getApiUrl('/engage/campaigns'), { signal: controller.signal }),
          fetch(getApiUrl('/engage/providers'), { signal: controller.signal }),
        ])

        const [summaryData, contactsData, campaignsData, providersData] = await Promise.all([
          summaryRes.json().catch(() => null),
          contactsRes.json().catch(() => null),
          campaignsRes.json().catch(() => null),
          providersRes.json().catch(() => null),
        ]) as [
          ApiPayload<EngageSummary>,
          ApiPayload<EngageContact[]>,
          ApiPayload<EngageCampaign[]>,
          ApiPayload<EngageProvider[]>,
        ]

        if (!summaryRes.ok || !contactsRes.ok || !campaignsRes.ok || !providersRes.ok) {
          throw new Error('Nao foi possivel carregar os dados do Engage.')
        }

        if (!active) return
        setSummary(summaryData.summary ?? defaultSummary)
        setContacts(contactsData.contacts ?? [])
        setCampaigns(campaignsData.campaigns ?? [])
        setProviders(providersData.providers ?? [])
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

  return (
    <div className="h-full overflow-auto bg-[radial-gradient(circle_at_top,_#27354d_0,_#101724_42%,_#06080f_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/80">Engage</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              Campanhas, respostas e automações
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Módulo integrado ao AVMD System para operar e-mail, WhatsApp e Instagram com
              múltiplos provedores e múltiplos números.
            </p>
          </div>
          <div className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
            segmentar · disparar · responder · converter · medir
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="grid gap-4 py-6 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(item => (
            <div key={item.label} className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <p className="text-sm text-slate-300">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold text-white">{loading ? '—' : item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[2rem] border border-white/10 bg-slate-950/60 p-6 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/70">Canais</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Multicanal sem retrabalho</h2>
              </div>
              <div className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-300">
                {summary.providers_active} provedores ativos
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              {[
                { title: 'E-mail marketing', text: 'Disparo em escala com métricas de entrega, abertura, clique, bounce e descadastro.' },
                { title: 'WhatsApp oficial', text: 'API da Meta com templates aprovados, respostas rastreáveis e governança por reputação.' },
                { title: 'Instagram', text: 'Canal de relacionamento e resposta dentro das permissões oficiais, conectado ao funil.' },
              ].map((channel, index) => (
                <div key={channel.title} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-medium text-white">{channel.title}</h3>
                    <span className="text-sm text-cyan-200">0{index + 1}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{channel.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-6">
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/60 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Roteamento</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                Múltiplos números e múltiplos provedores
              </h2>
              <div className="mt-5 grid gap-3">
                {providers.map(item => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/70">{item.name}</p>
                    <p className="mt-1 text-xs text-slate-400">{item.key} · {item.channel} · {item.status}</p>
                  </div>
                ))}
                {!providers.length && !loading && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    Nenhum provedor cadastrado ainda. A estrutura está pronta para receber Meta, Evolution API e Z-API.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Fila de disparo</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                O backend já expõe a base para campanhas, contatos, provedores e números.
                A próxima camada conecta templates, envio, webhooks e automações.
              </p>
            </div>
          </section>
        </div>

        <section className="mt-6 grid gap-6 border-t border-white/10 py-8 lg:grid-cols-3">
          <article className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Contatos</p>
            <div className="mt-4 space-y-3">
              {latestContacts.map(contact => (
                <div key={contact.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium text-white">{contact.name}</h3>
                    <span className="text-xs text-cyan-200">{contact.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{contact.phone ?? 'sem telefone'} · score {contact.score}</p>
                </div>
              ))}
              {!latestContacts.length && !loading && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  Nenhum contato cadastrado ainda.
                </div>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Campanhas</p>
            <div className="mt-4 space-y-3">
              {latestCampaigns.map(campaign => (
                <div key={campaign.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium text-white">{campaign.name}</h3>
                    <span className="text-xs text-cyan-200">{campaign.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{campaign.channel} · {campaign.scheduled_at ? `agendada ${campaign.scheduled_at}` : 'envio livre'}</p>
                </div>
              ))}
              {!latestCampaigns.length && !loading && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                  Nenhuma campanha criada ainda.
                </div>
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Resumo operacional</p>
            <ul className="mt-4 grid gap-3 text-sm text-slate-200">
              <li>Mensagens enviadas: {loading ? '—' : summary.messages_sent}</li>
              <li>Respostas hoje: {loading ? '—' : summary.replies_today}</li>
              <li>Opt-out registrados: {loading ? '—' : summary.opt_outs}</li>
              <li>Sender accounts: {loading ? '—' : summary.sender_accounts_active}</li>
            </ul>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              A base já está pronta para expandir para templates, mensagens, webhooks e fila de
              disparo controlada.
            </p>
          </article>
        </section>
      </div>
    </div>
  )
}
