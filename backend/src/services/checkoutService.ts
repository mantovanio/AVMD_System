import { createClerkClient } from '@clerk/backend'
import type {
  CheckoutContextApiResponse,
  CheckoutContextApiRequest,
  CheckoutLookupCustomerApiResponse,
  CheckoutSubmitRequest,
  CheckoutSubmitResponse,
} from '../contracts/checkoutContract.js'
import type { CheckoutRepository } from '../repositories/checkoutRepository.js'
import type { ProfileRepository } from '../repositories/profileRepository.js'
import { CheckoutPaymentService } from './checkoutPaymentService.js'
import { isValidCpf, isValidCpfCnpj, isValidEmail, isValidPhone, isValidUf } from '../utils/validation.js'

type PortalAccessResult = {
  status: 'created' | 'existing' | 'linked'
  message: string
}

export class CheckoutService {
  constructor(
    private readonly repository: CheckoutRepository,
    private readonly paymentService: CheckoutPaymentService = new CheckoutPaymentService(repository),
    private readonly profileRepository?: ProfileRepository,
    private readonly clerkSecretKey?: string,
  ) {}

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

    let descontoAplicado = 0
    let voucherCodigo = null
    let voucherPercentual = null
    let voucherValor = null

    if (body.voucher?.codigo && body.voucher.desconto > 0) {
      if (!tabela) {
        return { ok: false, error: 'Tabela de preco nao encontrada.' }
      }
      if (!tabela.codigo_voucher || tabela.codigo_voucher.toLowerCase() !== body.voucher.codigo.toLowerCase()) {
        return { ok: false, error: 'Cupom de desconto invalido.' }
      }
      const valorBase = Number(item.valor ?? 0)
      if (Number(tabela.max_desconto_percentual) > 0) {
        const descontoPct = valorBase * Number(tabela.max_desconto_percentual) / 100
        if (body.voucher.desconto > descontoPct) {
          return { ok: false, error: `Desconto maximo permitido: ${Number(tabela.max_desconto_percentual)}% (${descontoPct.toFixed(2)}).` }
        }
      }
      if (Number(tabela.max_desconto_valor) > 0 && body.voucher.desconto > Number(tabela.max_desconto_valor)) {
        return { ok: false, error: `Desconto maximo permitido: R$ ${Number(tabela.max_desconto_valor).toFixed(2)}.` }
      }
      descontoAplicado = body.voucher.desconto
      voucherCodigo = body.voucher.codigo
      if (valorBase > 0) {
        voucherPercentual = Math.round((descontoAplicado / valorBase) * 10000) / 100
      }
      voucherValor = descontoAplicado
    }

    const cadastro = await this.repository.upsertCheckoutCustomer(body)
    const titular = await this.repository.upsertCheckoutHolder(body)
    const access = await this.ensurePortalAccess(body)
    const venda = await this.repository.createCheckoutSale({
      payload: body,
      loja,
      item,
      tabela,
      cadastroBaseId: cadastro.id,
      titularId: titular.id,
      desconto: descontoAplicado,
      voucherCodigo,
      voucherPercentual,
      voucherValor,
    })

    if (body.agendamento) {
      await this.repository.createCheckoutSchedule({
        payload: body,
        vendaId: venda.id,
        cadastroBaseId: cadastro.id,
        titularId: titular.id,
      })
    }

    const charge = await this.paymentService.createChargeForSale({
      vendaId: venda.id,
      formaPagamentoId: body.pagamento.forma_pagamento_id,
      valor: Number(item.valor ?? 0) - descontoAplicado,
      descricao: `${item.certificados?.tipo ?? 'Certificado digital'} - ${body.comprador.nome}`,
      comprador: {
        nome: body.comprador.nome,
        email: body.comprador.email,
        telefone: body.comprador.telefone,
        documento: body.comprador.cpf_cnpj,
      },
      fiscal: body.fiscal,
      card: body.pagamento.card ?? null,
    })

    const chargeLink = charge.chargeUrl ?? null
    const message = charge.ok
      ? (charge.mocked
          ? 'Pedido criado com sucesso. Cobranca gerada em modo de testes.'
          : chargeLink
            ? 'Pedido criado com sucesso. Abra o link para concluir o pagamento.'
            : 'Pedido criado com sucesso. A cobranca foi registrada e aguarda retorno do gateway.')
      : 'Pedido criado, mas a cobranca nao pode ser gerada automaticamente. Nossa equipe enviara o link de pagamento.'

