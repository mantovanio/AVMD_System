# 28 - Ponto de salvamento para visualizacao posterior

## Data
- 2026-06-19

## Estado atual
- O checkout Aiven esta conectado, com schema e seed carregados no banco.
- O frontend local ja esta apontado para `VITE_API_BASE_URL=http://localhost:8787/api` e `VITE_USE_LEGACY_SUPABASE=false`.
- Os registros de validacao continuam salvos no Aiven para voce visualizar depois no front.
- Os registros teste foram marcados com `metadata.registro_teste = true`.

## Dados teste preservados
- `vendas_certificados`: 2 registros teste
- `agendamentos_validacao`: 1 registro teste
- `cadastros_base`: 2 registros teste
- `titulares_certificado`: 2 registros teste

## O que foi avancado ate aqui
- Schema do checkout criado no Aiven.
- Seed inicial aplicado com certificados, pagamentos, tabela e loja.
- Agenda importada com agente, ponto e disponibilidades.
- Base de clientes importada do backup.
- Painel Comercial ja consegue ler do Aiven quando `VITE_USE_LEGACY_SUPABASE=false`.

## Observacao para retomar depois
- O proximo passo natural e migrar as escritas do Comercial para Aiven, sem perder os registros teste que ficaram para visualizacao.
