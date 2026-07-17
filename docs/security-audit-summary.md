# Auditoria Executiva de Blindagem

Data: 2026-07-17

## Objetivo

Registrar, de forma curta e operacional, o que foi endurecido no CRM e quais pontos ainda merecem atenção de segurança e governança.

## O que foi endurecido

- Checkout com compensação automática quando a cobrança falha.
- Venda cancelada não volta para `vendido` por webhook.
- Deduplicação de venda recente para reduzir duplicidade por clique/reenvio.
- Pedido e protocolo com unicidade em banco.
- Exclusão de venda paga ou emitida bloqueada no backend.
- Troca de protocolo com validação de colisão antes de gravar.
- Timeout nas integrações de pagamento para evitar travamento silencioso.
- UI do Comercial ocultando ações destrutivas quando não fazem sentido.

## Rotas que ainda alteram venda/protocolo

### Comercial

- `POST /api/comercial/vendas/status`
- `POST /api/comercial/vendas/pagamento`
- `POST /api/comercial/vendas/forma-pagamento`
- `PATCH /api/comercial/vendas/:id`
- `PATCH /api/comercial/vendas/:id/titular`
- `DELETE /api/comercial/vendas/:id`

### Checkout

- `POST /api/checkout/submit`
- `POST /api/checkout/webhook/safe2pay`
- `POST /api/checkout/webhook/mercado-pago`

### Catálogo / operação

- `POST /api/comercial/vendas/batch-update`
- `PATCH /api/comercial/vendas/:id/status`
- `PATCH /api/comercial/vendas/:id/titular`
- `DELETE /api/comercial/vendas/:id`

## Risco residual identificado

- A proteção de algumas ações críticas está forte na interface, mas a validação de permissão por rota não ficou evidente em todos os handlers revisados.
- O ideal é que o backend também imponha regra explícita de autorização para alterações em venda, protocolo e exclusão.
- Isso vale principalmente para rotas administrativas que atualizam venda por `id` ou por `protocolo_numero`.

## Recomendação final

- Consolidar autorização no backend por perfil.
- Tratar `protocolo_numero` como campo sensível.
- Manter exclusão bloqueada para vendas pagas/emitidas.
- Usar sempre troca assistida de protocolo para correção operacional.
- Continuar com backup recente obrigatório antes de qualquer deploy.

