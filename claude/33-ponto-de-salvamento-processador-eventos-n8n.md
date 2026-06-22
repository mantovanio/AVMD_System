# 33 - Ponto de Salvamento: Processador de Eventos e N8N

Data: 2026-06-22
Workspace: `C:\projetos\AVMD_System`

## Contexto

Este ponto registra a continuidade depois do handoff `29-ponto-de-salvamento-comercial-aiven-integracoes.md` e do contrato `30-contrato-inicial-n8n-integrations.md`.

A regra arquitetural definida segue valendo:

- Cada modulo e independente.
- Os modulos se comunicam ao se conectar no sistema.
- A comunicacao deve acontecer por contratos/eventos.
- Comercial nao deve chamar Evolution, N8N, pagamentos, prefeitura ou SEFAZ diretamente.

## O que foi feito nesta etapa

### 1. Processor de eventos criado

Foi criado o processador de eventos para a tabela `integration_events`.

Arquivo criado:

- `backend/src/integrations/eventProcessor.ts`

Responsabilidade:

- Buscar eventos `queued`.
- Marcar como `processing`.
- Executar o adapter correspondente.
- Atualizar o evento como `sent`, `failed` ou `ignored`.
- Registrar retorno/erro no proprio evento.

### 2. Repository de eventos ampliado

Arquivo alterado:

- `backend/src/repositories/integrationEventRepository.ts`

Foi adicionado:

- Tipo `IntegrationEventRecord`.
- Metodo `listQueued(limit)` com `for update skip locked`.
- Preservado `create()`.
- Preservado `markProcessed()`.

Importante:

- `listQueued()` pega somente eventos `queued` e `direction = outbound`.
- Isso evita processar webhooks inbound como se fossem disparos externos.

### 3. Adapter N8N criado

Arquivo criado:

- `backend/src/integrations/n8nAdapter.ts`

Responsabilidade:

- Enviar o envelope completo do evento para `N8N_WEBHOOK_URL`.
- Se a URL nao estiver configurada, retorna erro claro.
- Se o N8N retornar erro HTTP, marca o evento como `failed`.
- Se o N8N responder OK, marca como `sent`.

Variavel esperada no backend:

```env
N8N_WEBHOOK_URL=
```

### 4. Adapter Evolution criado

Arquivo criado:

- `backend/src/integrations/evolutionAdapter.ts`

Responsabilidade inicial:

- Processar eventos `communication/evolution` do tipo `message.send`.
- Enviar mensagem de texto usando Evolution API.

Variaveis esperadas no backend:

```env
EVOLUTION_BASE_URL=
EVOLUTION_API_TOKEN=
EVOLUTION_INSTANCE_NAME=
```

Observacao:

- Ainda nao foi feito teste real com Evolution porque as variaveis nao foram configuradas nesta etapa.

### 5. Registry de integracoes criado

Arquivo criado:

- `backend/src/integrations/createRegistry.ts`

Responsabilidade:

- Registrar adapters disponiveis.
- Hoje registra:
  - `N8nAdapter`
  - `EvolutionAdapter`

### 6. Rota de processamento criada

Arquivo alterado:

- `backend/src/routes/integrationRoutes.ts`

Rotas atuais:

- `POST /api/integrations/events`
- `POST /api/integrations/process`

Uso:

- `/events` cria eventos manualmente/programaticamente.
- `/process` processa a fila de eventos `queued`.

### 7. Server plugado com integracoes

Arquivo alterado:

- `backend/src/server.ts`

Foi conectado:

- `IntegrationEventRepository`
- `createIntegrationRegistry(config)`
- `IntegrationEventProcessor`
- `handleIntegrationRoutes(...)`

### 8. Configuracoes de ambiente atualizadas

Arquivos alterados/criados:

- `backend/src/config/env.ts`
- `backend/.env.example`
- `.env.example`

Novas variaveis previstas:

```env
N8N_WEBHOOK_URL=
EVOLUTION_BASE_URL=
EVOLUTION_API_TOKEN=
EVOLUTION_INSTANCE_NAME=
```

Importante:

- Essas variaveis foram documentadas, mas nao foram preenchidas com credenciais reais.
- Nao colocar tokens reais no GitHub.

### 9. Script de smoke test N8N criado

Arquivo criado:

- `scripts/smoke-n8n-event.mjs`

O script:

- Cria um evento `automation/n8n` em `integration_events`.
- Executa o processor.
- Mostra o resultado no terminal.

Comando:

```bash
npm run build:backend
node scripts/smoke-n8n-event.mjs
```

### 10. Contrato N8N documentado

Arquivo criado:

- `claude/30-contrato-inicial-n8n-integrations.md`

Conteudo:

- Contrato do webhook AVMD -> N8N.
- Payload esperado.
- Eventos comerciais iniciais.
- Smoke test.
- Primeiro workflow recomendado no N8N.

## Validacoes realizadas

### Build backend

```bash
npm run build:backend
```

Resultado: passou.

### Build completo

```bash
npm run build
```

Resultado: passou.

Observacao:

- O Vite segue exibindo apenas alerta de chunks grandes.
- Nao e erro de build.

