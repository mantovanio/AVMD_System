# 19 - Mapeamento das Tabelas do Checkout para Aiven

## Objetivo
Preservar no Aiven a amarracao real das tabelas e dos dados que hoje sustentam o checkout, a venda, o titular, o agendamento e o pagamento que existiam no Supabase.

## Fonte de verdade usada neste mapeamento
- tipos do frontend em `src/types/index.ts`
- inventario antigo do schema em `claude/backups/admavmd-20260615-170131/public-tables.json`
- uso real nas telas `MarketplaceLoja.tsx` e `Comercial.tsx`

## Observacao importante
O `public` atual do projeto Supabase foi enxugado e hoje o arquivo `claude/current-public-tables.json` mostra apenas uma base minima.

Mas o schema funcional completo que sustentava o negocio ficou preservado nos backups da pasta `claude/backups/...` e nos tipos do frontend. E essa estrutura que precisa guiar o Aiven.

## Cadeia principal do checkout

### 1. Loja publica
Tabela: `lojas_marketplace`

Campos-chave:
- `id`
- `slug`
- `tabela_preco_id`
- `owner_tipo`
- `owner_profile_id`
- `owner_parceiro_id`
- `configuracoes`
- `ativo`

Papel:
- define qual loja publica esta sendo usada
- define qual tabela de preco alimenta o checkout
- guarda configuracoes de exibicao do link

Relacao principal:
- `lojas_marketplace.tabela_preco_id -> tabelas_preco.id`

### 2. Tabela comercial da loja
Tabela: `tabelas_preco`

Campos-chave:
- `id`
- `nome`
- `descricao`
- `codigo_voucher`
- `max_desconto_percentual`
- `max_desconto_valor`
- `comissao_venda_pct`
- `comissao_gestor_pct`
- `comissao_gestor_valor`
- `ativo`

Papel:
- representa a regra comercial base da loja
- concentra regras de desconto e comissao da venda

Relacao principal:
- `tabelas_preco.id -> tabelas_preco_itens.tabela_preco_id`

### 3. Itens vendiveis da tabela
Tabela: `tabelas_preco_itens`

Campos-chave:
- `id`
- `tabela_preco_id`
- `certificado_id`
- `valor`
- `valor_custo`
- `valor_repasse`
- `link_safeweb`
- `ativo`

Papel:
- define o item concreto vendido no checkout
- conecta o preco com o certificado

Relacoes principais:
- `tabelas_preco_itens.tabela_preco_id -> tabelas_preco.id`
- `tabelas_preco_itens.certificado_id -> certificados.id`

### 4. Produto base
Tabela: `certificados`

Campos-chave:
- `id`
- `codigo`
- `tipo`
- `descricao`
- `validade`
- `modelo`
- `categoria`
- `tipo_emissao_padrao`
- `periodo_uso`
- `descricao_produto`
- `preco_venda`
- `valor_custo`
- `ativo`

Papel:
- define o produto real que o cliente esta comprando
- abastece a descricao, modelo, validade e tipo de emissao

## Cadeia principal do comprador e faturamento

### 5. Cadastro base do comprador
Tabela: `cadastros_base`

Campos-chave:
- `id`
- `tipo_cliente`
- `tipo_cadastro`
- `cpf_cnpj`
- `nome`
- `nome_fantasia`
- `email`
- `telefone`
- `logradouro`
- `numero`
- `complemento`
- `bairro`
- `cidade`
- `uf`
- `cep`
- `inscricao_municipal`
- `inscricao_estadual`
- `iss_retido`
- `status`
- `metadata`

Papel:
- representa a pessoa fisica ou juridica usada no faturamento
- serve para reaproveitamento de cadastro no checkout
- e a ancora principal do cliente na venda

Relacoes principais:
- `vendas_certificados.cadastro_base_id -> cadastros_base.id`
- `agendamentos_validacao.cadastro_base_id -> cadastros_base.id`

Regra importante para Aiven:
- buscar por CPF/CNPJ com e sem mascara
- preservar `updated_at` para localizar o cadastro ativo mais recente

## Cadeia principal do titular do certificado

