# Pedido Automático e Protocolo Vinculado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo pedido (venda) criado no sistema recebe automaticamente um `pedido_numero` sequencial e numérico (a partir de 30000), e o diálogo de "Gerar Protocolo" passa a vir pré-preenchido e editável com os dados do pedido, gravando o protocolo com um número sequencial próprio (`protocolo_numero_seq`) gerado no backend.

**Architecture:** `pedido_numero` vira `default` de coluna no Postgres via `sequence`, então qualquer insert em `vendas_certificados` ganha o número automaticamente sem tocar em cada rota de criação. `protocolo_numero` passa a ser gerado no backend (não mais no frontend com timestamp), dentro do mesmo endpoint que já existe (`PATCH /api/comercial/vendas/:id/titular`), que também passa a persistir `api_payload_protocolo` de verdade (hoje esse campo chega no backend e é silenciosamente descartado). Nenhuma chamada à API real da SafeWeb é feita nesta etapa — ver spec para o ponto de integração futura.

**Tech Stack:** PostgreSQL (Aiven), Node/TypeScript (backend próprio, sem framework), React + TypeScript (Vite), `npm run db:apply-sql` (runner de migração já existente no projeto).

**Spec de referência:** `docs/superpowers/specs/2026-07-02-pedido-protocolo-design.md`

---

## Notas gerais

- Este projeto não tem suite de testes configurada (`CLAUDE.md`). A validação de cada tarefa é `npm run lint`, `npm run build`, `npm run build:backend` e, quando aplicável, um script de smoke test rodado contra o banco Aiven real (mesmo padrão de `scripts/smoke-n8n-event.mjs`).
- Migrações SQL são aplicadas com `npm run db:apply-sql -- <arquivo>` (lê `DATABASE_URL` de `backend/.env.local`, registra em `avmd_sql_migrations`, é idempotente por checksum).
- Siga a regra operacional do usuário: ao final de cada tarefa, comitar. Push e deploy só ao final de todo o plano (ou quando o usuário pedir), não a cada tarefa.

---

### Task 1: Migração SQL — sequences de pedido e protocolo

**Files:**
- Create: `backend/sql/028_pedido_protocolo_sequences.sql`

- [ ] **Step 1: Escrever o arquivo de migração**

```sql
-- 028_pedido_protocolo_sequences.sql
-- Numeracao automatica de pedido_numero (default de coluna) e sequence
-- dedicada para protocolo_numero (gerado explicitamente pelo backend).

create sequence if not exists pedido_numero_seq start with 30000;

alter table vendas_certificados
  alter column pedido_numero set default nextval('pedido_numero_seq')::text;

create unique index if not exists idx_vendas_certificados_pedido_numero_unique
  on vendas_certificados (pedido_numero)
  where pedido_numero is not null;

create sequence if not exists protocolo_numero_seq start with 1;

create unique index if not exists idx_vendas_certificados_protocolo_numero_unique
  on vendas_certificados (protocolo_numero)
  where protocolo_numero is not null;
```

- [ ] **Step 2: Validar a migração sem aplicar (dry-run)**

Run: `npm run db:apply-sql:dry-run -- backend/sql/028_pedido_protocolo_sequences.sql`

Expected: JSON com `"ok": true` e `"dryRun": true` (sem erro de sintaxe SQL).

- [ ] **Step 3: Aplicar a migração no banco Aiven real**

Run: `npm run db:apply-sql -- backend/sql/028_pedido_protocolo_sequences.sql`

Expected: JSON com `"ok": true` e `"applied": true`.

- [ ] **Step 4: Commit**

```bash
git add backend/sql/028_pedido_protocolo_sequences.sql
git commit -m "feat: adiciona sequences de pedido_numero e protocolo_numero"
```

---

### Task 2: Backend — gerar protocolo_numero no servidor e persistir api_payload_protocolo

**Files:**
- Modify: `backend/src/repositories/catalogRepository.ts:475-480`
- Modify: `backend/src/routes/catalogRoutes.ts:351-357`

