# Mapeamento de Workflows N8N — AVMD System

## Domínios

| Domínio | URL | Uso |
|---------|-----|-----|
| **Backend AVMD** | `https://api.certiid.mantovan.com.br` | API principal do sistema |
| **N8N Webhooks** | `https://auto.mantovan.com.br` | Gatilhos e roteamento interno |

---

## 1. Fluxo de EMAIL → CRM

### avmd-email-crm-kanban.workflow.json
**Trigger:** IMAP (lê caixa de entrada de email)
**Roteia para:** `Switch (Agendado / Cancelado)`

```
IMAP (lê inbox)
  │
  └─► Switch
       ├─ "Novo pedido" no assunto → Extrair dados → POST /api/chat/crm/events (kanban:agendado)
       │                                              └─► POST /webhook/avmd-clara-inbound (roteia para Clara)
       │
       └─ "Cancelamento" no assunto → Extrair dados do cancelamento → POST /api/chat/crm/events (kanban:cancelou_agendamento)
```

**Função:** Lê emails de agendamento da Certisign/Certifast, extrai dados do cliente/pedido, cria conversa no CRM Chat e dispara o fluxo da Clara se for agendamento.

**Webhooks que chama:**
- `POST https://api.certiid.mantovan.com.br/api/chat/crm/events` — cria evento de email no CRM
- `POST https://auto.mantovan.com.br/webhook/avmd-clara-inbound` — envia para Clara (só agendado)

---

## 2. Clara — Roteamento Central

### avmd-clara-inbound-router.workflow.json
**Webhook:** `POST /webhook/avmd-clara-inbound`
**Roteia para:** Handler específico

```
Clara Inbound Webhook
  │
  └─► Normalize Clara Message (infere intent: human_handoff, link_resend, cancelar_agendamento, etc.)
       │
       └─► Dispatch To Clara Handler → POST para handler_url
            │
            └─► Ack Clara Router (responde 200)
```

**Função:** Recebe TODAS as mensagens que entram na Clara (via WhatsApp ou email), normaliza, infere a intenção do cliente e despacha para o handler adequado.

**Destinos possíveis:**
| Intent | Handler | Webhook |
|--------|---------|---------|
| `human_handoff` | avmd-clara-human-handoff | `/webhook/avmd-clara-human-handoff` |
| `link_resend` | avmd-clara-link-resender | `/webhook/avmd-clara-link-resender` |
| `cancelar_agendamento` | avmd-clara-agendamento-handler | `/webhook/avmd-clara-agendamento` |
| `reagendar_agendamento` | avmd-clara-agendamento-handler | `/webhook/avmd-clara-agendamento` |
| `enviar_documentos` | avmd-clara-agendamento-handler | `/webhook/avmd-clara-agendamento` |
| `link_videoconferencia` | avmd-clara-agendamento-handler | `/webhook/avmd-clara-agendamento` |
| `seguir_agendamento` | avmd-clara-agendamento-handler | `/webhook/avmd-clara-agendamento` |
| `seguir_renovacao` | avmd-clara-renovacao-handler | `/webhook/avmd-clara-renovacao` |

---

## 3. Clara — Handlers

### avmd-clara-agendamento-handler.workflow.json
**Webhook:** `POST /webhook/avmd-clara-agendamento`
**Função:** Prepara resposta automática para fluxo de agendamento. Responde com link de reagendamento, link de videoconferência, ou orientação genérica.

```
Prepare Clara Reply → Queue WhatsApp Reply (POST /api/communication/outbox)
                    → Log Clara Event (POST /api/integrations/events)
                    → Ack Clara Flow
```

**APIs chamadas:**
- `POST /api/communication/outbox` — enfileira WhatsApp
- `POST /api/integrations/events` — log

### avmd-clara-renovacao-handler.workflow.json
**Webhook:** `POST /webhook/avmd-clara-renovacao`
**Função:** Prepara resposta automática para fluxo de renovação. Envia link de pagamento/renovação ou orientação.

```
Prepare Clara Reply → Queue WhatsApp Reply (POST /api/communication/outbox)
                    → Log Clara Event (POST /api/integrations/events)
                    → Ack Clara Flow
```

**APIs chamadas:**
- `POST /api/communication/outbox`
- `POST /api/integrations/events`

### avmd-clara-link-resender.workflow.json
**Webhook:** `POST /webhook/avmd-clara-link-resender`
**Função:** Reenvia link (renovação, pagamento, agendamento ou videoconferência) quando o cliente pede.

```
Prepare Clara Reply → Queue WhatsApp Reply (POST /api/communication/outbox)
                    → Log Clara Event (POST /api/integrations/events)
                    → Ack Clara Flow
```

### avmd-clara-human-handoff.workflow.json
**Webhook:** `POST /webhook/avmd-clara-human-handoff`
**Função:** Quando a Clara não consegue atender, registra handoff para atendente humano.

```
Prepare Clara Reply → Register Human Handoff (POST /api/automation/clara-handoff)
                    → Queue WhatsApp Reply (POST /api/communication/outbox)
                    → Log Clara Event (POST /api/integrations/events)
                    → Ack Clara Flow
```

**APIs chamadas:**
- `POST /api/automation/clara-handoff` — registra handoff no backend
- `POST /api/communication/outbox`
- `POST /api/integrations/events`

---

## 4. Clara — Logger (Deprecado?)

### avmd-clara-logger.workflow.json
**Webhook:** `POST /webhook/avmd-clara`
**Função:** Apenas recebe, loga e responde 200. Primeiro workflow de teste da Clara, provavelmente não usado mais.

