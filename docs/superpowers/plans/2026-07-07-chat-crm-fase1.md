# Chat x CRM Geral — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir três bugs de comportamento no fluxo de chat ao vivo: (1) a trigger de banco sobrescrevendo o nome do cliente com o nome do atendente humano quando ele responde, (2) salvar o painel de contato apagando a prévia da última mensagem e reordenando a lista de conversas, e (3) conversas criadas manualmente pelo atalho de "Clientes" nascendo sem nome do contato.

**Architecture:** Os fixes 1 e 2 vivem inteiramente na função de trigger `fn_sync_communication_event()` (Postgres/plpgsql), aplicados via uma nova migração versionada `backend/sql/034_fix_cliente_nome_overwrite.sql` que recria a função (mesmo padrão de `031`/`033`). O fix 3 é uma mudança de duas pontas: o frontend (`src/pages/ChatInboxCRM.tsx`) passa a enviar o nome do contato ao criar uma conversa manual, e o backend (`backend/src/routes/chatRoutes.ts`) passa a gravar esse nome sob a chave `from_name` no payload do evento — chave que a trigger corrigida já lê com prioridade máxima.

**Tech Stack:** PostgreSQL (plpgsql trigger function), Node.js/TypeScript backend, React/TypeScript frontend. Sem suíte de testes automatizada no projeto — validação via `--dry-run` da migração, `npm run build`/`build:backend`, e teste manual guiado.

Spec de referência: `docs/superpowers/specs/2026-07-07-chat-crm-fase1-design.md`

---

### Task 1: Migração SQL — corrigir `fn_sync_communication_event()`

**Files:**
- Create: `backend/sql/034_fix_cliente_nome_overwrite.sql`

- [ ] **Step 1: Criar o arquivo de migração com a função corrigida**

Crie `backend/sql/034_fix_cliente_nome_overwrite.sql` com o conteúdo abaixo. As mudanças em relação a `033_fix_trigger_on_conflict.sql` são: (a) duas novas variáveis `v_has_content` e `v_existing_nome`; (b) o `SELECT` que localiza a conversa existente agora roda **antes** do cálculo de `v_cliente_nome`, e também busca o `cliente_nome` atual; (c) `v_cliente_nome` só é calculado quando a mensagem não veio do atendente, ou quando a conversa ainda não tem nome salvo; (d) os campos de prévia (`ultima_mensagem`, `ultima_mensagem_direcao`, `ultima_interacao_em`) só são atualizados quando há conteúdo real ou mídia, tanto no `UPDATE` quanto no `INSERT`.

