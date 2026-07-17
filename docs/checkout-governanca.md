# Governanca do Checkout

Este documento registra as garantias tecnicas previstas para o fluxo de compra de certificado.

## O que o sistema precisa garantir

- Nao criar venda duplicada em clique repetido, recarga ou reenvio do gateway.
- Compensar etapas criadas quando a cobranca falhar.
- Registrar a trilha do fluxo em metadata para auditoria.
- Manter webhook idempotente e sem regressao de status.
- Evitar envio de notificacoes quando a cobranca nao existir de fato.
- Separar cancelamento operacional de rollback tecnico.

## Fluxo protegido

1. Cadastro do comprador.
2. Cadastro do titular.
3. Criacao da venda.
4. Criacao do agendamento, quando houver.
5. Geracao da cobranca.
6. Disparo de notificacoes apenas apos cobranca valida.

## Compensacao prevista

Se a cobranca falhar depois da venda criada:

- o agendamento ligado a venda e cancelado
- a venda e marcada como cancelada
- o estado do fluxo e gravado em `metadata.checkout_flow`
- a falha fica preservada para auditoria

## Observacoes de implementacao

- O banco ja suporta transacao com `BEGIN`, `COMMIT` e `ROLLBACK`.
- As etapas de cadastro e criacao de venda continuam isoladas para preservar consistencia local.
- A compensacao funciona como camada extra de seguranca quando a parte externa falha.

