# 29 - Ponto de Salvamento: Comercial Aiven e Base de Integracoes

Data: 2026-06-19
Workspace: `C:\projetos\AVMD_System`

## Objetivo desta etapa

Dar continuidade a migracao do Comercial para Aiven sem perder a amarracao das tabelas que vieram do Supabase, e preparar a arquitetura para que os modulos continuem independentes, mas conversem entre si quando conectados ao sistema.

Regra arquitetural reforcada pelo usuario:

- Cada modulo deve ser independente.
- Os modulos podem se comunicar ao se conectar no sistema.
- A comunicacao entre modulos deve acontecer por contratos/eventos, nao por acoplamento direto entre telas.

## O que foi feito

### 1. Escritas do Comercial migradas para Aiven

Foram migradas/ajustadas escritas menores e operacionais do modulo Comercial:

- Atualizar status da venda.
- Criar/editar agendamento simples.
- Criar/editar cliente em `cadastros_base`.
- Criar/editar agenda de validacao em `agendamentos_validacao`.

Arquivos envolvidos:

- `backend/src/repositories/commercialRepository.ts`
- `backend/src/routes/commercialRoutes.ts`
- `src/lib/commercialAiven.ts`
- `src/pages/Comercial.tsx`

Rotas Aiven envolvidas:

- `POST /api/comercial/vendas/status`
- `POST /api/comercial/agenda/save`
- `POST /api/comercial/clientes/save`

### 2. Correcao importante em `cadastros_base`

Foi ajustada a gravacao de cliente para nao depender de `on conflict (cpf_cnpj)`, porque no schema atual do Aiven existe indice em `cpf_cnpj`, mas nao constraint unica.

A logica agora e:

- Se vier `id`, busca por `id`.
- Se nao vier `id`, busca por `cpf_cnpj`.
- Se encontrar, atualiza.
- Se nao encontrar, insere.

Isso evita erro de conflito por falta de constraint unica e preserva a operacao com os dados migrados.

### 3. Correcao importante em `agendamentos_validacao`

A tabela `agendamentos_validacao` exige `cadastro_base_id` e outros vinculos da venda.

A gravacao foi ajustada para preencher os campos a partir de `vendas_certificados`:

- `cadastro_base_id`
- `empresa_id`
- `titular_id`
- `contador_id`
- `venda_certificado_id`

Assim a agenda de validacao fica amarrada corretamente a venda, cliente e demais vinculos.

### 4. Base de integracoes criada no backend

Foi criada uma camada inicial para integracoes, com contratos e registry.

Arquivos criados:

- `backend/src/integrations/contracts.ts`
- `backend/src/integrations/registry.ts`
- `backend/src/integrations/events.ts`

A camada ja preve os dominios:

- `communication`: Evolution, email.
- `automation`: N8N.
- `payment`: Safe2Pay, Mercado Pago, bancos.
- `fiscal`: prefeitura e SEFAZ.

Importante: isso ainda e base arquitetural/contratual. Os adapters reais ainda precisam ser implementados.

### 5. Event log criado no Aiven

Foi criada a tabela `integration_events` para registrar eventos entre modulos.

Arquivo criado:

- `backend/sql/002_integration_events.sql`

A migracao foi aplicada no Aiven real e validada com consulta simples.

Tabela criada:

- `integration_events`

Campos principais:

- `domain`
- `provider`
- `direction`
- `event_type`
- `status`
- `entity_type`
- `entity_id`
- `correlation_id`
- `external_id`
- `payload`
- `metadata`
- `error_message`
- `received_at`
- `processed_at`

### 6. Rota para eventos de integracao

Foi criada rota backend para registrar eventos:

- `POST /api/integrations/events`

Arquivos envolvidos:

- `backend/src/repositories/integrationEventRepository.ts`
- `backend/src/routes/integrationRoutes.ts`
- `backend/src/server.ts`

### 7. Eventos gerados pelo Comercial

O Comercial agora registra eventos para outros modulos reagirem depois, principalmente N8N.

Eventos criados:

- `commercial.sale.status.updated`
- `commercial.customer.saved`
- `commercial.validation_agenda.saved`

Esses eventos sao registrados na tabela `integration_events` com:

- `domain = automation`
- `provider = n8n`
- `direction = outbound`
- `status = queued`

Isso preserva a independencia do Comercial. Ele nao chama Evolution, N8N, pagamento ou fiscal diretamente; ele publica um evento.

### 8. Avaliacao sobre Clerk x Supabase Auth

Foi avaliada a informacao sobre trocar `supabase.auth.getSession()` por token do Clerk.

Conclusao:

- A direcao esta correta.
- O projeto ja usa Clerk no `AuthContext`.
- Ainda existem pontos diretos de `supabase.auth.getSession()` e `supabase.auth.getUser()`.
- Nao foi feita alteracao nessa parte, porque o usuario pediu somente avaliacao.

Pontos encontrados:

