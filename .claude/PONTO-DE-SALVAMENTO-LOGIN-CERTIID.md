# Ponto de Salvamento - Login Certiid

Data: 2026-06-22
Projeto: AVMD_System
Ambiente: producao (crm.certiid.mantovan.com.br)

## Objetivo desta etapa
Ajustar acesso e interface de login para o CRM com dominio final, SSL valido, build correto e identidade visual Certiid.

## O que foi feito

1. Infra e acesso
- DNS do dominio crm.certiid.mantovan.com.br validado para 147.79.111.76.
- SSL/TLS ajustado no roteamento (Traefik), eliminando certificado padrao incorreto.
- SSH sem senha configurado na maquina local com chave ed25519 para root@147.79.111.76.

2. Publicacao frontend
- Deploy da pasta dist para /var/www/crm.certiid.mantovan.com.br.
- Correcao do erro 403 causada por inconsistencias de montagem/estado do servico web.
- Forcado refresh do servico avmd_web para remontar e servir arquivos corretos.

3. Build e configuracao de runtime
- Correcao de estilo global: src/index.css passou a importar Tailwind via @import "tailwindcss".
- Build de producao validado repetidamente com sucesso.
- Bundle publico atualizado e referenciado no index.html em producao.

4. Tela de login (UI)
- Tela deixada responsiva e centralizada.
- Textos e labels ajustados para alto contraste (branco).
- Card de login com visual escuro e contraste melhor no fundo.
- Bloco de logo redimensionado para ocupar a largura da area de login.
- Remocao do nome em destaque no topo, mantendo subtitulo.

5. Identidade visual Certiid
- Logo publicada em public/logo-certiid.png.
- Fallback de marca ajustado para usar logo Certiid por padrao.
- Normalizacao para substituir legado "favicon.svg" nas configs de logo.

6. Usuario admin (senha inicial)
- Definida senha inicial padrao para criacao de usuario com perfil admin: 1234qwer.
- Autopreenchimento da senha inicial ao selecionar perfil admin no modal de novo usuario.

## Arquivos principais alterados
- src/index.css
- src/pages/Login.tsx
- src/lib/agencyConfig.ts
- src/pages/Configuracoes.tsx
- public/logo-certiid.png

## Estado atual validado
- Site abre em https com resposta 200.
- Assets novos publicados no servidor.
- Tela de login com novo layout e logo Certiid aplicada.

## O que faremos em seguida

1. Refino visual da logo
- Ajustar escala, recorte e espacamento do bloco da logo conforme aprovacao final do usuario.
- Garantir consistencia em desktop e mobile.

2. Revisao de UX da tela de login
- Revisar hierarchy visual (titulo, subtitulo, campos e botoes).
- Ajustar detalhes de tipografia e espacamento para acabamento premium.

3. Seguranca operacional
- Recomendar troca imediata da senha inicial 1234qwer apos primeiro acesso do admin.
- (Opcional) Implementar fluxo para forcar troca de senha no primeiro login de usuario admin criado.

4. Fechamento tecnico
- Rodar validacao final de build/deploy apos refinamentos.
- Registrar checkpoint final com status de homologacao.
