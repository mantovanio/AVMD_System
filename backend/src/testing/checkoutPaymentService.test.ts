import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { CheckoutPaymentService } from '../services/checkoutPaymentService.js'

test('gera cobranca mock quando integracoes reais estao bloqueadas', async () => {
  const attached: Array<Record<string, unknown>> = []
  const service = new CheckoutPaymentService({
    async getCheckoutPaymentMethodConfig() {
      return {
        id: 'fp1',
        nome: 'PIX',
        codigo: 'pix',
        tipo: 'pix',
        gateway: 'safe2pay',
        ambiente: 'sandbox',
        client_id: null,
        secret_key: null,
        webhook_url: 'https://crm.certiid.mantovan.com.br/api/checkout/webhook/safe2pay',
        provider_base_url: null,
        provider_api_token: null,
        provider_metadata: {},
        runtime: {
          modo_teste_geral: true,
          bloquear_integracoes_reais: true,
          aviso_checkout: 'teste',
        },
      }
    },
    async attachPaymentChargeToSale(input: unknown) {
      attached.push(input as Record<string, unknown>)
    },
    async getPaymentChargeBySaleId() {
      return null
    },
    async applyPaymentWebhook() {},
  } as never)

  const result = await service.createChargeForSale({
    vendaId: 'venda-1',
    formaPagamentoId: 'fp1',
    valor: 100,
    descricao: 'Teste',
    comprador: {
      nome: 'Cliente Teste',
      email: 'cliente@teste.com',
      telefone: '31999999999',
      documento: '12345678901',
    },
    fiscal: { cep: '01001000', logradouro: 'Praça da Sé', numero: '1', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' },
  })

  assert.equal(result.ok, true)
  assert.equal(result.mocked, true)
  assert.match(String(result.chargeUrl), /venda-1/)
  assert.equal(attached.length, 1)
  assert.equal(attached[0].status, 'pending')
})

test('normaliza webhook pago e encaminha update para repositorio', async () => {
  const applied: Array<Record<string, unknown>> = []
  const service = new CheckoutPaymentService({
    async getCheckoutPaymentMethodConfig() {
      return null
    },
    async getPaymentChargeBySaleId() {
      return null
    },
    async attachPaymentChargeToSale() {},
    async applyPaymentWebhook(input: unknown) {
      applied.push(input as Record<string, unknown>)
    },
  } as never)

  const normalized = await service.applyWebhook({
    gateway: 'safe2pay',
    payload: {
      id: 'ext-1',
      reference: 'venda-2',
      status: 'approved',
    },
  })

  assert.equal(normalized.paid, true)
  assert.equal(normalized.status, 'paid')
  assert.equal(applied.length, 1)
  assert.equal(applied[0].externalId, 'ext-1')
  assert.equal(applied[0].vendaId, 'venda-2')
  assert.equal(applied[0].paid, true)
})

test('cria preferencia do Mercado Pago e devolve link de pagamento', async () => {
  const attached: Array<Record<string, unknown>> = []
  const service = new CheckoutPaymentService({
    async getCheckoutPaymentMethodConfig() {
      return {
        id: 'mp1', nome: 'Mercado Pago', codigo: 'checkout_pro', tipo: 'link', gateway: 'mercado_pago',
        ambiente: 'producao', client_id: null, secret_key: null,
        webhook_url: 'https://api.certiid.mantovan.com.br/api/checkout/webhook/mercado-pago',
        provider_base_url: 'https://api.mercadopago.com', provider_api_token: 'APP_USR-token', provider_metadata: {},
        runtime: { modo_teste_geral: false, bloquear_integracoes_reais: false, aviso_checkout: '' },
      }
    },
    async attachPaymentChargeToSale(input: unknown) { attached.push(input as Record<string, unknown>) },
    async getPaymentChargeBySaleId() {
      return null
    },
    async applyPaymentWebhook() {},
  } as never, undefined, async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    assert.equal(body.external_reference, 'venda-mp')
    assert.equal(body.items[0].currency_id, 'BRL')
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer APP_USR-token')
    return new Response(JSON.stringify({ id: 'pref-1', init_point: 'https://mercadopago.com/pay/pref-1' }), { status: 201 })
  })

  const result = await service.createChargeForSale({
    vendaId: 'venda-mp', formaPagamentoId: 'mp1', valor: 149.9, descricao: 'Certificado A1',
    comprador: { nome: 'Cliente', email: 'cliente@teste.com', telefone: '11999999999', documento: '12345678901' },
    fiscal: { cep: '01001000', logradouro: 'Praça da Sé', numero: '1', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' },
  })
  assert.equal(result.ok, true)
  assert.equal(result.externalId, 'pref-1')
  assert.equal(result.chargeUrl, 'https://mercadopago.com/pay/pref-1')
  assert.equal(attached[0].gateway, 'mercado_pago')
})

test('cria link de cartão sem token e respeita parcelas', async () => {
  const service = new CheckoutPaymentService({
    async getCheckoutPaymentMethodConfig() {
      return {
        id: 'mp-card',
        nome: 'Cartão crédito',
        codigo: 'credito',
        tipo: 'cartao',
        gateway: 'mercado_pago',
        ambiente: 'producao',
        client_id: null,
        secret_key: null,
        webhook_url: 'https://api.certiid.mantovan.com.br/api/checkout/webhook/mercado-pago',
        provider_base_url: 'https://api.mercadopago.com',
        provider_api_token: 'APP_USR-token',
        provider_metadata: {},
        runtime: { modo_teste_geral: false, bloquear_integracoes_reais: false, aviso_checkout: '' },
      }
    },
    async getPaymentChargeBySaleId() {
      return null
    },
    async attachPaymentChargeToSale() {},
    async applyPaymentWebhook() {},
  } as never, undefined, async (url, init) => {
    assert.match(String(url), /\/checkout\/preferences$/)
    const body = JSON.parse(String(init?.body))
    assert.equal(body.payment_methods.installments, 12)
    assert.equal(body.payment_methods.excluded_payment_types.some((item: { id: string }) => item.id === 'ticket'), true)
    assert.equal(body.payment_methods.excluded_payment_types.some((item: { id: string }) => item.id === 'bank_transfer'), true)
    return new Response(JSON.stringify({ id: 'pref-card-1', init_point: 'https://mercadopago.com/pay/card-1' }), { status: 201 })
  })

  const result = await service.createChargeForSale({
    vendaId: 'venda-card',
    formaPagamentoId: 'mp-card',
    valor: 300,
    descricao: 'Certificado Cartão',
    comprador: {
      nome: 'Cliente Teste',
      email: 'cliente@teste.com',
      telefone: '11999999999',
      documento: '12345678901',
    },
    fiscal: { cep: '01001000', logradouro: 'Praça da Sé', numero: '1', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' },
    card: { installments: 12, token: '' as string, payment_method_id: '' as string, payment_type_id: 'credit_card', identification_type: 'CPF', identification_number: '12345678901' },
  })

  assert.equal(result.ok, true)
  assert.equal(result.chargeUrl, 'https://mercadopago.com/pay/card-1')
  assert.equal(result.details?.kind, 'card')
})

test('enfileira email e whatsapp ao gerar link de pagamento', async () => {
  const attached: Array<Record<string, unknown>> = []
  const created: Array<Record<string, unknown>> = []
  const service = new CheckoutPaymentService({
    async getCheckoutPaymentMethodConfig() {
      return {
        id: 'mp1', nome: 'Mercado Pago', codigo: 'checkout_pro', tipo: 'link', gateway: 'mercado_pago',
        ambiente: 'producao', client_id: null, secret_key: null,
        webhook_url: 'https://api.certiid.mantovan.com.br/api/checkout/webhook/mercado-pago',
        provider_base_url: 'https://api.mercadopago.com', provider_api_token: 'APP_USR-token', provider_metadata: {},
        runtime: { modo_teste_geral: false, bloquear_integracoes_reais: false, aviso_checkout: '' },
      }
    },
    async attachPaymentChargeToSale(input: unknown) { attached.push(input as Record<string, unknown>) },
    async getPaymentChargeBySaleId() {
      return null
    },
    async applyPaymentWebhook() {},
  } as never, {
    async create(input: unknown) {
      created.push(input as Record<string, unknown>)
      return null as never
    },
  } as never, async (_url, init) => {
    return new Response(JSON.stringify({ id: 'pref-1', init_point: 'https://mercadopago.com/pay/pref-1' }), { status: 201 })
  })

  const result = await service.createChargeForSale({
    vendaId: 'venda-mp',
    formaPagamentoId: 'mp1',
    valor: 149.9,
    descricao: 'Certificado A1',
    comprador: { nome: 'Cliente', email: 'cliente@teste.com', telefone: '11999999999', documento: '12345678901' },
    fiscal: { cep: '01001000', logradouro: 'Praça da Sé', numero: '1', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' },
  })

  assert.equal(result.ok, true)
  assert.equal(created.length, 2)
  assert.equal(created.some(item => item.channel === 'email'), true)
  assert.equal(created.some(item => item.channel === 'whatsapp'), true)
  assert.equal(attached[0].gateway, 'mercado_pago')
})

test('consulta pagamento do Mercado Pago antes de confirmar webhook', async () => {
  const applied: Array<Record<string, unknown>> = []
  const service = new CheckoutPaymentService({
    async getCheckoutPaymentMethodConfig() { return null },
    async getCheckoutPaymentMethodConfigByGateway() {
      return {
        id: 'mp1', nome: 'Mercado Pago', codigo: null, tipo: null, gateway: 'mercado_pago', ambiente: 'producao',
        client_id: null, secret_key: null, webhook_url: null, provider_base_url: null,
        provider_api_token: 'APP_USR-token', provider_metadata: {},
        runtime: { modo_teste_geral: false, bloquear_integracoes_reais: false, aviso_checkout: '' },
      }
    },
    async getPaymentChargeBySaleId() {
      return null
    },
    async attachPaymentChargeToSale() {},
    async applyPaymentWebhook(input: unknown) { applied.push(input as Record<string, unknown>) },
  } as never, undefined, async url => {
    assert.match(String(url), /\/v1\/payments\/987$/)
    return new Response(JSON.stringify({ id: 987, external_reference: 'venda-mp', status: 'approved' }), { status: 200 })
  })

  const result = await service.applyMercadoPagoWebhook({ type: 'payment', data: { id: '987' } })
  assert.equal(result.paid, true)
  assert.equal(applied[0].vendaId, 'venda-mp')
  assert.equal(applied[0].gateway, 'mercado_pago')
})

test('cria order Pix e retorna QR Code para o checkout', async () => {
  const service = new CheckoutPaymentService({
    async getCheckoutPaymentMethodConfig() {
      return {
        id: 'mp-pix', nome: 'Pix - Mercado Pago', codigo: 'pix', tipo: 'pix', gateway: 'mercado_pago', ambiente: 'sandbox',
        client_id: null, secret_key: null, webhook_url: null, provider_base_url: null, provider_api_token: 'APP_USR-token',
        provider_metadata: {}, runtime: { modo_teste_geral: true, bloquear_integracoes_reais: false, aviso_checkout: '' },
      }
    },
    async getPaymentChargeBySaleId() {
      return null
    },
    async attachPaymentChargeToSale() {},
    async applyPaymentWebhook() {},
  } as never, undefined, async (url, init) => {
    assert.match(String(url), /\/v1\/payments$/)
    const body = JSON.parse(String(init?.body))
    assert.equal(body.transaction_amount, 50)
    assert.equal(body.payment_method_id, 'pix')
    assert.equal(body.payer.first_name, 'APRO')
    return new Response(JSON.stringify({
      id: 'PAY-PIX-1',
      status: 'pending',
      status_detail: 'pending_waiting_transfer',
      point_of_interaction: {
        transaction_data: {
          qr_code: 'copia-cola',
          qr_code_base64: 'base64',
          ticket_url: 'https://mp/pix',
        },
      },
    }), { status: 201 })
  })
  const result = await service.createChargeForSale({
    vendaId: 'venda-pix', formaPagamentoId: 'mp-pix', valor: 50, descricao: 'Certificado',
    comprador: { nome: 'Cliente Teste', email: 'cliente@teste.com', telefone: '11999999999', documento: '12345678901' },
    fiscal: { cep: '01001000', logradouro: 'Praça da Sé', numero: '1', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' },
  })
  assert.equal(result.status, 'pending')
  assert.equal(result.externalId, 'PAY-PIX-1')
  assert.equal(result.details?.qr_code, 'copia-cola')
})

test('infere boleto mesmo quando o cadastro da forma de pagamento usa nome descritivo', async () => {
  const service = new CheckoutPaymentService({
    async getCheckoutPaymentMethodConfig() {
      return {
        id: 'mp-boleto',
        nome: 'Boleto - Mercado Pago',
        codigo: null,
        tipo: null,
        gateway: 'mercado_pago',
        ambiente: 'sandbox',
        client_id: null,
        secret_key: null,
        webhook_url: null,
        provider_base_url: null,
        provider_api_token: 'APP_USR-token',
        provider_metadata: {},
        runtime: { modo_teste_geral: true, bloquear_integracoes_reais: false, aviso_checkout: '' },
      }
    },
    async getPaymentChargeBySaleId() {
      return null
    },
    async attachPaymentChargeToSale() {},
    async applyPaymentWebhook() {},
  } as never, undefined, async (url, init) => {
    assert.match(String(url), /\/v1\/orders$/)
    const body = JSON.parse(String(init?.body))
    assert.equal(body.transactions.payments[0].payment_method.id, 'boleto')
    assert.equal(body.payer.email, 'test_user_br@testuser.com')
    assert.equal(body.payer.address.zip_code, '01001000')
    return new Response(JSON.stringify({
      id: 'ORD-BOLETO-1',
      status: 'action_required',
      transactions: {
        payments: [{
          id: 'PAY-BOLETO-1',
          status: 'action_required',
          payment_method: {
            id: 'boleto',
            type: 'ticket',
            ticket_url: 'https://mp/boleto',
            digitable_line: '34191.79001 01043.510047 91020.150008 7 1234',
          },
        }],
      },
    }), { status: 201 })
  })

  const result = await service.createChargeForSale({
    vendaId: 'venda-boleto',
    formaPagamentoId: 'mp-boleto',
    valor: 125,
    descricao: 'Certificado',
    comprador: { nome: 'Cliente Teste', email: 'cliente@teste.com', telefone: '11999999999', documento: '12345678901' },
    fiscal: { cep: '01001000', logradouro: 'Praça da Sé', numero: '1', bairro: 'Sé', cidade: 'São Paulo', uf: 'SP' },
  })

  assert.equal(result.ok, true)
  assert.equal(result.details?.kind, 'boleto')
  assert.equal(result.details?.ticket_url, 'https://mp/boleto')
  assert.equal(result.details?.digitable_line, '34191.79001 01043.510047 91020.150008 7 1234')
})

test('valida HMAC e consulta order antes de confirmar pagamento', async () => {
  const applied: Array<Record<string, unknown>> = []
  const secret = 'webhook-secret'
  const dataId = 'ORD01ABC'
  const requestId = 'request-1'
  const ts = '1742505638683'
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`
  const signature = createHmac('sha256', secret).update(manifest).digest('hex')
  const service = new CheckoutPaymentService({
    async getCheckoutPaymentMethodConfig() { return null },
    async getCheckoutPaymentMethodConfigByGateway() {
      return {
        id: 'mp', nome: 'MP', codigo: 'pix', tipo: 'pix', gateway: 'mercado_pago', ambiente: 'sandbox',
        client_id: null, secret_key: null, webhook_url: null, provider_base_url: null, provider_api_token: 'APP_USR-token',
        provider_metadata: {}, webhook_secret: secret,
        runtime: { modo_teste_geral: true, bloquear_integracoes_reais: false, aviso_checkout: '' },
      }
    },
    async getPaymentChargeBySaleId() {
      return null
    },
    async attachPaymentChargeToSale() {},
    async applyPaymentWebhook(input: unknown) { applied.push(input as Record<string, unknown>) },
  } as never, undefined, async url => {
    assert.match(String(url), /\/v1\/orders\/ORD01ABC$/)
    return new Response(JSON.stringify({
      id: dataId, external_reference: 'venda-1', status: 'processed', status_detail: 'accredited',
      transactions: { payments: [{ id: 'PAY-1', status: 'processed', status_detail: 'accredited' }] },
    }), { status: 200 })
  })
  const result = await service.applyMercadoPagoOrderWebhook({
    payload: { type: 'order', data: { id: dataId } }, dataId,
    xSignature: `ts=${ts},v1=${signature}`, xRequestId: requestId,
  })
  assert.equal(result.paid, true)
  assert.equal(applied[0].vendaId, 'venda-1')
})