```sql
-- Corrige dois bugs de comportamento na trigger fn_sync_communication_event:
--
-- 1) v_cliente_nome so pode sobrescrever o nome ja salvo quando a mensagem
--    veio do cliente (NOT v_is_from_me) OU a conversa ainda nao tem nome
--    salvo (conversa nova). Antes, toda resposta do atendente sobrescrevia
--    o nome do cliente com o nome dele mesmo, porque o payload usa
--    'pushName' tanto para o nome do contato quanto (por acidente) para o
--    nome do atendente em mensagens enviadas por /chat/send.
--
-- 2) ultima_mensagem/ultima_mensagem_direcao/ultima_interacao_em so devem
--    ser atualizados quando o evento tiver conteudo real ou midia - mesma
--    condicao que ja protege o INSERT em crm_chat_messages. Eventos como
--    'contact_updated' (disparado ao salvar o painel de contato) nao tem
--    conteudo e nao devem apagar a previa nem reordenar a lista de
--    conversas.

CREATE OR REPLACE FUNCTION fn_sync_communication_event()
RETURNS TRIGGER AS $$
DECLARE
  v_phone             TEXT;
  v_instance          TEXT;
  v_conv_id           UUID;
  v_direction         TEXT;
  v_sender_type       TEXT;
  v_sender_name       TEXT;
  v_content           TEXT;
  v_has_content       BOOLEAN;
  v_is_from_me        BOOLEAN;
  v_kanban_status     TEXT;
  v_cliente_nome      TEXT;
  v_existing_nome     TEXT;
  v_is_email          BOOLEAN;
  v_fila              TEXT;
  v_subject           TEXT;
  v_canal             TEXT;
  v_telefone          TEXT;
  v_email             TEXT;
  v_documento         TEXT;
  v_customer_id       UUID;
  v_customer_phone    TEXT;
  v_body              TEXT;
  v_body_phone        TEXT;
  v_body_document     TEXT;
  v_external_message_id TEXT;
  v_receipt_status    TEXT;
BEGIN
  v_phone := COALESCE(
    NEW.payload->>'from',
    NEW.payload->>'remoteJid',
    NEW.payload->>'conversationId',
    NEW.payload->>'documentKey',
    ''
  );
  v_instance := COALESCE(NEW.payload->>'instance_name', NEW.payload->>'instanceName', '');
  v_kanban_status := NEW.payload->>'kanban_status';
  v_canal := NEW.payload->>'canal';
  v_body := COALESCE(NEW.payload->>'body', NEW.payload->>'content', '');
  v_external_message_id := COALESCE(
    NULLIF(NEW.external_id, ''),
    NULLIF(NEW.payload->>'messageId', ''),
    NULLIF(NEW.payload->>'externalId', ''),
    NULLIF(NEW.payload#>>'{data,key,id}', ''),
    NULLIF(NEW.payload#>>'{data,id}', ''),
    NULLIF(NEW.payload#>>'{key,id}', '')
  );

  IF NEW.source = 'evolution' AND NEW.event_type = 'messages.update' THEN
    v_receipt_status := LOWER(COALESCE(
      NULLIF(NEW.payload->>'status', ''),
      NULLIF(NEW.payload#>>'{data,status}', ''),
      NULLIF(NEW.payload#>>'{data,messageStatus}', ''),
      NULLIF(NEW.payload#>>'{data,update,status}', ''),
      NULLIF(NEW.payload#>>'{message,status}', ''),
      NULLIF(NEW.payload#>>'{data,key,status}', ''),
      ''
    ));

    IF v_receipt_status <> '' AND v_external_message_id IS NOT NULL THEN
      UPDATE crm_chat_messages
         SET delivery_status = CASE
               WHEN v_receipt_status LIKE '%read%' OR v_receipt_status LIKE '%played%' THEN 'read'
               WHEN v_receipt_status LIKE '%deliver%' OR v_receipt_status LIKE '%server_ack%' OR v_receipt_status LIKE '%receipt%' THEN 'delivered'
               WHEN v_receipt_status LIKE '%error%' OR v_receipt_status LIKE '%fail%' THEN 'failed'
               WHEN v_receipt_status LIKE '%sent%' OR v_receipt_status LIKE '%ack%' OR v_receipt_status LIKE '%pending%' THEN 'sent'
               ELSE delivery_status
             END,
             delivered_at = CASE
               WHEN (v_receipt_status LIKE '%deliver%' OR v_receipt_status LIKE '%server_ack%' OR v_receipt_status LIKE '%receipt%' OR v_receipt_status LIKE '%read%' OR v_receipt_status LIKE '%played%')
                    AND delivered_at IS NULL THEN NEW.created_at
               ELSE delivered_at
             END,
             read_at = CASE
               WHEN (v_receipt_status LIKE '%read%' OR v_receipt_status LIKE '%played%')
                    AND read_at IS NULL THEN NEW.created_at
               ELSE read_at
             END,
             status_updated_at = NEW.created_at
       WHERE external_message_id = v_external_message_id;
    END IF;

    RETURN NEW;
  END IF;

  v_is_email := (NEW.source = 'email') OR (
    NEW.source IS DISTINCT FROM 'evolution'
    AND v_phone LIKE '%@%'
    AND v_phone NOT LIKE '%@s.whatsapp.net'
    AND v_phone NOT LIKE '%@g.us'
    AND v_phone NOT LIKE '%@broadcast%'
    AND v_phone NOT LIKE '%@lid'
    AND v_phone NOT LIKE '%@hosted.lid'
  );

  IF v_is_email AND v_phone LIKE '%@%' AND v_instance = '' THEN
    v_instance := split_part(v_phone, '@', 2);
  END IF;

  IF NEW.conversation_id IS NOT NULL AND NEW.conversation_id <> '' THEN
    v_phone := NEW.conversation_id;
  END IF;

  IF v_phone IS NULL OR v_phone = '' THEN
    RETURN NEW;
  END IF;

  IF NEW.source = 'evolution' AND NEW.event_type IN ('messages.delete', 'presence.update', 'connection.update') THEN
    RETURN NEW;
  END IF;

  v_fila := CASE
    WHEN v_is_email AND v_kanban_status IN ('agendado', 'cancelou_agendamento') THEN 'agendamento'
    WHEN v_is_email THEN 'email'
    WHEN v_canal = 'renovacao' OR LOWER(v_instance) LIKE '%renov%' OR LOWER(v_instance) LIKE '%certiid%' THEN 'renovacao'
    ELSE 'atendimento'
  END;
  v_subject := NEW.payload->>'subject';

  v_email := COALESCE(NEW.payload->>'customer_email', '');
  v_telefone := regexp_replace(COALESCE(NEW.payload->>'telefone', NEW.payload->>'documentKey', ''), '[^0-9]', '', 'g');
  v_documento := regexp_replace(COALESCE(NEW.payload->>'customer_document', ''), '[^0-9]', '', 'g');

  IF v_is_email AND v_body <> '' THEN
    v_body_phone := regexp_replace(
      COALESCE(substring(v_body FROM 'Telefone:\s*([0-9() \-]+)'), ''),
      '[^0-9]',
      '',
      'g'
    );
    IF v_body_phone <> '' AND length(v_body_phone) BETWEEN 10 AND 11 THEN
      v_body_phone := '55' || v_body_phone;
    END IF;

    v_body_document := regexp_replace(
      COALESCE(substring(v_body FROM '(?:CPF/CNPJ|CNPJ/CPF):\s*([0-9./-]+)'), ''),
      '[^0-9]',
      '',
      'g'
    );

    IF v_telefone = '' AND v_body_phone <> '' THEN
      v_telefone := v_body_phone;
    END IF;
    IF v_documento = '' AND v_body_document <> '' THEN
      v_documento := v_body_document;
    END IF;
  END IF;

  IF v_customer_id IS NULL
     AND (v_email <> '' OR v_telefone <> '' OR v_documento <> '' OR (v_is_email AND v_phone LIKE '%@%'))
  THEN
    SELECT c.id, regexp_replace(COALESCE(c.telefone, ''), '[^0-9]', '', 'g')
      INTO v_customer_id, v_customer_phone
      FROM crm_customers c
     WHERE (v_email <> '' AND LOWER(COALESCE(c.email, '')) = LOWER(v_email))
        OR (v_telefone <> '' AND regexp_replace(COALESCE(c.telefone, ''), '[^0-9]', '', 'g') = v_telefone)
        OR (v_documento <> '' AND regexp_replace(COALESCE(c.cpf, ''), '[^0-9]', '', 'g') = v_documento)
        OR (v_documento <> '' AND regexp_replace(COALESCE(c.cnpj, ''), '[^0-9]', '', 'g') = v_documento)
     ORDER BY c.updated_at DESC
     LIMIT 1;
  END IF;

  IF v_customer_id IS NOT NULL AND v_customer_phone IS NOT NULL AND v_customer_phone <> '' THEN
    v_phone := v_customer_phone;
  ELSIF v_is_email AND v_telefone <> '' THEN
    v_phone := v_telefone;
  END IF;

  IF NOT v_is_email THEN
    v_phone := regexp_replace(v_phone, '[^0-9]', '', 'g');
    IF LENGTH(v_phone) < 10 OR LENGTH(v_phone) > 15 THEN
      RETURN NEW;
    END IF;
  END IF;

  v_telefone := CASE WHEN v_is_email THEN NULLIF(v_telefone, '') ELSE v_phone END;

  v_is_from_me := (NEW.payload->>'fromMe')::boolean;
  v_content := COALESCE(NEW.payload->>'content', NEW.payload->>'body', '');
  v_has_content := (v_content <> '' OR NEW.payload->>'mimeType' IS NOT NULL OR NEW.payload->>'mediaUrl' IS NOT NULL);
  v_direction := CASE WHEN v_is_from_me THEN 'outgoing' ELSE 'incoming' END;
  v_sender_type := CASE WHEN v_is_from_me THEN 'agent' ELSE 'contact' END;
  v_sender_name := COALESCE(
    NEW.payload->>'sender_name',
    NEW.payload->>'from_name',
    NEW.payload->>'pushName',
    CASE WHEN v_is_email THEN v_subject ELSE NULL END
  );

  SELECT c.id, c.cliente_nome
    INTO v_conv_id, v_existing_nome
    FROM crm_chat_conversations c
   WHERE c.document_key = v_phone
     AND (
       NOT v_is_email
       OR COALESCE(c.whatsapp_instance, '') = COALESCE(v_instance, '')
     )
   ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
   LIMIT 1;

  IF NOT v_is_from_me OR v_existing_nome IS NULL OR v_existing_nome = '' THEN
    v_cliente_nome := COALESCE(
      NEW.payload->>'from_name',
      NEW.payload->>'cliente_nome',
      NEW.payload->>'sender_name',
      NEW.payload->>'pushName',
      CASE WHEN v_is_email THEN v_subject ELSE NULL END,
      CASE WHEN v_is_email THEN split_part(v_phone, '@', 1) ELSE NULL END
    );
  ELSE
    v_cliente_nome := NULL;
  END IF;

  IF v_conv_id IS NOT NULL THEN
    UPDATE crm_chat_conversations
       SET ultima_mensagem = CASE WHEN v_has_content THEN v_content ELSE crm_chat_conversations.ultima_mensagem END,
           ultima_mensagem_direcao = CASE WHEN v_has_content THEN v_direction ELSE crm_chat_conversations.ultima_mensagem_direcao END,
           ultima_interacao_em = CASE WHEN v_has_content THEN NEW.created_at ELSE crm_chat_conversations.ultima_interacao_em END,
           cliente_nome = COALESCE(v_cliente_nome, crm_chat_conversations.cliente_nome),
           telefone = COALESCE(v_telefone, crm_chat_conversations.telefone),
           whatsapp_instance = COALESCE(NULLIF(v_instance, ''), crm_chat_conversations.whatsapp_instance),
           fila = COALESCE(v_fila, crm_chat_conversations.fila),
           kanban_status = CASE
             WHEN v_kanban_status IS NOT NULL THEN v_kanban_status
             WHEN crm_chat_conversations.kanban_status = 'iniciou_conversa' THEN 'conversando'
             ELSE crm_chat_conversations.kanban_status
           END,
           crm_customer_id = COALESCE(v_customer_id, crm_chat_conversations.crm_customer_id),
           updated_at = NOW()
     WHERE id = v_conv_id;
  ELSE
    INSERT INTO crm_chat_conversations (
      document_key,
      telefone,
      whatsapp_instance,
      fila,
      ultima_mensagem,
      ultima_mensagem_direcao,
      ultima_interacao_em,
      cliente_nome,
      kanban_status,
      crm_customer_id
    )
    VALUES (
      v_phone,
      v_telefone,
      v_instance,
      v_fila,
      CASE WHEN v_has_content THEN v_content ELSE NULL END,
      CASE WHEN v_has_content THEN v_direction ELSE NULL END,
      CASE WHEN v_has_content THEN NEW.created_at ELSE NULL END,
      v_cliente_nome,
      COALESCE(v_kanban_status, 'iniciou_conversa'),
      v_customer_id
    )
    RETURNING id INTO v_conv_id;
  END IF;

  -- So insere mensagem se tiver conteudo ou midia (evita 'Mensagem sem texto')
  IF v_has_content THEN
    INSERT INTO crm_chat_messages (
      conversation_id,
      document_key,
      external_message_id,
      direction,
      sender_type,
      sender_name,
      mensagem,
      delivery_status,
      delivered_at,
      read_at,
      status_updated_at,
      created_at
    )
    VALUES (
      v_conv_id,
      v_phone,
      v_external_message_id,
      v_direction,
      v_sender_type,
      v_sender_name,
      v_content,
      CASE WHEN v_direction = 'outgoing' THEN 'sent' ELSE 'received' END,
      CASE WHEN v_direction = 'incoming' THEN NEW.created_at ELSE NULL END,
      NULL,
      NEW.created_at,
      NEW.created_at
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 2: Validar a migração com dry-run**

Run: `npm run db:apply-sql:dry-run -- backend/sql/034_fix_cliente_nome_overwrite.sql`
Expected: JSON com `"ok": true, "dryRun": true` e `"path": "backend/sql/034_fix_cliente_nome_overwrite.sql"`. Se der erro de sintaxe SQL, corrija o arquivo antes de prosseguir — não pule esta etapa.

- [ ] **Step 3: Aplicar a migração**

Run: `npm run db:apply-sql -- backend/sql/034_fix_cliente_nome_overwrite.sql`
Expected: JSON com `"ok": true, "applied": true`.

- [ ] **Step 4: Commit**

```bash
git add backend/sql/034_fix_cliente_nome_overwrite.sql
git commit -m "fix: nao sobrescreve nome do cliente com nome do atendente e nao zera previa ao salvar contato"
```

---

### Task 2: Frontend — enviar nome do contato ao criar conversa manual

**Files:**
- Modify: `src/pages/ChatInboxCRM.tsx` (função `createManualConversation`, em torno da linha 1397-1407)

- [ ] **Step 1: Localizar o payload enviado em `createManualConversation`**

Abra `src/pages/ChatInboxCRM.tsx` e localize o bloco dentro de `createManualConversation()`:

```ts
      const response = await fetch(getApiUrl('/chat/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_name: selectedChannel.integration.instance_name,
          canal: manualConversation.queue === 'renovacao' ? 'renovacao' : 'atendimento',
          conversation_id: `${normalizedPhone}@s.whatsapp.net`,
          content: firstMessage,
          lead_id: null,
        }),
      })
