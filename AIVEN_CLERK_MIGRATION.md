# Migração para Aiven + Clerk

## Objetivo

Migrar o frontend `AVMD_System` do modelo atual baseado em Supabase para uma arquitetura de baixo custo com:
- **Aiven PostgreSQL** como banco de dados principal
- **Clerk** como provedor de autenticação
- um **backend leve** que expõe APIs para o frontend

## Decisão vigente

A base oficial do sistema passa a ser **Aiven**.

O Supabase deve ser tratado apenas como **camada legada temporária** enquanto ainda existirem:
- leituras diretas de tabela no frontend
- edge functions ainda não migradas
- fluxos públicos e internos sem endpoint próprio no backend novo

## Estado atual

Hoje o app ainda usa Supabase para:
- parte do acesso a dados no frontend (`supabase.from(...)`)
- parte das Edge Functions legadas
- alguns fluxos públicos e internos ainda não migrados

A autenticação já está no **Clerk** no frontend.

## Arquitetura alvo

1. **Clerk no frontend**
   - `ClerkProvider`
   - `useUser()` / `useSignIn()` / `useSignUp()`
2. **Backend de API**
   - Rota de checkout pública: `/api/checkout/context`
   - Rota de submissão de pedido: `/api/checkout/submit`
   - Outras rotas internas conforme necessidade
3. **Aiven Postgres**
   - armazenar `profiles`, `crm`, `vendas`, `agendamentos`, `pagamentos`, etc.
   - scripts SQL de migração e novo schema
4. **Frontend consumindo API**
   - `MarketplaceLoja.tsx` dispara chamadas para o backend
   - o frontend deixa de acessar o banco diretamente ao longo da migração

## Variáveis de ambiente novas

- `VITE_CLERK_FRONTEND_API`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_API_BASE_URL`
- `VITE_USE_LEGACY_SUPABASE`

## Regra operacional atual

- `VITE_USE_LEGACY_SUPABASE=false` deve ser o alvo padrão para ambientes novos
- `VITE_USE_LEGACY_SUPABASE=true` só deve existir como compatibilidade temporária
- `DATABASE_URL` do Aiven deve existir apenas no backend, nunca no frontend

## Estratégia de migração

### Etapa 1 — manter compatibilidade temporária

- preservar `src/lib/supabase.ts` apenas enquanto houver uso legado
- concentrar o controle de modo em `runtimeConfig.ts`
- impedir ambiguidade entre modo legado e modo Aiven

### Etapa 2 — concluir backend Aiven + Clerk

- criar endpoints de API para checkout e dados essenciais
- autenticar requests com Clerk JWT
- usar `DATABASE_URL` do Aiven apenas no backend

### Etapa 3 — migrar o checkout público

- alterar `MarketplaceLoja.tsx` para chamar API própria
- manter a mesma lógica de validação
- remover dependência de `marketplace-checkout` no Supabase

### Etapa 4 — migrar módulos internos críticos

- `Comercial`
- `Clientes`
- `Financeiro`
- `Renovações`
- `Configurações`

### Etapa 5 — remover legado Supabase

- eliminar leituras diretas `supabase.from(...)` do frontend
- remover uso de Edge Functions legadas
- manter Supabase apenas se houver alguma dependência operacional restante muito justificada

## Próximo passo recomendado

1. subir o backend próprio do Aiven
2. apontar `VITE_API_BASE_URL` para ele
3. migrar primeiro o checkout público
4. depois migrar os módulos internos por prioridade de negócio

