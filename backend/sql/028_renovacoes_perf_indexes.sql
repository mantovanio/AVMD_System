-- ============================================================
-- 028_renovacoes_perf_indexes.sql
-- Melhora performance de listagem em /api/renovacoes
-- @requires-table renovacoes
-- ============================================================

-- Janela operacional/historico:
-- WHERE deleted_at IS NULL
--   AND data_vencimento >=/< (CURRENT_DATE - interval)
-- ORDER BY data_vencimento
-- LIMIT/OFFSET
CREATE INDEX IF NOT EXISTS idx_renovacoes_active_data_vencimento
  ON renovacoes (data_vencimento)
  WHERE deleted_at IS NULL;

-- Fluxo N8N e filtros por status + vencimento com registro ativo
CREATE INDEX IF NOT EXISTS idx_renovacoes_active_status_data_vencimento
  ON renovacoes (status, data_vencimento)
  WHERE deleted_at IS NULL;