- `src/lib/supabase.ts` possui `getSupabaseAccessToken()` ainda usando `supabase.auth.getSession()`.
- Algumas telas ainda usam `supabase.auth.getSession()` diretamente.
- `Comercial.tsx` ainda usa `supabase.auth.getUser()` para `currentUserId`.

Recomendacao futura:

- Criar um helper unico de token baseado em Clerk.
- Registrar `session.getToken()` no `AuthProvider`.
- Trocar os usos diretos por helper central.

## Validacoes realizadas

Build backend:

```bash
npm run build:backend
```

Resultado: passou.

Build completo:

```bash
npm run build
```

Resultado: passou.

Validacao Aiven:

- Migracao `backend/sql/002_integration_events.sql` aplicada no banco real.
- Consulta de contagem em `integration_events` respondeu com sucesso.

Observacao:

- O build Vite continua exibindo apenas aviso de chunks grandes, sem quebrar a compilacao.

## Arquivos criados nesta etapa

- `backend/sql/002_integration_events.sql`
- `backend/src/integrations/contracts.ts`
- `backend/src/integrations/registry.ts`
- `backend/src/integrations/events.ts`
- `backend/src/repositories/integrationEventRepository.ts`
- `backend/src/routes/integrationRoutes.ts`

## Arquivos alterados nesta etapa

- `backend/src/repositories/commercialRepository.ts`
- `backend/src/routes/commercialRoutes.ts`
- `backend/src/server.ts`
- `src/lib/commercialAiven.ts`
- `src/pages/Comercial.tsx`

## O que ainda precisa fazer

### Prioridade 1 - Consumidores/adapters independentes

Criar adapters reais para consumir `integration_events` sem acoplar modulos.

Comecar por:

- Adapter N8N para eventos `automation`.
- Adapter Evolution para eventos `communication`.

Resultado esperado:

- Comercial publica evento.
- N8N/Evolution processam evento.
- Status volta para `sent`, `failed`, `processed` ou equivalente.

### Prioridade 2 - Webhooks inbound

Criar rotas backend para receber retornos externos:

- Evolution API: mensagens recebidas, status de envio, midias.
- Plataformas de pagamento: status de cobranca, pagamento aprovado, vencido, cancelado.
- Fiscal prefeitura/SEFAZ: nota emitida, erro, cancelamento, retorno assíncrono.

Essas rotas devem registrar eventos inbound em `integration_events` e atualizar tabelas do modulo correto.

### Prioridade 3 - Pagamentos

Definir fluxo independente do modulo de pagamentos:

- Criar cobranca.
- Registrar evento `payment.charge.create`.
- Receber webhook `payment.status.updated`.
- Atualizar venda/financeiro por contrato.

Nao acoplar Comercial diretamente a gateways.

### Prioridade 4 - Fiscal / NFS-e / SEFAZ

Separar modulo fiscal:

- Prefeitura/NFS-e hoje ja existe parcialmente no front.
- SEFAZ precisa entrar como provider fiscal futuro.
- Criar fluxo por evento `fiscal.invoice.issue` e `fiscal.invoice.status.updated`.

Nao deixar Comercial chamar diretamente prefeitura ou SEFAZ.

### Prioridade 5 - Continuar migracao do Comercial para Aiven

Ainda existem varias escritas no Comercial que permanecem no legado Supabase.

Proximos blocos sugeridos:

- Certificados.
- Tabelas de preco.
- Itens de tabela.
- Formas de pagamento.
- Comissoes.
- Disponibilidades e indisponibilidades de agentes.
- Importacoes Safeweb/clientes.

Cuidado: esses blocos tem mais risco de negocio e devem ser migrados com testes pontuais.

### Prioridade 6 - Autenticacao Clerk

Somente depois de fechar os fluxos operacionais principais:

- Trocar helpers de token para Clerk.
- Remover usos diretos de `supabase.auth.getSession()`.
- Remover usos diretos de `supabase.auth.getUser()`.
- Garantir que Edge Functions legadas ou APIs aceitem o token correto.

## Decisao arquitetural registrada

O AVMD deve evoluir como sistema modular:

- Comercial nao deve conhecer detalhes de Evolution, N8N, gateways ou SEFAZ.
- Pagamentos nao devem depender da tela Comercial.
- Fiscal nao deve depender da tela Comercial.
- Integracoes devem entrar por eventos, contratos e adapters.
- `integration_events` passa a ser a trilha de comunicacao e auditoria entre modulos.

## Estado atual para retomada

Retomar daqui:

1. Implementar adapter/worker N8N para processar eventos `queued`.
2. Implementar adapter Evolution para mensagens outbound/inbound.
3. Definir contratos de eventos para pagamento e fiscal.
4. Continuar migracao das escritas restantes do Comercial para Aiven.

Nao esquecer:

- Nao expor credenciais.
- Manter Aiven como base oficial.
- Supabase e Edge Functions sao legado temporario quando ainda existirem dependencias.
- Preservar fallback onde fizer sentido durante a migracao.
