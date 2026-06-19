import { supabase } from '@/lib/supabase'

const DEFAULT_BRAND_LOGO = 'favicon.svg'

export type AgencyConfig = {
  nome_agencia: string
  responsavel: string
  telefone: string
  cidade: string
  logo_url: string
  logo_login_url: string
  logo_interna_url: string
  login_titulo: string
  login_subtitulo: string
  cor_primaria: string
  fundo_inicio: string
  fundo_fim: string
}

export const DEFAULT_AGENCY_CONFIG: AgencyConfig = {
  nome_agencia: 'AR CERTI ID',
  responsavel: 'Alexandre Aparecido Mantovan',
  telefone: '+55 11 9508-9218',
  cidade: 'São Paulo - SP',
  logo_url: DEFAULT_BRAND_LOGO,
  logo_login_url: DEFAULT_BRAND_LOGO,
  logo_interna_url: DEFAULT_BRAND_LOGO,
  login_titulo: 'AR CERTI ID',
  login_subtitulo: 'Agência de Certificação Digital',
  cor_primaria: '#2563eb',
  fundo_inicio: '#172554',
  fundo_fim: '#1e3a8a',
}

export function buildAuthBackground(startColor: string, endColor: string) {
  return `
    radial-gradient(circle at top, rgba(255,255,255,0.12), transparent 32%),
    linear-gradient(145deg, ${startColor} 0%, #111827 48%, ${endColor} 100%)
  `
}

function normalizeAgencyConfig(value: Partial<AgencyConfig>) {
  const legacyLogo = value.logo_url?.trim() || DEFAULT_BRAND_LOGO

  return {
    ...DEFAULT_AGENCY_CONFIG,
    ...value,
    logo_url: legacyLogo,
    logo_login_url: value.logo_login_url?.trim() || legacyLogo,
    logo_interna_url: value.logo_interna_url?.trim() || legacyLogo,
  }
}

export async function fetchAgencyConfig() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'agency')
    .maybeSingle()

  if (error) return { data: DEFAULT_AGENCY_CONFIG, error }

  const value = data?.value
  if (!value || typeof value !== 'object') {
    return { data: DEFAULT_AGENCY_CONFIG, error: null }
  }

  return {
    data: normalizeAgencyConfig(value as Partial<AgencyConfig>),
    error: null,
  }
}
