ALTER TABLE perfil_modelos_negocio
  ADD COLUMN IF NOT EXISTS aliquota_imposto NUMERIC(8,4) NOT NULL DEFAULT 7.8,
  ADD COLUMN IF NOT EXISTS imposto_modo TEXT NOT NULL DEFAULT 'fixo',
  ADD COLUMN IF NOT EXISTS simples_rbt12 NUMERIC(14,2);

ALTER TABLE perfil_modelos_negocio
  ALTER COLUMN aliquota_imposto SET DEFAULT 7.8;

ALTER TABLE perfil_modelos_negocio
  DROP CONSTRAINT IF EXISTS perfil_modelos_negocio_aliquota_imposto_check;

ALTER TABLE perfil_modelos_negocio
  ADD CONSTRAINT perfil_modelos_negocio_aliquota_imposto_check
  CHECK (aliquota_imposto >= 0 AND aliquota_imposto <= 100);

ALTER TABLE perfil_modelos_negocio
  DROP CONSTRAINT IF EXISTS perfil_modelos_negocio_imposto_modo_check;

ALTER TABLE perfil_modelos_negocio
  ADD CONSTRAINT perfil_modelos_negocio_imposto_modo_check
  CHECK (imposto_modo IN ('fixo', 'simples_anexo_iii'));
