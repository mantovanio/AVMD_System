-- @requires-table lojas_marketplace,tabelas_preco

insert into lojas_marketplace (
  nome_loja,
  slug,
  tabela_preco_id,
  owner_tipo,
  descricao,
  dominio_publico,
  ativo,
  configuracoes,
  created_at,
  updated_at
)
select
  'CertiID',
  'certiid',
  tabela.id,
  'institucional',
  'Checkout oficial da CertiID integrado ao CRM.',
  'https://certiid.com.br/loja/',
  true,
  jsonb_build_object('modo_exibicao', 'vitrine'),
  now(),
  now()
from tabelas_preco tabela
where lower(tabela.nome) = 'matriz'
  and tabela.ativo = true
  and not exists (
    select 1 from lojas_marketplace where slug = 'certiid'
  )
limit 1;

update lojas_marketplace loja
set nome_loja = 'CertiID',
    tabela_preco_id = tabela.id,
    owner_tipo = 'institucional',
    descricao = 'Checkout oficial da CertiID integrado ao CRM.',
    dominio_publico = 'https://certiid.com.br/loja/',
    ativo = true,
    configuracoes = coalesce(loja.configuracoes, '{}'::jsonb) || jsonb_build_object('modo_exibicao', 'vitrine'),
    updated_at = now()
from tabelas_preco tabela
where loja.slug = 'certiid'
  and lower(tabela.nome) = 'matriz'
  and tabela.ativo = true;