```
AVMD Clara Webhook → Prepare Clara Context → Ack Clara Event
```

---

## 5. Envio de Email

### avmd-email-send.workflow.json
**Webhook:** `POST /webhook/avmd-email-send`
**Função:** Envia emails via SMTP. Chamado pelo backend (config `N8N_EMAIL_SEND_URL`).

```
Email Send Webhook → Send Email SMTP → Ack Email Send
```

**Credencial SMTP:** `contato@certifast.com.br`

---

## 6. Agendamento de Emails

### avmd-schedule-email-router.workflow.json
**Webhook:** `POST /webhook/avmd-schedule-email`
**Função:** Normaliza payloads de email agendado (vindos de sistemas externos como CertiID/Certifast) e encaminha para o backend.

```
Schedule Email Webhook → Normalize Schedule Email → POST /api/automation/schedule-email → Ack
```

**API chamada:** `POST /api/automation/schedule-email`

### avmd-schedule-email-smoketest-certiid.workflow.json
**Trigger:** Manual
**Função:** Smoke test que envia um agendamento CertiID de exemplo para o schedule email router. Usado para testes.

```
Manual Trigger → Build CertiID Sample → POST /webhook/avmd-schedule-email
```

### avmd-schedule-email-smoketest-certifast.workflow.json
**Trigger:** Manual
**Função:** Smoke test que envia um agendamento Certifast de exemplo para o schedule email router. Usado para testes.

```
Manual Trigger → Build Certifast Sample → POST /webhook/avmd-schedule-email
```

---

## 7. Timeout Checker

### avmd-timeout-checker.workflow.json
**Trigger:** Schedule (a cada 2 minutos)
**Função:** Verifica conversas paradas no CRM Chat (sem resposta há X minutos) e notifica Clara.

```
Schedule Trigger (2 min) → POST /api/chat/crm/check-timeout → Ack
```

**API chamada:** `POST /api/chat/crm/check-timeout`

---

## 8. Event Receiver (Sub-rotina)

### avmd-event-receiver.workflow.json
**Webhook:** `POST /webhook/avmd-events`
**Função:** Receptor genérico de eventos do AVMD. Apenas acks e responde 200. Usado como webhook de callback.

```
AVMD Events Webhook → Ack AVMD Event
```

---

## 9. Clara Inbound Smoke Test

### avmd-clara-inbound-smoketest.workflow.json
**Trigger:** Manual
**Função:** Smoke test que envia uma mensagem de exemplo para o Clara Inbound Router. Usado para testar o pipeline completo da Clara.

```
Manual Trigger → Build Clara Sample → POST /webhook/avmd-clara-inbound
```

---

## Diagrama de Conexões

```
                  ┌─────────────────┐
                  │   IMAP (Email)   │
                  │  (avmd-email-    │
                  │  crm-kanban)     │
                  └────────┬────────┘
                           │ subject: "Novo pedido" / "Cancelamento"
                           ▼
                  ┌─────────────────┐
                  │  POST /api/     │
                  │  chat/crm/events│
                  │  (cria conversa │
                  │   no chat)      │
                  └────────┬────────┘
                           │ (só agendado)
                           ▼
                  ┌─────────────────┐
                  │  Clara Inbound  │
                  │  Router         │
                  └────────┬────────┘
                           │ infere intent
              ┌────────────┼────────────┐
              ▼            ▼            ▼
    ┌─────────────┐ ┌───────────┐ ┌──────────┐
    │ Agendamento │ │ Renovacao │ │ Human    │
    │ Handler     │ │ Handler   │ │ Handoff  │
    └──────┬──────┘ └─────┬─────┘ └─────┬────┘
           │              │             │
           └──────────────┼─────────────┘
                          ▼
                 ┌─────────────────┐
                 │  POST /api/     │
                 │  communication/ │
                 │  outbox         │
                 │  (WhatsApp)     │
                 └─────────────────┘


  ┌───────────────────────┐
  │  Schedule Trigger     │
  │  (2 min)              │
  │  avmd-timeout-checker │
  └───────────┬───────────┘
              │
              ▼
  ┌───────────────────────┐
  │  POST /api/chat/      │
  │  crm/check-timeout    │
  └───────────────────────┘


  ┌───────────────────────┐
  │  Schedule Email       │
  │  Router               │
  │  (webhook)            │
  └───────────┬───────────┘
              │
              ▼
  ┌───────────────────────┐
  │  POST /api/           │
  │  automation/          │
  │  schedule-email       │
  └───────────────────────┘


  ┌───────────────────────┐
  │  Backend envia email  │
  │  via N8N_SEND_URL     │
  └───────────┬───────────┘
              │
              ▼
  ┌───────────────────────┐
  │  Email Send (SMTP)    │
  │  avmd-email-send      │
  └───────────────────────┘
```

---

## Observações

- **Todos os workflows no repo estão com `active: false`** — a ativação é feita manualmente pela UI do n8n.
- A **ordem de ativação** deve ser: handlers → inbound router → email kanban, para que os webhooks existam quando forem chamados.
- O fluxo de email **só processa assuntos com "Novo pedido" ou "Cancelamento"** — outros emails são ignorados pelo workflow.
- O `onError: "continueRegularOutput"` no IMAP e nos HTTP requests significa que falhas não bloqueiam o workflow.
- `certisign-recebimento-agendamento.workflow.json` está **vazio** (0 bytes) — pode ser removido.
