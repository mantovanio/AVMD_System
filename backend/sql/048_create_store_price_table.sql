-- @requires-table lojas_marketplace,tabelas_preco,tabelas_preco_itens

insert into tabelas_preco (
  nome,
  descricao,
  codigo_voucher,
  max_desconto_percentual,
  max_desconto_valor,
  comissao_venda_pct,
  comissao_gestor_pct,
  comissao_gestor_valor,
  ativo,
  metadata,
  created_at,
  updated_at
)
select
  'Loja',
  'Tabela exclusiva do checkout público da CertiID, derivada da Matriz.',
  null,
  matriz.max_desconto_percentual,
  matriz.max_desconto_valor,
  matriz.comissao_venda_pct,
  matriz.comissao_gestor_pct,
  matriz.comissao_gestor_valor,
  true,
  coalesce(matriz.metadata, '{}'::jsonb) || jsonb_build_object('origem_tabela_id', matriz.id, 'finalidade', 'loja_site'),
  now(),
  now()
from tabelas_preco matriz
where lower(matriz.nome) = 'matriz'
  and matriz.ativo = true
  and not exists (select 1 from tabelas_preco where lower(nome) = 'loja')
limit 1;

update tabelas_preco
set ativo = true,
    descricao = 'Tabela exclusiva do checkout público da CertiID, derivada da Matriz.',
    updated_at = now()
where lower(nome) = 'loja';

insert into tabelas_preco_itens (
  tabela_preco_id,
  certificado_id,
  valor,
  valor_custo,
  valor_repasse,
  link_safeweb,
  ativo,
  metadata,
  created_at,
  updated_at
)
select
  loja.id,
  item.certificado_id,
  item.valor,
  item.valor_custo,
  item.valor_repasse,
  item.link_safeweb,
  item.ativo,
  coalesce(item.metadata, '{}'::jsonb) || jsonb_build_object('origem_item_id', item.id, 'origem_tabela', 'Matriz'),
  now(),
  now()
from tabelas_preco loja
join tabelas_preco matriz on lower(matriz.nome) = 'matriz' and matriz.ativo = true
join tabelas_preco_itens item on item.tabela_preco_id = matriz.id
where lower(loja.nome) = 'loja'
on conflict (tabela_preco_id, certificado_id) do nothing;

update lojas_marketplace loja_marketplace
set tabela_preco_id = tabela.id,
    updated_at = now()
from tabelas_preco tabela
where loja_marketplace.slug = 'certiid'
  and lower(tabela.nome) = 'loja'
  and tabela.ativo = true;
