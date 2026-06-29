import test from 'node:test'
import assert from 'node:assert/strict'
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
