# Admin Inicial do admavmd

## Situacao atual
A base do banco e storage inicial do `admavmd` ja foi preparada.

## Proximo passo
Criar o primeiro usuario admin no Auth do Supabase.

## Script criado
- `scripts/create-admin-user.mjs`

## Como usar
Preencha o ambiente com:
- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Depois execute:

```bash
node scripts/create-admin-user.mjs --email=admin@seudominio.com --password=SenhaForte123 --name=Administrador
```

## Efeito esperado
- usuario criado no `auth.users`
- trigger cria/atualiza registro em `public.profiles`
- login do sistema ja pode ser testado na tela `/login`

## Observacao
A `service role key` nao deve ficar no frontend. Ela serve apenas para bootstrap e automacoes internas.
