-- 104: Adiciona constraint UNIQUE em cpf na tabela titulares_certificado
-- Necessário para o ON CONFLICT (cpf) do upsertTitular funcionar corretamente
ALTER TABLE titulares_certificado ADD CONSTRAINT titulares_certificado_cpf_unique UNIQUE (cpf);
