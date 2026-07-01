-- =============================================================
-- SEED: MODULOS, PERFIS E PACOTES
-- =============================================================

-- MODULOS DO SISTEMA
INSERT INTO modulos_sistema (chave, nome, descricao, grupo, icone, rota, ordem) VALUES
  ('dashboard',     'Dashboard',       'Painel de indicadores e KPIs',                    'operacao',      'LayoutDashboard',  '/dashboard',     1),
  ('comercial',     'Comercial',       'Vendas, agenda, precificacao e comissoes',        'operacao',      'ShoppingCart',     '/comercial',     2),
  ('renovacoes',    'Renovacoes',      'Campanhas de renovacao e follow-up',              'operacao',      'RefreshCw',        '/renovacoes',    3),
  ('clientes',      'Clientes',        'Base de clientes e historico de comunicacao',     'relacionamento','Users',             '/clientes',      4),
  ('chat_crm',      'Chat CRM',        'Central de atendimento multicanal',               'relacionamento','MessageCircle',     '/chat',          5),
  ('parceiros',     'Parceiros',       'Gestao de parceiros e pontos de atendimento',     'relacionamento','Handshake',         '/parceiros',     6),
  ('financeiro',    'Financeiro',      'Contas a pagar/receber, bancos, custos, NFSe',    'gestao',        'Wallet',            '/financeiro',    7),
  ('relatorios',    'Relatorios',      'Relatorios gerenciais e comissoes',               'gestao',        'FileText',          '/relatorios',    8),
  ('catalogo_ia',   'Catalogo IA',     'Catalogo de produtos para agente IA',             'sistema',       'BookOpen',          '/catalogo-ia',   9),
  ('configuracoes', 'Configuracoes',   'Configuracoes do sistema e integracoes',          'sistema',       'Settings',          '/configuracoes',10),
  ('marketplace',   'Marketplace',     'Loja publica e checkout',                          'comercial',     'Store',             '/shop',         11),
  ('notificacoes',  'Notificacoes',    'Central de notificacoes e alertas',               'sistema',       'Bell',              NULL,             12)
ON CONFLICT (chave) DO NOTHING;

-- PERFIS DE ACESSO
INSERT INTO perfis_acesso (nome, descricao, nivel, padrao) VALUES
  ('Administrador',  'Acesso total a todas as funcionalidades do sistema',        100, false),
  ('Gerente',        'Acesso a operacao, relacionamento e gestao',                 80,  false),
  ('Atendente',      'Acesso a chat, clientes e dashboard',                       50,  true),
  ('Vendedor',       'Acesso ao comercial, clientes e renovacoes',                40,  false),
  ('Agente Registro','Acesso a emissao de certificados e agenda',                 30,  false),
  ('Financeiro',     'Acesso apenas ao modulo financeiro e relatorios',           20,  false),
  ('Visualizador',   'Acesso apenas leitura a dashboards e relatorios',           10,  false)
ON CONFLICT (nome) DO NOTHING;

-- PERMISSOES POR PERFIL
-- Administrador: tudo admin
INSERT INTO perfil_modulos (perfil_id, modulo_id, nivel_acesso)
SELECT pa.id, m.id, 'admin'
FROM perfis_acesso pa, modulos_sistema m
WHERE pa.nome = 'Administrador'
  AND m.ativo = true
ON CONFLICT (perfil_id, modulo_id) DO NOTHING;

-- Gerente
INSERT INTO perfil_modulos (perfil_id, modulo_id, nivel_acesso)
SELECT pa.id, m.id, nivel FROM perfis_acesso pa, modulos_sistema m, (VALUES
  ('dashboard',     'admin'),
  ('comercial',     'admin'),
  ('renovacoes',    'admin'),
  ('clientes',      'editar'),
  ('chat_crm',      'visualizar'),
  ('parceiros',     'editar'),
  ('financeiro',    'editar'),
  ('relatorios',    'editar'),
  ('catalogo_ia',   'editar'),
  ('configuracoes', 'visualizar'),
  ('marketplace',   'visualizar'),
  ('notificacoes',  'editar')
) AS data(chave, nivel)
WHERE pa.nome = 'Gerente'
  AND m.chave = data.chave
ON CONFLICT (perfil_id, modulo_id) DO NOTHING;

-- Atendente
INSERT INTO perfil_modulos (perfil_id, modulo_id, nivel_acesso)
SELECT pa.id, m.id, nivel FROM perfis_acesso pa, modulos_sistema m, (VALUES
  ('dashboard',     'visualizar'),
  ('clientes',      'editar'),
  ('chat_crm',      'editar'),
  ('renovacoes',    'editar'),
  ('notificacoes',  'visualizar')
) AS data(chave, nivel)
WHERE pa.nome = 'Atendente'
  AND m.chave = data.chave
ON CONFLICT (perfil_id, modulo_id) DO NOTHING;

-- Vendedor
INSERT INTO perfil_modulos (perfil_id, modulo_id, nivel_acesso)
SELECT pa.id, m.id, nivel FROM perfis_acesso pa, modulos_sistema m, (VALUES
  ('dashboard',     'visualizar'),
  ('comercial',     'editar'),
  ('clientes',      'editar'),
  ('renovacoes',    'editar'),
  ('parceiros',     'visualizar'),
  ('relatorios',    'visualizar'),
  ('notificacoes',  'visualizar')
) AS data(chave, nivel)
WHERE pa.nome = 'Vendedor'
  AND m.chave = data.chave