```

- [ ] **Step 2: Adicionar `contact_name` ao payload**

Substitua o bloco acima por:

```ts
      const response = await fetch(getApiUrl('/chat/send'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_name: selectedChannel.integration.instance_name,
          canal: manualConversation.queue === 'renovacao' ? 'renovacao' : 'atendimento',
          conversation_id: `${normalizedPhone}@s.whatsapp.net`,
          content: firstMessage,
          contact_name: contactName || null,
          lead_id: null,
        }),
      })
```

`contactName` já existe nesse escopo (é `const contactName = manualConversation.contactName.trim()`, definida no início da função — confirme que essa linha existe antes de fazer a mudança).

- [ ] **Step 3: Verificar tipos com o build do frontend**

Run: `npm run build`
Expected: build conclui sem erros TypeScript relacionados a `ChatInboxCRM.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ChatInboxCRM.tsx
git commit -m "feat: envia nome do contato ao iniciar conversa manual pelo chat"
```

---

### Task 3: Backend — gravar `contact_name` como `from_name` no evento

**Files:**
- Modify: `backend/src/routes/chatRoutes.ts:26-35` (tipo `SendChatMessageInput`)
- Modify: `backend/src/routes/chatRoutes.ts:678-692` (payload da rota `POST /api/chat/send`)

Confirmado lendo o arquivo: a rota `POST /api/chat/send` está em `chatRoutes.ts:654-716`. Ela usa o tipo `SendChatMessageInput` (declarado em `chatRoutes.ts:26-35`), que **não** tem campo de nome do contato. O `payload` enviado para `communicationEventRepository.create(...)` é montado em `chatRoutes.ts:678-692`. Existe uma segunda ocorrência de `pushName: body.sender_name || 'Operador'` em `chatRoutes.ts:740`, mas é da rota **diferente** `POST /api/chat/internal-note` (nota interna, não mensagem para o cliente) — não mexer nela nesta task.

- [ ] **Step 1: Adicionar `contact_name` ao tipo `SendChatMessageInput`**

Em `chatRoutes.ts:26-35`, o tipo atual é:

```ts
type SendChatMessageInput = {
  lead_id?: string
  conversation_id?: string
  content?: string
  instance_name?: string
  canal?: 'atendimento' | 'renovacao'
  sender_name?: string | null
  quoted_message_id?: string | null
  quoted_content?: string | null
}
```

Adicione o campo `contact_name`:

```ts
type SendChatMessageInput = {
  lead_id?: string
  conversation_id?: string
  content?: string
  instance_name?: string
  canal?: 'atendimento' | 'renovacao'
  sender_name?: string | null
  contact_name?: string | null
  quoted_message_id?: string | null
  quoted_content?: string | null
}
```

- [ ] **Step 2: Incluir `from_name` no payload do evento quando `contact_name` vier preenchido**

Em `chatRoutes.ts:678-692`, o payload atual é:

```ts
    const payload: JsonRecord = {
      content,
      fromMe: true,
      canal: body.canal ?? inferCanalFromInstance(sendResult.instanceName ?? asString(body.instance_name)),
      messageId,
      messageType: 'conversation',
      pushName: body.sender_name || 'Operador',
      quoted: body.quoted_message_id
        ? {
            messageId: body.quoted_message_id,
            content: body.quoted_content ?? 'Mensagem respondida',
          }
        : null,
      provider_payload: sendResult.payload,
    }
