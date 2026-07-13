export type CheckoutContextAction = 'context' | 'lookup_customer'

export type CheckoutStore = {
  id: string
  nome_loja: string
  slug: string
  tabela_preco_id: string
  owner_tipo: string
  owner_profile_id: string | null
  owner_parceiro_id: string | null
  descricao: string | null
  dominio_publico: string | null
  ativo: boolean
  configuracoes: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type CheckoutPriceTable = {
  id: string
  nome: string
  descricao: string | null
  codigo_voucher: string | null
  max_desconto_percentual: number
  max_desconto_valor: number
  comissao_venda_pct: number
  comissao_gestor_pct: number
  comissao_gestor_valor: number
  ativo: boolean
  created_at: string
  updated_at: string
}

export type CheckoutProduct = {
  id: string
  tabela_preco_id: string
  certificado_id: string
  valor: number
  valor_custo: number
  valor_repasse: number
  link_safeweb: string | null
  ativo: boolean
  created_at: string
  updated_at: string
  certificados: {
    id: string
    codigo: number | null
    tipo: string
    descricao: string | null
    validade: string
    modelo: string | null
    categoria: string | null
    tipo_emissao_padrao: string | null
    periodo_uso: string | null
    descricao_produto: string | null
    preco_venda: number
    valor_custo: number
    ativo: boolean
    created_at: string
    updated_at: string
  } | null
}

export type PaymentRuntime = {
  modo_teste_geral: boolean
  bloquear_integracoes_reais: boolean
  aviso_checkout: string
}

export type PaymentOption = {
  id: string
  nome: string
  codigo: string | null
  tipo: string | null
  gateway?: string | null
  public_key?: string | null
}

export type AgendaAgent = {
  id: string
  nome: string
}

export type AgendaPoint = {
  id: string
  nome: string
}

export type AgendaSlot = {
  agente_registro_id: string
  ponto_atendimento_id: string
  inicio: string
  fim: string
  capacidade_total: number
  vagas_restantes: number
  tipo_atendimento: string | null
  agente_nome: string
  ponto_nome: string
}

export type CheckoutExistingCustomerLookup = {
  id?: string
  tipo_cliente: string
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
}

export type CheckoutContextRequest = {
  action: 'context'
  slug: string | null
}

export type CheckoutLookupCustomerRequest = {
  action: 'lookup_customer'
  documento: string
}

export type CheckoutContextApiRequest = CheckoutContextRequest | CheckoutLookupCustomerRequest

export type CheckoutContextApiResponse = {
  ok: boolean
  loja?: CheckoutStore | null
  tabela?: CheckoutPriceTable | null
  produtos?: CheckoutProduct[]
  payment_runtime?: PaymentRuntime
  pagamentos?: PaymentOption[]
  agentes?: AgendaAgent[]
  pontos?: AgendaPoint[]
  slots?: AgendaSlot[]
  error?: string
}

export type CheckoutLookupCustomerApiResponse = {
  ok: boolean
  cadastro?: CheckoutExistingCustomerLookup | null
  error?: string
}

export type CheckoutSubmitRequest = {
  slug: string | null
  item_id: string
  comprador: {
    nome: string
    nome_fantasia: string
    responsavel_nome: string
    cpf_cnpj: string
    email: string
    telefone: string
  }
  fiscal: {
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
    data_nascimento: string | null
    email: string
    telefone: string
  }
  pagamento: {
    forma_pagamento_id: string
    card?: {
      token: string
      payment_method_id: string
      payment_type_id: 'credit_card' | 'debit_card'
      installments: number
      identification_type: string
      identification_number: string
    } | null
  }
  acesso: {
    senha: string
  }
  agendamento: {
    agente_registro_id: string
    ponto_atendimento_id: string
    data_agendada: string
  } | null
  observacoes: string | null
}

export type CheckoutSubmitResponse = {
  ok?: boolean
  error?: string
  message?: string
  venda_id?: string | null
  protocolo_numero?: string | null
  redirect_url?: string | null
  payment_status?: string | null
  payment_details?: {
    gateway: string
    order_id?: string | null
    payment_id?: string | null
    kind?: 'pix' | 'boleto' | 'card' | 'link' | null
    ticket_url?: string | null
    qr_code?: string | null
    qr_code_base64?: string | null
    digitable_line?: string | null
    barcode_content?: string | null
    expires_at?: string | null
  } | null
  access_status?: 'created' | 'existing' | 'linked'
  access_message?: string | null
}
