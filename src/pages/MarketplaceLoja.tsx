import { useEffect, useMemo, useRef, useState } from 'react'
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Store,
  ShoppingCart,
  Tag,
  UserRound,
  Wallet,
} from 'lucide-react'
import { buscarCep } from '@/lib/cep'
import { buscarCnpj } from '@/lib/cnpj'
import { cn } from '@/lib/utils'
import { getApiUrl } from '@/lib/api'
import { DEFAULT_AGENCY_CONFIG, fetchAgencyConfig, type AgencyConfig } from '@/lib/agencyConfig'
import type { LojaMarketplace, TabelaPreco } from '@/types'
import { getProductProfile, loadMarketplaceCheckoutContext, lookupExistingCheckoutCustomer, submitMarketplaceCheckout, type AgendaAgent, type AgendaPoint, type AgendaSlot, type LojaItemRow, type PaymentOption, type PaymentRuntime } from '@/lib/checkout'
import {
  GuidedField,
  ChoiceCard,
  formatDateTime,
  InfoLine,
  InfoMini,
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
  conectividade_social: string
  documento_identidade: string
  titulo_eleitor_uf: string
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
  conectividade_social: '',
  documento_identidade: '',
  titulo_eleitor_uf: '',
}

const BRAZIL_STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

function checkoutNotes(form: FormState) {
  const notes = [form.observacoes.trim()]
  if (form.conectividade_social) notes.push(`Conectividade Social: ${form.conectividade_social}`)
  if (form.documento_identidade) notes.push(`Documento de identidade: ${form.documento_identidade}`)
  if (form.titulo_eleitor_uf) notes.push(`UF do título de eleitor: ${form.titulo_eleitor_uf}`)
  return notes.filter(Boolean).join('\n') || null
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
  const normalized = normalizedSearch(tipo)
  if (/renov/.test(normalized)) return 'Renovação on-line'
  if (/fast/.test(normalized)) return 'Fast'
  if (/presencial|balcao|balcao|loja|posto/.test(normalized)) return 'Presencial'
  if (/online|video|remot|videoconferencia/.test(normalized)) return 'Videoconferência'
  return tipo
}

function productServiceMode(item: LojaItemRow) {
  return labelEmissao(item.certificados?.tipo_emissao_padrao) ?? 'Outros'
}

function normalizedProductValidity(item: LojaItemRow) {
  const raw = normalizedSearch(productValidity(item))
  if (/4/.test(raw)) return '4 meses'
  if (/12|1 ano/.test(raw)) return '12 meses'
  if (/24|2 anos/.test(raw)) return '24 meses'
  return productValidity(item)
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

function publicPaymentLabel(option: PaymentOption | null | undefined) {
  const source = `${option?.nome ?? ''} ${option?.codigo ?? ''} ${option?.tipo ?? ''}`.toLowerCase()
  if (source.includes('pix')) return 'Pix'
  if (source.includes('boleto')) return 'Boleto'
  if (source.includes('card') || source.includes('cart')) return 'Cartão'
  return option?.nome?.replace(/\s*-\s*mercado pago\s*/i, '').trim() || 'Pagamento'
}

function normalizedSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function productKind(item: LojaItemRow) {
  return getProductProfile(item.certificados ?? null).kind
}

function detectCertificateCategory(value: string) {
  const raw = normalizedSearch(value)
  if (/safeid|nuvem|cloud/.test(raw)) return 'SafeID'
  if (/\bnf[\s-]?e\b|\bnfe\b|nota fiscal|\be[\s-]?pj\b/.test(raw)) return 'e-PJ'
  if (/\bmei\b/.test(raw)) return 'e-CNPJ'
  if (/e[\s-]?medico|medico|e[\s-]?juridico|e[\s-]?engenheiro|engenheiro|e[\s-]?saude|saude|e[\s-]?arquiteto|arquiteto/.test(raw)) return 'e-CPF'
  if (/\be[\s-]?cnpj\b/.test(raw)) return 'e-CNPJ'
  if (/\be[\s-]?cpf\b/.test(raw)) return 'e-CPF'
  if (/\be[\s-]?pf\b/.test(raw)) return 'e-PF'
  return ''
}

const certificateOrder = ['e-CPF', 'e-PF', 'e-CNPJ', 'e-PJ', 'SafeID']

function certificateSort(a: string, b: string) {
  const ai = certificateOrder.indexOf(a)
  const bi = certificateOrder.indexOf(b)
  return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b)
}

function certificateOptionLabel(option: string) {
  return option === 'SafeID' ? 'SafeID / Nuvem' : option
}

function productCertificateCategory(item: LojaItemRow) {
  const cert = item.certificados
  const identityCategory = detectCertificateCategory([
    cert?.tipo,
    cert?.categoria,
    cert?.modelo,
  ].filter(Boolean).join(' '))
  if (identityCategory) return identityCategory

  const fallbackCategory = detectCertificateCategory([
    cert?.descricao_produto,
    cert?.descricao,
  ].filter(Boolean).join(' '))
  if (fallbackCategory) return fallbackCategory

  return productKind(item)
}

function productCertificateClass(item: LojaItemRow) {
  return getProductProfile(item.certificados ?? null).certificateClass
}

function productCommercialDescription(item: LojaItemRow) {
  return getProductProfile(item.certificados ?? null).commercialDescription
}

function productValidity(item: LojaItemRow) {
  return getProductProfile(item.certificados ?? null).validity
}

