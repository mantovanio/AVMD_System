ALTER TABLE perfil_modelos_negocio
  ADD COLUMN IF NOT EXISTS aliquota_imposto NUMERIC(8,4) NOT NULL DEFAULT 9;

ALTER TABLE perfil_modelos_negocio
  DROP CONSTRAINT IF EXISTS perfil_modelos_negocio_aliquota_imposto_check;

ALTER TABLE perfil_modelos_negocio
  ADD CONSTRAINT perfil_modelos_negocio_aliquota_imposto_check
  CHECK (aliquota_imposto >= 0 AND aliquota_imposto <= 100);
