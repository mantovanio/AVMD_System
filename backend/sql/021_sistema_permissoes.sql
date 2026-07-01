-- =============================================================
-- SISTEMA DE PERMISSOES, MODULOS E PACOTES DE NEGOCIO
-- =============================================================

-- 1. CATALOGO DE MODULOS (features do sistema)
CREATE TABLE IF NOT EXISTS modulos_sistema (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave       text   NOT NULL UNIQUE,          -- 'chat_crm', 'financeiro', etc
  nome        text   NOT NULL,                  -- nome para exibicao
  descricao   text,
  grupo       text   NOT NULL DEFAULT 'geral', -- atendimento, comercial, financeiro, admin, config
  icone       text,                             -- nome do lucide icon
  rota        text,                             -- caminho frontend (ex: /financeiro)
  ordem       int    NOT NULL DEFAULT 0,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. PERFIS DE ACESSO (roles pre-definidas)
CREATE TABLE IF NOT EXISTS perfis_acesso (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text   NOT NULL UNIQUE,           -- 'Administrador', 'Gerente', 'Atendente'
  descricao   text,
  nivel       int    NOT NULL DEFAULT 0,         -- hierarquia (maior = mais acesso)
  padrao      boolean NOT NULL DEFAULT false,    -- perfil atribuido a novos usuarios
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. PERMISSOES DO PERFIL (nivel de acesso por modulo)
CREATE TABLE IF NOT EXISTS perfil_modulos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id   uuid NOT NULL REFERENCES perfis_acesso(id) ON DELETE CASCADE,
  modulo_id   uuid NOT NULL REFERENCES modulos_sistema(id) ON DELETE CASCADE,
  nivel_acesso text NOT NULL DEFAULT 'visualizar' CHECK (nivel_acesso IN ('nenhum', 'visualizar', 'editar', 'admin')),
  UNIQUE(perfil_id, modulo_id)
);

-- 4. SOBRESCRITA INDIVIDUAL (usuario especifico)
CREATE TABLE IF NOT EXISTS profile_modulos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  modulo_id   uuid NOT NULL REFERENCES modulos_sistema(id) ON DELETE CASCADE,
  nivel_acesso text NOT NULL DEFAULT 'visualizar' CHECK (nivel_acesso IN ('nenhum', 'visualizar', 'editar', 'admin')),
  UNIQUE(profile_id, modulo_id)
);

-- 5. PACOTES DE NEGOCIO (templates por segmento)
CREATE TABLE IF NOT EXISTS pacotes_negocio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text   NOT NULL UNIQUE,           -- 'Clinica', 'Advocacia', 'Pizzaria', 'Comercio Geral'
  descricao   text,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 6. MODULOS DO PACOTE
CREATE TABLE IF NOT EXISTS pacote_modulos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pacote_id   uuid NOT NULL REFERENCES pacotes_negocio(id) ON DELETE CASCADE,
  modulo_id   uuid NOT NULL REFERENCES modulos_sistema(id) ON DELETE CASCADE,
  UNIQUE(pacote_id, modulo_id)
);

-- 7. PACOTE DO PARCEIRO/TENANT
ALTER TABLE parceiros
  ADD COLUMN IF NOT EXISTS pacote_id uuid REFERENCES pacotes_negocio(id) ON DELETE SET NULL;

-- 8. VIEW para consulta rapida de permissoes do usuario
CREATE OR REPLACE VIEW profile_permissoes_view AS
SELECT
  p.id AS profile_id,
  p.perfil AS perfil_nome,
  COALESCE(po.nivel_acesso, pm.nivel_acesso, 'nenhum') AS nivel_acesso,
  m.*
FROM profiles p
CROSS JOIN modulos_sistema m
LEFT JOIN perfis_acesso pa ON pa.nome ILIKE REPLACE(p.perfil, '_', ' ')
LEFT JOIN perfil_modulos pm ON pm.perfil_id = pa.id AND pm.modulo_id = m.id
LEFT JOIN profile_modulos po ON po.profile_id = p.id AND po.modulo_id = m.id
WHERE m.ativo = true;

-- 9. MODULES CONFIG (substitui consulta direta ao Supabase)
CREATE TABLE IF NOT EXISTS modules_config (
  module_name text PRIMARY KEY,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_profile_modulos_profile ON profile_modulos(profile_id);
CREATE INDEX IF NOT EXISTS idx_perfil_modulos_perfil ON perfil_modulos(perfil_id);
CREATE INDEX IF NOT EXISTS idx_pacote_modulos_pacote ON pacote_modulos(pacote_id);
