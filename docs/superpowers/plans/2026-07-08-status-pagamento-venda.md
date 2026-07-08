# Status de Pagamento da Venda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um status de pagamento de 3 estados (`em_aberto`/`pago`/`recusado`) em `vendas_certificados`, visível e editável na lista de Vendas do Comercial, sincronizado com o booleano `pago` já usado por automações existentes.

**Architecture:** Nova coluna com trigger de sincronia no Postgres; novo endpoint espelhando o padrão já existente de `POST /api/comercial/vendas/status`; nova coluna na tabela de Vendas do frontend com dropdown editável no mesmo padrão visual do "Status Venda" atual; ajuste no webhook de pagamento existente (Safe2Pay) para também escrever o novo campo, sem conectar o wizard interno ao gateway.

**Tech Stack:** PostgreSQL (trigger), Node/TypeScript (backend `CommercialRepository`), React/TypeScript (`Comercial.tsx`).

Este projeto não tem suite de testes automatizada (ver `CLAUDE.md`). A validação de cada task é feita via `npm run build`, `npm run lint`, consultas diretas no banco (via SSH na VPS, nunca local — ver `DEPLOY-RAPIDO.md`) e teste manual na UI depois do deploy.

---

### Task 1: Migração SQL — coluna `status_pagamento` + trigger de sincronia

**Files:**
- Create: `backend/sql/044_add_status_pagamento_vendas.sql`

- [ ] **Step 1: Escrever a migração**

```sql
alter table vendas_certificados
  add column if not exists status_pagamento text not null default 'em_aberto';

alter table vendas_certificados drop constraint if exists vendas_certificados_status_pagamento_check;
alter table vendas_certificados
  add constraint vendas_certificados_status_pagamento_check
  check (status_pagamento in ('em_aberto', 'pago', 'recusado'));

create or replace function fn_sync_pago_from_status_pagamento()
returns trigger as $$
begin
  if new.status_pagamento is distinct from old.status_pagamento then
    if new.status_pagamento = 'pago' then
      new.pago := true;
      if new.data_pagamento is null then
        new.data_pagamento := now();
      end if;
    else
      new.pago := false;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_pago_from_status_pagamento on vendas_certificados;
create trigger trg_sync_pago_from_status_pagamento
  before update on vendas_certificados
  for each row
  execute function fn_sync_pago_from_status_pagamento();
```

- [ ] **Step 2: Commit**

```bash
git add backend/sql/044_add_status_pagamento_vendas.sql
git commit -m "feat: adiciona status_pagamento em vendas_certificados com sincronia de pago"
```

Não aplicar ainda na VPS — isso acontece na Task 7, junto com o deploy do código que depende da coluna.

---

### Task 2: Tipo `VendaCertificado` ganha `status_pagamento`

**Files:**
- Modify: `src/types/index.ts:710-711`

- [ ] **Step 1: Adicionar o tipo e o campo**

Em `src/types/index.ts`, logo após a linha 710 (`export type StatusVendaCertificado = ...`), adicionar:

```ts
export type StatusPagamentoVenda = 'em_aberto' | 'pago' | 'recusado'
```

Depois, dentro da interface `VendaCertificado` (linha 715-782), adicionar o campo logo abaixo de `pago: boolean` (linha 724):

```ts
  pago: boolean
  status_pagamento: StatusPagamentoVenda
```

- [ ] **Step 2: Rodar o build pra confirmar que não quebrou nada**