function productGuidance(item: LojaItemRow) {
  const profile = getProductProfile(item.certificados ?? null)
  const category = productCertificateCategory(item)
  const isSafeId = profile.kind === 'SafeID'
  const isNfe = /pj/i.test(category)
  const isCompany = /cnpj|pj/i.test(category)
  const productText = normalizedSearch([
    item.certificados?.tipo,
    item.certificados?.descricao,
    item.certificados?.descricao_produto,
    item.certificados?.categoria,
    item.certificados?.modelo,
  ].filter(Boolean).join(' '))
  const mediaGuidance = (() => {
    if (/safeid|nuvem|cloud/.test(productText)) {
      return {
        label: 'Formato do produto: certificado em nuvem',
        paragraphs: [
          'Este produto não acompanha token, cartão ou leitora física. O certificado fica disponível em nuvem e o uso depende da autenticação do titular.',
          'É indicado para quem precisa mobilidade e quer evitar instalação local ou dependência de mídia física.',
        ],
      }
    }
    if (/cartao.*leitora|cartão.*leitora|leitora.*cartao|leitora.*cartão/.test(productText)) {
      return {
        label: 'Formato do produto: cartão + leitora',
        paragraphs: [
          'Este produto acompanha o certificado gravado em cartão e a leitora necessária para uso no computador.',
          'É indicado para quem ainda não possui leitora compatível ou quer receber o conjunto completo para utilização do certificado A3.',
        ],
      }
    }
    if (/token/.test(productText)) {
      return {
        label: 'Formato do produto: token',
        paragraphs: [
          'Este produto acompanha mídia token USB, onde o certificado fica armazenado com segurança.',
          'É indicado para uso em computadores compatíveis com o dispositivo e exige a instalação dos drivers ou componentes necessários para funcionamento.',
        ],
      }
    }
    if (/cartao|cartão|smartcard/.test(productText)) {
      return {
        label: 'Formato do produto: cartão',
        paragraphs: [
          'Este produto acompanha o certificado em cartão/smartcard. Para utilizar no computador, é necessário possuir uma leitora compatível.',
          'Se o cliente não tiver leitora, deve escolher uma opção que inclua cartão + leitora ou adquirir a leitora separadamente.',
        ],
      }
    }
    if (/sem midia|sem mídia/.test(productText)) {
      return {
        label: 'Formato do produto: A3 sem mídia',
        paragraphs: [
          'Este produto é destinado a quem já possui uma mídia compatível, como token ou cartão, e precisa apenas emitir ou renovar o certificado.',
          'Antes de seguir, confirme se a mídia existente está funcionando, é aceita pela Autoridade Certificadora e está disponível para uso durante a emissão.',
        ],
      }
    }
    if (/arquivo|instalado|computador|\ba1\b/.test(productText)) {
      return {
        label: 'Formato do produto: arquivo instalado no computador',
        paragraphs: [
          'Este produto é emitido em arquivo digital, normalmente instalado no computador do titular ou responsável.',
          'É indicado para uso no equipamento onde será instalado. Recomendamos guardar a senha e o backup com segurança, pois a perda do arquivo pode exigir nova emissão.',
        ],
      }
    }
    if (/renova/.test(productText)) {
      return {
        label: 'Formato do produto: renovação',
        paragraphs: [
          'Este produto é voltado para renovação de certificado, aproveitando o cadastro e as condições permitidas pela Autoridade Certificadora.',
          'A renovação pode exigir validação adicional conforme regras da emissão, validade, mídia e situação cadastral do titular ou empresa.',
        ],
      }
    }
    return {
      label: 'Formato do produto',
      paragraphs: [
        'A composição final do certificado depende da opção escolhida: arquivo, nuvem, token, cartão, cartão com leitora ou emissão sem mídia.',
        'Confira o nome do produto, tipo, atendimento e validade antes de avançar para garantir que a opção selecionada atende ao uso desejado.',
      ],
    }
  })()
  const professionalGuidance = [
    {
      test: /medico/,
      title: 'e-Médico',
      description: [
        'Certificado digital para médicos e profissionais vinculados à área médica que precisam assinar documentos eletrônicos com identificação profissional.',
        'É indicado para rotinas como assinatura de laudos, receitas, prontuários, declarações e acesso a plataformas de saúde que exigem certificado digital.',
        'Na prática, funciona como a identidade eletrônica do profissional, ajudando a comprovar autoria, integridade e validade jurídica dos documentos assinados.',
        mediaGuidance.label,
        ...mediaGuidance.paragraphs,
      ],
      benefits: [
        'Assinar receitas, laudos, atestados e documentos médicos digitais com validade jurídica.',
        'Acessar sistemas e portais profissionais que exigem identificação segura.',
        'Agilizar atendimentos, autorizações e rotinas administrativas da prática médica.',
        'Reduzir papel e deslocamentos em processos que aceitam assinatura digital.',
      ],
      documents: [
        'Documento oficial com foto em bom estado.',
        'CPF do titular, quando não constar no documento apresentado.',
        'Carteira profissional ou comprovação de registro no conselho de classe, quando exigida.',
        'E-mail e WhatsApp válidos para contato e confirmação da emissão.',
      ],
    },
    {
      test: /juridico/,
      title: 'e-Jurídico',
      description: [
        'Certificado digital para advogados e profissionais jurídicos que precisam atuar em sistemas eletrônicos e assinar documentos digitais.',
        'É indicado para processos eletrônicos, peticionamento, procurações, contratos e demais rotinas jurídicas que exigem identificação segura.',
        'Ele permite que o profissional mantenha sua atuação digital com segurança, rastreabilidade e reconhecimento nos ambientes que aceitam certificação ICP-Brasil.',
        mediaGuidance.label,
        ...mediaGuidance.paragraphs,
      ],
      benefits: [
        'Acessar sistemas de processo eletrônico e portais jurídicos compatíveis.',
        'Assinar petições, procurações, contratos e documentos profissionais.',
        'Dar mais agilidade à atuação jurídica sem depender de presença física.',
        'Manter rastreabilidade e validade jurídica nas assinaturas digitais.',
      ],
      documents: [
        'Documento oficial com foto em bom estado.',
        'CPF do titular, quando não constar no documento apresentado.',
        'Carteira da OAB ou comprovação profissional equivalente, quando exigida.',
        'E-mail e WhatsApp válidos para contato e confirmação da emissão.',
      ],
    },
    {
      test: /engenheiro/,
      title: 'e-Engenheiro',
      description: [
        'Certificado digital para engenheiros e profissionais técnicos que precisam assinar projetos, laudos e documentos eletrônicos.',
        'É indicado para rotinas profissionais que exigem identificação digital e comprovação de autoria em documentos técnicos.',
        'Ajuda a substituir assinaturas físicas em fluxos digitais, mantendo segurança, validade jurídica e identificação do responsável técnico.',
        mediaGuidance.label,
        ...mediaGuidance.paragraphs,
      ],
      benefits: [
        'Assinar projetos, laudos, relatórios e documentos técnicos digitalmente.',
        'Acessar plataformas e serviços que exigem certificado digital do profissional.',
        'Ganhar agilidade na entrega de documentos e aprovações técnicas.',
        'Reduzir impressões, deslocamentos e etapas manuais no fluxo profissional.',
      ],
      documents: [
        'Documento oficial com foto em bom estado.',
        'CPF do titular, quando não constar no documento apresentado.',
        'Carteira profissional ou comprovação de registro no conselho de classe, quando exigida.',
        'E-mail e WhatsApp válidos para contato e confirmação da emissão.',
      ],
    },
    {
      test: /saude/,
      title: 'e-Saúde',
      description: [
        'Certificado digital para profissionais e serviços da área da saúde que precisam assinar e acessar sistemas digitais com segurança.',
        'É indicado para documentos, registros e plataformas que exigem autenticação eletrônica do profissional.',
        'A emissão facilita a rotina digital do atendimento, protegendo dados sensíveis e confirmando a identidade de quem assina ou acessa o sistema.',
        mediaGuidance.label,
        ...mediaGuidance.paragraphs,
      ],
      benefits: [
        'Assinar documentos de saúde com segurança e validade jurídica.',
        'Acessar plataformas e sistemas que exigem autenticação digital.',
        'Facilitar rotinas clínicas, administrativas e de atendimento.',
        'Reduzir burocracia em processos digitais aceitos por órgãos e parceiros.',
      ],
      documents: [
        'Documento oficial com foto em bom estado.',
        'CPF do titular, quando não constar no documento apresentado.',
        'Carteira profissional ou comprovação de vínculo/registro, quando exigido.',
        'E-mail e WhatsApp válidos para contato e confirmação da emissão.',
      ],
    },
    {
      test: /arquiteto/,
      title: 'e-Arquiteto',
      description: [
        'Certificado digital para arquitetos que precisam assinar projetos, documentos técnicos e acessar serviços digitais profissionais.',
        'É indicado para dar validade jurídica e segurança à assinatura eletrônica de documentos ligados à atividade profissional.',
        'Permite formalizar entregas digitais, reduzir impressão de documentos e comprovar autoria em projetos, propostas, laudos e arquivos técnicos.',
        mediaGuidance.label,
        ...mediaGuidance.paragraphs,
      ],
      benefits: [
        'Assinar projetos, laudos, propostas e documentos técnicos digitalmente.',
        'Acessar sistemas e portais que exigem certificado digital do profissional.',
        'Agilizar aprovações e entregas sem depender de documentos físicos.',
        'Aumentar a segurança e a rastreabilidade da autoria dos documentos.',
      ],
      documents: [
        'Documento oficial com foto em bom estado.',
        'CPF do titular, quando não constar no documento apresentado.',
        'Carteira profissional ou comprovação de registro no conselho de classe, quando exigida.',
        'E-mail e WhatsApp válidos para contato e confirmação da emissão.',
      ],
    },
  ].find(entry => entry.test.test(productText))

  if (professionalGuidance) return professionalGuidance

  if (isSafeId) {
    return {
      title: 'SafeID / Nuvem',
      description: [
        'Certificado Digital em Nuvem para pessoa física ou jurídica, armazenado em ambiente seguro da Autoridade Certificadora.',
        'Permite usar o certificado pela internet, sem depender de token, cartão ou leitora física, mediante autenticação do titular.',
        'O acesso pode ser feito de diferentes dispositivos compatíveis, como computador, smartphone ou tablet, desde que o usuário consiga realizar a autenticação necessária.',
        'É uma alternativa prática para quem busca mobilidade, evita problemas com mídia física e precisa assinar ou acessar sistemas digitais com frequência.',
        mediaGuidance.label,
        ...mediaGuidance.paragraphs,
      ],
      benefits: [
        'Usar o certificado em computador, celular ou tablet com acesso à internet.',
        'Evitar perda, dano ou incompatibilidade de mídias físicas como token e cartão.',
        'Assinar documentos digitais e acessar serviços públicos ou privados com validade jurídica.',
        'Facilitar rotinas de empresas, profissionais e representantes que precisam mobilidade no uso.',
      ],
      documents: [
        'Documento oficial com foto do titular ou representante legal.',
        'CPF do titular, quando não constar no documento apresentado.',
        'E-mail e WhatsApp válidos para vinculação e confirmação do acesso.',
        'Para pessoa jurídica, apresentar contrato social ou documento empresarial equivalente.',
      ],
    }
  }

  if (isNfe) {
    return {
      title: 'e-PJ / NF-e',
      description: [
        'Certificado voltado para emissão de Nota Fiscal Eletrônica e rotinas fiscais da pessoa jurídica.',
        'É indicado para empresas que precisam emitir NF-e, acessar sistemas fiscais e cumprir obrigações digitais vinculadas ao CNPJ.',
        'Esse certificado identifica a empresa no ambiente eletrônico e permite realizar operações fiscais com autenticidade, integridade e segurança.',
        'Também pode ser exigido em integrações com emissores, contabilidades, sistemas de gestão e portais governamentais relacionados à emissão fiscal.',
        mediaGuidance.label,
        ...mediaGuidance.paragraphs,
      ],
      benefits: [
        'Emitir Nota Fiscal Eletrônica e transmitir obrigações fiscais com segurança.',
        'Acessar sistemas fiscais, portais governamentais e serviços vinculados à empresa.',
        'Reduzir retrabalho em processos fiscais e administrativos que exigem identificação digital.',
        'Representar a empresa em operações digitais com validade jurídica.',
      ],
      documents: [
        'Documento oficial com foto do representante legal.',
        'CPF do representante legal, quando não constar no documento apresentado.',
        'Contrato social, requerimento de empresário, estatuto/ata ou documento equivalente atualizado.',
        'Cartão CNPJ ou dados cadastrais da empresa para conferência.',
      ],
    }
  }

  if (/\bmei\b/.test(productText)) {
    return {
      title: 'e-CNPJ MEI',
      description: [
        'Certificado digital vinculado ao CNPJ do Microempreendedor Individual, usado para identificar a empresa no ambiente digital.',
        'É indicado para o MEI que precisa acessar serviços públicos, assinar documentos e cumprir rotinas digitais vinculadas ao CNPJ.',
        'Mesmo sendo uma empresa individual, o MEI usa o certificado para representar o CNPJ em ambientes eletrônicos que exigem autenticação segura.',
        mediaGuidance.label,
        ...mediaGuidance.paragraphs,
      ],
      benefits: [
        'Acessar serviços digitais vinculados ao CNPJ do MEI com mais segurança.',
        'Assinar contratos, declarações e documentos empresariais com validade jurídica.',
        'Facilitar rotinas fiscais, bancárias e administrativas quando o certificado for exigido.',
        'Representar o CNPJ do MEI em processos eletrônicos sem depender de atendimento presencial.',
      ],
      documents: [
        'Documento oficial com foto do titular do MEI.',
        'CPF do titular, quando não constar no documento apresentado.',
        'Comprovante ou dados cadastrais do CNPJ/MEI para conferência.',
        'E-mail e WhatsApp válidos para contato e confirmação da emissão.',
      ],
    }
  }

  if (isCompany) {
    return {
      title: 'e-CNPJ',
      description: [
        'Identidade eletrônica da pessoa jurídica no meio digital, vinculada ao CNPJ da empresa e ao seu representante legal.',
        'Permite assinar documentos, acessar serviços fiscais e representar a empresa em transações eletrônicas com segurança.',
        'O certificado contém os dados da empresa e do representante responsável, funcionando como uma identificação digital para operações empresariais.',
        'Pode ser usado em obrigações fiscais, sistemas governamentais, assinatura de contratos, procurações eletrônicas e demais processos digitais da empresa.',
        mediaGuidance.label,
        ...mediaGuidance.paragraphs,
      ],
      benefits: [
        'Assinar contratos, procurações, propostas e documentos empresariais com validade jurídica.',
        'Acessar Receita Federal, e-CAC, eSocial, Conectividade Social e portais públicos vinculados ao CNPJ.',
        'Cumprir obrigações fiscais e representar a empresa em processos digitais.',
        'Agilizar aprovações e reduzir deslocamentos em processos que exigem autenticação da empresa.',
      ],
      documents: [
        'Documento oficial com foto do representante legal.',
        'CPF do representante legal, quando não constar no documento apresentado.',
        'Contrato social, requerimento de empresário, estatuto/ata ou documento equivalente atualizado.',
        'Cartão CNPJ ou dados cadastrais da empresa para conferência.',
      ],
    }
  }

  return {
    title: category === 'e-PF' ? 'e-PF' : 'e-CPF',
    description: [
      'Identidade digital da pessoa física, usada para assinar documentos eletrônicos e acessar serviços digitais com segurança.',
      'Também atende aplicações profissionais, como e-Médico, e-Jurídico, e-Engenheiro, e-Saúde e e-Arquiteto, quando o produto escolhido exigir esse uso.',
      'O certificado comprova a identidade do titular no meio eletrônico e permite realizar assinaturas digitais com validade jurídica.',
      'Pode ser instalado em arquivo, token, cartão ou disponibilizado em nuvem, conforme o produto escolhido e a forma de emissão disponível.',
      mediaGuidance.label,
      ...mediaGuidance.paragraphs,
    ],
    benefits: [
      'Assinar contratos, petições, laudos, procurações e documentos digitais com validade jurídica.',
      'Acessar serviços públicos como Receita Federal, e-CAC, INSS, Justiça e portais estaduais ou municipais.',
      'Realizar declarações, consultas e transações que exigem identificação segura.',
      'Usar o certificado em processos bancários, financeiros, profissionais e administrativos quando solicitado.',
    ],
    documents: [
      'Documento oficial com foto em bom estado.',
      'RG ou CIN, se contiver as informações necessárias.',
      'CNH, desde que o CPF esteja impresso no documento.',
      'Carteira profissional de órgão de classe ou passaporte, quando aplicável.',
    ],
  }
}

