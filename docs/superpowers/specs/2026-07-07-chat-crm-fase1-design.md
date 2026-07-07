# Chat ao Vivo × CRM Geral — Fase 1: correções pontuais na trigger de sincronização

## Contexto

Uma auditoria completa do sistema de chat (`docs/superpowers/specs/` — resultado da varredura, resumido abaixo) encontrou que o AVMD_System hoje opera com **três bases de dados diferentes**:

1. Supabase real (`cvfrhfiaprdtwxxplngk.supabase.co`), acessado direto do navegador por `Clientes.tsx`, `Configuracoes.tsx`, `Financeiro.tsx`, `CRM.tsx` (órfão, não roteado) e partes de `ChatInboxCRM.tsx`.
2. O Postgres único acessado pelo backend Node via `DATABASE_URL` (dono de `cadastros_base`, `crm_customers`, `crm_chat_conversations`, `crm_chat_messages`, `leads_contabilidade`, `communication_events`).
3. Efetivamente uma segunda cópia de `leads_contabilidade` dentro da base 1, fisicamente diferente da cópia da base 2, sem qualquer ponte entre elas.

A causa é uma migração Supabase-direto → backend Node que foi concluída em `AuthContext`, `communication.ts` e todo o backend de chat, mas não foi concluída nas telas de Clientes/Configurações/Financeiro. Essa migração completa é a **Fase 3** (grande, arriscada, fora do escopo deste documento). A **Fase 2** trata da unicidade de telefone e normalização única. Este documento cobre só a **Fase 1**: os dois bugs de comportamento mais visíveis, ambos dentro da trigger `fn_sync_communication_event` (que já vive na base 2, sem depender da Fase 3 para ser corrigida), mais um ajuste pequeno e relacionado no fluxo de criação manual de conversa.

## Objetivo da Fase 1

Ao chamar um contato a partir do CRM e conversar com ele, os dados do contato no painel não devem mudar sozinhos por causa da própria conversa acontecendo. Concretamente:

1. O nome do contato exibido numa conversa nunca deve ser sobrescrito pelo nome do atendente humano que respondeu.
2. Salvar o formulário de contato (nome/telefone/e-mail/observações) no painel não deve apagar a prévia da última mensagem nem reordenar a conversa para o topo da lista, já que nenhuma mensagem real foi trocada nesse momento.
3. Iniciar uma conversa nova a partir do atalho de "Clientes" deve gravar o nome do contato já na criação, em vez de depender só do que a trigger conseguir inferir depois.

## Fora de escopo (fica para Fase 2 / Fase 3)

- Unicidade de telefone / normalização canônica compartilhada entre frontend e backend.
- Migrar `Clientes.tsx`/`Configuracoes.tsx`/`Financeiro.tsx` para parar de falar direto com o Supabase legado.
- Resolver conversas duplicadas já existentes em produção (dado histórico) — este documento só impede que o problema piore daqui pra frente.
- Corrigir a duplicidade de linhas em `crm_chat_messages` (mesmo `external_message_id` inserido duas vezes) — identificada na mesma investigação, mas é um problema de schema (falta constraint única) que pertence à Fase 2.

## Fix 1 — trigger não deve sobrescrever `cliente_nome` a partir de mensagem enviada pelo atendente

**Arquivo**: nova migração `backend/sql/034_fix_cliente_nome_overwrite.sql`, que recria a função `fn_sync_communication_event()` (mesmo padrão das migrações 031/033).

**Causa raiz** (confirmada com dado real de produção, ver seção `(c)` da auditoria): quando o atendente humano responde, o backend grava `pushName: body.sender_name` (nome do atendente) no payload do evento. A trigger computa:

```sql
v_cliente_nome := COALESCE(
  NEW.payload->>'from_name',
  NEW.payload->>'cliente_nome',
  NEW.payload->>'sender_name',
  NEW.payload->>'pushName',
  ...
);
```

sem checar a direção da mensagem, e depois `cliente_nome = COALESCE(v_cliente_nome, cliente_nome_atual)` — como `v_cliente_nome` quase sempre vem preenchido (mesmo que seja o nome do atendente), ele sempre vence.

