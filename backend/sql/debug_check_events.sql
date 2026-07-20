SELECT id, event_type, payload->>'mimeType', payload->>'mediaUrl', payload->>'content'
FROM communication_events
WHERE source='evolution'
ORDER BY created_at DESC
LIMIT 5;
