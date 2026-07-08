-- Cria a tabela links_produtos (migration standalone para producao)
CREATE TABLE IF NOT EXISTS links_produtos (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_certificado  TEXT    NOT NULL UNIQUE,
  link_renovacao    TEXT,
  link_nova_emissao TEXT,
  descricao         TEXT,
  ativo             BOOLEAN NOT NULL DEFAULT true,
  slug              TEXT,
  vendedor_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_links_produtos_slug ON links_produtos (slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_links_produtos_vendedor ON links_produtos (vendedor_id) WHERE vendedor_id IS NOT NULL;

-- Gera slugs para registros existentes que ainda nao tem slug
UPDATE links_produtos
   SET slug = regexp_replace(
                regexp_replace(
                  lower(trim(tipo_certificado)),
                  '[^a-z0-9]+', '-', 'g'
                ),
                '^-+|-+$', '', 'g'
              )
 WHERE slug IS NULL;
