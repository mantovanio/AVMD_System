UPDATE profiles
SET metadata = coalesce(metadata, '{}'::jsonb)
               || '{"finance_only":true,"origem":"repasse_comercial"}'::jsonb,
    updated_at = now()
WHERE clerk_user_id IS NULL
  AND parceiro_id IS NOT NULL
  AND coalesce(trim(email), '') = ''
  AND status = 'ativo';

UPDATE profiles
SET status = 'removido',
    observacoes = concat_ws(
      ' ',
      nullif(trim(observacoes), ''),
      'Cadastro duplicado sem login removido; acesso oficial preservado.'
    ),
    updated_at = now()
WHERE id = '2fb1f43a-8ecc-4180-b07c-ce2dda89c373'::uuid
  AND clerk_user_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM vendas_certificados WHERE vendedor_id = profiles.id OR agente_registro_id = profiles.id)
  AND NOT EXISTS (SELECT 1 FROM agendamentos_validacao WHERE agente_registro_id = profiles.id)
  AND NOT EXISTS (SELECT 1 FROM perfil_repasse_regras WHERE child_profile_id = profiles.id OR parent_profile_id = profiles.id);
