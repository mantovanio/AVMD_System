# Deploy Controlado AVMD System

Documento oficial para evitar perda do fluxo de deploy, dos atalhos de operação e das regras de permissão do painel.

## Objetivo

Manter um procedimento único para:

- publicar alterações no sistema
- validar backend e frontend
- evitar regressão em permissões de supervisor
- manter o controle de tema e menu do usuário centralizado

## Fluxo oficial

1. Alterar o código no repositório local.
2. Validar compilação:
   - `npm run build`
   - `npm run build:backend`
3. Enviar para o GitHub:
   - `git add .`
   - `git commit -m "..." `
   - `git push origin main`
4. Rodar o deploy controlado na VPS pelo gate oficial.

## Caminho oficial da VPS

- Host: `root@147.79.111.76`
- Repo na VPS: `/opt/avmd/AVMD_System`
- Gate oficial: `/opt/avmd/AVMD_System/ops/scripts/vps-deploy-gate.sh`
- Rollout oficial: `/opt/avmd/AVMD_System/ops/scripts/vps-rollout-avmd.sh`
- Rollback oficial: `/opt/avmd/AVMD_System/ops/scripts/vps-rollback-avmd.sh`

## Comando de deploy

Usar o `ssh.exe` que vem com o Git no Windows:

```powershell
& 'C:\Program Files\Git\usr\bin\ssh.exe' root@147.79.111.76 'bash /opt/avmd/AVMD_System/ops/scripts/vps-deploy-gate.sh'
```

## Validacoes pos-deploy

```powershell
& 'C:\Program Files\Git\usr\bin\ssh.exe' root@147.79.111.76 'systemctl status avmd-backend --no-pager; curl -fsS http://127.0.0.1:8787/healthz; curl -fsS -H "Host: api.certiid.mantovan.com.br" http://127.0.0.1/healthz; curl -fsS https://api.certiid.mantovan.com.br/healthz'
```

## Regras de permissao que nao podem se perder

- `supervisor_chat` precisa ver chat e operacao relacionada.
- `supervisor_renovacoes` precisa ver renovações, clientes, comercial, relatorios e chat quando aplicavel.
- O frontend e o backend precisam concordar na mesma regra.
- Se o perfil novo não existir em `src/types/index.ts`, o build quebra.

## Atenção para tipagem

Quando criar ou ajustar um perfil novo:

1. Atualizar `src/types/index.ts`.
2. Atualizar `src/lib/security.ts`.
3. Atualizar `src/contexts/PermissionsContext.tsx`.
4. Atualizar qualquer regra de backend que filtre por `perfil`.
5. Recompilar antes de subir.

## Tema e menu do usuário

O controle de tema deve ficar:

- no topo do painel
- no menu do usuário
- dentro de `Configurações > Usuários`

Não depender apenas de um único botão.

## Erro que já aconteceu

Durante o deploy, a compilação quebrou porque o perfil `supervisor_renovacoes` foi usado em:

- `src/lib/security.ts`
- `src/pages/Clientes.tsx`
- `src/pages/Renovacoes.tsx`

mas ainda não existia no tipo `PerfilAcesso` de `src/types/index.ts`.

## Como evitar perda do contexto

- Sempre registrar mudanças estruturais neste arquivo.
- Sempre atualizar o tipo antes das regras.
- Nunca considerar deploy concluído sem:
  - build frontend
  - build backend
  - gate da VPS
  - validação de healthcheck

