# Recuperacao do CRM CertiID - 2026-08-13

Documento operacional do incidente em que o CRM ficou desconfigurado apos tentativa de separar o portal do cliente do acesso administrativo.

## Objetivo

Restabelecer o CRM administrativo em dominio proprio e seguro, mantendo o portal do cliente separado:

- CRM administrativo: `https://crm.certiid.com.br`
- API oficial: `https://api.certiid.com.br`
- Portal do cliente: `https://portal.certiid.com.br`
- Dominios antigos mantidos como fallback:
  - `https://crm.certiid.mantovan.com.br`
  - `https://api.certiid.mantovan.com.br`

## Causa raiz

A falha original teve duas frentes:

1. Separacao do portal do cliente foi misturada com rotas e interface do CRM administrativo.
2. Ao mover o CRM para `crm.certiid.com.br`, o Clerk antigo nao aceitava o novo dominio porque estava preso ao dominio `mantovan.com.br`.

Erros observados:

```text
Clerk: Production Keys are only allowed for domain "mantovan.com.br".
The Request HTTP Origin header must be equal to or a subdomain of the requesting URL.
```

Depois da criacao de um novo app Clerk em producao, surgiu uma segunda falha:

```text
failed_to_load_clerk_js
https://clerk.certiid.com.br/npm/@clerk/clerk-js@5/dist/clerk.browser.js
```

A causa era o dominio customizado do Clerk ainda sem DNS/validacao ativa.

## Correcoes aplicadas

### Dominio e edge

O edge real do servidor e Traefik com Docker Swarm e Nginx dentro do service `avmd_web`.

Arquivos relevantes:

- `ops/nginx/avmd-web.conf`
- `ops/scripts/vps-rollout-avmd.sh`
- `ops/scripts/vps-deploy-gate.sh`

Configuracao final:

- `crm.certiid.com.br` serve o frontend estatico.
- `crm.certiid.mantovan.com.br` permanece como dominio legado.
- `api.certiid.com.br` faz proxy para o backend.
- `api.certiid.mantovan.com.br` permanece como fallback.

### CORS

O backend passou a responder o `Access-Control-Allow-Origin` usando a origem exata da requisicao, em vez de devolver a lista completa de origens.

Isso corrigiu erro de navegador causado por header invalido com multiplas origens.

Origens aceitas:

```text
https://crm.certiid.com.br
https://crm.certiid.mantovan.com.br
https://portal.certiid.com.br
```

### Clerk

Foi criado um novo app Clerk em producao para `certiid.com.br`.

Ambiente de producao na VPS:

- `/opt/avmd/AVMD_System/.env.production`
- `/opt/avmd/AVMD_System/backend/.env.local`

Variaveis relevantes, sem versionar segredo:

```text
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
VITE_API_BASE_URL=https://api.certiid.com.br/api
PUBLIC_API_BASE_URL=https://api.certiid.com.br
```

Importante:

- O frontend e buildado com a `pk_live` do novo Clerk.
- O backend valida tokens com a `sk_live` do novo Clerk.
- Nao versionar chaves reais.

### Usuario admin

O usuario `mantovanvp@gmail.com` nao existia no novo Clerk de producao.

Foi feito:

- criacao do usuario no Clerk novo;
- vinculo do perfil admin existente no banco ao novo `clerk_user_id`;
- troca posterior da senha temporaria pelo proprio usuario.

Perfil encontrado no banco:

```text
email: mantovanvp@gmail.com
perfil: admin
status: ativo
```

Nao registrar senha temporaria em documentacao versionada.

## DNS obrigatorios

### CRM e API

No Cloudflare:

```text
crm.certiid.com.br    A      147.79.111.76    Somente DNS
api.certiid.com.br    A      147.79.111.76    Somente DNS
portal.certiid.com.br A      147.79.111.76    Somente DNS
```

### Clerk

Registros obrigatorios do Clerk em producao:

```text
clerk.certiid.com.br          CNAME  frontend-api.clerk.services             Somente DNS
accounts.certiid.com.br       CNAME  accounts.clerk.services                 Somente DNS
clkmail.certiid.com.br        CNAME  mail.lk1491lepaec.clerk.services        Somente DNS
clk._domainkey.certiid.com.br CNAME  dkim1.lk1491lepaec.clerk.services       Somente DNS
clk2._domainkey.certiid.com.br CNAME dkim2.lk1491lepaec.clerk.services       Somente DNS
```

