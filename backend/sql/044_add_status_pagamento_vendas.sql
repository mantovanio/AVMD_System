alter table vendas_certificados
  add column if not exists status_pagamento text not null default 'em_aberto';

alter table vendas_certificados drop constraint if exists vendas_certificados_status_pagamento_check;
alter table vendas_certificados
  add constraint vendas_certificados_status_pagamento_check
  check (status_pagamento in ('em_aberto', 'pago', 'recusado'));

create or replace function fn_sync_pago_from_status_pagamento()
returns trigger as $$
begin
  if new.status_pagamento is distinct from old.status_pagamento then
    if new.status_pagamento = 'pago' then
      new.pago := true;
      if new.data_pagamento is null then
        new.data_pagamento := now();
      end if;
    else
      new.pago := false;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_pago_from_status_pagamento on vendas_certificados;
create trigger trg_sync_pago_from_status_pagamento
  before update on vendas_certificados
  for each row
  execute function fn_sync_pago_from_status_pagamento();