**Correção**: `v_cliente_nome` só deve ser calculado (e portanto só pode sobrescrever o nome salvo) quando a mensagem **não** foi enviada pelo atendente (`NOT v_is_from_me`). Quando for o atendente respondendo, `v_cliente_nome` fica `NULL`, e o `COALESCE` no `UPDATE`/`INSERT` preserva o nome do contato já salvo (ou deixa `NULL` se ainda não havia nenhum, para uma conversa nova criada assim — ver Fix 3 para o caso de conversa nova manual).

## Fix 2 — salvar o painel de contato não deve zerar a prévia da conversa

**Mesmo arquivo de migração** (`034`), mesma função.

**Causa raiz**: `saveContactDetails()` dispara `POST /chat/crm/events` com `event_type: 'contact_updated'` e payload sem `content`/`body`. A trigger, na branch de conversa já existente, atualiza incondicionalmente:

```sql
UPDATE crm_chat_conversations
   SET ultima_mensagem = v_content,               -- vira ''
       ultima_mensagem_direcao = v_direction,
       ultima_interacao_em = NEW.created_at,       -- reordena a lista
       ...
```

**Correção**: separar os campos que sempre devem atualizar (nome do contato — respeitando o Fix 1 —, telefone, fila, `kanban_status`, `crm_customer_id`) dos campos de prévia de mensagem (`ultima_mensagem`, `ultima_mensagem_direcao`, `ultima_interacao_em`), que só devem ser tocados quando `v_content <> '' OR` existir mídia — a mesma condição que já protege a inserção em `crm_chat_messages` hoje, aplicada de forma simétrica também ao `UPDATE` da conversa.

## Fix 3 — nome do contato deve ser gravado já na criação da conversa manual

**Arquivos**: `src/pages/ChatInboxCRM.tsx` (função `createManualConversation`) e `backend/src/routes/chatRoutes.ts` (rota `POST /chat/send`).

**Causa raiz**: `createManualConversation()` envia ao backend `{ instance_name, canal, conversation_id, content, lead_id }` — o campo `contactName` do formulário (pré-preenchido com o nome vindo de "Clientes", ex. via `openChatFromCliente`) nunca é incluído no payload. A conversa nova nasce sem nome, dependendo inteiramente da trigger conseguir inferir um nome depois (o que, após o Fix 1, só vai acontecer quando o cliente responder — até lá, a conversa fica sem nome).

**Correção**: incluir `contact_name` no payload enviado por `createManualConversation`; na rota `/chat/send`, quando `contact_name` vier preenchido, gravar diretamente em `communication_events.payload` sob a chave `from_name` (primeira prioridade já lida por `v_cliente_nome` na trigger) em vez de depender de `pushName`.

**Ajuste na regra do Fix 1 para acomodar este caso**: criar uma conversa manual é sempre `v_is_from_me = true` (é o atendente iniciando), então a regra estrita do Fix 1 ("só sobrescreve se `NOT v_is_from_me`") bloquearia até esse nome inicial legítimo. A regra final do Fix 1 fica: **`v_cliente_nome` só é calculado quando `NOT v_is_from_me` OU a conversa ainda não tem `cliente_nome` salvo** (conversa nova). Isso cobre os dois casos sem reabrir o bug original — que só acontecia em conversas **já existentes**, com um nome de cliente já salvo, sendo trocado por respostas subsequentes do atendente.

## Validação

Sem suíte de testes automatizados configurada no projeto (consistente com `CLAUDE.md`). Validação:

1. `npm run db:apply-sql:dry-run -- backend/sql/034_fix_cliente_nome_overwrite.sql` antes de aplicar.
2. Aplicar com `npm run db:apply-sql -- backend/sql/034_fix_cliente_nome_overwrite.sql`.
3. `npm run build` (frontend) e `npm run build:backend` para o Fix 3.
4. Teste manual em produção, no mesmo padrão que reproduziu os bugs originais:
   - Abrir uma conversa existente com nome de contato correto, responder como atendente, confirmar que o nome do contato não muda.
   - Editar e salvar o painel de contato (nome/telefone/observações) sem enviar mensagem nova, confirmar que a prévia da última mensagem e a posição da conversa na lista não mudam.
   - Iniciar uma conversa nova pelo atalho de "Clientes", confirmar que o nome já aparece corretamente na lista antes mesmo do cliente responder.
