-- Vincula links de produtos a vendedores específicos
ALTER TABLE links_produtos ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_links_produtos_vendedor ON links_produtos (vendedor_id) WHERE vendedor_id IS NOT NULL;
