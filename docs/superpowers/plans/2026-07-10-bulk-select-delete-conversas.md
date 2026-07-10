# Seleção múltipla e exclusão em lote de conversas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir selecionar várias conversas (clique + Shift+clique para intervalo) na lista "Inbox operacional" e no Kanban de `ChatInboxCRM.tsx`, e apagá-las de uma vez.

**Architecture:** Um endpoint novo no backend (`DELETE /api/chat/crm/conversations/bulk`) que apaga em lote seguindo a mesma sequência do endpoint individual já existente. No frontend, um único estado de seleção (`Set<string>` de IDs) compartilhado entre a lista e o Kanban, com uma checkbox por card e uma barra de ação que aparece quando há seleção.

**Tech Stack:** React + TypeScript (frontend), Node.js + `pg` via `AivenSqlClient` (backend). Sem framework de testes automatizado neste repo — validação via `npm run build`, `npm run lint` e verificação manual no navegador (`npm run dev`), conforme `CLAUDE.md`.

**Referência:** spec completo em `docs/superpowers/specs/2026-07-10-bulk-select-delete-conversas-design.md`.

---

### Task 1: Backend — endpoint de exclusão em lote

**Files:**
- Modify: `backend/src/routes/chatRoutes.ts` (novo bloco, inserido imediatamente **antes** do handler individual em `DELETE .../conversations/:id`)

O handler individual existente usa `url.startsWith('/api/chat/crm/conversations/')`, que também bateria com `/bulk`. Por isso a rota nova precisa vir antes dele nesta função, senão o handler individual intercepta a chamada tratando `"bulk"` como se fosse um ID de conversa.

- [ ] **Step 1: Localizar o ponto de inserção**

Encontre este trecho em `backend/src/routes/chatRoutes.ts` (é o handler de exclusão individual, hoje por volta da linha 1255):

```ts
  if (method === 'DELETE' && url.startsWith('/api/chat/crm/conversations/')) {
    const id = url.replace('/api/chat/crm/conversations/', '')
    if (!id) {
      writeJson(res, 400, { ok: false, error: 'ID da conversa obrigatorio.' }, corsOrigin)
      return true
    }
    await db.query('DELETE FROM crm_chat_messages WHERE conversation_id = $1', [id])
    await db.query('DELETE FROM crm_chat_assignments WHERE conversation_id::text = $1', [id])
    await db.query('DELETE FROM crm_chat_conversations WHERE id = $1', [id])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }
```

- [ ] **Step 2: Inserir o novo handler imediatamente antes desse bloco**

Substitua o trecho acima por (adiciona o bloco novo antes, mantém o bloco existente igual):

```ts
  if (method === 'DELETE' && url === '/api/chat/crm/conversations/bulk') {
    const body = await readJson<{ ids?: string[] }>(req)
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      : []
    if (ids.length === 0) {
      writeJson(res, 400, { ok: false, error: 'ids obrigatorio.' }, corsOrigin)
      return true
    }
    if (ids.length > 200) {
      writeJson(res, 400, { ok: false, error: 'Maximo de 200 conversas por chamada.' }, corsOrigin)
      return true
    }
    await db.query('DELETE FROM crm_chat_messages WHERE conversation_id = ANY($1::uuid[])', [ids])
    await db.query('DELETE FROM crm_chat_assignments WHERE conversation_id::text = ANY($1::text[])', [ids])
    const result = await db.query<{ id: string }>(
      'DELETE FROM crm_chat_conversations WHERE id = ANY($1::uuid[]) RETURNING id',
      [ids],
    )
    writeJson(res, 200, { ok: true, deleted: result.rows.length }, corsOrigin)
    return true
  }

  if (method === 'DELETE' && url.startsWith('/api/chat/crm/conversations/')) {
    const id = url.replace('/api/chat/crm/conversations/', '')
    if (!id) {
      writeJson(res, 400, { ok: false, error: 'ID da conversa obrigatorio.' }, corsOrigin)
      return true
    }
    await db.query('DELETE FROM crm_chat_messages WHERE conversation_id = $1', [id])
    await db.query('DELETE FROM crm_chat_assignments WHERE conversation_id::text = $1', [id])
    await db.query('DELETE FROM crm_chat_conversations WHERE id = $1', [id])
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }
```

