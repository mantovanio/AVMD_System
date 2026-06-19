# 32 - Mapa de workflows da Clara no CRM_CertiID

## Objetivo

Reaproveitar a arquitetura e os fluxos da Clara ja existentes no CRM_CertiID para guiar a integracao do AVMD com o N8N sem quebrar a separacao entre modulos.

## O que o CRM_CertiID ja define

### N8N como orquestrador da Clara

- IA central: `N8N + Gemini/GPT (Clara)`.
- Clara responde apenas nas filas `renovacao` e `certiid`.
- A fila `atendimento` fica para humano.
- O webhook de entrada do N8N ja esta documentado como `https://auto.mantovan.com.br/webhook/crm-certiid/inbound`.

### Segredos e contratos principais

- `N8N_INBOUND_WEBHOOK_URL`
- `N8N_SHARED_SECRET`
- `EVOLUTION_WEBHOOK_SECRET`
- `WEBHOOK_SECRET_ATENDIMENTO`
- `WEBHOOK_SECRET_RENOVACAO`
- `WEBHOOK_SECRET_CERTIID`
- `CHATWOOT_WEBHOOK_SECRET`

### Fluxo inbound esperado no CRM

1. Mensagem entra pela Evolution.
2. `evolution-webhook` grava o evento e atualiza o inbox.
3. A mensagem segue para o webhook do N8N.
4. O N8N processa pela Clara.
5. A resposta pode voltar por `send_message_by_instance`.

## O que o AVMD deve reaproveitar

### Estrutura ja validada

- evento publicado no banco
- adapter N8N separado do modulo comercial
- contrato de payload exportavel
- smoke test simples para validar envio
- workflow base de recepcao criado
- workflow da Clara para log e ack criado

### Arquivos ja preparados no AVMD

- `backend/src/integrations/contracts.ts`
- `backend/src/integrations/events.ts`
- `backend/src/integrations/n8nAdapter.ts`
- `backend/src/integrations/eventProcessor.ts`
- `scripts/smoke-n8n-event.mjs`
- `n8n/avmd-event-receiver.workflow.json`
- `n8n/avmd-clara-logger.workflow.json`
- `claude/30-contrato-inicial-n8n-integrations.md`

## Mapa funcional sugerido para o AVMD

### Fluxo 1 - Comercial -> N8N

- evento: `commercial.customer.saved`
- evento: `commercial.sale.status.updated`
- evento: `commercial.validation_agenda.saved`
- dominio: `automation`
- provider: `n8n`
- direcao: `outbound`

### Fluxo 2 - N8N -> evolucao futura

- log do payload
- resposta HTTP 200
- acao simples de validacao
- depois acao real: Evolution, tarefa interna ou follow-up

### Fluxo 3 - Clara -> CRM_CertiID

- respostas geradas pela Clara devem respeitar as filas existentes do CRM_CertiID
- atendimento humano nao deve ser automatizado sem regra explicita

## Decisao de arquitetura para continuar

O AVMD deve continuar seguindo a regra:

- cada modulo e independente
- integracao acontece por contrato/evento
- N8N e a camada de orquestracao
- Clara fica do lado do CRM_CertiID como referencia funcional de automacao

## Proximo passo pratico

1. Validar o webhook do N8N com o workflow-base criado em `n8n/avmd-event-receiver.workflow.json`.
2. Publicar o payload real do `commercial.customer.saved` no endpoint do AVMD (`POST /api/integrations/events`).
3. Usar o workflow `n8n/avmd-clara-logger.workflow.json` como primeira validacao da Clara no AVMD.