# Processo de Emissao de Protocolo junto a Certificadora - GestaoAR

**Sistema:** GestaoAR (`gestaoar.com.br`)  
**Modulo:** `Vendas > Lancar Vendas`  
**Objetivo:** Gerar o protocolo de um pedido junto a Autoridade Certificadora, apos confirmacao de pagamento ou liberacao manual, criando o vinculo entre o pedido interno e a certificadora.

---

## 1. Visao Geral do Processo

O protocolo e a ponte entre o pedido registrado no GestaoAR e o sistema da Autoridade Certificadora. Ele so pode ser gerado quando o pedido esta com status **"Emissao Liberada"**, o que ocorre automaticamente apos confirmacao de pagamento ou manualmente por um operador. Apos a emissao, o numero do protocolo fica registrado no pedido e o status passa para **"Emitida"**.

---

## 2. Pre-requisitos

- Pedido criado no GestaoAR com todos os dados preenchidos
- Status do pedido: **"Emissao Liberada"**
  - Automatico: pagamento confirmado pela plataforma
  - Manual: operador clica no icone `Liberar Emissao`
- Dados do comprador cadastrados: CNPJ ou CPF, nome, endereco e contato
- Certificado selecionado na venda

---

## 3. Fluxo Geral

```text
[Criar Pedido no GestaoAR]
        |
        v
[Pagamento Confirmado?]
   |                |
  SIM              NAO
   |                |
   v                v
[Emissao       [Operador libera
 Liberada]      manualmente]
        |
        v
[Clicar em "Emitir Protocolo" no pedido]
        |
        v
[Modal abre com dados do pedido]
        |
        v
[Preencher CNPJ/CPF titular, nascimento e CNH]
        |
        v
[Validar]
        |
        v
[Sistema consulta base interna / Receita]
        |
        v
[Revisar e completar dados]
        |
        v
[Selecionar AC e AR]
        |
        v
[Emitir Protocolo]
        |
        v
[Protocolo gerado]
        |
        v
[Status do pedido = Emitida]
```

---

## 4. Passo a Passo Detalhado

### 4.1 - Localizar o Pedido na Lista de Vendas

**Caminho:** Menu lateral -> `Vendas -> Lancar Vendas`

**Filtros disponiveis:**

| Filtro | Opcoes / Formato |
|--------|------------------|
| Filtro data | Geral / Data Venda / Data Status / Pagamento efetuado / Pagamento em aberto |
| Data inicial | DD/MM/AAAA |
| Data final | DD/MM/AAAA |
| PA/Emissor | Todos ou especifico |
| Pedido | Numero do pedido |
| Protocolo | Numero do protocolo |
| Cliente | Nome ou CPF/CNPJ |

Depois dos filtros, clicar em **Pesquisar**.

### 4.2 - Legenda dos Icones por Linha

| Posicao | Icone | Acao |
|---------|------|------|
| 1 | Lupa | Notifica eventos |
| 2 | Prancheta | Emitir protocolo |
| 3 | Calendario | Agendar |
| 4 | Usuario | Upload documentos |
| 5 | Grafico | Fatura |
| 6 | Lixeira | Excluir |
| 7 | Documento | Ver NF-e |
| 8 | X | Cancelar NF-e |
| 9 | Cadeado aberto | Liberar emissao |

**Acao principal:** clicar no **2o icone apos a lupa** para emitir protocolo.

### 4.3 - Modal "Emitir Protocolo" - Tela Inicial

**Campos exibidos:**

| Campo | Exemplo |
|------|---------|
| Comprador | CERTIFAST CERTIFICACAO DIGITAL LTDA |
| Pedido | 17778 |
| Certificado | e-CNPJ A1 - Instalado no Computador |

**Campos para validar:**

| Campo | Obrigatorio | Exemplo |
|------|-------------|---------|
| CNPJ | Sim para PJ | 20776537000155 |
| CPF do titular | Sim | 12461063885 |
| Data nascimento | Sim | 13/10/1971 |
| Possui CNH | Nao | Marcado ou nao |

**Acao:** clicar em **Validar**.

### 4.4 - Formulario Expandido apos Validar

#### Bloco A - Dados para Emissao do Protocolo

