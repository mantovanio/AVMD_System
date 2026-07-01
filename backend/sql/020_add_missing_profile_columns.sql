-- Adiciona colunas que estao no codigo TypeScript mas faltam no banco
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS vinculo_nome text,
  ADD COLUMN IF NOT EXISTS observacoes  text,
  ADD COLUMN IF NOT EXISTS clerk_user_id text;
