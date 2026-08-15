# Matriz de Interacoes da Clara

Mapeamento feito a partir de amostra real do CRM em 14/08/2026.

## Amostra analisada

- Periodo: conversas com interacao nos ultimos 30 dias.
- Conversas analisadas: 180.
- Mensagens analisadas: 3.078.
- Tabelas usadas: `crm_chat_conversations`, `crm_chat_messages`, `communication_events`.
- Dados sensiveis devem ser mascarados em qualquer relatorio externo.

## Volume por categoria

| Categoria | Conversas | Mensagens | Prioridade |
| --- | ---: | ---: | --- |
| Documentos e dados cadastrais | 140 | 572 | Alta |
| Saudacao ou resposta curta | 133 | 593 | Alta |
| Agendamento e videoconferencia | 126 | 302 | Alta |
| Pagamento, boleto, Pix, cartao e link | 88 | 269 | Alta |
| Suporte A1 e instalacao | 87 | 142 | Alta |
| Reclamacao, urgencia ou pedido humano | 60 | 114 | Alta |
| Preco, compra e renovacao | 49 | 210 | Alta |
| Suporte token/cartao A3 | 48 | 125 | Alta |
| e-CAC, gov.br e Receita | 4 | 4 | Media |
| Outros / sem intencao clara | 120 | 1.519 | Media |

## Intencoes principais e resposta esperada

### 1. Saudacao ou mensagem curta

Exemplos reais:
- "Oi"
- "Ola"
- "Bom dia"
- "Ok"

Resposta esperada:
- Cumprimentar naturalmente.
- Identificar se a conversa ja tem contexto.
- Se nao houver contexto, perguntar uma coisa simples.

Modelo:
"Oi! Sou a Clara da CertiID. Voce precisa de ajuda com compra, renovacao, instalacao ou agendamento do certificado?"

Regra:
- Nunca transferir por saudacao.
- Nunca responder com texto longo.

### 2. Agendamento e videoconferencia

Exemplos reais:
- "quero fazer a validacao por video"
- "Preciso estar na maquina ou pode ser pelo cel a video conferencia?"
- "Posso confirmar o horario?"
- "acabei de fazer um pagamento... tem algum link pra fazer o agendamento?"

Resposta esperada:
- Separar videoconferencia do uso do certificado.
- Para videoconferencia, celular pode ser usado se o processo permitir, mas token A3 nao e celular.
- Antes de confirmar video, fazer triagem.

Primeira pergunta:
"Voce ja teve certificado digital antes ou este e o primeiro?"

Fluxo:
- Se ja teve certificado antes: orientar renovacao/video conforme disponibilidade.
- Se primeiro certificado: perguntar se tem CNH valida/digital.
- Se nao tiver CNH valida/digital: orientar verificacao de biometria ou atendimento presencial.
- Se cliente ja pagou e pede agenda: buscar/fornecer link de agendamento ou direcionar para portal/pedido.

Regra:
- Nunca prometer videoconferencia sem triagem.
- Nunca confundir videoconferencia pelo celular com token A3 no celular.

### 3. Documentos e dados cadastrais

Exemplos reais:
- "Documento"
- "me passa o nome de quem vai ligar e o telefone"
- "Segue documentos da certificacao..."
- E-mails de agendamento com cliente, CPF/CNPJ, telefone, produto e posto.

Resposta esperada:
- Se o cliente enviou documento: confirmar recebimento e dizer o proximo passo.
- Se pediu dados de atendimento: informar apenas dados seguros e necessarios.
- Se for e-mail de agendamento, extrair e salvar automaticamente: nome, empresa, CPF/CNPJ, telefone, e-mail, pedido, produto, data/hora e posto.

Modelo para documento:
"Recebi o documento. Vou conferir os dados do pedido e te aviso se precisar de mais alguma coisa."

Regra:
- Nao pedir todos os dados de novo se eles ja aparecem no corpo do e-mail/agendamento.
- Evitar expor CPF/CNPJ completo em resposta ao cliente.

### 4. Pagamento, boleto, Pix, cartao e link

Exemplos reais:
- "pode reenviar o link da renovacao?"
- "Vai mandar o link por aqui?"
- "Pode mandar o link"
- "acabei de fazer um pagamento..."

Resposta esperada:
- Identificar se e link de compra, link de pagamento, boleto, Pix, cartao ou agendamento.
- Quando for valor/compra/renovacao, chamar `renovaCertiID`.
- Quando for pedido ja comprado, buscar pedido no CRM/portal antes de inventar link.

Modelo:
"Claro. Vou localizar seu pedido para te enviar o link correto. Voce pode me confirmar o CPF/CNPJ ou o e-mail usado na compra?"

Regra:
- Nunca inventar link.
- Nunca inventar valor.
- Para pagamento ja feito, verificar status antes de mandar novo link.

### 5. Preco, compra e renovacao

Exemplos reais:
- "Preciso de um certificado de pessoa fisica, qual o valor?"
- "conseguimos fazer a renovacao agora?"
- "e-CNPJ A3 com validade de 3 anos, por quanto conseguem fazer?"
- "Minha certificacao SafeID venceu. Como faco para renovar?"

Resposta esperada:
- Descobrir produto: e-CPF/e-CNPJ/NF-e, A1/A3/SafeID, validade, com ou sem midia.
- Chamar `renovaCertiID` para preco e link.

Primeira pergunta se faltar informacao:
"E para pessoa fisica ou empresa? E voce prefere A1 em arquivo, A3 em token/cartao ou certificado em nuvem?"

Regra:
- Preco sempre via tool.
- Link sempre via tool.
- Se cliente pediu renovacao, perguntar se e o mesmo certificado ou nova emissao quando houver duvida.