Run: `npm run build`
Expected: build passa sem erros de tipo (o campo é só adicionado, nenhum código existente lê `status_pagamento` ainda).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: adiciona tipo StatusPagamentoVenda em VendaCertificado"
```

---

### Task 3: Backend — endpoint de atualização do status de pagamento

**Files:**
- Modify: `backend/src/repositories/commercialRepository.ts:14-17` (novo tipo de input) e após `updateSaleStatus` (linha 68-86)
- Modify: `backend/src/routes/commercialRoutes.ts:6` (novo tipo de request) e após a rota `/api/comercial/vendas/status` (linha 107-112)

- [ ] **Step 1: Adicionar o tipo de input no repository**

Em `backend/src/repositories/commercialRepository.ts`, logo abaixo de `UpdateCommercialSaleStatusInput` (linha 14-17), adicionar:

```ts
export type UpdateCommercialSalePaymentStatusInput = {
  id: string
  status: 'em_aberto' | 'pago' | 'recusado'
}
```

- [ ] **Step 2: Adicionar o método no repository**

Logo depois do método `updateSaleStatus` (que termina na linha 86), adicionar:

```ts
  async updateSalePaymentStatus(input: UpdateCommercialSalePaymentStatusInput) {
    const result = await this.db.query<{ id: string; status_pagamento: string }>(`
      update vendas_certificados
      set status_pagamento = $2,
          updated_at = now()
      where id = $1
      returning id, status_pagamento
    `, [input.id, input.status])
    const venda = result.rows[0] ?? null
    if (venda?.id) {
      await this.recordIntegrationEvent({
        eventType: 'commercial.sale.payment_status.updated',
        entityType: 'vendas_certificados',
        entityId: venda.id,
        payload: { status_pagamento: venda.status_pagamento },
      })
    }
    return venda
  }
```

- [ ] **Step 3: Adicionar o tipo de request na rota**

Em `backend/src/routes/commercialRoutes.ts`, logo abaixo de `type SaleStatusRequest = { id: string; status: string }` (linha 6), adicionar:

```ts
type SalePaymentStatusRequest = { id: string; status: string }
```

- [ ] **Step 4: Adicionar a rota**

Logo depois do bloco da rota `/api/comercial/vendas/status` (linha 107-112), adicionar:

```ts
  if (req.method === 'POST' && req.url === '/api/comercial/vendas/pagamento') {
    const body = await readJson<SalePaymentStatusRequest>(req)
    const venda = await repository.updateSalePaymentStatus(body as { id: string; status: 'em_aberto' | 'pago' | 'recusado' })
    writeJson(res, 200, { ok: true, venda }, corsOrigin)
    return true
  }
```

- [ ] **Step 5: Rodar o build do backend**

Run: `npm run build:backend`
Expected: compila sem erros.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/commercialRepository.ts backend/src/routes/commercialRoutes.ts
git commit -m "feat: adiciona endpoint de atualizacao do status de pagamento da venda"
```

---

### Task 4: Frontend — helper de API e tipo local

**Files:**
- Modify: `src/lib/commercialAiven.ts:52-55` (logo após `updateAivenCommercialSaleStatus`)

- [ ] **Step 1: Adicionar a função**

Logo depois de `updateAivenCommercialSaleStatus` (linha 52-55), adicionar:

```ts
export async function updateAivenCommercialSalePaymentStatus(id: string, status: 'em_aberto' | 'pago' | 'recusado') {
  const response = await postJson<ApiResponse<'venda', { id: string; status_pagamento: string }>>(getApiUrl('/comercial/vendas/pagamento'), { id, status })
  return response.venda ?? null
}
```

- [ ] **Step 2: Rodar o build**

Run: `npm run build`
Expected: passa sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/lib/commercialAiven.ts
git commit -m "feat: adiciona helper de atualizacao do status de pagamento no frontend"
```

---

### Task 5: Frontend — constantes de label/cor e função de atualização

**Files:**
- Modify: `src/pages/Comercial.tsx` (import na linha do topo onde `updateAivenCommercialSaleStatus` já é importado; constantes logo após `STATUS_VENDA_LABEL` linha 352-359; função logo após `atualizarStatusVendaV2` linha 1985-1995; cor logo após `statusVendaV2Cls` linha 7256-7266)

- [ ] **Step 1: Importar o novo helper**

Encontrar a linha de import que já traz `updateAivenCommercialSaleStatus` de `@/lib/commercialAiven` (ou `../lib/commercialAiven`, conforme o alias usado no arquivo) e adicionar `updateAivenCommercialSalePaymentStatus` na mesma lista de imports nomeados.

- [ ] **Step 2: Adicionar as constantes de label**

Logo depois do bloco `STATUS_VENDA_LABEL` (linha 352-359), adicionar:

```ts
const STATUS_PAGAMENTO_OPTIONS: StatusPagamentoVenda[] = ['em_aberto', 'pago', 'recusado']

