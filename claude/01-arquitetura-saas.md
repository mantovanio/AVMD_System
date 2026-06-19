# Arquitetura SaaS Recomendada

## Modelo Inicial
- `Frontend/App`: hospedado na sua VPS
- `Supabase`: um projeto por cliente
- `DNS`: subdominio por cliente, ex. `cliente.seudominio.com`
- `Configuracao`: `.env` separado por cliente

## Vantagens
- isolamento de dados
- controle central de deploy
- manutencao mais simples
- facilidade para suporte e atualizacao

## Componentes
### 1. VPS principal
- Nginx
- aplicacao
- SSL
- logs
- rotina de deploy

### 2. Supabase por cliente
- database
- auth
- storage
- policies
- migrations

### 3. Painel de controle interno
- cadastro de cliente
- status da licenca
- plano contratado
- credenciais e endpoints
- historico de implantacao

## Modelo de Evolucao
### Fase 1
- deploy manual padronizado
- onboarding com checklist

### Fase 2
- painel interno de provisioning
- criacao automatica de projeto Supabase
- aplicacao automatica de SQL base

### Fase 3
- plano enterprise com ambiente dedicado
- recursos premium por feature flag ou licenca

## Regra Estrategica
Produto padrao:
- app na sua infra
- backend de dados isolado por cliente

Plano premium:
- infraestrutura dedicada por cliente
