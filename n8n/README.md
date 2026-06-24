# N8N workflows do AVMD

## Fluxos disponiveis

- `avmd-event-receiver.workflow.json`
- `avmd-clara-logger.workflow.json`
- `avmd-schedule-email-router.workflow.json`
- `avmd-schedule-email-smoketest-certiid.workflow.json`
- `avmd-schedule-email-smoketest-certifast.workflow.json`

## Objetivo dos novos fluxos

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

1. Importar `avmd-schedule-email-router.workflow.json`.
2. Importar `avmd-schedule-email-smoketest-certiid.workflow.json`.
3. Importar `avmd-schedule-email-smoketest-certifast.workflow.json`.
4. Importar os fluxos antigos se ainda forem usados: `avmd-event-receiver.workflow.json` e `avmd-clara-logger.workflow.json`.

## Variaveis recomendadas no n8n

```env
AVMD_SCHEDULE_API_URL=http://localhost:8787/api/automation/schedule-email
N8N_SCHEDULE_ROUTER_URL=http://localhost:5678/webhook/avmd-schedule-email
```

Se o backend estiver publicado, troque `localhost` pela URL final da sua API.

## Como usar

### 1. Roteador principal

Ative o workflow `AVMD - Schedule Email Router`.

Webhook esperado:

```text
POST /webhook/avmd-schedule-email
```

Payload minimo aceito:

```json
{
  "mailbox": "contato@certifast.com.br",
  "from": "contato@certifast.com.br",
  "to": "operacao@seudominio.com.br",
  "subject": "Novo pedido agendado - 26390716 dia 25/06/2026 às 15:00",
  "body_text": "conteudo do e-mail",
  "body_html": "<p>conteudo do e-mail</p>",
  "external_id": "id-unico",
  "message_id": "<id-da-mensagem>"
}
```

### 2. Smoke tests

Rode manualmente:

- `AVMD - Schedule Email Smoke Test - CertiID`
- `AVMD - Schedule Email Smoke Test - Certifast`

Eles simulam o e-mail recebido e publicam no webhook do roteador.

## Exemplos de payload

- `samples/commercial.customer.saved.json`
- `samples/clara.logger.sample.json`
- `samples/schedule.certiid.email.sample.json`
- `samples/schedule.certifast.email.sample.json`

## Proximo encaixe do e-mail real

Esses fluxos ja deixam pronta a camada de tratamento. Para leitura real da caixa postal, o ideal e criar no n8n um workflow por inbox usando IMAP ou o provedor de e-mail escolhido, e apontar a saida desse workflow para o webhook:

```text
/webhook/avmd-schedule-email
```

Assim voce separa:

- captura do e-mail
- normalizacao e roteamento
- tratamento no backend

## Resultado esperado

- CertiID entra com `AR CertiID`.
- Certifast entra com `AR Certifast`.
- Cancelamentos deixam de manter o agendamento ativo no kanban.
- Reagendamentos atualizam a data.
- A outbox recebe os retornos de confirmacao e o aviso de documentos.
