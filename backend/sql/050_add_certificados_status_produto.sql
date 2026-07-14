-- Adiciona coluna status_produto na tabela certificados
-- Usada pelo frontend para controlar Ativo/Inativo e exibicao no catalogo

ALTER TABLE certificados ADD COLUMN IF NOT EXISTS status_produto text NOT NULL DEFAULT 'Ativo';

-- Sincronizar com campo ativo existente
UPDATE certificados SET status_produto = CASE WHEN ativo THEN 'Ativo' ELSE 'Inativo' END;
