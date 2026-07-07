# Chat x CRM Geral — Fase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma normalização canônica única de telefone brasileiro (DDD+9 dígitos, sem DDI), aplicá-la em todos os pontos de escrita/comparação de telefone do sistema de chat, e travar no banco a unicidade de telefone em `crm_customers` (o índice de `crm_chat_conversations` já existe, só precisa que os dados gravados passem a ser normalizados).

**Architecture:** Uma função Postgres `fn_normalize_phone_br` e duas funções TypeScript idênticas (`src/lib/phone.ts` para o frontend, `backend/src/utils/phone.ts` para o backend) implementam o mesmo algoritmo: remove tudo que não é dígito, remove o DDI "55" se presente, retorna 10 ou 11 dígitos (DDD+telefone) ou `NULL`/`null` se inválido. Uma migração SQL nova (`035`) cria a função Postgres, limpa (sem apagar linhas) as duplicatas já existentes em `crm_customers.telefone`, cria o índice único parcial em `crm_customers`, e atualiza a trigger `fn_sync_communication_event` para normalizar o telefone antes de gravar `document_key` — o que faz o índice único **já existente** em `crm_chat_conversations` (`idx_conv_document_key_unique`, da migração 027) passar a pegar duplicatas que hoje escapam por causa do DDI. Os pontos de comparação de telefone no TypeScript (`chatNavigation.ts`, `Clientes.tsx`, `ChatInboxCRM.tsx`, `leadRepository.ts`, `customerIdentity.ts`) passam a usar a função compartilhada em vez de lógica própria.

**Tech Stack:** PostgreSQL (plpgsql), TypeScript (React frontend + Node backend). Sem suíte de testes automatizada — validação via scripts Node ad-hoc (não commitados) pra conferir a normalização, dry-run da migração, contagem de duplicatas antes/depois, e `npm run build`/`build:backend`.

Spec de referência: `docs/superpowers/specs/2026-07-07-chat-crm-fase2-design.md`

**Importante sobre onde aplicar a migração SQL**: a Fase 1 descobriu que rodar `npm run db:apply-sql` a partir da máquina de desenvolvimento local aplica contra o banco Aiven cloud (que NÃO tem essas tabelas em produção — é um ambiente separado). A migração desta fase **precisa ser aplicada rodando o comando a partir da própria VPS** (via SSH, depois de dar `git pull` no `/opt/avmd/AVMD_System`), onde `backend/.env.local` aponta corretamente para `127.0.0.1:5432/avmd`. Cada task de migração SQL abaixo já instrui isso explicitamente.

---

### Task 1: Funções de normalização de telefone (TypeScript)

**Files:**
- Create: `src/lib/phone.ts`
- Create: `backend/src/utils/phone.ts`

- [ ] **Step 1: Criar `src/lib/phone.ts`**

```ts
// Mantenha esta função idêntica a backend/src/utils/phone.ts — não há
// como compartilhar o módulo entre os dois builds (frontend e backend
// são projetos TypeScript separados, sem cross-import hoje).
//
// Normaliza um telefone brasileiro para a forma canônica DDD+número
// (10 ou 11 dígitos, sem o DDI "55"). Essa é a chave usada para decidir
// "é o mesmo contato" em todo o sistema de chat — nunca usar o telefone
// cru ou parcialmente normalizado para comparar identidade.
export function normalizePhoneBR(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null

  const withoutDDI = (digits.length === 12 || digits.length === 13) && digits.startsWith('55')
    ? digits.slice(2)
    : digits

  if (withoutDDI.length === 10 || withoutDDI.length === 11) return withoutDDI
  return null
}
```

- [ ] **Step 2: Criar `backend/src/utils/phone.ts`**

```ts
// Mantenha esta função idêntica a src/lib/phone.ts — não há como
// compartilhar o módulo entre os dois builds (frontend e backend são
// projetos TypeScript separados, sem cross-import hoje).
//
// Normaliza um telefone brasileiro para a forma canônica DDD+número
// (10 ou 11 dígitos, sem o DDI "55"). Essa é a chave usada para decidir
// "é o mesmo contato" em todo o sistema de chat — nunca usar o telefone
// cru ou parcialmente normalizado para comparar identidade.
export function normalizePhoneBR(value: string | null | undefined): string | null {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return null

  const withoutDDI = (digits.length === 12 || digits.length === 13) && digits.startsWith('55')
    ? digits.slice(2)
    : digits

  if (withoutDDI.length === 10 || withoutDDI.length === 11) return withoutDDI
  return null
}
```

