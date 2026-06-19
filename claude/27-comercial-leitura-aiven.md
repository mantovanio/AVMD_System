# 27 - Comercial com primeira leitura no Aiven

## Data
- 2026-06-19

## Objetivo da etapa
Comecar a preparar o painel Comercial para visualizar dados do Aiven, sem ainda migrar rotinas de escrita/edicao mais sensiveis.

## Registros teste marcados
Foram mantidos no Aiven e marcados com `metadata.registro_teste = true`:
- `vendas_certificados`: 2
- `agendamentos_validacao`: 1
- `cadastros_base`: 2
- `titulares_certificado`: 2

As vendas teste tambem receberam observacao com prefixo `[TESTE]` e `status_venda = 'rascunho'`.

## Backend criado
- `backend/src/repositories/commercialRepository.ts`
- `backend/src/routes/commercialRoutes.ts`

Rotas novas:
- `POST /api/comercial/vendas`
- `POST /api/comercial/agenda`
- `POST /api/comercial/clientes`
- `POST /api/comercial/clientes/buscar`
- `POST /api/comercial/pontos`
- `POST /api/comercial/agentes`

## Frontend criado/alterado
- `src/lib/commercialAiven.ts`
  - cliente de API para leituras comerciais no Aiven.
- `src/pages/Comercial.tsx`
  - em modo `VITE_USE_LEGACY_SUPABASE=false`, passou a buscar do Aiven:
    - vendas
    - agenda
    - clientes
    - busca de clientes
    - pontos
    - agentes
  - as rotinas de escrita/edicao continuam no fluxo legado por enquanto.

## Validacoes executadas
- `npm run build:backend`
- `npm run build`
- Backend reiniciado localmente na porta `8787`.
- Validado via API:
  - vendas: 2
  - vendas teste: 2
  - agenda: 1
  - busca por cliente teste: 2

## Observacao importante
Esta etapa e uma ponte de leitura. Para producao completa, ainda falta migrar operacoes de escrita do Comercial, principalmente:
- criar/editar venda interna
- editar status da venda
- criar/editar agendamento pelo painel
- catalogo/tabelas/precos
- formas de pagamento
- exclusoes e acoes fiscais/integracoes