### 6. Titular do certificado
Tabela: `titulares_certificado`

Campos-chave:
- `id`
- `nome`
- `cpf`
- `data_nascimento`
- `email`
- `telefone`
- `metadata`

Papel:
- representa a pessoa que realmente sera titular do certificado
- pode ser diferente do pagador/faturamento

Relacoes principais:
- `vendas_certificados.titular_id -> titulares_certificado.id`
- `agendamentos_validacao.titular_id -> titulares_certificado.id`

## Cadeia principal da venda

### 7. Venda do certificado
Tabela: `vendas_certificados`

Campos-chave estruturais:
- `id`
- `loja_marketplace_id`
- `cadastro_base_id`
- `empresa_id`
- `titular_id`
- `certificado_id`
- `tabela_preco_id`
- `tabela_preco_item_id`
- `forma_pagamento_id`

Campos de produto e pedido:
- `tipo_produto`
- `tipo_venda`
- `tipo_emissao`
- `tabela_preco`
- `valor_venda`
- `valor_custo`
- `pedido_numero`
- `pedido_status`
- `protocolo_numero`
- `protocolo_status`
- `certificadora`
- `numero_serie`
- `status_certificado`

Campos snapshot de faturamento:
- `documento_faturamento`
- `nome_faturamento`
- `email_faturamento`
- `telefone_faturamento`
- `logradouro`
- `numero`
- `complemento`
- `bairro`
- `cidade`
- `uf`
- `cep`
- `inscricao_municipal`
- `inscricao_estadual`
- `iss_retido`

Campos de responsáveis:
- `vendedor_id`
- `agente_registro_id`
- `contador_id`
- `ponto_atendimento_id`

Campos de integracao/snapshot:
- `api_payload_pedido`
- `api_payload_protocolo`
- `voucher_codigo`
- `voucher_percentual`
- `voucher_valor`
- `nome_ar`
- `nome_local_atendimento`

Papel:
- e a tabela central da operacao comercial
- une loja, item, cliente, titular, pagamento e agenda
- guarda snapshot de faturamento para historico e integracao

Relacoes principais:
- `vendas_certificados.loja_marketplace_id -> lojas_marketplace.id`
- `vendas_certificados.cadastro_base_id -> cadastros_base.id`
- `vendas_certificados.titular_id -> titulares_certificado.id`
- `vendas_certificados.certificado_id -> certificados.id`
- `vendas_certificados.tabela_preco_id -> tabelas_preco.id`
- `vendas_certificados.tabela_preco_item_id -> tabelas_preco_itens.id`
- `vendas_certificados.forma_pagamento_id -> formas_pagamento_v2.id`
- `vendas_certificados.ponto_atendimento_id -> pontos_atendimento.id`

Regra critica para Aiven:
- preservar tanto FKs quanto snapshots textuais
- o snapshot garante historico mesmo se o cadastro mudar depois

## Cadeia principal do pagamento

### 8. Forma de pagamento
Tabela: `formas_pagamento_v2`

Campos-chave:
- `id`
- `nome`
- `codigo`
- `tipo`
- `gateway`
- `ativo`
- `metadata`

Papel:
- define a forma usada na venda
- alimenta o checkout publico

Relacao principal:
- `vendas_certificados.forma_pagamento_id -> formas_pagamento_v2.id`

### 9. Configuracao de runtime do pagamento
Tabela logica: `app_settings`

Chaves relevantes:
- `payment_runtime`
- `payment_methods`
- possivelmente outras chaves comerciais ligadas ao checkout

Papel:
- controlar comportamento operacional do checkout
- expor aviso sobre compensacao, modo de teste e bloqueios de integracao

Regra para Aiven:
- manter mecanismo equivalente para chave/valor, mesmo que a implementacao interna mude

## Cadeia principal do agendamento

### 10. Pontos de atendimento
Tabela: `pontos_atendimento`

Campos-chave:
- `id`
- `codigo`
- `nome`
- `endereco`
- `cidade`
- `uf`
- `status`
- `metadata`

Papel:
- localiza o atendimento ou a estrutura vinculada ao slot

