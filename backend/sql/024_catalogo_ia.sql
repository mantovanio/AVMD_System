CREATE TABLE IF NOT EXISTS catalogo_ia (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto         TEXT NOT NULL,
  tipo            TEXT NOT NULL DEFAULT 'e-CPF',
  modelo          TEXT NOT NULL DEFAULT 'A1',
  periodo_uso     TEXT NOT NULL DEFAULT '1 ano',
  midia           TEXT,
  tipo_validacao  TEXT NOT NULL DEFAULT 'qualquer',
  preco           NUMERIC(10,2) NOT NULL DEFAULT 0,
  gratuito        BOOLEAN NOT NULL DEFAULT false,
  observacao      TEXT,
  link_compra     TEXT,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_catalogo_ia_tipo ON catalogo_ia (tipo);
CREATE INDEX IF NOT EXISTS idx_catalogo_ia_ativo ON catalogo_ia (ativo);