- [ ] **Step 3: Verificar manualmente com casos de exemplo**

Não há suíte de testes automatizada neste projeto — verifique rodando um script Node ad-hoc (não precisa commitar):

```bash
node -e "
const { normalizePhoneBR } = require('./src/lib/phone.ts');
" 2>&1 || true
```

Como `src/lib/phone.ts` é TypeScript puro (sem JSX, sem imports de outros módulos), a forma mais simples de verificar é ler o código e confirmar manualmente estes casos, ou colar a função num arquivo `.mjs` temporário e rodar com `node`:

| Entrada | Saída esperada |
|---|---|
| `'5511987654321'` | `'11987654321'` (13 dígitos com DDI → remove 55, sobram 11) |
| `'11987654321'` | `'11987654321'` (já são 11 dígitos, sem DDI) |
| `'551187654321'` | `'1187654321'` (12 dígitos com DDI → remove 55, sobram 10 — fixo) |
| `'(11) 98765-4321'` | `'11987654321'` (símbolos removidos, DDI ausente) |
| `''` / `null` / `undefined` | `null` |
| `'123'` | `null` (curto demais) |
| `'551198765432199'` | `null` (longo demais mesmo depois de tirar o DDI) |

Se algum caso não bater, corrija a função antes de prosseguir — não é permitido pular esta verificação.

- [ ] **Step 4: Compilar frontend e backend**

Run: `npm run build`
Expected: sucesso, sem erros relacionados a `src/lib/phone.ts` (o arquivo ainda não é importado em lugar nenhum nesta task, então só precisa compilar sozinho sem erro de sintaxe/tipo).

Run: `npm run build:backend`
Expected: sucesso, sem erros relacionados a `backend/src/utils/phone.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/phone.ts backend/src/utils/phone.ts
git commit -m "feat: adiciona normalizacao canonica de telefone brasileiro (DDD+numero, sem DDI)"
```

---

### Task 2: Migração SQL 035 — função Postgres, limpeza, trava, trigger

**Files:**
- Create: `backend/sql/035_normalize_phone_and_unique_constraint.sql`

Esta migração faz, nesta ordem, dentro da mesma transação (o script `apply-sql-file.mjs` já envolve em `BEGIN`/`COMMIT`):
1. Cria `fn_normalize_phone_br(text)`, mesma lógica de `src/lib/phone.ts`/`backend/src/utils/phone.ts`.
2. Limpa duplicatas em `crm_customers.telefone` (mantém o mais recente, limpa os outros — sem apagar linha, sem mexer em outro campo).
3. Cria o índice único parcial em `crm_customers`.
4. Recria `fn_sync_communication_event()` (a mesma função da migração `034`, só com a normalização de `v_phone` trocada pela função canônica).

Não é necessário criar índice novo em `crm_chat_conversations` — o índice `idx_conv_document_key_unique` (`UNIQUE ... WHERE document_key ~ '^[0-9]+$'`, da migração `027`) já existe em produção e já cobre esse caso; ele só não pega hoje duplicatas com/sem DDI porque a trigger nunca normalizava o DDI antes de gravar `document_key`. O Step 1 abaixo corrige exatamente isso.

- [ ] **Step 1: Criar `backend/sql/035_normalize_phone_and_unique_constraint.sql`**

