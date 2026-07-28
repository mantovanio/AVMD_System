-- Interrompe códigos já enfileirados antes da trava de recuperação exclusiva
-- para usuários internos com conta de login vinculada.
UPDATE communication_outbox
   SET status = 'cancelled',
       error = 'Cancelado preventivamente: recuperação restrita a usuários internos.',
       updated_at = NOW()
 WHERE status IN ('pending', 'processing')
   AND payload->>'context' = 'password_recovery';

-- Invalida códigos antigos para impedir confirmação posterior ao bloqueio.
DELETE FROM password_recovery_tokens;