const STATUS_PAGAMENTO_LABEL: Record<StatusPagamentoVenda, string> = {
  em_aberto: 'Em Aberto',
  pago:      'Pago',
  recusado:  'Recusado',
}
```

(`StatusPagamentoVenda` já vem de `@/types` — confirmar que o import de tipos no topo do arquivo inclui esse tipo junto dos outros como `StatusVendaCertificado`.)

- [ ] **Step 3: Adicionar a função de atualização**

Logo depois de `atualizarStatusVendaV2` (linha 1985-1995), adicionar:

```ts
  async function atualizarStatusPagamentoV2(id: string, status: StatusPagamentoVenda) {
    const updated = await updateAivenCommercialSalePaymentStatus(id, status)
    if (updated) {
      setVendasV2(prev => prev.map(v => v.id === id
        ? { ...v, status_pagamento: status, pago: status === 'pago' }
        : v))
    }
  }
```

(Isso espelha exatamente a regra do trigger `fn_sync_pago_from_status_pagamento` da Task 1 no estado local do frontend, pra lista não ficar defasada até o próximo refetch.)

- [ ] **Step 4: Adicionar a função de cor**

Logo depois de `statusVendaV2Cls` (linha 7256-7266), adicionar:

```ts
function statusPagamentoCls(s: StatusPagamentoVenda) {
  const m: Record<StatusPagamentoVenda, string> = {
    em_aberto: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    pago:      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    recusado:  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }
  return m[s]
}
```

- [ ] **Step 5: Rodar o build**

Run: `npm run build`
Expected: passa sem erros (a UI ainda não usa essas constantes/funções — isso é feito na Task 6).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Comercial.tsx
git commit -m "feat: adiciona constantes e funcao de atualizacao do status de pagamento"
```

---

### Task 6: Frontend — coluna "Pagamento" na tabela de Vendas

**Files:**
- Modify: `src/pages/Comercial.tsx:4745` (array de cabeçalhos), `:4752-4754` (colSpan), e a célula do "Status Venda" (mesmo bloco da Task 5, próximo à linha 4784-4794 antes das edições anteriores — conferir a linha exata após as Tasks 1-5, já que elas deslocam o arquivo)

- [ ] **Step 1: Adicionar "Pagamento" no array de cabeçalhos**

Em `src/pages/Comercial.tsx:4745`, o cabeçalho da tabela é gerado a partir de um array:

```tsx
{['Pedido','Protocolo','Tipo Emissão','Tipo Venda','Status Venda','Data Status','Forma Pagamento','Valor Venda','Produto','Doc. Cliente','Cliente','PA','Data Venda','Vendedor','Observação'].map(h => (
```

Adicionar `'Pagamento'` logo depois de `'Status Venda'` na lista:

```tsx
{['Pedido','Protocolo','Tipo Emissão','Tipo Venda','Status Venda','Pagamento','Data Status','Forma Pagamento','Valor Venda','Produto','Doc. Cliente','Cliente','PA','Data Venda','Vendedor','Observação'].map(h => (
```

- [ ] **Step 2: Atualizar o `colSpan` das linhas de loading/vazio**

Em `src/pages/Comercial.tsx:4752-4754`, o `colSpan={17}` usado em `<LoadingRow colSpan={17} />` e `<EmptyRow colSpan={17} label="..." />` precisa virar `colSpan={18}` (mais uma coluna adicionada).

- [ ] **Step 3: Adicionar a célula correspondente**

Localizar a célula `<td>` do "Status Venda" (o `<select>` que usa `statusVendaV2Cls`, escrito na Task 5 sem alterações — permanece igual ao código já existente hoje). Logo depois desse `<td>`, adicionar:

```tsx
                        <td className="px-3 py-2">
                          <select
                            title="Status do pagamento"
                            value={v.status_pagamento}
                            onChange={e => void atualizarStatusPagamentoV2(v.id, e.target.value as StatusPagamentoVenda)}
                            className={cn('px-2 py-0.5 rounded-full text-xs font-medium border-0 cursor-pointer focus:outline-none whitespace-nowrap', statusPagamentoCls(v.status_pagamento))}>
                            {STATUS_PAGAMENTO_OPTIONS.map(s => (
                              <option key={s} value={s}>{STATUS_PAGAMENTO_LABEL[s]}</option>
                            ))}
                          </select>
                        </td>
```

- [ ] **Step 4: Rodar o build e o lint**

Run: `npm run build`
Expected: passa sem erros de tipo (agora `v.status_pagamento` é lido de verdade, então o tipo `VendaRow`/`VendaCertificado` precisa ter o campo — já adicionado na Task 2).