- [ ] **Step 3: Compilar o backend**

Run: `npm run build:backend`
Expected: sem erros de saída (compila limpo).

- [ ] **Step 4: Validar manualmente com um ID inexistente**

Suba o backend local (`npm run start:backend` após o build, ou o fluxo de dev já configurado) e rode, em outro terminal:

```bash
curl -sS -X DELETE http://localhost:8787/api/chat/crm/conversations/bulk \
  -H "Content-Type: application/json" \
  -d '{"ids":["00000000-0000-0000-0000-000000000000"]}'
```

Expected: `{"ok":true,"deleted":0}` (não apagou nada porque esse ID não existe, mas a rota respondeu corretamente sem erro 500). Também valide o caso de erro:

```bash
curl -sS -X DELETE http://localhost:8787/api/chat/crm/conversations/bulk \
  -H "Content-Type: application/json" -d '{"ids":[]}'
```

Expected: `{"ok":false,"error":"ids obrigatorio."}`

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/chatRoutes.ts
git commit -m "feat: adiciona endpoint de exclusao em lote de conversas do CRM"
```

---

### Task 2: Frontend — estado de seleção e funções auxiliares

**Files:**
- Modify: `src/pages/ChatInboxCRM.tsx`

- [ ] **Step 1: Adicionar o estado de seleção**

Encontre esta linha (hoje por volta da 575):

```tsx
  const [draggedConversationId, setDraggedConversationId] = useState<string | null>(null)
```

Substitua por (mantém a linha original e adiciona duas novas logo depois):

```tsx
  const [draggedConversationId, setDraggedConversationId] = useState<string | null>(null)
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set())
  const [selectionAnchors, setSelectionAnchors] = useState<Record<string, string>>({})
```

- [ ] **Step 2: Adicionar arrays de IDs memoizados para a lista**

Encontre este trecho (hoje por volta da linha 1999-2001):

```tsx
  const filteredClosedConversations = useMemo(() => (
    closedConversations.filter(matchesOperationalFilters)
  ), [closedConversations, queueFilter, humanFilter, humanOverrideIds])
```

Substitua por (mantém o bloco original e adiciona os dois `useMemo` novos logo depois):

```tsx
  const filteredClosedConversations = useMemo(() => (
    closedConversations.filter(matchesOperationalFilters)
  ), [closedConversations, queueFilter, humanFilter, humanOverrideIds])

  const filteredConversationIds = useMemo(
    () => filteredConversations.map(item => item.id),
    [filteredConversations],
  )

  const filteredClosedConversationIds = useMemo(
    () => filteredClosedConversations.map(item => item.id),
    [filteredClosedConversations],
  )
