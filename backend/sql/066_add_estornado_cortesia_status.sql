alter table vendas_certificados drop constraint if exists vendas_certificados_status_pagamento_check;
alter table vendas_certificados
  add constraint vendas_certificados_status_pagamento_check
  check (status_pagamento in ('em_aberto', 'pago', 'recusado', 'estornado', 'cortesia'));

create or replace function fn_sync_pago_from_status_pagamento()
returns trigger as $$
begin
  if new.status_pagamento is distinct from old.status_pagamento then
    if new.status_pagamento = 'pago' then
      new.pago := true;
      if new.data_pagamento is null then
        new.data_pagamento := now();
      end if;
    elsif new.status_pagamento = 'cortesia' then
      new.pago := true;
      if new.data_pagamento is null then
        new.data_pagamento := now();
      end if;
    elsif new.status_pagamento = 'estornado' then
      new.pago := false;
    else
      new.pago := false;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;
