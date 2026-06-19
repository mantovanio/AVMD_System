# Backend Aiven do Checkout

## Status
Estrutura inicial criada para suportar o checkout do Aiven.

## Entradas principais
- `src/server.ts`
- `src/routes/checkoutRoutes.ts`
- `src/services/checkoutService.ts`
- `src/repositories/checkoutRepository.ts`
- `src/contracts/checkoutContract.ts`

## Objetivo da fase atual
A estrutura ja recebe os contratos do checkout e organiza o fluxo.
Ainda falta ligar o acesso real ao banco Aiven na implementacao concreta do repositorio.

## Comando sugerido para validar compilacao
`npx tsc -p backend/tsconfig.json`

## Ordem recomendada agora
1. implementar `AivenCheckoutRepository`
2. ligar `DATABASE_URL`
3. subir o servidor
4. apontar `VITE_API_BASE_URL`
5. virar `VITE_USE_LEGACY_SUPABASE=false`