```sql
-- Fase 2: normalizacao canonica de telefone (DDD+9 digitos, sem DDI) e
-- trava de unicidade real em crm_customers. crm_chat_conversations ja
-- tem indice unico parcial (idx_conv_document_key_unique, migracao 027)
-- que passa a funcionar corretamente assim que a trigger normalizar o
-- telefone antes de gravar document_key (feito abaixo, junto com a
-- funcao fn_sync_communication_event).

-- fn_normalize_phone_br: funcao unica de normalizacao. Mesma logica das
-- versoes TypeScript em src/lib/phone.ts e backend/src/utils/phone.ts —
-- mantenha as tres em sincronia se este algoritmo mudar no futuro.
CREATE OR REPLACE FUNCTION fn_normalize_phone_br(p_value TEXT)
RETURNS TEXT AS $$
DECLARE
  v_digits TEXT;
  v_without_ddi TEXT;
BEGIN
  v_digits := regexp_replace(COALESCE(p_value, ''), '\D', '', 'g');
  IF v_digits = '' THEN
    RETURN NULL;
  END IF;

  IF (LENGTH(v_digits) IN (12, 13)) AND LEFT(v_digits, 2) = '55' THEN
    v_without_ddi := SUBSTRING(v_digits FROM 3);
  ELSE
    v_without_ddi := v_digits;
  END IF;

  IF LENGTH(v_without_ddi) IN (10, 11) THEN
    RETURN v_without_ddi;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Limpeza minima: mantem o telefone so no registro mais recente de cada
-- grupo de duplicatas em crm_customers (desempate por created_at). Nao
-- apaga nenhuma linha, nao mescla nenhum outro campo, nao mexe em
-- crm_chat_conversations nem em nenhuma outra tabela.
WITH duplicados AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY fn_normalize_phone_br(telefone)
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    ) AS rn
  FROM crm_customers
  WHERE telefone IS NOT NULL AND telefone <> ''
    AND fn_normalize_phone_br(telefone) IS NOT NULL
)
UPDATE crm_customers c
   SET telefone = NULL
  FROM duplicados d
 WHERE c.id = d.id
   AND d.rn > 1;

-- Trava de unicidade em crm_customers (so quando houver telefone
-- valido). So chega aqui depois da limpeza acima, senao a criacao do
-- indice falha por violar unicidade nos dados existentes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_customers_telefone_normalizado
  ON crm_customers (fn_normalize_phone_br(telefone))
  WHERE telefone IS NOT NULL AND telefone <> '';

-- Recria fn_sync_communication_event: identica a versao da migracao 034,
-- com uma unica mudanca — a normalizacao de v_phone (usado como
-- document_key) passa a usar fn_normalize_phone_br em vez do
-- regexp_replace + checagem de tamanho inline. Isso garante que
-- document_key sempre tenha 10 ou 11 digitos, nunca com DDI, fazendo o
-- indice unico ja existente (idx_conv_document_key_unique) pegar
-- duplicatas que hoje escapam por causa do DDI.
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
    v_phone := fn_normalize_phone_br(v_phone);
    IF v_phone IS NULL THEN
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

- [ ] **Step 2: Push do commit anterior antes de mexer na VPS**

```bash
git add backend/sql/035_normalize_phone_and_unique_constraint.sql
git commit -m "fix: normaliza telefone canonicamente e trava unicidade em crm_customers"
git push origin main
```

- [ ] **Step 3: Contar duplicatas em crm_customers ANTES de aplicar (via SSH na VPS)**

```bash
ssh root@147.79.111.76 bash -s <<'SCRIPT'
PW=$(grep -oP '(?<=avmd:)[^@]+' /opt/avmd/AVMD_System/backend/.env.local | head -1)
PGPASSWORD="$PW" psql -h 127.0.0.1 -U avmd -d avmd -tAc "
  select count(*) from (
    select right(regexp_replace(coalesce(telefone,''), '[^0-9]', '', 'g'), 11) as norm
    from crm_customers
    where telefone is not null and telefone <> ''
    group by norm
    having count(*) > 1
  ) t
