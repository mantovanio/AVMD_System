import { useEffect, useMemo, useState } from 'react'
import { Edit3, PlusCircle, RefreshCw, Search, X, Trash2, PowerOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getApiUrl } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { hasPerfil } from '@/lib/security'
import { buscarCep } from '@/lib/cep'
import type {
  Banco,
  CentroCusto,
  NovoParceiro,
  Parceiro,
  ParceiroAgentePermitido,
  PontoAtendimento,
  Profile,
  TipoContaBancaria,
  TipoParceiro,
} from '@/types'

const SEG_CONFIG: Record<Parceiro['segmento'], { label: string; cls: string }> = {
  alto:    { label: 'Alto Valor', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  medio:   { label: 'Médio Valor', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  baixo:   { label: 'Baixo Valor', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  inativo: { label: 'Inativo', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
}

const TIPO_PARCEIRO_OPTIONS: { value: TipoParceiro; label: string }[] = [
  { value: 'ar', label: 'AR' },
  { value: 'pa_controle_total', label: 'PA 100% Controle' },
  { value: 'pa_emissor', label: 'PA / Emissor' },
  { value: 'contador', label: 'Contador' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'ecommerce', label: 'E-Commerce' },
]

const TIPO_CONTA_OPTIONS: { value: TipoContaBancaria; label: string }[] = [
  { value: 'corrente', label: 'Conta Corrente' },
  { value: 'poupanca', label: 'Conta Poupança' },
  { value: 'pagamento', label: 'Conta Pagamento' },
  { value: 'outro', label: 'Outro' },
]

const EMPTY: NovoParceiro = {
  codigo_parceiro: null,
  cpf_cnpj: null,
  nome: '',
  razao_social: null,
  nome_fantasia: null,
  responsavel: null,
  id_local_atendimento: null,
  senha_acesso: null,
  email_acesso: null,
  ddd: null,
  telefone: null,
  email: null,
  email_adicional_1: null,
  email_adicional_2: null,
  email_adicional_3: null,
  cep: null,
  logradouro: null,
  numero: null,
  ibge: null,
  complemento: null,
  bairro: null,
  cidade: null,
  estado: null,
  observacao: null,
  token: null,
  inscricao_municipal: null,
  inscricao_estadual: null,
  tipo_parceiro: null,
  data_ativacao: null,
  data_desativacao: null,
  bloquear_vendas_protocolos: false,
  nao_enviar_whatsapp_vendas: false,
  nao_enviar_email_vendas: false,
  nao_enviar_renovacao_clientes: false,
  nao_quero_receber_whatsapp: false,
  nao_quero_receber_email: false,
  gestor_1_id: null,
  gestor_2_id: null,
  gestor_3_id: null,
  gestor_4_id: null,
  gestor_5_id: null,
  tipo_conta: 'corrente',
  banco_id: null,
  agencia: null,
  agencia_digito: null,
  conta: null,
  conta_digito: null,
  operacao: null,
  cnpj_cpf_titular: null,
  titular_conta: null,
  chave_pix: null,
  centro_custo_id: null,
  segmento: 'baixo',
  status: 'ativo',
  emissoes_mes: 0,
  receita_mes: 0,
  desde: null,
  metadata: {},
}

type GestorOption = Pick<Profile, 'id' | 'nome' | 'perfil' | 'status'>
type AgentePermitidoForm = {
  agente_registro_id: string
  ponto_atendimento_id: string
  ativo: boolean
}

export default function Parceiros() {
  const { profile } = useAuth()
  const canManage = hasPerfil(profile, 'admin', 'vendedor')
  const [lista, setLista] = useState<Parceiro[]>([])
  const [bancos, setBancos] = useState<Banco[]>([])
  const [centros, setCentros] = useState<CentroCusto[]>([])
  const [gestores, setGestores] = useState<GestorOption[]>([])
  const [pontos, setPontos] = useState<PontoAtendimento[]>([])
  const [agentesPermitidos, setAgentesPermitidos] = useState<ParceiroAgentePermitido[]>([])
  const [formAgente, setFormAgente] = useState<AgentePermitidoForm>({ agente_registro_id: '', ponto_atendimento_id: '', ativo: true })
  const [salvandoAgente, setSalvandoAgente] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroSeg, setFiltroSeg] = useState<Parceiro['segmento'] | 'todos'>('todos')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<NovoParceiro>(EMPTY)
  const [salvando, setSalvando] = useState(false)

  type AcaoModal = { parceiro: Parceiro; tipo: 'excluir' | 'inativar'; vinculosCount: number }
  const [acaoModal, setAcaoModal]     = useState<AcaoModal | null>(null)
  const [executando, setExecutando]   = useState(false)

  useEffect(() => { void fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    setError(null)
    try {
      const [parceirosRes, bancosRes, centrosRes, gestoresRes, pontosRes, agentesRes] = await Promise.all([
        fetch(getApiUrl('/parceiros')).then(r => r.json()),
        fetch(getApiUrl('/ref/bancos')).then(r => r.json()),
        fetch(getApiUrl('/ref/centros')).then(r => r.json()),
        fetch(getApiUrl('/ref/agentes')).then(r => r.json()),
        fetch(getApiUrl('/comercial/pontos'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json()),
        fetch(getApiUrl('/parceiros/agentes')).then(r => r.json()),
      ])
      setLista((parceirosRes.parceiros ?? []) as Parceiro[])
      setBancos((bancosRes.bancos ?? []) as Banco[])
      setCentros((centrosRes.centros ?? []) as CentroCusto[])
      setGestores((gestoresRes.agentes ?? []) as GestorOption[])
      setPontos((pontosRes.pontos ?? []) as PontoAtendimento[])
      setAgentesPermitidos((agentesRes.agentes ?? []) as ParceiroAgentePermitido[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  function updateField<K extends keyof NovoParceiro>(key: K, value: NovoParceiro[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function preencherCep(cep: string | null) {
    const resultado = await buscarCep(cep ?? '')
    if (!resultado) return
    setForm(prev => ({
      ...prev,
      logradouro: resultado.logradouro || prev.logradouro,
      bairro:     resultado.bairro     || prev.bairro,
      cidade:     resultado.localidade || prev.cidade,
      estado:     resultado.uf         || prev.estado,
      ibge:       resultado.ibge       || prev.ibge,
    }))
  }

  function abrirNovo() {
    setEditingId(null)
    setForm({ ...EMPTY })
    setShowForm(true)
  }

  function abrirEditar(parceiro: Parceiro) {
    setEditingId(parceiro.id)
    setForm({
      codigo_parceiro: parceiro.codigo_parceiro ?? null,
      cpf_cnpj: parceiro.cpf_cnpj ?? null,
      nome: parceiro.nome,
      razao_social: parceiro.razao_social ?? parceiro.nome,
      nome_fantasia: parceiro.nome_fantasia ?? null,
      responsavel: parceiro.responsavel ?? null,
      id_local_atendimento: parceiro.id_local_atendimento ?? null,
      senha_acesso: parceiro.senha_acesso ?? null,
      email_acesso: parceiro.email_acesso ?? null,
      ddd: parceiro.ddd ?? null,
      telefone: parceiro.telefone ?? null,
      email: parceiro.email ?? null,
      email_adicional_1: parceiro.email_adicional_1 ?? null,
      email_adicional_2: parceiro.email_adicional_2 ?? null,
      email_adicional_3: parceiro.email_adicional_3 ?? null,
      cep: parceiro.cep ?? null,
      logradouro: parceiro.logradouro ?? null,
      numero: parceiro.numero ?? null,
      ibge: parceiro.ibge ?? null,
      complemento: parceiro.complemento ?? null,
      bairro: parceiro.bairro ?? null,
      cidade: parceiro.cidade ?? null,
      estado: parceiro.estado ?? null,
      observacao: parceiro.observacao ?? null,
      token: parceiro.token ?? null,
      inscricao_municipal: parceiro.inscricao_municipal ?? null,
      inscricao_estadual: parceiro.inscricao_estadual ?? null,
      tipo_parceiro: parceiro.tipo_parceiro ?? null,
      data_ativacao: parceiro.data_ativacao ?? parceiro.desde ?? null,
      data_desativacao: parceiro.data_desativacao ?? null,
      bloquear_vendas_protocolos: parceiro.bloquear_vendas_protocolos ?? false,
      nao_enviar_whatsapp_vendas: parceiro.nao_enviar_whatsapp_vendas ?? false,
      nao_enviar_email_vendas: parceiro.nao_enviar_email_vendas ?? false,
      nao_enviar_renovacao_clientes: parceiro.nao_enviar_renovacao_clientes ?? false,
      nao_quero_receber_whatsapp: parceiro.nao_quero_receber_whatsapp ?? false,
      nao_quero_receber_email: parceiro.nao_quero_receber_email ?? false,
      gestor_1_id: parceiro.gestor_1_id ?? null,
      gestor_2_id: parceiro.gestor_2_id ?? null,
      gestor_3_id: parceiro.gestor_3_id ?? null,
      gestor_4_id: parceiro.gestor_4_id ?? null,
      gestor_5_id: parceiro.gestor_5_id ?? null,
      tipo_conta: parceiro.tipo_conta ?? 'corrente',
      banco_id: parceiro.banco_id ?? null,
      agencia: parceiro.agencia ?? null,
      agencia_digito: parceiro.agencia_digito ?? null,
      conta: parceiro.conta ?? null,
      conta_digito: parceiro.conta_digito ?? null,
      operacao: parceiro.operacao ?? null,
      cnpj_cpf_titular: parceiro.cnpj_cpf_titular ?? null,
      titular_conta: parceiro.titular_conta ?? null,
      chave_pix: parceiro.chave_pix ?? null,
      centro_custo_id: parceiro.centro_custo_id ?? null,
      segmento: parceiro.segmento,
      status: parceiro.status,
      emissoes_mes: parceiro.emissoes_mes ?? 0,
      receita_mes: parceiro.receita_mes ?? 0,
      desde: parceiro.desde ?? null,
      metadata: parceiro.metadata ?? {},
    })
    setShowForm(true)
  }

  async function salvar() {
    if (!canManage) return
    const razao = (form.razao_social ?? form.nome).trim()
    if (!razao) return
    setSalvando(true)
    const payload: NovoParceiro = {
      ...form,
      nome: razao,
      razao_social: razao,
      nome_fantasia: cleanText(form.nome_fantasia),
      codigo_parceiro: cleanText(form.codigo_parceiro),
      cpf_cnpj: cleanText(form.cpf_cnpj),
      responsavel: cleanText(form.responsavel),
      id_local_atendimento: cleanText(form.id_local_atendimento),
      senha_acesso: cleanText(form.senha_acesso),
      email_acesso: cleanText(form.email_acesso),
      ddd: cleanText(form.ddd),
      telefone: cleanText(form.telefone),
      email: cleanText(form.email),
      email_adicional_1: cleanText(form.email_adicional_1),
      email_adicional_2: cleanText(form.email_adicional_2),
      email_adicional_3: cleanText(form.email_adicional_3),
      cep: cleanText(form.cep),
      logradouro: cleanText(form.logradouro),
      numero: cleanText(form.numero),
      ibge: cleanText(form.ibge),
      complemento: cleanText(form.complemento),
      bairro: cleanText(form.bairro),
      cidade: cleanText(form.cidade),
      estado: cleanText(form.estado),
      observacao: cleanText(form.observacao),
      token: cleanText(form.token),
      inscricao_municipal: cleanText(form.inscricao_municipal),
      inscricao_estadual: cleanText(form.inscricao_estadual),
      operacao: cleanText(form.operacao),
      agencia: cleanText(form.agencia),
      agencia_digito: cleanText(form.agencia_digito),
      conta: cleanText(form.conta),
      conta_digito: cleanText(form.conta_digito),
      cnpj_cpf_titular: cleanText(form.cnpj_cpf_titular),
      titular_conta: cleanText(form.titular_conta),
      chave_pix: cleanText(form.chave_pix),
      data_ativacao: form.data_ativacao || null,
      data_desativacao: form.data_desativacao || null,
      banco_id: form.banco_id || null,
      centro_custo_id: form.centro_custo_id || null,
      gestor_1_id: form.gestor_1_id || null,
      gestor_2_id: form.gestor_2_id || null,
      gestor_3_id: form.gestor_3_id || null,
      gestor_4_id: form.gestor_4_id || null,
      gestor_5_id: form.gestor_5_id || null,
      desde: form.data_ativacao || form.desde || null,
    }
    const resp = await fetch(getApiUrl('/parceiros'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingId ? { ...payload, id: editingId } : payload),
    })
    setSalvando(false)
    if (!resp.ok) {
      const d = await resp.json().catch(() => null)
      setError(d?.error ?? 'Erro ao salvar parceiro')
      return
    }
    setShowForm(false)
    setEditingId(null)
    setForm({ ...EMPTY })
    await fetchAll()
  }

  async function contarVinculos(parceiroId: string): Promise<number> {
    try {
      const resp = await fetch(getApiUrl(`/parceiros/${parceiroId}/vinculos`))
      const d = await resp.json()
      return d.count ?? 0
    } catch { return 0 }
  }

  async function iniciarExcluir(parceiro: Parceiro) {
    if (!canManage) return
    const count = await contarVinculos(parceiro.id)
    if (count > 0) {
      setAcaoModal({ parceiro, tipo: 'inativar', vinculosCount: count })
    } else {
      setAcaoModal({ parceiro, tipo: 'excluir', vinculosCount: 0 })
    }
  }

  async function confirmarAcao() {
    if (!acaoModal) return
    setExecutando(true)
    const { parceiro, tipo } = acaoModal
    if (tipo === 'excluir') {
      await fetch(getApiUrl(`/parceiros/${parceiro.id}`), { method: 'DELETE' })
    } else {
      const dataDesativacao = new Date().toISOString().slice(0, 10)
      await fetch(getApiUrl(`/parceiros/${parceiro.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'inativo', segmento: 'inativo', data_desativacao: dataDesativacao }),
      })
    }
    setAcaoModal(null)
    setExecutando(false)
    await fetchAll()
  }

  async function toggleStatus(parceiro: Parceiro) {
    if (!canManage) return
    const novoStatus = parceiro.status === 'ativo' ? 'inativo' : 'ativo'
    const segmento = novoStatus === 'inativo' ? 'inativo' : parceiro.segmento === 'inativo' ? 'baixo' : parceiro.segmento
    const dataDesativacao = novoStatus === 'inativo' ? new Date().toISOString().slice(0, 10) : null
    const resp = await fetch(getApiUrl(`/parceiros/${parceiro.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novoStatus, segmento, data_desativacao: dataDesativacao }),
    })
    if (!resp.ok) {
      const d = await resp.json().catch(() => null)
      setError(d?.error ?? 'Erro ao atualizar status')
      return
    }
    await fetchAll()
  }

  async function salvarAgentePermitido() {
    if (!editingId || !formAgente.agente_registro_id) return
    setSalvandoAgente(true)
    const resp = await fetch(getApiUrl('/parceiros/agentes'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parceiro_id: editingId,
        agente_registro_id: formAgente.agente_registro_id,
        ponto_atendimento_id: formAgente.ponto_atendimento_id || null,
        ativo: formAgente.ativo,
      }),
    })
    setSalvandoAgente(false)
    if (!resp.ok) {
      const d = await resp.json().catch(() => null)
      setError(`Erro ao vincular agente: ${d?.error ?? 'falha'}`)
      return
    }
    setFormAgente({ agente_registro_id: '', ponto_atendimento_id: '', ativo: true })
    await fetchAll()
  }

  async function toggleAgentePermitido(item: ParceiroAgentePermitido) {
    const resp = await fetch(getApiUrl(`/parceiros/agentes/${item.id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !item.ativo }),
    })
    if (!resp.ok) { setError('Erro ao atualizar agente'); return }
    await fetchAll()
  }

  async function excluirAgentePermitido(id: string) {
    const resp = await fetch(getApiUrl(`/parceiros/agentes/${id}`), { method: 'DELETE' })
    if (!resp.ok) { setError('Erro ao excluir agente'); return }
    await fetchAll()
  }

  const filtrado = useMemo(() => {
    return lista.filter(p => {
      const termo = busca.trim().toLowerCase()
      const texto = [
        p.codigo_parceiro,
        p.cpf_cnpj,
        p.razao_social ?? p.nome,
        p.nome_fantasia,
        p.cidade,
        p.estado,
      ].join(' ').toLowerCase()
      const matchBusca = !termo || texto.includes(termo)
      const matchSeg = filtroSeg === 'todos' || p.segmento === filtroSeg
      return matchBusca && matchSeg
    })
  }, [lista, busca, filtroSeg])

  const ativos = lista.filter(p => p.status === 'ativo').length
  const inativos = lista.filter(p => p.status === 'inativo').length
  const receitaTotal = lista.reduce((sum, parceiro) => sum + (parceiro.receita_mes ?? 0), 0)

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Parceiros Ativos', value: loading ? '…' : String(ativos), color: 'bg-green-500' },
            { label: 'Inativos', value: loading ? '…' : String(inativos), color: 'bg-gray-400' },
            { label: 'Receita Parceiros', value: loading ? '…' : `R$ ${receitaTotal.toLocaleString('pt-BR')}`, color: 'bg-blue-500' },
            { label: 'Cadastros completos', value: loading ? '…' : String(lista.filter(p => !!p.cpf_cnpj && !!p.banco_id).length), color: 'bg-purple-500' },
          ].map(card => (
            <div key={card.label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 flex items-center gap-3">
              <div className={cn('w-2 h-8 rounded-full shrink-0', card.color)} />
              <div>
                <p className="text-xl font-bold">{card.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por código, documento, razão social ou cidade..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {(['todos', 'alto', 'medio', 'baixo', 'inativo'] as const).map(seg => (
              <button
                key={seg}
                type="button"
                onClick={() => setFiltroSeg(seg)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors',
                  filtroSeg === seg ? 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                )}
              >
                {seg === 'todos' ? 'Todos' : seg === 'medio' ? 'Médio' : seg}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void fetchAll()}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-xs font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw size={13} /> Atualizar
          </button>
          <button
            type="button"
            onClick={abrirNovo}
            disabled={!canManage}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <PlusCircle size={13} /> Novo Parceiro
          </button>
        </div>

        {showForm && (
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {editingId ? 'Editar Parceiro' : 'Cadastro Completo do Parceiro'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Gestão completa do parceiro, mensageria, bloqueios, gestores e dados bancários.</p>
              </div>
              <button type="button" title="Fechar" onClick={() => { setShowForm(false); setEditingId(null); setForm({ ...EMPTY }) }}>
                <X size={16} className="text-gray-400" />
              </button>
            </div>

            <Section title="Cadastro">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <TextField label="Código Parceiro" value={form.codigo_parceiro} onChange={v => updateField('codigo_parceiro', v)} />
                <TextField label="CNPJ/CPF" value={form.cpf_cnpj} onChange={v => updateField('cpf_cnpj', v)} />
                <TextField label="Razão Social/Nome *" value={form.razao_social} onChange={v => { updateField('razao_social', v); updateField('nome', v ?? '') }} placeholder="Informe a razão social" className="md:col-span-2" />
                <TextField label="Nome Fantasia" value={form.nome_fantasia} onChange={v => updateField('nome_fantasia', v)} placeholder="Informe o nome fantasia" className="md:col-span-2" />
                <TextField label="Id Local Atendimento" value={form.id_local_atendimento} onChange={v => updateField('id_local_atendimento', v)} />
                <TextField label="Senha acesso" value={form.senha_acesso} onChange={v => updateField('senha_acesso', v)} placeholder="Informe a senha do Parceiro" />
                <TextField label="Email acesso" value={form.email_acesso} onChange={v => updateField('email_acesso', v)} placeholder="Informe o email de acesso" />
                <TextField label="DDD" value={form.ddd} onChange={v => updateField('ddd', v)} placeholder="DDD" />
                <TextField label="Telefone" value={form.telefone} onChange={v => updateField('telefone', v)} placeholder="Telefone" />
                <TextField label="Email adicional 01" value={form.email_adicional_1} onChange={v => updateField('email_adicional_1', v)} />
                <TextField label="Email adicional 02" value={form.email_adicional_2} onChange={v => updateField('email_adicional_2', v)} />
                <TextField label="Email adicional 03" value={form.email_adicional_3} onChange={v => updateField('email_adicional_3', v)} />
                <TextField label="CEP" value={form.cep} onChange={v => updateField('cep', v)} onBlur={() => preencherCep(form.cep)} placeholder="CEP" />
                <TextField label="Logradouro" value={form.logradouro} onChange={v => updateField('logradouro', v)} placeholder="Logradouro" className="md:col-span-2" />
                <TextField label="Número" value={form.numero} onChange={v => updateField('numero', v)} placeholder="Número" />
                <TextField label="IBGE" value={form.ibge} onChange={v => updateField('ibge', v)} placeholder="IBGE" />
                <TextField label="Complemento" value={form.complemento} onChange={v => updateField('complemento', v)} placeholder="Complemento" />
                <TextField label="Bairro" value={form.bairro} onChange={v => updateField('bairro', v)} placeholder="Bairro" />
                <TextField label="Cidade" value={form.cidade} onChange={v => updateField('cidade', v)} placeholder="Cidade" />
                <TextField label="UF" value={form.estado} onChange={v => updateField('estado', v)} placeholder="UF" />
                <TextField label="Token" value={form.token} onChange={v => updateField('token', v)} />
                <TextField label="Inscrição Municipal" value={form.inscricao_municipal} onChange={v => updateField('inscricao_municipal', v)} />
                <TextField label="Inscrição Estadual" value={form.inscricao_estadual} onChange={v => updateField('inscricao_estadual', v)} />
                <SelectField label="Tipo Parceiro" value={form.tipo_parceiro} onChange={v => updateField('tipo_parceiro', (v as TipoParceiro) || null)}
                  options={[{ value: '', label: 'Selecione' }, ...TIPO_PARCEIRO_OPTIONS]} />
                <TextField label="Data Ativação" type="date" value={form.data_ativacao} onChange={v => updateField('data_ativacao', v)} />
                <TextField label="Data Desativação" type="date" value={form.data_desativacao} onChange={v => updateField('data_desativacao', v)} />
                <SelectField label="Segmento" value={form.segmento} onChange={v => updateField('segmento', (v as Parceiro['segmento']) || 'baixo')}
                  options={[
                    { value: 'alto', label: 'Alto Valor' },
                    { value: 'medio', label: 'Médio Valor' },
                    { value: 'baixo', label: 'Baixo Valor' },
                    { value: 'inativo', label: 'Inativo' },
                  ]} />
                <TextAreaField label="Observação" value={form.observacao} onChange={v => updateField('observacao', v)} className="md:col-span-4" />
              </div>
            </Section>

            <Section title="Bloqueios e Mensageria">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <CheckboxField label="Bloquear vendas e emissão de protocolo" checked={form.bloquear_vendas_protocolos} onChange={v => updateField('bloquear_vendas_protocolos', v)} />
                <CheckboxField label="Não enviar WhatsApp das minhas vendas" checked={form.nao_enviar_whatsapp_vendas} onChange={v => updateField('nao_enviar_whatsapp_vendas', v)} />
                <CheckboxField label="Não enviar e-mail das minhas vendas" checked={form.nao_enviar_email_vendas} onChange={v => updateField('nao_enviar_email_vendas', v)} />
                <CheckboxField label="Não enviar WhatsApp/e-mail de renovação para meus clientes" checked={form.nao_enviar_renovacao_clientes} onChange={v => updateField('nao_enviar_renovacao_clientes', v)} />
                <CheckboxField label="Não quero receber WhatsApp" checked={form.nao_quero_receber_whatsapp} onChange={v => updateField('nao_quero_receber_whatsapp', v)} />
                <CheckboxField label="Não quero receber e-mail" checked={form.nao_quero_receber_email} onChange={v => updateField('nao_quero_receber_email', v)} />
              </div>
            </Section>

            <Section title="Gestor(es) do Parceiro">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <SelectField label="Gestor 01" value={form.gestor_1_id} onChange={v => updateField('gestor_1_id', v)} options={gestorOptions(gestores)} />
                <SelectField label="Gestor 02" value={form.gestor_2_id} onChange={v => updateField('gestor_2_id', v)} options={gestorOptions(gestores)} />
                <SelectField label="Gestor 03" value={form.gestor_3_id} onChange={v => updateField('gestor_3_id', v)} options={gestorOptions(gestores)} />
                <SelectField label="Gestor 04" value={form.gestor_4_id} onChange={v => updateField('gestor_4_id', v)} options={gestorOptions(gestores)} />
                <SelectField label="Gestor 05" value={form.gestor_5_id} onChange={v => updateField('gestor_5_id', v)} options={gestorOptions(gestores)} />
              </div>
            </Section>

            <Section title="Dados Bancários">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <SelectField label="Tipo Conta" value={form.tipo_conta} onChange={v => updateField('tipo_conta', (v as TipoContaBancaria) || null)}
                  options={TIPO_CONTA_OPTIONS} />
                <SelectField label="Banco" value={form.banco_id} onChange={v => updateField('banco_id', v)}
                  options={[{ value: '', label: 'Selecione o Banco' }, ...bancos.map(b => ({ value: b.id, label: `${b.codigo} - ${b.nome}` }))]} className="md:col-span-2" />
                <TextField label="Agência" value={form.agencia} onChange={v => updateField('agencia', v)} />
                <TextField label="Dígito Agência" value={form.agencia_digito} onChange={v => updateField('agencia_digito', v)} />
                <TextField label="Conta" value={form.conta} onChange={v => updateField('conta', v)} />
                <TextField label="Dígito Conta" value={form.conta_digito} onChange={v => updateField('conta_digito', v)} />
                <TextField label="Operação" value={form.operacao} onChange={v => updateField('operacao', v)} />
                <TextField label="CNPJ/CPF Titular" value={form.cnpj_cpf_titular} onChange={v => updateField('cnpj_cpf_titular', v)} />
                <TextField label="Titular da Conta" value={form.titular_conta} onChange={v => updateField('titular_conta', v)} placeholder="Informe o Titular da Conta" className="md:col-span-2" />
                <TextField label="Chave Pix" value={form.chave_pix} onChange={v => updateField('chave_pix', v)} placeholder="Chave Pix do Parceiro" className="md:col-span-2" />
              </div>
            </Section>

            <Section title="Centro de custos para associar vendas e cobranças">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SelectField
                  label="Centro de Custos"
                  value={form.centro_custo_id}
                  onChange={v => updateField('centro_custo_id', v)}
                  options={[{ value: '', label: 'Selecione o Centro de Custos' }, ...centros.map(c => ({ value: c.id, label: c.nome }))]}
                />
              </div>
            </Section>

            {editingId && (
              <Section title="Agentes de Registro Permitidos para este Parceiro">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  Essa regra limita quais agentes de registro poderão atender vendas e validações deste parceiro, vendedor ou contador.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <SelectField
                    label="Agente"
                    value={formAgente.agente_registro_id}
                    onChange={v => setFormAgente(prev => ({ ...prev, agente_registro_id: v ?? '' }))}
                    options={[
                      { value: '', label: 'Selecione o agente' },
                      ...gestores
                        .filter(g => g.perfil === 'agente_registro')
                        .map(g => ({ value: g.id, label: g.nome })),
                    ]}
                  />
                  <SelectField
                    label="Ponto preferencial"
                    value={formAgente.ponto_atendimento_id}
                    onChange={v => setFormAgente(prev => ({ ...prev, ponto_atendimento_id: v ?? '' }))}
                    options={[
                      { value: '', label: 'Sem ponto fixo' },
                      ...pontos.map(p => ({ value: p.id, label: p.nome })),
                    ]}
                  />
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => void salvarAgentePermitido()}
                      disabled={salvandoAgente || !formAgente.agente_registro_id}
                      className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {salvandoAgente ? 'Salvando…' : 'Vincular agente'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {agentesPermitidos.filter(item => item.parceiro_id === editingId).length === 0 ? (
                    <p className="text-sm text-gray-400">Nenhum agente vinculado ainda.</p>
                  ) : (
                    agentesPermitidos
                      .filter(item => item.parceiro_id === editingId)
                      .map(item => {
                        const agente = gestores.find(g => g.id === item.agente_registro_id)
                        const ponto = pontos.find(p => p.id === item.ponto_atendimento_id)
                        return (
                          <div key={item.id} className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3">
                            <div>
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{agente?.nome ?? item.agente_registro_id}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400">{ponto?.nome ?? 'Sem ponto preferencial'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                'px-2 py-0.5 rounded-full text-xs font-medium',
                                item.ativo
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
                              )}>
                                {item.ativo ? 'Ativo' : 'Inativo'}
                              </span>
                              <button
                                type="button"
                                onClick={() => void toggleAgentePermitido(item)}
                                className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                              >
                                <PowerOff size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void excluirAgentePermitido(item.id)}
                                className="p-1.5 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        )
                      })
                  )}
                </div>
              </Section>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => void salvar()}
                disabled={salvando || !canManage}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {salvando ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Salvar parceiro'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); setForm({ ...EMPTY }) }}
                className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 rounded-lg p-4 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide text-left">
                  {['Ações', 'Código', 'Parceiro', 'Documento', 'Tipo', 'Cidade', 'Vendas/Protocolos', 'Receita/Mês', 'Status', 'Ativação'].map(h => (
                    <th key={h} className="px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <tr><td colSpan={10} className="px-5 py-8 text-center text-gray-400 animate-pulse">Carregando…</td></tr>
                ) : filtrado.length === 0 ? (
                  <tr><td colSpan={10} className="px-5 py-8 text-center text-gray-400">Nenhum parceiro encontrado.</td></tr>
                ) : filtrado.map(parceiro => {
                  const seg = SEG_CONFIG[parceiro.segmento]
                  return (
                    <tr key={parceiro.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            title="Editar parceiro"
                            onClick={() => abrirEditar(parceiro)}
                            disabled={!canManage}
                            className="p-1.5 rounded-md text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20 disabled:opacity-40"
                          >
                            <Edit3 size={13} />
                          </button>
                          <button
                            type="button"
                            title={parceiro.status === 'ativo' ? 'Desativar parceiro' : 'Ativar parceiro'}
                            onClick={() => void toggleStatus(parceiro)}
                            disabled={!canManage}
                            className="p-1.5 rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 disabled:opacity-40"
                          >
                            <PowerOff size={13} />
                          </button>
                          <button
                            type="button"
                            title="Excluir parceiro"
                            onClick={() => void iniciarExcluir(parceiro)}
                            disabled={!canManage}
                            className="p-1.5 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 disabled:opacity-40"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{parceiro.codigo_parceiro ?? '—'}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{parceiro.razao_social ?? parceiro.nome}</p>
                        <p className="text-xs text-gray-400">{parceiro.nome_fantasia ?? parceiro.email_acesso ?? parceiro.email ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{parceiro.cpf_cnpj ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {TIPO_PARCEIRO_OPTIONS.find(item => item.value === parceiro.tipo_parceiro)?.label ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{[parceiro.cidade, parceiro.estado].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'px-2 py-0.5 rounded-full text-xs font-medium',
                          parceiro.bloquear_vendas_protocolos
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                        )}>
                          {parceiro.bloquear_vendas_protocolos ? 'Bloqueado' : 'Liberado'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-green-600 dark:text-green-400">
                        {parceiro.receita_mes > 0 ? `R$ ${Number(parceiro.receita_mes).toLocaleString('pt-BR')}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', seg.cls)}>{seg.label}</span>
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-medium',
                            parceiro.status === 'ativo'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
                          )}>
                            {parceiro.status === 'ativo' ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(parceiro.data_ativacao ?? parceiro.desde)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal excluir / inativar */}
      {acaoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0',
                acaoModal.tipo === 'excluir'
                  ? 'bg-red-100 dark:bg-red-900/30'
                  : 'bg-yellow-100 dark:bg-yellow-900/30')}>
                {acaoModal.tipo === 'excluir'
                  ? <Trash2 size={18} className="text-red-600 dark:text-red-400" />
                  : <PowerOff size={18} className="text-yellow-600 dark:text-yellow-400" />}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {acaoModal.tipo === 'excluir' ? 'Excluir parceiro' : 'Inativar parceiro'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {acaoModal.tipo === 'excluir' ? 'Esta ação não pode ser desfeita.' : 'O parceiro continuará no histórico.'}
                </p>
              </div>
            </div>

            {acaoModal.tipo === 'inativar' && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl px-4 py-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-300 font-medium">
                  ⚠️ Este parceiro possui <strong>{acaoModal.vinculosCount} venda{acaoModal.vinculosCount !== 1 ? 's' : ''}</strong> vinculada{acaoModal.vinculosCount !== 1 ? 's' : ''} no sistema.
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-400 mt-1">
                  Por isso ele não pode ser excluído. Ao inativar, ele fica oculto nas operações mas o histórico é preservado.
                </p>
              </div>
            )}

            <p className="text-sm text-gray-700 dark:text-gray-300">
              {acaoModal.tipo === 'excluir'
                ? <>Confirma a exclusão permanente de <strong className="text-gray-900 dark:text-white">{acaoModal.parceiro.razao_social ?? acaoModal.parceiro.nome}</strong>?</>
                : <>Deseja inativar <strong className="text-gray-900 dark:text-white">{acaoModal.parceiro.razao_social ?? acaoModal.parceiro.nome}</strong>?</>}
            </p>

            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setAcaoModal(null)} disabled={executando}
                className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors">
                Cancelar
              </button>
              <button type="button" onClick={() => void confirmarAcao()} disabled={executando}
                className={cn('flex-1 px-4 py-2.5 text-sm rounded-xl text-white font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60',
                  acaoModal.tipo === 'excluir'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-yellow-500 hover:bg-yellow-600')}>
                {executando
                  ? <RefreshCw size={14} className="animate-spin" />
                  : acaoModal.tipo === 'excluir'
                    ? <><Trash2 size={14} /> Excluir</>
                    : <><PowerOff size={14} /> Inativar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">{title}</h4>
      {children}
    </section>
  )
}

function TextField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  type = 'text',
  className,
}: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  onBlur?: () => void
  placeholder?: string
  type?: string
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>
  )
}

function TextAreaField({
  label,
  value,
  onChange,
  className,
}: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <textarea
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        rows={3}
        className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

function gestorOptions(gestores: GestorOption[]) {
  return [
    { value: '', label: 'Selecione' },
    ...gestores.map(gestor => ({ value: gestor.id, label: `${gestor.nome} (${gestor.perfil})` })),
  ]
}

function cleanText(value: string | null) {
  return value?.trim() ? value.trim() : null
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR')
}