### 6. Suporte A1 e instalacao

Exemplos reais:
- "meu certificado A1 nao instala"
- "certificado nao aparece"
- "download"
- "assistente"

Resposta esperada:
- Nao tratar A1 como token.
- Orientar pelo Assistente de Certificado Digital Safeweb.
- Perguntar a etapa exata do erro.

Modelo:
"Entendi. O A1 e instalado como arquivo no computador. Voce ja abriu o Assistente de Certificado Digital da Safeweb? Em qual etapa apareceu o erro?"

Link base:
- https://instalacaocertificado-acsafeweb.safewebpss.com.br/

Regra:
- Nao falar em porta USB/token se o cliente informou A1.

### 7. Suporte token/cartao A3

Exemplos reais:
- "Parece que meu token nao funciona"
- "meu token nao esta funcionando"
- "O Token que retiramos nao esta funcionando"

Resposta esperada:
- Token/cartao A3 e computador/notebook com USB ou leitora.
- Nunca perguntar se esta conectado ao celular.
- Primeira pergunta deve buscar diagnostico.

Modelo:
"Entendi. O token esta conectado no computador e aparece alguma mensagem de erro na tela?"

Fluxo:
- Se nao reconhece: orientar driver SafeSign, reiniciar, conectar depois do driver, testar outra USB/leitora.
- Se senha/PIN bloqueado: escalar humano.
- Se token perdido/danificado/revogado: escalar humano.

Links base:
- https://www.safeweb.com.br/suporte/instalacao/tokenoucartao
- https://www.safeweb.com.br/centraldedownloads/token

Regra:
- Nunca associar token A3 a celular.

### 8. e-CAC, gov.br e Receita

Exemplos reais:
- "nao consigo acessar o eCAC"

Resposta esperada:
- Confirmar se o certificado aparece no navegador.
- Diferenciar A1/A3/SafeID.
- Perguntar mensagem exata.

Modelo:
"Entendi. Quando voce entra no e-CAC, o certificado aparece para selecionar no navegador?"

Regra:
- Nao culpar Receita/gov.br sem confirmar se o certificado esta reconhecido.

### 9. Pedido humano, urgencia ou reclamacao

Exemplos reais:
- "Urgente"
- "Pessoal, mil desculpas. Ela me enrolou"
- "Tem problema?"
- "nao funciona"

Resposta esperada:
- Se for urgencia com problema tecnico, fazer uma pergunta objetiva antes de transferir.
- Se cliente pedir humano claramente ou estiver irritado, transferir.
- Se for "nao funciona" generico, pedir detalhe do erro.

Modelo para problema generico:
"Entendi. Vou te ajudar com isso. Qual mensagem de erro aparece ou em qual etapa trava?"

Modelo para pedido claro de humano:
"Vou encaminhar seu atendimento para nossa equipe dar sequencia por aqui."

Regra:
- Nao usar `TRANSFERINDO` no primeiro contato tecnico simples.
- Escalar apos duas tentativas sem evolucao ou quando houver risco operacional.

### 10. Outros / sem intencao clara

Exemplos reais:
- "teste tecnico da clara"
- "Eu abri pelo aplicativo e nao tem nada nele"
- "Alexandre"

Resposta esperada:
- Nao inventar contexto.
- Perguntar uma coisa objetiva para identificar o problema.

Modelo:
"Entendi. Voce esta falando da compra, da instalacao do certificado ou do agendamento?"

Regra:
- Mensagem curta sem contexto deve virar pergunta de roteamento, nao resposta longa.

## Matriz para roteamento tecnico

| Sinal na mensagem | Intent | Primeira acao |
| --- | --- | --- |
| token, cartao, A3, SafeSign, leitora | `suporte_token_a3` | Perguntar se esta no computador e qual erro aparece |
| A1, arquivo, PFX, P12, instalar | `suporte_a1_instalacao` | Perguntar etapa do Assistente Safeweb |
| e-CAC, gov.br, Receita | `ecac_gov_receita` | Perguntar se certificado aparece no navegador |
| video, videoconferencia, validacao | `agendamento_video` | Perguntar se e primeiro certificado ou renovacao |
| boleto, Pix, cartao, pagamento | `pagamento_link_boleto_pix` | Localizar pedido/status antes de enviar link |
| valor, preco, comprar, renovacao | `preco_compra_renovacao` | Chamar `renovaCertiID` |
| documento, CPF, CNPJ, RG, CNH | `documentos_dados` | Confirmar recebimento ou solicitar apenas dado faltante |
| humano, atendente, urgente, reclamacao | `humano_reclamacao_urgencia` | Avaliar urgencia; transferir se pedido claro |

## Melhorias recomendadas

1. Criar um classificador deterministico antes da IA para marcar `intent` e `risk_level`.
2. Gravar em cada mensagem se foi `ia`, `humano`, `sistema` ou `email_agendamento`.
3. Criar base de respostas por intent, com uma pergunta por etapa.
4. Extrair automaticamente dados dos e-mails de agendamento para salvar contato sem preencher telefone no campo de e-mail.
5. Criar painel de auditoria da Clara com: pergunta do cliente, resposta da IA, intent, tool usada, status de envio e se houve handoff.
6. Criar lista de frases proibidas por intent, como "token no celular" em A3 e "TRANSFERINDO" no primeiro contato.
7. Separar conversas reais de mensagens de teste para nao contaminar metricas.

## Proxima implementacao sugerida

- Criar arquivo `docs/clara-playbook-respostas.md` com scripts finais de resposta.
- Atualizar o workflow `1- Clara | CertiID` para receber `intent` antes do prompt.
- Atualizar `AVMD - Clara Suporte Handler` para responder por intent de forma deterministica quando houver alta confianca.
