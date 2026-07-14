import { useEffect, useMemo, useRef, useState } from 'react'
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react'
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Search,
  Store,
  UserRound,
  Wallet,
} from 'lucide-react'
import { buscarCep } from '@/lib/cep'
import { buscarCnpj } from '@/lib/cnpj'
import { cn } from '@/lib/utils'
import type { LojaMarketplace, TabelaPreco } from '@/types'
import { loadMarketplaceCheckoutContext, lookupExistingCheckoutCustomer, submitMarketplaceCheckout, type AgendaAgent, type AgendaPoint, type AgendaSlot, type LojaItemRow, type PaymentOption, type PaymentRuntime } from '@/lib/checkout'
import {
  GuidedField,
  ChoiceCard,
  formatDateTime,
  InfoLine,
  InfoMini,
  ProductCard,
  ProductHero,
  ProductTags,
  SectionCard,
  WarningCard,
  CheckoutHeader,
  OrderSummary,
  SchedulingModal,
  formatCurrency,
  formatCpfCnpj,
  formatPhone,
  formatCep,
  onlyDigits,
} from '@/components/checkout'
type LojaMarketplaceConfig = {
  modo_exibicao?: 'vitrine' | 'link_direto'
  item_fixo_id?: string | null
}

type CheckoutBuyerType = 'pessoa_fisica' | 'pessoa_juridica'
type ProductAudience = 'todos' | 'pessoa_fisica' | 'pessoa_juridica' | 'acessorios'

type FormState = {
  comprador: {
    tipo: CheckoutBuyerType
    nome: string
    nome_fantasia: string
    responsavel_nome: string
    cpf_cnpj: string
    email: string
    telefone: string
    cep: string
    logradouro: string
    numero: string
    complemento: string
    bairro: string
    cidade: string
    uf: string
  }
  titular: {
    nome: string
    cpf: string
    data_nascimento: string
    email: string
    telefone: string
  }
  titularMesmoFaturamento: boolean
  acesso: {
    senha: string
    confirmar_senha: string
  }
  forma_pagamento_id: string
  observacoes: string
}

type SectionStatus = {
  label: string
  done: boolean
  icon: typeof Building2
}

const INITIAL_FORM: FormState = {
  comprador: {
    tipo: 'pessoa_juridica',
    nome: '',
    nome_fantasia: '',
    responsavel_nome: '',
    cpf_cnpj: '',
    email: '',
    telefone: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
  },
  titular: {
    nome: '',
    cpf: '',
    data_nascimento: '',
    email: '',
    telefone: '',
  },
  titularMesmoFaturamento: true,
  acesso: {
    senha: '',
    confirmar_senha: '',
  },
  forma_pagamento_id: '',
  observacoes: '',
}

function normalizeLojaConfig(configuracoes: Record<string, unknown> | null | undefined): Required<LojaMarketplaceConfig> {
  const modo = configuracoes?.modo_exibicao === 'link_direto' ? 'link_direto' : 'vitrine'
  const itemFixo = typeof configuracoes?.item_fixo_id === 'string' ? configuracoes.item_fixo_id : ''
  return { modo_exibicao: modo, item_fixo_id: itemFixo }
}

function resolveInitialItemId(items: LojaItemRow[], lojaData: LojaMarketplace | null) {
  if (!lojaData) return ''
  const searchParams = new URLSearchParams(window.location.search)
  const produtoParam = searchParams.get('produto') ?? ''
  const config = normalizeLojaConfig(lojaData.configuracoes)
  const idsValidos = new Set(items.map(item => item.id))
  if (produtoParam && idsValidos.has(produtoParam)) return produtoParam
  if (config.item_fixo_id && idsValidos.has(config.item_fixo_id)) return config.item_fixo_id
  return ''
}

function buildSlotKey(slot: AgendaSlot | null | undefined) {
  if (!slot) return ''
  return `${slot.agente_registro_id}|${slot.ponto_atendimento_id}|${slot.inicio}`
}

function labelEmissao(tipo: string | null | undefined): string | null {
  if (!tipo) return null
  if (/online|video|vídeo|fast|remot/i.test(tipo)) return 'Fast'
  return tipo
}

function inferTipoPessoa(doc: string): CheckoutBuyerType {
  return onlyDigits(doc).length > 11 ? 'pessoa_juridica' : 'pessoa_fisica'
}

function resolveTitularEfetivo(form: FormState) {
  const comprador = form.comprador
  const isPf = comprador.tipo === 'pessoa_fisica'
  if (!form.titularMesmoFaturamento) return form.titular
  return {
    nome: isPf ? comprador.nome : comprador.responsavel_nome,
    cpf: isPf ? comprador.cpf_cnpj : form.titular.cpf,
    data_nascimento: form.titular.data_nascimento,
    email: isPf ? comprador.email : (form.titular.email || comprador.email),
    telefone: isPf ? comprador.telefone : (form.titular.telefone || comprador.telefone),
  }
}

function requiredFieldOrder(form: FormState) {
  const ids = [
    'comprador.cpf_cnpj',
    ...(form.comprador.tipo === 'pessoa_juridica' ? ['comprador.responsavel_nome'] : []),
    'comprador.nome',
    'comprador.email',
    'comprador.telefone',
    'acesso.senha',
    'acesso.confirmar_senha',
    'comprador.cep',
    'comprador.logradouro',
    'comprador.numero',
    'comprador.bairro',
    'comprador.uf',
    'comprador.cidade',
  ]

  if (form.titularMesmoFaturamento) {
    if (form.comprador.tipo === 'pessoa_juridica') ids.push('titular.cpf')
  } else {
    ids.push('titular.nome', 'titular.cpf')
  }

  ids.push('forma_pagamento_id')
  return ids
}

function getValueByFieldId(form: FormState, id: string, titularEfetivo: ReturnType<typeof resolveTitularEfetivo>) {
  switch (id) {
    case 'comprador.cpf_cnpj': return form.comprador.cpf_cnpj
    case 'comprador.responsavel_nome': return form.comprador.responsavel_nome
    case 'comprador.nome': return form.comprador.nome
    case 'comprador.email': return form.comprador.email
    case 'comprador.telefone': return form.comprador.telefone
    case 'acesso.senha': return form.acesso.senha
    case 'acesso.confirmar_senha': return form.acesso.confirmar_senha
    case 'comprador.cep': return form.comprador.cep
    case 'comprador.logradouro': return form.comprador.logradouro
    case 'comprador.numero': return form.comprador.numero
    case 'comprador.bairro': return form.comprador.bairro
    case 'comprador.uf': return form.comprador.uf
    case 'comprador.cidade': return form.comprador.cidade
    case 'titular.nome': return titularEfetivo.nome
    case 'titular.cpf': return titularEfetivo.cpf
    case 'forma_pagamento_id': return form.forma_pagamento_id
    default: return ''
  }
}

function validateForm(form: FormState, itemSelecionado: LojaItemRow | null) {
  const errors: Record<string, string> = {}
  const titularEfetivo = resolveTitularEfetivo(form)
  const docDigits = onlyDigits(form.comprador.cpf_cnpj)
  const titularCpfDigits = onlyDigits(titularEfetivo.cpf)
  const phoneDigits = onlyDigits(form.comprador.telefone)
  const cepDigits = onlyDigits(form.comprador.cep)

  if (!itemSelecionado) errors['produto'] = 'Selecione um produto para continuar.'
  if (![11, 14].includes(docDigits.length)) errors['comprador.cpf_cnpj'] = 'Informe um CPF ou CNPJ válido.'
  if (form.comprador.tipo === 'pessoa_juridica' && !form.comprador.responsavel_nome.trim()) {
    errors['comprador.responsavel_nome'] = 'Informe o nome do responsável.'
  }
  if (!form.comprador.nome.trim()) errors['comprador.nome'] = form.comprador.tipo === 'pessoa_juridica' ? 'Informe a razão social.' : 'Informe o nome completo.'
  if (!form.comprador.email.trim()) errors['comprador.email'] = 'Informe o e-mail.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.comprador.email.trim())) errors['comprador.email'] = 'Informe um e-mail válido.'
  if (phoneDigits.length < 10) errors['comprador.telefone'] = 'Informe um telefone com WhatsApp válido.'
  if (!form.acesso.senha.trim()) errors['acesso.senha'] = 'Crie uma senha para o portal do cliente.'
  else if (form.acesso.senha.trim().length < 8) errors['acesso.senha'] = 'A senha precisa ter pelo menos 8 caracteres.'
  if (!form.acesso.confirmar_senha.trim()) errors['acesso.confirmar_senha'] = 'Confirme a senha de acesso.'
  else if (form.acesso.senha !== form.acesso.confirmar_senha) errors['acesso.confirmar_senha'] = 'As senhas informadas não conferem.'
  if (cepDigits.length !== 8) errors['comprador.cep'] = 'Informe um CEP válido.'
  if (!form.comprador.logradouro.trim()) errors['comprador.logradouro'] = 'Informe o endereço.'
  if (!form.comprador.numero.trim()) errors['comprador.numero'] = 'Informe o número.'
  if (!form.comprador.bairro.trim()) errors['comprador.bairro'] = 'Informe o bairro.'
  if (!form.comprador.uf.trim()) errors['comprador.uf'] = 'Informe o estado.'
  if (!form.comprador.cidade.trim()) errors['comprador.cidade'] = 'Informe a cidade.'

  if (!form.titularMesmoFaturamento && !titularEfetivo.nome.trim()) {
    errors['titular.nome'] = 'Informe o nome do titular do certificado.'
  }
  if (titularCpfDigits.length !== 11) errors['titular.cpf'] = 'Informe o CPF do titular.'
  if (!form.forma_pagamento_id) errors['forma_pagamento_id'] = 'Escolha a forma de pagamento.'

  return errors
}

