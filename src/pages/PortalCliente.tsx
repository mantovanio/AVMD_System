import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CalendarDays, CreditCard, ExternalLink, Loader2, MessageCircle, Package, ShieldCheck } from 'lucide-react'
import { getApiUrl } from '@/lib/api'
import { DEFAULT_AGENCY_CONFIG, fetchAgencyConfig, type AgencyConfig } from '@/lib/agencyConfig'
import { SchedulingModal, formatCurrency, formatDateTime } from '@/components/checkout'
import type { AgendaAgent, AgendaPoint, AgendaSlot } from '@/lib/checkout'

type PortalOrder = {
  id: string
  created_at: string
  status_venda: string | null
  pago: boolean
  valor_venda: number | null
  tipo_produto: string | null
  pedido_status: string | null
  protocolo_status: string | null
  protocolo_numero: string | null
  payment_charge_status: string | null
  agendamento_id: string | null
  data_agendada: string | null
  status_agendamento: string | null
  agente_nome: string | null
  ponto_nome: string | null
}

type ScheduleContextResponse = {
  agentes: AgendaAgent[]
  pontos: AgendaPoint[]
  slots: AgendaSlot[]
}

function isInvalidPortalSession(message: string) {
  return /sess[aã]o do portal inv[aá]lida ou expirada/i.test(message)
}

function paymentLabel(order: PortalOrder) {
  if (order.pago) return 'Pagamento confirmado'
  if (order.payment_charge_status) return `Pagamento: ${order.payment_charge_status}`
  return 'Pagamento aguardando confirmacao'
}

function orderLabel(order: PortalOrder) {
  return order.tipo_produto || 'Certificado digital'
}

function orderGuidance(order: PortalOrder) {
  const label = (order.tipo_produto ?? '').toLowerCase()
  if (label.includes('e-cnpj')) return 'Confira se o pedido é para pessoa jurídica e valide a classe antes de concluir.'
  if (label.includes('e-cpf')) return 'Confira se o pedido é para pessoa física e confirme a validade antes de concluir.'
  return 'Revise o tipo, a classe e a validade do certificado antes de seguir.'
}

function buildWhatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, '')
  const normalized = digits.startsWith('55') ? digits : `55${digits}`
  const text = encodeURIComponent('Olá, vim pelo portal Minhas Compras da CertiID e preciso de atendimento.')
  return normalized.length > 4 ? `https://wa.me/${normalized}?text=${text}` : 'https://certiid.com.br/#contato'
}

function ensureSecurePortalUrl() {
  if (typeof window === 'undefined') return true
  if (window.location.hostname !== 'portal.certiid.com.br') return true
  if (window.location.protocol === 'https:') return true

  window.location.replace(`https://portal.certiid.com.br${window.location.pathname}${window.location.search}${window.location.hash}`)
  return false
}

function formatPortalError(err: unknown, fallback: string) {
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return 'Falha de conexão com a API. Recarregue o portal usando https://portal.certiid.com.br e tente novamente.'
  }
  return err instanceof Error ? err.message : fallback
}

