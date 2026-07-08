# Status de Pagamento da Venda

## Contexto

A lista de Vendas (`Comercial.tsx`) hoje tem um `status_venda` (Não Confirmada/Vendida/Agendada/Em Validação/Emitida/Cancelada), que descreve o ciclo de vida da venda em si, e um booleano `pago` sem estado intermediário — não dá pra distinguir "aguardando pagamento" de "pagamento recusado", os dois aparecem como "não pago".

Já existe uma integração parcial com gateway de pagamento (Safe2Pay, em `backend/src/services/checkoutPaymentService.ts` e `backend/src/repositories/aivenCheckoutRepository.ts`), usada hoje só pelo fluxo de checkout público/self-service (não pelo wizard interno "Nova Venda" que os operadores usam em `Comercial.tsx`). Essa integração já normaliza status de cobrança em `paid`/`failed`/`pending` e grava o resultado do webhook em `vendas_certificados`.

## Objetivo

Dar visibilidade e controle manual de um status de pagamento de 3 estados em qualquer venda, e deixar o ponto de integração com gateway já preparado para popular esse mesmo campo quando (numa entrega futura) o wizard interno for conectado a um gateway real.

## Modelo de dados

Nova coluna em `vendas_certificados`:

```sql
status_pagamento text not null default 'em_aberto'
  check (status_pagamento in ('em_aberto', 'pago', 'recusado'))
```

Toda venda nova nasce com `status_pagamento = 'em_aberto'` (nenhuma mudança necessária no payload do wizard — o default do banco cobre tanto a criação via `catalogRepository.createVenda` quanto a criação via `aivenCheckoutRepository` do checkout público).

### Sincronia com o campo `pago` existente

O booleano `pago` continua existindo e sendo lido por automações já em produção (disparo de comunicação em `podeDispararAutomacaoPorMudanca`, modal Financeiro). Para não precisar tocar nesses pontos, um trigger de banco mantém `pago` sincronizado sempre que `status_pagamento` muda:

- `status_pagamento = 'pago'` → `pago = true`, `data_pagamento = now()` (só se ainda não tinha data)
- `status_pagamento in ('em_aberto', 'recusado')` → `pago = false`

O trigger só ajusta `pago`/`data_pagamento` quando `status_pagamento` efetivamente muda (evita sobrescrever `data_pagamento` em updates não relacionados).

## Endpoint de atualização

Novo endpoint `POST /api/comercial/vendas/pagamento`, espelhando o já existente `/api/comercial/vendas/status`:

- Request: `{ id: string, status: 'em_aberto' | 'pago' | 'recusado' }`
- Repository: `updateVendaPaymentStatusById(id, status)` — `update vendas_certificados set status_pagamento = $2, updated_at = now() where id = $1`
- O trigger cuida da sincronia com `pago` automaticamente.

## Frontend

- Nova coluna "Pagamento" na tabela de Vendas ([Comercial.tsx](../../../src/pages/Comercial.tsx)), com um `<select>` no mesmo padrão visual do "Status Venda" existente (badge colorido, editável por clique): âmbar para "Em Aberto", verde para "Pago", vermelho para "Recusado".
- Nova função `atualizarStatusPagamentoV2(id, status)`, espelhando `atualizarStatusVendaV2`, chamando `updateAivenCommercialSalePaymentStatus` (novo helper em `src/lib/commercialAiven.ts`).
- Tipo `VendaCertificado`/`VendaRow` ganha o campo `status_pagamento: 'em_aberto' | 'pago' | 'recusado'`.

## Preparação para gateway (sem ligar agora)

`aivenCheckoutRepository.applyPaymentWebhook` (usado pelo checkout público) passa a também escrever `status_pagamento` de acordo com o resultado normalizado do gateway:

- `paid = true` → `status_pagamento = 'pago'`
- status normalizado `failed` → `status_pagamento = 'recusado'`
- caso contrário → mantém o valor atual (não regride um pagamento já confirmado)

O wizard "Nova Venda" (uso interno) **não** é conectado ao gateway nesta entrega — o operador continua ajustando o status manualmente. A conexão do wizard ao Safe2Pay fica para quando as formas de pagamento com gateway estiverem ativas e testadas (hoje só existe uma forma de pagamento com gateway cadastrada, "Pix", e está inativa).

## Casos de borda

- Mudar `status_pagamento` manualmente para `pago` também marca `pago = true` e preenche `data_pagamento` se ainda vazio — dispara as mesmas automações que já reagem à mudança de `pago` hoje.
- Mudar de `pago` para `recusado` ou `em_aberto` zera `pago` de volta para `false`, mas **não apaga** `data_pagamento` (mantém o histórico de quando foi pago da primeira vez, evitando perda de rastro por um ajuste manual posterior).
- A venda de teste já existente (pedido 18000) fica com `status_pagamento = 'em_aberto'` por padrão — cabe ao usuário ajustar manualmente se já foi paga.

## Validação

Sem suite de testes automatizada (conforme `CLAUDE.md`). Validação manual: criar uma venda nova e conferir que nasce "Em Aberto"; mudar pra "Pago" e conferir que o modal Financeiro passa a mostrar "Pago" e que a automação de comunicação (se configurada) dispara; mudar de volta pra "Recusado" e conferir que o modal Financeiro volta a mostrar "Pendente".
