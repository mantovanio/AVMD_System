# Engage - estrutura tecnica do backend

Este documento registra a estrutura backend planejada para o modulo `Engage` dentro do AVMD System.

## Objetivo

Entregar uma camada tecnica para:

- segmentar contatos
- disparar campanhas
- receber retornos
- reagir a respostas
- criar tarefas de follow-up
- medir resultado por canal, provedor e numero

## Tabelas principais

### `engage_contacts`

Base operacional de contatos usada pelo modulo.

Campos sugeridos:

- `id`
- `core_contact_id`
- `name`
- `email`
- `phone`
- `document`
- `status`
- `score`
- `last_contact_at`
- `next_action_at`
- `opt_out_at`
- `created_at`
- `updated_at`

### `engage_tags`

Tags livres para classificação comercial.

Campos:

- `id`
- `name`
- `color`
- `created_at`

### `engage_contact_tags`

Relacionamento N:N entre contatos e tags.

### `engage_segments`

Segmentos dinâmicos por regra.

Campos:

- `id`
- `name`
- `description`
- `rule_json`
- `is_active`
- `created_at`
- `updated_at`

### `engage_providers`

Cadastro dos provedores de comunicação.

Exemplos:

- Meta / Cloud API
- Evolution API
- Z-API
- outros conectores

Campos:

- `id`
- `key`
- `name`
- `channel`
- `status`
- `config_json`
- `created_at`
- `updated_at`

### `engage_sender_accounts`

Instancias ou numeros usados nos disparos.

Campos:

- `id`
- `provider_id`
- `label`
- `phone_number`
- `channel`
- `daily_limit`
- `hourly_limit`
- `priority`
- `risk_score`
- `status`
- `metadata_json`
- `created_at`
- `updated_at`

### `engage_templates`

Templates por canal.

Campos:

- `id`
- `provider_id`
- `channel`
- `name`
- `category`
- `subject`
- `body`
- `variables_json`
- `approval_status`
- `created_at`
- `updated_at`

### `engage_campaigns`

Campanhas criadas na plataforma.

Campos:

- `id`
- `name`
- `channel`
- `segment_id`
- `template_id`
- `sender_account_id`
- `status`
- `scheduled_at`
- `created_by`
- `created_at`
- `updated_at`

### `engage_campaign_messages`

Envio individual por contato.

Campos:

- `id`
- `campaign_id`
- `contact_id`
- `provider_id`
- `sender_account_id`
- `provider_message_id`
- `status`
- `sent_at`
- `delivered_at`
- `read_at`
- `clicked_at`
- `replied_at`
- `failed_at`
- `failure_reason`
- `created_at`
- `updated_at`

### `engage_conversations`

Conversa associada ao contato e ao canal.

Campos:

- `id`
- `contact_id`
- `channel`
- `status`
- `assigned_to`
- `last_message_at`
- `created_at`
- `updated_at`

### `engage_messages`

Mensagens de entrada e saida da conversa.

Campos:

- `id`
- `conversation_id`
- `direction`
- `channel`
- `provider_message_id`
- `body`
- `payload_json`
- `status`
- `created_at`

### `engage_events`

Log bruto de eventos.

Campos:

- `id`
- `contact_id`
- `campaign_id`
- `conversation_id`
- `message_id`
- `event_type`
- `provider_id`
- `payload_json`
- `created_at`

### `engage_automation_rules`

Regras automáticas.

Campos:

- `id`
- `name`
- `trigger_event`
- `conditions_json`
- `actions_json`
- `priority`
- `is_active`
- `created_at`
- `updated_at`

### `engage_automation_logs`

Auditoria de cada automacao executada.

Campos:

- `id`
- `rule_id`
- `contact_id`
- `campaign_id`
- `event_type`
- `action_taken`
- `before_state`
- `after_state`
- `executed_at`

### `engage_tasks`

Fila humana de follow-up.

Campos:

