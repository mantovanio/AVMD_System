CREATE TABLE IF NOT EXISTS cancelamentos_venda (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venda_id                      UUID NOT NULL REFERENCES vendas_certificados(id) ON DELETE RESTRICT,
  motivo                        TEXT NOT NULL,
  dentro_prazo_30d              BOOLEAN NOT NULL DEFAULT false,
  valor_reembolsado             NUMERIC(12,2),
  custo_operacional             NUMERIC(12,2) NOT NULL DEFAULT 0,
  comissao_vendedor_revertida   NUMERIC(12,2) NOT NULL DEFAULT 0,
  comissao_agente_revertida     NUMERIC(12,2) NOT NULL DEFAULT 0,
  estorno_gateway_ref           TEXT,
  estorno_realizado             BOOLEAN NOT NULL DEFAULT false,
  observacoes                   TEXT,
  cancelado_por                 UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cancelamentos_venda_venda_id ON cancelamentos_venda (venda_id);