"
SCRIPT
```

Expected: um número maior que zero (confirma que a limpeza da migração vai ter efeito real — no levantamento feito antes desta fase, eram pelo menos 20 grupos).

- [ ] **Step 4: Pull, dry-run e apply na VPS**

```bash
ssh root@147.79.111.76 'cd /opt/avmd/AVMD_System && git pull origin main && npm run db:apply-sql:dry-run -- backend/sql/035_normalize_phone_and_unique_constraint.sql'
```

Expected: JSON `"ok": true, "dryRun": true`, `"target": {"host": "127.0.0.1", "port": "5432", "database": "avmd"}`. **Se o `target` não for esse, PARE** — significa que está rodando do lugar errado.

```bash
ssh root@147.79.111.76 'cd /opt/avmd/AVMD_System && npm run db:apply-sql -- backend/sql/035_normalize_phone_and_unique_constraint.sql'
```

Expected: JSON `"ok": true, "applied": true`.

- [ ] **Step 5: Confirmar que zerou as duplicatas e que os índices existem**

```bash
ssh root@147.79.111.76 bash -s <<'SCRIPT'
PW=$(grep -oP '(?<=avmd:)[^@]+' /opt/avmd/AVMD_System/backend/.env.local | head -1)
echo "=== duplicatas restantes em crm_customers (deve ser 0) ==="
PGPASSWORD="$PW" psql -h 127.0.0.1 -U avmd -d avmd -tAc "
  select count(*) from (
    select fn_normalize_phone_br(telefone) as norm
    from crm_customers
    where telefone is not null and telefone <> ''
    group by norm
    having count(*) > 1
  ) t
"
echo "=== indice em crm_customers existe? ==="
PGPASSWORD="$PW" psql -h 127.0.0.1 -U avmd -d avmd -tAc "select count(*) from pg_indexes where indexname = 'idx_crm_customers_telefone_normalizado'"
echo "=== funcao criada com sucesso? ==="
PGPASSWORD="$PW" psql -h 127.0.0.1 -U avmd -d avmd -tAc "select fn_normalize_phone_br('(11) 98765-4321')"
SCRIPT
```

Expected: primeira query retorna `0`, segunda retorna `1`, terceira retorna `11987654321`.

Este step não tem "commit" — o commit já foi feito no Step 2, antes de aplicar. Se algo falhar aqui, PARE e reporte BLOCKED com a saída completa — não tente corrigir a migração já commitada sem entender a causa.

---

### Task 3: Frontend — `chatNavigation.ts` e `Clientes.tsx`

**Files:**
- Modify: `src/lib/chatNavigation.ts:25`
- Modify: `src/pages/Clientes.tsx:507-515` (`buildPhoneCandidates`)

- [ ] **Step 1: Atualizar `chatNavigation.ts`**

Em `src/lib/chatNavigation.ts`, adicione o import no topo do arquivo (junto aos outros imports):

```ts
import { normalizePhoneBR } from '@/lib/phone'
```

Localize a linha 25:

```ts
  const digits = options.phone.replace(/\D/g, '')
```

Substitua por:

```ts
  const digits = normalizePhoneBR(options.phone) ?? ''
```

- [ ] **Step 2: Atualizar `buildPhoneCandidates` em `Clientes.tsx`**

Em `src/pages/Clientes.tsx`, adicione o import (junto aos outros imports do topo do arquivo):

```ts
import { normalizePhoneBR } from '@/lib/phone'
```

Localize a função (linhas 507-515):

```ts
function buildPhoneCandidates(phone: string | null) {
  const digits = normalizeDigits(phone)
  if (!digits) return []

  const variants = new Set<string>([phone ?? '', digits])
  if (digits.length >= 10) variants.add(`+55${digits}`)
  if (digits.startsWith('55') && digits.length > 11) variants.add(`+${digits}`)
  return [...variants].filter(Boolean)
}
```

Substitua por:

```ts
function buildPhoneCandidates(phone: string | null) {
  const canonical = normalizePhoneBR(phone)
  if (!canonical) return []

  // Esta função busca em leads_contabilidade no Supabase legado (fora do
  // escopo da normalização desta fase — essa tabela não é tocada aqui),
  // então mantemos várias variantes de formato para não perder matches
  // com dados antigos gravados sem normalização.
  const variants = new Set<string>([canonical, `55${canonical}`, `+55${canonical}`])
  return [...variants]
}
```

Nota: não remova a função `normalizeDigits` do arquivo se ela for usada em outro lugar — verifique com `grep -n "normalizeDigits" src/pages/Clientes.tsx` antes de decidir. Se só for usada aqui, pode remover; se for usada em outro lugar do arquivo, deixe como está.

- [ ] **Step 3: Compilar**

Run: `npm run build`
Expected: sucesso, sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add src/lib/chatNavigation.ts src/pages/Clientes.tsx
git commit -m "refactor: usa normalizacao canonica de telefone em chatNavigation e Clientes"
```

