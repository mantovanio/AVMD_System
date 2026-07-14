// ── chat contact (generic, usado no ChatPanel) ────────────────
export interface ChatContact {
  id: string
  nome: string | null
  telefone: string | null
  id_conversa_chatwoot: string | null
  evolution_remote_jid: string | null
  evolution_instance: string | null
  _table?: 'leads_contabilidade'
}

// ── leads_contabilidade ───────────────────────────────────────
export type StatusLead = string

export interface Lead {
  id: string
  nome_lead: string | null
  whatsapp_lead: string | null
  motivo_contato: string | null
  resumo_conversa: string | null
  status: StatusLead
  inicio_atendimento: string | null
  ultima_mensagem: string | null
  id_conta_chatwoot: string | null
  id_conversa_chatwoot: string | null
  id_lead_chatwoot: string | null
  inbox_id_chatwoot: string | null
  evolution_remote_jid: string | null
  evolution_instance: string | null
  follow_up_1: string | null
  follow_up_2: string | null
  follow_up_3: string | null
  data_agendamento: string | null
  id_agendamento: string | null
  agendamento_criado_em: string | null
  anotacoes: string | null
  anexos: Array<{
    id: string
    nome_original: string
    mime_type: string | null
    tamanho_bytes: number | null
    uploaded_at: string
    uploaded_by: string | null
    data_url: string | null
    storage_provider?: 'supabase' | 'server' | null
    bucket?: string | null
    storage_path?: string | null
    external_url?: string | null
  }> | null
  responsavel_profile_id: string | null
  responsavel_nome: string | null
  transferido_em: string | null
  transferido_por: string | null
  created_at: string
  minutos_ultima_mensagem_base: number | null
  horario_comercial: boolean | null
}

// ── parceiros ─────────────────────────────────────────────────
export interface Parceiro {
  id: string
  codigo_parceiro: string | null
  cpf_cnpj: string | null
  nome: string
  razao_social: string | null
  nome_fantasia: string | null
  responsavel: string | null
  id_local_atendimento: string | null
  senha_acesso: string | null
  email_acesso: string | null
  ddd: string | null
  telefone: string | null
  email: string | null
  email_adicional_1: string | null
  email_adicional_2: string | null
  email_adicional_3: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  ibge: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  observacao: string | null
  token: string | null
  inscricao_municipal: string | null
  inscricao_estadual: string | null
  tipo_parceiro: TipoParceiro | null
  data_ativacao: string | null
  data_desativacao: string | null
  bloquear_vendas_protocolos: boolean
  nao_enviar_whatsapp_vendas: boolean
  nao_enviar_email_vendas: boolean
  nao_enviar_renovacao_clientes: boolean
  nao_quero_receber_whatsapp: boolean
  nao_quero_receber_email: boolean
  gestor_1_id: string | null
  gestor_2_id: string | null
  gestor_3_id: string | null
  gestor_4_id: string | null
  gestor_5_id: string | null
  tipo_conta: TipoContaBancaria | null
  banco_id: string | null
  agencia: string | null
  agencia_digito: string | null
  conta: string | null
  conta_digito: string | null
  operacao: string | null
  cnpj_cpf_titular: string | null
  titular_conta: string | null
  chave_pix: string | null
  centro_custo_id: string | null
  segmento: 'alto' | 'medio' | 'baixo' | 'inativo'
  status: 'ativo' | 'inativo'
  emissoes_mes: number
  receita_mes: number
  desde: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string | null
}

export type NovoParceiro = Omit<Parceiro, 'id' | 'created_at' | 'updated_at'>

// ── vendas ────────────────────────────────────────────────────
export type CanalVenda = 'balcao' | 'ecommerce' | 'prepago' | 'voucher' | 'link_externo'
export type TipoVenda = 'presencial' | 'videoconferencia' | 'online' | 'faca-se' | 'outro'
export type StatusVenda = 'confirmado' | 'pendente' | 'cancelado'

export interface Venda {
  id: string
  cliente_id: string | null
  certificado_id: string | null
  cliente: string
  cliente_nome: string | null
  tipo_certificado: string
  tipo_venda: TipoVenda
  canal: CanalVenda
  forma_pagamento: string
  valor: number
  status: StatusVenda
  parceiro_id: string | null
  data_venda: string
  observacoes: string | null
  created_at: string
}