### 11. Disponibilidade de agenda
Tabelas relevantes:
- `agentes_disponibilidade`
- `agentes_indisponibilidades`
- `agentes_tabelas_preco`
- `parceiros_agentes_permitidos`
- `ponto_atendimento_agentes`

Papel:
- formar os slots mostrados no checkout
- restringir agenda por agente, ponto, tabela e parceiro

### 12. Agendamento da validacao
Tabela: `agendamentos_validacao`

Campos-chave:
- `id`
- `venda_certificado_id`
- `cadastro_base_id`
- `empresa_id`
- `titular_id`
- `contador_id`
- `agente_registro_id`
- `ponto_atendimento_id`
- `data_agendada`
- `tipo_atendimento`
- `status_agendamento`
- `observacoes`
- `metadata`

Papel:
- registrar a agenda operacional ligada a venda

Relacoes principais:
- `agendamentos_validacao.venda_certificado_id -> vendas_certificados.id`
- `agendamentos_validacao.cadastro_base_id -> cadastros_base.id`
- `agendamentos_validacao.titular_id -> titulares_certificado.id`
- `agendamentos_validacao.agente_registro_id -> profiles.id` ou tabela equivalente de usuarios
- `agendamentos_validacao.ponto_atendimento_id -> pontos_atendimento.id`

## Cadeia principal de usuarios internos

### 13. Perfis internos
Tabela: `profiles`

Campos-chave:
- `id`
- `nome`
- `email`
- `perfil`
- `status`
- `tipo_vinculo`
- `parceiro_id`
- `documento`
- `telefone`
- `cidade`
- `permissoes`

Papel:
- agentes de registro
- vendedores
- administradores
- usuarios vinculados a parceiro

Relacoes principais no dominio comercial:
- `vendas_certificados.vendedor_id -> profiles.id`
- `vendas_certificados.agente_registro_id -> profiles.id`
- `agendamentos_validacao.agente_registro_id -> profiles.id`
- `lojas_marketplace.owner_profile_id -> profiles.id`

## Ordem correta de migracao para Aiven

### Bloco 1 - catalogo e configuracao
1. `profiles`
2. `app_settings`
3. `certificados`
4. `formas_pagamento_v2`
5. `pontos_atendimento`
6. `tabelas_preco`
7. `tabelas_preco_itens`
8. `lojas_marketplace`
9. tabelas de disponibilidade e agenda

### Bloco 2 - entidades transacionais
10. `cadastros_base`
11. `titulares_certificado`
12. `vendas_certificados`
13. `agendamentos_validacao`

## Regras que nao podem se perder
- `loja -> tabela_preco -> item -> certificado`
- `venda -> cadastro_base`
- `venda -> titular`
- `venda -> forma_pagamento`
- `venda -> ponto_atendimento`
- `agendamento_validacao -> venda`
- `agendamento_validacao -> cadastro_base`
- `agendamento_validacao -> titular`
- snapshots textuais da venda precisam continuar existindo
- IDs UUID precisam ser preservados sempre que possivel para reduzir retrabalho de integracao

## Campos que o backend Aiven do checkout precisa preencher no submit
Minimo recomendado em `vendas_certificados`:
- `loja_marketplace_id`
- `cadastro_base_id`
- `titular_id`
- `certificado_id`
- `tabela_preco_id`
- `tabela_preco_item_id`
- `forma_pagamento_id`
- `tipo_produto`
- `tipo_emissao`
- `tabela_preco`
- `valor_venda`
- `valor_custo`
- `documento_faturamento`
- `nome_faturamento`
- `email_faturamento`
- `telefone_faturamento`
- `logradouro`
- `numero`
- `complemento`
- `bairro`
- `cidade`
- `uf`
- `cep`
- `observacoes`

## Check final de migracao
A migracao do checkout so pode ser considerada segura quando:
- o endpoint `context` montar dados sem depender do Supabase
- o `lookup_customer` nao consultar mais `cadastros_base` no Supabase
- o `submit` gravar `vendas_certificados` no Aiven com os snapshots corretos
- o `submit` criar `agendamentos_validacao` no Aiven quando houver slot escolhido
- os relacionamentos acima estiverem preservados no banco novo
