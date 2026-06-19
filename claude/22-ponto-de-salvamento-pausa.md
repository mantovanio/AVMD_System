# 22 - Ponto de Salvamento da Pausa

## Estado atual consolidado
O projeto avancou da fase de planejamento para uma base real de migracao do checkout para Aiven.

## O que ja esta pronto

### Frontend
- `MarketplaceLoja` foi desacoplado da maior parte da logica direta de origem dos dados.
- o checkout passou a usar a camada central em `src/lib/checkout.ts`
- o contrato do checkout foi formalizado em `src/lib/checkoutContract.ts`
- o lookup de cliente por CPF/CNPJ foi centralizado e preparado para backend proprio
- a direcao oficial do projeto foi alinhada para `Aiven` como base principal

### Backend inicial
Foi criada a pasta `backend` com estrutura inicial real:
- `backend/src/server.ts`
- `backend/src/routes/checkoutRoutes.ts`
- `backend/src/services/checkoutService.ts`
- `backend/src/repositories/checkoutRepository.ts`
- `backend/src/repositories/aivenCheckoutRepository.ts`
- `backend/src/contracts/checkoutContract.ts`
- `backend/src/db/aivenClient.ts`
- `backend/src/config/env.ts`
- `backend/src/utils/http.ts`
- `backend/src/utils/validation.ts`

### Documentacao criada
- `claude/16-contrato-checkout-aiven.md`
- `claude/17-backend-aiven-checkout.md`
- `claude/18-backend-aiven-checkout-example.md`
- `claude/19-mapeamento-tabelas-checkout-aiven.md`
- `claude/20-queries-repositorios-checkout-aiven.md`
- `claude/21-backend-inicial-checkout-criado.md`

## Validacoes ja feitas
- `npm run build`
- `npm run build:backend`

Ambas estavam passando no momento deste salvamento.

## O que falta para a integracao real com Aiven

### Backend
Ainda faltam as partes operacionais reais:
- implementar cliente PostgreSQL real em `backend/src/db/aivenClient.ts`
- implementar `upsertCheckoutCustomer`
- implementar `upsertCheckoutHolder`
- implementar `createCheckoutSale`
- implementar `createCheckoutSchedule`
- ligar `DATABASE_URL`

### Frontend
Depois do backend pronto:
- configurar `VITE_API_BASE_URL`
- virar `VITE_USE_LEGACY_SUPABASE=false`
- testar checkout ponta a ponta sem fallback legado
- remover fallback legado de checkout em `src/lib/checkout.ts`

## Amarracao de tabelas que nao pode se perder
A referencia principal desta parte esta em:
- `claude/19-mapeamento-tabelas-checkout-aiven.md`
- `claude/20-queries-repositorios-checkout-aiven.md`

Resumo curto da cadeia principal:
- `lojas_marketplace -> tabelas_preco -> tabelas_preco_itens -> certificados`
- `vendas_certificados -> cadastros_base`
- `vendas_certificados -> titulares_certificado`
- `vendas_certificados -> formas_pagamento_v2`
- `vendas_certificados -> pontos_atendimento`
- `agendamentos_validacao -> vendas_certificados`

## Ponto exato de retomada recomendado
Quando voltar, seguir nesta ordem:
1. implementar o cliente PostgreSQL real do Aiven
2. finalizar os metodos de escrita do repositorio do checkout
3. subir backend local do checkout
4. apontar `VITE_API_BASE_URL`
5. desligar o fallback legado com `VITE_USE_LEGACY_SUPABASE=false`
6. validar o checkout completo ponta a ponta

## Observacao operacional
Este repositorio nao estava com fluxo Git operacional nesta sessao, entao o ponto de salvamento foi registrado documentalmente na pasta `claude`, que e a referencia oficial de handoff deste projeto.