export default function PortalCliente() {
  if (!ensureSecurePortalUrl()) return null

  const [agencyConfig, setAgencyConfig] = useState(DEFAULT_AGENCY_CONFIG)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [orders, setOrders] = useState<PortalOrder[]>([])
  const [portalEmail, setPortalEmail] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [portalToken, setPortalToken] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [requestedEmail, setRequestedEmail] = useState('')
  const [maskedPhones, setMaskedPhones] = useState<string[]>([])
  const [requestStep, setRequestStep] = useState<'email' | 'code' | 'portal'>('email')
  const [requestLoading, setRequestLoading] = useState(false)
  const [emailLoading, setEmailLoading] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<PortalOrder | null>(null)
  const [scheduleContext, setScheduleContext] = useState<ScheduleContextResponse>({ agentes: [], pontos: [], slots: [] })

  useEffect(() => {
    const savedToken = window.localStorage.getItem('avmd_portal_token') ?? ''
    const savedEmail = window.localStorage.getItem('avmd_portal_email') ?? ''
    if (savedToken) setPortalToken(savedToken)
    if (savedEmail) {
      setPortalEmail(savedEmail)
      setEmailInput(savedEmail)
    }
  }, [])

  async function loadOrders(tokenOverride?: string) {
    const token = (tokenOverride ?? portalToken).trim()
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(getApiUrl('/portal/overview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string; pedidos?: PortalOrder[] } | null
      if (!response.ok || !data?.ok) {
        const message = data?.error || 'Nao foi possivel carregar seus pedidos.'
        if (response.status === 401 && isInvalidPortalSession(message)) {
          window.localStorage.removeItem('avmd_portal_token')
          setPortalToken('')
          setOrders([])
          setRequestStep('email')
          setSuccess(null)
          setCodeInput('')
          setRequestedEmail('')
          setError('Sua sessão anterior expirou. Solicite um novo código para acessar suas compras.')
          return
        }
        throw new Error(message)
      }
      setOrders(data.pedidos ?? [])
    } catch (err) {
      setError(formatPortalError(err, 'Falha ao carregar o portal do cliente.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (portalToken) void loadOrders(portalToken)
  }, [portalToken])

  useEffect(() => {
    let active = true
    async function loadAgency() {
      const { data } = await fetchAgencyConfig()
      if (active) setAgencyConfig(data)
    }
    void loadAgency()
    return () => { active = false }
  }, [])

  async function openSchedule(order: PortalOrder) {
    if (!portalToken) return
    setScheduleLoading(true)
    setError(null)
    setSelectedOrder(order)
    try {
      const response = await fetch(getApiUrl('/portal/schedule-context'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: portalToken, saleId: order.id }),
      })
      const data = await response.json().catch(() => null) as ({ ok?: boolean; error?: string } & Partial<ScheduleContextResponse>) | null
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Nao foi possivel carregar os horarios.')
      setScheduleContext({
        agentes: data.agentes ?? [],
        pontos: data.pontos ?? [],
        slots: data.slots ?? [],
      })
      setScheduleOpen(true)
    } catch (err) {
      setError(formatPortalError(err, 'Falha ao carregar os horarios.'))
    } finally {
      setScheduleLoading(false)
    }
  }

  async function confirmSchedule(slotKey: string) {
    if (!selectedOrder || !portalToken) return
    const slot = scheduleContext.slots.find(item => `${item.agente_registro_id}|${item.ponto_atendimento_id}|${item.inicio}` === slotKey)
    if (!slot) return

    setScheduleSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(getApiUrl('/portal/schedule'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: portalToken,
          saleId: selectedOrder.id,
          agente_registro_id: slot.agente_registro_id,
          ponto_atendimento_id: slot.ponto_atendimento_id,
          data_agendada: slot.inicio,
        }),
      })
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Nao foi possivel salvar o agendamento.')
      setScheduleOpen(false)
      setSuccess('Agendamento salvo com sucesso. Seu pedido ja aparece atualizado abaixo.')
      await loadOrders()
    } catch (err) {
      setError(formatPortalError(err, 'Falha ao salvar o agendamento.'))
    } finally {
      setScheduleSubmitting(false)
    }
  }

  const pointOptionsForAgent = useMemo(() => {
    return (agentId: string) => {
      const ids = new Set(
        scheduleContext.slots
          .filter(slot => slot.agente_registro_id === agentId)
          .map(slot => slot.ponto_atendimento_id)
      )
      return scheduleContext.pontos.filter(point => ids.has(point.id))
    }
  }, [scheduleContext.pontos, scheduleContext.slots])

  async function requestPortalCode(email: string) {
    const normalized = email.trim().toLowerCase()
    if (!normalized) {
      setError('Informe o e-mail usado na compra.')
      return
    }

    setRequestLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(getApiUrl('/portal/auth/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized }),
      })
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string; maskedPhones?: string[] } | null
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Nao foi possivel enviar o código.')
      window.localStorage.setItem('avmd_portal_email', normalized)
      setPortalEmail(normalized)
      setEmailInput(normalized)
      setRequestedEmail(normalized)
      setMaskedPhones(Array.isArray(data.maskedPhones) ? data.maskedPhones : [])
      setCodeInput('')
      setRequestStep('code')
      setSuccess('Enviamos um novo código para o e-mail e WhatsApp cadastrados. Use sempre a mensagem mais recente da CertiID.')
    } catch (err) {
      setError(formatPortalError(err, 'Nao foi possivel enviar o código.'))
    } finally {
      setRequestLoading(false)
    }
  }

  if (!portalToken) {
    return (
      <PortalShell agencyConfig={agencyConfig}>
        <section className="grid min-h-[620px] overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_24px_80px_-50px_rgba(23,52,107,0.45)] lg:grid-cols-[1fr_0.92fr]">
          <div className="relative hidden bg-[#f7f8fb] p-8 lg:block">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(248,132,20,0.22),transparent_26%),linear-gradient(135deg,rgba(23,52,107,0.08)_0%,rgba(255,255,255,0)_62%)]" />
            <div className="pointer-events-none absolute -bottom-8 left-8 text-[96px] font-black leading-none text-slate-200/70">
              certificado
            </div>
            <div className="relative flex h-full flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#fff2e5] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#f88414]">
                  <ShieldCheck size={14} />
                  Portal oficial
                </div>
                <h1 className="mt-8 max-w-md text-5xl font-black leading-none text-[#17346b]">
                  Rápido como você precisa.
                </h1>
                <p className="mt-4 max-w-sm text-xl font-bold text-[#17346b]">
                  Compre, valide e acompanhe.
                </p>
                <p className="mt-5 max-w-sm text-sm leading-6 text-slate-600">
                  Acesse suas compras, confira pagamento, protocolo e agendamento pelo canal oficial CertiID.
                </p>
              </div>

              <div className="grid gap-3">
                <TrustStrip icon={ShieldCheck} title="Acesso validado por e-mail" text="O código é enviado somente para o endereço usado na compra." />
                <TrustStrip icon={CalendarDays} title="Agendamento centralizado" text="Acompanhe ou reagende sua validação em poucos passos." />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center bg-[linear-gradient(180deg,#ffffff_0%,#f4f7fb_100%)] p-5 sm:p-8">
            <div className="w-full max-w-xl">
              <div className="mb-7 flex items-center gap-4 lg:hidden">
                <img src="/logo-certiid.png" alt="CertiID certificado digital" className="h-28 w-auto" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f88414]">Portal oficial</p>
                  <p className="text-sm text-slate-600">Minhas compras CertiID</p>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-xl shadow-slate-900/10 sm:p-7">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f88414]">Minhas compras</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  {requestStep === 'code' ? 'Digite o código enviado' : 'Acesse pelo e-mail da compra'}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Use o mesmo e-mail informado na compra para receber o código e acessar seus pedidos com segurança.
                </p>

                <form
                  className="mt-6 space-y-4"
                  onSubmit={async e => {
              e.preventDefault()
              if (requestStep === 'email') {
                await requestPortalCode(emailInput)
                return
              }

              const normalized = requestedEmail || emailInput.trim().toLowerCase()
              const code = codeInput.replace(/\D/g, '').slice(0, 6)
              if (!normalized) {
                setError('E-mail inválido.')
                return
              }
              if (code.length !== 6) {
                setError('Informe o código de 6 dígitos.')
                return
              }
              setEmailLoading(true)
              setError(null)
              try {
                const response = await fetch(getApiUrl('/portal/auth/verify'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: normalized, code }),
                })
                const data = await response.json().catch(() => null) as { ok?: boolean; error?: string; token?: string } | null
                if (!response.ok || !data?.ok || !data.token) throw new Error(data?.error || 'Nao foi possivel validar o código.')
                window.localStorage.setItem('avmd_portal_token', data.token)
                setPortalToken(data.token)
                await loadOrders(data.token)
                setRequestStep('portal')
              } catch (err) {
                setError(formatPortalError(err, 'Nao foi possivel validar o código.'))
              } finally {
                setEmailLoading(false)
              }
            }}
                >
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">E-mail</label>
                    <input
                      type="email"
                      value={emailInput}
                      onChange={e => setEmailInput(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-[#17346b] focus:bg-white focus:ring-2 focus:ring-[#17346b]/15 disabled:bg-slate-100"
                      autoComplete="email"
                      disabled={requestStep === 'code'}
                    />
                  </div>
                  {requestStep === 'code' && (
                    <div>
                      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Código</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={codeInput}
                        onChange={e => setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-lg font-semibold tracking-[0.35em] text-slate-950 outline-none transition focus:border-[#17346b] focus:ring-2 focus:ring-[#17346b]/15"
                        autoComplete="one-time-code"
                        maxLength={6}
                      />
                      <p className="mt-2 text-xs text-slate-500">
                        Enviamos o código para {requestedEmail || emailInput.trim().toLowerCase()}
                        {maskedPhones.length ? ` e para o WhatsApp cadastrado ${maskedPhones.join(', ')}.` : ' e para o WhatsApp cadastrado na compra, quando houver telefone disponível.'}
                        {' '}Use sempre a mensagem mais recente com o texto "Portal Minhas Compras".
                      </p>
                      <button
                        type="button"
                        onClick={() => void requestPortalCode(requestedEmail || emailInput)}
                        disabled={requestLoading || emailLoading}
                        className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-[#f88414]/35 bg-[#fff8f1] px-4 py-3 text-sm font-bold text-[#d96500] transition hover:bg-[#fff0df] disabled:opacity-60"
                      >
                        {requestLoading ? (
                          <>
                            <Loader2 size={15} className="mr-2 animate-spin" />
                            Enviando novo código...
                          </>
                        ) : 'Enviar novo código'}
                      </button>
                    </div>
                  )}
                  {success && requestStep === 'code' && <MessageCard tone="success" message={success} />}
                  {error && <MessageCard tone="error" message={error} />}
                  <button
                    type="submit"
                    disabled={emailLoading || requestLoading}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-[#17346b] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#17346b]/25 transition hover:bg-[#102654] disabled:opacity-60"
                  >
                    {requestStep === 'email' ? (requestLoading ? (
                      <>
                        <Loader2 size={15} className="mr-2 animate-spin" />
                        Enviando código...
                      </>
                    ) : 'Receber código') : (emailLoading ? (
                      <>
                        <Loader2 size={15} className="mr-2 animate-spin" />
                        Validando código...
                      </>
                    ) : 'Entrar no portal')}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </section>
      </PortalShell>
    )
  }

  return (
    <PortalShell agencyConfig={agencyConfig}>
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-[18px] border border-slate-200 bg-white p-6 shadow-[0_24px_70px_-54px_rgba(23,52,107,0.5)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f88414]">Portal oficial CertiID</p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900">Minhas compras</h1>
              <p className="mt-2 text-sm text-slate-600">Aqui voce consegue acompanhar pagamento, protocolo e reservar sua videoconferencia.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard icon={Package} label="Pedidos" value={String(orders.length)} />
              <SummaryCard icon={CreditCard} label="Pagos" value={String(orders.filter(order => order.pago).length)} />
              <SummaryCard icon={CalendarDays} label="Agendados" value={String(orders.filter(order => order.data_agendada).length)} />
              <SummaryCard icon={MessageCircle} label="Contato" value="Empresa" />
            </div>
          </div>
        </section>

        <section className="rounded-[18px] border border-[#ffd7b4] bg-[#fff8f1] p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ea7b18]">Acesso rápido</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Fale com a CertiID</h2>
              <p className="mt-1 text-sm text-slate-600">
                Aqui você consegue revisar o pedido, conferir a forma de pagamento e agendar ou reagendar a validação. Para atendimento imediato, use o botão oficial no topo da página.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="mailto:contato@certiid.com.br"
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink size={15} />
                Enviar e-mail
              </a>
            </div>
          </div>
        </section>

        {error && <MessageCard tone="error" message={error} />}
        {success && <MessageCard tone="success" message={success} />}

        <section className="space-y-4">
          {loading ? (
            <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
              <Loader2 size={18} className="mx-auto animate-spin" />
              <p className="mt-3 text-sm">Carregando seus pedidos...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center text-slate-500 shadow-sm">
              <ShieldCheck size={24} className="mx-auto text-slate-400" />
              <p className="mt-3 text-sm">Assim que a compra for concluida, seus pedidos aparecerao aqui automaticamente.</p>
            </div>
          ) : orders.map(order => (
            <article key={order.id} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{orderLabel(order)}</p>
                    <p className="mt-1 text-xs text-slate-500">Compra em {formatDateTime(order.created_at)}</p>
                    <p className="mt-2 text-sm text-slate-600">{orderGuidance(order)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Badge text={paymentLabel(order)} tone={order.pago ? 'success' : 'warning'} />
                    <Badge text={`Status da venda: ${order.status_venda ?? 'pendente'}`} tone="neutral" />
                    <Badge text={`Protocolo: ${order.protocolo_numero ?? 'aguardando geracao'}`} tone="neutral" />
                  </div>
                </div>
                <div className="text-left xl:text-right">
                  <p className="text-2xl font-semibold text-emerald-600">{formatCurrency(Number(order.valor_venda ?? 0))}</p>
                  <p className="mt-1 text-xs text-slate-500">Pedido #{order.id.slice(0, 8)}</p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <InfoCard title="Pagamento" text={paymentLabel(order)} />
                <InfoCard title="Protocolo" text={order.protocolo_numero ?? 'Assim que o processamento avancar, o numero aparecera aqui.'} />
                <InfoCard
                  title="Videoconferencia"
                  text={order.data_agendada
                    ? `${formatDateTime(order.data_agendada)} com ${order.agente_nome ?? 'agente'} em ${order.ponto_nome ?? 'ponto de atendimento'}`
                    : 'Voce ainda pode reservar seu horario de validacao.'}
                />
              </div>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void openSchedule(order)}
                  disabled={(scheduleLoading && selectedOrder?.id === order.id) || scheduleSubmitting}
                  className="inline-flex items-center justify-center rounded-2xl bg-[#17346b] px-4 py-3 text-sm font-semibold text-white hover:bg-[#102654] disabled:opacity-60"
                >
                  {scheduleLoading && selectedOrder?.id === order.id ? (
                    <><Loader2 size={15} className="mr-2 animate-spin" />Carregando horarios...</>
                  ) : order.data_agendada ? 'Reagendar videoconferencia' : 'Agendar videoconferencia'}
                </button>
                <button
                  type="button"
                  onClick={() => void loadOrders()}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Atualizar pedido
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>

      <SchedulingModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        onConfirm={slotKey => { void confirmSchedule(slotKey) }}
        onSkip={() => setScheduleOpen(false)}
        agentOptions={scheduleContext.agentes}
        pointOptionsForAgent={pointOptionsForAgent}
        slots={scheduleContext.slots}
      />
    </PortalShell>
  )
}

function PortalShell({ children, agencyConfig }: { children: ReactNode; agencyConfig: AgencyConfig }) {
  const whatsappUrl = buildWhatsappUrl(agencyConfig.telefone)

  return (
    <main className="min-h-screen bg-white text-slate-950">
      <div className="min-h-screen bg-[radial-gradient(circle_at_8%_18%,rgba(23,52,107,0.06),transparent_24%),radial-gradient(circle_at_88%_10%,rgba(248,132,20,0.10),transparent_22%),linear-gradient(180deg,#ffffff_0%,#ffffff_48%,#f4f6fa_100%)]">
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
          <div className="mx-auto flex min-h-28 max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <a href="https://certiid.com.br" className="inline-flex h-20 w-44 shrink-0 items-center overflow-visible" aria-label="Ir para o site da CertiID">
              <img src="/logo-certiid.png" alt="CertiID certificado digital" className="h-full w-full origin-left scale-[2.15] object-contain" />
            </a>
            <nav className="hidden items-center gap-6 text-xs font-bold uppercase tracking-[0.08em] text-slate-700 lg:flex">
              <a href="https://certiid.com.br/#loja" className="transition hover:text-[#f88414]">Loja de certificados</a>
              <a href="https://certiid.com.br/#renovacao" className="transition hover:text-[#f88414]">Renovação</a>
              <a href="https://certiid.com.br/#contato" className="transition hover:text-[#f88414]">Contato</a>
              <span className="text-[#17346b]">Minhas compras</span>
            </nav>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#f88414] px-4 py-2.5 text-xs font-black uppercase tracking-[0.04em] text-white shadow-lg shadow-orange-500/20 transition hover:bg-[#e87512]"
            >
              <MessageCircle size={15} />
              Fale conosco
            </a>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </div>
    </main>
  )
}

function TrustStrip({ icon: Icon, title, text }: { icon: typeof ShieldCheck; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f88414] text-white">
          <Icon size={18} />
        </div>
        <div>
          <p className="text-sm font-bold text-[#17346b]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{text}</p>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[#17346b] shadow-sm">
          <Icon size={18} />
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-900">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  )
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-700">{text}</p>
    </div>
  )
}

function Badge({ text, tone }: { text: string; tone: 'success' | 'warning' | 'neutral' }) {
  const cls = tone === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-slate-200 bg-slate-50 text-slate-600'

  return <span className={`rounded-full border px-3 py-1.5 ${cls}`}>{text}</span>
}

function MessageCard({ tone, message }: { tone: 'success' | 'error'; message: string }) {
  const cls = tone === 'success'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-red-200 bg-red-50 text-red-700'

  return <div className={`rounded-[24px] border px-4 py-4 text-sm shadow-sm ${cls}`}>{message}</div>
}
