-- Normaliza a exceção importada com a razão comercial da Isabella no campo
-- de vendedor. O protocolo e o ponto de atendimento tornam o alvo inequívoco.
do $$
declare
  isabella_profile_id uuid;
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

  update vendas_certificados v
  set
    vendedor_id = isabella_profile_id,
    agente_registro_id = isabella_profile_id,
    metadata = jsonb_set(
      jsonb_set(
        coalesce(v.metadata, '{}'::jsonb),
        '{vendedor_importado}',
        to_jsonb('Isabella Vidal'::text),
        true
      ),
      '{agente_registro_importado}',
      to_jsonb('Isabella Vidal'::text),
      true
    ),
    updated_at = now()
  from pontos_atendimento pt
  where pt.id = v.ponto_atendimento_id
    and lower(trim(pt.nome)) = 'certiid bh'
    and v.pedido_numero = '18272'
    and v.protocolo_numero = '1009792028'
    and lower(trim(coalesce(v.metadata->>'agente_registro_importado', ''))) = 'isabella de oliveira vidal';

  get diagnostics affected_rows = row_count;

  if affected_rows <> 1 then
    raise exception 'Era esperado corrigir 1 venda, mas foram encontradas %.', affected_rows;
  end if;
end
$$;
