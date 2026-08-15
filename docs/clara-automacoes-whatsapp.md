# Clara - Automacoes WhatsApp

Este documento registra a camada paralela de automacoes WhatsApp da Clara.

## Objetivo

Enviar mensagens automaticas e naturais pelo WhatsApp usando a fila oficial do CRM (`communication_outbox`) e a instancia Evolution `atendimento`, sem depender do operador humano.

## Endpoint

`POST /api/automation/clara-whatsapp`

Payload minimo:

```json
{
  "type": "compra_realizada",
  "phone": "11999999999",
  "name": "Nome do cliente",
  "entity_id": "id-da-venda-ou-evento",
  "entity_type": "venda",
  "payload": {}
}
```

## Tipos suportados

- `renovacao_aviso`: chama o cliente para renovar certificado perto do vencimento.
- `compra_realizada`: confirma compra e envia link/Pix/boleto quando disponivel.
- `pagamento_pendente`: reforca pagamento ainda em aberto.
- `agendamento_lembrete`: lembra a validacao e orienta sobre documentos.
- `documentos_validacao`: solicita documentos necessarios para validacao.
- `nota_fiscal_copia`: envia link da nota fiscal ou orienta consultar no portal.
- `reagendamento_link`: envia link para reagendar validacao.

## Campos uteis em `payload`

- `product_name`, `produto` ou `descricao`
- `order_number`, `pedido_numero` ou `pedido`
- `protocol`, `protocolo_numero` ou `protocolo`
- `amount`, `valor` ou `valor_venda`
- `payment_method`, `forma_pagamento` ou `tipo_pagamento`
- `payment_link`, `link_pagamento` ou `charge_url`
- `pix_code`, `qr_code` ou `copia_cola`
- `digitable_line`, `linha_digitavel` ou `barcode_content`
- `scheduled_at`, `data_agendada` ou `agendamento`
- `invoice_url`, `nota_fiscal_url` ou `nf_url`
- `reschedule_url` ou `link_reagendamento`
- `portal_url`

## Antiduplicidade

Toda automacao usa `event_key`.

Se o caller nao informar `event_key`, o backend gera uma chave com:

`clara_whatsapp:<type>:<entity_type>:<entity_id>`

Enquanto existir mensagem `pending`, `processing` ou `sent` com a mesma chave para o mesmo telefone, o CRM nao cria novo disparo duplicado.

## Eventos ja conectados

- Compra/checkout: os disparos de link de pagamento passam a sair com `source=clara`, `clara_mode=automation` e `clara_intent=compra_realizada`.
- Renovacao: o lembrete automatico recorrente passa a sair como Clara, com `clara_intent=renovacao_aviso`.
- Agendamento por e-mail: confirmacao e pedido de documentos passam a ter `event_key` e metadados Clara.

## Proximo encaixe no n8n

O n8n pode chamar o endpoint acima quando identificar:

- cliente pedindo segunda via de nota fiscal;
- cliente pedindo reagendamento;
- pedido pago precisando lembrar envio de documentos;
- pagamento pendente precisando reenviar boleto, Pix ou link.
