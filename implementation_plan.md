# Plano - Checkout Completo por Link

## Objetivo

Criar uma tela pública de compra por link, pensada para uso por agente, parceiro, contador e vendedor, permitindo que o cliente conclua toda a jornada mesmo sem acesso ao sistema interno.

Essa tela deve permitir de forma simples e intuitiva:

- escolher o produto
- preencher os dados de faturamento
- informar os dados do titular do certificado
- escolher a forma de pagamento
- escolher o agendamento da validação
- concluir a compra sem se perder no processo

## Problema Atual

O link público hoje está incompleto para o fluxo comercial real.

Pontos críticos identificados:

- a jornada não deixa claro quem paga, quem recebe a NF e quem será o titular do certificado
- o preenchimento não está simples o suficiente para clientes leigos
- o uso no smartphone não está 100%
- falta destaque visual campo a campo para orientar o cliente
- o agendamento precisa ficar mais visível e mais explicativo
- o sistema precisa avisar com clareza que o atendimento só ocorre após compensação do pagamento

## Requisitos de Negócio

O checkout precisa atender os seguintes cenários:

- uma empresa compra e paga
- a NF é emitida para os dados de faturamento da compra
- o protocolo e o certificado são vinculados à pessoa que realmente será titular
- em alguns casos faturamento e titular serão a mesma pessoa
- em outros casos serão pessoas diferentes

## Princípios da Nova Tela

- experiência extremamente fácil e intuitiva
- leitura rápida e sem confusão
- foco em conversão
- linguagem simples para cliente final
- uso fluido em desktop e smartphone
- destaque claro do próximo campo a ser preenchido
- redução máxima de abandono no meio do processo

## Estrutura Proposta da Tela

Layout em duas camadas de uso:

1. Conteúdo principal com o formulário de compra
2. Coluna ou bloco fixo de resumo com produto, valor, pagamento e CTA

Em telas menores, tudo deve reorganizar para uma experiência mobile real, sem quebra de leitura e sem campos apertados.

## Blocos da Jornada

### 1. Resumo da compra

Exibir:

- nome do certificado
- mídia
- tipo de emissão
- validade
- descrição resumida
- valor final

### 2. Forma de pagamento

Opções previstas:

- boleto
- cartão
- pix

### 3. Dados do faturamento

Campos esperados:

- pessoa jurídica ou pessoa física
- CPF ou CNPJ
- nome / razão social
- nome fantasia quando aplicável
- endereço
- CEP
- número
- complemento
- bairro
- estado
- cidade
- telefone
- e-mail

Esses dados serão usados para faturamento e NF.

### 4. Dados do titular do certificado

Campos esperados:

- nome do titular
- CPF do titular
- data de nascimento
- e-mail do titular
- telefone com WhatsApp do titular

Regra essencial:

- incluir opção `Os dados do titular do certificado são os mesmos do faturamento`

Quando marcada:

- copiar automaticamente os dados compatíveis
- ocultar ou recolher os campos extras
- reduzir atrito no preenchimento

### 5. Agendamento da validação

O agendamento deve aparecer com muito destaque, preferencialmente em modal ou painel flutuante.

Esse bloco deve permitir:

- escolher data
- escolher horário
- escolher agente disponível
- visualizar o tipo de atendimento

Também deve permitir seguir sem agendar, mas com aviso muito claro de pendência.

### 6. Avisos obrigatórios

Mensagens que precisam ficar visíveis:

- `O atendimento para validação só será realizado após a compensação do pagamento.`
- `Se você não agendar agora, será necessário fazer o agendamento depois para ser atendido.`
- `Informe e-mail e telefone com WhatsApp válidos para receber contato da equipe no momento da validação.`

## Requisitos de Usabilidade

Essa parte é crítica e foi reforçada como prioridade.

### Experiência intuitiva

- a interface deve ser extremamente fácil para qualquer cliente
- a ordem dos campos deve guiar a compra naturalmente
- o cliente precisa entender rapidamente o que fazer sem depender de suporte

### Destaque do campo atual

Cada campo a ser preenchido deve orientar o cliente visualmente.

Aplicar:

- foco visual forte no campo ativo
- borda destacada
- contraste superior ao restante da tela
- texto de apoio curto quando necessário
- indicação clara de obrigatório
- mensagens de erro objetivas logo abaixo do campo

### Progressão visual

Implementar sensação de avanço no preenchimento:

- seção atual em destaque
- seções concluídas com feedback visual
- próximos passos claros

## Requisitos Mobile

Essa melhoria deve corrigir a limitação atual de uso no smartphone.

Objetivo:

- tela 100% funcional no celular
- sem cortes
- sem botões difíceis de tocar
- sem campos desalinhados
- sem texto pequeno demais

Aplicar no mobile:

- empilhamento correto dos blocos
- CTA sempre visível ou fácil de reencontrar
- espaçamento confortável para toque
- inputs grandes
- modal/painel de agendamento adaptado para tela pequena
- resumo da compra reposicionado sem atrapalhar o preenchimento

## Regras Funcionais da Venda

O novo checkout deve gravar corretamente:

- produto selecionado
- loja/origem do link
- dados do comprador
- dados do faturamento
- dados do titular do certificado
- forma de pagamento
- agendamento confirmado ou pendente

## Comportamento Recomendado

- permitir compra sem agendamento
- exigir e-mail e telefone com WhatsApp
- destacar com clareza a pendência quando não houver agendamento
- informar que a validação depende da compensação do pagamento

## Plano de Execução

### Etapa 1 - Reestruturar a tela pública

- redesenhar a tela do checkout/link público
- organizar a jornada por blocos
- melhorar hierarquia visual

### Etapa 2 - Separar faturamento e titular

- criar seções distintas
- incluir opção para copiar dados
- garantir clareza entre pagador, faturamento e titular

### Etapa 3 - Melhorar pagamento e agendamento

- reforçar a seleção da forma de pagamento
- criar experiência de agendamento mais clara e destacada
- tratar cenário com e sem agendamento

### Etapa 4 - Fazer mobile de verdade

- revisar toda a responsividade
- adaptar espaçamentos, blocos, resumo e CTA
- validar a jornada no smartphone

### Etapa 5 - Ajustar feedbacks e validações

- foco visual por campo
- mensagens de erro
- avisos obrigatórios
- sensação de progresso da compra

### Etapa 6 - Integrar ponta a ponta

- alinhar frontend e backend do checkout público
- garantir gravação correta da venda
- garantir gravação correta do agendamento e dos dados do titular

## Critérios de Aprovação

Essa entrega será considerada correta quando:

- o cliente conseguir comprar sozinho pelo link
- a diferença entre faturamento e titular ficar clara
- o agendamento estiver fácil de entender e usar
- o uso no smartphone estiver realmente funcional
- cada campo importante estiver visualmente orientado
- o cliente não se perder na jornada
