-- 057_backfill_media_persist.sql
-- Verificacoes antes do backfill de midia

-- Mensagens com data: URI (podem ser persistidas pelo script TS)
SELECT COUNT(*) as total_data_uri
FROM crm_chat_messages
WHERE media_url LIKE 'data:%';

-- Mensagens com URL do CDN do WhatsApp (ja tratadas pelo event-media proxy)
SELECT COUNT(*) as total_whatsapp_cdn
FROM crm_chat_messages
WHERE media_url LIKE '%mmg.whatsapp.net%';

-- Mensagens ja com path permanente
SELECT COUNT(*) as total_permanent
FROM crm_chat_messages
WHERE media_url LIKE '/api/chat/files/%';
