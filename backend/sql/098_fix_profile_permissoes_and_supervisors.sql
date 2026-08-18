-- =============================================================
-- 098: AJUSTE E FLEXIBILIZACAO DE PERMISSOES E SUPERVISORES
-- =============================================================

-- 1. Garante perfis essenciais na tabela perfis_acesso
INSERT INTO perfis_acesso (nome, descricao, nivel, padrao) VALUES
  ('Administrador',            'Acesso total a todas as funcionalidades do sistema',                   100, false),
  ('Supervisor',               'Supervisão ampla de atendimento, comercial, renovações e gestão',       85, false),
  ('Supervisor do Chat',       'Supervisão e gestão de conversas ao vivo, atendentes e clientes',       75, false),
  ('Supervisor de Renovações',  'Supervisão e gestão da base de renovações, follow-up e vendas',         75, false),
  ('Gerente',                  'Gestão e operação geral do negócio',                                    80, false),
  ('Agente de Registro',       'Emissão de certificados, agendamento e atendimento ao cliente',         40, false),
  ('Vendedor',                 'Vendas comerciais, gestão de clientes e renovações',                    40, false),
  ('Revendedor',               'Vendas e parcerias comerciais',                                         35, false),
  ('Financeiro',               'Gestão financeira, contas e relatórios',                                40, false),
  ('Atendente',                'Atendimento operacional e acompanhamento de clientes',                  30, false),
  ('Funcionário',              'Acesso padrão operacional de funcionário',                              30, false),
  ('Visualizador',             'Acesso de visualização de painéis e relatórios',                        20, false)
ON CONFLICT (nome) DO UPDATE
SET descricao = EXCLUDED.descricao,
    nivel = EXCLUDED.nivel;

-- 2. Permissões padrão para Supervisor Geral
INSERT INTO perfil_modulos (perfil_id, modulo_id, nivel_acesso)
SELECT pa.id, m.id, 'admin'
FROM perfis_acesso pa, modulos_sistema m
WHERE pa.nome = 'Supervisor'
  AND m.ativo = true
  AND m.chave IN ('dashboard', 'comercial', 'clientes', 'chat_crm', 'engage', 'renovacoes', 'financeiro', 'relatorios', 'parceiros', 'catalogo_ia', 'notificacoes')
ON CONFLICT (perfil_id, modulo_id)
DO UPDATE SET nivel_acesso = EXCLUDED.nivel_acesso;

-- 3. Permissões padrão para Supervisor do Chat
INSERT INTO perfil_modulos (perfil_id, modulo_id, nivel_acesso)
SELECT pa.id, m.id, data.nivel
FROM perfis_acesso pa, modulos_sistema m, (VALUES
  ('dashboard',     'visualizar'),
  ('chat_crm',      'admin'),
  ('engage',        'admin'),
  ('clientes',      'editar'),
  ('relatorios',    'visualizar'),
  ('notificacoes',  'editar')
) AS data(chave, nivel)
WHERE pa.nome = 'Supervisor do Chat'
  AND m.chave = data.chave
  AND m.ativo = true
ON CONFLICT (perfil_id, modulo_id)
DO UPDATE SET nivel_acesso = EXCLUDED.nivel_acesso;

-- 4. Permissões padrão para Supervisor de Renovações
INSERT INTO perfil_modulos (perfil_id, modulo_id, nivel_acesso)
SELECT pa.id, m.id, data.nivel
FROM perfis_acesso pa, modulos_sistema m, (VALUES
  ('dashboard',     'visualizar'),
  ('renovacoes',    'admin'),
  ('comercial',     'admin'),
  ('clientes',      'editar'),
  ('relatorios',    'editar'),
  ('notificacoes',  'editar')
) AS data(chave, nivel)
WHERE pa.nome = 'Supervisor de Renovações'
  AND m.chave = data.chave
  AND m.ativo = true
ON CONFLICT (perfil_id, modulo_id)
DO UPDATE SET nivel_acesso = EXCLUDED.nivel_acesso;

-- 5. Atualiza VIEW profile_permissoes_view com resolução completa e inteligente
CREATE OR REPLACE VIEW profile_permissoes_view AS
SELECT
  p.id AS profile_id,
  p.perfil AS perfil_nome,
  CASE
    -- Administradores têm acesso irrestrito
    WHEN p.perfil IN ('admin', 'superadmin') THEN 'admin'
    -- Sobrescrita manual em profile_modulos (maior precedência de customização)
    WHEN po.nivel_acesso IS NOT NULL THEN po.nivel_acesso
    -- Verificação direta nas permissões JSONB configuradas no cadastro do usuário (profiles.permissoes)
    WHEN p.permissoes IS NOT NULL AND jsonb_typeof(p.permissoes) = 'array' AND (
      p.permissoes ? m.chave
      OR (m.chave = 'chat_crm' AND (p.permissoes ? 'chat' OR p.permissoes ? 'chat_crm'))
      OR (m.chave = 'catalogo_ia' AND p.permissoes ? 'catalogo_ia')
      OR (m.chave = 'marketplace' AND (p.permissoes ? 'marketplace' OR p.permissoes ? 'shop'))
    ) THEN
      CASE
        WHEN p.perfil IN ('supervisor', 'supervisor_chat', 'supervisor_renovacoes', 'gerente') THEN 'admin'
        ELSE 'editar'
      END
    -- Permissão padrão herdada do perfil (perfis_acesso -> perfil_modulos)
    WHEN pm.nivel_acesso IS NOT NULL THEN pm.nivel_acesso
    ELSE 'nenhum'
  END AS nivel_acesso,
  m.id,
  m.chave,
  m.nome,
  m.descricao,
  m.grupo,
  m.icone,
  m.rota,
  m.ordem,
  m.ativo,
  m.created_at,
  m.updated_at
FROM profiles p
CROSS JOIN modulos_sistema m
LEFT JOIN perfis_acesso pa ON (
  pa.nome ILIKE p.perfil
  OR pa.nome ILIKE REPLACE(p.perfil, '_', ' ')
  OR (p.perfil = 'admin' AND pa.nome ILIKE 'Administrador')
  OR (p.perfil = 'supervisor' AND pa.nome ILIKE 'Supervisor')
  OR (p.perfil = 'supervisor_chat' AND (pa.nome ILIKE 'Supervisor do Chat' OR pa.nome ILIKE 'Supervisor Chat'))
  OR (p.perfil = 'supervisor_renovacoes' AND (pa.nome ILIKE 'Supervisor de Renovações' OR pa.nome ILIKE 'Supervisor Renovacoes'))
  OR (p.perfil = 'agente_registro' AND (pa.nome ILIKE 'Agente de Registro' OR pa.nome ILIKE 'Agente Registro'))
  OR (p.perfil = 'usuario' AND (pa.nome ILIKE 'Funcionário' OR pa.nome ILIKE 'Atendente' OR pa.nome ILIKE 'Funcionario'))
  OR (p.perfil = 'vendedor' AND pa.nome ILIKE 'Vendedor')
  OR (p.perfil = 'revendedor' AND pa.nome ILIKE 'Revendedor')
)
LEFT JOIN perfil_modulos pm ON pm.perfil_id = pa.id AND pm.modulo_id = m.id
LEFT JOIN profile_modulos po ON po.profile_id = p.id AND po.modulo_id = m.id
WHERE m.ativo = true;
