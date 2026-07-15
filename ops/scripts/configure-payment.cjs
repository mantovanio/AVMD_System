const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://avmd:avmd123ABC@127.0.0.1:5432/avmd?sslmode=disable' });

(async () => {
  const c = await pool.connect();
  try {
    // 1. Set payment_runtime: bloquear_integracoes_reais = false
    await c.query(`
      UPDATE app_settings SET value = value || '{"bloquear_integracoes_reais": false}'::jsonb WHERE key = 'payment_runtime'
    `);
    console.log('OK: payment_runtime atualizado (bloquear_integracoes_reais = false)');

    // 2. Set default_method_id = mercado_pago
    await c.query(`
      UPDATE app_settings SET value = value || '{"default_method_id": "mercado_pago"}'::jsonb WHERE key = 'payment_methods'
    `);
    console.log('OK: default_method_id = mercado_pago');

    // 3. Insert/update external_integrations for mercado_pago
    const existing = await c.query("SELECT id FROM external_integrations WHERE provider = 'mercado_pago'");
    if (existing.rows.length > 0) {
      await c.query(`
        UPDATE external_integrations 
        SET api_token = 'APP_USR-3422359056026075-071318-e2c9aeff011e0bd2a811fcb8576ac9e2-3538197591',
            status = 'ativo',
            updated_at = NOW()
        WHERE provider = 'mercado_pago'
      `);
      console.log('OK: external_integrations atualizado');
    } else {
      await c.query(`
        INSERT INTO external_integrations (provider, name, status, base_url, webhook_url, api_token, metadata)
        VALUES ('mercado_pago', 'Mercado Pago', 'ativo', 'https://api.mercadopago.com', 
                'https://api.certiid.mantovan.com.br/api/checkout/webhook/mercado-pago/orders',
                'APP_USR-3422359056026075-071318-e2c9aeff011e0bd2a811fcb8576ac9e2-3538197591',
                '{"is_sandbox": true}'::jsonb)
      `);
      console.log('OK: external_integrations inserido');
    }

    // 4. Verify
    const rt = await c.query("SELECT value FROM app_settings WHERE key = 'payment_runtime'");
    console.log('payment_runtime atual:', JSON.stringify(rt.rows[0].value));

    const ext = await c.query("SELECT provider, status, api_token IS NOT NULL as has_token FROM external_integrations WHERE provider = 'mercado_pago'");
    console.log('external_integrations:', JSON.stringify(ext.rows));

    console.log('\nConfiguracao de pagamento concluida com sucesso!');
  } catch (err) {
    console.error('ERRO:', err.message);
  } finally {
    c.release();
    await pool.end();
  }
})();