export type NovaVenda = Omit<Venda, 'id' | 'created_at'>

export type TipoCliente = 'pessoa_fisica' | 'pessoa_juridica'

export interface ClienteComercial {
  id: string
  tipo_cliente: TipoCliente
  cpf_cnpj: string
  nome_razao_social: string
  nome_fantasia: string | null
  email: string | null
  telefone: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  inscricao_municipal: string | null
  inscricao_estadual: string | null
  iss_retido: boolean
  observacoes: string | null
  created_at: string
  updated_at: string
}

export type NovoClienteComercial = Omit<ClienteComercial, 'id' | 'created_at' | 'updated_at'>

// ── comercial / catálogo ──────────────────────────────────────
export interface Certificado {
  id: string
  codigo: number | null
  status_produto: string | null
  tipo: string              // nome do produto, ex: "e-CPF A1"
  descricao: string | null
  validade: string          // ex: "1 Ano", "2 Anos"
  validade_meses: number | null
  modelo: string | null     // A1, A3
  categoria: string | null  // e-CPF, e-CNPJ, NF-e, SSL
  tipo_emissao_padrao: string | null
  periodo_uso: string | null    // ex: "4 meses", "1 ano" — para produtos Fast/Online
  descricao_produto: string | null
  produto_vinculado_ac: string | null
  preco_venda: number
  valor_custo_ac: number
  valor_custo: number
  agrupador: string | null
  hash: string | null
  codigo_alternativo: string | null  // código secundário (ex: código Safeweb)
  combo_produtos: string[] | null    // IDs de certificados associados para venda combo
  estoque: number
  ativo: boolean
  created_at: string
  updated_at: string
}

export type NovoCertificado = Omit<Certificado, 'id' | 'created_at' | 'updated_at'>

// ── tabelas de preço ──────────────────────────────────────────
export interface TabelaPreco {
  id: string
  nome: string
  descricao: string | null
  codigo_voucher: string | null
  max_desconto_percentual: number
  max_desconto_valor: number
  comissao_venda_pct: number
  comissao_gestor_pct: number
  comissao_gestor_valor: number
  ativo: boolean
  created_at: string
  updated_at: string
}

export type NovaTabelaPreco = Omit<TabelaPreco, 'id' | 'created_at' | 'updated_at'>

export type TipoParticipanteTabelaPreco = 'parceiro' | 'tipo_parceiro' | 'perfil'

export interface TabelaPrecoParticipante {
  id: string
  tabela_preco_id: string
  tipo_participante: TipoParticipanteTabelaPreco
  parceiro_id: string | null
  tipo_parceiro: TipoParceiro | null
  perfil: PerfilAcesso | null
  created_at: string
}

export type NovaTabelaPrecoParticipante = Omit<TabelaPrecoParticipante, 'id' | 'created_at'>

export interface TabelaPrecoItem {
  id: string
  tabela_preco_id: string
  certificado_id: string
  valor: number
  valor_custo: number
  valor_repasse: number
  link_safeweb: string | null
  ativo: boolean
  created_at: string
  updated_at: string
}

export type NovaTabelaPrecoItem = Omit<TabelaPrecoItem, 'id' | 'created_at' | 'updated_at'>

export interface PrecoCertificado {
  id: string
  certificado_id: string
  canal: CanalVenda
  valor: number
  ativo: boolean
  created_at: string
  updated_at: string
}

export type NovoPrecoCertificado = Omit<PrecoCertificado, 'id' | 'created_at' | 'updated_at'>

export interface FaixaComissao {
  id: string
  faixa: string
  min_emissoes: number
  max_emissoes: number | null
  percentual: number
  valor_exemplo: number | null
  ordem: number
  ativo: boolean
  created_at: string
  updated_at: string
}

export type NovaFaixaComissao = Omit<FaixaComissao, 'id' | 'created_at' | 'updated_at'>

export interface FormaPagamento {
  id: string
  nome: string
  ordem: number
  ativo: boolean
  created_at: string
  updated_at: string
}

