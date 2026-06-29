# Ponto de Salvamento — DNS, TLS e Clerk Configurados

Data: 2026-06-22

## ✅ Resolvido nesta sessão

1. **DNS**: `crm.certiid.mantovan.com.br` resolve para `147.79.111.76`
2. **TLS**: Certificado Let's Encrypt válido (não mais TRAEFIK DEFAULT CERT)
3. **Backend**: `avmd-backend` rodando na porta 8787, `/healthz` respondendo `{"ok":true}`
4. **Chave Clerk salva**: `VITE_CLERK_PUBLISHABLE_KEY=pk_test_ZHluYW1pYy1vc3ByZXktNzEuY2xlcmsuYWNjb3VudHMuZGV2JA`
5. **Router Traefik**: Agora aceita ambos os hosts `crm.certiid.mantovan.com.br` e `certiid.mantovan.com.br`
6. **Dockerfile + Deploy**: Variável `VITE_CLERK_PUBLISHABLE_KEY` propagada no build (Dockerfile, deploy.sh, GitHub Actions)

## ❌ Bloqueio final (causa do erro atual)

**Erro no console do navegador:**
```
Configuracao obrigatoria ausente para o modo atual (supabase_legacy): VITE_CLERK_PUBLISHABLE_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY ou VITE_SUPABASE_ANON_KEY
```

**Causa:** O build entrou em modo `supabase_legacy` quando deveria estar em modo `aiven_api`.

**Motivo:** A variável `VITE_USE_LEGACY_SUPABASE=false` não foi lida pelo build durante a compilação.

## ✅ Solução imediata (passo a passo)

Na VPS, **na ordem exata**:

```bash
cd /opt/avmd/AVMD_System

# 1. Criar .env (RAIZ do projeto, não .env.local)
cat > .env << 'EOF'
VITE_CLERK_PUBLISHABLE_KEY=pk_test_ZHluYW1pYy1vc3ByZXktNzEuY2xlcmsuYWNjb3VudHMuZGV2JA
VITE_API_BASE_URL=https://api.certiid.mantovan.com.br
VITE_USE_LEGACY_SUPABASE=false
EOF

# 2. Instalar dependências
npm ci

# 3. Build com as variáveis
npm run build

# 4. Validar que entrou em modo aiven_api (NÃO supabase_legacy)
grep -q "aiven_api" dist/assets/index-*.js && echo "✅ Modo correto: aiven_api" || echo "❌ ERRO: ainda em supabase_legacy"

# 5. Publicar frontend
mkdir -p /var/www/crm.certiid.mantovan.com.br
rsync -a --delete dist/ /var/www/crm.certiid.mantovan.com.br/

# 6. Recarregar nginx
nginx -t && systemctl reload nginx

# 7. Confirmar acesso
curl -I https://crm.certiid.mantovan.com.br
```

## ✅ Validação final no navegador

Depois que os comandos acima terminarem:

1. Abrir **aba anônima** (Ctrl+Shift+N)
2. Limpar cache completo (Ctrl+Shift+Delete, marcar "Todos os tempos")
3. Navegar para: `https://crm.certiid.mantovan.com.br`
4. Hard refresh: Ctrl+F5
5. **Esperado:** Tela de login do Clerk (não tela branca)
6. Se ainda branco, F12 > Console > enviar primeira linha vermelha

## 📝 Observações importantes

- **NÃO há mais Supabase** na cadeia de produção do AVMD.
- A variável `VITE_USE_LEGACY_SUPABASE=false` **deve estar** no `.env` da VPS durante o build.
- O `.gitignore` já protege `.env`, então não será versionado.
- Backend Aiven (`avmd-backend`) já está rodando e respondendo corretamente.

## 🎯 Próximo passo após validar login

Se o login funcionar com sucesso:

1. Registrar novo ponto de salvamento
2. Documentar credenciais de teste para validação
3. Publicar em produção com confiança

