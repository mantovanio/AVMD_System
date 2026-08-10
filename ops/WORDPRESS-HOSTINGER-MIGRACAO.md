# Migracao WordPress da Hostinger para VPS

Este runbook descreve uma migracao segura de um site WordPress pronto para a VPS do AVMD.

## Objetivo

Trazer o site WordPress da Hostinger para a VPS e trocar DNS com baixo risco.

## Premissas

- VPS atual: `147.79.111.76`
- Edge atual: service `avmd_web`
- Proxy do edge usa arquivo `/opt/avmd/nginx-avmd.conf`
- Site WordPress sera publicado em um dominio ou subdominio dedicado

## Estrategia segura

- Subir WordPress em stack separada (container proprio), sem misturar com backend do AVMD.
- Usar porta local privada no host (`127.0.0.1:8085`) e expor somente via edge.
- Fazer cutover de DNS apenas depois de validar site e SSL.

## Fase 1 - Preparar DNS antes do corte

No painel DNS da Hostinger:

1. Reduzir TTL dos registros do site para 300 segundos.
2. Garantir que o dominio do WordPress esteja definido:
   - exemplo: `site.suaempresa.com.br`
3. Planejar registros no corte:
   - `A site.suaempresa.com.br -> 147.79.111.76`

Se usar Cloudflare:

1. Durante migracao, deixe o proxy em modo DNS only temporariamente.
2. Apos validacao final, pode reativar proxy.

## Fase 2 - Subir WordPress na VPS

1. Conectar na VPS:

```bash
ssh root@147.79.111.76
```

1. Criar pasta da stack:

```bash
mkdir -p /opt/wordpress/site
cd /opt/wordpress/site
```

1. Copiar o template do repositorio e ajustar segredos:

```bash
cp /opt/avmd/AVMD_System/ops/wordpress/docker-compose.wp-site.example.yml ./docker-compose.yml
nano docker-compose.yml
```

Trocar obrigatoriamente:

- `TROCAR_SENHA_DB`
- `TROCAR_SENHA_ROOT_DB`

1. Subir containers:

```bash
docker compose pull
docker compose up -d
```

1. Validar WordPress local:

```bash
curl -I http://127.0.0.1:8085
```

Esperado: HTTP 200 ou 302.

## Fase 3 - Importar conteudo da Hostinger

### Opcao A (mais simples): plugin de migracao

No WordPress da Hostinger:

1. Instalar plugin de migracao (por exemplo, All-in-One WP Migration ou Duplicator).
2. Gerar pacote de exportacao.

No WordPress da VPS:

1. Acessar instalacao temporaria.
2. Importar pacote completo.
3. Confirmar URLs finais do site.

### Opcao B (manual): banco + arquivos

Na Hostinger:

1. Exportar banco MySQL (`.sql`).
2. Baixar `wp-content` e `wp-config.php`.

Na VPS:

1. Restaurar banco no container MariaDB.
2. Copiar arquivos para volume do WordPress.
3. Ajustar `siteurl` e `home` no banco.

## Fase 4 - Integrar com edge da VPS

1. Abrir config fonte no repo:

- `ops/nginx/avmd-web.conf`

1. Copiar o bloco de exemplo de:

- `ops/nginx/wordpress-proxy.template.conf`

1. Trocar `DOMAIN_WORDPRESS` pelo dominio real.
1. Publicar para `/opt/avmd/nginx-avmd.conf` e recarregar edge:

```bash
docker service update --force avmd_web
```

1. Validar roteamento local no host:

```bash
curl -I -H "Host: site.suaempresa.com.br" http://127.0.0.1/
```

## Fase 5 - Cutover de DNS

No painel DNS da Hostinger:

1. Alterar o registro `A` do dominio WordPress para `147.79.111.76`.
2. Aguardar propagacao (com TTL 300 costuma ser rapido).

Validacoes:

```bash
curl -I https://site.suaempresa.com.br
```

Checklist:

- abre no navegador externo
- login admin funciona
- links permanentes funcionam
- upload de midia funciona
- formulario e envio de email do site funcionam

## Fase 6 - Pos-corte (hardening)

1. Atualizar WordPress, plugins e temas.
2. Remover plugins nao usados.
3. Ativar MFA para usuario admin.
4. Instalar rotina de backup diario (banco + wp-content).
5. Monitorar logs por 7 dias.

## Rollback rapido

Se o site quebrar apos corte:

1. Voltar registro `A` para a origem antiga na Hostinger.
2. Manter TTL baixo ate estabilizar.
3. Corrigir na VPS e tentar novo corte.

## Observacao importante

O script `ops/scripts/vps-sites-manager.ps1` e voltado a site estatico. Para WordPress, use este runbook e stack dedicada.
