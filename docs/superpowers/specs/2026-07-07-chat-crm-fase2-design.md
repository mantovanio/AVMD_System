# Chat ao Vivo × CRM Geral — Fase 2: telefone único e normalização canônica

## Contexto

A Fase 1 (já em produção) corrigiu dois bugs de comportamento na trigger `fn_sync_communication_event`. Esta Fase 2 ataca a causa estrutural por trás de "conversa duplicada"/"mensagem indo pro contato errado": o sistema hoje tem **6 lugares diferentes** com lógica própria de comparar/normalizar telefone (`src/lib/chatNavigation.ts`, `src/pages/Clientes.tsx`, `src/pages/ChatInboxCRM.tsx`, `backend/src/repositories/leadRepository.ts`, `backend/src/utils/customerIdentity.ts`, e a trigger `fn_sync_communication_event`), cada um com uma noção ligeiramente diferente de "mesmo telefone" (sufixo, exato, com/sem DDI), e **nenhuma trava real no banco** impedindo duas linhas com o mesmo telefone de existir.

Levantamento feito em produção (banco Postgres da VPS, `avmd`) antes de desenhar esta fase:
- `crm_customers.telefone`: **já existem duplicatas reais** — pelo menos 20 números distintos com 2 a 4 registros cada (ex.: um número com 4 clientes cadastrados).
- `crm_chat_conversations.document_key`: **zero duplicatas** hoje, mas o campo aceita tanto 11 dígitos (DDD+9) quanto 13 dígitos (DDI+DDD+9) para o mesmo número real, porque a trigger só remove caracteres não-numéricos, nunca o DDI — uma fonte latente de duplicata que ainda não se materializou.

## Objetivo

1. Uma única fonte de verdade para "qual é o telefone normalizado deste contato", usada em todos os pontos de escrita e comparação do sistema.
2. Uma trava real no banco que impede duas linhas com o mesmo telefone normalizado de coexistir em `crm_customers` e em `crm_chat_conversations`.
3. Isso vale **só para o sistema de chat** (banco Postgres da VPS: `crm_customers`, `crm_chat_conversations`, e a trigger). `cadastros_base` (Aiven) fica de fora — entra na Fase 3, quando os bancos forem unificados.
4. Duplicatas **já existentes** não são mescladas nesta fase (histórico de conversa não é tocado) — só o suficiente é feito para viabilizar a trava (ver "Limpeza mínima" abaixo).

## Distinção importante: identidade vs. envio

Duas responsabilidades diferentes que não podem se misturar:

- **Identidade/dedup (esta fase)**: o telefone canônico usado para comparar "é o mesmo contato?" é sempre **DDD + 9 dígitos (11 dígitos), sem DDI**. Presença ou ausência de "55" nunca deve fazer dois registros parecerem diferentes.
- **Envio via WhatsApp (já existe, não muda)**: para montar o JID que a Evolution API usa pra mandar mensagem (`5511999999999@s.whatsapp.net`), o DDI **precisa** estar presente — isso é uma regra de formatação de saída, não de identidade. `buildRemoteJid()` (`backend/src/routes/evolutionWebhookRoutes.ts:60-62`) já faz essa composição e continua existindo; a mudança aqui é garantir que ele sempre receba o telefone canônico (sem DDI) como entrada e sempre componha com "55" na saída, de forma consistente.

## Arquitetura

### 1. Função canônica de normalização — dois lugares, mesmo algoritmo

**Postgres**: nova função `fn_normalize_phone_br(text) RETURNS text`, criada na mesma migração que atualiza a trigger. Algoritmo:
1. Remove tudo que não é dígito.
2. Se sobrarem 12 ou 13 dígitos E começar com "55", remove o "55" (DDI).
3. Se o resultado tiver exatamente 10 ou 11 dígitos, retorna esse valor (10 dígitos = telefone fixo sem o 9º dígito, aceito como está — não é objetivo desta fase forçar o 9º dígito em fixo).
4. Caso contrário (muito curto, muito longo, ou não numérico o suficiente), retorna `NULL`.

**TypeScript**: confirmado que o backend nunca importa de `src/lib/` (são dois projetos TypeScript com `tsconfig.json` separados, sem cross-import hoje) — então a função é implementada em **dois arquivos**, cada um exportando `normalizePhoneBR(value: string | null | undefined): string | null` com o algoritmo idêntico:
- `src/lib/phone.ts` (frontend).
- `backend/src/utils/phone.ts` (backend).

