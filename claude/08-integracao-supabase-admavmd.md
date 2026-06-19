# Integracao Inicial com Supabase admavmd

## Projeto confirmado
- nome atual no Supabase: `admavmd@gmail.com's Project`
- project ref: `cvfrhfiaprdtwxxplngk`
- URL base: `https://cvfrhfiaprdtwxxplngk.supabase.co`

## O que foi feito
- configurado `.env` local apontando para o projeto `admavmd`
- identificadas as chaves necessarias para uso local
- criada a base SQL inicial em `sql/00_admavmd_base.sql`
- aplicada a base SQL inicial no projeto `admavmd` via Management API

## Estruturas esperadas pelo sistema
- `profiles`
- `modules_config`
- `live_chat`
- `leads_contabilidade`
- `communication_events`
- `chat_lead_documentos`
- bucket `chat-lead-documentos`

## Observacao importante
O arquivo SQL criado e a primeira base funcional para o produto. Ele ainda podera evoluir quando:
- refinarmos as regras de permissao
- conectarmos a integracao real do WhatsApp/Evolution
- definirmos a modelagem final do produto de prateleira

## Proximo passo operacional
1. criar usuario admin inicial no Auth
2. validar login local
3. validar leitura e escrita das tabelas principais
4. revisar e endurecer policies/RLS na proxima fase
