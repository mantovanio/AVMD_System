import type {
  CheckoutContextApiResponse,
  CheckoutContextApiRequest,
  CheckoutLookupCustomerApiResponse,
  CheckoutSubmitRequest,
  CheckoutSubmitResponse,
} from '../contracts/checkoutContract.js'
import type { CheckoutRepository } from '../repositories/checkoutRepository.js'
import { isValidCpf, isValidCpfCnpj, isValidEmail, isValidPhone, isValidUf } from '../utils/validation.js'

export class CheckoutService {
  constructor(private readonly repository: CheckoutRepository) {}

  async handleContext(body: CheckoutContextApiRequest): Promise<CheckoutContextApiResponse | CheckoutLookupCustomerApiResponse> {
    if (body.action === 'lookup_customer') {
      const cadastro = await this.repository.findLatestActiveCustomerByDocument(body.documento)
      return { ok: true, cadastro }
    }

    const loja = await this.repository.findMarketplaceStore(body.slug)
    if (!loja) {
      return { ok: false, error: 'Loja nao encontrada.' }
    }

    const parceiroId = loja.owner_tipo === 'parceiro' ? loja.owner_parceiro_id : null
    const [tabela, produtos, pagamentos, paymentRuntime, agenda] = await Promise.all([
      this.repository.findPriceTable(loja.tabela_preco_id),
      this.repository.findMarketplaceProducts(loja.tabela_preco_id),
      this.repository.findActivePaymentMethods(),
      this.repository.getPaymentRuntime(),
      this.repository.getCheckoutScheduleContext({
        tabelaPrecoId: loja.tabela_preco_id,
        parceiroId,
      }),
    ])

    return {
      ok: true,
      loja,
      tabela,
      produtos,
      pagamentos,
      payment_runtime: paymentRuntime,
      agentes: agenda.agentes,
      pontos: agenda.pontos,
      slots: agenda.slots,
    }
  }

  async submit(body: CheckoutSubmitRequest): Promise<CheckoutSubmitResponse> {
    const validationError = this.validateSubmit(body)
    if (validationError) {
      return { ok: false, error: validationError }
    }

    const loja = await this.repository.findMarketplaceStore(body.slug)
    if (!loja) {
      return { ok: false, error: 'Loja nao encontrada.' }
    }

    const item = await this.repository.findMarketplaceItem(body.item_id)
    if (!item || item.tabela_preco_id !== loja.tabela_preco_id) {
      return { ok: false, error: 'Item invalido para esta loja.' }
    }

    const pagamentos = await this.repository.findActivePaymentMethods()
    const formaPagamentoValida = pagamentos.some(pagamento => pagamento.id === body.pagamento.forma_pagamento_id)
    if (!formaPagamentoValida) {
      return { ok: false, error: 'Forma de pagamento invalida ou inativa.' }
    }

    const tabela = await this.repository.findPriceTable(loja.tabela_preco_id)
    const cadastro = await this.repository.upsertCheckoutCustomer(body)
    const titular = await this.repository.upsertCheckoutHolder(body)
    const venda = await this.repository.createCheckoutSale({
      payload: body,
      loja,
      item,
      tabela,
      cadastroBaseId: cadastro.id,
      titularId: titular.id,
    })

    if (body.agendamento) {
      await this.repository.createCheckoutSchedule({
        payload: body,
        vendaId: venda.id,
        cadastroBaseId: cadastro.id,
        titularId: titular.id,
      })
    }

    return {
      ok: true,
      message: 'Pedido criado com sucesso.',
      venda_id: venda.id,
      protocolo_numero: venda.protocolo_numero,
      redirect_url: null,
    }
  }

  private validateSubmit(body: CheckoutSubmitRequest) {
    if (!body.item_id.trim()) return 'Item obrigatorio.'
    if (!isValidCpfCnpj(body.comprador.cpf_cnpj)) return 'CPF/CNPJ do comprador invalido.'
    if (!body.comprador.nome.trim()) return 'Nome do comprador obrigatorio.'
    if (!isValidEmail(body.comprador.email)) return 'Email do comprador invalido.'
    if (!isValidPhone(body.comprador.telefone)) return 'Telefone do comprador invalido.'
    if (!isValidCpf(body.titular.cpf)) return 'CPF do titular invalido.'
    if (!body.titular.nome.trim()) return 'Nome do titular obrigatorio.'
    if (!isValidEmail(body.titular.email)) return 'Email do titular invalido.'
    if (!isValidPhone(body.titular.telefone)) return 'Telefone do titular invalido.'
    if (!body.pagamento.forma_pagamento_id.trim()) return 'Forma de pagamento obrigatoria.'
    if (!body.fiscal.logradouro.trim()) return 'Logradouro obrigatorio.'
    if (!body.fiscal.numero.trim()) return 'Numero obrigatorio.'
    if (!body.fiscal.bairro.trim()) return 'Bairro obrigatorio.'
    if (!body.fiscal.cidade.trim()) return 'Cidade obrigatoria.'
    if (!isValidUf(body.fiscal.uf)) return 'UF invalida.'

    if (body.agendamento) {
      if (!body.agendamento.agente_registro_id.trim()) return 'Agente obrigatorio no agendamento.'
      if (!body.agendamento.ponto_atendimento_id.trim()) return 'Ponto obrigatorio no agendamento.'
      if (!body.agendamento.data_agendada.trim()) return 'Data do agendamento obrigatoria.'
    }

    return null
  }
}
