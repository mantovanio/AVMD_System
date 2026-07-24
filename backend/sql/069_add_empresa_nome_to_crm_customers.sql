-- Separa pessoa e empresa no CRM do chat.
ALTER TABLE crm_customers
  ADD COLUMN IF NOT EXISTS empresa_nome TEXT;