    return {
      ok: true,
      message,
      venda_id: venda.id,
      protocolo_numero: venda.protocolo_numero,
      redirect_url: chargeLink,
      payment_status: charge.status,
      payment_details: charge.details as CheckoutSubmitResponse['payment_details'],
      access_status: access.status,
      access_message: access.message,
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
    if (!body.acesso?.senha?.trim()) return 'Defina a senha de acesso do cliente.'
    if (body.acesso.senha.trim().length < 8) return 'A senha de acesso precisa ter pelo menos 8 caracteres.'
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

  private async ensurePortalAccess(body: CheckoutSubmitRequest): Promise<PortalAccessResult> {
    if (!this.profileRepository || !this.clerkSecretKey) {
      return {
        status: 'linked',
        message: 'Pedido criado. O acesso do portal sera confirmado pela equipe.',
      }
    }

    const email = String(body.comprador.email ?? '').trim().toLowerCase()
    const nome = String(body.comprador.nome ?? '').trim()
    const senha = String(body.acesso?.senha ?? '')
    const documento = onlyDigits(body.comprador.cpf_cnpj)
    const telefone = onlyDigits(body.comprador.telefone)
    const cidade = String(body.fiscal.cidade ?? '').trim() || null

    const existingProfile = await this.profileRepository.findByEmail(email)
    const clerkUserId = existingProfile?.clerk_user_id
      ? existingProfile.clerk_user_id
      : await this.findOrCreateClerkUser({ email, nome, senha })

    if (existingProfile) {
      const canConvertToPortal = existingProfile.tipo_vinculo === 'cliente_portal' || (existingProfile.status === 'inativo' && !(existingProfile.permissoes?.length ?? 0))
      await this.profileRepository.update(existingProfile.id, {
        clerk_user_id: clerkUserId,
        nome,
        email,
        status: 'ativo',
        perfil: existingProfile.perfil || 'usuario',
        tipo_vinculo: canConvertToPortal ? 'cliente_portal' : (existingProfile.tipo_vinculo || 'usuario_comum'),
        documento,
        telefone,
        cidade,
        permissoes: canConvertToPortal ? ['portal'] : (existingProfile.permissoes?.length ? existingProfile.permissoes : ['portal']),
      })

      return clerkUserId && !existingProfile.clerk_user_id
        ? {
            status: 'linked',
            message: 'Seu acesso ao portal foi vinculado automaticamente a esta compra.',
          }
        : {
            status: 'existing',
            message: 'Seu acesso ja existia. Depois da compra, entre com o mesmo e-mail e senha para acompanhar o pedido.',
          }
    }

    await this.profileRepository.createProfile({
      clerk_user_id: clerkUserId,
      nome,
      email,
      perfil: 'usuario',
      tipo_vinculo: 'cliente_portal',
      permissoes: ['portal'],
      status: 'ativo',
      documento,
      telefone,
      cidade,
    })

    return {
      status: 'created',
      message: 'Seu acesso ao portal foi criado com sucesso. Use o e-mail e a senha informados para acompanhar pedido, pagamento e videoconferencia.',
    }
  }

  private async findOrCreateClerkUser(input: { email: string; nome: string; senha: string }) {
    const clerkClient = createClerkClient({ secretKey: this.clerkSecretKey })
    const existing = await clerkClient.users.getUserList({ emailAddress: [input.email], limit: 1 })
    const existingUser = existing.data[0]
    if (existingUser?.id) return existingUser.id

    const [firstNameRaw, ...rest] = input.nome.split(/\s+/)
    const firstName = firstNameRaw || 'Usuario'
    const lastName = rest.join(' ').trim() || undefined
    const usernameBase = input.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
    const username = ((usernameBase || 'usuario') + Date.now().toString(36)).slice(0, 24)

    const clerkUser = await clerkClient.users.createUser({
      emailAddress: [input.email],
      username,
      password: input.senha,
      firstName,
      lastName,
    })

    return clerkUser.id
  }
}

function onlyDigits(value: string) {
  return String(value ?? '').replace(/\D/g, '')
}
