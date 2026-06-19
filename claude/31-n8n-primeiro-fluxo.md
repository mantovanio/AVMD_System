# 31 - Primeiro fluxo real do N8N

## Objetivo
Colocar o primeiro webhook real do N8N para receber eventos do AVMD e responder com um ack simples.

## Artefato criado
- [n8n/avmd-event-receiver.workflow.json](../n8n/avmd-event-receiver.workflow.json)

## O que esse workflow faz
- Recebe `POST` em `avmd-events`.
- Responde com `200` e um JSON simples.
- Nao executa automacao real ainda.

## Configuracao esperada no backend
No [backend/.env.local](../backend/.env.local), definir:

```env
N8N_WEBHOOK_URL=https://seu-avmd-backend/api/integrations/events
```

## Como usar
1. Importar o arquivo JSON no N8N.
2. Ativar o workflow.
3. Apontar `N8N_WEBHOOK_URL` para o webhook gerado pelo N8N.
4. Rodar o smoke test:

```bash
node scripts/smoke-n8n-event.mjs
```

## Resultado esperado
- O evento entra na tabela `integration_events`.
- O adapter N8N envia o payload.
- O N8N responde `200`.
- O evento finaliza como `sent`.

## Proximo passo depois de validar
Adicionar um primeiro node de acao no N8N, por exemplo:
- log interno do payload
- criacao de tarefa
- envio simples via Evolution