- `id`
- `contact_id`
- `campaign_id`
- `conversation_id`
- `title`
- `type`
- `status`
- `due_at`
- `assigned_to`
- `created_at`
- `updated_at`

## Rotas do backend

### Contatos

- `GET /api/engage/contacts`
- `GET /api/engage/contacts/:id`
- `PATCH /api/engage/contacts/:id`
- `POST /api/engage/contacts/:id/tags`
- `DELETE /api/engage/contacts/:id/tags/:tagId`

### Segmentos

- `GET /api/engage/segments`
- `POST /api/engage/segments`
- `GET /api/engage/segments/:id`
- `PATCH /api/engage/segments/:id`
- `POST /api/engage/segments/:id/test`

### Provedores e numeros

- `GET /api/engage/providers`
- `POST /api/engage/providers`
- `GET /api/engage/sender-accounts`
- `POST /api/engage/sender-accounts`
- `PATCH /api/engage/sender-accounts/:id`

### Templates

- `GET /api/engage/templates`
- `POST /api/engage/templates`
- `GET /api/engage/templates/:id`
- `PATCH /api/engage/templates/:id`

### Campanhas

- `GET /api/engage/campaigns`
- `POST /api/engage/campaigns`
- `GET /api/engage/campaigns/:id`
- `PATCH /api/engage/campaigns/:id`
- `POST /api/engage/campaigns/:id/send`
- `POST /api/engage/campaigns/:id/schedule`
- `POST /api/engage/campaigns/:id/pause`
- `POST /api/engage/campaigns/:id/resume`

### Inbox

- `GET /api/engage/inbox`
- `GET /api/engage/inbox/:conversationId`
- `POST /api/engage/inbox/:conversationId/reply`
- `PATCH /api/engage/inbox/:conversationId`

### Automações

- `GET /api/engage/automations`
- `POST /api/engage/automations`
- `GET /api/engage/automations/:id`
- `PATCH /api/engage/automations/:id`
- `POST /api/engage/automations/:id/run`

### Relatórios

- `GET /api/engage/reports/overview`
- `GET /api/engage/reports/campaigns`
- `GET /api/engage/reports/segments`
- `GET /api/engage/reports/channels`
- `GET /api/engage/reports/providers`

### Webhooks

- `POST /api/engage/webhooks/meta`
- `POST /api/engage/webhooks/evolution`
- `POST /api/engage/webhooks/zapi`
- `POST /api/engage/webhooks/email`

## Integrações

### Meta / Cloud API

- envio de template
- recebimento de status
- resposta de conversa
- leitura e entrega

### Evolution API

- envio por numero/instancia
- recebimento de mensagens
- eventos de entrega e falha

### Z-API

- fallback ou numeros adicionais
- redundancia operacional

### E-mail

- SMTP ou provider transacional
- abertura, clique, bounce e descadastro

## Webhooks

Todos os webhooks devem ser:

- idempotentes
- autenticados por segredo ou assinatura
- normalizados antes de gerar eventos internos
- auditados em `engage_events`

Eventos esperados:

- `message.sent`
- `message.delivered`
- `message.read`
- `message.failed`
- `message.replied`
- `message.clicked`
- `contact.opt_out`
- `campaign.completed`

## Fila de disparo

A fila de disparo deve separar:

- campanha
- contato
- canal
- provedor
- numero de origem

Etapas sugeridas:

1. campanha aprovada entra na fila
2. o sistema resolve o segmento
3. escolhe provedor e numero
4. envia mensagem
5. grava `provider_message_id`
6. aguarda eventos do webhook
7. atualiza status e automacoes

## Regras de roteamento

- selecionar o numero com melhor reputacao
- limitar volume por hora e por dia
- evitar sobrecarga por canal
- pausar contatos com opt-out
- trocar provedor se houver falha repetida

## Critério de prontidão

O backend do Engage estara pronto quando:

- campanhas puderem ser criadas e disparadas
- provedores e numeros estiverem configurados
- webhooks atualizarem o historico
- automacoes reagirem aos eventos
- relatórios consolidarem por canal e provedor
