# Contexto do Produto

## Objetivo
Transformar o `AVMD_System` em um produto de prateleira, replicavel e vendavel para multiplos clientes, com implantacao padronizada, controle central e baixo custo operacional.

## Direcao Inicial
- Aplicacao hospedada na sua VPS
- Um projeto Supabase por cliente
- Mesmo codigo-base para todos os clientes
- Configuracao e credenciais separadas por cliente
- Painel administrativo proprio para onboarding, ativacao e suspensao

## Meta de Negocio
- vender rapido
- implantar com baixo atrito
- manter controle tecnico e comercial
- reduzir dependencia operacional manual

## Premissas
- Nao usar Supabase self-hosted neste inicio
- Nao criar uma VPS dedicada por cliente como padrao
- Priorizar repetibilidade de deploy
- Preparar base para planos `Starter`, `Business` e `Enterprise`

## Resultado Esperado
Uma arquitetura que permita:
- ativar novo cliente com checklist ou automacao
- isolar dados por cliente
- cobrar setup + mensalidade + customizacoes
- escalar sem reescrever o sistema a cada venda
