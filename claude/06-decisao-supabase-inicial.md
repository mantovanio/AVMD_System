# Decisao Inicial de Supabase

## Contexto
Existe um projeto/conta ja utilizada no Supabase com referencia ao nome `admavmd`, anteriormente ligado a outro uso e hoje disponivel para reaproveitamento como base inicial deste produto.

## Decisao Atual
Para acelerar o inicio do `AVMD_System`, vamos considerar o `admavmd` como ambiente inicial de configuracao e testes do produto.

## Regras Importantes
- nao apagar nada automaticamente sem revisar o que ainda existe no projeto
- confirmar tabelas, auth, storage e policies antes de reaproveitar
- usar esse ambiente apenas como base inicial de desenvolvimento/estrutura
- manter a arquitetura alvo como `um projeto Supabase por cliente`

## Objetivo
Usar o `admavmd` para:
- validar schema inicial
- preparar migrations
- estruturar auth
- testar configuracoes base

## Regra Comercial e Tecnica
Mesmo usando o `admavmd` agora como base inicial, o produto final nao deve depender de um unico projeto compartilhado entre clientes. O padrao continua sendo:
- app central na sua VPS
- um Supabase separado por cliente

## Proximo Passo Relacionado
Depois de estabilizar o codigo local:
1. mapear o schema necessario
2. revisar o estado atual do `admavmd`
3. decidir o que reaproveitar e o que recriar do zero