Hoje `updateVendaTitular` recebe `protocolo_numero` pronto do cliente (gerado no frontend com timestamp) e a rota lê `body.protocolo_status`, `body.pedido_status` e `body.api_payload_protocolo` do payload mas nunca os repassa ao repositório — esses campos são descartados silenciosamente. Esta tarefa corrige isso: o backend passa a gerar `protocolo_numero` a partir de `protocolo_numero_seq` (Task 1) e a gravar `api_payload_protocolo` de verdade.

- [ ] **Step 1: Trocar a assinatura e o corpo de `updateVendaTitular`**

Em `backend/src/repositories/catalogRepository.ts`, localizar:

```ts
  // ── Vendas extra ──────────────────────────────────────────────────────
  async updateVendaTitular(id: string, titular_id: string, protocolo_numero: string) {
    await this.db.query(
      `update vendas_certificados set titular_id = $2::uuid, protocolo_numero = $3, protocolo_status = 'gerado', updated_at = now() where id = $1::uuid`,
      [id, titular_id, protocolo_numero]
    )
  }
```

Substituir por:

```ts
  // ── Vendas extra ──────────────────────────────────────────────────────
  async updateVendaTitular(id: string, titular_id: string, api_payload_protocolo: Record<string, unknown>) {
    const r = await this.db.query<{ protocolo_numero: string }>(
      `update vendas_certificados
       set titular_id = $2::uuid,
           protocolo_numero = coalesce(protocolo_numero, nextval('protocolo_numero_seq')::text),
           protocolo_status = 'gerado',
           pedido_status = 'gerado',
           api_payload_protocolo = $3::jsonb,
           updated_at = now()
       where id = $1::uuid
       returning protocolo_numero`,
      [id, titular_id, JSON.stringify(api_payload_protocolo)]
    )
    return r.rows[0]
  }
```

Nota: `coalesce(protocolo_numero, ...)` torna a operação idempotente — se a venda já tiver protocolo (chamada repetida), o número existente é mantido em vez de consumir um novo valor da sequence.

- [ ] **Step 2: Atualizar a rota para repassar `api_payload_protocolo` e devolver o número gerado**

Em `backend/src/routes/catalogRoutes.ts`, localizar:

```ts
  // ── Vendas extras ─────────────────────────────────────────────────────
  const vendaTitularMatch = url.match(/^\/api\/comercial\/vendas\/([^/]+)\/titular$/)
  if (method === 'PATCH' && vendaTitularMatch) {
    const body = await readJson<{ titular_id: string; protocolo_numero: string }>(req)
    await repo.updateVendaTitular(vendaTitularMatch[1], body.titular_id, body.protocolo_numero)
    writeJson(res, 200, { ok: true }, corsOrigin)
    return true
  }
```

Substituir por:

```ts
  // ── Vendas extras ─────────────────────────────────────────────────────
  const vendaTitularMatch = url.match(/^\/api\/comercial\/vendas\/([^/]+)\/titular$/)
  if (method === 'PATCH' && vendaTitularMatch) {
    const body = await readJson<{ titular_id: string; api_payload_protocolo?: Record<string, unknown> }>(req)
    const venda = await repo.updateVendaTitular(vendaTitularMatch[1], body.titular_id, body.api_payload_protocolo ?? {})
    writeJson(res, 200, { ok: true, protocolo_numero: venda.protocolo_numero }, corsOrigin)
    return true
  }
```

- [ ] **Step 3: Compilar o backend**

Run: `npm run build:backend`

Expected: build finaliza sem erros de TypeScript.

- [ ] **Step 4: Commit**

```bash
git add backend/src/repositories/catalogRepository.ts backend/src/routes/catalogRoutes.ts
git commit -m "fix: gera protocolo_numero no backend e persiste api_payload_protocolo"
```

---

### Task 3: Smoke test — validar sequences e idempotência contra o Aiven real

**Files:**
- Create: `scripts/smoke-pedido-protocolo.mjs`

- [ ] **Step 1: Escrever o script**

