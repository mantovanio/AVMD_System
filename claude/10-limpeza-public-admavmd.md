# Limpeza do Schema Public - admavmd

## Decisao aplicada
Foi executada a estrategia `backup + limpeza total do public + recriacao da base AVMD`.

## O que foi preservado
- `auth.*`
- `storage.*`
- `realtime.*`
- extensoes e estrutura nativa do Supabase

## O que foi limpo
As tabelas antigas do schema `public` ligadas ao projeto anterior/legado.

## Backup salvo
Pasta principal do backup logico:

`claude/backups/admavmd-20260615-170131`

Arquivos importantes dentro dela:
- `public-tables.json`
- `public-views.json`
- `public-functions.json`
- `*.rows.json` com os dados exportados por tabela

## Estado final confirmado
Tabelas atuais no schema `public`:
- `profiles`
- `modules_config`
- `live_chat`
- `leads_contabilidade`
- `communication_events`
- `chat_lead_documentos`

Confirmacao local salva em:
- `claude/current-public-tables.json`

## Resultado
O projeto `admavmd` agora esta limpo para seguir como base inicial real do `AVMD_System`.

## Proximo passo
1. criar usuario admin inicial
2. testar login local
3. validar leitura e escrita nas tabelas base
