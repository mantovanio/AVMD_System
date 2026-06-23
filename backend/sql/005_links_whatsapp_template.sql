-- Vincula um template de WhatsApp a cada tipo de produto
ALTER TABLE links_produtos
  ADD COLUMN IF NOT EXISTS whatsapp_template_id UUID REFERENCES communication_templates(id) ON DELETE SET NULL;