| Campo | Obrigatorio | Exemplo |
|------|-------------|---------|
| Nome | Sim | CERTIFAST CERTIFICACAO DIGITAL LTDA |
| Email | Sim | mantovanvp@gmail.com |
| DDD | Sim | 11 |
| Telefone | Sim | 983500019 |
| CEP | Sim | 09750730 |
| Logradouro | Sim | Rua Jose Versolato |
| Numero | Sim | 111 |
| Complemento | Nao | Sala 1106 |
| Bairro | Sim | Centro |
| Cidade | Sim | Sao Bernardo do Campo |
| UF | Sim | SP |
| IBGE | Sim | 3548708 |
| CEI | Nao | - |
| CAEPF do responsavel | Nao | - |
| Numero NIS | Nao | - |

#### Bloco B - Informacoes do Responsavel na Receita Federal

| Campo | Obrigatorio | Exemplo |
|------|-------------|---------|
| Nome do titular | Sim | ALEXANDRE APARECIDO MANTOVAN |
| Email | Sim | mantovanvp@gmail.com |
| DDD | Sim | 11 |
| Telefone | Sim | 983500019 |
| CEP | Sim | 09750730 |
| Logradouro | Sim | Rua Jose Versolato |
| Numero | Sim | 111 |
| Complemento | Nao | Sala 1106 |
| Bairro | Sim | Centro |
| Cidade | Sim | Sao Bernardo do Campo |
| UF | Sim | SP |
| IBGE | Sim | 3548708 |
| Numero do RG | Sim | - |
| Orgao emissor RG | Sim | - |
| UF do RG | Sim | - |
| Profissao | Nao | - |

#### Bloco C - Voucher de Desconto

| Campo | Obrigatorio | Descricao |
|------|-------------|-----------|
| Codigo do voucher | Nao | Codigo de desconto da certificadora |

#### Bloco D - Selecao de AC e AR

| Campo | Obrigatorio | Descricao |
|------|-------------|-----------|
| Autoridade Certificadora | Sim | AC da emissao |
| Autoridade de Registro | Sim | AR vinculada |

### 4.5 - Emitir o Protocolo

Existem tres opcoes conforme a certificadora:

| Botao | Quando usar |
|------|-------------|
| Emitir Protocolo SIGAR | Certificadoras via SIGAR |
| Emitir Protocolo Hope/Gedar | Certificadoras via Hope ou Gedar |
| Emitir Protocolo | Fluxo padrao |

Ao clicar, o sistema exibe algo como **"Emitindo Protocolo... Aguarde..."**.

### 4.6 - Confirmacao e Resultado

Quando a emissao da certo:

- o numero do protocolo e gerado pela certificadora
- o numero fica salvo no pedido
- a coluna `Protocolo` passa a exibir o numero
- o status da venda vira **"Emitida"**
- o cliente segue para validacao de identidade na certificadora

---

## 5. Status Possiveis do Pedido

| Status | Descricao |
|--------|-----------|
| Nao Confirmada | Pedido criado sem pagamento confirmado |
| Emissao Liberada | Pronto para emitir protocolo |
| Emitida | Protocolo gerado com sucesso |
| Cancelada | Pedido cancelado |

---

## 6. Tipos de Emissao Suportados

| Tipo | Descricao |
|------|-----------|
| Videoconferencia | Validacao por video |
| Presencial | Validacao presencial |
| Renovacao | Renovacao de certificado |
| Fast | Emissao acelerada |

---

## 7. Formas de Pagamento Suportadas

| Forma | Confirmacao |
|------|-------------|
| Dinheiro | Manual |
| Safe2Pay - Boleto | Automatica apos compensacao |
| Safe2Pay - Cartao | Automatica apos aprovacao |
| Safe2Pay - Pix | Automatica apos confirmacao |
| Transferencia/Deposito | Manual |

---

## 8. Modelo de Dados para Implementacao

### Entidade: `Pedido`

| Campo | Tipo | Descricao |
|------|------|-----------|
| id_pedido | INT PK | Identificador do pedido |
| comprador_nome | STRING | Nome ou razao social |
| comprador_cnpj_cpf | STRING | Documento do comprador |
| certificado_tipo | STRING | Tipo do certificado |
| tipo_emissao | ENUM | Videoconferencia / Presencial / Renovacao / Fast |
| tipo_venda | ENUM | Balcao / Acordo Operacional / Voucher / Pre-pago |
| status_venda | ENUM | Nao Confirmada / Emissao Liberada / Emitida / Cancelada |
| forma_pagamento | STRING | Forma de pagamento |
| valor_venda | DECIMAL | Valor total |
| protocolo_numero | STRING nullable | Numero do protocolo |
| data_venda | DATETIME | Data/hora da criacao |
| data_status | DATETIME | Ultima atualizacao de status |
| id_agente_registro | FK | AGR responsavel |
| id_pa_emissor | FK | PA/Emissor |

