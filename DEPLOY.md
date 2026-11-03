# Deploy — Estokar

Guia para colocar o app no ar fora da sua máquina. São duas variáveis de ambiente e uma imagem Docker (ou um projeto na Vercel).

## Qual caminho escolher

| Se você... | Use |
| --- | --- |
| quer o caminho mais rápido e aceita usar webhook de e-mail | **Vercel** |
| quer todos os recursos, inclusive IMAP, e um domínio próprio | **VPS com Docker + Caddy** |
| quer Docker sem administrar servidor | **Railway/Render** (plano pago) |

O túnel **Quick Tunnel** do `compose.yaml` é só para demonstração: a URL muda a cada reinício. Para produção, use **domínio + Caddy** ou um **túnel nomeado** da Cloudflare.

O app é **Next.js + Supabase**. Não existe backend próprio além das rotas leves:

| Rota | Papel |
| --- | --- |
| `GET /api/config` | Entrega URL e chave pública do Supabase em tempo de execução. |
| `GET /api/health` | Health check (`{"ok":true,"supabase":"configured"}`). |
| `GET /api/integrations` | Contrato público para WhatsApp, e-mail/XML, QR Code e demais conectores. |
| `POST /api/nfce` | Consulta a SEFAZ a partir do QR Code da NFC-e. |
| `POST /api/inbound/email` | Webhook de e-mail com anexo XML em base64. |
| `POST /api/inbound/imap` | Worker IMAP que busca XMLs e grava a fila de e-mails pendentes. |

Como a configuração é lida a cada requisição, **trocar de projeto Supabase não exige rebuild**.

A leitura de foto roda no navegador com **Tesseract.js**. O `npm run build` copia o worker e o núcleo WebAssembly para `public/tesseract`, e o idioma português (`por.traineddata.gz`) é versionado. Não existe serviço de OCR externo para configurar; a imagem não é enviada ao servidor.

A tela `/integracoes` mostra o estado real de cada canal: planilha, foto/áudio, XML e QR Code funcionam; o WhatsApp da própria loja continua **não conectado**. A loja de demonstração em `/whatsapp` é alimentada pelo n8n. Nenhuma credencial de WhatsApp existe hoje no projeto.

O worker de e-mail é opcional. Sem `EMAIL_IMAP_*` e `SUPABASE_SERVICE_ROLE_KEY`, a fila de e-mails fica vazia e o XML pode ser enviado manualmente em **Importar**.

---

## 1. Preparar o Supabase (uma vez)

1. Crie um projeto em [supabase.com](https://supabase.com) (região `South America (São Paulo)` reduz a latência).
2. Abra **SQL Editor** e rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql). Ele cria tabelas, enums, RLS, a view `daily_totals`, as RPCs e o hardening de demo/seed. O script é idempotente: pode ser rodado de novo para aplicar as tabelas de **fornecedores, compras e contas a pagar** em um projeto que já existia. Projetos já criados podem aplicar só [`supabase/migrations/20261103_hardening.sql`](supabase/migrations/20261103_hardening.sql) e [`20261103_stock_entry.sql`](supabase/migrations/20261103_stock_entry.sql).
3. Ative o login anônimo em **Authentication → Sign In / Providers → Anonymous sign-ins**.
4. Em **Authentication → URL Configuration**, defina:
   - **Site URL**: o endereço final do app (ex.: `https://estokar.seudominio.com`).
   - **Redirect URLs**: o mesmo endereço com `/**`.
5. Em **Project Settings → API**, copie:
   - **Project URL** → `SUPABASE_URL`
   - **Publishable key** (ou `anon`) → `SUPABASE_ANON_KEY`

> **Nunca use `service_role`/`sb_secret_` no navegador.** Essa chave ignora o RLS e dá acesso total ao banco. O app do navegador só usa a publishable/anon; a única exceção é o worker de e-mail no servidor (`SUPABASE_SERVICE_ROLE_KEY`), que nunca é enviado ao cliente.

