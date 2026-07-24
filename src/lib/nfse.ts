import type { LancamentoV2, NfseConfiguracao, NfseEmitida, VendaCertificado } from '@/types'
import type { AgencyConfig } from '@/lib/agencyConfig'

export type NfseModeloLayout = {
  nome_modelo: string
  titulo: string
  subtitulo: string
  cor_primaria: string
  mostrar_logo: boolean
  bloco_servico_titulo: string
  mensagem_destaque: string
  observacao_padrao: string
  rodape: string
}

export type NfseEmissionTrigger =
  | 'manual'
  | 'antes_pagamento'
  | 'apos_pagamento'
  | 'apos_agendamento'
  | 'apos_validacao'
  | 'apos_protocolo'
  | 'apos_emissao_certificado'

export type NfseAutomationSettings = {
  gatilho_emissao: NfseEmissionTrigger
  permitir_emissao_manual_rapida: boolean
  permitir_emissao_lote_comercial: boolean
  permitir_emissao_manual_fora_etapa: boolean
  exigir_justificativa_fora_etapa: boolean
}

export const DEFAULT_NFSE_MODELO: NfseModeloLayout = {
  nome_modelo: 'Modelo CertiID Municipal',
  titulo: 'NOTA FISCAL ELETRONICA DE SERVICOS - NFS-e',
  subtitulo: 'Modelo visual inspirado no padrao municipal',
  cor_primaria: '#6b7280',
  mostrar_logo: true,
  bloco_servico_titulo: 'Discriminacao dos Servicos',
  mensagem_destaque: 'Documento fiscal de servicos com layout institucional e campos padronizados.',
  observacao_padrao: 'Confira os dados do tomador, a descricao do servico e a tributacao antes da emissao definitiva.',
  rodape: 'Modelo visual interno para operacao fiscal e comercial da CertiID.',
}

export const DEFAULT_NFSE_AUTOMATION_SETTINGS: NfseAutomationSettings = {
  gatilho_emissao: 'apos_validacao',
  permitir_emissao_manual_rapida: true,
  permitir_emissao_lote_comercial: true,
  permitir_emissao_manual_fora_etapa: true,
  exigir_justificativa_fora_etapa: true,
}

export function normalizeNfseModeloLayout(
  value: Partial<NfseModeloLayout> | null | undefined
): NfseModeloLayout {
  return {
    ...DEFAULT_NFSE_MODELO,
    ...(value ?? {}),
  }
}

export function normalizeNfseAutomationSettings(
  value: Partial<NfseAutomationSettings> | null | undefined
): NfseAutomationSettings {
  return {
    ...DEFAULT_NFSE_AUTOMATION_SETTINGS,
    ...(value ?? {}),
  }
}

function onlyDigits(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '')
}

function formatDocument(value: string | null | undefined) {
  const digits = onlyDigits(value)
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }
  return value?.trim() ?? ''
}

export function formatTipoEmissaoLabel(value: string | null | undefined) {
  switch ((value ?? '').toLowerCase()) {
    case 'videoconferencia':
      return 'Videoconferencia'
    case 'auto_atendimento':
      return 'Autoatendimento'
    case 'presencial':
      return 'Presencial'
    case 'online':
      return 'Online'
    default:
      return value?.trim() ?? ''
  }
}

type NfseDiscriminacaoVendaOptions = {
  produtoDescricao?: string | null
  produtoModelo?: string | null
  validade?: string | null
  tipoEmissao?: string | null
}

export function buildNfseDiscriminacaoFromVenda(
  venda: Partial<VendaCertificado> | null | undefined,
  options?: NfseDiscriminacaoVendaOptions
) {
  const produtoBase = options?.produtoDescricao?.trim()
    || venda?.tipo_produto?.trim()
    || 'certificado digital'
  const produtoModelo = options?.produtoModelo?.trim()
  const validade = options?.validade?.trim()
  const tipoEmissao = formatTipoEmissaoLabel(options?.tipoEmissao ?? venda?.tipo_emissao)

  const linhas = [
    `Tipo: ${produtoBase}.`,
    produtoModelo ? `Modelo: ${produtoModelo}.` : '',
    validade ? `Validade: ${validade}.` : '',
    tipoEmissao ? `Tipo de emissao: ${tipoEmissao}.` : '',
  ].filter(Boolean)

  return linhas.join('\n')
}

export function buildNfseDiscriminacaoFromLancamento(
  lancamento: Partial<LancamentoV2> | null | undefined
) {
  const descricao = lancamento?.descricao?.trim()
  if (descricao) {
    return `Servico faturado: ${descricao}.`
  }
  return 'Servico faturado conforme lancamento financeiro registrado.'
}

type PreviewParty = {
  nome: string
  documento: string
  inscricaoMunicipal: string
  telefone: string
  email: string
  endereco: string
  complemento: string
  municipio: string
}