function ProductGuidancePanel({ item }: { item: LojaItemRow }) {
  const guidance = productGuidance(item)
  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0b8fc1]">Descrição</p>
        <p className="mt-3 text-base font-bold text-slate-950">{guidance.title}</p>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600">
          {guidance.description.map(item => <p key={item}>{item}</p>)}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-emerald-100 bg-emerald-50/70 p-5 shadow-sm">
          <p className="text-sm font-bold text-emerald-950">Benefícios deste certificado</p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-emerald-900">
            {guidance.benefits.map(item => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[24px] border border-sky-100 bg-sky-50/80 p-5 shadow-sm">
          <p className="text-sm font-bold text-sky-950">Documentos necessários</p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-sky-900">
            {guidance.documents.map(item => (
              <li key={item} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default function MarketplaceLoja({ slug }: { slug?: string | null }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loja, setLoja] = useState<LojaMarketplace | null>(null)
  const [tabela, setTabela] = useState<TabelaPreco | null>(null)
  const [itens, setItens] = useState<LojaItemRow[]>([])
  const [selectedItemId, setSelectedItemId] = useState('')
  const [productClassFilter, setProductClassFilter] = useState('')
  const [productKindFilter, setProductKindFilter] = useState('')
  const [productEmissionFilter, setProductEmissionFilter] = useState('')
  const [productValidityFilter, setProductValidityFilter] = useState('')
  const [productConfirmed, setProductConfirmed] = useState(false)
  const [cartConfirmed, setCartConfirmed] = useState(false)
  const [faturamentoConfirmed, setFaturamentoConfirmed] = useState(false)
  const [titularConfirmed, setTitularConfirmed] = useState(false)
  const [pagamentoConfirmed, setPagamentoConfirmed] = useState(false)
  const [pagamentos, setPagamentos] = useState<PaymentOption[]>([])
  const [agendaAgents, setAgendaAgents] = useState<AgendaAgent[]>([])
  const [agendaPoints, setAgendaPoints] = useState<AgendaPoint[]>([])
  const [paymentRuntime, setPaymentRuntime] = useState<PaymentRuntime>({
    modo_teste_geral: false,
    bloquear_integracoes_reais: false,
    aviso_checkout: 'O atendimento será liberado após a confirmação do pagamento.',
  })
  const [slots, setSlots] = useState<AgendaSlot[]>([])
  const [agencyConfig, setAgencyConfig] = useState<AgencyConfig>(DEFAULT_AGENCY_CONFIG)
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
  const cartSectionRef = useRef<HTMLDivElement | null>(null)

  const [voucherCodigo, setVoucherCodigo] = useState('')
  const [voucherDesconto, setVoucherDesconto] = useState(0)
  const [voucherAplicando, setVoucherAplicando] = useState(false)
  const [voucherErro, setVoucherErro] = useState('')
  const [mockCard, setMockCard] = useState({
    numero: '',
    nome: '',
    validade: '',
    cvv: '',
    parcelas: '1',
  })

  useEffect(() => {
    let active = true

    async function fetchLoja() {
      setLoading(true)
      setError(null)

      try {
        const [context, agencyResult] = await Promise.all([
          loadMarketplaceCheckoutContext(slug),
          fetchAgencyConfig(),
        ])
        if (!active) return

        if (agencyResult.data) setAgencyConfig(agencyResult.data)

        const produtosAtivos = context.produtos.filter(item => item.certificados ? item.certificados.ativo : true)
        const initialItemId = resolveInitialItemId(produtosAtivos, context.loja)
        const firstDay = (context.slots[0]?.inicio ?? '').slice(0, 10)

        setLoja(context.loja)
        setTabela(context.tabela)
        setItens(context.produtos)
        setSelectedItemId(initialItemId)
        setProductConfirmed(Boolean(initialItemId && normalizeLojaConfig(context.loja.configuracoes).modo_exibicao === 'link_direto'))
        setCartConfirmed(false)
        setFaturamentoConfirmed(false)
        setTitularConfirmed(false)
        setPagamentoConfirmed(false)
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

  const productKindOptions = useMemo(() => Array.from(new Set(produtosAtivos.map(productCertificateCategory).filter(Boolean))).sort(certificateSort), [produtosAtivos])
  const productsByKind = useMemo(() => produtosAtivos.filter(item => !productKindFilter || productCertificateCategory(item) === productKindFilter), [productKindFilter, produtosAtivos])
  const productClassOptions = useMemo(() => Array.from(new Set(productsByKind.map(productCertificateClass).filter(value => value === 'A1' || value === 'A3'))).sort(), [productsByKind])
  const productsByClass = useMemo(() => productsByKind.filter(item => !productClassFilter || productCertificateClass(item) === productClassFilter), [productClassFilter, productsByKind])
  const serviceOrder = ['Videoconferência', 'Presencial', 'Fast', 'Renovação on-line']
  const validityOrder = ['4 meses', '12 meses', '24 meses']
  const productEmissionOptions = useMemo(() => Array.from(new Set(productsByClass.map(productServiceMode).filter(Boolean))).sort((a, b) => {
    const ai = serviceOrder.indexOf(a)
    const bi = serviceOrder.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b)
  }), [productsByClass])
  const productsByEmission = useMemo(() => productsByClass.filter(item => !productEmissionFilter || productServiceMode(item) === productEmissionFilter), [productEmissionFilter, productsByClass])
  const productValidityOptions = useMemo(() => Array.from(new Set(productsByEmission.map(normalizedProductValidity))).sort((a, b) => {
    const ai = validityOrder.indexOf(a)
    const bi = validityOrder.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b)
  }), [productsByEmission])
  const filteredProducts = useMemo(() => productsByEmission.filter(item => !productValidityFilter || normalizedProductValidity(item) === productValidityFilter), [productValidityFilter, productsByEmission])

  const lojaConfig = useMemo(
    () => normalizeLojaConfig(loja?.configuracoes),
    [loja]
  )

  const modoLinkDireto = lojaConfig.modo_exibicao === 'link_direto'

  const itemSelecionado = useMemo(
    () => produtosAtivos.find(item => item.id === selectedItemId) ?? null,
    [produtosAtivos, selectedItemId]
  )
  const visibleProducts = useMemo(
    () => itemSelecionado && !productConfirmed ? [itemSelecionado] : filteredProducts,
    [filteredProducts, itemSelecionado, productConfirmed]
  )
  const pagamentoSelecionado = useMemo(
    () => pagamentos.find(item => item.id === form.forma_pagamento_id) ?? null,
    [form.forma_pagamento_id, pagamentos]
  )
  const isMercadoPagoCard = pagamentoSelecionado?.gateway === 'mercado_pago'
    && /card|cart/i.test(`${pagamentoSelecionado.codigo ?? ''} ${pagamentoSelecionado.tipo ?? ''} ${pagamentoSelecionado.nome}`)
  const isMockMercadoPagoCard = isMercadoPagoCard && !pagamentoSelecionado?.public_key
  const mockCardEnabled = paymentRuntime.modo_teste_geral || paymentRuntime.bloquear_integracoes_reais

  useEffect(() => {
    if (isMercadoPagoCard && pagamentoSelecionado?.public_key) {
      initMercadoPago(pagamentoSelecionado.public_key, { locale: 'pt-BR' })
    }
  }, [isMercadoPagoCard, pagamentoSelecionado?.public_key])

  useEffect(() => {
    if (!loja) return
    setSelectedItemId(currentId => {
      if (currentId && produtosAtivos.some(item => item.id === currentId)) return currentId
      return resolveInitialItemId(produtosAtivos, loja)
    })
  }, [loja, produtosAtivos])

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

  const checkoutStep = useMemo(() => {
    if (!itemSelecionado || !productConfirmed) return 1
    if (!cartConfirmed) return 2
    if (!faturamentoDone || !faturamentoConfirmed) return 3
    if (!titularDone || !titularConfirmed) return 4
    if (!pagamentoDone || !pagamentoConfirmed) return 5
    return 6
  }, [cartConfirmed, faturamentoConfirmed, faturamentoDone, itemSelecionado, pagamentoConfirmed, pagamentoDone, productConfirmed, titularConfirmed, titularDone])

  const canShowFaturamento = !!itemSelecionado && productConfirmed && cartConfirmed
  const canShowTitular = canShowFaturamento && faturamentoDone && faturamentoConfirmed
  const canShowPagamento = canShowTitular && titularDone && titularConfirmed
  const canShowAvisos = canShowPagamento && pagamentoDone && pagamentoConfirmed

  function updateComprador<K extends keyof FormState['comprador']>(key: K, value: FormState['comprador'][K]) {
    setFaturamentoConfirmed(false)
    setTitularConfirmed(false)
    setPagamentoConfirmed(false)
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
    setTitularConfirmed(false)
    setPagamentoConfirmed(false)
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
    setProductConfirmed(false)
    setCartConfirmed(false)
    setFaturamentoConfirmed(false)
    setTitularConfirmed(false)
    setPagamentoConfirmed(false)
  }

  function scrollToFormSteps() {
    requestAnimationFrame(() => {
      formStartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function confirmProductSelection() {
    if (!itemSelecionado) return
    setProductConfirmed(true)
    setCartConfirmed(false)
    setFaturamentoConfirmed(false)
    setTitularConfirmed(false)
    setPagamentoConfirmed(false)
    requestAnimationFrame(() => {
      cartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function reopenProductList() {
    setSelectedItemId('')
    setProductConfirmed(false)
    setCartConfirmed(false)
    setFaturamentoConfirmed(false)
    setTitularConfirmed(false)
    setPagamentoConfirmed(false)
  }

  function confirmCartSelection() {
    if (!itemSelecionado) return
    setCartConfirmed(true)
    setFaturamentoConfirmed(false)
    setTitularConfirmed(false)
    setPagamentoConfirmed(false)
    scrollToFormSteps()
  }

  function voltarParaProduto() {
    setProductConfirmed(false)
    setCartConfirmed(false)
    setFaturamentoConfirmed(false)
    setTitularConfirmed(false)
    setPagamentoConfirmed(false)
    setError(null)
  }

  function voltarParaCarrinho() {
    setCartConfirmed(false)
    setFaturamentoConfirmed(false)
    setTitularConfirmed(false)
    setPagamentoConfirmed(false)
    setError(null)
    requestAnimationFrame(() => {
      cartSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function voltarParaFaturamento() {
    setFaturamentoConfirmed(false)
    setTitularConfirmed(false)
    setPagamentoConfirmed(false)
    setError(null)
    scrollToFormSteps()
  }

  function voltarParaTitular() {
    setTitularConfirmed(false)
    setPagamentoConfirmed(false)
    setError(null)
    scrollToFormSteps()
  }

  function voltarParaPagamento() {
    setPagamentoConfirmed(false)
    setError(null)
    scrollToFormSteps()
  }

  function confirmFaturamentoSelection() {
    const errors = validateForm(form, itemSelecionado)
    const faturamentoErrors = Object.fromEntries(Object.entries(errors).filter(([id]) => id.startsWith('comprador.')))
    setFieldErrors(prev => ({ ...prev, ...faturamentoErrors }))
    if (Object.keys(faturamentoErrors).length > 0) {
      setError('Revise os dados de faturamento antes de avançar.')
      return
    }
    setError(null)
    setFaturamentoConfirmed(true)
    setTitularConfirmed(false)
    setPagamentoConfirmed(false)
    scrollToFormSteps()
  }

  function confirmTitularSelection() {
    const errors = validateForm(form, itemSelecionado)
    const titularErrors = Object.fromEntries(Object.entries(errors).filter(([id]) => id.startsWith('titular.')))
    setFieldErrors(prev => ({ ...prev, ...titularErrors }))
    if (Object.keys(titularErrors).length > 0) {
      setError('Revise os dados do titular antes de avançar.')
      return
    }
    setError(null)
    setTitularConfirmed(true)
    setPagamentoConfirmed(false)
    scrollToFormSteps()
  }

  function confirmPagamentoSelection() {
    if (!form.forma_pagamento_id) {
      setFieldErrors(prev => ({ ...prev, forma_pagamento_id: 'Escolha a forma de pagamento.' }))
      setError('Escolha a forma de pagamento antes de avançar.')
      return
    }
    setError(null)
    setFieldErrors(prev => {
      const next = { ...prev }
      delete next['forma_pagamento_id']
      return next
    })
    setPagamentoConfirmed(true)
    scrollToFormSteps()
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

  async function aplicarVoucher() {
    if (!voucherCodigo.trim() || !itemSelecionado) return
    setVoucherAplicando(true)
    setVoucherErro('')
    setVoucherDesconto(0)
    try {
      const resp = await fetch(getApiUrl('/catalog/tabelas'))
      const data = await resp.json()
      const tabelas = data.tabelas ?? []
      const tabela = tabelas.find((t: { id: string; codigo_voucher?: string; ativo: boolean }) => {
        if (!t.codigo_voucher || !t.ativo) return false
        return t.codigo_voucher.toLowerCase() === voucherCodigo.trim().toLowerCase()
      })
      if (!tabela) {
        setVoucherErro('Cupom inválido ou não encontrado.')
        return
      }
      if (tabela.id !== itemSelecionado.tabela_preco_id) {
        setVoucherErro('Este cupom não é válido para o produto selecionado.')
        return
      }
      const valorBase = Number(itemSelecionado.valor) || 0
      let desconto = 0
      if (Number(tabela.max_desconto_percentual) > 0) {
        desconto = valorBase * Number(tabela.max_desconto_percentual) / 100
      }
      if (Number(tabela.max_desconto_valor) > 0 && (desconto === 0 || Number(tabela.max_desconto_valor) < desconto)) {
        desconto = Number(tabela.max_desconto_valor)
      }
      if (desconto <= 0) {
        setVoucherErro('Este cupom não possui desconto configurado.')
        return
      }
      setVoucherDesconto(Math.round((desconto + Number.EPSILON) * 100) / 100)
    } catch {
      setVoucherErro('Erro ao validar cupom. Tente novamente.')
    } finally {
      setVoucherAplicando(false)
    }
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
        observacoes: checkoutNotes(form),
        voucher: voucherDesconto > 0 ? {
          codigo: voucherCodigo,
          desconto: voucherDesconto,
        } : null,
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
      setFaturamentoConfirmed(false)
      setTitularConfirmed(false)
      setPagamentoConfirmed(false)
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
      <CheckoutHeader lojaNome={loja.nome_loja} paymentRuntime={paymentRuntime} logoUrl={agencyConfig.logo_interna_url || agencyConfig.logo_url} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.55fr)_340px] gap-6 items-start">
          <div className="space-y-6">
            {checkoutStep === 1 && (
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
                <div className="space-y-6">
                  <p className="text-base font-semibold text-[#17346b]">Selecione o certificado, o tipo, o atendimento e a validade para encontrar o produto correto.</p>
                  <div className="grid overflow-hidden rounded-2xl border border-slate-300 md:grid-cols-4">
                    <label className="border-b border-slate-300 p-4 md:border-b-0 md:border-r">
                      <span className="block text-sm font-bold text-[#17346b]">Certificado</span>
                      <select value={productKindFilter} onChange={event => { setProductKindFilter(event.target.value); setProductClassFilter(''); setProductEmissionFilter(''); setProductValidityFilter(''); setSelectedItemId(''); setProductConfirmed(false); setCartConfirmed(false); setFaturamentoConfirmed(false); setTitularConfirmed(false); setPagamentoConfirmed(false) }} className="mt-2 w-full bg-transparent text-sm text-slate-700 outline-none">
                        <option value="">Selecione</option>
                        {productKindOptions.map(option => <option key={option} value={option}>{certificateOptionLabel(option)}</option>)}
                      </select>
                    </label>
                    <label className="border-b border-slate-300 p-4 md:border-b-0 md:border-r">
                      <span className="block text-sm font-bold text-[#17346b]">Tipo</span>
                      <select disabled={!productKindFilter} value={productClassFilter} onChange={event => { setProductClassFilter(event.target.value); setProductEmissionFilter(''); setProductValidityFilter(''); setSelectedItemId(''); setProductConfirmed(false); setCartConfirmed(false); setFaturamentoConfirmed(false); setTitularConfirmed(false); setPagamentoConfirmed(false) }} className="mt-2 w-full bg-transparent text-sm text-slate-700 outline-none disabled:text-slate-400">
                        <option value="">Selecione</option>
                        {productClassOptions.map(option => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <label className="border-b border-slate-300 p-4 md:border-b-0 md:border-r">
                      <span className="block text-sm font-bold text-[#17346b]">Atendimento</span>
                      <select disabled={!productClassFilter} value={productEmissionFilter} onChange={event => { setProductEmissionFilter(event.target.value); setProductValidityFilter(''); setSelectedItemId(''); setProductConfirmed(false); setCartConfirmed(false); setFaturamentoConfirmed(false); setTitularConfirmed(false); setPagamentoConfirmed(false) }} className="mt-2 w-full bg-transparent text-sm text-slate-700 outline-none disabled:text-slate-400">
                        <option value="">Selecione</option>
                        {productEmissionOptions.map(option => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                    <label className="p-4">
                      <span className="block text-sm font-bold text-[#17346b]">Validade</span>
                      <select disabled={!productEmissionFilter} value={productValidityFilter} onChange={event => { setProductValidityFilter(event.target.value); setSelectedItemId(''); setProductConfirmed(false); setCartConfirmed(false); setFaturamentoConfirmed(false); setTitularConfirmed(false); setPagamentoConfirmed(false) }} className="mt-2 w-full bg-transparent text-sm text-slate-700 outline-none disabled:text-slate-400">
                        <option value="">Selecione</option>
                        {productValidityOptions.map(option => <option key={option} value={option}>{option}</option>)}
                      </select>
                    </label>
                  </div>

                  {!productClassFilter || !productKindFilter || !productEmissionFilter || !productValidityFilter ? (
                    <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-slate-300 bg-slate-50/40 px-6 text-center">
                      <Store size={54} strokeWidth={1.25} className="text-slate-300" />
                      <p className="mt-5 text-lg font-semibold text-slate-600">Preencha os filtros na ordem: certificado, tipo, atendimento e validade.</p>
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-slate-500">Nenhum produto disponível para esta combinação.</div>
                  ) : (
                    <div className="space-y-5">
                      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.85fr)]">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-[#17346b]">Produtos disponíveis</p>
                              <p className="text-xs text-slate-500">Escolha o produto final antes de avançar para a próxima etapa.</p>
                            </div>
                            <p className="text-xs font-semibold text-slate-400">
                              {itemSelecionado && !productConfirmed ? 'Produto escolhido' : `${filteredProducts.length} opção(ões)`}
                            </p>
                          </div>
                          <div className="grid gap-3">
                            {visibleProducts.map(item => {
                              const selected = selectedItemId === item.id
                              const profile = getProductProfile(item.certificados)
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => handleSelectProduct(item.id)}
                                  className={cn(
                                    'w-full rounded-[22px] border p-4 text-left transition-all',
                                    selected
                                      ? 'border-[#0b8fc1] bg-[#0b8fc1] text-white shadow-lg shadow-sky-100'
                                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-sky-50'
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                      <p className="text-[11px] uppercase tracking-[0.18em] font-semibold opacity-70">{productCertificateCategory(item)}</p>
                                      <p className="mt-1 text-base font-semibold leading-snug">{profile.displayName}</p>
                                      <p className={cn('mt-1 text-sm leading-relaxed', selected ? 'text-white/80' : 'text-slate-500')}>
                                        {productCommercialDescription(item)}
                                      </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
                                      <span className="text-lg font-semibold">{formatCurrency(item.valor)}</span>
                                      <span className={cn('h-5 w-5 rounded-full border-2 p-1', selected ? 'border-white' : 'border-slate-300')}>
                                        <span className={cn('block h-full w-full rounded-full', selected && 'bg-white')} />
                                      </span>
                                    </div>
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        <aside className="space-y-3">
                          <p className="text-base font-bold text-[#17346b]">Resumo da compra</p>
                          <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white">
                            {itemSelecionado ? (
                              <>
                                <div className="p-5">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400 font-semibold">{productCertificateCategory(itemSelecionado)}</p>
                                  <p className="mt-1 text-lg font-bold text-slate-900">{getProductProfile(itemSelecionado.certificados).displayName}</p>
                                  <p className="mt-2 text-sm text-slate-500 leading-relaxed">{productCommercialDescription(itemSelecionado)}</p>
                                  <p className="mt-2 text-sm text-slate-600">{getProductProfile(itemSelecionado.certificados).details}</p>
                                  <ProductTags item={itemSelecionado} compact />
                                </div>
                                <div className="border-t border-slate-200 px-5 py-6 text-center text-3xl font-bold text-emerald-600">{formatCurrency(itemSelecionado.valor)}</div>
                              </>
                            ) : <div className="p-8 text-center text-sm text-slate-500">Escolha um produto para continuar.</div>}
                          </div>
                          <div className="mt-2 grid gap-3">
                            {itemSelecionado && !productConfirmed && (
                              <button type="button" onClick={reopenProductList} className="w-full rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                                Voltar
                              </button>
                            )}
                            <button type="button" disabled={!itemSelecionado} onClick={confirmProductSelection} className="w-full rounded-xl bg-[#0b8fc1] px-5 py-4 text-sm font-bold text-white transition hover:bg-[#087ca8] disabled:cursor-not-allowed disabled:bg-slate-300">Próximo</button>
                          </div>
                        </aside>
                      </div>
                      {itemSelecionado && <ProductGuidancePanel item={itemSelecionado} />}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>
            )}

            {checkoutStep === 2 && itemSelecionado && productConfirmed && (
            <SectionCard
              title="Carrinho"
              description="Revise o item escolhido antes de avançar para os dados pessoais."
              icon={ShoppingCart}
              highlight={false}
              done={cartConfirmed}
            >
              <div ref={cartSectionRef} className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
                <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white">
                  <div className="p-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Item no carrinho</p>
                    <p className="mt-2 text-lg font-bold text-slate-900">{itemSelecionado.certificados?.tipo ?? 'Produto'}</p>
                    <p className="mt-2 text-sm text-slate-500 leading-relaxed">{productCommercialDescription(itemSelecionado)}</p>
                    <p className="mt-2 text-sm text-slate-600">Detalhes: {getProductProfile(itemSelecionado.certificados).details}</p>
                    <div className="mt-4">
                      <ProductTags item={itemSelecionado} compact />
                    </div>
                  </div>
                  <div className="border-t border-slate-200 px-5 py-4 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-600">Total do pedido</span>
                    <span className="text-2xl font-bold text-emerald-600">{formatCurrency(itemSelecionado.valor)}</span>
                  </div>
                </div>
                <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-5">
                  <p className="text-sm font-semibold text-sky-900">Antes de continuar</p>
                  <ul className="mt-3 space-y-2 text-sm text-sky-800 leading-relaxed">
                    <li>Confira se o tipo está correto: e-CPF ou e-CNPJ.</li>
                    <li>Confira a classe: A1 ou A3, com ou sem mídia.</li>
                    <li>Confira o prazo antes de seguir para os dados.</li>
                  </ul>
                  <div className="mt-5 flex flex-col gap-3">
                    <button type="button" onClick={voltarParaProduto} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      Voltar para o produto
                    </button>
                    <button type="button" onClick={confirmCartSelection} className="rounded-xl bg-[#17346b] px-4 py-3 text-sm font-semibold text-white hover:bg-[#102654]">
                      Próximo
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>
            )}

            {checkoutStep >= 3 && canShowFaturamento && (
            <div
              ref={formStartRef}
              className="space-y-6"
            >
            <div className="rounded-[24px] border border-sky-200 bg-sky-50/80 p-4 mb-2">
              <p className="text-sm font-semibold text-sky-900">Entenda as etapas da sua compra</p>
              <ul className="mt-2 space-y-1.5 text-sm text-sky-800">
                <li className="flex items-start gap-2">
                  <span className="font-bold shrink-0">1.</span>
                  <span><strong className="text-sky-950">Carrinho:</strong> confirme o produto antes de preencher os dados</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold shrink-0">2.</span>
                  <span><strong className="text-sky-950">Faturamento:</strong> quem vai pagar e receber a nota fiscal</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold shrink-0">3.</span>
                  <span><strong className="text-sky-950">Titular do certificado:</strong> quem vai receber e usar o certificado digital</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold shrink-0">4.</span>
                  <span>Se a mesma pessoa for pagar e usar o certificado, é só marcar a opção na etapa do titular</span>
                </li>
              </ul>
            </div>

            {checkoutStep === 3 && (
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
                    onClick={() => {
                      setFaturamentoConfirmed(false)
                      setTitularConfirmed(false)
                      setPagamentoConfirmed(false)
                      setForm(prev => ({
                        ...prev,
                        comprador: {
                          ...prev.comprador,
                          tipo: 'pessoa_juridica',
                        },
                      }))
                    }}
                  />
                  <ChoiceCard
                    label="Pessoa Física"
                    helper="Vou pagar como pessoa física. O certificado pode ser no meu nome ou de outra pessoa."
                    active={form.comprador.tipo === 'pessoa_fisica'}
                    onClick={() => {
                      setFaturamentoConfirmed(false)
                      setTitularConfirmed(false)
                      setPagamentoConfirmed(false)
                      setForm(prev => ({
                        ...prev,
                        comprador: {
                          ...prev.comprador,
                          tipo: 'pessoa_fisica',
                        },
                      }))
                    }}
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
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <button type="button" onClick={voltarParaCarrinho} className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    Voltar
                  </button>
                  <button type="button" onClick={confirmFaturamentoSelection} className="rounded-xl bg-[#17346b] px-6 py-3 text-sm font-semibold text-white hover:bg-[#102654]">
                    Próximo
                  </button>
                </div>
                <div className="lg:col-span-2">
                  <ProductGuidancePanel item={itemSelecionado} />
                </div>
              </div>
            </SectionCard>
            )}

            {checkoutStep === 4 && canShowTitular && (
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
                  onChange={e => {
                    setTitularConfirmed(false)
                    setPagamentoConfirmed(false)
                    setForm(prev => ({ ...prev, titularMesmoFaturamento: e.target.checked }))
                  }}
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
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={voltarParaFaturamento} className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Voltar
                </button>
                <button type="button" onClick={confirmTitularSelection} className="rounded-xl bg-[#17346b] px-6 py-3 text-sm font-semibold text-white hover:bg-[#102654]">
                  Próximo
                </button>
              </div>
            </SectionCard>
            )}

            {checkoutStep === 5 && canShowPagamento && (
            <SectionCard
              title="Forma de pagamento"
              description="Escolha como você vai pagar. Depois da compensação, liberamos o atendimento da validação."
              icon={Wallet}
              highlight={nextFieldId === 'forma_pagamento_id'}
              done={pagamentoDone}
            >
              {pagamentos.length > 0 ? (
                <div data-field-anchor="forma_pagamento_id" className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {pagamentos.map(option => {
                    const active = form.forma_pagamento_id === option.id
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setPagamentoConfirmed(false)
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
                            <p className="text-sm font-semibold text-slate-900">{publicPaymentLabel(option)}</p>
                            <p className="text-xs text-slate-500 mt-1">{statusPagamentoLabel(option)}</p>
                          </div>
                          {active ? <CheckCircle2 size={18} className="text-[#ea7b18]" /> : <CreditCard size={18} className="text-slate-400" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                  Nenhuma forma de pagamento ficou visível nesta loja agora. Avise nossa equipe para liberar Pix, Cartão ou Boleto.
                </div>
              )}
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
              {isMockMercadoPagoCard && mockCardEnabled && (
                <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-900">Cartão de teste</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Este formulário entra em modo simulado quando a Public Key não está configurada.
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input
                      value={mockCard.numero}
                      onChange={event => setMockCard(prev => ({ ...prev, numero: event.target.value }))}
                      inputMode="numeric"
                      placeholder="Número do cartão"
                      className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#17346b] focus:ring-2 focus:ring-sky-100 md:col-span-2"
                    />
                    <input
                      value={mockCard.nome}
                      onChange={event => setMockCard(prev => ({ ...prev, nome: event.target.value }))}
                      placeholder="Nome no cartão"
                      className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#17346b] focus:ring-2 focus:ring-sky-100 md:col-span-2"
                    />
                    <input
                      value={mockCard.validade}
                      onChange={event => setMockCard(prev => ({ ...prev, validade: event.target.value }))}
                      placeholder="Validade MM/AA"
                      className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#17346b] focus:ring-2 focus:ring-sky-100"
                    />
                    <input
                      value={mockCard.cvv}
                      onChange={event => setMockCard(prev => ({ ...prev, cvv: event.target.value }))}
                      inputMode="numeric"
                      placeholder="CVV"
                      className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#17346b] focus:ring-2 focus:ring-sky-100"
                    />
                    <input
                      value={mockCard.parcelas}
                      onChange={event => setMockCard(prev => ({ ...prev, parcelas: event.target.value }))}
                      inputMode="numeric"
                      placeholder="Parcelas"
                      className="rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#17346b] focus:ring-2 focus:ring-sky-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void iniciarCheckout({
                      token: `mock_${Date.now()}`,
                      payment_method_id: 'visa',
                      payment_type_id: 'credit_card',
                      installments: Math.max(1, Number(mockCard.parcelas || 1)),
                      identification_type: 'CPF',
                      identification_number: onlyDigits(form.comprador.cpf_cnpj).slice(0, 11) || '00000000000',
                    })}
                    className="mt-4 w-full rounded-xl bg-[#17346b] px-4 py-3 font-semibold text-white hover:bg-[#102654]"
                  >
                    Simular pagamento no cartão
                  </button>
                </div>
              )}
              {isMercadoPagoCard && !pagamentoSelecionado?.public_key && !mockCardEnabled && (
                <div className="mt-3 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                  <p className="font-semibold">Cartão seguro ainda não carregou.</p>
                  <p className="mt-1">A configuração pública do cartão não veio no checkout atual. Pix e boleto continuam funcionando.</p>
                </div>
              )}
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={voltarParaTitular} className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Voltar
                </button>
                <button type="button" onClick={confirmPagamentoSelection} className="rounded-xl bg-[#17346b] px-6 py-3 text-sm font-semibold text-white hover:bg-[#102654]">
                  Próximo
                </button>
              </div>
            </SectionCard>
            )}

            {checkoutStep === 6 && canShowPagamento && (
            <SectionCard
              title="Cupom de desconto"
              description="Se você possui um cupom de desconto, insira o código abaixo para aplicar o desconto no valor total."
              icon={Tag}
              highlight={false}
              done={false}
            >
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Código do cupom</label>
                  <input
                    type="text"
                    value={voucherCodigo}
                    onChange={e => setVoucherCodigo(e.target.value.toUpperCase())}
                    placeholder="Digite o código do cupom"
                    className="w-full rounded-[14px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#ea7b18] focus:border-transparent"
                  />
                </div>
                <button
                  type="button"
                  onClick={aplicarVoucher}
                  disabled={!voucherCodigo.trim() || voucherAplicando}
                  className="rounded-[14px] bg-[#17346b] px-5 py-3 text-sm font-semibold text-white hover:bg-[#1a3d7a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {voucherAplicando ? 'Validando...' : 'Aplicar'}
                </button>
              </div>
              {voucherErro && (
                <p className="mt-2 text-sm text-red-600">{voucherErro}</p>
              )}
              {voucherDesconto > 0 && (
                <div className="mt-3 rounded-[14px] border border-green-200 bg-green-50 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-green-600" />
                    <span className="text-sm font-medium text-green-800">Cupom aplicado: {voucherCodigo}</span>
                  </div>
                  <span className="text-sm font-bold text-green-700">-{formatCurrency(voucherDesconto)}</span>
                </div>
              )}
            </SectionCard>
            )}

            {checkoutStep === 6 && canShowAvisos && itemSelecionado && (
            <SectionCard
              title="Resumo final do pedido"
              description="Confira todas as informações antes de finalizar e seguir para o pagamento."
              icon={CheckCircle2}
              highlight={false}
              done={false}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Produto</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{getProductProfile(itemSelecionado.certificados).displayName}</p>
                  <p className="mt-1 text-sm text-slate-500">{productCommercialDescription(itemSelecionado)}</p>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-sm font-semibold text-slate-600">Total</span>
                    <span className="text-2xl font-bold text-emerald-600">{formatCurrency(Math.max(0, Number(itemSelecionado.valor) - voucherDesconto))}</span>
                  </div>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Faturamento</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{form.comprador.nome || 'Não informado'}</p>
                  <p className="mt-1 text-sm text-slate-500">{form.comprador.email || 'E-mail não informado'}</p>
                  <p className="mt-1 text-sm text-slate-500">{form.comprador.telefone || 'WhatsApp não informado'}</p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Titular</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{titularEfetivo.nome || 'Não informado'}</p>
                  <p className="mt-1 text-sm text-slate-500">{titularEfetivo.cpf || 'CPF não informado'}</p>
                </div>
                <div className="rounded-[22px] border border-slate-200 bg-white p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400 font-semibold">Pagamento</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{pagamentoSelecionado ? publicPaymentLabel(pagamentoSelecionado) : 'Não informado'}</p>
                  <p className="mt-1 text-sm text-slate-500">Depois de finalizar, você receberá as instruções oficiais para pagamento e validação.</p>
                </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button type="button" onClick={voltarParaPagamento} className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Voltar para editar
                </button>
                <button
                  type="button"
                  onClick={() => void iniciarCheckout()}
                  disabled={checkoutLoading || isMercadoPagoCard}
                  className="rounded-xl bg-[#ea7b18] px-6 py-3 text-sm font-semibold text-white hover:bg-[#cf6611] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {checkoutLoading ? 'Finalizando compra...' : 'Concluir compra'}
                </button>
              </div>
            </SectionCard>
            )}

            {checkoutStep === 6 && canShowAvisos && (
            <SectionCard
              title="Avisos importantes"
              description="Revise estes lembretes antes de concluir a compra."
              icon={AlertTriangle}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <WarningCard text="Após finalizar o pedido e confirmar os dados, você receberá as instruções de pagamento e próximos passos." />
                <WarningCard text="Informe e-mail e telefone com WhatsApp válidos para a equipe entrar em contato no momento da validação." />
              </div>

              <details className="mt-5 overflow-hidden rounded-[22px] border border-slate-200 bg-white">
                <summary className="cursor-pointer bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-800">Dados opcionais</summary>
                <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Conectividade Social</span>
                    <select value={form.conectividade_social} onChange={event => setForm(prev => ({ ...prev, conectividade_social: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#17346b] focus:ring-2 focus:ring-sky-100">
                      <option value="">Selecione uma opção</option>
                      <option value="Não utilizarei">Não utilizarei</option>
                      <option value="Pessoa física / CAEPF">Pessoa física / CAEPF</option>
                      <option value="Pessoa jurídica / CNPJ">Pessoa jurídica / CNPJ</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">Documento de identidade</span>
                    <select value={form.documento_identidade} onChange={event => setForm(prev => ({ ...prev, documento_identidade: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#17346b] focus:ring-2 focus:ring-sky-100">
                      <option value="">Selecione uma opção</option>
                      <option value="RG">RG</option>
                      <option value="CNH">CNH</option>
                      <option value="Passaporte">Passaporte</option>
                      <option value="Documento profissional">Documento profissional</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-slate-700">UF do título de eleitor</span>
                    <select value={form.titulo_eleitor_uf} onChange={event => setForm(prev => ({ ...prev, titulo_eleitor_uf: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#17346b] focus:ring-2 focus:ring-sky-100">
                      <option value="">Selecione uma opção</option>
                      {BRAZIL_STATES.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                  </label>
                </div>
              </details>

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
                    <p className="mt-2 text-sm text-slate-500 leading-relaxed">{productCommercialDescription(itemSelecionado)}</p>
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
                      value={form.forma_pagamento_id ? publicPaymentLabel(pagamentos.find(item => item.id === form.forma_pagamento_id)) : 'Aguardando escolha'}
                    />
                    {checkoutSuccess && (
                      <InfoLine
                        label="Agendamento"
                        value={selectedSlot ? formatDateTime(selectedSlot.inicio) : 'Pendente'}
                        tone={selectedSlot ? 'default' : 'warn'}
                      />
                    )}
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
                <p>{checkoutSuccess}</p>
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-white/70 p-3">
                  <p className="font-semibold text-emerald-900">Próximo passo: agendamento</p>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                    Após confirmar seus dados finais e concluir o pedido, acompanhe em Meus pedidos para escolher o horário da validação. O atendimento será liberado após a compensação do pagamento.
                  </p>
                </div>
              </div>
            )}

            {paymentDetails?.kind === 'pix' && (
              <div className="rounded-[24px] border border-blue-200 bg-white px-4 py-5 text-sm shadow-sm">
                <p className="font-semibold text-slate-900">Pagamento via Pix gerado</p>
                <p className="mt-1 text-xs text-slate-500">Use o QR Code ou copie o código Pix no seu app bancário. Após a compensação, seguimos com a validação.</p>
                {paymentDetails.qr_code_base64 && <img className="mx-auto my-4 h-56 w-56" alt="QR Code Pix" src={`data:image/png;base64,${paymentDetails.qr_code_base64}`} />}
                {paymentDetails.qr_code && (
                  <button type="button" onClick={() => void navigator.clipboard.writeText(paymentDetails.qr_code!)} className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white">Copiar código Pix</button>
                )}
                {paymentDetails.ticket_url && <a className="mt-3 block text-center text-blue-700 underline" href={paymentDetails.ticket_url} target="_blank" rel="noreferrer">Abrir comprovante/ instruções do Pix</a>}
              </div>
            )}

            {paymentDetails?.kind === 'boleto' && (
              <div className="rounded-[24px] border border-amber-200 bg-white px-4 py-5 text-sm shadow-sm">
                <p className="font-semibold text-slate-900">Boleto gerado com sucesso</p>
                <p className="mt-1 text-xs text-slate-500">Você pode abrir o boleto, copiar a linha digitável ou aguardar o e-mail cadastrado com o link de pagamento.</p>
                {paymentDetails.digitable_line && <p className="my-3 break-all rounded-xl bg-slate-50 p-3 text-xs">{paymentDetails.digitable_line}</p>}
                {paymentDetails.digitable_line && <button type="button" onClick={() => void navigator.clipboard.writeText(paymentDetails.digitable_line!)} className="w-full rounded-xl bg-amber-600 px-4 py-3 font-semibold text-white">Copiar linha digitável</button>}
                {paymentDetails.ticket_url && <a className="mt-3 block text-center text-amber-700 underline" href={paymentDetails.ticket_url} target="_blank" rel="noreferrer">Abrir boleto em nova aba</a>}
              </div>
            )}

            <button
              type="button"
              onClick={() => void iniciarCheckout()}
              disabled={checkoutLoading || !itemSelecionado || checkoutStep !== 6 || isMercadoPagoCard}
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
            disabled={checkoutLoading || !itemSelecionado || checkoutStep !== 6 || isMercadoPagoCard}
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




