### Smoke test N8N sem URL configurada

Comando executado:

```bash
node scripts/smoke-n8n-event.mjs
```

Resultado esperado e obtido:

- Evento criado no Aiven.
- Processor tentou enviar para N8N.
- Como `N8N_WEBHOOK_URL` nao esta configurada, evento foi marcado como `failed`.
- Erro registrado: `N8N_WEBHOOK_URL nao configurada.`

Isso valida que:

- A tabela `integration_events` esta funcionando.
- O processor esta funcionando.
- A falha fica rastreavel.
- Nao ha falha silenciosa.

## Estado atual

A arquitetura modular de integracoes ja esta pronta em nivel inicial:

- Modulos publicam eventos.
- Eventos ficam no Aiven.
- Processor processa eventos.
- Registry escolhe adapter.
- Adapter tenta executar integracao externa.
- Resultado volta para `integration_events`.

O Comercial ja publica eventos como:

- `commercial.sale.status.updated`
- `commercial.customer.saved`
- `commercial.validation_agenda.saved`

N8N e Evolution ja tem adapters iniciais.

## O que ainda precisa fazer

### Prioridade 1 - Criar webhook real no N8N

No N8N:

1. Criar workflow com Webhook Trigger.
2. Metodo: `POST`.
3. Caminho sugerido: `/avmd-events`.
4. Responder HTTP 200 com:

```json
{
  "ok": true,
  "received": true
}
```

Depois preencher no backend:

```env
N8N_WEBHOOK_URL=https://seu-n8n/webhook/avmd-events
```

Rodar:

```bash
node scripts/smoke-n8n-event.mjs
```

Resultado esperado depois da URL configurada:

- Evento deve ficar `sent`.
- Payload deve aparecer no N8N.

### Prioridade 2 - Testar Evolution real

Configurar:

```env
EVOLUTION_BASE_URL=
EVOLUTION_API_TOKEN=
EVOLUTION_INSTANCE_NAME=
```

Depois criar um evento `communication/evolution/message.send` e processar.

Resultado esperado:

- Mensagem enviada pela Evolution.
- Evento marcado como `sent`.
- Retorno da Evolution registrado em `metadata.result_payload`.

### Prioridade 3 - Criar rotina operacional de processamento

Hoje o processamento e manual/controlado via:

- `POST /api/integrations/process`
- `node scripts/smoke-n8n-event.mjs`

Ainda precisa decidir a forma operacional:

- Cron chamando `/api/integrations/process`.
- Worker separado Node.
- N8N chamando o processor periodicamente.
- Job no servidor.

Recomendacao:

- Comecar com cron/worker simples a cada 30 ou 60 segundos.
- Depois sofisticar se necessario.

### Prioridade 4 - Webhooks inbound

Criar rotas para receber eventos externos:

- Evolution inbound: mensagens recebidas, status de entrega, midias.
- Pagamentos inbound: aprovado, pendente, vencido, cancelado.
- Fiscal inbound: nota emitida, erro, cancelamento, retorno prefeitura/SEFAZ.

Esses webhooks devem registrar eventos `direction = inbound` em `integration_events` e atualizar o modulo dono do dado.

### Prioridade 5 - Continuar migracao Comercial para Aiven

Ainda restam escritas importantes do Comercial no legado Supabase:

- Certificados.
- Tabelas de preco.
- Itens de tabela.
- Formas de pagamento.
- Comissoes.
- Disponibilidades de agentes.
- Indisponibilidades de agentes.
- Importacoes de clientes/Safeweb.

Migrar com cuidado, por blocos.

### Prioridade 6 - Clerk/Auth

Foi apenas avaliado, sem alteracao.

Ainda precisa, no futuro:

- Centralizar token Clerk.
- Remover usos diretos de `supabase.auth.getSession()`.
- Remover usos diretos de `supabase.auth.getUser()`.
- Garantir compatibilidade com endpoints legados que ainda esperem Bearer token.

## Arquivos criados nesta etapa

- `backend/src/integrations/n8nAdapter.ts`
- `backend/src/integrations/evolutionAdapter.ts`
- `backend/src/integrations/createRegistry.ts`
- `backend/src/integrations/eventProcessor.ts`
- `scripts/smoke-n8n-event.mjs`
- `backend/.env.example`
- `claude/30-contrato-inicial-n8n-integrations.md`
- `claude/33-ponto-de-salvamento-processador-eventos-n8n.md`

## Arquivos alterados nesta etapa

- `backend/src/config/env.ts`
- `backend/src/repositories/integrationEventRepository.ts`
- `backend/src/routes/integrationRoutes.ts`
- `backend/src/server.ts`
- `backend/src/integrations/contracts.ts`
- `.env.example`

## Observacoes importantes

- Nao ha URL real do N8N configurada ainda.
- Nao ha credenciais Evolution configuradas ainda.
- O smoke test falhar com `N8N_WEBHOOK_URL nao configurada` e o comportamento correto neste momento.
- Nao expor credenciais em arquivos versionados.
- Aiven segue como base oficial.
- Supabase segue como legado temporario onde ainda houver dependencia.
