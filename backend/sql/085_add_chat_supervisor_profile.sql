DO $migration$
BEGIN
  -- Algumas instalacoes ainda usam apenas profiles.perfil. Registra tambem
  -- no catalogo modular quando essas tabelas estiverem disponiveis.
  IF to_regclass('public.perfis_acesso') IS NOT NULL
     AND to_regclass('public.modulos_sistema') IS NOT NULL
     AND to_regclass('public.perfil_modulos') IS NOT NULL
  THEN
    INSERT INTO perfis_acesso (nome, descricao, nivel, padrao)
    VALUES (
      'Supervisor do Chat',
      'Acesso completo ao chat e a todas as conversas, sem permissao administrativa geral',
      60,
      false
    )
    ON CONFLICT (nome) DO UPDATE
    SET descricao = EXCLUDED.descricao,
        nivel = EXCLUDED.nivel;

    INSERT INTO perfil_modulos (perfil_id, modulo_id, nivel_acesso)
    SELECT pa.id, m.id, 'admin'
    FROM perfis_acesso pa
    JOIN modulos_sistema m ON m.chave = 'chat_crm'
    WHERE pa.nome = 'Supervisor do Chat'
    ON CONFLICT (perfil_id, modulo_id)
    DO UPDATE SET nivel_acesso = EXCLUDED.nivel_acesso;
  END IF;
END;
$migration$;
