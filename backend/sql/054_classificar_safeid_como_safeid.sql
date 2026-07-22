-- 054: Corrige a fonte do filtro da loja.
-- Produtos em nuvem/SafeID nao devem aparecer como e-CPF/e-CNPJ/e-PF comuns.
UPDATE certificados
SET categoria = 'Nuvem',
    updated_at = now()
WHERE ativo = true
  AND lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) ~ 'safeid|nuvem|cloud'
  AND coalesce(categoria, '') <> 'Nuvem';
