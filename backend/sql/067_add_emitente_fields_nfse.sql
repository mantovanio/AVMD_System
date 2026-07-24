alter table nfse_configuracoes
  add column if not exists razao_social_emitente text,
  add column if not exists nome_fantasia_emitente text,
  add column if not exists telefone_emitente text,
  add column if not exists email_emitente text,
  add column if not exists endereco_emitente text,
  add column if not exists complemento_emitente text;