Cada arquivo leva um comentário apontando pro outro ("mantenha esta função idêntica a `<caminho do outro arquivo>`"), já que não há como compartilhar o módulo entre os dois builds sem reestruturar o projeto (fora de escopo).

### 2. Limpeza mínima em `crm_customers` (viabiliza a trava)

Migração identifica grupos de registros em `crm_customers` cujo `telefone` normalizado colide. Para cada grupo, mantém o telefone no registro com `updated_at` mais recente (desempate por `created_at` se `updated_at` for igual/nulo) e limpa (`telefone = NULL`) o telefone dos demais registros do grupo. Nenhuma linha é apagada, nenhum outro campo é tocado, nenhum histórico de conversa é mesclado.

### 3. Trava real no banco

- `crm_customers`: índice único parcial sobre `regexp_replace`/expressão equivalente ao telefone normalizado, com `WHERE telefone IS NOT NULL AND telefone <> ''` — só depois da limpeza do passo 2, senão a criação do índice falha.
- `crm_chat_conversations.document_key`: a trigger passa a gravar `v_phone` já normalizado por `fn_normalize_phone_br` (sempre 10 ou 11 dígitos, nunca com DDI) antes de usar esse valor tanto pra buscar conversa existente quanto pra gravar. Como hoje não há duplicata nesse campo, o índice único parcial (recriando o padrão que já existiu e foi removido em migrações anteriores — ver `backend/sql/027_crm_dedup_by_phone.sql`) pode ser criado direto, sem limpeza prévia.

### 4. Atualizar os 6 pontos de matching identificados na auditoria

Cada um passa a chamar a função canônica em vez da lógica própria:
- `src/lib/chatNavigation.ts:25` — troca `phone.replace(/\D/g, '')` por `normalizePhoneBR(phone)`.
- `src/pages/Clientes.tsx:507-515` (`buildPhoneCandidates`) — simplifica para gerar só a forma canônica, já que a busca em `leads_contabilidade` (Base 1/Supabase, fora do escopo desta fase, mas o código de gerar candidatos é local e pode ser limpo).
- `src/pages/ChatInboxCRM.tsx:782-785` — troca o `.endsWith()` por comparação exata (`===`) entre telefones já normalizados.
- `backend/src/repositories/leadRepository.ts:73` (`findByPhone`) — usa a normalização canônica em vez de `regexp_replace` inline.
- `backend/src/utils/customerIdentity.ts:49,54` (`resolveCadastroBaseByIdentity`) — mesma troca.
- A trigger `fn_sync_communication_event` (ponto 3 acima).

## Tratamento de erro / casos de borda

- **Número inválido** (`fn_normalize_phone_br` retorna `NULL`): mesma tratativa que já existe hoje (a trigger já tem um `RETURN NEW` quando o telefone não passa no length check — só passa a usar a função canônica em vez do length check inline).
- **Colisão em runtime** (evento novo chegando com telefone que, já normalizado, bate com uma conversa/cliente existente diferente do que o código esperava): o padrão SELECT-então-UPDATE-ou-INSERT da trigger (já corrigido na Fase 1) naturalmente encontra e reusa a linha existente pelo `document_key` normalizado — não deve gerar erro de constraint na operação normal. Um erro de constraint só aconteceria em uma corrida real entre dois eventos simultâneos pro mesmo número novo; isso já é um risco pré-existente documentado na auditoria (fora do escopo resolver aqui), não introduzido por esta fase.

## Validação

Sem suíte automatizada. Checklist:
1. `npm run db:apply-sql:dry-run` da nova migração antes de aplicar.
2. Query de contagem de duplicatas em `crm_customers.telefone` normalizado, antes e depois — depois deve ser zero.
3. Confirmar que os índices únicos foram criados sem erro (índice em `crm_chat_conversations.document_key` só é criado depois de confirmar zero duplicatas ali; índice em `crm_customers.telefone` só depois da limpeza do passo 2).
4. `npm run build` e `npm run build:backend` para os pontos de TypeScript alterados.
5. Teste manual: abrir chat a partir de "Clientes" pra um contato já existente com telefone em formatos diferentes (com/sem DDI) em cada lado, confirmar que casa na mesma conversa.