---

### Task 4: Frontend — `ChatInboxCRM.tsx` (matching de deep-link)

**Files:**
- Modify: `src/pages/ChatInboxCRM.tsx:782-785`

- [ ] **Step 1: Adicionar o import**

No topo de `src/pages/ChatInboxCRM.tsx`, junto aos outros imports:

```ts
import { normalizePhoneBR } from '@/lib/phone'
```

- [ ] **Step 2: Trocar o matching por sufixo (`endsWith`) por comparação exata de telefone normalizado**

Localize o bloco em `ChatInboxCRM.tsx:780-785`:

```ts
    const digits = deepLinkPhone.replace(/\D/g, '')
    const match = conversations.find(item =>
      (item.document_key ?? '').replace(/\D/g, '').endsWith(digits) ||
      (item.telefone ?? '').replace(/\D/g, '').endsWith(digits)
    )
```

Substitua por:

```ts
    const digits = normalizePhoneBR(deepLinkPhone)
    const match = digits
      ? conversations.find(item =>
          normalizePhoneBR(item.document_key) === digits ||
          normalizePhoneBR(item.telefone) === digits
        )
      : undefined
```

Isso troca o casamento por sufixo (arriscado — pode achar uma conversa parecida errada) por comparação exata do telefone já normalizado nos dois lados.

- [ ] **Step 3: Compilar**

Run: `npm run build`
Expected: sucesso, sem erros novos em `ChatInboxCRM.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ChatInboxCRM.tsx
git commit -m "fix: troca casamento de telefone por sufixo por comparacao exata normalizada no deep-link do chat"
```

---

### Task 5: Backend — `leadRepository.ts` e `customerIdentity.ts`

**Files:**
- Modify: `backend/src/repositories/leadRepository.ts:67-80` (`findByPhone`)
- Modify: `backend/src/utils/customerIdentity.ts`

- [ ] **Step 1: Atualizar `findByPhone` em `leadRepository.ts`**

Adicione o import no topo do arquivo:

```ts
import { normalizePhoneBR } from '../utils/phone.js'
```

Localize (linhas 67-80):

```ts
  async findByPhone(phoneDigits: string) {
    if (!phoneDigits) return null

    const result = await this.db.query<LeadRow>(
      `SELECT *
         FROM leads_contabilidade
        WHERE regexp_replace(coalesce(whatsapp_lead, ''), '\\D', '', 'g') = $1
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1`,
      [phoneDigits],
    )

    return result.rows[0] ?? null
  }
```

Substitua por:

```ts
  async findByPhone(phoneDigits: string) {
    const canonical = normalizePhoneBR(phoneDigits)
    if (!canonical) return null

    const result = await this.db.query<LeadRow>(
      `SELECT *
         FROM leads_contabilidade
        WHERE fn_normalize_phone_br(whatsapp_lead) = $1
        ORDER BY updated_at DESC, created_at DESC
        LIMIT 1`,
      [canonical],
    )

    return result.rows[0] ?? null
  }
```

Isso reusa a função Postgres `fn_normalize_phone_br` (criada na Task 2, já em produção) diretamente na query, em vez de duplicar a lógica de normalização em SQL inline.

- [ ] **Step 2: Atualizar `customerIdentity.ts`**

Adicione o import no topo do arquivo:

```ts
import { normalizePhoneBR } from './phone.js'
```

Localize a linha 31:

```ts
  const phoneDigits = onlyDigits(input.phone)
```

Substitua por:

```ts
  const phoneDigits = normalizePhoneBR(input.phone)
```

Localize as linhas 49 e 54 (dentro da query SQL):

```sql
       or ($2::text is not null and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 11) = right($2, 11))
```
```sql
         when $2::text is not null and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 11) = right($2, 11) then 2
```

