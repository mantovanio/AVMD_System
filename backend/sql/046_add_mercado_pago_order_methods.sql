insert into formas_pagamento_v2 (nome, codigo, tipo, gateway, ativo, metadata, created_at, updated_at)
select 'Pix - Mercado Pago', 'pix', 'pix', 'mercado_pago', true, '{}'::jsonb, now(), now()
where not exists (
  select 1 from formas_pagamento_v2 where gateway = 'mercado_pago' and codigo = 'pix'
);

insert into formas_pagamento_v2 (nome, codigo, tipo, gateway, ativo, metadata, created_at, updated_at)
select 'Boleto - Mercado Pago', 'boleto', 'boleto', 'mercado_pago', true, '{}'::jsonb, now(), now()
where not exists (
  select 1 from formas_pagamento_v2 where gateway = 'mercado_pago' and codigo = 'boleto'
);

insert into formas_pagamento_v2 (nome, codigo, tipo, gateway, ativo, metadata, created_at, updated_at)
select 'Cartão - Mercado Pago', 'card', 'card', 'mercado_pago', true, '{}'::jsonb, now(), now()
where not exists (
  select 1 from formas_pagamento_v2 where gateway = 'mercado_pago' and codigo = 'card'
);
