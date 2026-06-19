# Diagnostico Tecnico Inicial

## Estado Atual
O projeto ainda nao esta pronto para subir em ambiente de desenvolvimento sem ajustes.

## Problemas ja identificados
- `src/lib/auth.ts` possui JSX e precisa ser `.tsx`
- o projeto usa imports com alias `@/...`, mas o alias nao esta configurado no `vite.config.ts` e no `tsconfig`
- existem imports apontando para arquivos que nao existem nesta copia local
- o sistema depende de `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`

## Impacto
- `npm run build` falha
- `npm run dev` tende a quebrar ou ficar incompleto
- a base atual parece uma mistura de template com partes de um sistema maior

## Arquivos que exigem revisao imediata
- `src/lib/auth.ts`
- `src/pages/ChatPage.tsx`
- `src/components/ChatPanel.tsx`
- `vite.config.ts`
- `tsconfig.app.json`

## Risco Atual
Se formos direto para deploy ou venda sem estabilizar essa base:
- onboarding vai falhar
- manutencao vai ficar cara
- customizacao por cliente vai virar retrabalho

## Proximo Movimento Tecnico
Precisamos primeiro deixar o projeto compilavel. Depois disso, estruturamos a camada de produto e provisioning.
