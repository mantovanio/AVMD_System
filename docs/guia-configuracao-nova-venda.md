# Guia: Como o wizard de Nova Venda decide o que aparece em cada passo

Este guia documenta, com base no código real de `src/pages/Comercial.tsx`, como as telas de configuração (Tabelas de Preço, Pontos de Atendimento, Parceiros, Certificados) se conectam para determinar o que aparece disponível no wizard de "Nova Venda". Serve como referência para diagnosticar por que uma tabela, produto ou parceiro não aparece onde era esperado.

## Visão geral dos passos do wizard

1. Tipo de venda
2. Cliente
3. Parceiro vendedor / indicador da venda
4. Tipo de emissão (Presencial, Videoconferência, Auto atendimento, Online)
5. Ponto de atendimento
6. Tabela e produto
7. Pagamento e desconto

Cada passo alimenta filtros nos passos seguintes. Este guia foca no passo 6, que é onde mais dúvidas de configuração aparecem.

## Onde cada coisa é configurada

| Conceito | Tela de configuração | Tabela no banco |
|---|---|---|
| Tabela de Preço | Comercial → Tabelas de Preço | `tabelas_preco` |
| Produtos de uma tabela | Dentro do detalhe da tabela (clique na tabela na lista) | `tabelas_preco_itens` |
| Participantes de uma tabela (restrição por parceiro) | Dentro do detalhe da tabela → aba/seção Participantes | `tabela_preco_participantes` |
| Vínculo Agente + Tabela + Ponto | Botão "Associar agente" no detalhe da tabela | `agentes_tabelas_preco` |
| Pontos de Atendimento | Comercial → Pontos de Atendimento | `pontos_atendimento` |
| Parceiros | Comercial → Parceiros | dados de parceiro (`parceiros`) |
| Certificados/Produtos | Comercial → Certificados | `certificados` |

## Regra importante: Tabela de Preço NÃO é vinculada a Ponto de Atendimento diretamente

Não existe nenhuma coluna no banco que ligue uma `tabela_preco` a um `ponto_atendimento`. A única relação entre os dois é indireta, via `agentes_tabelas_preco` (que liga um **agente** a uma tabela **e** a um ponto).

Isso tem uma consequência importante: **o filtro de "Tabela de Preço" no passo 6 só é restringido pelo Ponto de Atendimento selecionado quando o usuário logado tem perfil `agente_registro`** ([Comercial.tsx:792-806](../src/pages/Comercial.tsx#L792-L806)). Para perfis `admin`, `vendedor` e `usuario`, a lista de tabelas do passo 6 **ignora completamente** qual ponto foi selecionado no passo 5 — mostra todas as tabelas ativas que tenham pelo menos um produto ativo, sujeitas só aos outros filtros descritos abaixo.

Ou seja: nomear uma tabela "Matriz" ou "BH" é só uma convenção de nome para humanos — o sistema não usa esse nome para ligar a tabela ao ponto de atendimento de mesmo nome.

## O que decide se uma tabela aparece no passo 6 (`tabelasDisponiveisVenda`)

Código-fonte: [Comercial.tsx:786-843](../src/pages/Comercial.tsx#L786-L843).

Uma tabela só aparece na lista se passar por **todos** estes filtros, em ordem:

1. **A tabela está ativa** (`tabelas_preco.ativo = true`).
2. **A tabela tem pelo menos um produto com status ativo** (`tabelas_preco_itens.ativo = true` para algum item daquela tabela). Ter produtos cadastrados não é suficiente — eles precisam estar com o toggle "Ativo" ligado individualmente. A contagem de "Produtos" na lista de tabelas conta todos os itens, ativos ou não — **não use essa contagem para concluir que a tabela vai aparecer no wizard**; sempre abra o detalhe da tabela e confira a pílula de status de cada produto.
3. **Se o usuário logado for `agente_registro`**: a tabela precisa estar vinculada a esse agente **e** a esse ponto específico, via "Associar agente" ➔ `agentes_tabelas_preco`. Para outros perfis, este filtro não se aplica.
4. **Se a tabela tiver "Participantes" cadastrados** (`tabela_preco_participantes`) **e** houver um Parceiro Vendedor selecionado no passo 3: o parceiro selecionado (ou o tipo de parceiro dele) precisa constar na lista de participantes da tabela. Se a tabela não tiver nenhum participante cadastrado, esse filtro não restringe nada (fica aberta a qualquer parceiro).
5. **Se um Tipo de Emissão foi selecionado no passo 4**: a tabela só aparece se pelo menos um dos seus produtos ativos tiver `tipo_emissao_padrao` igual ao selecionado, **ou** não tiver `tipo_emissao_padrao` definido (produto "genérico", aceito em qualquer tipo de emissão).

## Checklist de diagnóstico: "minha tabela não aparece no passo 6"

Siga nesta ordem:

1. A tabela está com status **Ativo** na lista de Tabelas de Preço?
2. Abra o detalhe da tabela. Ela tem pelo menos **um produto com a pílula verde de Ativo** (não só produtos listados)?
3. Qual é o **perfil do usuário logado**? Se for `agente_registro`, confirme em "Associar agente" que esse agente está vinculado a essa tabela **e** ao ponto de atendimento que está sendo usado na venda.
4. A tabela tem **Participantes** cadastrados? Se tiver, confirme que o parceiro selecionado no passo 3 (ou o tipo dele) está na lista. Teste temporariamente com "Seguir sem parceiro vendedor" para isolar esse filtro.
5. O **Tipo de Emissão** selecionado no passo 4 bate com o `tipo_emissao_padrao` de pelo menos um produto ativo da tabela? Teste trocando o tipo de emissão para ver se muda o resultado.
6. Se nada acima explicar, pode ser necessário inspecionar os dados diretamente (nomes duplicados, ids inconsistentes, etc.) — nesse ponto, acionar suporte técnico com os dados exatos das tabelas envolvidas.

## Limitação conhecida / investigação em aberto (2026-07-06)

Foi reportado um caso em que, com **4 tabelas cadastradas** (todas confirmadas ativas, todas com produtos ativos), **apenas 1 aparecia no passo 6**, independente de:

- ponto de atendimento selecionado (esperado, já que o usuário era `admin`, não `agente_registro`)
- trocar o tipo de emissão (Presencial ↔ Videoconferência)
- remover o parceiro vendedor selecionado

Todos os filtros documentados acima foram testados e descartados um a um sem explicar a diferença entre a tabela que aparece e as que não aparecem. A versão em produção foi confirmada como sendo exatamente o código mais atual (commit `6cb76f9`), então não é um problema de deploy desatualizado.

**Causa raiz ainda não identificada.** Hipóteses já descartadas: filtro por ponto, tipo de emissão, parceiro/participantes, status ativo de tabela e produtos, cache do navegador (testado com F5). Para retomar a investigação, o próximo passo é inspecionar diretamente os dados das 3 tabelas que não aparecem (nomes exatos, ids, e o conteúdo completo dos registros em `tabelas_preco` e `tabelas_preco_itens`) — algo que não foi possível fazer remotamente porque o ambiente de desenvolvimento não tem acesso aos dados reais de produção desta área.
