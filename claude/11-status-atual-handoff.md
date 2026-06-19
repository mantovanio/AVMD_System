# Status Atual e Handoff

## Regra permanente deste projeto
Toda evolucao relevante deve ser registrada na pasta `claude` para que outra IA ou operador possa assumir sem perda de contexto.

## Estagio atual
### Produto
- direcao SaaS definida
- app central na sua VPS
- um projeto Supabase por cliente
- `admavmd` escolhido como base inicial

### Codigo
- projeto local compila com `npm run build`
- `.env` local ja aponta para o Supabase `admavmd`
- base SQL inicial criada e aplicada

### Banco
- schema `public` do `admavmd` foi limpo
- legado foi preservado em backup logico
- base AVMD foi recriada

## Estrutura atual confirmada no public
- `profiles`
- `modules_config`
- `live_chat`
- `leads_contabilidade`
- `communication_events`
- `chat_lead_documentos`

## Backups e registros importantes
- backup logico: `claude/backups/admavmd-20260615-170131`
- confirmacao final de tabelas: `claude/current-public-tables.json`
- integracao Supabase: `claude/08-integracao-supabase-admavmd.md`
- limpeza do public: `claude/10-limpeza-public-admavmd.md`

## Proximo passo imediato
Subir a aplicacao localmente e validar o login pela interface do sistema.

## Ultima entrega concluida
- usuario admin validado no auth
- perfil recriado em `public.profiles`
- login confirmado via endpoint de auth

## Bloqueio atual
As `legacy API keys` do Supabase estao desabilitadas neste projeto.

## Assim que retomarmos
Sequencia exata:
1. subir app local
2. testar login na tela `/login`
3. validar leitura do `profiles`
4. validar tabelas base na interface
5. registrar novo status na pasta `claude`