export type NfsePreviewData = {
  cabecalhoMunicipio: string
  cabecalhoSecretaria: string
  numeroNf: string
  dataEmissao: string
  competencia: string
  codigoVerificacao: string
  localPrestacao: string
  discriminacaoServicos: string
  codigoServico: string
  naturezaOperacao: string
  regimeEspecial: string
  simplesNacional: string
  incentivadorCultural: string
  issRetido: string
  valorServicos: number
  baseCalculo: number
  aliquotaIss: number
  valorIss: number
  valorLiquido: number
  prestador: PreviewParty
  tomador: PreviewParty
  avisos: string
}

function formatAddress(parts: Array<string | null | undefined>) {
  return parts.map(part => part?.trim()).filter(Boolean).join(', ')
}

function buildPreviewPartyFromVenda(venda: Partial<VendaCertificado> | null | undefined): PreviewParty {
  return {
    nome: venda?.nome_faturamento?.trim() || 'Tomador nao informado',
    documento: formatDocument(venda?.documento_faturamento),
    inscricaoMunicipal: venda?.inscricao_municipal?.trim() || '',
    telefone: venda?.telefone_faturamento?.trim() || '',
    email: venda?.email_faturamento?.trim() || '',
    endereco: formatAddress([venda?.logradouro, venda?.numero, venda?.bairro, venda?.cep ? `CEP ${venda.cep}` : null]),
    complemento: venda?.complemento?.trim() || '',
    municipio: [venda?.cidade?.trim(), venda?.uf?.trim()].filter(Boolean).join(' - '),
  }
}

function buildPreviewPartyFromConfig(configuracao: Partial<NfseConfiguracao> | null | undefined): PreviewParty {
  const metadata = ((configuracao?.payload_reforma_tributaria ?? {}) as Record<string, unknown>)
  return {
    nome: configuracao?.razao_social_emitente?.trim() || String(metadata.razao_social ?? metadata.nome_emitente ?? configuracao?.identificador ?? 'Emitente nao configurado'),
    documento: formatDocument(configuracao?.cnpj_emitente),
    inscricaoMunicipal: configuracao?.inscricao_municipal?.trim() || '',
    telefone: configuracao?.telefone_emitente?.trim() || String(metadata.telefone ?? ''),
    email: configuracao?.email_emitente?.trim() || String(metadata.email ?? ''),
    endereco: configuracao?.endereco_emitente?.trim() || String(metadata.endereco ?? ''),
    complemento: configuracao?.complemento_emitente?.trim() || String(metadata.complemento ?? ''),
    municipio: configuracao?.municipio_nome?.trim() || '',
  }
}

function extractNestedObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function partyFromPayload(payload: Record<string, unknown>, key: 'tomador' | 'emitente'): Partial<PreviewParty> {
  const data = extractNestedObject(payload[key])
  return {
    nome: String(data.nome ?? ''),
    documento: String(data.documento ?? ''),
    inscricaoMunicipal: String(data.inscricao_municipal ?? ''),
    telefone: String(data.telefone ?? ''),
    email: String(data.email ?? ''),
    endereco: String(data.endereco ?? ''),
    complemento: String(data.complemento ?? ''),
    municipio: String(data.municipio ?? ''),
  }
}