function statusPagamentoLabel(option: PaymentOption) {
  const nome = option.nome.toLowerCase()
  if (nome.includes('pix')) return 'Compensação geralmente mais rápida'
  if (nome.includes('boleto')) return 'Liberação após compensação bancária'
  if (nome.includes('cart')) return 'Aprovação conforme operadora'
  return 'A validação só é liberada após a confirmação'
}

function productAudience(item: LojaItemRow): Exclude<ProductAudience, 'todos'> {
  const text = `${item.certificados?.tipo ?? ''} ${item.certificados?.descricao_produto ?? ''}`.toLowerCase()
  if (/token|cart[aã]o|leitora|valida[cç][aã]o domiciliar/.test(text) && !/e-cpf|e-pf|e-cnpj|e-pj|safeid/.test(text)) return 'acessorios'
  if (/e-cnpj|e-pj|cnpj/.test(text)) return 'pessoa_juridica'
  return 'pessoa_fisica'
}

function normalizedSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export default function MarketplaceLoja({ slug }: { slug?: string | null }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loja, setLoja] = useState<LojaMarketplace | null>(null)
  const [tabela, setTabela] = useState<TabelaPreco | null>(null)
  const [itens, setItens] = useState<LojaItemRow[]>([])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [productAudienceFilter, setProductAudienceFilter] = useState<ProductAudience>('todos')
  const [productEmissionFilter, setProductEmissionFilter] = useState('todos')
  const [pagamentos, setPagamentos] = useState<PaymentOption[]>([])
  const [agendaAgents, setAgendaAgents] = useState<AgendaAgent[]>([])
  const [agendaPoints, setAgendaPoints] = useState<AgendaPoint[]>([])
  const [paymentRuntime, setPaymentRuntime] = useState<PaymentRuntime>({
    modo_teste_geral: false,
    bloquear_integracoes_reais: false,
    aviso_checkout: 'O atendimento será liberado após a confirmação do pagamento.',
  })
  const [slots, setSlots] = useState<AgendaSlot[]>([])
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [focusedField, setFocusedField] = useState<string | null>(null)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutSuccess, setCheckoutSuccess] = useState<string | null>(null)
  const [paymentDetails, setPaymentDetails] = useState<NonNullable<import('@/lib/checkoutContract').CheckoutSubmitResponse['payment_details']> | null>(null)
  const [isSchedulingOpen, setIsSchedulingOpen] = useState(false)
  const [selectedSlotKey, setSelectedSlotKey] = useState('')
  const [draftSlotKey, setDraftSlotKey] = useState('')
  const [draftAgentId, setDraftAgentId] = useState('')
  const [draftPointId, setDraftPointId] = useState('')
  const [selectedDay, setSelectedDay] = useState('')
  const [draftDay, setDraftDay] = useState('')
  const [cepLoading, setCepLoading] = useState(false)
  const [cadastroLoading, setCadastroLoading] = useState(false)
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const formStartRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let active = true

    async function fetchLoja() {
      setLoading(true)
      setError(null)

      try {
        const context = await loadMarketplaceCheckoutContext(slug)
        if (!active) return

        const produtosAtivos = context.produtos.filter(item => item.certificados ? item.certificados.ativo : true)
        const initialItemId = resolveInitialItemId(produtosAtivos, context.loja)
        const firstDay = (context.slots[0]?.inicio ?? '').slice(0, 10)

        setLoja(context.loja)
        setTabela(context.tabela)
        setItens(context.produtos)
        setSelectedItemId(initialItemId)
        setPagamentos(context.pagamentos)
        setAgendaAgents(context.agentes)
        setAgendaPoints(context.pontos)
        setPaymentRuntime(context.paymentRuntime)
        setSlots(context.slots)
        setSelectedDay(firstDay)
        setDraftDay(firstDay)
        setLoading(false)
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Falha ao carregar o checkout publico.')
        setLoading(false)
      }
    }

    void fetchLoja()
    return () => { active = false }
  }, [slug])

  useEffect(() => {
    if (!isSchedulingOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [isSchedulingOpen])

  const produtosAtivos = useMemo(
    () => itens.filter(item => item.certificados ? item.certificados.ativo : true),
    [itens]
  )

  const productEmissionOptions = useMemo(() => {
    const labels = produtosAtivos.map(item => labelEmissao(item.certificados?.tipo_emissao_padrao)).filter((value): value is string => Boolean(value))
    return Array.from(new Set(labels)).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [produtosAtivos])

  const filteredProducts = useMemo(() => {
    const query = normalizedSearch(productSearch)
    return produtosAtivos.filter(item => {
      if (productAudienceFilter !== 'todos' && productAudience(item) !== productAudienceFilter) return false
      const emission = labelEmissao(item.certificados?.tipo_emissao_padrao) ?? ''
      if (productEmissionFilter !== 'todos' && emission !== productEmissionFilter) return false
      if (!query) return true
      return normalizedSearch([item.certificados?.tipo, item.certificados?.descricao_produto, item.certificados?.modelo, item.certificados?.validade, item.certificados?.periodo_uso].filter(Boolean).join(' ')).includes(query)
    })
  }, [productAudienceFilter, productEmissionFilter, productSearch, produtosAtivos])

  const lojaConfig = useMemo(
    () => normalizeLojaConfig(loja?.configuracoes),
    [loja]
  )

  const modoLinkDireto = lojaConfig.modo_exibicao === 'link_direto'

  const itemSelecionado = useMemo(
    () => produtosAtivos.find(item => item.id === selectedItemId) ?? null,
    [produtosAtivos, selectedItemId]
  )
  const pagamentoSelecionado = useMemo(
    () => pagamentos.find(item => item.id === form.forma_pagamento_id) ?? null,
    [form.forma_pagamento_id, pagamentos]
  )
  const isMercadoPagoCard = pagamentoSelecionado?.gateway === 'mercado_pago'
    && /card|cart/i.test(`${pagamentoSelecionado.codigo ?? ''} ${pagamentoSelecionado.tipo ?? ''} ${pagamentoSelecionado.nome}`)

  useEffect(() => {
    if (isMercadoPagoCard && pagamentoSelecionado?.public_key) {
      initMercadoPago(pagamentoSelecionado.public_key, { locale: 'pt-BR' })
    }
  }, [isMercadoPagoCard, pagamentoSelecionado?.public_key])

  useEffect(() => {
    if (!loja) return
    const proximoId = resolveInitialItemId(produtosAtivos, loja)
    if (proximoId && proximoId !== selectedItemId) {
      setSelectedItemId(proximoId)
      return
    }
    if (!proximoId && selectedItemId) setSelectedItemId('')
  }, [loja, produtosAtivos, selectedItemId])

  const titularEfetivo = useMemo(
    () => resolveTitularEfetivo(form),
    [form]
  )

  const agentOptions = useMemo(() => {
    const fallbackMap = new Map<string, string>()
    for (const slot of slots) {
      if (!fallbackMap.has(slot.agente_registro_id)) fallbackMap.set(slot.agente_registro_id, slot.agente_nome)
    }
    const merged = agendaAgents.length
      ? agendaAgents.map(agent => ({ id: agent.id, nome: agent.nome }))
      : Array.from(fallbackMap.entries()).map(([id, nome]) => ({ id, nome }))
    return merged.filter(agent => slots.some(slot => slot.agente_registro_id === agent.id))
  }, [agendaAgents, slots])

  const pointOptionsForDraftAgent = useMemo(() => {
    if (!draftAgentId) return [] as AgendaPoint[]

    const pointIds = Array.from(new Set(
      slots
        .filter(slot => slot.agente_registro_id === draftAgentId)
        .map(slot => slot.ponto_atendimento_id)
    ))

    const fallbackMap = new Map<string, string>()
    for (const slot of slots) {
      if (slot.agente_registro_id !== draftAgentId) continue
      if (!fallbackMap.has(slot.ponto_atendimento_id)) fallbackMap.set(slot.ponto_atendimento_id, slot.ponto_nome)
    }

    const merged = agendaPoints.length
      ? agendaPoints
          .filter(point => pointIds.includes(point.id))
          .map(point => ({ id: point.id, nome: point.nome }))
      : Array.from(fallbackMap.entries()).map(([id, nome]) => ({ id, nome }))

    return merged
  }, [agendaPoints, draftAgentId, slots])

  const filteredSlots = useMemo(() => {
    if (!draftAgentId || !draftPointId) return [] as AgendaSlot[]
    return slots.filter(slot =>
      slot.agente_registro_id === draftAgentId
      && slot.ponto_atendimento_id === draftPointId
    )
  }, [draftAgentId, draftPointId, slots])

  const slotsByDay = useMemo(() => {
    const grouped = new Map<string, AgendaSlot[]>()
    for (const slot of filteredSlots) {
      const day = slot.inicio.slice(0, 10)
      const list = grouped.get(day) ?? []
      list.push(slot)
      grouped.set(day, list)
    }
    return Array.from(grouped.entries()).map(([day, daySlots]) => ({
      day,
      slots: daySlots.sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime()),
    }))
  }, [filteredSlots])

  useEffect(() => {
    if (slotsByDay.length === 0) {
      setSelectedDay('')
      setDraftDay('')
      return
    }
    const firstDay = slotsByDay[0]?.day ?? ''
    if (!selectedDay || !slotsByDay.some(item => item.day === selectedDay)) setSelectedDay(firstDay)
    if (!draftDay || !slotsByDay.some(item => item.day === draftDay)) setDraftDay(firstDay)
  }, [draftDay, selectedDay, slotsByDay])

  const selectedSlot = useMemo(
    () => slots.find(slot => buildSlotKey(slot) === selectedSlotKey) ?? null,
    [selectedSlotKey, slots]
  )

  const draftSlots = useMemo(
    () => slotsByDay.find(item => item.day === draftDay)?.slots ?? [],
    [draftDay, slotsByDay]
  )

  const draftSelectedSlot = useMemo(
    () => slots.find(slot => buildSlotKey(slot) === draftSlotKey) ?? null,
    [draftSlotKey, slots]
  )

  useEffect(() => {
    if (!isSchedulingOpen) return
    if (draftSlotKey && !filteredSlots.some(slot => buildSlotKey(slot) === draftSlotKey)) {
      setDraftSlotKey('')
    }
  }, [draftSlotKey, filteredSlots, isSchedulingOpen])

  useEffect(() => {
    if (!isSchedulingOpen) return

    const hasSelectedAgent = draftAgentId && agentOptions.some(agent => agent.id === draftAgentId)
    if (!hasSelectedAgent) {
      const nextAgentId = selectedSlot?.agente_registro_id ?? agentOptions[0]?.id ?? ''
      if (nextAgentId && nextAgentId !== draftAgentId) {
        setDraftAgentId(nextAgentId)
      }
    }
  }, [agentOptions, draftAgentId, isSchedulingOpen, selectedSlot])

  useEffect(() => {
    if (!isSchedulingOpen || !draftAgentId) return
    const pointStillValid = draftPointId && pointOptionsForDraftAgent.some(point => point.id === draftPointId)
    if (!pointStillValid) {
      const nextPointId = selectedSlot?.agente_registro_id === draftAgentId
        ? selectedSlot?.ponto_atendimento_id ?? ''
        : ''
      const fallbackPointId = pointOptionsForDraftAgent[0]?.id ?? ''
      const resolved = pointOptionsForDraftAgent.some(point => point.id === nextPointId) ? nextPointId : fallbackPointId
      if (resolved !== draftPointId) setDraftPointId(resolved)
    }
  }, [draftAgentId, draftPointId, isSchedulingOpen, pointOptionsForDraftAgent, selectedSlot])

  const nextFieldId = useMemo(() => {
    if (focusedField) return focusedField
    for (const id of requiredFieldOrder(form)) {
      if (!String(getValueByFieldId(form, id, titularEfetivo) ?? '').trim()) return id
    }
    return null
  }, [focusedField, form, titularEfetivo])

  const faturamentoDone = useMemo(() => (
    !requiredFieldOrder(form)
      .filter(id => id.startsWith('comprador.'))
      .some(id => !String(getValueByFieldId(form, id, titularEfetivo) ?? '').trim())
  ), [form, titularEfetivo])

  const titularDone = useMemo(() => {
    if (form.titularMesmoFaturamento && form.comprador.tipo === 'pessoa_fisica') {
      return onlyDigits(form.comprador.cpf_cnpj).length === 11 && !!form.comprador.nome.trim()
    }
    const required = form.titularMesmoFaturamento
      ? ['titular.cpf']
      : ['titular.nome', 'titular.cpf']
    return !required.some(id => !String(getValueByFieldId(form, id, titularEfetivo) ?? '').trim())
  }, [form, titularEfetivo])

  const pagamentoDone = !!form.forma_pagamento_id
  const agendamentoDone = !!selectedSlot

  const sectionStatuses: SectionStatus[] = [
    { label: '1. Produto', done: !!itemSelecionado, icon: Store },
    { label: 'Faturamento', done: faturamentoDone, icon: Building2 },
    { label: 'Titular', done: titularDone, icon: UserRound },
    { label: 'Pagamento', done: pagamentoDone, icon: CreditCard },
    { label: 'Agendamento', done: agendamentoDone, icon: CalendarDays },
  ]

  const canShowFaturamento = !!itemSelecionado
  const canShowTitular = canShowFaturamento && faturamentoDone
  const canShowPagamento = canShowTitular && titularDone
  const canShowAgendamento = canShowPagamento && pagamentoDone
  const canShowAvisos = canShowPagamento

  function updateComprador<K extends keyof FormState['comprador']>(key: K, value: FormState['comprador'][K]) {
    setForm(prev => ({
      ...prev,
      comprador: {
        ...prev.comprador,
        [key]: value,
      },
    }))
    if (fieldErrors[`comprador.${String(key)}`]) {
      setFieldErrors(prev => {
        const next = { ...prev }
        delete next[`comprador.${String(key)}`]
        return next
      })
    }
  }

  function updateTitular<K extends keyof FormState['titular']>(key: K, value: FormState['titular'][K]) {
    setForm(prev => ({
      ...prev,
      titular: {
        ...prev.titular,
        [key]: value,
      },
    }))
    if (fieldErrors[`titular.${String(key)}`]) {
      setFieldErrors(prev => {
        const next = { ...prev }
        delete next[`titular.${String(key)}`]
        return next
      })
    }
  }

  async function reaproveitarCadastroExistente(documento: string) {
    const digits = onlyDigits(documento)
    if (![11, 14].includes(digits.length)) return false

    setCadastroLoading(true)
    const data = await lookupExistingCheckoutCustomer(digits)
    setCadastroLoading(false)

    if (!data) return false

    const telefoneFormatado = data.telefone ? formatPhone(data.telefone) : ''
    const cepFormatado = data.cep ? formatCep(data.cep) : ''
    const tipoCliente = data.tipo_cliente ?? inferTipoPessoa(digits)

    setForm(prev => ({
      ...prev,
      comprador: {
        ...prev.comprador,
        tipo: tipoCliente,
        cpf_cnpj: formatCpfCnpj(data.cpf_cnpj || digits),
        nome: data.nome || '',
        nome_fantasia: data.nome_fantasia || '',
        email: data.email || '',
        telefone: telefoneFormatado,
        cep: cepFormatado,
        logradouro: data.logradouro || '',
        numero: data.numero || '',
        complemento: data.complemento || '',
        bairro: data.bairro || '',
        cidade: data.cidade || '',
        uf: (data.uf || '').toUpperCase(),
      },
      titular: tipoCliente === 'pessoa_fisica' && prev.titularMesmoFaturamento
        ? {
            ...prev.titular,
            nome: data.nome || prev.titular.nome,
            cpf: formatCpfCnpj(data.cpf_cnpj || digits),
            email: data.email || prev.titular.email,
            telefone: telefoneFormatado || prev.titular.telefone,
          }
        : prev.titular,
    }))

    setFieldErrors(prev => {
      const next = { ...prev }
      delete next['comprador.cpf_cnpj']
      delete next['comprador.nome']
      delete next['comprador.email']
      delete next['comprador.telefone']
      delete next['comprador.cep']
      delete next['comprador.logradouro']
      delete next['comprador.numero']
      delete next['comprador.bairro']
      delete next['comprador.cidade']
      if (tipoCliente === 'pessoa_fisica') delete next['titular.cpf']
      return next
    })

    return true
  }

  async function handleCepBlur() {
    const cep = onlyDigits(form.comprador.cep)
    if (cep.length !== 8) return
    setCepLoading(true)
    const result = await buscarCep(cep)
    setCepLoading(false)
    if (!result) return
    setForm(prev => ({
      ...prev,
      comprador: {
        ...prev.comprador,
        logradouro: prev.comprador.logradouro || result.logradouro,
        bairro: prev.comprador.bairro || result.bairro,
        cidade: prev.comprador.cidade || result.localidade,
        uf: prev.comprador.uf || result.uf,
      },
    }))
  }

  async function handleCnpjBlur(cnpjValue?: string) {
    const cnpj = onlyDigits(cnpjValue ?? form.comprador.cpf_cnpj)
    if (cnpj.length !== 14) return

    setCnpjLoading(true)
    const result = await buscarCnpj(cnpj)
    setCnpjLoading(false)
    if (!result) return

    setForm(prev => ({
      ...prev,
      comprador: {
        ...prev.comprador,
        nome: prev.comprador.nome || result.razao_social,
        nome_fantasia: prev.comprador.nome_fantasia || result.nome_fantasia || '',
        cep: prev.comprador.cep || formatCep(result.cep ?? ''),
        logradouro: prev.comprador.logradouro || result.logradouro || '',
        numero: prev.comprador.numero || result.numero || '',
        complemento: prev.comprador.complemento || result.complemento || '',
        bairro: prev.comprador.bairro || result.bairro || '',
        cidade: prev.comprador.cidade || result.municipio || '',
        uf: prev.comprador.uf || (result.uf ?? '').toUpperCase(),
      },
    }))
  }

  async function handleDocumentoBlur() {
    const documento = onlyDigits(form.comprador.cpf_cnpj)
    if (![11, 14].includes(documento.length)) return

    const inferred = inferTipoPessoa(documento)
    if (inferred !== form.comprador.tipo) {
      setForm(prev => ({ ...prev, comprador: { ...prev.comprador, tipo: inferred } }))
    }

    await reaproveitarCadastroExistente(documento)

    if (inferred === 'pessoa_juridica') {
      await handleCnpjBlur(documento)
    }
  }

  function handleSelectProduct(itemId: string) {
    setSelectedItemId(itemId)
    requestAnimationFrame(() => {
      formStartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function openSchedulingModal() {
    setDraftSlotKey(selectedSlotKey)
    setDraftAgentId(selectedSlot?.agente_registro_id ?? agentOptions[0]?.id ?? '')
    setDraftPointId(selectedSlot?.ponto_atendimento_id ?? '')
    setDraftDay(selectedSlot?.inicio.slice(0, 10) ?? selectedDay)
    setIsSchedulingOpen(true)
  }

  function confirmScheduling() {
    setSelectedSlotKey(draftSlotKey)
    if (draftSelectedSlot) setSelectedDay(draftSelectedSlot.inicio.slice(0, 10))
    setIsSchedulingOpen(false)
  }

  function clearScheduling() {
    setDraftSlotKey('')
    setSelectedSlotKey('')
    setDraftAgentId(selectedSlot?.agente_registro_id ?? agentOptions[0]?.id ?? '')
    setDraftPointId(selectedSlot?.ponto_atendimento_id ?? '')
    setIsSchedulingOpen(false)
  }

  async function iniciarCheckout(card?: {
    token: string
    payment_method_id: string
    payment_type_id: 'credit_card' | 'debit_card'
    installments: number
    identification_type: string
    identification_number: string
  }) {
    const errors = validateForm(form, itemSelecionado)
    setFieldErrors(errors)
    setError(null)
    setCheckoutSuccess(null)
    setPaymentDetails(null)

    if (Object.keys(errors).length > 0) {
      const firstFieldId = Object.keys(errors)[0]
      if (firstFieldId) {
        requestAnimationFrame(() => {
          document.querySelector<HTMLElement>(`[data-field-anchor="${firstFieldId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      }
      setError('Revise os campos destacados para concluir a compra.')
      return
    }

    if (!itemSelecionado) {
      setError('Selecione um produto para continuar.')
      return
    }

    setCheckoutLoading(true)

    try {
      const result = await submitMarketplaceCheckout({
        slug: slug ?? null,
        item_id: itemSelecionado.id,
        comprador: {
          nome: form.comprador.nome,
          nome_fantasia: form.comprador.nome_fantasia,
          responsavel_nome: form.comprador.responsavel_nome,
          cpf_cnpj: onlyDigits(form.comprador.cpf_cnpj),
          email: form.comprador.email.trim(),
          telefone: onlyDigits(form.comprador.telefone),
        },
        fiscal: {
          cep: onlyDigits(form.comprador.cep),
          logradouro: form.comprador.logradouro,
          numero: form.comprador.numero,
          complemento: form.comprador.complemento,
          bairro: form.comprador.bairro,
          cidade: form.comprador.cidade,
          uf: form.comprador.uf.toUpperCase(),
        },
        titular: {
          nome: titularEfetivo.nome,
          cpf: onlyDigits(titularEfetivo.cpf),
          data_nascimento: form.titular.data_nascimento || null,
          email: titularEfetivo.email,
          telefone: onlyDigits(titularEfetivo.telefone),
        },
        pagamento: {
          forma_pagamento_id: form.forma_pagamento_id,
          card: card ?? null,
        },
        acesso: {
          senha: form.acesso.senha,
        },
        agendamento: selectedSlot ? {
          agente_registro_id: selectedSlot.agente_registro_id,
          ponto_atendimento_id: selectedSlot.ponto_atendimento_id,
          data_agendada: selectedSlot.inicio,
        } : null,
        observacoes: form.observacoes.trim() || null,
      })

      const mensagens = [result.message, result.access_message].filter(Boolean)
      setCheckoutSuccess(mensagens.join(' ') || 'Compra concluída com sucesso.')
      setPaymentDetails(result.payment_details ?? null)
      if (result.redirect_url) {
        window.open(result.redirect_url, '_blank', 'noopener,noreferrer')
      }
      setFieldErrors({})
      if (!result.payment_details || result.payment_details.kind === 'card' || result.payment_details.kind === 'link') {
        setForm({
          ...INITIAL_FORM,
          comprador: {
            ...INITIAL_FORM.comprador,
            tipo: form.comprador.tipo,
          },
        })
      }
      setSelectedSlotKey('')
      setDraftSlotKey('')
      setSelectedDay(slotsByDay[0]?.day ?? '')
      setDraftDay(slotsByDay[0]?.day ?? '')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro inesperado ao concluir a compra.'
      setError(message)
    } finally {
      setCheckoutLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f6f8fc_0%,#ffffff_42%,#eef4ff_100%)] flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 size={28} className="animate-spin text-[#ea7b18] mx-auto" />
          <p className="text-sm text-slate-500 mt-3">Carregando o link de compra...</p>
        </div>
      </div>
    )
  }

  if (error && !loja) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f6f8fc_0%,#ffffff_42%,#eef4ff_100%)] flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-[30px] border border-slate-200 bg-white p-8 shadow-sm text-center">
          <p className="text-lg font-semibold text-slate-800">Link indisponível</p>
          <p className="text-sm text-slate-500 mt-2">{error}</p>
        </div>
      </div>
    )
  }

  if (!loja || !tabela) return null

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f6f8fc_0%,#ffffff_42%,#edf3fb_100%)] text-slate-900 pb-28 lg:pb-10">
      <CheckoutHeader lojaNome={loja.nome_loja} paymentRuntime={paymentRuntime} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_340px] gap-6 items-start">
          <div className="space-y-6">
            <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-[#ea7b18] font-semibold">Solicitação online</p>
                  <h2 className="text-lg font-semibold mt-1 leading-snug text-slate-900">
                    Solicitação de certificado digital
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sectionStatuses.map(section => (
                    <div key={section.label}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border',
                        section.done
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-slate-50 border-slate-200 text-slate-500'
                      )}>
                      {section.done
                        ? <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                        : <section.icon size={12} className="text-[#17346b] shrink-0" />}
                      {section.label}
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500 ease-out"
                  style={{ width: `${(sectionStatuses.filter(s => s.done).length / sectionStatuses.length) * 100}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400 font-medium">
                {sectionStatuses.filter(s => s.done).length} de {sectionStatuses.length} etapas concluídas
              </p>
            </div>

            <SectionCard
              title={modoLinkDireto ? 'Produto selecionado para este link' : 'Escolha o certificado ideal'}
              description={modoLinkDireto
                ? 'Este link já está direcionado para um produto específico. Revise os detalhes e siga para o preenchimento.'
                : 'Selecione o certificado e avance no formulário. O resumo da compra acompanha tudo em tempo real.'}
              icon={Store}
            >
              {produtosAtivos.length === 0 ? (
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-500">
                  Esta loja ainda não possui produtos ativos nesta tabela.
                </div>
              ) : modoLinkDireto && itemSelecionado ? (
                <ProductHero item={itemSelecionado} />
              ) : (
                <div className="space-y-5">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
                    <p className="text-sm font-semibold text-slate-800">Qual certificado você precisa?</p>
                    <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar produtos por perfil">
                      {([['todos', 'Todos'], ['pessoa_fisica', 'Pessoa Física'], ['pessoa_juridica', 'Pessoa Jurídica'], ['acessorios', 'Mídias e serviços']] as const).map(([value, label]) => (
                        <button key={value} type="button" onClick={() => setProductAudienceFilter(value)} className={cn('rounded-full border px-4 py-2 text-sm font-semibold transition-colors', productAudienceFilter === value ? 'border-[#17346b] bg-[#17346b] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300')}>{label}</button>
                      ))}
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
                      <label className="relative block">
                        <span className="sr-only">Buscar produto</span>
                        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={productSearch} onChange={event => setProductSearch(event.target.value)} placeholder="Buscar e-CPF, e-CNPJ, SafeID..." className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-[#17346b] focus:ring-2 focus:ring-sky-100" />
                      </label>
                      <label>
                        <span className="sr-only">Tipo de atendimento</span>
                        <select value={productEmissionFilter} onChange={event => setProductEmissionFilter(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-[#17346b] focus:ring-2 focus:ring-sky-100">
                          <option value="todos">Todos os atendimentos</option>
                          {productEmissionOptions.map(option => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-slate-500"><strong className="text-slate-800">{filteredProducts.length}</strong> {filteredProducts.length === 1 ? 'opção encontrada' : 'opções encontradas'}</p>
                    {(productSearch || productAudienceFilter !== 'todos' || productEmissionFilter !== 'todos') && <button type="button" onClick={() => { setProductSearch(''); setProductAudienceFilter('todos'); setProductEmissionFilter('todos') }} className="text-sm font-semibold text-[#17346b] hover:underline">Limpar filtros</button>}
                  </div>
                  {filteredProducts.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredProducts.map(item => <ProductCard key={item.id} item={item} selected={selectedItemId === item.id} onSelect={handleSelectProduct} />)}
                    </div>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><p className="font-semibold text-slate-800">Nenhum produto encontrado</p><p className="mt-1 text-sm text-slate-500">Altere os filtros ou faça uma nova busca.</p></div>
                  )}
                </div>
              )}
            </SectionCard>

            {canShowFaturamento && (
            <div
              ref={formStartRef}
              className="space-y-6"
            >
            <div className="rounded-[24px] border border-sky-200 bg-sky-50/80 p-4 mb-2">
              <p className="text-sm font-semibold text-sky-900">Entenda as etapas da sua compra</p>
              <ul className="mt-2 space-y-1.5 text-sm text-sky-800">
                <li className="flex items-start gap-2">
                  <span className="font-bold shrink-0">1.</span>
                  <span><strong className="text-sky-950">Faturamento:</strong> quem vai pagar e receber a nota fiscal</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold shrink-0">2.</span>
                  <span><strong className="text-sky-950">Titular do certificado:</strong> quem vai receber e usar o certificado digital</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold shrink-0">3.</span>
                  <span>Se a mesma pessoa for pagar e usar o certificado, é só marcar a opção na etapa do titular</span>
                </li>
              </ul>
            </div>

            <SectionCard
              title="Dados do faturamento"
              description="Preencha os dados de quem vai pagar e receber a nota fiscal. Se for pessoa jurídica, o certificado sempre será emitido para uma pessoa física como titular."
              icon={Building2}
              highlight={nextFieldId?.startsWith('comprador.')}
              done={faturamentoDone}
            >
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ChoiceCard
                    label="Pessoa Jurídica"
                    helper="Minha empresa vai pagar. O certificado será emitido para um responsável (pessoa física)."
                    active={form.comprador.tipo === 'pessoa_juridica'}
                    onClick={() => setForm(prev => ({
                      ...prev,
                      comprador: {
                        ...prev.comprador,
                        tipo: 'pessoa_juridica',
                      },
                    }))}
                  />
                  <ChoiceCard
                    label="Pessoa Física"
                    helper="Vou pagar como pessoa física. O certificado pode ser no meu nome ou de outra pessoa."
                    active={form.comprador.tipo === 'pessoa_fisica'}
                    onClick={() => setForm(prev => ({
                      ...prev,
                      comprador: {
                        ...prev.comprador,
                        tipo: 'pessoa_fisica',
                      },
                    }))}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <GuidedField
                    id="comprador.cpf_cnpj"
                    label={form.comprador.tipo === 'pessoa_juridica' ? 'CNPJ *' : 'CPF *'}
                    value={form.comprador.cpf_cnpj}
                    onChange={value => updateComprador('cpf_cnpj', formatCpfCnpj(value))}
                    onBlur={handleDocumentoBlur}
                    helper={form.comprador.tipo === 'pessoa_juridica'
                      ? 'Se este CNPJ já existir no sistema, os dados anteriores serão reaproveitados antes da consulta pública da Receita.'
                      : 'Se este CPF já existir no sistema, seus dados anteriores serão carregados automaticamente.'}
                    error={fieldErrors['comprador.cpf_cnpj']}
                    focused={focusedField === 'comprador.cpf_cnpj'}
                    highlight={nextFieldId === 'comprador.cpf_cnpj'}
                    onFocus={() => setFocusedField('comprador.cpf_cnpj')}
                    onBlurField={() => setFocusedField(null)}
                    loading={cadastroLoading || cnpjLoading}
                    loadingLabel={cadastroLoading ? 'Buscando cadastro' : 'Consultando Receita'}
                  />

                  {form.comprador.tipo === 'pessoa_juridica' ? (
                    <GuidedField
                      id="comprador.responsavel_nome"
                      label="Nome do responsável *"
                      value={form.comprador.responsavel_nome}
                      onChange={value => updateComprador('responsavel_nome', value)}
                      helper="Informe quem vai acompanhar esta compra e receber nosso contato."
                      error={fieldErrors['comprador.responsavel_nome']}
                      focused={focusedField === 'comprador.responsavel_nome'}
                      highlight={nextFieldId === 'comprador.responsavel_nome'}
                      onFocus={() => setFocusedField('comprador.responsavel_nome')}
                      onBlurField={() => setFocusedField(null)}
                    />
                  ) : (
                    <GuidedField
                      id="comprador.nome"
                      label="Nome completo *"
                      value={form.comprador.nome}
                      onChange={value => updateComprador('nome', value)}
                      helper="Este nome será usado no faturamento."
                      error={fieldErrors['comprador.nome']}
                      focused={focusedField === 'comprador.nome'}
                      highlight={nextFieldId === 'comprador.nome'}
                      onFocus={() => setFocusedField('comprador.nome')}
                      onBlurField={() => setFocusedField(null)}
                    />
                  )}

                  {form.comprador.tipo === 'pessoa_juridica' && (
                    <>
                      <GuidedField
                        id="comprador.nome"
                        label="Razão social *"
                        value={form.comprador.nome}
                        onChange={value => updateComprador('nome', value)}
                        helper="Este nome será usado no faturamento e na nota fiscal."
                        error={fieldErrors['comprador.nome']}
                        focused={focusedField === 'comprador.nome'}
                        highlight={nextFieldId === 'comprador.nome'}
                        onFocus={() => setFocusedField('comprador.nome')}
                        onBlurField={() => setFocusedField(null)}
                      />
                      <GuidedField
                        id="comprador.nome_fantasia"
                        label="Nome fantasia"
                        value={form.comprador.nome_fantasia}
                        onChange={value => updateComprador('nome_fantasia', value)}
                        helper="Se quiser, informe o nome fantasia para facilitar a identificação."
                        focused={focusedField === 'comprador.nome_fantasia'}
                        onFocus={() => setFocusedField('comprador.nome_fantasia')}
                        onBlurField={() => setFocusedField(null)}
                      />
                    </>
                  )}

                  <GuidedField
                    id="comprador.email"
                    label="E-mail *"
                    value={form.comprador.email}
                    onChange={value => updateComprador('email', value)}
                    type="email"
                    helper="Informe seu e-mail para receber confirmação e orientações."
                    error={fieldErrors['comprador.email']}
                    focused={focusedField === 'comprador.email'}
                    highlight={nextFieldId === 'comprador.email'}
                    icon={Mail}
                    onFocus={() => setFocusedField('comprador.email')}
                    onBlurField={() => setFocusedField(null)}
                  />
                  <GuidedField
                    id="comprador.telefone"
                    label="Telefone com WhatsApp *"
                    value={form.comprador.telefone}
                    onChange={value => updateComprador('telefone', formatPhone(value))}
                    helper="Informe seu WhatsApp para receber contato no momento da validação."
                    error={fieldErrors['comprador.telefone']}
                    focused={focusedField === 'comprador.telefone'}
                    highlight={nextFieldId === 'comprador.telefone'}
                    icon={Phone}
                    onFocus={() => setFocusedField('comprador.telefone')}
                    onBlurField={() => setFocusedField(null)}
                  />
                  <GuidedField
                    id="acesso.senha"
                    label="Senha de acesso *"
                    value={form.acesso.senha}
                    onChange={value => setForm(prev => ({ ...prev, acesso: { ...prev.acesso, senha: value } }))}
                    type="password"
                    helper="Esta senha será usada pelo cliente para entrar e acompanhar pedido, pagamento e videoconferência."
                    error={fieldErrors['acesso.senha']}
                    focused={focusedField === 'acesso.senha'}
                    highlight={nextFieldId === 'acesso.senha'}
                    icon={Lock}
                    onFocus={() => setFocusedField('acesso.senha')}
                    onBlurField={() => setFocusedField(null)}
                  />
                  <GuidedField
                    id="acesso.confirmar_senha"
                    label="Confirmar senha *"
                    value={form.acesso.confirmar_senha}
                    onChange={value => setForm(prev => ({ ...prev, acesso: { ...prev.acesso, confirmar_senha: value } }))}
                    type="password"
                    helper="Repita a mesma senha para concluir a criação automática do acesso."
                    error={fieldErrors['acesso.confirmar_senha']}
                    focused={focusedField === 'acesso.confirmar_senha'}
                    highlight={nextFieldId === 'acesso.confirmar_senha'}
                    icon={Lock}
                    onFocus={() => setFocusedField('acesso.confirmar_senha')}
                    onBlurField={() => setFocusedField(null)}
                  />
                </div>

                <div className="rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Endereço do faturamento</p>
                      <p className="text-xs text-slate-500 mt-1">Ao informar o CEP, parte do endereço pode ser preenchida automaticamente.</p>
                    </div>
                    {(cepLoading || cnpjLoading) && (
                      <div className="inline-flex items-center gap-2 text-xs text-slate-500">
                        <Loader2 size={14} className="animate-spin" />
                        {cnpjLoading ? 'Consultando Receita' : 'Buscando CEP'}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-4">
                    <div className="md:col-span-3">
                      <GuidedField
                        id="comprador.cep"
                        label="CEP *"
                        value={form.comprador.cep}
                        onChange={value => updateComprador('cep', formatCep(value))}
                        onBlur={handleCepBlur}
                        helper="Informe o CEP do faturamento."
                        error={fieldErrors['comprador.cep']}
                        focused={focusedField === 'comprador.cep'}
                        highlight={nextFieldId === 'comprador.cep'}
                        icon={MapPin}
                        onFocus={() => setFocusedField('comprador.cep')}
                        onBlurField={() => setFocusedField(null)}
                      />
                    </div>
                    <div className="md:col-span-7">
                      <GuidedField
                        id="comprador.logradouro"
                        label="Endereço *"
                        value={form.comprador.logradouro}
                        onChange={value => updateComprador('logradouro', value)}
                        error={fieldErrors['comprador.logradouro']}
                        focused={focusedField === 'comprador.logradouro'}
                        highlight={nextFieldId === 'comprador.logradouro'}
                        onFocus={() => setFocusedField('comprador.logradouro')}
                        onBlurField={() => setFocusedField(null)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <GuidedField
                        id="comprador.numero"
                        label="Número *"
                        value={form.comprador.numero}
                        onChange={value => updateComprador('numero', value)}
                        error={fieldErrors['comprador.numero']}
                        focused={focusedField === 'comprador.numero'}
                        highlight={nextFieldId === 'comprador.numero'}
                        onFocus={() => setFocusedField('comprador.numero')}
                        onBlurField={() => setFocusedField(null)}
                      />
                    </div>
                    <div className="md:col-span-4">
                      <GuidedField
                        id="comprador.complemento"
                        label="Complemento"
                        value={form.comprador.complemento}
                        onChange={value => updateComprador('complemento', value)}
                        focused={focusedField === 'comprador.complemento'}
                        onFocus={() => setFocusedField('comprador.complemento')}
                        onBlurField={() => setFocusedField(null)}
                      />
                    </div>
                    <div className="md:col-span-4">
                      <GuidedField
                        id="comprador.bairro"
                        label="Bairro *"
                        value={form.comprador.bairro}
                        onChange={value => updateComprador('bairro', value)}
                        error={fieldErrors['comprador.bairro']}
                        focused={focusedField === 'comprador.bairro'}
                        highlight={nextFieldId === 'comprador.bairro'}
                        onFocus={() => setFocusedField('comprador.bairro')}
                        onBlurField={() => setFocusedField(null)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <GuidedField
                        id="comprador.uf"
                        label="UF *"
                        value={form.comprador.uf}
                        onChange={value => updateComprador('uf', value.toUpperCase().slice(0, 2))}
                        error={fieldErrors['comprador.uf']}
                        focused={focusedField === 'comprador.uf'}
                        highlight={nextFieldId === 'comprador.uf'}
                        onFocus={() => setFocusedField('comprador.uf')}
                        onBlurField={() => setFocusedField(null)}
                      />
                    </div>
                    <div className="md:col-span-6">
                      <GuidedField
                        id="comprador.cidade"
                        label="Cidade *"
                        value={form.comprador.cidade}
                        onChange={value => updateComprador('cidade', value)}
                        error={fieldErrors['comprador.cidade']}
                        focused={focusedField === 'comprador.cidade'}
                        highlight={nextFieldId === 'comprador.cidade'}
                        onFocus={() => setFocusedField('comprador.cidade')}
                        onBlurField={() => setFocusedField(null)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>

            {canShowTitular && (
            <SectionCard
              title="Dados do titular do certificado"
              description="O titular é a pessoa física que vai receber e usar o certificado digital. Pode ser você mesmo(a) ou outra pessoa."
              icon={UserRound}
              highlight={nextFieldId?.startsWith('titular.')}
              done={titularDone}
            >
              <label className="flex items-start gap-3 rounded-[22px] border border-sky-200 bg-sky-50/70 px-4 py-4 cursor-pointer transition-colors hover:border-sky-300">
                <input
                  type="checkbox"
                  checked={form.titularMesmoFaturamento}
                  onChange={e => setForm(prev => ({ ...prev, titularMesmoFaturamento: e.target.checked }))}
                  className="mt-1 h-5 w-5 rounded border-sky-300 text-[#17346b] focus:ring-[#17346b]"
                />
                <div>
                  <p className="text-sm font-semibold text-sky-950">
                    {form.comprador.tipo === 'pessoa_fisica'
                      ? 'Sou a mesma pessoa — vou usar o certificado no meu nome'
                      : 'O responsável do faturamento também é o titular do certificado'}
                  </p>
                  <p className="text-xs text-sky-700 mt-1">
                    {form.comprador.tipo === 'pessoa_fisica'
                      ? 'Marque esta opção se você for pagar e também usar o certificado.'
                      : 'Marque esta opção se o contato do faturamento for a mesma pessoa que usará o certificado.'}
                  </p>
                </div>
              </label>

              {form.titularMesmoFaturamento ? (
                <div className="mt-4 rounded-[24px] border border-emerald-200 bg-emerald-50/70 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">Resumo do titular que será usado</p>
                      <p className="text-xs text-emerald-800/80 mt-1">
                        Revise os dados abaixo. Se precisar trocar a pessoa titular, desmarque a opção acima.
                      </p>
                    </div>
                    <CheckCircle2 size={18} className="text-emerald-700 shrink-0 mt-0.5" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-emerald-950">
                    <InfoMini label="Nome" value={titularEfetivo.nome || 'Preencha acima'} />
                    <InfoMini label="Contato" value={titularEfetivo.email || form.comprador.email || 'Preencha acima'} />
                    <InfoMini label="WhatsApp" value={titularEfetivo.telefone || form.comprador.telefone || 'Preencha acima'} />
                    <InfoMini label={form.comprador.tipo === 'pessoa_fisica' ? 'CPF' : 'CPF do titular'} value={titularEfetivo.cpf || 'Informe abaixo'} />
                  </div>

                  {form.comprador.tipo === 'pessoa_juridica' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <GuidedField
                        id="titular.cpf"
                        label="CPF do titular *"
                        value={form.titular.cpf}
                        onChange={value => updateTitular('cpf', formatCpfCnpj(value))}
                        helper="Mesmo quando a empresa paga, o certificado será emitido para uma pessoa física."
                        
                        error={fieldErrors['titular.cpf']}
                        focused={focusedField === 'titular.cpf'}
                        highlight={nextFieldId === 'titular.cpf'}
                        onFocus={() => setFocusedField('titular.cpf')}
                        onBlurField={() => setFocusedField(null)}
                      />
                      <GuidedField
                        id="titular.data_nascimento"
                        label="Data de nascimento"
                        value={form.titular.data_nascimento}
                        onChange={value => updateTitular('data_nascimento', value)}
                        type="date"
                        helper="Se você informar agora, essa etapa fica mais adiantada."
                        focused={focusedField === 'titular.data_nascimento'}
                        onFocus={() => setFocusedField('titular.data_nascimento')}
                        onBlurField={() => setFocusedField(null)}
                      />
                    </div>
                  )}

                  {form.comprador.tipo === 'pessoa_fisica' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <GuidedField
                        id="titular.data_nascimento"
                        label="Data de nascimento"
                        value={form.titular.data_nascimento}
                        onChange={value => updateTitular('data_nascimento', value)}
                        type="date"
                        helper="Se quiser, você já pode informar agora."
                        focused={focusedField === 'titular.data_nascimento'}
                        onFocus={() => setFocusedField('titular.data_nascimento')}
                        onBlurField={() => setFocusedField(null)}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <GuidedField
                    id="titular.nome"
                    label="Nome do titular *"
                    value={form.titular.nome}
                    onChange={value => updateTitular('nome', value)}
                    helper="Informe o nome de quem vai receber o certificado."
                    error={fieldErrors['titular.nome']}
                    focused={focusedField === 'titular.nome'}
                    highlight={nextFieldId === 'titular.nome'}
                    onFocus={() => setFocusedField('titular.nome')}
                    onBlurField={() => setFocusedField(null)}
                  />
                  <GuidedField
                    id="titular.cpf"
                    label="CPF do titular *"
                    value={form.titular.cpf}
                    onChange={value => updateTitular('cpf', formatCpfCnpj(value))}
                    error={fieldErrors['titular.cpf']}
                    focused={focusedField === 'titular.cpf'}
                    highlight={nextFieldId === 'titular.cpf'}
                    onFocus={() => setFocusedField('titular.cpf')}
                    onBlurField={() => setFocusedField(null)}
                  />
                  <GuidedField
                    id="titular.data_nascimento"
                    label="Data de nascimento"
                    value={form.titular.data_nascimento}
                    onChange={value => updateTitular('data_nascimento', value)}
                    type="date"
                    focused={focusedField === 'titular.data_nascimento'}
                    onFocus={() => setFocusedField('titular.data_nascimento')}
                    onBlurField={() => setFocusedField(null)}
                  />
                  <GuidedField
                    id="titular.email"
                    label="E-mail do titular"
                    value={form.titular.email}
                    onChange={value => updateTitular('email', value)}
                    type="email"
                    helper="Se este e-mail for diferente do faturamento, informe aqui."
                    focused={focusedField === 'titular.email'}
                    icon={Mail}
                    onFocus={() => setFocusedField('titular.email')}
                    onBlurField={() => setFocusedField(null)}
                  />
                  <GuidedField
                    id="titular.telefone"
                    label="WhatsApp do titular"
                    value={form.titular.telefone}
                    onChange={value => updateTitular('telefone', formatPhone(value))}
                    helper="Se este WhatsApp for diferente do faturamento, informe aqui."
                    focused={focusedField === 'titular.telefone'}
                    icon={Phone}
                    onFocus={() => setFocusedField('titular.telefone')}
                    onBlurField={() => setFocusedField(null)}
                  />
                </div>
              )}
            </SectionCard>
            )}

            {canShowPagamento && (
            <SectionCard
              title="Forma de pagamento"
              description="Escolha como você vai pagar. Depois da compensação, liberamos o atendimento da validação."
              icon={Wallet}
              highlight={nextFieldId === 'forma_pagamento_id'}
              done={pagamentoDone}
            >
              <div data-field-anchor="forma_pagamento_id" className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {pagamentos.map(option => {
                  const active = form.forma_pagamento_id === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setForm(prev => ({ ...prev, forma_pagamento_id: option.id }))
                        setFieldErrors(prev => {
                          const next = { ...prev }
                          delete next['forma_pagamento_id']
                          return next
                        })
                      }}
                      className={cn(
                        'text-left rounded-[24px] border px-4 py-4 transition-all',
                        active
                          ? 'border-[#ea7b18] bg-[#fff8f1] ring-2 ring-[#fde4cf]'
                          : (nextFieldId === 'forma_pagamento_id'
                            ? 'border-[#17346b] bg-sky-50/70 ring-2 ring-sky-100'
                            : 'border-slate-200 bg-white hover:border-slate-300')
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{option.nome}</p>
                          <p className="text-xs text-slate-500 mt-1">{statusPagamentoLabel(option)}</p>
                        </div>
                        {active ? <CheckCircle2 size={18} className="text-[#ea7b18]" /> : <CreditCard size={18} className="text-slate-400" />}
                      </div>
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 rounded-[22px] border border-sky-100 bg-sky-50/50 px-4 py-3 text-xs text-sky-800 leading-relaxed">
                <strong>Depois de escolher:</strong> você confirma a compra e recebe as instruções de pagamento.
                Quando o pagamento for compensado, nossa equipe entra em contato para realizar a validação presencial ou por vídeo.
              </div>
              {fieldErrors['forma_pagamento_id'] && (
                <p className="mt-3 text-sm text-red-600">{fieldErrors['forma_pagamento_id']}</p>
              )}
              {isMercadoPagoCard && pagamentoSelecionado?.public_key && itemSelecionado && (
                <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
                  <CardPayment
                    initialization={{ amount: Number(itemSelecionado.valor) }}
                    onSubmit={async formData => {
                      const paymentType = (formData as unknown as { payment_type_id?: string }).payment_type_id
                      await iniciarCheckout({
                        token: String(formData.token ?? ''),
                        payment_method_id: String(formData.payment_method_id ?? ''),
                        payment_type_id: paymentType === 'debit_card' ? 'debit_card' : 'credit_card',
                        installments: Number(formData.installments ?? 1),
                        identification_type: String(formData.payer?.identification?.type ?? 'CPF'),
                        identification_number: String(formData.payer?.identification?.number ?? onlyDigits(form.comprador.cpf_cnpj)),
                      })
                    }}
                    onReady={() => undefined}
                    onError={brickError => setError(brickError instanceof Error ? brickError.message : 'Falha ao carregar o formulário seguro do cartão.')}
                  />
                </div>
              )}
              {isMercadoPagoCard && !pagamentoSelecionado?.public_key && (
                <p className="mt-3 text-sm text-amber-700">A Public Key do Mercado Pago ainda não foi configurada.</p>
              )}
            </SectionCard>
            )}

            {canShowAgendamento && (
            <SectionCard
              title="Agendamento da validação"
              description="Reserve um horário para validar seus documentos. A validação só acontece depois do pagamento, mas você já pode deixar agendado."
              icon={CalendarDays}
              highlight={!selectedSlot}
              done={agendamentoDone}
            >
              {!selectedSlot ? (
                <div className="rounded-[24px] border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-800">!</span>
                        <p className="text-sm font-semibold text-amber-900">Nenhum horário reservado ainda</p>
                      </div>
                      <p className="text-sm text-amber-800 leading-relaxed pl-8">
                        Você pode seguir sem agendar, mas depois terá que voltar para escolher um horário.
                        Se possível, agende agora para não esquecer.
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs pl-8 mt-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 border border-amber-200 px-3 py-1.5 text-amber-800">
                          <AlertTriangle size={12} />
                          Atendimento liberado somente após compensação
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openSchedulingModal}
                      className="shrink-0 inline-flex items-center justify-center rounded-2xl px-5 py-3 bg-[#17346b] text-white text-sm font-semibold hover:bg-[#102654]"
                    >
                      Escolher horário
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/70 p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                        <p className="text-sm font-semibold text-emerald-900">Horário reservado</p>
                      </div>
                      <p className="text-sm text-emerald-800 pl-6">
                        {formatDateTime(selectedSlot.inicio)} com <strong>{selectedSlot.agente_nome}</strong> em <strong>{selectedSlot.ponto_nome}</strong>.
                      </p>
                      <p className="text-xs text-emerald-700/80 pl-6 mt-1">
                        A validação será confirmada após a compensação do pagamento.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={openSchedulingModal}
                        className="inline-flex items-center justify-center rounded-2xl px-4 py-3 bg-[#17346b] text-white text-sm font-semibold hover:bg-[#102654]"
                      >
                        Trocar agendamento
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedSlotKey('')}
                        className="inline-flex items-center justify-center rounded-2xl px-4 py-3 border border-emerald-300 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        Remover agendamento
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>
            )}

            {canShowAvisos && (
            <SectionCard
              title="Avisos importantes"
              description="Revise estes avisos antes de concluir a compra."
              icon={AlertTriangle}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <WarningCard text={paymentRuntime.aviso_checkout} />
                <WarningCard text="Se você não agendar agora, será necessário voltar depois ao portal do cliente para escolher um horário antes do atendimento." />
                <WarningCard text="Informe e-mail e telefone com WhatsApp válidos para a equipe entrar em contato no momento da validação." />
              </div>

              <div className="mt-4">
                <GuidedField
                  id="observacoes"
                  label="Observações da compra"
                  value={form.observacoes}
                  onChange={value => setForm(prev => ({ ...prev, observacoes: value }))}
                  multiline
                  helper="Se quiser, use este espaço para deixar algum recado sobre a emissão."
                  focused={focusedField === 'observacoes'}
                  onFocus={() => setFocusedField('observacoes')}
                  onBlurField={() => setFocusedField(null)}
                />
              </div>
            </SectionCard>
            )}
            </div>
            )}
          </div>

          <aside className="xl:sticky xl:top-24 space-y-4">
            <div className="rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] uppercase tracking-[0.22em] text-slate-400 font-semibold">Resumo da compra</p>
              {itemSelecionado ? (
                <>
                  <div className="mt-4 rounded-[24px] bg-slate-50 p-4">
                    <p className="text-lg font-semibold text-slate-900">{itemSelecionado.certificados?.tipo ?? 'Produto'}</p>
                    {(itemSelecionado.certificados?.descricao_produto ?? itemSelecionado.certificados?.descricao) && (
                      <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                        {itemSelecionado.certificados?.descricao_produto ?? itemSelecionado.certificados?.descricao}
                      </p>
                    )}
                    <ProductTags item={itemSelecionado} compact />
                    <p className="text-3xl font-semibold text-emerald-600 mt-4">{formatCurrency(itemSelecionado.valor)}</p>
                  </div>

                  <div className="mt-4 space-y-3">
                    <InfoLine label="Faturamento" value={form.comprador.nome || 'Aguardando preenchimento'} />
                    <InfoLine label="Contato principal" value={form.comprador.telefone || form.comprador.email || 'Aguardando preenchimento'} />
                    <InfoLine
                      label="Titular do certificado"
                      value={titularEfetivo.nome || 'Aguardando definição'}
                    />
                    <InfoLine
                      label="Pagamento"
                      value={pagamentos.find(item => item.id === form.forma_pagamento_id)?.nome ?? 'Aguardando escolha'}
                    />
                    <InfoLine
                      label="Agendamento"
                      value={selectedSlot ? formatDateTime(selectedSlot.inicio) : 'Pendente'}
                      tone={selectedSlot ? 'default' : 'warn'}
                    />
                  </div>
                </>
              ) : (
                <div className="mt-4 rounded-[24px] bg-slate-50 p-4 text-sm text-slate-500">
                  Selecione um produto para liberar o resumo da compra.
                </div>
              )}
            </div>

            <div className="rounded-[30px] border border-[#fde4cf] bg-[#fffaf4] p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Antes de finalizar</p>
              <div className="mt-3 space-y-3 text-sm text-slate-600">
                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#fde4cf] text-[11px] font-bold text-[#cf6611]">1</span>
                  <span>Confirme <strong>e-mail</strong> e <strong>WhatsApp</strong> — é por eles que entraremos em contato.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#fde4cf] text-[11px] font-bold text-[#cf6611]">2</span>
                  <span>Se <strong>quem paga</strong> for diferente de <strong>quem usa o certificado</strong>, revise os dois blocos com atenção.</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#fde4cf] text-[11px] font-bold text-[#cf6611]">3</span>
                  <span>A validação presencial ou por vídeo só acontece <strong>após a compensação do pagamento</strong>.</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700 shadow-sm">
                {error}
              </div>
            )}

            {checkoutSuccess && (
              <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-700 shadow-sm">
                {checkoutSuccess}
              </div>
            )}

            {paymentDetails?.kind === 'pix' && (
              <div className="rounded-[24px] border border-blue-200 bg-white px-4 py-5 text-sm shadow-sm">
                <p className="font-semibold text-slate-900">Pix gerado</p>
                {paymentDetails.qr_code_base64 && <img className="mx-auto my-4 h-56 w-56" alt="QR Code Pix" src={`data:image/png;base64,${paymentDetails.qr_code_base64}`} />}
                {paymentDetails.qr_code && (
                  <button type="button" onClick={() => void navigator.clipboard.writeText(paymentDetails.qr_code!)} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">Copiar código Pix</button>
                )}
                {paymentDetails.ticket_url && <a className="mt-3 block text-center text-blue-700 underline" href={paymentDetails.ticket_url} target="_blank" rel="noreferrer">Abrir instruções do Pix</a>}
              </div>
            )}

            {paymentDetails?.kind === 'boleto' && (
              <div className="rounded-[24px] border border-amber-200 bg-white px-4 py-5 text-sm shadow-sm">
                <p className="font-semibold text-slate-900">Boleto gerado</p>
                {paymentDetails.digitable_line && <p className="my-3 break-all rounded-xl bg-slate-50 p-3 text-xs">{paymentDetails.digitable_line}</p>}
                {paymentDetails.digitable_line && <button type="button" onClick={() => void navigator.clipboard.writeText(paymentDetails.digitable_line!)} className="w-full rounded-xl bg-amber-600 px-4 py-3 font-semibold text-white">Copiar linha digitável</button>}
                {paymentDetails.ticket_url && <a className="mt-3 block text-center text-amber-700 underline" href={paymentDetails.ticket_url} target="_blank" rel="noreferrer">Abrir boleto</a>}
              </div>
            )}

            <button
              type="button"
              onClick={() => void iniciarCheckout()}
              disabled={checkoutLoading || !itemSelecionado || isMercadoPagoCard}
              className="hidden xl:inline-flex w-full items-center justify-center rounded-[22px] px-5 py-4 bg-[#ea7b18] text-white text-sm font-semibold hover:bg-[#cf6611] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#fde4cf]"
            >
              {checkoutLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Finalizando compra...
                </>
              ) : 'Concluir compra'}
            </button>
          </aside>
        </section>
      </main>

      <div className="xl:hidden fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 font-semibold">Valor da compra</p>
            <p className="text-sm font-semibold text-slate-900 truncate">
              {itemSelecionado ? `${itemSelecionado.certificados?.tipo ?? 'Produto'} · ${formatCurrency(itemSelecionado.valor)}` : 'Selecione um produto'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void iniciarCheckout()}
            disabled={checkoutLoading || !itemSelecionado || isMercadoPagoCard}
            className="inline-flex items-center justify-center rounded-2xl px-4 py-3 bg-[#ea7b18] text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px]"
          >
            {checkoutLoading ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                Enviando
              </>
            ) : 'Concluir compra'}
          </button>
        </div>
      </div>

      <SchedulingModal
        open={isSchedulingOpen}
        onClose={() => setIsSchedulingOpen(false)}
        onConfirm={(slotKey) => {
          setSelectedSlotKey(slotKey)
          if (slotKey) {
            const slot = slots.find(s => buildSlotKey(s) === slotKey)
            if (slot) setSelectedDay(slot.inicio.slice(0, 10))
          }
          setIsSchedulingOpen(false)
        }}
        onSkip={() => {
          setSelectedSlotKey('')
          setIsSchedulingOpen(false)
        }}
        agentOptions={agentOptions}
        pointOptionsForAgent={(agentId) => {
          const pointIds = Array.from(new Set(
            slots
              .filter(slot => slot.agente_registro_id === agentId)
              .map(slot => slot.ponto_atendimento_id)
          ))
          return agendaPoints.filter(point => pointIds.includes(point.id))
        }}
        slots={slots}
        initialSlotKey={selectedSlotKey}
        initialAgentId={selectedSlot?.agente_registro_id ?? agentOptions[0]?.id ?? ''}
        initialPointId={selectedSlot?.ponto_atendimento_id ?? ''}
      />
    </div>
  )
}




















