import type { LojaMarketplace, TabelaPreco } from '@/types'
import type { AgendaAgent, AgendaPoint, AgendaSlot, CheckoutExistingCustomerLookup, LojaItemRow, PaymentRuntime, PaymentOption } from '@/lib/checkout'

export type CheckoutContextAction = 'context' | 'lookup_customer'

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
  loja?: LojaMarketplace | null
  tabela?: TabelaPreco | null
  produtos?: LojaItemRow[]
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
  access_status?: 'created' | 'existing' | 'linked'
  access_message?: string | null
}