Run: `npx eslint src/pages/Comercial.tsx`
Expected: nenhum erro novo (esse arquivo especificamente não tinha erros de lint antes desta feature — confirmar que continua em 0 erros próprios do arquivo).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Comercial.tsx
git commit -m "feat: exibe coluna de status de pagamento na lista de vendas"
```

---

### Task 7: Backend — webhook de pagamento (Safe2Pay) também escreve `status_pagamento`

**Files:**
- Modify: `backend/src/repositories/aivenCheckoutRepository.ts:479-509` (método `applyPaymentWebhook`)

- [ ] **Step 1: Atualizar o UPDATE do webhook**

Substituir o corpo do método `applyPaymentWebhook` (linha 490-508) por:

```ts
    await this.db.query(
      `update vendas_certificados
       set pago = case when $2 then true else pago end,
           data_pagamento = case when $2 then now() else data_pagamento end,
           status_pagamento = case
             when $2 then 'pago'
             when $5 = 'failed' then 'recusado'
             else status_pagamento
           end,
           status_venda = case when $2 then 'vendido' else status_venda end,
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
             'payment_charge', coalesce(metadata->'payment_charge', '{}'::jsonb) || jsonb_build_object(
               'gateway', $3,
               'external_id', $4,
               'status', $5,
               'webhook_payload', $6::jsonb,
               'paid', $2,
               'updated_at', now()
             )
           ),
           updated_at = now()
       where id = $1::uuid`,
      [vendaId, input.paid, input.gateway, input.externalId ?? null, input.status, JSON.stringify(input.payload ?? {})],
    )
```

(A única mudança real é a nova cláusula `status_pagamento = case ...`; os `$2`-`$6` continuam na mesma ordem de parâmetros já existente.)

- [ ] **Step 2: Rodar o build do backend**

Run: `npm run build:backend`
Expected: compila sem erros.

- [ ] **Step 3: Commit**

```bash
git add backend/src/repositories/aivenCheckoutRepository.ts
git commit -m "feat: webhook de pagamento tambem atualiza status_pagamento"
```

---

### Task 8: Deploy e validação manual em produção

**Files:** nenhum (só operação de deploy)

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Aplicar a migração na VPS via SSH** (nunca rodar `db:apply-sql` da máquina local — aponta pro banco errado, ver lição registrada em `DEPLOY-RAPIDO.md`)

```bash
ssh root@147.79.111.76 "cd /opt/avmd/AVMD_System && git pull --ff-only origin main && npm run db:apply-sql -- backend/sql/044_add_status_pagamento_vendas.sql"
```

Expected: JSON de resposta com `"applied": true`.

- [ ] **Step 3: Rodar o gate de deploy**

```bash
ssh root@147.79.111.76 "bash /opt/avmd/AVMD_System/ops/scripts/vps-deploy-gate.sh"
```

Expected: `Deploy concluido com gate.` no final, sem erros de build.

- [ ] **Step 4: Smoke test de saúde**

```bash
ssh root@147.79.111.76 "curl -fsS http://127.0.0.1:8787/healthz; curl -sS -o /dev/null -w 'public:%{http_code}\n' https://api.certiid.mantovan.com.br/healthz"
```

Expected: `{"ok":true,...}` e `public:200`.

- [ ] **Step 5: Validação manual na UI**

Pedir para o usuário (ou o próprio agente, se tiver acesso à sessão logada): abrir a lista de Vendas em `Comercial`, confirmar que a venda existente (pedido 18000) aparece com "Em Aberto" na nova coluna Pagamento, mudar para "Pago" e conferir no modal Financeiro dessa venda que passa a mostrar "Pago" (em vez de "Pendente"). Mudar de volta para "Recusado" e conferir que o modal Financeiro volta a mostrar "Pendente".

- [ ] **Step 6: Confirmar a coluna nova direto no banco (opcional, mas recomendado)**

```bash
ssh root@147.79.111.76 "cd /opt/avmd/AVMD_System && source backend/.env.local 2>/dev/null; psql \"\$DATABASE_URL\" -c \"select pedido_numero, status_pagamento, pago from vendas_certificados;\""
```

Expected: a venda de pedido 18000 aparece com o `status_pagamento` mais recente escolhido no passo 5, e `pago` consistente com ele (`true` só quando `status_pagamento = 'pago'`).