### Teste rápido do banco

No SQL Editor:

```sql
select count(*) as negocios from public.businesses;
select count(*) as itens from public.products;
select count(*) as fornecedores from public.suppliers;
select count(*) as contas from public.bills;
select count(*) as compras from public.purchases;
```

Se as tabelas existirem, o schema foi aplicado.

---

## 2. Opção A — Vercel (caminho mais rápido)

1. Suba o repositório no GitHub (já está em `RafaTavres/Integrativa26`).
2. Em [vercel.com/new](https://vercel.com/new), importe o repositório. O framework é detectado como Next.js; não precisa mudar build nem output.
3. Em **Environment Variables**, adicione para **Production**, **Preview** e **Development**:

| Nome | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://SEU-PROJETO.supabase.co` |
| `SUPABASE_ANON_KEY` | `sb_publishable_...` |

4. Clique em **Deploy**.
5. Abra `https://SEU-APP.vercel.app/api/health`. Deve responder:

```json
{ "ok": true, "supabase": "configured" }
```

6. Configure o domínio em **Settings → Domains** e atualize a **Site URL** no Supabase.
7. Cada `git push` na branch `main` gera um deploy novo. Variáveis alteradas exigem **Redeploy** (elas são lidas em runtime, mas o deploy precisa ser recriado para pegar o novo valor).

> A Vercel usa Node 20+ por padrão. Se o projeto estiver em uma versão antiga, ajuste em **Settings → General → Node.js Version** para 22.

> **IMPORTANTE — e-mail automático na Vercel:** a Vercel não mantém um worker IMAP de longa duração. Nela, use o webhook do provedor (`POST /api/inbound/email`) ou envie o XML manualmente. O QR/SEFAZ, o OCR e o restante do app funcionam normalmente. O worker IMAP é para VPS/Docker.

> Para o QR/SEFAZ, a Vercel precisa conseguir acessar os portais `.gov.br`. Isso funciona nas rotas serverless, mas alguns estados com captcha vão cair no fallback de XML, como em qualquer host.

---

## 3. Opção B — Docker em VPS

Serve para Hostinger, DigitalOcean, Hetzner, Contabo, Oracle Cloud etc.

### Requisitos

- Ubuntu 22.04+ (ou outra distro com Docker)
- Docker Engine + plugin Compose
- 1 GB de RAM é suficiente
- Porta 80/443 livres se for usar domínio

Instalação do Docker (script oficial):

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# saia e entre de novo no SSH para o grupo valer
```

### Subir o app

```bash
git clone https://github.com/RafaTavres/Integrativa26.git
cd Integrativa26

cp .env.example .env
nano .env          # preencha SUPABASE_URL e SUPABASE_ANON_KEY
chmod 600 .env

docker compose up -d --build
```

Verificação:

```bash
docker compose ps
curl http://127.0.0.1:3000/api/health
docker compose logs -f web
```

Para trocar a porta publicada:

```bash
echo "APP_PORT=8080" >> .env
docker compose up -d
```

Para deixar a porta acessível **somente** pelo proxy reverso:

```bash
echo "APP_BIND=127.0.0.1" >> .env
docker compose up -d
```

### Domínio e DNS

No painel do seu provedor de domínio, crie um registro **A**:

```text
estokar.seudominio.com  →  IP_DO_VPS
```

Aguarde a propagação. O mesmo endereço deve ser usado no Caddy e na **Site URL** do Supabase.

### HTTPS com Caddy (recomendado)

Com um domínio apontando para o IP do servidor, o Caddy emite e renova o certificado sozinho.

```bash
sudo apt install -y caddy
sudo nano /etc/caddy/Caddyfile
```

Conteúdo:

```caddyfile
estokar.seudominio.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

Se o app estiver em outra porta, ajuste o `reverse_proxy` (ex.: `127.0.0.1:8080`).

Firewall (UFW):

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

Não abra a porta 3000 para a internet quando houver proxy reverso.

### E-mail automático no VPS

Preencha no `.env` (servidor):

```bash
EMAIL_INGESTION_SECRET=um-segredo-forte
EMAIL_IMAP_HOST=imap.seuprovedor.com
EMAIL_IMAP_PORT=993
EMAIL_IMAP_SECURE=true
EMAIL_IMAP_USER=notas@seudominio.com
EMAIL_IMAP_PASSWORD=sua-senha-de-app
EMAIL_IMAP_MAILBOX=INBOX
EMAIL_IMAP_BUSINESS_ID=id-do-negocio
SUPABASE_SERVICE_ROLE_KEY=chave-secreta-do-supabase
```

O `EMAIL_IMAP_BUSINESS_ID` é o `id` do seu negócio na tabela `businesses`. A `SUPABASE_SERVICE_ROLE_KEY` fica só no servidor e é usada apenas pelo worker para gravar em `ingestion_events`.

Crie um script de verificação:

```bash
cat > ~/estokar-email.sh <<'EOF'
#!/usr/bin/env bash
set -a
source /home/SEU_USUARIO/Integrativa26/.env
set +a
curl -fsS -X POST https://estokar.seudominio.com/api/inbound/imap \
  -H "Authorization: Bearer $EMAIL_INGESTION_SECRET" >/dev/null
EOF
chmod +x ~/estokar-email.sh
```

Agende no cron a cada 10 minutos:

```bash
crontab -e
```

```cron
*/10 * * * * /home/SEU_USUARIO/estokar-email.sh
```

Os XMLs aparecem em **Integrações → E-mails de fornecedor** e são importados com um clique.

### Atualizar

```bash
cd Integrativa26
git pull

# guarda a imagem atual para rollback
docker tag estokar:latest estokar:backup

# se o schema mudou (novas tabelas/colunas), rode de novo no SQL Editor:
# supabase/schema.sql

docker compose up -d --build
curl http://127.0.0.1:3000/api/health
```

Rollback:

```bash
docker tag estokar:backup estokar:latest
docker compose up -d --force-recreate web
```

### Túnel temporário (só para demonstração)

O `compose.yaml` traz um perfil `public` com Cloudflare Quick Tunnel. É ótimo para mostrar o app sem domínio, mas **a URL muda a cada reinício** e não serve para produção:

```bash
docker compose --profile public up -d
docker compose logs tunnel | grep trycloudflare
```

---

## 4. Opção C — Render / Railway / Fly.io

Todas aceitam o `Dockerfile` do repositório.

### Render

1. **New → Web Service → Build from a Git repository**.
2. Runtime: **Docker**.
3. Environment variables: `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
4. O Render injeta `PORT` automaticamente; o servidor standalone do Next respeita essa variável.
5. Health check path: `/api/health`.

### Railway

1. **New Project → Deploy from GitHub repo**.
2. Variáveis: `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
3. Gere o domínio em **Settings → Networking → Generate Domain**.

### Fly.io

```bash
fly launch --dockerfile Dockerfile
fly secrets set SUPABASE_URL="https://SEU-PROJETO.supabase.co" \
  SUPABASE_ANON_KEY="sb_publishable_..."
fly deploy
```

No `fly.toml`, mantenha `internal_port = 3000`.

---

## 5. Variáveis de ambiente

| Nome | Obrigatória | Onde aparece | Observação |
| --- | --- | --- | --- |
| `SUPABASE_URL` | sim | servidor | Apenas a origem, sem `/rest/v1`. |
| `SUPABASE_ANON_KEY` | sim | navegador (via `/api/config`) | Publishable/anon. Protegida pelo RLS. |
| `APP_PORT` | não | Compose | Porta publicada no host (padrão `3000`). |
| `APP_BIND` | não | Compose | Interface de bind (padrão `0.0.0.0`; use `127.0.0.1` com proxy). |
| `DOMAIN` | não | Caddy | Domínio público para HTTPS automático. |
| `CLOUDFLARE_TUNNEL_TOKEN` | não | Compose | Só para túnel nomeado permanente. |
| `EMAIL_INGESTION_SECRET` | não | servidor | Segredo do webhook e do worker IMAP. Sem ele, os endpoints de e-mail respondem `503`. |
| `EMAIL_IMAP_HOST` | não | servidor | Host IMAP da caixa de entrada. |
| `EMAIL_IMAP_PORT` | não | servidor | Padrão `993`. |
| `EMAIL_IMAP_SECURE` | não | servidor | Padrão `true`. |
| `EMAIL_IMAP_USER` | não | servidor | Usuário da caixa. |
| `EMAIL_IMAP_PASSWORD` | não | servidor | Senha de app, nunca a senha principal. |
| `EMAIL_IMAP_MAILBOX` | não | servidor | Padrão `INBOX`. |
| `EMAIL_IMAP_BUSINESS_ID` | não | servidor | `id` do negócio em `businesses`, para gravar os XMLs pendentes. |
| `SUPABASE_SERVICE_ROLE_KEY` | não | servidor | Só para o worker IMAP gravar em `ingestion_events`. Nunca no navegador. |

Os nomes antigos `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` ainda são aceitos como fallback, mas não são necessários: a configuração é entregue por `/api/config` e não entra no bundle.

A preparação do WhatsApp feita em `/integracoes` **não usa variável de ambiente** e não sai do navegador. Quando o conector real for implementado, as credenciais do provedor devem ficar só no servidor (webhook/worker), nunca em variável com prefixo `NEXT_PUBLIC_`.

**Nunca versione** `.env`, `.env.local` ou qualquer chave secreta. O `.gitignore` e o `.dockerignore` já bloqueiam esses arquivos.

---

## 6. Checklist antes de divulgar

- [ ] `supabase/schema.sql` aplicado no projeto de produção (inclui fornecedores, compras, contas e ingestão)
- [ ] **Anonymous sign-ins** ativado
- [ ] `SUPABASE_URL` e `SUPABASE_ANON_KEY` configuradas no host
- [ ] `/api/health` responde `"supabase":"configured"`
- [ ] `/api/integrations` responde com o contrato (versão 1)
- [ ] `/integracoes` abre com o WhatsApp em **não conectado** e o aviso de preparação local
- [ ] Domínio apontando para o servidor (registro A) e HTTPS funcionando (Vercel/Caddy)
- [ ] **Site URL** e **Redirect URLs** do Supabase atualizadas com o domínio final
- [ ] Se usar e-mail automático: `EMAIL_*`, `EMAIL_IMAP_BUSINESS_ID` e `SUPABASE_SERVICE_ROLE_KEY` configurados, e cron do `/api/inbound/imap` agendado
- [ ] Porta do app não exposta publicamente no VPS
- [ ] Quick Tunnel desligado em produção (use domínio + Caddy ou túnel nomeado)
- [ ] Backup do banco configurado (próxima seção)
- [ ] Nenhuma chave `service_role` no repositório, no bundle ou no painel do host; a exceção é o worker de e-mail no servidor

---

## 7. Dados, backup e limitações

### Sessão anônima

Cada navegador cria uma sessão anônima própria (`estokar:auth` no `localStorage`) e enxerga apenas o negócio dela. A sessão criada com o nome antigo (`meu-caixa:auth`) é migrada automaticamente. Consequências:

- Limpar os dados do navegador **perde o acesso** ao caixa (os dados continuam no banco, mas sem usuário para acessá-los). Use **Sua loja → Baixar meus dados** antes de limpar.
- Não há sincronização entre celular e computador.
- Para uso real, o próximo passo é permitir upgrade da conta anônima para e-mail/telefone.
- Se a nuvem cair depois de já ter sido usada, o app abre o último retrato local em **modo somente leitura**; novos registros ficam bloqueados para não serem perdidos.

### Loja de demonstração do WhatsApp

A loja `LOJA_WHATSAPP_ID` é compartilhada e **somente leitura**. A RPC `entrar_loja_whatsapp` cria um vínculo `staff`; as policies de escrita aceitam apenas `owner/manager`. O app também esconde as ações de escrita nessa loja. As tabelas `n8n_*` e a RPC estão versionadas em `supabase/schema.sql` e em `supabase/migrations/20261103_hardening.sql`.

### Preparação do WhatsApp

O número e as preferências salvos em `/integracoes` ficam só no `localStorage` do navegador, na chave `estokar:whatsapp:v1`. Eles não entram no backup do Supabase, não sincronizam entre aparelhos e não conectam o WhatsApp. **Restaurar exemplo** não apaga essa preparação; para removê-la, limpe a chave ou os dados do navegador.

### Áudio

A gravação usa `MediaRecorder` e a transcrição usa a Web Speech API do navegador. Por isso o app precisa estar em **HTTPS** (ou `localhost`) para o microfone funcionar. Chrome/Edge transcrevem em português; Firefox pode gravar, mas não transcrever. O áudio fica só na memória da página e não é enviado nem armazenado no servidor.

### Dados de exemplo

O primeiro acesso cria produtos e lançamentos de exemplo do ramo escolhido uma única vez (`demo_seeded`). Isso é intencional para a demonstração. Itens apagados de propósito não voltam no próximo acesso. Para iniciar vazio, remova o seed em `src/lib/supabase/workspace.ts` (`seedWorkspace`) e em `src/lib/seed.ts` (`createSeedState`), ou apague os lançamentos pelo app antes de apresentar.

### Backup

No painel do Supabase: **Database → Backups**. O plano gratuito tem backups automáticos limitados; para dados reais, configure também um dump agendado:

```bash
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges -f backup-$(date +%F).sql
```

`SUPABASE_DB_URL` é a **connection string** do banco (Project Settings → Database), com a senha do banco — essa variável é só para backup, nunca para o app.

### Projetos gratuitos do Supabase pausam por inatividade

Se o projeto ficar dias sem uso, ele pode ser pausado. Antes de uma apresentação, abra o app ou o painel do Supabase alguns minutos antes.

---

## 8. Problemas comuns

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| Banner “Salvando só neste navegador” | Variáveis ausentes ou inválidas no host | Confira `/api/config` e `/api/health`; reinicie o serviço. |
| Mensagem sobre `service_role` | Chave secreta configurada | Troque pela publishable/anon. |
| `new row violates row-level security policy` | Sessão anônima perdida ou negócio de outro usuário | Limpe o `localStorage` do site e recarregue. |
| Container `unhealthy` | App não subiu ou porta errada | `docker compose logs web`; teste `curl 127.0.0.1:3000/api/health` dentro do host. |
| 502 no proxy | App parado ou porta divergente | `docker compose ps` e ajuste o `reverse_proxy`. |
| Login anônimo falha | Recurso desativado no Supabase | Ative **Anonymous sign-ins**. |
| Build da Vercel falha por memória | Dependências pesadas | Garanta Node 22 e cache de npm; o build local é pequeno (~4 s). |

---

## 9. Comandos úteis

```bash
docker compose ps                     # status e health
docker compose logs -f web            # logs do app
docker compose up -d --build          # build + subir
docker compose up -d --force-recreate # recriar sem rebuild (novas envs)
docker compose down                   # parar
docker compose config                 # validar o compose
```

Para checar a configuração sem abrir o app:

```bash
curl -s https://SEU-DOMINIO/api/health
curl -s https://SEU-DOMINIO/api/config | head -c 200
```