Observacao critica:

- Todos os CNAMEs do Clerk devem ficar em `Somente DNS`.
- Nao usar proxy laranja da Cloudflare nesses registros.

## Validacoes usadas

### CRM

```powershell
& 'C:\Program Files\Git\usr\bin\ssh.exe' root@147.79.111.76 "curl -sS -o /dev/null -w 'http:%{http_code} ssl:%{ssl_verify_result}\n' https://crm.certiid.com.br"
```

Resultado esperado:

```text
http:200 ssl:0
```

### Clerk JS

```powershell
& 'C:\Program Files\Git\usr\bin\ssh.exe' root@147.79.111.76 "curl -sSI -H 'Origin: https://crm.certiid.com.br' 'https://clerk.certiid.com.br/npm/@clerk/clerk-js@5/dist/clerk.browser.js' | sed -n '1,20p'"
```

Resultado esperado:

```text
HTTP/2 307
access-control-allow-origin: *
```

O `307` e normal: o Clerk redireciona para a versao exata do script.

### CORS API

```powershell
& 'C:\Program Files\Git\usr\bin\ssh.exe' root@147.79.111.76 "curl -sSI -H 'Origin: https://crm.certiid.com.br' 'https://api.certiid.com.br/api/app-settings?keys=agency' | grep -i 'access-control\|http/'"
```

Resultado esperado:

```text
access-control-allow-origin: https://crm.certiid.com.br
```

## Deploy oficial

Sempre usar o gate canonico:

```powershell
& 'C:\Program Files\Git\usr\bin\ssh.exe' root@147.79.111.76 'bash /opt/avmd/AVMD_System/ops/scripts/vps-deploy-gate.sh'
```

Nao rodar rollout direto, salvo diagnostico controlado.

## Rollback de emergencia

Durante a troca para Clerk live foram criados backups na VPS:

```text
/opt/avmd/AVMD_System/.env.production.bak-clerk-live-20260813-193548
/opt/avmd/AVMD_System/backend/.env.local.bak-clerk-live-20260813-193548
```

Rollback rapido apenas se o novo Clerk travar acesso critico:

```bash
cd /opt/avmd/AVMD_System
cp .env.production.bak-clerk-live-20260813-193548 .env.production
cp backend/.env.local.bak-clerk-live-20260813-193548 backend/.env.local
bash /opt/avmd/AVMD_System/ops/scripts/vps-deploy-gate.sh
```

## Regra de blindagem

O CRM administrativo e o portal publico do cliente nao devem compartilhar fluxo visual, rota publica ou estado de autenticacao.

Regras praticas:

- Nao inserir portal do cliente dentro do CRM.
- Nao mover menus do CRM para resolver problema do portal.
- Nao alterar `Login`, `Sidebar`, `App` ou rotas administrativas sem teste separado do CRM.
- O botao `Minhas compras` do site/checkout deve apontar para `https://portal.certiid.com.br`.
- O CRM deve continuar com foco em parceiros, agentes e administracao interna.
- O portal deve cuidar de compras, pedidos, validacao, protocolo e agendamento do cliente.

## Checklist para futuras alteracoes de dominio/auth

Antes de publicar:

1. Confirmar DNS em `Somente DNS`.
2. Confirmar dominio no Clerk em producao.
3. Confirmar `pk_live` e `sk_live` do mesmo app Clerk.
4. Confirmar usuario admin existente no Clerk novo.
5. Confirmar `profiles.clerk_user_id` vinculado ao usuario correto.
6. Rodar build local.
7. Rodar deploy pelo gate.
8. Testar `crm.certiid.com.br` em aba anonima.
9. Testar `api.certiid.com.br` com CORS da origem nova.
10. Manter dominio antigo como fallback ate validacao operacional completa.

## Status final

Em 2026-08-13:

- `crm.certiid.com.br` carregou com SSL valido.
- Clerk de producao carregou corretamente.
- Usuario admin acessou e trocou a senha.
- Dominio novo passou a ser o principal.
- Dominio antigo permaneceu como fallback.
