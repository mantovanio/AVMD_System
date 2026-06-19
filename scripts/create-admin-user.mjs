const args = Object.fromEntries(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.split('=');
    return [key.replace(/^--/, ''), rest.join('=')];
  }),
);

const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = args.email;
const password = args.password;
const name = args.name ?? 'Administrador';

if (!url || !serviceRoleKey) {
  console.error('Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente antes de executar.');
  process.exit(1);
}

if (!email || !password) {
  console.error('Uso: node scripts/create-admin-user.mjs --email=admin@dominio.com --password=SenhaForte123 --name=Administrador');
  process.exit(1);
}

const response = await fetch(`${url}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      nome: name,
      perfil: 'admin',
    },
  }),
});

const payload = await response.json().catch(() => ({}));

if (!response.ok) {
  console.error('Falha ao criar usuario admin.');
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

console.log('Usuario admin criado com sucesso.');
console.log(JSON.stringify({
  id: payload.id,
  email: payload.email,
  role: payload.role,
}, null, 2));