export type NovaFormaPagamento = Omit<FormaPagamento, 'id' | 'created_at' | 'updated_at'>

// ── agendamentos ──────────────────────────────────────────────
export type StatusAgendamento = 'confirmado' | 'aguardando' | 'cancelado' | 'realizado'

export interface Agendamento {
  id: string
  cliente: string
  telefone: string | null
  servico: string
  data_hora: string
  status: StatusAgendamento
  observacoes: string | null
  created_at: string
}

export type NovoAgendamento = Omit<Agendamento, 'id' | 'created_at'>

// ── renovacoes ────────────────────────────────────────────────
export type StatusRenovacao = 'pendente' | 'contatado' | 'convertido' | 'perdido'
export type PrioridadeRenovacao = 'urgente' | 'media' | 'normal'

export interface Renovacao {
  id: string
  cliente: string
  telefone: string | null
  email: string | null
  tipo_certificado: string
  data_vencimento: string
  dias_restantes: number
  valor: number | null
  prioridade: PrioridadeRenovacao
  status: StatusRenovacao
  observacoes: string | null
  created_at: string
  // campos estendidos (migration: renovacoes_migration.sql)
  pedido: string | null
  protocolo: string | null
  cpf: string | null
  cnpj: string | null
  razao_social: string | null
  agr: string | null
  vendedor: string | null
  contador: string | null
  renovado: boolean
  ultimo_lembrete: string | null
}

// ── links de produtos ─────────────────────────────────────────
export interface LinkProduto {
  id: string
  tipo_certificado: string
  link_renovacao: string | null
  link_nova_emissao: string | null
  descricao: string | null
  ativo: boolean
  whatsapp_template_id: string | null
  slug: string | null
  vendedor_id: string | null
  created_at: string
  updated_at: string
}

export type NovoLinkProduto = Omit<LinkProduto, 'id' | 'created_at' | 'updated_at'>

// ── financeiro ────────────────────────────────────────────────
export type TipoLancamento = 'pagar' | 'receber'
export type StatusLancamento = 'pendente' | 'pago' | 'recebido' | 'cancelado'

export interface Lancamento {
  id: string
  tipo: TipoLancamento
  descricao: string
  vencimento: string
  valor: number
  status: StatusLancamento
  categoria: string | null
  created_at: string
}

export type NovoLancamento = Omit<Lancamento, 'id' | 'created_at'>

export interface ContaBancaria {
  id: string
  banco: string
  agencia: string | null
  conta: string | null
  tipo: 'corrente' | 'poupanca' | 'carteira'
  saldo: number
  ativo: boolean
  created_at: string
}

// ── integrações / comunicação ─────────────────────────────────
export type IntegrationProvider =
  | 'chatwoot' | 'chatwoot_disparo' | 'email_smtp' | 'n8n' | 'gestao_ar'
  | 'safe2pay' | 'safeweb' | 'supabase' | 'evolution'

export type IntegrationStatus = 'ativo' | 'pendente' | 'erro' | 'inativo'
export type CommunicationChannel = 'whatsapp' | 'email' | 'webhook'
export type CommunicationProvider = 'chatwoot' | 'chatwoot_disparo' | 'email_smtp' | 'n8n' | 'evolution'
export type CommunicationStatus = 'queued' | 'processing' | 'sent' | 'failed' | 'cancelled'
export type AutomationChannel = 'whatsapp' | 'email' | 'whatsapp_email' | 'webhook'
export type WhatsAppEngine = 'evolution' | 'zapi' | 'custom'

export interface ExternalIntegration {
  id: string
  provider: IntegrationProvider
  name: string
  description: string | null
  status: IntegrationStatus
  base_url: string | null
  webhook_url: string | null
  api_token: string | null
  account_id: string | null
  inbox_id: string | null
  instance_name: string | null
  sender_name: string | null
  sender_email: string | null
  host: string | null
  port: number | null
  username: string | null
  metadata: Record<string, unknown>
  last_test_at: string | null
  last_error: string | null
  created_at: string
  updated_at: string
}

export type NovaExternalIntegration = Omit<ExternalIntegration, 'id' | 'created_at' | 'updated_at' | 'last_test_at' | 'last_error'>

