const stats = [
  { label: 'Contatos prontos', value: '48.320' },
  { label: 'Campanhas ativas', value: '18' },
  { label: 'Respostas hoje', value: '1.284' },
  { label: 'Conversões rastreadas', value: '3.092' },
]

const channels = [
  {
    title: 'E-mail marketing',
    text: 'Disparo em escala com métricas de entrega, abertura, clique, bounce e descadastro.',
  },
  {
    title: 'WhatsApp oficial',
    text: 'API da Meta com templates aprovados, respostas rastreáveis e governança por reputação.',
  },
  {
    title: 'Instagram',
    text: 'Canal de relacionamento e resposta dentro das permissões oficiais, conectado ao funil.',
  },
]

const providers = [
  {
    title: 'Meta / Cloud API',
    text: 'Canal oficial para credibilidade, rastreio e conformidade.',
  },
  {
    title: 'Evolution API',
    text: 'Roteamento flexível para múltiplos números e operações paralelas.',
  },
  {
    title: 'Z-API',
    text: 'Alternativa para distribuição de carga e continuidade operacional.',
  },
  {
    title: 'Conectores futuros',
    text: 'Estrutura preparada para novos gateways sem refazer o módulo.',
  },
]

const routingRules = [
  'Escolher o número com menor risco e melhor reputação.',
  'Aplicar limite por hora, por dia e por segmento.',
  'Trocar de provedor se a fila atingir alerta de entrega.',
  'Suspender campanhas para contatos que bloquearam ou reclamaram.',
]

const states = ['new', 'segmented', 'queued', 'contacted', 'engaged', 'replied', 'in_negotiation', 'converted']

export default function Engage() {
  return (
    <div className="h-full overflow-auto bg-[radial-gradient(circle_at_top,_#27354d_0,_#101724_42%,_#06080f_100%)] text-slate-100">
      <div className="mx-auto max-w-7xl px-6 py-6 lg:px-8">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/80">Engage</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
              Campanhas, respostas e automações
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Módulo integrado ao AVMD System para trabalhar e-mail, WhatsApp e Instagram com
              múltiplos provedores e múltiplos números.
            </p>
          </div>
          <div className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-100">
            segmentar · disparar · responder · converter · medir
          </div>
        </div>

        <div className="grid gap-4 py-6 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(item => (
            <div key={item.label} className="rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur">
              <p className="text-sm text-slate-300">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold text-white">{item.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[2rem] border border-white/10 bg-slate-950/60 p-6 shadow-2xl shadow-cyan-950/40 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-cyan-300/70">Canais</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Multicanal sem retrabalho</h2>
              </div>
              <div className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-300">
                operação controlada
              </div>
            </div>

            <div className="mt-6 grid gap-4">
              {channels.map((channel, index) => (
                <div key={channel.title} className="rounded-2xl border border-white/8 bg-white/4 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="font-medium text-white">{channel.title}</h3>
                    <span className="text-sm text-cyan-200">0{index + 1}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{channel.text}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl bg-gradient-to-r from-cyan-400/15 to-blue-500/15 p-4">
              <p className="text-sm text-cyan-100">Jornada resumida do lead</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {states.map(state => (
                  <span key={state} className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs text-slate-200">
                    {state}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-6">
            <div className="rounded-[2rem] border border-white/10 bg-slate-950/60 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Roteamento</p>
              <h2 className="mt-3 text-2xl font-semibold text-white">
                Múltiplos números e múltiplos provedores
              </h2>
              <div className="mt-5 grid gap-3">
                {providers.map(item => (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm uppercase tracking-[0.24em] text-cyan-300/70">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Regras de envio</p>
              <div className="mt-4 grid gap-3">
                {routingRules.map(rule => (
                  <div key={rule} className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-4 text-sm text-slate-200">
                    {rule}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <section className="mt-6 grid gap-6 border-t border-white/10 py-8 lg:grid-cols-3">
          <article className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Arquitetura</p>
            <h3 className="mt-3 text-2xl font-semibold text-white">AVMD Core</h3>
            <p className="mt-4 leading-7 text-slate-300">
              Mantém clientes, certificados, vencimentos e o histórico principal como base confiável da operação.
            </p>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Módulo</p>
            <h3 className="mt-3 text-2xl font-semibold text-white">Engage</h3>
            <p className="mt-4 leading-7 text-slate-300">
              Executa campanhas, respostas, automações e relatórios sem duplicar a base nem bagunçar o sistema principal.
            </p>
          </article>

          <article className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
            <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Integração</p>
            <h3 className="mt-3 text-2xl font-semibold text-white">Meta, Evolution, Z-API</h3>
            <p className="mt-4 leading-7 text-slate-300">
              O roteamento escolhe o provedor certo, o número certo e a fila certa sem quebrar o fluxo.
            </p>
          </article>
        </section>

        <section className="border-t border-white/10 py-8">
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Escopo da v1</p>
              <h3 className="mt-3 text-3xl font-semibold text-white">
                Base pronta para validar campanhas, respostas e roteamento
              </h3>
              <ul className="mt-5 grid gap-3 text-slate-200">
                <li>Base integrada de contatos</li>
                <li>Tags e segmentação dinâmica</li>
                <li>Templates e campanhas</li>
                <li>E-mail, WhatsApp e Instagram</li>
                <li>Integração com Meta, Evolution e Z-API</li>
                <li>Inbox e respostas</li>
                <li>Automações simples</li>
                <li>Relatórios básicos</li>
                <li>Tarefas de follow-up</li>
                <li>Roteamento por número e por provedor</li>
              </ul>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-slate-950/60 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/70">Pronto para crescer</p>
              <h3 className="mt-3 text-3xl font-semibold text-white">
                A arquitetura já nasce preparada para escalar.
              </h3>
              <p className="mt-4 text-slate-300">
                Você começa simples, valida valor rápido e depois amplia sem refazer a base.
                O desenho já considera múltiplos canais, múltiplos números e troca de provedor.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