```js
import { createAivenSqlClient } from '../backend/dist/db/aivenClient.js'
import { CatalogRepository } from '../backend/dist/repositories/catalogRepository.js'

const db = createAivenSqlClient()
const repo = new CatalogRepository(db)

const cadastro = await db.query('select id from cadastros_base limit 1')
const ponto = await db.query('select id from pontos_atendimento limit 1')
const titular = await db.query('select id from titulares_certificado limit 1')

if (!cadastro.rows[0] || !ponto.rows[0] || !titular.rows[0]) {
  console.error(JSON.stringify({
    ok: false,
    message: 'Smoke test precisa de pelo menos 1 registro existente em cadastros_base, pontos_atendimento e titulares_certificado.',
  }, null, 2))
  process.exit(1)
}

const cadastroBaseId = cadastro.rows[0].id
const pontoAtendimentoId = ponto.rows[0].id
const titularId = titular.rows[0].id

const criadas = []
try {
  const venda1 = await repo.createVenda({
    cadastro_base_id: cadastroBaseId,
    ponto_atendimento_id: pontoAtendimentoId,
    tipo_produto: 'smoke-test-pedido-protocolo',
    status_venda: 'rascunho',
    pago: false,
  })
  criadas.push(venda1.id)

  const venda2 = await repo.createVenda({
    cadastro_base_id: cadastroBaseId,
    ponto_atendimento_id: pontoAtendimentoId,
    tipo_produto: 'smoke-test-pedido-protocolo',
    status_venda: 'rascunho',
    pago: false,
  })
  criadas.push(venda2.id)

  const primeiraGeracao = await repo.updateVendaTitular(venda1.id, titularId, { origem: 'smoke_test', tentativa: 1 })
  const segundaGeracao = await repo.updateVendaTitular(venda1.id, titularId, { origem: 'smoke_test', tentativa: 2 })

  console.log(JSON.stringify({
    ok: true,
    pedido_numero_venda_1: venda1.pedido_numero,
    pedido_numero_venda_2: venda2.pedido_numero,
    pedidos_diferentes_e_numericos:
      venda1.pedido_numero !== venda2.pedido_numero
      && /^\d+$/.test(String(venda1.pedido_numero))
      && /^\d+$/.test(String(venda2.pedido_numero)),
    protocolo_numero_gerado: primeiraGeracao.protocolo_numero,
    protocolo_numero_idempotente: primeiraGeracao.protocolo_numero === segundaGeracao.protocolo_numero,
  }, null, 2))
} finally {
  for (const id of criadas) {
    await db.query('delete from vendas_certificados where id = $1::uuid', [id])
  }
}
```

- [ ] **Step 2: Garantir que o dist do backend está atualizado**

Run: `npm run build:backend`

Expected: build finaliza sem erros (necessário porque o script importa de `backend/dist/...`).

- [ ] **Step 3: Rodar o smoke test contra o Aiven real**

Run: `node scripts/smoke-pedido-protocolo.mjs`

Expected: JSON de saída com `"ok": true`, `"pedidos_diferentes_e_numericos": true` e `"protocolo_numero_idempotente": true`. Se `"ok": false`, verificar a mensagem — provavelmente falta algum registro base (`cadastros_base`, `pontos_atendimento` ou `titulares_certificado`) no ambiente sendo testado.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-pedido-protocolo.mjs
git commit -m "test: adiciona smoke test para pedido_numero e protocolo_numero"
```

---

### Task 4: Frontend — parar de enviar pedido_numero nulo na criação da venda

**Files:**
- Modify: `src/pages/Comercial.tsx:1426`

- [ ] **Step 1: Remover a linha que zera `pedido_numero` no payload de criação**

Localizar dentro do payload de criação de venda (função em torno da linha 1391):

```ts
      pedido_numero:           null,
      pedido_status:           'nao_gerado',
```

Substituir por (mantém só `pedido_status`, remove `pedido_numero`):

```ts
      pedido_status:           'nao_gerado',
