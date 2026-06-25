-- Hierarquia de agentes e vendedores + comissões por perfil

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS parent_profile_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nivel_hierarquia      int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ponto_atendimento_id  uuid REFERENCES pontos_atendimento(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS link_loja             text,
  ADD COLUMN IF NOT EXISTS supervisao_pct        numeric(6,3) NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_link_loja
  ON profiles(link_loja) WHERE link_loja IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_parent ON profiles(parent_profile_id);
CREATE INDEX IF NOT EXISTS idx_profiles_ponto  ON profiles(ponto_atendimento_id);

-- Faixas de comissão agora são por perfil e por tipo
ALTER TABLE faixas_comissao
  ADD COLUMN IF NOT EXISTS profile_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS tipo_comissao text NOT NULL DEFAULT 'validacao';

CREATE INDEX IF NOT EXISTS idx_faixas_profile ON faixas_comissao(profile_id);
CREATE INDEX IF NOT EXISTS idx_faixas_tipo    ON faixas_comissao(tipo_comissao);