### Entidade: `Protocolo`

| Campo | Tipo | Descricao |
|------|------|-----------|
| id_protocolo | INT PK | Identificador |
| id_pedido | FK | Pedido de origem |
| numero_protocolo | STRING | Numero gerado pela certificadora |
| autoridade_certificadora | STRING | AC utilizada |
| autoridade_registro | STRING | AR vinculada |
| sistema_emissao | ENUM | SIGAR / Hope / Gedar / Padrao |
| data_emissao | DATETIME | Data da emissao |
| voucher_codigo | STRING nullable | Voucher usado |
| titular_nome | STRING | Nome do titular |
| titular_cpf | STRING | CPF do titular |
| titular_data_nascimento | DATE | Data de nascimento |
| titular_possui_cnh | BOOLEAN | Indicador de CNH |
| titular_email | STRING | Email do titular |
| titular_ddd | STRING | DDD do titular |
| titular_telefone | STRING | Telefone do titular |
| titular_rg | STRING | RG |
| titular_rg_orgao | STRING | Orgao emissor |
| titular_rg_uf | STRING | UF do RG |
| titular_profissao | STRING | Profissao |
| empresa_cep | STRING | CEP da empresa |
| empresa_logradouro | STRING | Logradouro |
| empresa_numero | STRING | Numero |
| empresa_complemento | STRING | Complemento |
| empresa_bairro | STRING | Bairro |
| empresa_cidade | STRING | Cidade |
| empresa_uf | STRING | UF |
| empresa_ibge | STRING | Codigo IBGE |
| empresa_cei | STRING nullable | CEI |
| empresa_caepf | STRING nullable | CAEPF |
| empresa_nis | STRING nullable | NIS/PIS |
| responsavel_nome | STRING | Nome do responsavel |
| responsavel_email | STRING | Email do responsavel |
| responsavel_telefone | STRING | Telefone do responsavel |
| responsavel_cep | STRING | CEP do responsavel |
| responsavel_logradouro | STRING | Endereco do responsavel |
| responsavel_numero | STRING | Numero |
| responsavel_complemento | STRING | Complemento |
| responsavel_bairro | STRING | Bairro |
| responsavel_cidade | STRING | Cidade |
| responsavel_uf | STRING | UF |
| responsavel_ibge | STRING | Codigo IBGE |

### Acao: `emitir_protocolo(id_pedido)`

**Pre-condicao**

```text
pedido.status_venda == "Emissao Liberada"
```

**Passos**

1. Buscar dados do pedido
2. Exibir formulario inicial para validacao
3. Consultar base interna e/ou Receita Federal
4. Preencher automaticamente os campos
5. Permitir revisao e complementacao
6. Operador seleciona AC e AR
7. Enviar requisicao ao integrador correto:
   - SIGAR API
   - Hope API
   - Gedar
   - fluxo padrao
8. Receber numero do protocolo
9. Salvar protocolo vinculado ao pedido
10. Atualizar `pedido.protocolo_numero`
11. Atualizar `pedido.status_venda = "Emitida"`
12. Atualizar `pedido.data_status = now()`

**Pos-condicao**

```text
pedido.status_venda == "Emitida"
pedido.protocolo_numero != null
```

---

## 9. Regras de Negocio

- O protocolo so pode ser emitido quando `status_venda == "Emissao Liberada"`
- Um pedido pode ter apenas um protocolo ativo vinculado
- A liberacao manual e feita pelo operador via icone de liberar emissao
- O campo `Possui CNH` influencia a validacao
- O voucher e opcional
- Existem tres caminhos de integracao: `SIGAR`, `Hope/Gedar` e `Padrao`
- Depois da emissao, o pedido nao deve ser excluido sem cancelar o protocolo na certificadora

---

## 10. Observacoes Finais

- O formulario e preenchido automaticamente apos validar, com base interna e/ou Receita Federal
- O operador deve revisar os dados antes da emissao
- A videoconferencia ou validacao presencial ocorre fora do GestaoAR, dentro da certificadora
- A coluna `Protocolo` fica vazia enquanto nao houver emissao e passa a mostrar o numero depois

