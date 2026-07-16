import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CreditCard, ExternalLink, Loader2, MessageCircle, Package, Phone, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { getApiUrl } from '@/lib/api'
import { DEFAULT_AGENCY_CONFIG, fetchAgencyConfig } from '@/lib/agencyConfig'
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

function paymentLabel(order: PortalOrder) {
  if (order.pago) return 'Pagamento confirmado'
  if (order.payment_charge_status) return `Pagamento: ${order.payment_charge_status}`
  return 'Pagamento aguardando confirmacao'
}

function orderLabel(order: PortalOrder) {
  return order.tipo_produto || 'Certificado digital'
}

export default function PortalCliente() {
  const { user, profile } = useAuth()
  const [agencyConfig, setAgencyConfig] = useState(DEFAULT_AGENCY_CONFIG)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [orders, setOrders] = useState<PortalOrder[]>([])
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleSubmitting, setScheduleSubmitting] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<PortalOrder | null>(null)
  const [scheduleContext, setScheduleContext] = useState<ScheduleContextResponse>({ agentes: [], pontos: [], slots: [] })

  async function loadOrders() {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(getApiUrl('/portal/overview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email }),
      })
      const data = await response.json().catch(() => null) as { ok?: boolean; error?: string; pedidos?: PortalOrder[] } | null
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Nao foi possivel carregar seus pedidos.')
      setOrders(data.pedidos ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar o portal do cliente.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadOrders()
  }, [user?.id])

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
    if (!user) return
    setScheduleLoading(true)
    setError(null)
    setSelectedOrder(order)
    try {
      const response = await fetch(getApiUrl('/portal/schedule-context'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email, saleId: order.id }),
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
      setError(err instanceof Error ? err.message : 'Falha ao carregar os horarios.')
    } finally {
      setScheduleLoading(false)
    }
  }

  async function confirmSchedule(slotKey: string) {
    if (!user || !selectedOrder) return
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
          userId: user.id,
          email: user.email,
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
      setError(err instanceof Error ? err.message : 'Falha ao salvar o agendamento.')
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

  if (!profile) {
    return <div className="p-6 text-sm text-slate-500">Carregando perfil do cliente...</div>
  }

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f8fbff_0%,#eef4ff_100%)] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ea7b18]">Portal do cliente</p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900">Acompanhe seus pedidos e agendamentos</h1>
              <p className="mt-2 text-sm text-slate-600">{profile.nome}, aqui voce consegue acompanhar pagamento, protocolo e reservar sua videoconferencia.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard icon={Package} label="Pedidos" value={String(orders.length)} />
              <SummaryCard icon={CreditCard} label="Pagos" value={String(orders.filter(order => order.pago).length)} />
              <SummaryCard icon={CalendarDays} label="Agendados" value={String(orders.filter(order => order.data_agendada).length)} />
              <SummaryCard icon={MessageCircle} label="Contato" value="Empresa" />
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ea7b18]">Acesso rápido</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">Fale com a CertiID</h2>
              <p className="mt-1 text-sm text-slate-600">
                Aqui você consegue revisar o pedido, conferir a forma de pagamento, agendar ou reagendar a validação e chamar a equipe quando precisar.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={agencyConfig.telefone ? `https://wa.me/${agencyConfig.telefone.replace(/\D/g, '')}` : '#'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl bg-[#17346b] px-4 py-3 text-sm font-semibold text-white hover:bg-[#102654]"
              >
                <Phone size={15} />
                WhatsApp da empresa
              </a>
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
