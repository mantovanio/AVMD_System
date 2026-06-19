import { supabase } from '@/lib/supabase'

export type ContactDocumentStorageMode = 'supabase' | 'server'

export interface ContactDocumentStorageConfig {
  mode: ContactDocumentStorageMode
  supabase_bucket: string
  server_upload_url: string
  server_delete_url: string
  server_public_base_url: string
  server_auth_token: string
}

export const DEFAULT_CONTACT_DOCUMENT_STORAGE: ContactDocumentStorageConfig = {
  mode: 'supabase',
  supabase_bucket: 'chat-lead-documentos',
  server_upload_url: '',
  server_delete_url: '',
  server_public_base_url: '',
  server_auth_token: '',
}

export async function loadContactDocumentStorageConfig() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'contact_document_storage')
    .maybeSingle()

  if (error) throw error

  const value = (data?.value ?? {}) as Partial<ContactDocumentStorageConfig>
  return {
    ...DEFAULT_CONTACT_DOCUMENT_STORAGE,
    ...value,
    mode: value.mode === 'server' ? 'server' : 'supabase',
  } satisfies ContactDocumentStorageConfig
}
