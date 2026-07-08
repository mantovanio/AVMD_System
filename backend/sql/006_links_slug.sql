-- Slug curto para links de produtos (URL amigável em vez de UUID)
ALTER TABLE links_produtos ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE INDEX IF NOT EXISTS idx_links_produtos_slug ON links_produtos (slug) WHERE slug IS NOT NULL;

-- Gera slugs para registros existentes que ainda não têm slug
UPDATE links_produtos
   SET slug = regexp_replace(
                regexp_replace(
                  lower(trim(tipo_certificado)),
                  '[^a-z0-9]+', '-', 'g'
                ),
                '^-+|-+$', '', 'g'
              )
 WHERE slug IS NULL;
