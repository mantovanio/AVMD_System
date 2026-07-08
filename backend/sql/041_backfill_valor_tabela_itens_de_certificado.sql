-- Backfill unico: aplica retroativamente a mesma logica de
-- syncTabelaItensFromCertificado (catalogRepository.ts) para itens de
-- tabela de preco criados antes dessa sincronizacao existir.
update tabelas_preco_itens i
set valor = coalesce(c.preco_venda, 0),
    updated_at = now()
from certificados c
where i.certificado_id = c.id
  and i.valor is distinct from coalesce(c.preco_venda, 0);
