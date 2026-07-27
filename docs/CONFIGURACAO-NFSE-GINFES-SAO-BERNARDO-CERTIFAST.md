# Configuração de NFS-e — Certifast / São Bernardo do Campo

Registro da configuração validada em produção em 27/07/2026.

Este documento é exclusivo para:

- Razão social: CertiFast Certificação Digital Ltda.
- CNPJ: 20.776.537/0001-55
- Município emissor: São Bernardo do Campo/SP
- Provedor: GINFES / GISSOnline

Não reutilizar esta configuração para outro CNPJ sem uma nova validação fiscal e técnica.

## Dados do emitente

| Campo no sistema | Valor configurado |
|---|---|
| Razão social | CertiFast Certificação Digital Ltda. |
| CNPJ emitente | 20.776.537/0001-55 |
| Inscrição Municipal | 259619 |
| Município | São Bernardo do Campo |
| Código IBGE do município | 3548708 |
| Ambiente | Produção |
| Configuração ativa | Sim |

Observação: a Inscrição Municipal deve ser enviada à GINFES como `259619`, sem pontuação e sem o dígito adicional exibido em alguns documentos.

## Tributação e serviço

| Campo no sistema | Valor configurado |
|---|---|
| Natureza da operação | Tributação no município |
| Código interno enviado pela integração | 1 |
| Regime especial de tributação | 1 |
| Optante pelo Simples Nacional | Sim |
| Incentivador cultural / incentivo fiscal | Não |
| Alíquota do ISS | 2,00% |
| Item da lista de serviços | 17.02 |
| Código de tributação municipal | 17.02/102818/1241 |
| Descrição do código municipal | Outras atividades de serviços prestados principalmente às empresas |
| CNAE da Certifast | 8299799 |

Regras técnicas confirmadas na produção:

- O campo `Aliquota` é enviado à GINFES como `0.02`, equivalente a 2%.
- Como a Certifast é optante pelo Simples Nacional e não há retenção de ISS, `ValorIss` é enviado como `0.00`.
- Quando não existe retenção, o campo opcional `ValorIssRetido` não é enviado.
- O CNAE permanece cadastrado como `8299799`, mas o elemento opcional `CodigoCnae` não é enviado no XML, pois a GINFES de São Bernardo rejeitou esse elemento para esta operação.
- Os campos opcionais `DescontoCondicionado` e `DescontoIncondicionado` não são enviados quando não há desconto.

## RPS

| Campo no sistema | Valor configurado |
|---|---|
| Tipo do RPS | 1 |
| Série do RPS | 1 |
| Próximo número de RPS | 21094 |
| Fuso horário da emissão | America/Sao_Paulo |

O RPS 21093 já foi utilizado e gerou:

- NFS-e: 260
- Código de verificação: QOQ7WGJMO
- Protocolo GINFES: 174556668092
- Valor do teste real: R$ 1,00

Nunca reduzir manualmente o próximo RPS para 21093.

## Endereços da integração

| Campo no sistema | Valor configurado |
|---|---|
| WSDL de homologação | https://homologacao.ginfes.com.br/ServiceGinfesImpl?WSDL |
| WSDL de produção | https://producao.ginfes.com.br/ServiceGinfesImpl?WSDL |
| Certificado digital do cliente exigido | Sim |
| Emissão de produção habilitada | Sim |

## Certificado A1

| Campo no sistema | Valor/configuração |
|---|---|
| Usar certificado digital | Sim |
| Arquivo PFX/P12 | Configurado no armazenamento protegido do servidor |
| Senha do certificado | Configurada como segredo protegido; não registrar neste documento |
| CNPJ esperado no certificado | 20.776.537/0001-55 |

O arquivo e a senha do certificado não devem ser enviados por mensagem, planilha, chamado ou documentação aberta.

## Dados obrigatórios do tomador em cada emissão

Antes de emitir, a venda deve possuir:

- CPF ou CNPJ válido;
- nome ou razão social;
- e-mail;
- telefone;
- CEP;
- logradouro;
- número;
- bairro;
- município;
- UF;
- código IBGE do município;
- valor do serviço;
- descrição do serviço.

Para o pedido 21093, o código IBGE do tomador utilizado foi `3547809`, correspondente a Santo André/SP.

## Caminho no AVMD SYSTEM

1. Abrir **Configurações**.
2. Acessar a área de **Nota Fiscal / NFS-e**.
3. Preencher os campos conforme as tabelas deste documento.
4. Anexar o certificado A1 da Certifast.
5. Informar a senha somente no campo protegido do sistema.
6. Salvar e executar o teste de integração.
7. Confirmar que o próximo RPS permanece sequencial antes de emitir.

## Resultado da validação

A integração de produção foi validada com emissão real pela Prefeitura de São Bernardo do Campo. A configuração acima é a referência operacional vigente para a Certifast.
