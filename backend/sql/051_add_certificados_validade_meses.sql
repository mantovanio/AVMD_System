-- Adiciona coluna validade_meses na tabela certificados
-- Usada para converter validade textual em numero de meses

ALTER TABLE certificados ADD COLUMN IF NOT EXISTS validade_meses integer;
