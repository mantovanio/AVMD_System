# Contrato inicial AVMD -> N8N

Este contrato define o primeiro fluxo modular entre o AVMD e o N8N.

## Principio

Os modulos do AVMD continuam independentes. Um modulo publica evento em `integration_events`; o processador de integracoes envia o evento para o adapter correto.

## Variavel obrigatoria

No backend:

```env
N8N_WEBHOOK_URL=https://seu-n8n/webhook/avmd-events
```

## Metodo

`POST` para `N8N_WEBHOOK_URL`.

## Payload enviado

O N8N recebe o envelope completo do evento:

```json
{
  "id": "uuid-do-evento",
  "domain": "automation",
  "provider": "n8n",
  "direction": "outbound",
  "event_type": "commercial.customer.saved",
  "status": "processing",
  "entity_type": "cadastros_base",
  "entity_id": "uuid-do-cliente",
  "correlation_id": null,
  "payload": {
    "cpf_cnpj": "documento",
    "nome": "Nome do cliente"
  },
  "metadata": {
    "origem": "comercial_aiven"
  }
}
```

## Eventos comerciais iniciais

- `commercial.customer.saved`
- `commercial.sale.status.updated`
- `commercial.validation_agenda.saved`

## Smoke test

Depois de configurar `N8N_WEBHOOK_URL`, rode:

```bash
npm run build:backend
node scripts/smoke-n8n-event.mjs
```

Resultado esperado:

- O N8N recebe o payload.
- O evento fica como `sent` em `integration_events`.
- Se a URL nao estiver configurada ou retornar erro, o evento fica como `failed` com `error_message`.

## Primeiro workflow recomendado no N8N

1. Webhook trigger `POST /avmd-events`.
2. Node Set ou Code para registrar `event_type`, `entity_type`, `entity_id` e `payload`.
3. Responder HTTP 200 com:

```json
{
  "ok": true,
  "received": true
}
```

Somente depois de validar esse recebimento, adicionar acoes reais como Evolution, CRM, pagamento ou fiscal.
