# Onboarding de Novo Cliente

## Fluxo Padrao
1. Registrar cliente no painel interno
2. Definir plano e dominio
3. Criar projeto Supabase do cliente
4. Rodar schema base e migrations
5. Criar usuario admin inicial
6. Configurar `.env` do cliente
7. Publicar subdominio
8. Validar login, banco e storage
9. Entregar acesso

## Dados que Precisamos Guardar
- nome da empresa
- responsavel
- dominio/subdominio
- URL do projeto Supabase
- anon key
- service role key
- data de ativacao
- plano contratado
- status financeiro

## Checklist Tecnico
- projeto Supabase criado
- tabelas e policies aplicadas
- auth funcionando
- storage configurado
- variaveis de ambiente salvas
- deploy validado
- acesso admin testado

## Regras de Governanca
- projeto deve ficar sob seu controle administrativo
- cliente pode receber acesso adicional quando necessario
- credenciais sensiveis nao ficam espalhadas
- cancelamento nao apaga dados sem processo definido