```

Adicione a chave `from_name` logo após `pushName`:

```ts
    const payload: JsonRecord = {
      content,
      fromMe: true,
      canal: body.canal ?? inferCanalFromInstance(sendResult.instanceName ?? asString(body.instance_name)),
      messageId,
      messageType: 'conversation',
      pushName: body.sender_name || 'Operador',
      from_name: body.contact_name || null,
      quoted: body.quoted_message_id
        ? {
            messageId: body.quoted_message_id,
            content: body.quoted_content ?? 'Mensagem respondida',
          }
        : null,
      provider_payload: sendResult.payload,
    }
```

Não remova `pushName` — ele continua sendo usado como fallback de `sender_name` da mensagem em si. `from_name` é a chave nova, lida com prioridade máxima por `v_cliente_nome` na trigger (Task 1), e só deve valer quando `contact_name` veio preenchido do frontend (a Task 1 já garante que essa gravação só afeta o nome quando a conversa é nova ou a mensagem veio do cliente).

- [ ] **Step 3: Compilar o backend**

Run: `npm run build:backend`
Expected: `tsc -p backend/tsconfig.json` conclui sem erros.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/chatRoutes.ts
git commit -m "feat: aceita contact_name em /chat/send e grava como from_name no evento"
```

---

### Task 4: Deploy e validação manual em produção