ON CONFLICT (perfil_id, modulo_id) DO NOTHING;

-- Agente Registro
INSERT INTO perfil_modulos (perfil_id, modulo_id, nivel_acesso)
SELECT pa.id, m.id, nivel FROM perfis_acesso pa, modulos_sistema m, (VALUES
  ('dashboard',     'visualizar'),
  ('comercial',     'editar'),
  ('clientes',      'editar'),
  ('chat_crm',      'editar'),
  ('renovacoes',    'editar')
) AS data(chave, nivel)
WHERE pa.nome = 'Agente Registro'
  AND m.chave = data.chave
ON CONFLICT (perfil_id, modulo_id) DO NOTHING;

-- Financeiro
INSERT INTO perfil_modulos (perfil_id, modulo_id, nivel_acesso)
SELECT pa.id, m.id, nivel FROM perfis_acesso pa, modulos_sistema m, (VALUES
  ('dashboard',     'visualizar'),
  ('financeiro',    'editar'),
  ('relatorios',    'editar'),
  ('notificacoes',  'visualizar')
) AS data(chave, nivel)
WHERE pa.nome = 'Financeiro'
  AND m.chave = data.chave
ON CONFLICT (perfil_id, modulo_id) DO NOTHING;

-- Visualizador
INSERT INTO perfil_modulos (perfil_id, modulo_id, nivel_acesso)
SELECT pa.id, m.id, nivel FROM perfis_acesso pa, modulos_sistema m, (VALUES
  ('dashboard',     'visualizar'),
  ('relatorios',    'visualizar')
) AS data(chave, nivel)
WHERE pa.nome = 'Visualizador'
  AND m.chave = data.chave
ON CONFLICT (perfil_id, modulo_id) DO NOTHING;

-- PACOTES DE NEGOCIO
INSERT INTO pacotes_negocio (nome, descricao) VALUES
  ('Comercio Geral',   'Pacote completo para comercios em geral: vendas, estoque, financeiro, atendimento'),
  ('Clinica',          'Pacote para clinicas medicas/odontologicas: agendamento, prontuario, atendimento'),
  ('Advocacia',        'Pacote para escritorios de advocacia: agenda, prazos, clientes, financeiro'),
  ('Pizzaria',         'Pacote para pizzarias e restaurantes: cardapio, pedidos, delivery, caixa'),
  ('Certificadora',    'Pacote para certificadoras digitais: emissao, renovacao, agenda, parcerias'),
  ('Autonomo',         'Pacote minimalista para profissionais autonomos')
ON CONFLICT (nome) DO NOTHING;

-- MODULOS POR PACOTE
-- Comercio Geral: todos os modulos exceto catalogo_ia especifico
INSERT INTO pacote_modulos (pacote_id, modulo_id)
SELECT p.id, m.id FROM pacotes_negocio p, modulos_sistema m
WHERE p.nome = 'Comercio Geral'
  AND m.ativo = true
ON CONFLICT (pacote_id, modulo_id) DO NOTHING;

-- Clinica
INSERT INTO pacote_modulos (pacote_id, modulo_id)
SELECT p.id, m.id FROM pacotes_negocio p, modulos_sistema m
WHERE p.nome = 'Clinica'
  AND m.chave IN ('dashboard','clientes','chat_crm','financeiro','relatorios','configuracoes','notificacoes')
ON CONFLICT (pacote_id, modulo_id) DO NOTHING;

-- Advocacia
INSERT INTO pacote_modulos (pacote_id, modulo_id)
SELECT p.id, m.id FROM pacotes_negocio p, modulos_sistema m
WHERE p.nome = 'Advocacia'
  AND m.chave IN ('dashboard','clientes','chat_crm','financeiro','relatorios','configuracoes','notificacoes')
ON CONFLICT (pacote_id, modulo_id) DO NOTHING;

-- Pizzaria
INSERT INTO pacote_modulos (pacote_id, modulo_id)
SELECT p.id, m.id FROM pacotes_negocio p, modulos_sistema m
WHERE p.nome = 'Pizzaria'
  AND m.chave IN ('dashboard','chat_crm','financeiro','relatorios','configuracoes','notificacoes')
ON CONFLICT (pacote_id, modulo_id) DO NOTHING;

-- Certificadora: todos os modulos
INSERT INTO pacote_modulos (pacote_id, modulo_id)
SELECT p.id, m.id FROM pacotes_negocio p, modulos_sistema m
WHERE p.nome = 'Certificadora'
  AND m.ativo = true
ON CONFLICT (pacote_id, modulo_id) DO NOTHING;

-- Autonomo
INSERT INTO pacote_modulos (pacote_id, modulo_id)
SELECT p.id, m.id FROM pacotes_negocio p, modulos_sistema m
WHERE p.nome = 'Autonomo'
  AND m.chave IN ('dashboard','chat_crm','financeiro','relatorios')
ON CONFLICT (pacote_id, modulo_id) DO NOTHING;

-- MODULES CONFIG (legado — compatibilidade frontend)
INSERT INTO modules_config (module_name, enabled) VALUES
  ('chat_interno', true),
  ('crm',          true),
  ('agendamentos', true)
ON CONFLICT (module_name) DO NOTHING;
