# N8N workflows do AVMD

## Fluxos disponiveis

- `avmd-event-receiver.workflow.json`
- `avmd-clara-logger.workflow.json`
- `avmd-clara-inbound-router.workflow.json`
- `avmd-clara-renovacao-handler.workflow.json`
- `avmd-clara-agendamento-handler.workflow.json`
- `avmd-clara-link-resender.workflow.json`
- `avmd-clara-human-handoff.workflow.json`
- `avmd-clara-inbound-smoketest.workflow.json`
- `avmd-schedule-email-router.workflow.json`
- `avmd-schedule-email-smoketest-certiid.workflow.json`
- `avmd-schedule-email-smoketest-certifast.workflow.json`

## Pacote Clara

Os fluxos da Clara foram separados para facilitar manutencao e crescimento:

- `AVMD - Clara Inbound Router`: recebe a mensagem do cliente e decide o handler.
- `AVMD - Clara Renovacao Handler`: continua atendimento de renovacao e pode reenviar link.
- `AVMD - Clara Agendamento Handler`: continua atendimento de agendamento, documentos, reagendamento e videoconferencia.
- `AVMD - Clara Link Resender`: reenvia link de renovacao, pagamento, agendamento ou videoconferencia.
- `AVMD - Clara Human Handoff`: devolve uma resposta curta ao cliente e registra a transferencia para humano.

## Como os fluxos estao conectados

Entrada principal:

`POST /webhook/avmd-clara-inbound`

Encadeamento:

1. O roteador normaliza a mensagem.
2. Classifica a intencao por regra simples.
3. Escolhe um destino:
   - renovacao
   - agendamento
   - reenvio de link
   - humano
4. Faz POST para o handler correspondente.
5. O handler enfileira a resposta na outbox do AVMD.
6. O handler registra o evento em `integration_events`.

## Variaveis recomendadas no n8n

```env
AVMD_API_BASE_URL=https://api.certiid.mantovan.com.br/api
N8N_CLARA_INBOUND_URL=http://localhost:5678/webhook/avmd-clara-inbound
N8N_CLARA_RENOVACAO_URL=http://localhost:5678/webhook/avmd-clara-renovacao
N8N_CLARA_AGENDAMENTO_URL=http://localhost:5678/webhook/avmd-clara-agendamento
N8N_CLARA_LINK_URL=http://localhost:5678/webhook/avmd-clara-link-resender
N8N_CLARA_HUMAN_URL=http://localhost:5678/webhook/avmd-clara-human-handoff
AVMD_SCHEDULE_API_URL=https://api.certiid.mantovan.com.br/api/automation/schedule-email
N8N_SCHEDULE_ROUTER_URL=http://localhost:5678/webhook/avmd-schedule-email
```

Se quiser automatizar a importacao, crie `n8n/.env.local` a partir de `n8n/.env.example` e preencha pelo menos:

```env
N8N_API_URL=http://localhost:5678/api/v1
N8N_API_KEY=seu-token-api-do-n8n
```

## Fluxos de agendamento por e-mail

O fluxo `avmd-schedule-email-router.workflow.json` recebe um payload bruto de e-mail, identifica se o agendamento veio da `CertiID` ou da `Certifast`, extrai os campos principais e envia para o backend do AVMD em:

```text
POST /api/automation/schedule-email
```

Esse endpoint faz o resto do tratamento no sistema:

- registra o evento em `schedule_email_events`
- tenta localizar venda/agendamento existente
- atualiza o kanban de agendamento
- remove do kanban quando o evento for cancelamento
- gera mensagens de retorno por e-mail e WhatsApp na outbox
- dispara o aviso de envio de documentos para validacao

## Ordem sugerida de importacao

1. Importar `avmd-clara-inbound-router.workflow.json`.
2. Importar `avmd-clara-renovacao-handler.workflow.json`.
3. Importar `avmd-clara-agendamento-handler.workflow.json`.
4. Importar `avmd-clara-link-resender.workflow.json`.
5. Importar `avmd-clara-human-handoff.workflow.json`.
6. Importar `avmd-clara-inbound-smoketest.workflow.json`.
7. Importar `avmd-schedule-email-router.workflow.json`.
8. Importar os smoke tests de agendamento.

## Importacao rapida

Com o backend do AVMD e o n8n acessiveis, rode:

```bash
npm run n8n:import
```

Opcoes uteis:

```bash
npm run n8n:import -- --dry-run
npm run n8n:import -- --only=avmd-clara-inbound-router.workflow.json,avmd-clara-renovacao-handler.workflow.json
npm run n8n:import -- --activate
```

Comportamento do script:

- cria o workflow no n8n se ele ainda nao existir
- atualiza pelo nome se o workflow ja existir
- respeita a ordem sugerida de importacao para os fluxos principais
- usa `N8N_API_KEY` ou `N8N_API_BEARER_TOKEN` para autenticar

## Exemplos de payload

- `samples/clara.logger.sample.json`
- `samples/clara.inbound.renovacao.sample.json`
- `samples/clara.inbound.agendamento.sample.json`
- `samples/schedule.certiid.email.sample.json`
- `samples/schedule.certifast.email.sample.json`

## Resultado esperado

- A Clara consegue continuar o atendimento de renovacao pelo mesmo canal.
- A Clara consegue continuar o atendimento de agendamento pelo mesmo canal.
- Quando o cliente pede link, o fluxo tenta reenviar automaticamente.
- Quando o cliente pede humano, o fluxo registra a transferencia e responde sem travar a conversa.
- Os fluxos de agendamento continuam atualizando o CRM a partir dos e-mails.
