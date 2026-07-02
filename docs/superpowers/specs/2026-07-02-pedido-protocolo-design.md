# Pedido automático e protocolo vinculado — Design

Data: 2026-07-02
Módulo: Comercial (`src/pages/Comercial.tsx`, `backend/src/repositories/catalogRepository.ts`, `backend/sql/`)

## Contexto

A tabela `vendas_certificados` já tem campos para `pedido_numero`, `pedido_status`, `protocolo_numero`, `protocolo_status`, `api_payload_pedido` e `api_payload_protocolo`, mas hoje eles funcionam como placeholders:

- `pedido_numero` nunca é preenchido (fica sempre `null`); só `pedido_status` muda para `'gerado'` como efeito colateral de gerar o protocolo.
- `protocolo_numero` é gerado no frontend com `PROT${Date.now().toString().slice(-8)}` (função `confirmarProtocolo`, [Comercial.tsx:3671](../../../src/pages/Comercial.tsx#L3671)), sem nenhuma integração real.
- O botão "Gerar Protocolo" abre o `link_safeweb` (link do portal da SafeWeb) em nova aba para o operador terminar manualmente lá fora ([Comercial.tsx:3686](../../../src/pages/Comercial.tsx#L3686)).
- Não existe hoje nenhuma chamada real à API da SafeWeb no repositório (nem endpoint, nem credenciais documentadas).

O projeto segue uma regra arquitetural registrada em `claude/29-ponto-de-salvamento-comercial-aiven-integracoes.md` e `claude/33-ponto-de-salvamento-processador-eventos-n8n.md`: módulos não devem chamar integrações externas diretamente — a comunicação deve passar pela camada de `integration_events` + adapters (hoje só existem adapters de N8N e Evolution). Este design **não** implementa a integração real com a SafeWeb; prepara o fluxo interno para que essa integração entre depois, isolada, sem precisar alterar o restante do fluxo do Comercial.

## Objetivo

1. Todo pedido (venda) criado no sistema recebe automaticamente um número de pedido sequencial e numérico, sem nenhuma ação manual, para rastrear o processo desde o início.
2. Gerar o protocolo continua sendo uma ação manual do operador, mas o diálogo passa a vir pré-preenchido com os dados do pedido (faturamento) — e continua totalmente editável, porque o titular do certificado pode ter CPF/CNPJ diferente de quem pagou o pedido.
3. O protocolo passa a usar também um número sequencial e numérico (interno), em vez do timestamp atual, como identificador de rastreio enquanto a integração real com a API da SafeWeb não existe.

## Fora de escopo

- Chamada real à API da SafeWeb (sem endpoint/credenciais disponíveis nesta etapa). O ponto de integração fica isolado e substituível depois.
- Mudança de semântica dos campos `pedido_status` / `protocolo_status` (mantêm o comportamento atual).
- Backfill de `pedido_numero` para vendas já existentes — só vendas novas, criadas a partir desta mudança, recebem número.
- Qualquer tela nova de "Pedidos" separada da lista de vendas do Comercial.

## Modelo de dados

Nova migração em `backend/sql/` (próximo número sequencial da pasta):

```sql
-- Sequence para pedido_numero, começando em 30000
create sequence if not exists pedido_numero_seq start with 30000;

alter table vendas_certificados
  alter column pedido_numero set default nextval('pedido_numero_seq')::text;

create unique index if not exists idx_vendas_certificados_pedido_numero_unique
  on vendas_certificados (pedido_numero)
  where pedido_numero is not null;

-- Sequence para protocolo_numero, começando em 1 (uso explícito, não é default de coluna)
create sequence if not exists protocolo_numero_seq start with 1;

create unique index if not exists idx_vendas_certificados_protocolo_numero_unique
  on vendas_certificados (protocolo_numero)
  where protocolo_numero is not null;
```

Notas:

- `pedido_numero` vira `default` de coluna: **qualquer** insert em `vendas_certificados` (venda manual no Comercial, checkout público por link em `aivenCheckoutRepository.createCheckoutSale`, etc.) ganha o número automaticamente, sem precisar alterar cada rota de criação individualmente.
- Importante: se algum insert passar `pedido_numero: null` explicitamente na lista de colunas, o Postgres grava `NULL` e **ignora o default**. Por isso a criação de venda em `Comercial.tsx` deixa de enviar esse campo (ver seção seguinte).
- `protocolo_numero_seq` é usado explicitamente dentro de `confirmarProtocolo` (backend), não como default de coluna, porque continua sendo um passo manual e opcional.
- Linhas já existentes na tabela não são alteradas; o índice único usa `where pedido_numero is not null` para não quebrar com os `null`s históricos.

## Fluxo 1 — Criação do pedido (automática)

Sem tela nova. Ajustes:

- Em [Comercial.tsx:1426](../../../src/pages/Comercial.tsx#L1426), remover a linha `pedido_numero: null` do payload enviado para `saveAivenCommercialSale` — o valor deve vir do banco, não do cliente.
- `backend/src/repositories/catalogRepository.ts` (`createVenda`, linha ~479): confirmar que `pedido_numero` não está no array `fields` (não está hoje), então o insert nunca tenta gravar `null` explícito nessa coluna — o default do banco assume.
- `pedido_status` continua sendo enviado como está hoje (`'nao_gerado'` no Comercial, `'pendente'` no checkout público) — este design não muda a semântica desse campo, só garante que o número sempre existe.
- Nenhuma alteração de UI é necessária para exibir o número: as colunas/labels que já mostram `pedido_numero` (ex. [Comercial.tsx:4270](../../../src/pages/Comercial.tsx#L4270), [Comercial.tsx:6164](../../../src/pages/Comercial.tsx#L6164)) passam a mostrar o valor real em vez de `—`.

## Fluxo 2 — Geração do protocolo (manual, dialog editável)

Em [Comercial.tsx:3601](../../../src/pages/Comercial.tsx#L3601) (`abrirProtocolo`):

- Pré-preencher `formProtocolo` com os dados de faturamento da própria venda (`documento_faturamento` → `cpf`, `nome_faturamento` → `nome`, `email_faturamento` → `email`, `telefone_faturamento` → `ddd`/`telefone`, `logradouro`, `numero`, `complemento`, `bairro`, `cidade`, `uf`, `cep`), não só o CPF como hoje.
- Se existir um titular já cadastrado para esse CPF em `titulares_certificado` (fluxo atual de `validarTitular`), os dados do titular sobrescrevem os dados de faturamento pré-preenchidos — o cadastro específico do titular tem prioridade sobre o dado herdado do pedido.
- Todos os campos do diálogo continuam editáveis, cobrindo o caso em que o titular do certificado é uma pessoa/CNPJ diferente de quem pagou o pedido.
- Exibir o `pedido_numero` da venda no topo do diálogo, somente leitura, como referência de rastreio.

Em `confirmarProtocolo` ([Comercial.tsx:3631](../../../src/pages/Comercial.tsx#L3631)):

- O frontend deixa de gerar `protocolo_numero` no cliente (`PROT${Date.now()...}` é removido) e para de enviar esse campo no corpo da requisição.
- `PATCH /api/comercial/vendas/:id/titular` (rota já existente) passa a gerar o `protocolo_numero` no backend via `nextval('protocolo_numero_seq')::text` sempre que a venda ainda não tiver protocolo, ignorando qualquer valor vindo do cliente para esse campo, e devolve o número gerado na resposta. O frontend usa o valor retornado para atualizar `vendasV2` e a mensagem de confirmação (hoje mostrada com a variável local `proto`).
- Gravar em `api_payload_protocolo` os dados finais do titular (como hoje) **mais** o `pedido_numero` de origem, para manter rastreável a relação pedido → protocolo mesmo quando os dados do titular tiverem sido editados/diferentes dos dados do pedido.
- O comportamento de abrir `link_safeweb` em nova aba é mantido sem alteração.

## Fluxo 3 — Ponto de integração futura com a SafeWeb

Não implementado nesta etapa. Quando a API da SafeWeb estiver disponível (endpoint, autenticação e contrato definidos):

- A geração de `protocolo_numero` deixa de vir da sequence interna e passa a vir da resposta da API.
- Seguindo o padrão já estabelecido em `claude/29` e `claude/33`, a chamada deve entrar como um evento em `integration_events` (`domain = fiscal` ou novo domínio `certificadora`) processado por um adapter novo (`safewebAdapter.ts`), e não como chamada direta do Comercial à SafeWeb.
- Essa troca é isolada ao passo "gerar protocolo" — o fluxo de pedido automático e o diálogo editável não precisam mudar.

## Erros e casos de borda

- **Corrida na geração do pedido**: como o número vem de uma `sequence` do Postgres, não há condição de corrida entre vendas simultâneas — cada insert recebe um `nextval()` único e atômico.
- **Protocolo já existe**: `abrirProtocolo` já bloqueia reabrir o diálogo se `v.protocolo_numero` estiver preenchido ([Comercial.tsx:3602](../../../src/pages/Comercial.tsx#L3602)); comportamento mantido.
- **Titular sem CPF localizado**: se `validarTitular` não encontrar titular cadastrado, os campos continuam com os dados herdados do pedido (em vez de ficarem em branco como hoje), reduzindo digitação manual no caso comum onde titular = comprador.
- **Migração aplicada em produção com vendas antigas**: índice único usa `where pedido_numero is not null`, então vendas antigas sem número não conflitam nem quebram a constraint.

## Critérios de aceite

- Toda venda nova criada pelo Comercial ou pelo checkout público recebe `pedido_numero` numérico sequencial automaticamente, sem ação manual.
- O diálogo de "Gerar Protocolo" vem pré-preenchido com os dados de faturamento do pedido (ou do titular já cadastrado, se existir), e permite editar todos os campos antes de confirmar.
- Ao confirmar, o protocolo recebe um número sequencial e numérico próprio, distinto do pedido, e o vínculo entre os dois (`pedido_numero` de origem) fica registrado em `api_payload_protocolo`.
- Nenhuma chamada real à SafeWeb é feita nesta etapa; o comportamento de abrir `link_safeweb` continua igual.
