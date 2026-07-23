update vendas_certificados
   set vendedor_id = 'ad3436f8-eb15-4fbe-a351-3b6b56d2a17e',
       agente_registro_id = 'ad3436f8-eb15-4fbe-a351-3b6b56d2a17e',
       metadata = jsonb_set(
         jsonb_set(
           coalesce(metadata, '{}'::jsonb),
           '{estrutura_comercial,vendedor_id}',
           '"ad3436f8-eb15-4fbe-a351-3b6b56d2a17e"'::jsonb,
           true
         ),
         '{estrutura_comercial,agente_registro_id}',
         '"ad3436f8-eb15-4fbe-a351-3b6b56d2a17e"'::jsonb,
         true
       ),
       updated_at = now()
 where metadata->>'origem_layout' = 'safeweb_financeiro'
   and (
     lower(coalesce(metadata->'safeweb_financeiro'->'atendimento'->>'cidade', '')) like '%belo horizonte%'
     or lower(coalesce(metadata->'safeweb_financeiro'->'atendimento'->>'nome_local', '')) like '%belo horizonte%'
     or lower(coalesce(metadata->'safeweb_financeiro'->'atendimento'->>'apelido_local', '')) like '%belo horizonte%'
     or lower(coalesce(metadata->'safeweb_financeiro'->'atendimento'->>'nome_local', '')) like '%prado - calcedonia%'
     or lower(coalesce(metadata->'safeweb_financeiro'->'atendimento'->>'apelido_local', '')) like '%prado - calcedonia%'
   );
