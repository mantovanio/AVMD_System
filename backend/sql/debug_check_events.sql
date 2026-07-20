SELECT id, event_type,
  payload->>'mimeType' as mime,
  payload->>'mediaUrl' as media_url,
  payload->>'content' as content,
  COALESCE(payload#>>'{data,message,imageMessage}', payload#>>'{data,message,videoMessage}', payload#>>'{data,message,documentMessage}', payload#>>'{data,message,audioMessage}', 'N/A') as msg_type
FROM communication_events
WHERE source='evolution'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 10;
