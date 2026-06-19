# 17 - Backend Aiven do Checkout

## Objetivo desta etapa
Implementar o backend minimo do checkout publico em Aiven, obedecendo exatamente o contrato ja definido no frontend.

## Endpoints obrigatorios

### 1. `POST /api/checkout/context`
Acoes aceitas:
- `context`
- `lookup_customer`

### 2. `POST /api/checkout/submit`
Responsavel por gravar a venda, dados fiscais, titular e agendamento.

## Ordem correta de implementacao

### Etapa 1 - `action=context`
Esse endpoint precisa devolver:
- loja
- tabela
- produtos
- pagamentos
- payment_runtime
- agentes
- pontos
- slots

#### Fontes de dados minimas
- `lojas_marketplace`
- `tabelas_preco`
- `tabelas_preco_itens`
- `certificados`
- `formas_pagamento_v2`
- `app_settings`
- estruturas de agenda disponivel

#### Regras minimas
- quando `slug` vier preenchido, buscar loja por `slug`
- quando `slug` vier `null`, usar loja institucional padrao
- retornar apenas itens ativos
- retornar apenas certificados ativos
- devolver `payment_runtime` com fallback seguro

### Etapa 2 - `action=lookup_customer`
Esse endpoint precisa:
- receber CPF/CNPJ em `documento`
- buscar o cadastro ativo mais recente
- devolver apenas os campos necessarios ao checkout

#### Fonte minima
- `cadastros_base`

#### Regra minima
- considerar documento com e sem mascara
- priorizar o cadastro mais recente por `updated_at`

### Etapa 3 - `POST /api/checkout/submit`
Esse endpoint precisa:
- validar payload completo
- localizar loja e item
- validar forma de pagamento
- gravar comprador / faturamento
- gravar ou vincular titular
- gravar venda
- gravar agendamento quando houver
- devolver `venda_id` e mensagem final

## Tabelas provaveis envolvidas no submit
- `lojas_marketplace`
- `tabelas_preco_itens`
- `tabelas_preco`
- `cadastros_base`
- `titulares_certificado`
- `vendas_certificados`
- `agendamentos_validacao` ou equivalente da agenda nova

## Sequencia interna recomendada do submit
1. validar payload
2. carregar loja
3. carregar item da tabela
4. validar se item pertence a loja/tabela
5. localizar ou criar `cadastros_base`
6. localizar ou criar titular
7. criar `vendas_certificados`
8. criar agendamento se veio no payload
9. devolver resposta final

## Campos minimos que a venda precisa refletir
- `loja_marketplace_id`
- `cadastro_base_id`
- `certificado_id`
- `tabela_preco_id`
- `tabela_preco_item_id`
- `forma_pagamento_id`
- `tipo_produto`
- `tipo_emissao`
- `nome_faturamento`
- `documento_faturamento`
- `email_faturamento`
- `telefone_faturamento`
- `valor_venda`
- `observacoes`

## Validacoes obrigatorias no backend
- item pertence a tabela da loja
- item e certificado continuam ativos
- forma de pagamento existe e esta ativa
- CPF/CNPJ do comprador valido
- CPF do titular valido
- e-mail valido
- telefone valido
- UF com 2 caracteres
- agendamento compativel com agente/ponto/slot quando houver

## Estrutura recomendada no backend

### Camada 1 - route handler
Responsavel por:
- receber request
- validar `action`
- chamar service
- responder JSON

### Camada 2 - services
Responsavel por:
- regras de negocio do checkout
- montagem da resposta
- coordenacao de repositorios

### Camada 3 - repositories
Responsavel por:
- consultas SQL no Aiven
- inserts / updates
- transacoes do submit

## Observacao importante
O frontend ja esta pronto para conversar com esse contrato. Portanto, o backend nao deve inventar outro formato de request/response.

## Proximo passo imediatamente apos implementar
1. apontar `VITE_API_BASE_URL`
2. colocar `VITE_USE_LEGACY_SUPABASE=false`
3. testar `MarketplaceLoja`
4. remover o fallback legado do checkout em `src/lib/checkout.ts`
