# N8N workflows do AVMD

## Fluxos disponiveis

- `avmd-event-receiver.workflow.json`
- `avmd-clara-logger.workflow.json`

## Ordem sugerida de validacao

1. Importar `avmd-event-receiver.workflow.json`.
2. Importar `avmd-clara-logger.workflow.json`.
3. Ativar o workflow-base de recebimento.
4. Ativar o workflow da Clara.
5. Configurar `backend/.env.local` com a URL final do webhook do AVMD:

```env
N8N_WEBHOOK_URL=https://seu-avmd-backend/api/integrations/events
```
6. Rodar o smoke test do backend.

## Exemplos de payload

- `samples/commercial.customer.saved.json`
- `samples/clara.logger.sample.json`

## Resultado esperado

- O workflow-base responde `200`.
- O workflow da Clara responde `200` com contexto simples.
- O backend registra o evento em `integration_events`.
