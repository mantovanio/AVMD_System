# Contrato do Checkout Aiven

## Endpoint 1
`POST /api/checkout/context`

### Ação `context`
Request:
```json
{
  "action": "context",
  "slug": "loja-exemplo"
}
```

Response esperada:
```json
{
  "ok": true,
  "loja": {},
  "tabela": {},
  "produtos": [],
  "payment_runtime": {
    "modo_teste_geral": false,
    "bloquear_integracoes_reais": false,
    "aviso_checkout": "O atendimento sera liberado apos a confirmacao do pagamento."
  },
  "pagamentos": [],
  "agentes": [],
  "pontos": [],
  "slots": []
}
```

### Ação `lookup_customer`
Request:
```json
{
  "action": "lookup_customer",
  "documento": "12345678901"
}
```

Response esperada:
```json
{
  "ok": true,
  "cadastro": {
    "tipo_cliente": "pessoa_fisica",
    "cpf_cnpj": "12345678901",
    "nome": "Nome do Cliente",
    "nome_fantasia": null,
    "email": "cliente@email.com",
    "telefone": "11999999999",
    "cep": "12345000",
    "logradouro": "Rua Exemplo",
    "numero": "100",
    "complemento": null,
    "bairro": "Centro",
    "cidade": "Sao Paulo",
    "uf": "SP"
  }
}
```

## Endpoint 2
`POST /api/checkout/submit`

Request:
```json
{
  "slug": "loja-exemplo",
  "item_id": "uuid-do-item",
  "comprador": {
    "nome": "Empresa ou Cliente",
    "nome_fantasia": "Fantasia",
    "responsavel_nome": "Responsavel",
    "cpf_cnpj": "12345678901234",
    "email": "financeiro@empresa.com",
    "telefone": "11999999999"
  },
  "fiscal": {
    "cep": "12345000",
    "logradouro": "Rua Exemplo",
    "numero": "100",
    "complemento": "Sala 2",
    "bairro": "Centro",
    "cidade": "Sao Paulo",
    "uf": "SP"
  },
  "titular": {
    "nome": "Titular do Certificado",
    "cpf": "12345678901",
    "data_nascimento": "1990-01-01",
    "email": "titular@email.com",
    "telefone": "11999999999"
  },
  "pagamento": {
    "forma_pagamento_id": "uuid-da-forma"
  },
  "agendamento": {
    "agente_registro_id": "uuid-do-agente",
    "ponto_atendimento_id": "uuid-do-ponto",
    "data_agendada": "2026-06-20T14:00:00-03:00"
  },
  "observacoes": "Texto opcional"
}
```

Response esperada:
```json
{
  "ok": true,
  "message": "Pedido criado com sucesso.",
  "venda_id": "uuid-da-venda",
  "protocolo_numero": null,
  "redirect_url": null
}
```

## Regras importantes
- `slug` pode ser `null` quando a loja institucional padrao for usada.
- `lookup_customer` deve buscar o cadastro ativo mais recente por CPF/CNPJ.
- `submit` deve gravar comprador, faturamento, titular, pagamento e agendamento.
- o frontend depende apenas do contrato acima, nao da implementacao interna do backend.
