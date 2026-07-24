-- Normaliza os vínculos das vendas do ponto CertiID BH feitas e validadas
-- por Isabella Vidal. Não altera valores, datas, pedidos ou protocolos.
do $$
declare
  isabella_profile_id uuid;
  bh_point_id uuid;
  affected_rows integer;
begin
  select id
    into isabella_profile_id
  from profiles
  where lower(trim(nome)) = 'isabella vidal'
  limit 1;

  if isabella_profile_id is null then
    raise exception 'Perfil Isabella Vidal não encontrado.';
  end if;

  select id
    into bh_point_id
  from pontos_atendimento
  where lower(trim(nome)) = 'certiid bh'
  limit 1;

  if bh_point_id is null then
    raise exception 'Ponto de atendimento CertiID BH não encontrado.';
  end if;

  update vendas_certificados
  set
    vendedor_id = isabella_profile_id,
    agente_registro_id = isabella_profile_id,
    metadata = jsonb_set(
      jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{vendedor_importado}',
        to_jsonb('Isabella Vidal'::text),
        true
      ),
      '{agente_registro_importado}',
      to_jsonb('Isabella Vidal'::text),
      true
    ),
    updated_at = now()
  where ponto_atendimento_id = bh_point_id
    and lower(trim(coalesce(metadata->>'vendedor_importado', ''))) in (
      'isabella de oliveira vidal - isabella',
      'isabella vidal'
    )
    and lower(trim(coalesce(metadata->>'agente_registro_importado', ''))) in (
      'isabella de oliveira vidal',
      'isabella vidal'
    );

  get diagnostics affected_rows = row_count;
  raise notice 'Vendas do ponto CertiID BH normalizadas: %', affected_rows;
end
$$;
