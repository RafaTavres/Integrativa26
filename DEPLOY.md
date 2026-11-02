# Deploy — Meu Caixa

Guia para colocar o app no ar fora da sua máquina. São duas variáveis de ambiente e uma imagem Docker (ou um projeto na Vercel).

O app é **Next.js + Supabase**. Não existe backend próprio além de duas rotas leves:

| Rota | Papel |
| --- | --- |
| `GET /api/config` | Entrega URL e chave pública do Supabase em tempo de execução. |
| `GET /api/health` | Health check (`{"ok":true,"supabase":"configured"}`). |
| `GET /api/integrations` | Contrato público para WhatsApp, e-mail/XML, QR Code e demais conectores. |

Como a configuração é lida a cada requisição, **trocar de projeto Supabase não exige rebuild**.

A tela `/integracoes` é servida pelo próprio app e não tem configuração de servidor nesta versão: ela mostra o WhatsApp como **não conectado** e guarda apenas o número e as preferências no `localStorage` do navegador (`meu-caixa:whatsapp:v1`). Nenhuma credencial de WhatsApp existe hoje no projeto.

---

## 1. Preparar o Supabase (uma vez)

1. Crie um projeto em [supabase.com](https://supabase.com) (região `South America (São Paulo)` reduz a latência).
2. Abra **SQL Editor** e rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql). Ele cria tabelas, enums, RLS, a view `daily_totals` e as RPCs. O script é idempotente: pode ser rodado de novo para aplicar as tabelas de **fornecedores, compras e contas a pagar** em um projeto que já existia.
3. Ative o login anônimo em **Authentication → Sign In / Providers → Anonymous sign-ins**.
4. Em **Authentication → URL Configuration**, defina:
   - **Site URL**: o endereço final do app (ex.: `https://caixa.seudominio.com`).
   - **Redirect URLs**: o mesmo endereço com `/**`.
5. Em **Project Settings → API**, copie:
   - **Project URL** → `SUPABASE_URL`
   - **Publishable key** (ou `anon`) → `SUPABASE_ANON_KEY`

> **Nunca use `service_role`/`sb_secret_` no app.** Essa chave ignora o RLS e dá acesso total ao banco. O código recusa a configuração se detectar uma chave secreta.

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

### HTTPS com Caddy (recomendado)

Com um domínio apontando para o IP do servidor, o Caddy emite e renova o certificado sozinho.

```bash
sudo apt install -y caddy
sudo nano /etc/caddy/Caddyfile
```

Conteúdo:

```caddyfile
caixa.seudominio.com {
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

### Atualizar

```bash
cd Integrativa26
git pull

# guarda a imagem atual para rollback
docker tag meu-caixa:latest meu-caixa:backup

# se o schema mudou (novas tabelas/colunas), rode de novo no SQL Editor:
# supabase/schema.sql

docker compose up -d --build
curl http://127.0.0.1:3000/api/health
```

Rollback:

```bash
docker tag meu-caixa:backup meu-caixa:latest
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
| `CLOUDFLARE_TUNNEL_TOKEN` | não | Compose | Só para túnel nomeado permanente. |

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
- [ ] HTTPS funcionando (Vercel/Caddy)
- [ ] Domínio final cadastrado na **Site URL** do Supabase
- [ ] Porta do app não exposta publicamente no VPS
- [ ] Backup do banco configurado (próxima seção)
- [ ] Nenhuma chave `service_role` no repositório, no bundle ou no painel do host

---

## 7. Dados, backup e limitações

### Sessão anônima

Cada navegador cria uma sessão anônima própria (`meu-caixa:auth` no `localStorage`) e enxerga apenas o negócio dela. Consequências:

- Limpar os dados do navegador **perde o acesso** ao caixa (os dados continuam no banco, mas sem usuário para acessá-los).
- Não há sincronização entre celular e computador.
- Para uso real, o próximo passo é permitir upgrade da conta anônima para e-mail/telefone.

### Preparação do WhatsApp

O número e as preferências salvos em `/integracoes` ficam só no `localStorage` do navegador, na chave `meu-caixa:whatsapp:v1`. Eles não entram no backup do Supabase, não sincronizam entre aparelhos e não conectam o WhatsApp. **Restaurar exemplo** não apaga essa preparação; para removê-la, limpe a chave ou os dados do navegador.

### Dados de exemplo

O primeiro acesso cria produtos e lançamentos de exemplo do ramo escolhido. Isso é intencional para a demonstração. Para iniciar vazio, remova o seed em `src/lib/supabase/workspace.ts` (`seedWorkspace`) e em `src/lib/seed.ts` (`createSeedState`), ou apague os lançamentos pelo app antes de apresentar.

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