Substitua as duas ocorrências de `right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 11) = right($2, 11)` por `fn_normalize_phone_br(telefone) = $2` (já que `$2` agora chega pré-normalizado pelo Step anterior). O bloco final da query fica:

```ts
  const result = await db.query<ResolvedCadastroBase>(
    `select
       id::text as id,
       nome,
       email,
       telefone,
       cpf_cnpj
     from cadastros_base
     where ($1::text is not null and regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g') = $1)
        or ($2::text is not null and fn_normalize_phone_br(telefone) = $2)
        or ($3::text is not null and lower(coalesce(email, '')) = lower($3))
     order by
       case
         when $1::text is not null and regexp_replace(coalesce(cpf_cnpj, ''), '\D', '', 'g') = $1 then 1
         when $2::text is not null and fn_normalize_phone_br(telefone) = $2 then 2
         when $3::text is not null and lower(coalesce(email, '')) = lower($3) then 3
         else 99
       end,
       updated_at desc nulls last,
       created_at desc nulls last
     limit 1`,
    [normalizedDoc, phoneDigits, cleanEmail],
  )
```

A função local `onlyDigits` continua existindo e sendo usada para `cpf`/`cnpj`/`document` (não mexemos nisso) — só o telefone passa a usar `normalizePhoneBR`. Se `onlyDigits` ficar sem nenhum uso após esta mudança, NÃO remova — ela ainda é usada para CPF/CNPJ/documento nas linhas 33-35.

**Nota importante**: `cadastros_base` está fora do escopo de mudança de dados desta fase (não leva limpeza nem constraint), mas essa query só está *lendo* de lá para achar um cadastro por telefone — normalizar a comparação aqui é seguro e não afeta a regra de "telefone pode ser compartilhado" discutida na spec, porque não estamos adicionando nenhuma restrição de unicidade nessa tabela, só tornando a busca mais precisa.

- [ ] **Step 3: Compilar backend**

Run: `npm run build:backend`
Expected: sucesso, sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add backend/src/repositories/leadRepository.ts backend/src/utils/customerIdentity.ts
git commit -m "refactor: usa normalizacao canonica de telefone em leadRepository e customerIdentity"
```

---

### Task 6: Deploy e validação manual em produção

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Lint e build completos**

Run: `npm run lint`
Expected: sem novos erros nos arquivos tocados nesta fase (`chatNavigation.ts`, `Clientes.tsx`, `ChatInboxCRM.tsx`, `phone.ts`).

Run: `npm run build && npm run build:backend`
Expected: ambos concluem com sucesso.

- [ ] **Step 2: Push e deploy via gate canônico**

```bash
git push origin main
ssh root@147.79.111.76 'bash /opt/avmd/AVMD_System/ops/scripts/vps-deploy-gate.sh'
```

Expected: log terminando em `Deploy concluido com gate.`, smoke test do backend retornando `{"ok":true,"service":"avmd-backend"}`. Se o gate bloquear por backup vencido, siga o mesmo procedimento já usado nas fases anteriores (backup manual de `/opt/avmd` em `/opt/backups/certiid/<timestamp>/opt-certiid.tar.gz`), só depois de confirmar com o usuário.

- [ ] **Step 3: Validação manual — telefone com/sem DDI casa na mesma conversa**

No Chat ao Vivo em produção, use o atalho de "Clientes" para abrir chat com um contato de teste, uma vez informando o telefone com "+55" e outra vez sem (se possível simular; senão, confirme ao menos que abrir a mesma conversa duas vezes seguidas pelo atalho não cria uma segunda conversa duplicada).

- [ ] **Step 4: Validação manual — tentar cadastrar telefone duplicado em crm_customers é bloqueado**

Tente salvar o painel de contato de duas conversas diferentes com o mesmo número de telefone (um cenário de teste, não um cliente real). Confirme que a segunda tentativa falha de forma clara (mensagem de erro), em vez de silenciosamente criar um segundo cliente com o telefone repetido.

- [ ] **Step 5: Reportar ao usuário**

Se todas as validações passarem, informe que a Fase 2 está em produção: telefone tem uma única fonte de normalização, `crm_customers` não aceita mais telefone duplicado, e a trigger grava `document_key` sempre no formato canônico.
