# 15 - Aiven Como Base Oficial

## Nova diretriz
A base oficial do projeto deixa de ser Supabase e passa a ser Aiven.

## Leitura correta da arquitetura atual
- Aiven = destino principal e base oficial
- Clerk = autenticacao do frontend
- Supabase = legado temporario onde ainda houver dependencia tecnica nao migrada

## Ajustes aplicados nesta retomada
- `src/lib/runtimeConfig.ts` agora nomeia os modos como `supabase_legacy` e `aiven_api`
- `.env.example` passou a indicar `VITE_USE_LEGACY_SUPABASE=false` como padrao alvo
- `AIVEN_CLERK_MIGRATION.md` foi atualizado para refletir a nova decisao oficial

## Observacao importante
O `.env` local ainda esta em operacao com Supabase legado porque o backend Aiven ainda nao foi conectado neste workspace.

Isso significa:
- a direcao oficial mudou
- a compatibilidade temporaria continua necessaria
- a proxima etapa real e plugar `VITE_API_BASE_URL` com o backend novo

## Proximo foco tecnico correto
1. disponibilizar backend proprio do Aiven
2. migrar `MarketplaceLoja.tsx` para API nova
3. mapear e migrar os modulos internos mais criticos
4. reduzir progressivamente todo acesso direto do frontend ao Supabase