```

- [ ] **Step 2: Rodar lint e build do frontend**

Run: `npm run lint`
Run: `npm run build`

Expected: ambos concluem sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Comercial.tsx
git commit -m "fix: nao envia pedido_numero nulo na criacao da venda"
```

---

### Task 5: Frontend — pré-preencher o diálogo de protocolo com os dados do pedido

**Files:**
- Modify: `src/pages/Comercial.tsx:3601-3608`

- [ ] **Step 1: Adicionar helper para separar DDD e telefone**

Logo acima da função `abrirProtocolo` (por volta da linha 3600), adicionar:

```ts
  function splitDddTelefone(raw: string | null | undefined): [string, string] {
    const digits = (raw ?? '').replace(/\D/g, '')
    if (!digits) return ['', '']
    return [digits.slice(0, 2), digits.slice(2)]
  }

```

- [ ] **Step 2: Pré-preencher `formProtocolo` com os dados de faturamento da venda**

Localizar:

```ts
  function abrirProtocolo(v: VendaRow) {
    if (v.protocolo_numero) { showMsg('Esta venda já possui protocolo: ' + v.protocolo_numero); return }
    const cpfComprador = (v.cadastros_base as { cpf_cnpj?: string } | null)?.cpf_cnpj ?? ''
    setProtocoloVenda(v)
    setFormProtocolo({ ...EMPTY_PROTOCOLO, cpf: cpfComprador })
    setProtocoloStep('validate')
    setShowProtocolo(true)
  }
```

Substituir por:

```ts
  function abrirProtocolo(v: VendaRow) {
    if (v.protocolo_numero) { showMsg('Esta venda já possui protocolo: ' + v.protocolo_numero); return }
    const cpfComprador = (v.cadastros_base as { cpf_cnpj?: string } | null)?.cpf_cnpj ?? ''
    const [dddFaturamento, telefoneFaturamento] = splitDddTelefone(v.telefone_faturamento)
    setProtocoloVenda(v)
    setFormProtocolo({
      ...EMPTY_PROTOCOLO,
      cpf: v.documento_faturamento ?? cpfComprador,
      nome: v.nome_faturamento ?? '',
      email: v.email_faturamento ?? '',
      ddd: dddFaturamento,
      telefone: telefoneFaturamento,
      cep: v.cep ?? '',
      logradouro: v.logradouro ?? '',
      numero: v.numero ?? '',
      complemento: v.complemento ?? '',
      bairro: v.bairro ?? '',
      cidade: v.cidade ?? '',
      uf: v.uf ?? '',
    })
    setProtocoloStep('validate')
    setShowProtocolo(true)
  }
```

Todos os campos continuam editáveis no diálogo (nenhuma mudança de UI é necessária além do valor inicial) — se `validarTitular` encontrar um titular já cadastrado para o CPF, ele sobrescreve nome/email/telefone como já acontece hoje ([Comercial.tsx:3610-3629](../../../src/pages/Comercial.tsx#L3610-L3629), sem alteração nesta tarefa).

- [ ] **Step 3: Rodar lint e build do frontend**

Run: `npm run lint`
Run: `npm run build`

Expected: ambos concluem sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Comercial.tsx
git commit -m "feat: pre-preenche dialogo de protocolo com dados do pedido"
```

---

### Task 6: Frontend — usar o protocolo_numero devolvido pelo backend

**Files:**
- Modify: `src/pages/Comercial.tsx:3631-3696`

- [ ] **Step 1: Trocar a geração local de `proto` pelo valor devolvido pela API**

Localizar dentro de `confirmarProtocolo`:

```ts
    // Busca link_safeweb da tabela
    const item = protocoloVenda.tabela_preco_item_id
      ? tabelaItens.find(i => i.id === protocoloVenda.tabela_preco_item_id)
      : null

    // Atualiza a venda com o titular e gera número de protocolo temporário
    const proto = `PROT${Date.now().toString().slice(-8)}`
    const rVenda = await fetch(getApiUrl(`/comercial/vendas/${protocoloVenda.id}/titular`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titular_id: titularData.id,
        protocolo_numero: proto,
        protocolo_status: 'gerado',
        pedido_status: 'gerado',
        api_payload_protocolo: { link_safeweb: item?.link_safeweb ?? null, dados_titular: formProtocolo },
      }),
    })

    setEmitindoProtocolo(false)
    if (!rVenda.ok) { showMsg('Erro ao atualizar venda'); return }

    if (item?.link_safeweb) {
      // Abre o link da Safeweb em nova aba
      window.open(item.link_safeweb, '_blank')
    }

    setShowProtocolo(false)
    setVendasV2(prev => prev.map(r =>
      r.id === protocoloVenda.id ? { ...r, protocolo_numero: proto, protocolo_status: 'gerado' } : r
    ))
    showMsg(`Protocolo ${proto} emitido. Titular cadastrado.`, 'ok')
  }