function currencyNumber(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function buildNfsePreviewData(params: {
  modelo?: Partial<NfseModeloLayout> | null
  configuracao?: Partial<NfseConfiguracao> | null
  nota?: Partial<NfseEmitida> | null
  venda?: Partial<VendaCertificado> | null
  fallbackDiscriminacao?: string | null
  agency?: Partial<AgencyConfig> | null
}) {
  const modelo = normalizeNfseModeloLayout(params.modelo)
  const notaPayload = extractNestedObject(params.nota?.payload_envio)
  const notaMetadata = extractNestedObject(params.nota?.metadata)
  const fiscal = extractNestedObject(notaMetadata.fiscal)
  const emitentePayload = partyFromPayload(notaPayload, 'emitente')
  const tomadorPayload = partyFromPayload(notaPayload, 'tomador')

  const prestadorBase = buildPreviewPartyFromConfig(params.configuracao)
  const tomadorBase = buildPreviewPartyFromVenda(params.venda)
  const valorServicos = currencyNumber(params.nota?.valor_servico ?? params.venda?.valor_venda)
  const aliquotaIss = currencyNumber(fiscal.aliquota_iss ?? params.configuracao?.aliquota_iss)
  const valorIss = currencyNumber(params.nota?.valor_iss ?? (valorServicos * aliquotaIss) / 100)

  const discriminacaoServicos =
    String(notaPayload.discriminacao_servicos ?? '').trim()
    || String(notaMetadata.discriminacao_servicos ?? '').trim()
    || params.fallbackDiscriminacao?.trim()
    || buildNfseDiscriminacaoFromVenda(params.venda)

  const cabecalhoMunicipio = params.configuracao?.municipio_nome?.trim()
    ? `MUNICIPIO DE ${params.configuracao.municipio_nome.trim().toUpperCase()}`
    : 'MUNICIPIO DE SUA PREFEITURA'

  const cabecalhoSecretaria = String(fiscal.secretaria_titulo ?? 'SECRETARIA DE FINANCAS')
  const numeroNf = params.nota?.numero_nf?.trim() || 'PREVIA'
  const dataEmissao = params.nota?.data_emissao?.trim() || new Date().toISOString()
  const competencia = dataEmissao.slice(0, 10)
  const codigoVerificacao = params.nota?.codigo_verificacao?.trim() || 'AGUARDANDO'
  const localPrestacao = String(fiscal.local_prestacao ?? params.configuracao?.municipio_nome ?? 'Nao informado')
  const codigoServico = String(
    notaPayload.codigo_servico_municipio
    ?? fiscal.codigo_servico_municipio
    ?? params.configuracao?.codigo_servico_municipio
    ?? '1.03'
  )

  return {
    cabecalhoMunicipio,
    cabecalhoSecretaria,
    numeroNf,
    dataEmissao,
    competencia,
    codigoVerificacao,
    localPrestacao,
    discriminacaoServicos,
    codigoServico,
    naturezaOperacao: String(fiscal.natureza_operacao ?? params.configuracao?.natureza_operacao ?? '1 - Tributacao no municipio'),
    regimeEspecial: String(fiscal.regime_especial ?? params.configuracao?.regime_especial ?? '0 - Nenhum'),
    simplesNacional: params.configuracao?.simples_nacional ? '1 - Sim' : '2 - Nao',
    incentivadorCultural: params.configuracao?.incentivo_fiscal ? '1 - Sim' : '2 - Nao',
    issRetido: params.venda?.iss_retido ? '1 - Sim' : '2 - Nao',
    valorServicos,
    baseCalculo: valorServicos,
    aliquotaIss,
    valorIss,
    valorLiquido: Math.max(valorServicos - valorIss, 0),
    prestador: {
      ...prestadorBase,
      ...emitentePayload,
      nome: emitentePayload.nome || prestadorBase.nome || params.agency?.nome_agencia?.trim() || 'Emitente nao configurado',
      documento: formatDocument(emitentePayload.documento || prestadorBase.documento),
      telefone: emitentePayload.telefone || prestadorBase.telefone || params.agency?.telefone?.trim() || '',
      municipio: emitentePayload.municipio || prestadorBase.municipio || params.agency?.cidade?.trim() || '',
    },
    tomador: {
      ...tomadorBase,
      ...tomadorPayload,
      nome: tomadorPayload.nome || tomadorBase.nome,
      documento: formatDocument(tomadorPayload.documento || tomadorBase.documento),
    },
    avisos: `${modelo.observacao_padrao}\n${modelo.rodape}`.trim(),
  } satisfies NfsePreviewData
}

export function isNfseEmissionAllowed(params: {
  gatilho: NfseEmissionTrigger
  venda: {
    pago?: boolean | null
    protocolo_numero?: string | null
    tipo_produto?: string | null
    status_venda?: string | null
  }
  agendamentoStatus?: string | null
}) {
  const { gatilho, venda, agendamentoStatus } = params
  const produto = String(venda.tipo_produto ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  const dispensaValidacao = [
    'token',
    'cartao',
    'cartão',
    'midia',
    'mídia',
    'visita tecnica',
    'visita técnica',
  ].some(term => produto.includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))

  if (gatilho === 'manual') {
    return {
      allowed: true,
      reason: '',
    }
  }

  if (gatilho === 'antes_pagamento') {
    return !venda.pago
      ? { allowed: true, reason: '' }
      : { allowed: false, reason: 'A nota está configurada para emissão antes do pagamento. Após a compensação, use a emissão manual ou outro gatilho.' }
  }

  if (gatilho === 'apos_pagamento') {
    return venda.pago
      ? { allowed: true, reason: '' }
      : { allowed: false, reason: 'A nota está configurada para emissão somente após a compensação do pagamento.' }
  }

  if (gatilho === 'apos_agendamento') {
    if (dispensaValidacao) {
      return { allowed: true, reason: '' }
    }
    return ['confirmado', 'realizado'].includes(String(agendamentoStatus ?? ''))
      ? { allowed: true, reason: '' }
      : { allowed: false, reason: 'A nota está configurada para emissão somente após o agendamento da validação.' }
  }

  if (gatilho === 'apos_validacao') {
    if (dispensaValidacao) {
      return { allowed: true, reason: '' }
    }
    return String(agendamentoStatus ?? '') === 'realizado'
      ? { allowed: true, reason: '' }
      : { allowed: false, reason: 'A nota está configurada para emissão somente após a validação realizada pelo agente de registro.' }
  }

  if (gatilho === 'apos_protocolo') {
    return venda.protocolo_numero?.trim()
      ? { allowed: true, reason: '' }
      : { allowed: false, reason: 'A nota está configurada para emissão somente após a geração do protocolo.' }
  }

  if (gatilho === 'apos_emissao_certificado') {
    return String(venda.status_venda ?? '').trim() === 'emitido'
      ? { allowed: true, reason: '' }
      : { allowed: false, reason: 'A nota está configurada para emissão somente após o certificado ser emitido.' }
  }

  return {
    allowed: false,
    reason: 'A etapa atual ainda não permite a emissão da nota.',
  }
}
