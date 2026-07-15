const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://avmd:avmd123ABC@127.0.0.1:5432/avmd?sslmode=disable' });

(async () => {
  const c = await pool.connect();
  try {
    const r1 = await c.query("SELECT id, provider, status, api_token, base_url, webhook_url FROM external_integrations WHERE provider = 'mercado_pago'");
    console.log('EXTERNAL_INTEGRATIONS:', JSON.stringify(r1.rows, null, 2));

    const r2 = await c.query("SELECT value FROM app_settings WHERE key = 'payment_methods'");
    console.log('PAYMENT_METHODS:', JSON.stringify(r2.rows, null, 2));

    const r3 = await c.query("SELECT value FROM app_settings WHERE key = 'payment_runtime'");
    console.log('PAYMENT_RUNTIME:', JSON.stringify(r3.rows, null, 2));
  } finally {
    c.release();
    await pool.end();
  }
})();
