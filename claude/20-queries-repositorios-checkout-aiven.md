# 20 - Queries e Repositorios Minimos do Checkout Aiven

## Objetivo
Traduzir o mapeamento das tabelas do Supabase para a camada tecnica minima do backend Aiven.

## Repository: MarketplaceStoreRepository

### Query 1 - buscar loja publica por slug
```sql
select *
from lojas_marketplace
where ativo = true
  and slug = $1
limit 1;
```

### Query 2 - buscar loja institucional padrao
```sql
select *
from lojas_marketplace
where ativo = true
  and owner_tipo = 'institucional'
order by created_at asc
limit 1;
```

## Repository: PricingRepository

### Query 3 - buscar tabela de preco
```sql
select *
from tabelas_preco
where id = $1
limit 1;
```

### Query 4 - buscar itens ativos da tabela com certificado
```sql
select i.*, c.*
from tabelas_preco_itens i
join certificados c on c.id = i.certificado_id
where i.tabela_preco_id = $1
  and i.ativo = true
  and c.ativo = true
order by i.created_at asc;
```

## Repository: PaymentRepository

### Query 5 - buscar formas de pagamento ativas
```sql
select id, nome, codigo, tipo, gateway, ativo, metadata, created_at, updated_at
from formas_pagamento_v2
where ativo = true
order by nome asc;
```

### Query 6 - buscar configuracao de runtime
```sql
select value
from app_settings
where key = 'payment_runtime'
limit 1;
```

## Repository: CustomerRepository

### Query 7 - buscar cadastro ativo mais recente por documento
```sql
select tipo_cliente, cpf_cnpj, nome, nome_fantasia, email, telefone, cep,
       logradouro, numero, complemento, bairro, cidade, uf
from cadastros_base
where status = 'ativo'
  and cpf_cnpj in ($1, $2)
order by updated_at desc
limit 1;
```

### Query 8 - localizar cadastro existente no submit
```sql
select id, cpf_cnpj
from cadastros_base
where cpf_cnpj in ($1, $2)
order by updated_at desc
limit 1;
```

### Query 9 - inserir cadastro base novo
Campos minimos:
- tipo_cliente
- tipo_cadastro
- cpf_cnpj
- nome
- nome_fantasia
- email
- telefone
- logradouro
- numero
- complemento
- bairro
- cidade
- uf
- cep
- status
- metadata

### Query 10 - atualizar cadastro base existente
Atualizar no minimo:
- nome
- nome_fantasia
- email
- telefone
- logradouro
- numero
- complemento
- bairro
- cidade
- uf
- cep
- updated_at

## Repository: HolderRepository

### Query 11 - localizar titular por CPF
```sql
select *
from titulares_certificado
where cpf = $1
order by updated_at desc
limit 1;
```

### Query 12 - inserir titular novo
Campos minimos:
- nome
- cpf
- data_nascimento
- email
- telefone
- metadata

### Query 13 - atualizar titular existente
Atualizar no minimo:
- nome
- data_nascimento
- email
- telefone
- updated_at

## Repository: SalesRepository

### Query 14 - buscar item da venda
```sql
select *
from tabelas_preco_itens
where id = $1
  and ativo = true
limit 1;
```

### Query 15 - inserir venda
Campos minimos:
- loja_marketplace_id
- cadastro_base_id
- titular_id
- certificado_id
- tabela_preco_id
- tabela_preco_item_id
- forma_pagamento_id
- tipo_produto
- tipo_emissao
- tabela_preco
- valor_venda
- valor_custo
- documento_faturamento
- nome_faturamento
- email_faturamento
- telefone_faturamento
- logradouro
- numero
- complemento
- bairro
- cidade
- uf
- cep
- observacoes
- pago
- pedido_status
- protocolo_status

## Repository: SchedulingRepository

### Query 16 - validar slot disponivel
A implementacao depende do modelo final de agenda, mas precisa conferir:
- agente_registro_id
- ponto_atendimento_id
- data_agendada
- compatibilidade com disponibilidade
- inexistencia de bloqueio por indisponibilidade

### Query 17 - inserir agendamento de validacao
Campos minimos:
- venda_certificado_id
- cadastro_base_id
- titular_id
- agente_registro_id
- ponto_atendimento_id
- data_agendada
- tipo_atendimento
- status_agendamento
- observacoes
- metadata

## Services minimos
- `getCheckoutContext(slug)`
- `lookupCheckoutCustomer(documento)`
- `submitCheckout(payload)`

## Transacao obrigatoria no submit
O `submitCheckout` deve ser transacional para evitar:
- criar cadastro sem venda
- criar titular sem venda
- criar venda sem agendamento quando o slot foi confirmado

## Ordem interna ideal do submit
1. abrir transacao
2. carregar loja
3. carregar item
4. validar item vs tabela da loja
5. localizar ou criar cadastro
6. localizar ou criar titular
7. criar venda
8. criar agendamento quando houver
9. commit
10. devolver resposta
