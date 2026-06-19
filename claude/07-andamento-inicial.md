# Andamento Inicial do Projeto

## O que foi feito nesta etapa
- criada a pasta `claude` para registrar decisoes e contexto
- registrada a estrategia SaaS inicial
- registrada a decisao de usar `admavmd` como base inicial de Supabase
- corrigida a estrutura para o projeto compilar localmente

## Ajustes tecnicos aplicados
- `auth` migrado para `src/lib/auth.tsx`
- alias `@` configurado em `vite.config.ts` e `tsconfig.app.json`
- criados modulos ausentes:
  - `src/lib/supabase.ts`
  - `src/lib/utils.ts`
  - `src/lib/logger.ts`
  - `src/lib/contactDocumentStorage.ts`
  - `src/types/index.ts`
  - `src/contexts/AuthContext.ts`
- compatibilidade minima ajustada para contexts antigos com Supabase v2
- criado `.env.example`

## Estado Atual
- `npm run build` executa com sucesso
- existe alerta de Tailwind durante o build
- o projeto ja saiu do estado quebrado e agora pode avancar para configuracao real

## Ponto de Atencao
O build ainda mostra aviso relacionado a `@tailwind`, indicando que a configuracao de CSS/Tailwind precisa ser revisada em uma proxima etapa para ficar 100% alinhada.

## Proximo Passo Recomendado
1. configurar `.env` real com o projeto Supabase inicial
2. revisar schema e tabelas necessarias
3. validar login e fluxo principal no ambiente local
4. depois iniciar o painel interno do produto
