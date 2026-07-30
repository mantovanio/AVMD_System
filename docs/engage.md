# Engage

O `Engage` e o modulo do AVMD System voltado para campanhas, respostas e automacao comercial.

## Objetivo

Transformar a base existente do AVMD em uma operacao ativa de relacionamento, com:

- segmentacao de contatos
- disparo de campanhas
- leitura de respostas
- acompanhamento de conversao
- tarefas de follow-up
- medicao de resultados

## Canais previstos

### E-mail marketing

- envio em escala
- metricas de entrega
- abertura e clique
- bounce e descadastro

### WhatsApp

- integracao com a Meta via WhatsApp Business Platform / Cloud API
- uso de templates aprovados
- rastreio de entrega, leitura e resposta

### Instagram

- canal de relacionamento e resposta
- uso dentro das permissoes oficiais da Meta

## Provedores suportados

O modulo foi desenhado para trocar de provedor sem refazer a plataforma.

- Meta / Cloud API
- Evolution API
- Z-API
- conectores futuros

## Multipos numeros

O Engage pode operar com varios numeros por estrategia, por exemplo:

- renovacao
- novos leads
- reativacao
- follow-up

Cada numero pode ter:

- limite diario
- limite por hora
- reputacao
- prioridade
- provedor dedicado

## Estrutura funcional

- `Contatos`
- `Segmentos`
- `Campanhas`
- `Templates`
- `Inbox`
- `Automacoes`
- `Relatorios`
- `Tarefas`
- `Configuracoes`

## Fluxo operacional

1. O AVMD Core fornece a base de contatos e historico.
2. O Engage calcula segmentos.
3. A campanha seleciona canal, provedor e numero.
4. O disparo e executado.
5. Eventos voltam para o sistema.
6. O contato muda de estado.
7. Uma automacao pode criar tarefa ou bloquear comunicacao.

## Estados de contato

- `new`
- `segmented`
- `queued`
- `contacted`
- `engaged`
- `replied`
- `in_negotiation`
- `converted`
- `opt_out`
- `inactive`

## Roteamento de envio

O roteamento deve considerar:

- reputacao do numero
- volume permitido
- canal escolhido
- status do provedor
- risco de bloqueio
- fila atual

## Primeira entrega

A primeira etapa do Engage no sistema foi pensada para validar:

- menu integrado no AVMD
- pagina do modulo
- canais multicanal
- roteamento por provedor
- multiplos numeros
- visao inicial de automacao

## Integracao no menu

O módulo aparece apenas como `Engage` no menu principal do AVMD System.

## Proximo passo

Evoluir a primeira tela para:

- lista de contatos
- criacao de campanha
- inbox de respostas
- integracao real com provedores
- relatórios de performance
