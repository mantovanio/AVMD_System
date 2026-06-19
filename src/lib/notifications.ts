import { SUPABASE_ANON_KEY } from '@/lib/supabase'

const NOTIFY_FN = 'https://cvfrhfiaprdtwxxplngk.supabase.co/functions/v1/notify-new-user'

interface NewUserData {
  nome:    string
  email:   string
  vinculo: string
}

export async function notifyNewUserRegistration(data: NewUserData) {
  try {
    await fetch(NOTIFY_FN, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(data),
    })
  } catch {
    // falha silenciosa — não bloqueia o cadastro
  }
}