**Files:** nenhum arquivo novo — esta task só executa comandos e valida comportamento.

- [ ] **Step 1: Rodar lint e build completos antes do deploy**

Run: `npm run lint`
Expected: sem novos erros em `src/pages/ChatInboxCRM.tsx` (erros pré-existentes em outros arquivos, como `Renovacoes.tsx`, não bloqueiam — só confirme que nada novo apareceu nos arquivos tocados nesta plano).

Run: `npm run build`
Expected: build conclui com sucesso (mesmo padrão de saída já visto nas migrações anteriores desta sessão).

- [ ] **Step 2: Deploy via gate canônico**

Antes de rodar, confirme que não há outro deploy em andamento (ver `DEPLOY-RAPIDO.md`). Depois:

```bash
ssh root@147.79.111.76 'bash /opt/avmd/AVMD_System/ops/scripts/vps-deploy-gate.sh'
```

Expected: log terminando em `Deploy concluido com gate.`, com smoke tests de backend (`{"ok":true,"service":"avmd-backend"}`) passando. Se o gate bloquear por backup vencido, siga o mesmo procedimento já usado nesta sessão (criar backup manual em `/opt/backups/certiid/<timestamp>/opt-certiid.tar.gz` a partir de `/opt/avmd`) só após confirmar com o usuário, já que é uma ação de infraestrutura fora do escopo direto deste plano.

