# Manual CEM - Rotina Padrão de Atendimento

## Objetivo

Padronizar a operação do CEM para que toda entrada, triagem, resposta, salvamento, renovação e encerramento siga a mesma regra, com rastreabilidade completa no sistema.

## Regras gerais

- Toda interação deve ser registrada no sistema.
- A chave principal de identificação do cliente deve ser `CPF` ou `CNPJ`.
- O número do pedido é uma referência operacional importante, mas não deve ser a chave principal.
- O nome da pessoa e o nome da empresa devem ser registrados separadamente.
- Campos opcionais nunca podem bloquear o salvamento do contato.
- Toda mídia recebida ou enviada deve ser preservada no histórico quando possível.
- Conversas com mensagem não lida devem entrar na fila de não lidas.
- Mensagens do agente logado ou do operador cadastrado no sistema nunca podem ser classificadas como IA.

## 1. Entrada

### 1.1 Fontes de entrada

- WhatsApp via Evolution
- E-mail de agendamento
- E-mail de cancelamento
- Resposta manual do agente

### 1.2 Critérios de criação ou vínculo

- Se o contato já existir, a conversa deve ser vinculada ao cadastro existente.
- Se o contato não existir, o sistema deve criar um novo cadastro mínimo.
- A busca deve priorizar:
  - `CPF` ou `CNPJ`
  - telefone normalizado
  - e-mail
  - número do pedido, apenas como referência

### 1.3 Regra de cancelamento

- Cancelamentos de agendamento são críticos e entram com prioridade operacional.
- O e-mail de cancelamento normalmente traz apenas o número do pedido.
- Como o pedido é o mesmo do agendamento, ele deve ser tratado como a única chave imediata de decisão.
- Ao receber cancelamento:
  - localizar o agendamento pelo número do pedido
  - atualizar o status do agendamento para cancelado
  - registrar o evento no histórico
  - preservar os dados do cliente para futura renovação

## 2. Triagem

### 2.1 Classificação inicial

- Identificar se a entrada é:
  - agendamento
  - cancelamento
  - renovação
  - suporte
  - conversa humana
  - conversa automatizada

### 2.2 Classificação por origem

- Certisign
- Certifast
- CertiID
- Safeweb

### 2.3 Regras de triagem

- Se vier de e-mail de agendamento, capturar:
  - nome
  - empresa
  - telefone
  - e-mail
  - pedido
  - data
  - hora
  - produto
  - vencimento, se existir
- Se vier de cancelamento, capturar primeiro o pedido.
- Se houver áudio, imagem, vídeo ou documento, registrar como mídia do atendimento.
- Se a mensagem já existir no Chatwoot e não existir no sistema, o sistema deve receber a mesma conversa.

## 3. Resposta

### 3.1 Regra de resposta

- Toda resposta deve respeitar a origem do fluxo.
- Sem agente logado, a resposta deve sair pela marca correta:
  - CertiID para fluxos Safeweb
  - Certifast para fluxos Certisign
- Com agente logado, a resposta deve sair como humano cadastrado.
- A mensagem nunca pode parecer saída de IA quando o atendimento está em modo humano.

### 3.2 Conteúdo da resposta de agendamento

- Confirmar recebimento do agendamento.
- Informar data, hora e pedido.
- Orientar o envio dos documentos.
- Pedir:
  - documento pessoal colorido e legível
  - contrato social ou estatuto
  - ata atualizada, quando aplicável
- Reforçar que o atendimento é da Certifast, agência de registro vinculada à Certisign, quando o fluxo for Certisign.

### 3.3 Conteúdo da resposta de cancelamento

- Confirmar o cancelamento.
- Informar o número do pedido.
- Registrar que o pedido ficará disponível para nova decisão operacional.
- Manter o cadastro salvo para futura renovação.

## 4. Salvamento

### 4.1 Dados que devem ser salvos

- Nome da pessoa
- Nome da empresa
- Telefone
- E-mail
- CPF ou CNPJ
- Produto
- Vencimento
- Pedido
- Observações

### 4.2 Regras de salvamento

- O salvamento não pode travar por ausência de produto ou vencimento.
- Produto e vencimento devem ser adicionados ao histórico quando houver dado.
- O sistema deve atualizar o nome do contato imediatamente após salvar.
- O histórico precisa separar pessoa e empresa para facilitar operação futura.

## 5. Renovação

- Toda conversa concluída deve alimentar a base de renovação.
- O CPF ou CNPJ deve ser usado para reencontrar o cliente no futuro.
- O pedido deve ser guardado como referência de origem.
- O produto e o vencimento devem virar gatilhos de lembrete.
- Contatos de Certisign devem ser preparados para futura renovação pela Safeweb, quando aplicável.

## 6. Encerramento

### 6.1 Quando encerrar

- Encerrar somente quando:
  - o agendamento foi confirmado
  - os documentos foram solicitados
  - o cancelamento foi registrado
  - a interação não exige mais resposta ativa

### 6.2 Antes de encerrar

- Conferir se o contato foi salvo.
- Conferir se o histórico foi preenchido.
- Conferir se o pedido foi registrado.
- Conferir se a mídia foi preservada, quando existir.

### 6.3 Reabertura

- Se o cliente voltar a interagir, a conversa deve ser reaberta no mesmo contato.
- A mesma chave de identificação deve ser reaproveitada.

## 7. Regra operacional de prioridade

1. Cancelamento por pedido
2. Agendamento novo
3. Agendamento com retorno de documentos
4. Renovação
5. Suporte
6. Encerramento e histórico

## 8. Resultado esperado

- Nenhum agendamento deve ficar fora do sistema.
- Nenhum cancelamento deve ser perdido.
- Nenhuma conversa humana deve ser marcada como IA.
- Nenhuma mídia deve desaparecer do histórico sem rastreio.
- O contato deve ficar pronto para renovação futura.