```

Substituir por:

```ts
    // Busca link_safeweb da tabela
    const item = protocoloVenda.tabela_preco_item_id
      ? tabelaItens.find(i => i.id === protocoloVenda.tabela_preco_item_id)
      : null

    // Atualiza a venda com o titular; o backend gera o número de protocolo
    const rVenda = await fetch(getApiUrl(`/comercial/vendas/${protocoloVenda.id}/titular`), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titular_id: titularData.id,
        api_payload_protocolo: {
          link_safeweb: item?.link_safeweb ?? null,
          dados_titular: formProtocolo,
          pedido_numero: protocoloVenda.pedido_numero,
        },
      }),
    })

    setEmitindoProtocolo(false)
    if (!rVenda.ok) { showMsg('Erro ao atualizar venda'); return }
    const { protocolo_numero: proto } = await rVenda.json() as { protocolo_numero: string }

    if (item?.link_safeweb) {
      // Abre o link da Safeweb em nova aba
      window.open(item.link_safeweb, '_blank')
    }

    setShowProtocolo(false)
    setVendasV2(prev => prev.map(r =>
      r.id === protocoloVenda.id ? { ...r, protocolo_numero: proto, protocolo_status: 'gerado' } : r
    ))
    showMsg(`Protocolo ${proto} emitido. Titular cadastrado.`, 'ok')
  }
```

- [ ] **Step 2: Rodar lint e build do frontend**

Run: `npm run lint`
Run: `npm run build`

Expected: ambos concluem sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Comercial.tsx
git commit -m "feat: usa protocolo_numero gerado pelo backend no dialogo de protocolo"
```

---

### Task 7: Verificação manual end-to-end

**Files:** nenhum (verificação, sem código)

- [ ] **Step 1: Subir o backend e o frontend localmente**

Run: `npm run build:backend && npm run start:backend` (em um terminal)
Run: `npm run dev` (em outro terminal)

- [ ] **Step 2: Criar uma venda de teste no Comercial**

No navegador, ir em Comercial → Vendas → lançar uma nova venda de teste (produto/tabela/forma de pagamento quaisquer).

Expected: a venda aparece na lista com um `pedido_numero` numérico ≥ 30000 preenchido na coluna "Pedido" (antes desta mudança, aparecia `—`).

- [ ] **Step 3: Gerar o protocolo dessa venda**

Clicar em "Gerar Protocolo" na venda criada.

Expected: o diálogo abre com CPF/CNPJ, nome, e-mail, telefone e endereço já pré-preenchidos com os dados de faturamento da venda (não em branco). Editar algum campo (ex.: trocar o CPF) para confirmar que continua editável, depois confirmar.

- [ ] **Step 4: Confirmar o protocolo gerado**

Expected: mensagem de sucesso mostra um número de protocolo sequencial (ex. `1`, `2`, ...), a coluna "Protocolo" na lista de vendas atualiza com esse número, e o link da SafeWeb abre em nova aba (se a tabela de preço tiver `link_safeweb` configurado).

- [ ] **Step 5: Confirmar que reabrir a mesma venda não gera novo protocolo**

Tentar clicar em "Gerar Protocolo" de novo na mesma venda.

Expected: mensagem "Esta venda já possui protocolo: <numero>" (comportamento já existente, sem alteração).
