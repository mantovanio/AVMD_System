# 23-status-retomada-backend-aiven.md

## Data
- 2026-06-19

## Status consolidado
- Frontend Vite/React segue funcional com `npm run build` validado.
- Backend de checkout Aiven segue funcional em nivel de compilacao com `npm run build:backend` validado.
- A arquitetura atual ja separa o fluxo de checkout em contrato, service, repositorio e cliente SQL.
- O projeto ainda nao esta conectado ao banco Aiven real porque a `DATABASE_URL` nao foi configurada neste ambiente.

## O que foi concluido nesta retomada
- Corrigida a tipagem do cliente PostgreSQL em `backend/src/db/aivenClient.ts` para uso real com `pg`.
- Corrigido o fluxo de agendamento em `backend/src/repositories/aivenCheckoutRepository.ts` para evitar erro de narrowing no TypeScript.
- Validada a gravacao estruturada das entidades abaixo no repositorio Aiven:
  - `cadastros_base`
  - `titulares_certificado`
  - `vendas_certificados`
  - `agendamentos_validacao`
- Adicionada validacao de forma de pagamento ativa em `backend/src/services/checkoutService.ts` antes da criacao da venda.

## Amarracao atual das tabelas do checkout
- `lojas_marketplace.tabela_preco_id -> tabelas_preco.id`
- `tabelas_preco.id -> tabelas_preco_itens.tabela_preco_id`
- `tabelas_preco_itens.certificado_id -> certificados.id`
- `vendas_certificados.loja_marketplace_id -> lojas_marketplace.id`
- `vendas_certificados.cadastro_base_id -> cadastros_base.id`
- `vendas_certificados.titular_id -> titulares_certificado.id`
- `vendas_certificados.certificado_id -> certificados.id`
- `vendas_certificados.tabela_preco_id -> tabelas_preco.id`
- `vendas_certificados.tabela_preco_item_id -> tabelas_preco_itens.id`
- `vendas_certificados.forma_pagamento_id -> formas_pagamento_v2.id`
- `vendas_certificados.ponto_atendimento_id -> pontos_atendimento.id`
- `agendamentos_validacao.venda_certificado_id -> vendas_certificados.id`
- `agendamentos_validacao.cadastro_base_id -> cadastros_base.id`
- `agendamentos_validacao.titular_id -> titulares_certificado.id`

## Validacoes executadas
- `npm run build:backend`
- `npm run build`

## Pendencias reais para a proxima fase
- Configurar `DATABASE_URL` do Aiven no backend.
- Confirmar no banco Aiven os nomes finais e colunas reais das tabelas de agenda:
  - agentes de registro
  - pontos de atendimento
  - disponibilidade/slots
- Implementar `getCheckoutScheduleContext()` com leitura real do banco.
- Subir o backend localmente com `npm run start:backend` apos configurar ambiente.
- Ligar o frontend ao endpoint real do backend Aiven para tirar o checkout do modo legado.

## Observacao importante
- A base conceitual do antigo Supabase foi preservada no desenho atual para nao perder relacionamento, historico e semantica de dados durante a migracao para Aiven.
