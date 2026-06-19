# 25 - Aiven conectado e schema do checkout aplicado

## Data
- 2026-06-19

## Status
- Conexao com Aiven PostgreSQL validada.
- Banco respondeu como PostgreSQL 17.10.
- Schema minimo do checkout aplicado no Aiven.
- Seed inicial aplicado com dados recuperaveis do backup local.
- Backend local validado contra o banco Aiven real.

## Arquivos criados/alterados
- `backend/src/config/env.ts`
  - passou a carregar `backend/.env.local` quando existir.
- `backend/.env.local`
  - arquivo local com `DATABASE_URL`, ignorado pelo Git pelo padrao `*.local`.
- `backend/sql/001_checkout_schema.sql`
  - schema inicial do checkout e entidades relacionadas.
- `backend/sql/seedCheckoutData.mjs`
  - seed inicial a partir de backups JSON e dados operacionais minimos.

## Tabelas criadas no Aiven
- `profiles`
- `app_settings`
- `certificados`
- `formas_pagamento_v2`
- `pontos_atendimento`
- `tabelas_preco`
- `tabelas_preco_itens`
- `lojas_marketplace`
- `agentes_tabelas_preco`
- `parceiros_agentes_permitidos`
- `agentes_disponibilidade`
- `agentes_indisponibilidades`
- `cadastros_base`
- `titulares_certificado`
- `vendas_certificados`
- `agendamentos_validacao`

## Seed aplicado
- `app_settings`: 6 registros
- `certificados`: 156 registros
- `formas_pagamento_v2`: 3 registros
- `tabelas_preco`: 1 registro
- `tabelas_preco_itens`: 58 registros
- `lojas_marketplace`: 1 registro com slug `avmd`

## Validacao de API
Endpoint testado:
- `POST http://localhost:8787/api/checkout/context`

Resultado:
- `ok: true`
- loja carregada: `AVMD Certificacao Digital`
- produtos: 58
- pagamentos: 3
- agentes/pontos/slots: 0, porque ainda nao existem agentes e disponibilidade cadastrados no Aiven.

## Validacao de submit
Endpoint testado:
- `POST http://localhost:8787/api/checkout/submit`

Resultado:
- pedido teste criado com sucesso
- gravou:
  - 1 `cadastros_base`
  - 1 `titulares_certificado`
  - 1 `vendas_certificados`
  - 0 `agendamentos_validacao`, pois o teste foi sem slot

## Observacao de seguranca
- Nao versionar `backend/.env.local`.
- Nao colocar credenciais do Aiven ou API Token em documentacao publica, GitHub ou canais abertos.
- A conexao esta funcionando localmente com SSL via cliente `pg`.
- Para endurecimento posterior, baixar o CA certificate no console do Aiven e trocar `rejectUnauthorized: false` por validacao com CA.

## Proximos passos
1. Cadastrar agentes, pontos de atendimento e disponibilidades reais no Aiven.
2. Testar checkout com agendamento real.
3. Apontar frontend para `VITE_API_BASE_URL=http://localhost:8787/api` e `VITE_USE_LEGACY_SUPABASE=false` em ambiente local.
4. Preparar deploy do backend em ambiente seguro.