export interface AutomationRule {
  id: string
  rule_key: string
  label: string
  channel: AutomationChannel
  trigger_key: string
  ativo: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface CommunicationTemplate {
  id: string
  template_key: string
  name: string
  channel: 'whatsapp' | 'email'
  subject: string | null
  body: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface CommunicationOutbox {
  id: string
  channel: CommunicationChannel
  provider: CommunicationProvider
  to_address: string
  subject: string | null
  body: string
  payload: Record<string, unknown>
  status: CommunicationStatus
  error_message: string | null
  scheduled_for: string
  sent_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// ── auth / profiles ───────────────────────────────────────────
export type PerfilAcesso = 'admin' | 'usuario' | 'vendedor' | 'agente_registro'
export type TipoVinculoUsuario = 'agente_registro' | 'parceiro' | 'vendedor' | 'contador' | 'usuario_comum' | 'cliente_portal'

export type NivelAcesso = 'nenhum' | 'visualizar' | 'editar' | 'admin'

export type ModuloSistema = {
  id: string
  chave: string
  nome: string
  descricao: string | null
  grupo: string
  icone: string | null
  rota: string | null
  ordem: number
  ativo: boolean
}

export type PerfilAcessoRow = {
  id: string
  nome: string
  descricao: string | null
  nivel: number
  padrao: boolean
}

export type ProfilePermissao = {
  profile_id: string
  perfil_nome: string
  nivel_acesso: NivelAcesso
  chave: string
  nome: string
  grupo: string
  icone: string | null
  rota: string | null
  ordem: number
}

export type PermissaoPagina =
  | 'portal'
  | 'dashboard'
  | 'comercial'
  | 'clientes'
  | 'chat'
  | 'renovacoes'
  | 'financeiro'
  | 'relatorios'
  | 'parceiros'
  | 'configuracoes'
  | 'catalogo_ia'

export interface Profile {
  id: string
  clerk_user_id: string | null
  nome: string
  email: string
  perfil: PerfilAcesso
  status: 'ativo' | 'inativo'
  tipo_vinculo: TipoVinculoUsuario | null
  parceiro_id: string | null
  vinculo_nome: string | null
  documento: string | null
  telefone: string | null
  cidade: string | null
  observacoes: string | null
  permissoes: PermissaoPagina[] | null
  created_at: string
}

// ── date filter ───────────────────────────────────────────────
export type DateFilterOption =
  | 'hoje' | 'ontem' | '7dias' | 'este_mes' | 'mes_passado' | '3meses' | 'personalizado'

export interface DateRange {
  from: Date
  to: Date
}

// ══════════════════════════════════════════════════════════════
// V2 — estrutura relacional
// ══════════════════════════════════════════════════════════════

// ── cadastros_base ────────────────────────────────────────────
export type TipoCadastroCadastroBase = 'cliente' | 'fornecedor' | 'cliente_fornecedor'

export interface CadastroBase {
  id: string
  tipo_cliente: TipoCliente
  tipo_cadastro: TipoCadastroCadastroBase
  cpf_cnpj: string
  nome: string
  nome_fantasia: string | null
  email: string | null
  telefone: string | null
  cidade: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  uf: string | null
  cep: string | null
  inscricao_municipal: string | null
  inscricao_estadual: string | null
  iss_retido: boolean
  status: 'ativo' | 'inativo'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NovoCadastroBase = Omit<CadastroBase, 'id' | 'created_at' | 'updated_at'>

// ── empresas_cliente ──────────────────────────────────────────
export interface EmpresaCliente {
  id: string
  cadastro_base_id: string
  cnpj: string | null
  razao_social: string
  nome_fantasia: string | null
  email: string | null
  telefone: string | null
  cidade: string | null
  status: 'ativo' | 'inativo'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NovaEmpresaCliente = Omit<EmpresaCliente, 'id' | 'created_at' | 'updated_at'>

// ── titulares_certificado ─────────────────────────────────────
export interface TitularCertificado {
  id: string
  nome: string
  cpf: string
  data_nascimento: string | null
  email: string | null
  telefone: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NovoTitularCertificado = Omit<TitularCertificado, 'id' | 'created_at' | 'updated_at'>

// ── pontos_atendimento ────────────────────────────────────────
export interface PontoAtendimento {
  id: string
  codigo: string | null
  nome: string
  endereco: string | null
  cidade: string | null
  uf: string | null
  status: 'ativo' | 'inativo'
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NovoPontoAtendimento = Omit<PontoAtendimento, 'id' | 'created_at' | 'updated_at'>

export interface PontoAtendimentoAgente {
  id: string
  ponto_atendimento_id: string
  agente_id: string
  principal: boolean
  created_at: string
}

export interface AgenteTabelaPreco {
  id: string
  tabela_preco_id: string
  agente_registro_id: string
  ponto_atendimento_id: string | null
  ativo: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NovoAgenteTabelaPreco = Omit<AgenteTabelaPreco, 'id' | 'created_at' | 'updated_at'>

export interface ParceiroAgentePermitido {
  id: string
  parceiro_id: string
  agente_registro_id: string
  ponto_atendimento_id: string | null
  ativo: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NovoParceiroAgentePermitido = Omit<ParceiroAgentePermitido, 'id' | 'created_at' | 'updated_at'>

export interface AgenteDisponibilidade {
  id: string
  agente_registro_id: string
  ponto_atendimento_id: string
  dia_semana: number
  hora_inicio: string
  hora_fim: string
  intervalo_minutos: number
  capacidade_por_slot: number
  tipo_atendimento: TipoAtendimento | null
  ativo: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NovoAgenteDisponibilidade = Omit<AgenteDisponibilidade, 'id' | 'created_at' | 'updated_at'>

export interface AgenteIndisponibilidade {
  id: string
  agente_registro_id: string
  ponto_atendimento_id: string | null
  inicio_em: string
  fim_em: string
  motivo: string | null
  ativo: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NovaAgenteIndisponibilidade = Omit<AgenteIndisponibilidade, 'id' | 'created_at' | 'updated_at'>

export type OwnerTipoLojaMarketplace = 'institucional' | 'vendedor' | 'contador' | 'parceiro' | 'revendedor'

export interface LojaMarketplace {
  id: string
  nome_loja: string
  slug: string
  tabela_preco_id: string
  owner_tipo: OwnerTipoLojaMarketplace
  owner_profile_id: string | null
  owner_parceiro_id: string | null
  descricao: string | null
  dominio_publico: string | null
  ativo: boolean
  configuracoes: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NovaLojaMarketplace = Omit<LojaMarketplace, 'id' | 'created_at' | 'updated_at'>

// ── vendas_certificados ───────────────────────────────────────
export type StatusVendaCertificado = 'rascunho' | 'vendido' | 'agendado' | 'em_validacao' | 'emitido' | 'cancelado'
export type StatusPagamentoVenda = 'em_aberto' | 'pago' | 'recusado'
export type StatusPedidoProtocolo  = 'nao_gerado' | 'pendente' | 'gerado' | 'erro' | 'cancelado'
export type TipoComissao           = 'fixa' | 'percentual'
export type TipoParceiro = 'ar' | 'pa_controle_total' | 'pa_emissor' | 'contador' | 'vendedor' | 'gestor' | 'ecommerce'

export interface VendaCertificado {
  id: string
  loja_marketplace_id: string | null
  cadastro_base_id: string
  empresa_id: string | null
  titular_id: string | null     // null até a emissão do protocolo
  certificado_id: string | null
  tabela_preco_id: string | null
  tabela_preco_item_id: string | null
  pago: boolean
  status_pagamento: StatusPagamentoVenda
  data_pagamento: string | null
  data_vencimento: string | null
  tipo_produto: string
  tipo_venda: string | null
  tipo_emissao: string | null
  tabela_preco: string | null   // nome da tabela (snapshot texto)
  forma_pagamento_id: string | null
  valor_venda: number | null
  valor_custo: number | null
  // snapshot de faturamento
  documento_faturamento: string | null
  nome_faturamento: string | null
  email_faturamento: string | null
  telefone_faturamento: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
  inscricao_municipal: string | null
  inscricao_estadual: string | null
  iss_retido: boolean
  // responsáveis
  vendedor_id: string | null
  agente_registro_id: string | null
  contador_id: string | null
  ponto_atendimento_id: string
  // pedido / protocolo
  pedido_numero: string | null
  pedido_status: StatusPedidoProtocolo
  protocolo_numero: string | null
  protocolo_status: StatusPedidoProtocolo
  certificadora: string | null
  numero_serie: string | null
  data_inicio_validade: string | null
  voucher_codigo: string | null
  voucher_percentual: number | null
  voucher_valor: number | null
  nome_ar: string | null
  nome_local_atendimento: string | null
  status_certificado: string | null
  nome_parceiro_safeweb: string | null
  validado_safeweb: boolean | null
  api_payload_pedido: Record<string, unknown>
  api_payload_protocolo: Record<string, unknown>
  // comissão snapshot
  comissao_vendedor_tipo: TipoComissao | null
  comissao_vendedor_valor: number | null
  comissao_agente_tipo: TipoComissao | null
  comissao_agente_valor: number | null
  status_venda: StatusVendaCertificado
  observacoes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NovaVendaCertificado = Omit<VendaCertificado, 'id' | 'created_at' | 'updated_at'>

// ── agendamentos_validacao ────────────────────────────────────
export type StatusAgendamentoValidacao = 'pendente' | 'confirmado' | 'realizado' | 'cancelado'
export type TipoAtendimento = 'presencial' | 'videoconferencia' | 'auto_atendimento'

export interface AgendamentoValidacao {
  id: string
  venda_certificado_id: string
  cadastro_base_id: string
  empresa_id: string | null
  titular_id: string | null
  contador_id: string | null
  agente_registro_id: string | null
  ponto_atendimento_id: string | null
  data_agendada: string | null
  tipo_atendimento: TipoAtendimento | null
  status_agendamento: StatusAgendamentoValidacao
  observacoes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NovoAgendamentoValidacao = Omit<AgendamentoValidacao, 'id' | 'created_at' | 'updated_at'>

// ── produtos_emitidos ─────────────────────────────────────────
export type StatusCertificadoEmitido = 'ativo' | 'expirado' | 'revogado' | 'cancelado'

export interface ProdutoEmitido {
  id: string
  venda_certificado_id: string
  cadastro_base_id: string
  empresa_id: string | null
  titular_id: string
  certificado_id: string | null
  pedido_numero: string | null
  protocolo_numero: string | null
  numero_serie: string | null
  descricao_produto: string | null
  descricao_produto_midia: string | null
  validade: string | null
  data_emissao: string | null
  data_validade: string | null
  status_certificado: StatusCertificadoEmitido
  data_revogacao: string | null
  revogado_por: string | null
  codigo_revogacao: string | null
  descricao_revogacao: string | null
  aci_data: string | null
  aci_data_limite: string | null
  inicio_videoconferencia: string | null
  inicio_gravacao: string | null
  fim_gravacao: string | null
  latitude_emissao: number | null
  longitude_emissao: number | null
  latitude_local: number | null
  longitude_local: number | null
  nome_equipamento: string | null
  dna_equipamento: string | null
  verificacao: string | null
  endereco_validacao_externa: string | null
  tipo_emissao_realizada: string | null
  tipo_emissao_solicitada: string | null
  periodo_uso: string | null
  modelo: string | null
  grupo: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ── documentos_financeiros ────────────────────────────────────
export type TipoDocumentoFinanceiro =
  | 'nota_fiscal' | 'comprovante_pagamento' | 'contrato'
  | 'documento_pessoal' | 'documento_empresa' | 'outro'

export interface DocumentoFinanceiro {
  id: string
  lancamento_financeiro_id: string | null
  cadastro_base_id: string | null
  empresa_id: string | null
  titular_id: string | null
  venda_certificado_id: string | null
  produto_emitido_id: string | null
  tipo_documento: TipoDocumentoFinanceiro
  bucket: string
  storage_path: string
  nome_original: string
  mime_type: string | null
  tamanho_bytes: number | null
  hash_arquivo: string | null
  sensivel: boolean
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
  deleted_at: string | null
}

// ── bancos ────────────────────────────────────────────────────
export interface Banco {
  id: string
  codigo: string
  nome: string
  ispb: string | null
  ativo: boolean
  origem: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ── contas_bancarias_v2 ───────────────────────────────────────
export type TipoContaBancaria = 'corrente' | 'poupanca' | 'pagamento' | 'outro'

export interface ContaBancariaV2 {
  id: string
  banco_id: string
  tipo_conta: TipoContaBancaria
  agencia: string | null
  conta: string | null
  digito: string | null
  titular_cadastro_base_id: string | null
  cnpj_cpf_titular: string | null
  nome_titular: string | null
  data_abertura: string | null
  saldo_inicial: number
  ativa: boolean
  gateway: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NovaContaBancariaV2 = Omit<ContaBancariaV2, 'id' | 'created_at' | 'updated_at'>

// ── formas_pagamento_v2 ───────────────────────────────────────
export interface FormaPagamentoV2 {
  id: string
  nome: string
  codigo: string | null
  tipo: string | null
  gateway: string | null
  ativo: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface FormaPagamentoDisponibilidade {
  id: string
  forma_pagamento_id: string
  tipo_parceiro: TipoParceiro
  permitido: boolean
  ordem: number
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ── planos_contas ─────────────────────────────────────────────
export type TipoContaPlano = 'receita' | 'despesa' | 'ativo' | 'passivo' | 'patrimonio'

export interface PlanoContas {
  id: string
  tipo_conta: TipoContaPlano
  agrupador: string | null
  conta_lancamento: string
  codigo_reduzido: string | null
  ativa: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NovoPlanoContas = Omit<PlanoContas, 'id' | 'created_at' | 'updated_at'>

// ── centros_custos ────────────────────────────────────────────
export interface CentroCusto {
  id: string
  nome: string
  codigo: string | null
  ativo: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type NovoCentroCusto = Omit<CentroCusto, 'id' | 'created_at' | 'updated_at'>

// ── regras_comissao ───────────────────────────────────────────
export interface RegraComissao {
  id: string
  escopo: string
  perfil_destino: string
  tipo_calculo: TipoComissao
  valor: number
  vigencia_inicio: string | null
  vigencia_fim: string | null
  ativo: boolean
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ── comissoes_lancamentos ─────────────────────────────────────
export type PapelComissao = 'vendedor' | 'parceiro' | 'agente_registro'
export type StatusComissao = 'pendente' | 'aprovada' | 'paga' | 'cancelada'

export interface ComissaoLancamento {
  id: string
  venda_certificado_id: string | null
  produto_emitido_id: string | null
  usuario_id: string
  papel: PapelComissao
  base_valor: number
  percentual: number | null
  valor_comissao: number
  competencia: string
  status: StatusComissao
  origem: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ── fechamentos_agentes ───────────────────────────────────────
export type StatusFechamento = 'aberto' | 'fechado' | 'processando_pagamento' | 'concluido' | 'cancelado'
export type StatusPagamentoAgente = 'pendente' | 'selecionado' | 'enviado' | 'pago' | 'erro' | 'cancelado'

export interface FechamentoAgenteLote {
  id: string
  competencia: string
  status_fechamento: StatusFechamento
  observacoes: string | null
  gerado_por: string | null
  created_at: string
  updated_at: string
}

export interface FechamentoAgenteItem {
  id: string
  lote_fechamento_id: string
  agente_id: string
  cpf_agente: string | null
  nome_agente: string
  valor_bruto: number
  valor_fgts: number
  valor_inss: number
  valor_ir: number
  valor_outras_retencoes: number
  valor_liquido: number
  status_pagamento: StatusPagamentoAgente
  data_pagamento: string | null
  conta_bancaria_destino_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface FechamentoAgenteItemComissao {
  id: string
  fechamento_item_id: string
  comissao_lancamento_id: string
  created_at: string
}

// ── ordens_pagamento ──────────────────────────────────────────
export type StatusOrdemPagamento = 'pendente' | 'enviado' | 'processando' | 'pago' | 'erro' | 'cancelado'

export interface OrdemPagamento {
  id: string
  fechamento_item_id: string
  provider: string
  conta_origem_id: string | null
  conta_destino_id: string | null
  favorecido_nome: string
  favorecido_documento: string | null
  favorecido_chave_pix: string | null
  favorecido_banco: string | null
  favorecido_agencia: string | null
  favorecido_conta: string | null
  valor_pagamento: number
  status_integracao: StatusOrdemPagamento
  external_payment_id: string | null
  payload_envio: Record<string, unknown>
  payload_retorno: Record<string, unknown>
  erro_integracao: string | null
  solicitado_por: string | null
  processado_em: string | null
  created_at: string
  updated_at: string
}

// ── nfse ──────────────────────────────────────────────────────
export type AmbienteNfse = 'homologacao' | 'producao_restrita' | 'producao'
export type StatusNfse   = 'pendente' | 'emitida' | 'erro' | 'cancelada'
export type ProvedorNfse = 'nacional' | 'gissonline' | 'municipal'

export interface NfseConfiguracao {
  id: string
  identificador: string | null
  municipio_nome: string
  municipio_codigo_ibge: string | null
  provedor: ProvedorNfse
  ativo: boolean
  cadastro_base_emitente_id: string | null
  cnpj_emitente: string
  inscricao_municipal: string | null
  inscricao_estadual: string | null
  cnae: string | null
  ambiente: AmbienteNfse
  natureza_operacao: string | null
  simples_nacional: boolean
  regime_especial: string | null
  exigibilidade_iss: string | null
  incentivo_fiscal: boolean
  tipo_rps: string | null
  serie_rps: string | null
  numero_rps_atual: number
  codigo_servico_municipio: string | null
  codigo_tributacao_municipio: string | null
  codigo_cfps: string | null
  codigo_cst: string | null
  aliquota_iss: number | null
  aliquota_pis: number | null
  aliquota_cofins: number | null
  aliquota_inss: number | null
  aliquota_ir: number | null
  aliquota_csll: number | null
  usuario_prefeitura: string | null
  senha_prefeitura: string | null
  chave_autenticacao: string | null
  usa_certificado_digital: boolean
  certificado_pfx_path: string | null
  certificado_senha: string | null
  observacoes: string | null
  robo_ligado: boolean
  payload_reforma_tributaria: Record<string, unknown>
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface NfseEmitida {
  id: string
  lancamento_financeiro_id: string | null
  cadastro_base_tomador_id: string | null
  venda_certificado_id: string | null
  numero_nf: string | null
  codigo_verificacao: string | null
  status_nf: StatusNfse
  data_emissao: string | null
  valor_servico: number | null
  valor_iss: number | null
  xml_url: string | null
  pdf_url: string | null
  payload_envio: Record<string, unknown>
  payload_retorno: Record<string, unknown>
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ── extensões v2 em tabelas legadas ───────────────────────────
export interface RenovacaoV2Campos {
  venda_certificado_id: string | null
  produto_emitido_id: string | null
  cadastro_base_id: string | null
  empresa_id: string | null
  titular_id: string | null
  vendedor_fk_id: string | null
  agente_registro_fk_id: string | null
  contador_fk_id: string | null
  snapshot_json: Record<string, unknown>
  deleted_at: string | null
  deleted_by: string | null
  motivo_exclusao: string | null
}

export type RenovacaoV2 = Renovacao & RenovacaoV2Campos

export interface LancamentoV2Campos {
  conta_bancaria_v2_id: string | null
  plano_conta_id: string | null
  centro_custo_id: string | null
  cadastro_base_id: string | null
  venda_certificado_id: string | null
  produto_emitido_id: string | null
  documento_fiscal_id: string | null
  cobranca_gateway: string | null
  cobranca_link: string | null
  cobranca_id_externo: string | null
}

// ── webhook_log ───────────────────────────────────────────────
export type StatusWebhookLog = 'recebido' | 'processado' | 'erro'

export interface WebhookLog {
  id: string
  gateway: string
  evento: string
  payload: Record<string, unknown>
  status: StatusWebhookLog
  erro: string | null
  external_id: string | null
  ordem_pagamento_id: string | null
  created_at: string
}

export type LancamentoV2 = Lancamento & LancamentoV2Campos
