-- Uma pessoa pode acumular os papéis de agente e vendedor sem ganhar outro usuário.
-- Consolida os perfis financeiros auxiliares criados para Alice, Daniel e Renata.

begin;

create temporary table perfil_unificacao (
  duplicado_id uuid primary key,
  principal_id uuid not null,
  parceiro_id uuid not null
) on commit drop;

insert into perfil_unificacao (duplicado_id, principal_id, parceiro_id) values
  ('1c4522b9-6b62-401e-aa5b-c000e62ab7da', '5009c92a-9fb9-4161-b401-366ac3c78be5', '2c739ae1-326a-4966-803e-7b30055d177b'),
  ('75e92bb3-a3cb-4aeb-927f-c3711720d15e', '4d98b153-8040-434d-8646-dc4f53621035', '6448bcb0-35b4-44fb-b4e6-546d64a3e204'),
  ('4de94ed1-4509-4643-a8d3-6fd25c0fdf26', '9fa0933a-64c6-4e8b-955d-d320bf99b95b', 'c8f45901-7a3a-45b3-9b59-e015159e0c99')
on conflict do nothing;

-- Evita conflito caso a mesma regra já exista no perfil principal.
delete from perfil_repasse_regras duplicada
using perfil_unificacao mapa
where duplicada.parent_profile_id = mapa.duplicado_id
  and exists (
    select 1
    from perfil_repasse_regras principal
    where principal.parent_profile_id = mapa.principal_id
      and principal.child_profile_id = duplicada.child_profile_id
      and principal.ponto_atendimento_id = duplicada.ponto_atendimento_id
      and principal.escopo = duplicada.escopo
  );

update perfil_repasse_regras regra
set parent_profile_id = mapa.principal_id,
    updated_at = now()
from perfil_unificacao mapa
where regra.parent_profile_id = mapa.duplicado_id;

update profiles principal
set parceiro_id = mapa.parceiro_id,
    metadata = coalesce(principal.metadata, '{}'::jsonb)
      || '{"papeis_adicionais":["agente_registro","vendedor"],"cadastro_unico_multifuncao":true}'::jsonb,
    updated_at = now()
from perfil_unificacao mapa
where principal.id = mapa.principal_id;

update profiles duplicado
set status = 'removido',
    parceiro_id = null,
    metadata = coalesce(duplicado.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'consolidado_em', now(),
        'consolidado_no_profile_id', mapa.principal_id,
        'motivo', 'cadastro financeiro duplicado'
      ),
    updated_at = now()
from perfil_unificacao mapa
where duplicado.id = mapa.duplicado_id;

commit;
