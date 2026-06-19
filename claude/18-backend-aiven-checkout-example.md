# Exemplo de Estrutura do Backend Aiven do Checkout

```ts
import type {
  CheckoutContextApiRequest,
  CheckoutContextApiResponse,
  CheckoutLookupCustomerApiResponse,
  CheckoutSubmitRequest,
  CheckoutSubmitResponse,
} from '../src/lib/checkoutContract'

export async function postCheckoutContext(body: CheckoutContextApiRequest) {
  if (body.action === 'context') {
    return handleCheckoutContext(body)
  }

  if (body.action === 'lookup_customer') {
    return handleCheckoutLookupCustomer(body.documento)
  }

  return { ok: false, error: 'Acao invalida.' }
}

async function handleCheckoutContext(
  body: Extract<CheckoutContextApiRequest, { action: 'context' }>
): Promise<CheckoutContextApiResponse> {
  const loja = await repo.findMarketplaceStore(body.slug)
  if (!loja) return { ok: false, error: 'Loja nao encontrada.' }

  const tabela = await repo.findPriceTable(loja.tabela_preco_id)
  const produtos = await repo.findMarketplaceProducts(loja.tabela_preco_id)
  const pagamentos = await repo.findActivePaymentMethods()
  const paymentRuntime = await repo.getPaymentRuntime()
  const agenda = await repo.getCheckoutScheduleContext()

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

async function handleCheckoutLookupCustomer(documento: string): Promise<CheckoutLookupCustomerApiResponse> {
  const cadastro = await repo.findLatestActiveCustomerByDocument(documento)
  return { ok: true, cadastro }
}

export async function postCheckoutSubmit(body: CheckoutSubmitRequest): Promise<CheckoutSubmitResponse> {
  return db.transaction(async trx => {
    const loja = await repo.findMarketplaceStore(body.slug, trx)
    if (!loja) return { ok: false, error: 'Loja nao encontrada.' }

    const item = await repo.findMarketplaceItem(body.item_id, trx)
    if (!item || item.tabela_preco_id !== loja.tabela_preco_id) {
      return { ok: false, error: 'Item invalido para esta loja.' }
    }

    const comprador = await repo.upsertCheckoutCustomer(body, trx)
    const titular = await repo.upsertCheckoutHolder(body, comprador.id, trx)
    const venda = await repo.createCheckoutSale({ body, loja, item, comprador, titular }, trx)

    if (body.agendamento) {
      await repo.createCheckoutSchedule({ body, venda }, trx)
    }

    return {
      ok: true,
      message: 'Pedido criado com sucesso.',
      venda_id: venda.id,
      protocolo_numero: venda.protocolo_numero ?? null,
      redirect_url: null,
    }
  })
}
```

## Repositorios minimos esperados
- `findMarketplaceStore(slug)`
- `findPriceTable(tabelaPrecoId)`
- `findMarketplaceProducts(tabelaPrecoId)`
- `findActivePaymentMethods()`
- `getPaymentRuntime()`
- `getCheckoutScheduleContext()`
- `findLatestActiveCustomerByDocument(documento)`
- `upsertCheckoutCustomer(body)`
- `upsertCheckoutHolder(body, cadastroBaseId)`
- `createCheckoutSale(payload)`
- `createCheckoutSchedule(payload)`
