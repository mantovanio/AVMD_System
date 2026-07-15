const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://avmd:avmd123ABC@127.0.0.1:5432/avmd?sslmode=disable' });

(async () => {
  const c = await pool.connect();
  try {
    const r = await c.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'vendas_certificados' ORDER BY ordinal_position");
    console.log('COLUMNS:', JSON.stringify(r.rows.map(row => row.column_name)));
  } finally {
    c.release();
    await pool.end();
  }
})();
