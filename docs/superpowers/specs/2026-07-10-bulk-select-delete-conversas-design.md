# Seleção múltipla e exclusão em lote de conversas (Inbox operacional + Kanban)

## Contexto

Hoje, apagar uma conversa no CRM (`ChatInboxCRM.tsx`) é sempre um clique por vez: cada card (`ConversationCard` na lista "Inbox operacional", `ConversationMiniCard` no Kanban) tem um botão de lixeira que chama `deleteConversation(id)`, com um `confirm()` individual, um `fetch DELETE /api/chat/crm/conversations/:id` por chamada. Não existe nenhum mecanismo de seleção múltipla em nenhuma das duas telas.

O usuário precisa apagar várias conversas de uma vez, tanto na lista quanto no Kanban, usando clique + Shift para selecionar um intervalo — como em gerenciadores de arquivo.

## Objetivo

1. Selecionar múltiplas conversas com o mouse (clique único e Shift+clique para intervalo) tanto na lista "Inbox operacional" quanto no Kanban.
2. Apagar todas as conversas selecionadas de uma vez, com uma única confirmação.
3. A seleção é um único estado compartilhado entre as duas telas — selecionar na lista e abrir o Kanban mantém a seleção (e vice-versa).

Fora de escopo: seleção múltipla para outras ações além de apagar (mover em lote, arquivar em lote etc.); atalhos de teclado (Ctrl+A, Delete); seleção via toque/mobile.

## Modelo de seleção

Estado único no componente `ChatInboxCRM`:

- `selectedConversationIds: Set<string>` — IDs das conversas marcadas, válido nas duas telas.
- `selectionAnchors: Record<string, string>` — mapa de "chave da lista" → último ID clicado nela, usado como ponto de partida do Shift+clique. Chaves: `'inbox-ativas'`, `'inbox-encerradas'`, e `kanban:<column.key>` para cada coluna do Kanban.

### Interação (mouse)

Cada card ganha uma caixinha de seleção fixa (sempre visível, canto superior esquerdo — não depende de hover, diferente dos ícones de ação existentes que só aparecem no hover).

- **Clique na caixinha**: alterna a seleção daquele único card; atualiza a âncora da lista/coluna onde o card está.
- **Shift+clique na caixinha**: seleciona o intervalo entre a âncora atual daquela lista/coluna e o card clicado (inclusive), somando à seleção existente. Se não houver âncora ainda para aquela lista/coluna, comporta-se como um clique normal (seleciona só aquele item e vira a âncora).
- **Clique no corpo do card** (fora da caixinha): comportamento inalterado — abre a conversa no chat (`onClick` existente), não mexe na seleção.
- O intervalo do Shift+clique **nunca cruza** listas/colunas diferentes: lista de ativas, lista de encerradas, e cada coluna do Kanban são escopos de intervalo independentes. Um Shift+clique em outra lista/coluna apenas seleciona aquele item avulso e vira a nova âncora dali.

## Barra de ação em lote

Aparece sempre que `selectedConversationIds.size > 0`, fixa:
- No cabeçalho do painel "Inbox operacional" (acima ou substituindo a linha do título), visível na tela de lista.
- No cabeçalho do modal "Kanban operacional", visível quando o Kanban está aberto.

Conteúdo: `"N selecionadas"`, botão "Limpar seleção" (esvazia `selectedConversationIds` e `selectionAnchors`), botão vermelho "Apagar selecionadas".

### Fluxo de exclusão

1. Clique em "Apagar selecionadas" → `confirm()` nativo: `"Tem certeza que deseja apagar N conversas? Essa ação não pode ser desfeita."`.
2. Confirmado → chama o endpoint em lote (seção Backend) com a lista de IDs selecionados.
3. Sucesso: limpa seleção e âncoras, recarrega a lista de conversas (`loadConversations(false)`), e se `selectedId` (conversa aberta no painel de chat) estava entre os apagados, fecha o painel (`setSelectedId(null)`) — mesmo comportamento do delete individual hoje.
4. Erro: mostra a mensagem em `actionError` (mesmo local de erro já usado pelas outras ações do componente); **mantém a seleção intacta** para permitir nova tentativa sem o usuário precisar re-selecionar tudo.

## Backend

Novo endpoint `DELETE /api/chat/crm/conversations/bulk` em `backend/src/routes/chatRoutes.ts`, registrado **antes** da rota existente `DELETE /api/chat/crm/conversations/:id` (ambas usam prefixo `/api/chat/crm/conversations/`, a checagem de rota precisa diferenciar o path exato `/bulk` do padrão com ID).

Request: `{ ids: string[] }` no corpo JSON.

Validação: rejeita lista vazia (400) e lista acima de 200 itens (400, limite de sanidade — não é um caso de uso esperado apagar mais que isso de uma vez).

Implementação — mesma sequência do endpoint individual (`crm_chat_messages` → `crm_chat_assignments` → `crm_chat_conversations`), trocando igualdade por `ANY`:

```sql
DELETE FROM crm_chat_messages WHERE conversation_id = ANY($1::uuid[]);
DELETE FROM crm_chat_assignments WHERE conversation_id::text = ANY($1::text[]);
DELETE FROM crm_chat_conversations WHERE id = ANY($1::uuid[]);
```

Resposta: `{ ok: true, deleted: N }` onde N vem de `result.rowCount` do último DELETE.

## Componentes afetados

- `src/pages/ChatInboxCRM.tsx`: estado de seleção, âncoras, barra de ação (novo componente `BulkActionBar`), função `bulkDeleteConversations(ids)`, passagem de novas props (`checked`, `onCheckToggle`) para `ConversationCard` e `ConversationMiniCard`.
- `backend/src/routes/chatRoutes.ts`: novo endpoint `DELETE /api/chat/crm/conversations/bulk`.

## Testes / validação

Sem suite de testes automatizada no projeto (consistente com `CLAUDE.md`). Validação manual via `npm run dev` cobrindo:
- Selecionar via checkbox na lista, Shift+clique pra intervalo, apagar em lote.
- Mesmo fluxo no Kanban, confirmando que intervalo não cruza colunas.
- Selecionar na lista, abrir o Kanban, confirmar que a seleção persiste (e vice-versa).
- Clique no corpo do card continua abrindo o chat normalmente, com e sem seleção ativa.
- Cenário de erro (ex.: desligar o backend) mantendo a seleção após falha.