- [ ] **Step 3: Validação manual — nome do contato não muda ao responder**

No Chat ao Vivo em produção, abra uma conversa existente com nome de contato correto (ex.: uma conversa de teste, não uma conversa real de cliente). Envie uma resposta humana. Confirme que o nome do contato na lista de conversas e no painel "Contato e histórico" **não** mudou para o nome do atendente logado.

- [ ] **Step 4: Validação manual — salvar contato não apaga a prévia**

Na mesma conversa (ou outra com uma mensagem recente visível na lista), abra o painel "Contato e histórico", edite um campo que não seja crítico (ex.: Observações) e clique em "Salvar contato". Confirme que a prévia da última mensagem na lista de conversas à esquerda **não** virou vazia, e que a conversa **não** pulou de posição na lista por causa desse salvamento.

- [ ] **Step 5: Validação manual — nova conversa manual nasce com nome**

A partir da tela "Clientes", use o atalho de iniciar conversa por WhatsApp para um cliente cujo número ainda não tem conversa aberta no chat. Confirme que a conversa nova aparece na lista do Chat ao Vivo já com o nome do cliente (não com o telefone cru nem vazio) antes mesmo de qualquer resposta dele.

- [ ] **Step 6: Reportar ao usuário**

Se todas as validações passarem, informe ao usuário que a Fase 1 está em produção e valide se ele consegue reproduzir os cenários originais dos bugs (Neusa Maciel ou outro contato real) sem os sintomas relatados.
