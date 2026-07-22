-- 054: Corrige a fonte dos produtos SafeID/Nuvem sem perder o certificado principal.
-- SafeID/Nuvem e formato/forma de emissao; categoria continua e-CPF/e-PF/e-CNPJ/e-PJ.
UPDATE certificados
SET categoria = CASE
      WHEN lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) LIKE '%e-cnpj%'
        OR lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) LIKE '%mei%' THEN 'e-CNPJ'
      WHEN lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) LIKE '%nf-e%'
        OR lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) LIKE '%nfe%'
        OR lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) LIKE '%nota fiscal%'
        OR lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) LIKE '%e-pj%' THEN 'e-PJ'
      WHEN lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) LIKE '%e-pf%' THEN 'e-PF'
      WHEN lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) LIKE '%e-cpf%'
        OR lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) LIKE '%medico%'
        OR lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) LIKE '%médico%'
        OR lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) LIKE '%juridico%'
        OR lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) LIKE '%engenheiro%'
        OR lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) LIKE '%saude%'
        OR lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) LIKE '%arquiteto%' THEN 'e-CPF'
      ELSE categoria
    END,
    updated_at = now()
WHERE ativo = true
  AND lower(coalesce(tipo, '') || ' ' || coalesce(descricao_produto, '') || ' ' || coalesce(descricao, '')) ~ 'safeid|nuvem|cloud'
  AND categoria IS NOT NULL;