```

- [ ] **Step 3: Adicionar as funções de seleção e exclusão em lote**

Encontre a função `deleteConversation` (hoje por volta da linha 1329-1340):

```tsx
  async function deleteConversation(conversationId: string) {
    if (!confirm('Tem certeza que deseja apagar esta conversa?')) return
    try {
      const response = await fetch(getApiUrl(`/chat/crm/conversations/${conversationId}`), { method: 'DELETE' })
      const data = await response.json()
      if (!data.ok) throw new Error(data.error || 'Falha ao apagar conversa')
      await loadConversations(false)
      if (selectedId === conversationId) setSelectedId(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }
```

Substitua por (mantém a função original e adiciona três novas logo depois):

```tsx
  async function deleteConversation(conversationId: string) {
    if (!confirm('Tem certeza que deseja apagar esta conversa?')) return
    try {
      const response = await fetch(getApiUrl(`/chat/crm/conversations/${conversationId}`), { method: 'DELETE' })
      const data = await response.json()
      if (!data.ok) throw new Error(data.error || 'Falha ao apagar conversa')
      await loadConversations(false)
      if (selectedId === conversationId) setSelectedId(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }

  function toggleConversationSelection(listKey: string, itemId: string, orderedIds: string[], shiftKey: boolean) {
    const anchorId = selectionAnchors[listKey]
    setSelectedConversationIds(prev => {
      const next = new Set(prev)
      if (shiftKey && anchorId) {
        const anchorIndex = orderedIds.indexOf(anchorId)
        const clickedIndex = orderedIds.indexOf(itemId)
        if (anchorIndex !== -1 && clickedIndex !== -1) {
          const [start, end] = anchorIndex < clickedIndex ? [anchorIndex, clickedIndex] : [clickedIndex, anchorIndex]
          for (let i = start; i <= end; i += 1) next.add(orderedIds[i])
          return next
        }
      }
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
    setSelectionAnchors(prev => ({ ...prev, [listKey]: itemId }))
  }

  function clearConversationSelection() {
    setSelectedConversationIds(new Set())
    setSelectionAnchors({})
  }

  async function bulkDeleteSelectedConversations() {
    const ids = Array.from(selectedConversationIds)
    if (ids.length === 0) return
    if (!confirm(`Tem certeza que deseja apagar ${ids.length} conversa${ids.length > 1 ? 's' : ''}? Essa acao nao pode ser desfeita.`)) return
    try {
      const response = await fetch(getApiUrl('/chat/crm/conversations/bulk'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await response.json()
      if (!data.ok) throw new Error(data.error || 'Falha ao apagar conversas selecionadas')
      clearConversationSelection()
      await loadConversations(false)
      if (selectedId && ids.includes(selectedId)) setSelectedId(null)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err))
    }
  }
```

- [ ] **Step 4: Compilar o frontend**

Run: `npm run build`
Expected: sem erros (as novas funções ainda não são usadas em nenhum JSX, mas `noUnusedLocals` está desligado em `tsconfig.app.json`, então isso não quebra o build).

- [ ] **Step 5: Commit**

```bash
git add src/pages/ChatInboxCRM.tsx
git commit -m "feat: adiciona estado e logica de selecao multipla de conversas"
```

---

### Task 3: Frontend — checkbox no `ConversationCard` (lista Inbox operacional)

**Files:**
- Modify: `src/pages/ChatInboxCRM.tsx`

- [ ] **Step 1: Adicionar as novas props ao componente**

Encontre a assinatura de `ConversationCard` (hoje por volta da linha 2994-3014):

```tsx
function ConversationCard({
  item,
  selected,
  onClick,
  human,
  unreadCount = 0,
  closed = false,
  onArchive,
  onDelete,
  onSaveContact,
}: {
  item: ConversationRow
  selected: boolean
  onClick: () => void
  human: boolean
  unreadCount?: number
  closed?: boolean
  onArchive?: () => void
  onDelete?: () => void
  onSaveContact?: () => void
}) {
```

Substitua por:

```tsx
function ConversationCard({
  item,
  selected,
  onClick,
  human,
  unreadCount = 0,
  closed = false,
  onArchive,
  onDelete,
  onSaveContact,
  checked = false,
  onCheckToggle,
}: {
  item: ConversationRow
  selected: boolean
  onClick: () => void
  human: boolean
  unreadCount?: number
  closed?: boolean
  onArchive?: () => void
  onDelete?: () => void
  onSaveContact?: () => void
  checked?: boolean
  onCheckToggle?: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
```

- [ ] **Step 2: Renderizar a caixinha de seleção**

Encontre este trecho, logo abaixo na mesma função (hoje por volta da linha 3024-3029):

```tsx
      <div className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selectedClass}`}>
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold text-slate-900">{normalizeDisplaySenderName(item.cliente_nome || item.nome_crm) || contactPhone(item)}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{contactPhone(item)}</p>
          </button>
```

Substitua por:

```tsx
      <div className={`w-full rounded-2xl border px-4 py-3 text-left transition ${selectedClass}`}>
        <div className="flex items-start justify-between gap-3">
          {onCheckToggle && (
            <button
              type="button"
              onClick={event => { event.stopPropagation(); onCheckToggle(event) }}
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${checked ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white text-transparent hover:border-sky-400'}`}
              title="Selecionar conversa"
            >
              <Check size={13} />
            </button>
          )}
          <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-semibold text-slate-900">{normalizeDisplaySenderName(item.cliente_nome || item.nome_crm) || contactPhone(item)}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{contactPhone(item)}</p>
          </button>
```

- [ ] **Step 3: Compilar o frontend**

Run: `npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ChatInboxCRM.tsx
git commit -m "feat: adiciona checkbox de selecao ao ConversationCard"
```

---

### Task 4: Frontend — checkbox no `ConversationMiniCard` (Kanban)

**Files:**
- Modify: `src/pages/ChatInboxCRM.tsx`

- [ ] **Step 1: Adicionar as novas props ao componente**

Encontre a assinatura de `ConversationMiniCard` (hoje por volta da linha 3108-3130, já deslocada pelas tasks anteriores):

```tsx
function ConversationMiniCard({
  item,
  selected,
  onClick,
  human,
  unreadCount = 0,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDelete,
  onSaveContact,
}: {
  item: ConversationRow
  selected: boolean
  onClick: () => void
  human: boolean
  unreadCount?: number
  draggable?: boolean
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void
  onDragEnd?: () => void
  onDelete?: () => void
  onSaveContact?: () => void
}) {
```

Substitua por:

```tsx
function ConversationMiniCard({
  item,
  selected,
  onClick,
  human,
  unreadCount = 0,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDelete,
  onSaveContact,
  checked = false,
  onCheckToggle,
}: {
  item: ConversationRow
  selected: boolean
  onClick: () => void
  human: boolean
  unreadCount?: number
  draggable?: boolean
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void
  onDragEnd?: () => void
  onDelete?: () => void
  onSaveContact?: () => void
  checked?: boolean
  onCheckToggle?: (event: React.MouseEvent<HTMLButtonElement>) => void
}) {
```

- [ ] **Step 2: Renderizar a caixinha de seleção (posicionamento absoluto, canto superior esquerdo)**

Encontre este trecho logo abaixo (hoje por volta da linha 3131-3136):

```tsx
    const urgency = getUrgencyMeta(item, human)
    const hasCrmCustomer = !!item.crm_customer_id
    return (
      <div className={`group relative w-full rounded-xl border ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-white/70 bg-white hover:border-slate-300'}`}>
        <button type="button" onClick={onClick} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} className="w-full px-3 py-3 text-left">
          <div className="flex items-center justify-between gap-2">
```

Substitua por:

```tsx
    const urgency = getUrgencyMeta(item, human)
    const hasCrmCustomer = !!item.crm_customer_id
    return (
      <div className={`group relative w-full rounded-xl border ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-white/70 bg-white hover:border-slate-300'}`}>
        {onCheckToggle && (
          <button
            type="button"
            onClick={event => { event.stopPropagation(); onCheckToggle(event) }}
            className={`absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-md border transition ${checked ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-300 bg-white/90 text-transparent hover:border-sky-400'}`}
            title="Selecionar conversa"
          >
            <Check size={12} />
          </button>
        )}
        <button type="button" onClick={onClick} draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd} className={`w-full py-3 text-left ${onCheckToggle ? 'pl-7 pr-3' : 'px-3'}`}>
          <div className="flex items-center justify-between gap-2">
```

- [ ] **Step 3: Compilar o frontend**

Run: `npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ChatInboxCRM.tsx
git commit -m "feat: adiciona checkbox de selecao ao ConversationMiniCard"
```

---

### Task 5: Frontend — componente `BulkActionBar`

**Files:**
- Modify: `src/pages/ChatInboxCRM.tsx`

- [ ] **Step 1: Adicionar o componente**

Encontre a declaração de `ConversationCard` (hoje por volta da linha 2994, já deslocada pelas tasks anteriores):

```tsx
function ConversationCard({
```

Substitua por (adiciona o componente novo imediatamente antes):

```tsx
function BulkActionBar({
  count,
  onClear,
  onDelete,
}: {
  count: number
  onClear: () => void
  onDelete: () => void
}) {
  if (count === 0) return null
  return (
    <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
      <span className="text-sm font-semibold text-sky-900">{count} selecionada{count > 1 ? 's' : ''}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          <X size={13} /> Limpar selecao
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
        >
          <Trash2 size={13} /> Apagar selecionadas
        </button>
      </div>
    </div>
  )
}

function ConversationCard({
```

- [ ] **Step 2: Compilar o frontend**

Run: `npm run build`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ChatInboxCRM.tsx
git commit -m "feat: adiciona componente BulkActionBar"
```

---

### Task 6: Frontend — ligar seleção na lista "Inbox operacional"

**Files:**
- Modify: `src/pages/ChatInboxCRM.tsx`

- [ ] **Step 1: Adicionar a barra de acao no cabecalho da lista**

Encontre este trecho (hoje por volta da linha 2184-2194):

```tsx
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-700">Inbox operacional</h2>
                    <p className="text-xs text-slate-400">Lista viva de conversas com filtros e abertura imediata do chat.</p>
                  </div>
                  <div className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {unreadTotal} nao lidas
                  </div>
                </div>
              </div>
```

Substitua por:

```tsx
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-700">Inbox operacional</h2>
                    <p className="text-xs text-slate-400">Lista viva de conversas com filtros e abertura imediata do chat.</p>
                  </div>
                  <div className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                    {unreadTotal} nao lidas
                  </div>
                </div>
                <BulkActionBar
                  count={selectedConversationIds.size}
                  onClear={clearConversationSelection}
                  onDelete={() => void bulkDeleteSelectedConversations()}
                />
              </div>
```

- [ ] **Step 2: Ligar o checkbox nas conversas ativas**

Encontre este trecho (hoje por volta da linha 2199-2209):

```tsx
                    <ConversationCard
                      key={item.id}
                      item={item}
                      selected={item.id === selectedId}
                      onClick={() => setSelectedId(item.id)}
                      human={item.atendimento_humano || humanOverrideIds.includes(item.id)}
                      unreadCount={unreadCounts[item.id] ?? 0}
                      onArchive={() => void updateConversationStatusById(item.id, 'arquivado')}
                      onDelete={() => void deleteConversation(item.id)}
                      onSaveContact={() => void saveContactFromConversation(item.id)}
                    />
```

Substitua por:

```tsx
                    <ConversationCard
                      key={item.id}
                      item={item}
                      selected={item.id === selectedId}
                      onClick={() => setSelectedId(item.id)}
                      human={item.atendimento_humano || humanOverrideIds.includes(item.id)}
                      unreadCount={unreadCounts[item.id] ?? 0}
                      onArchive={() => void updateConversationStatusById(item.id, 'arquivado')}
                      onDelete={() => void deleteConversation(item.id)}
                      onSaveContact={() => void saveContactFromConversation(item.id)}
                      checked={selectedConversationIds.has(item.id)}
                      onCheckToggle={event => toggleConversationSelection('inbox-ativas', item.id, filteredConversationIds, event.shiftKey)}
                    />
```

- [ ] **Step 3: Ligar o checkbox nas conversas encerradas**

Encontre este trecho (hoje por volta da linha 2223-2233):

```tsx
                          <ConversationCard
                            key={item.id}
                            item={item}
                            selected={item.id === selectedId}
                            onClick={() => setSelectedId(item.id)}
                            human={item.atendimento_humano || humanOverrideIds.includes(item.id)}
                            unreadCount={unreadCounts[item.id] ?? 0}
                            closed
                            onDelete={() => void deleteConversation(item.id)}
                            onSaveContact={() => void saveContactFromConversation(item.id)}
                          />
```

Substitua por:

```tsx
                          <ConversationCard
                            key={item.id}
                            item={item}
                            selected={item.id === selectedId}
                            onClick={() => setSelectedId(item.id)}
                            human={item.atendimento_humano || humanOverrideIds.includes(item.id)}
                            unreadCount={unreadCounts[item.id] ?? 0}
                            closed
                            onDelete={() => void deleteConversation(item.id)}
                            onSaveContact={() => void saveContactFromConversation(item.id)}
                            checked={selectedConversationIds.has(item.id)}
                            onCheckToggle={event => toggleConversationSelection('inbox-encerradas', item.id, filteredClosedConversationIds, event.shiftKey)}
                          />
```

- [ ] **Step 4: Compilar o frontend**

Run: `npm run build`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ChatInboxCRM.tsx
git commit -m "feat: liga selecao multipla na lista Inbox operacional"
```

---

### Task 7: Frontend — ligar seleção no Kanban

**Files:**
- Modify: `src/pages/ChatInboxCRM.tsx`

- [ ] **Step 1: Adicionar a barra de acao no cabecalho do modal do Kanban**

Encontre este trecho (hoje por volta da linha 2894-2902):

```tsx
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Kanban operacional</h3>
                <p className="text-sm text-slate-500">Janela ampla para organizar as filas. Ao clicar no card, voce volta direto para o chat.</p>
              </div>
              <button type="button" onClick={closeKanban} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <X size={15} /> Fechar
              </button>
            </div>
```

Substitua por:

```tsx
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Kanban operacional</h3>
                <p className="text-sm text-slate-500">Janela ampla para organizar as filas. Ao clicar no card, voce volta direto para o chat.</p>
              </div>
              <div className="flex flex-1 items-center justify-end gap-4">
                <BulkActionBar
                  count={selectedConversationIds.size}
                  onClear={clearConversationSelection}
                  onDelete={() => void bulkDeleteSelectedConversations()}
                />
                <button type="button" onClick={closeKanban} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <X size={15} /> Fechar
                </button>
              </div>
            </div>
```

- [ ] **Step 2: Ligar o checkbox nos cards das colunas**

Encontre este trecho (hoje por volta da linha 2926-2942):

```tsx
                            <ConversationMiniCard
                              key={item.id}
                              item={item}
                              selected={item.id === selectedId}
                              onClick={() => selectConversationFromKanban(item.id)}
                              human={item.atendimento_humano || humanOverrideIds.includes(item.id)}
                              unreadCount={unreadCounts[item.id] ?? 0}
                              draggable
                              onDragStart={event => {
                              setDraggedConversationId(item.id)
                              event.dataTransfer.setData('text/plain', item.id)
                              event.dataTransfer.effectAllowed = 'move'
                            }}
                            onDragEnd={() => setDraggedConversationId(null)}
                            onDelete={() => void deleteConversation(item.id)}
                            onSaveContact={() => void saveContactFromConversation(item.id)}
                          />
```

Substitua por:

```tsx
                            <ConversationMiniCard
                              key={item.id}
                              item={item}
                              selected={item.id === selectedId}
                              onClick={() => selectConversationFromKanban(item.id)}
                              human={item.atendimento_humano || humanOverrideIds.includes(item.id)}
                              unreadCount={unreadCounts[item.id] ?? 0}
                              draggable
                              onDragStart={event => {
                              setDraggedConversationId(item.id)
                              event.dataTransfer.setData('text/plain', item.id)
                              event.dataTransfer.effectAllowed = 'move'
                            }}
                            onDragEnd={() => setDraggedConversationId(null)}
                            onDelete={() => void deleteConversation(item.id)}
                            onSaveContact={() => void saveContactFromConversation(item.id)}
                            checked={selectedConversationIds.has(item.id)}
                            onCheckToggle={event => toggleConversationSelection(`kanban:${column.key}`, item.id, column.items.map(i => i.id), event.shiftKey)}
                          />
```

- [ ] **Step 3: Compilar o frontend**

Run: `npm run build`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ChatInboxCRM.tsx
git commit -m "feat: liga selecao multipla no Kanban"
```

---

### Task 8: Verificação manual end-to-end

**Files:** nenhum (só validação)

- [ ] **Step 1: Rodar lint e build completos**

Run: `npm run lint`
Expected: nenhum erro novo introduzido nas linhas alteradas de `src/pages/ChatInboxCRM.tsx` (o projeto já tem erros pré-existentes em outros arquivos, não é preciso zerar isso).

Run: `npm run build && npm run build:backend`
Expected: ambos sem erros.

- [ ] **Step 2: Subir o ambiente local**

Run: `npm run dev` (frontend) e, em outro terminal, o backend local já compilado (`npm run start:backend` após o build do Step 1, ou o fluxo de dev do backend já configurado no projeto).

- [ ] **Step 3: Testar seleção e exclusão na lista "Inbox operacional"**

1. Abrir "Chat ao Vivo" → aba "Chat" (lista).
2. Clicar na caixinha de 1 card → confirma que ele fica marcado e a barra "1 selecionada" aparece no topo.
3. Segurar Shift e clicar na caixinha de outro card mais abaixo na mesma lista → confirma que todos os cards entre os dois ficam marcados.
4. Clicar no corpo de um card (fora da caixinha) → confirma que abre a conversa no painel normalmente, sem alterar a seleção.
5. Clicar em "Apagar selecionadas" → confirma o `confirm()` mostrando a contagem certa, aceitar, confirmar que as conversas somem da lista e a barra desapareça.

- [ ] **Step 4: Testar seleção e exclusão no Kanban**

1. Abrir o Kanban.
2. Selecionar 2-3 cards com Shift+clique dentro da **mesma coluna** → confirma intervalo correto.
3. Shift+clique em um card de **outra coluna** → confirma que so aquele card avulso e adicionado (nao tenta criar intervalo entre colunas).
4. Confirma que o botao "Apagar selecionadas" aparece no cabecalho do Kanban e funciona.
5. Confirma que arrastar um card (drag and drop entre colunas) continua funcionando normalmente, sem interferencia da selecao.

- [ ] **Step 5: Testar selecao compartilhada entre lista e Kanban**

1. Selecionar 2 conversas na lista "Inbox operacional".
2. Abrir o Kanban → confirmar que essas 2 conversas aparecem marcadas la tambem (se estiverem em colunas visiveis no Kanban).
3. Fechar o Kanban → confirmar que a selecao continua na lista.

- [ ] **Step 6: Testar cenario de erro**

1. Selecionar 1+ conversas.
2. Derrubar o backend local (`Ctrl+C` no terminal do backend).
3. Clicar em "Apagar selecionadas" → confirmar que aparece uma mensagem de erro (nao trava a tela) e a **selecao continua marcada** (nao foi limpa apesar do erro).
4. Subir o backend de novo e repetir a exclusao com sucesso, pra confirmar que a recuperacao funciona.

- [ ] **Step 7: Commit final (se algum ajuste foi feito durante a verificacao)**

Se qualquer step acima revelar um ajuste necessario, faca a correcao, rode `npm run build` de novo, e:

```bash
git add src/pages/ChatInboxCRM.tsx backend/src/routes/chatRoutes.ts
git commit -m "fix: ajustes pos-verificacao manual da selecao em lote"
```

Se nada precisou de ajuste, pule este commit — o feature ja esta completo com os commits das tasks anteriores.
