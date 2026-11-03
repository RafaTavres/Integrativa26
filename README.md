# Estokar

> Gestor Inteligente de Pequenos Negócios — gestão sem planilha, sem termo difícil e sem fricção.

MVP de um sistema web responsivo para MEIs e autônomos. A tela principal responde três perguntas com palavras do dia a dia: **quanto entrou**, **quanto saiu** e **quanto sobrou**. O registro de uma venda leva uma tela só, com produto, valor e pagamento, e já baixa o estoque — exceto para serviços, que não controlam quantidade.

Além do caixa, o app acompanha **fornecedores**, **compras** (com custo por fornecedor), **contas a pagar**, **retiradas** e **análises** de preço, previsão de pagamento e dinheiro parado no estoque. A compra pode ser registrada **pela foto da nota**, direto no fornecedor. O histórico pode ser trazido de uma vez por **CSV, TSV, XLSX ou XML de NF-e/NFC-e**. Há também uma **loja de demonstração conectada ao WhatsApp via n8n**, que mostra vendas, compras e ofertas lidas do Supabase; a tela de **integrações** continua deixando o número da sua loja preparado — sem fingir uma conexão que ainda não existe.

A demo tem três ramos prontos (**confeitaria**, **barbearia** e **loja de roupas**) e troca a identidade, os produtos e os exemplos junto com o ramo. O menu da loja também abre uma **loja de roupas de demonstração, somente leitura**, com os dados que o n8n gravou no Supabase.

Demo: [`http://localhost:3000`](http://localhost:3000) após rodar o projeto.

Deploy: guia completo em [`DEPLOY.md`](DEPLOY.md) (Vercel, Docker/VPS, Render e Railway).

---

## 1. Stack e por que ela foi escolhida

| Camada | Escolha | Motivo |
| --- | --- | --- |
| Framework | **Next.js 16.4.3** (App Router) | Rotas simples, Server Components quando fizer sentido, deploy fácil na Vercel e caminho natural para PWA. |
| UI | **React 19.3.1 + TypeScript** | Componentes tipados, estado previsível e segurança para evoluir o domínio financeiro. |
| Estilo | **Tailwind CSS 4.3.3** | Tokens de design centralizados, layout responsivo rápido e CSS pequeno em produção. |
| Ícones | **lucide-react** | Ícones leves, consistentes e com bom traço para botões grandes. |
| Fontes | **Figtree Variable + Fraunces Variable** (local via Fontsource) | Figtree dá clareza no corpo e nos números; Fraunces traz o aconchego artesanal da marca. Sem dependência de CDN. |
| Persistência | **Supabase Postgres** com **login anônimo** | Cada navegador ganha uma sessão própria (sem senha) e os dados ficam no banco, com RLS por negócio. |
| Fallback | **cache local somente leitura** (`estokar:cloud:v1`) + **localStorage** (`estokar:demo:v3`) | Sem Supabase configurado, o app funciona localmente. Se a nuvem cair depois de já ter sido usada, abre o último retrato salvo em modo somente leitura — sem fingir que os registros serão sincronizados. |
| Backend | **Next.js Route Handlers** (`/api/config`, `/api/health`, `/api/integrations`) | Configuração em runtime, health check e contrato público para os conectores de entrada. |
| Planilhas | **Parser próprio + `fflate`** | CSV/TSV são lidos no navegador; XLSX é descompactado e interpretado sem planilha externa pesada. |
| Leitura de foto | **Tesseract.js + WebWorker** | OCR em português roda no próprio aparelho; a imagem não sai do navegador. Worker, núcleo WebAssembly e idioma são servidos pelo app. |
| QR Code NFC-e | **jsQR + consulta no servidor** | O QR é lido no navegador; só a URL oficial é consultada, restrita a portais `.gov.br`. |
| Áudio | **MediaRecorder + Web Speech API** | Gravação real e transcrição pt-BR quando o navegador oferece; a pessoa revisa antes de salvar. |
| Integrações | **n8n + Supabase** (WhatsApp) / `ingestion_events` (e-mail/QR) | A loja de demonstração lê o que o n8n grava; os demais canais usam o contrato de entrada, sem fingir conexão. |

### Por que login anônimo?

O público do app não quer criar conta para registrar uma venda. O login anônimo do Supabase dá um `auth.users` real (com RLS e `memberships`) sem pedir e-mail nem senha, e o mesmo código aceita e-mail/telefone no futuro. A sessão fica em `estokar:auth` no navegador — por isso, hoje, ela não sincroniza entre aparelhos. A sessão criada antes da troca de nome é preservada. Para não depender só do navegador, **Sua loja → Baixar meus dados** gera um JSON com o negócio, itens, lançamentos, compras e contas.

As credenciais usadas no navegador são apenas a URL do projeto e a chave **publishable/anon**. A chave `service_role`/`sb_secret_` é rejeitada em `src/lib/supabase/config.ts`, porque ela ignora o RLS.

---

## 2. Como rodar

Requisitos: Node.js 20.19+ (recomendado 22, igual ao Docker e ao CI) e npm.

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

Outros comandos:

```bash
npm run build   # build de produção (Turbopack)
npm start       # sobe o build
```

### Supabase

1. Copie `.env.example` para `.env.local` e preencha:

```bash
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_ANON_KEY=SUA-CHAVE-PUBLICA
```

2. Rode [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor do projeto.
3. Ative **Authentication → Sign In / Providers → Anonymous sign-ins**.
4. Suba o app. O primeiro acesso cria a sessão anônima, o negócio e os exemplos do ramo.

Sem essas variáveis o app abre em modo local, com o aviso “Salvo neste navegador”. As variáveis não levam o prefixo `NEXT_PUBLIC_`: o servidor as entrega em `/api/config` a cada requisição e a chave não entra no bundle.

### Leitura de foto (OCR)

A foto é lida no navegador com **Tesseract.js**. `npm run dev` e `npm run build` rodam `scripts/prepare-ocr.mjs`, que copia o worker e o núcleo WebAssembly de `node_modules/tesseract.js*` para `public/tesseract`. O idioma português (`public/tesseract/por.traineddata.gz`) é versionado junto do projeto.

- A primeira leitura baixa cerca de 5 MB (worker, um núcleo WebAssembly e o idioma); o navegador cacheia e as próximas são rápidas.
- Nenhuma imagem sai do aparelho. Não há chamada a serviço de OCR externo.
- O parser entende quantidades decimais (`4,28 KG`), o formato de tabela da NFC-e e usa o total com o preço unitário para corrigir uma vírgula perdida pelo OCR.
- Em produção, o `npm ci` precisa rodar antes do `npm run build` para que os arquivos do Tesseract existam. O Dockerfile e a Vercel já fazem isso.

### QR Code da NFC-e

Quando a foto tem o QR Code da NFC-e, o app lê o código com **jsQR** antes de mostrar a conferência. A chave de acesso e a URL do portal são extraídas do QR; o servidor consulta a página oficial da SEFAZ e tenta ler a tabela de itens. A imagem continua sem sair do aparelho: o navegador envia só a URL do QR para o servidor.

- Só URLs de portais `.gov.br` são aceitas. Isso evita usar o endpoint como proxy para outros endereços. A consulta valida cada redirecionamento antes de seguir.
- Se a SEFAZ não devolver os itens (captcha, layout diferente ou nota não encontrada), o app mantém a leitura da foto, avisa e oferece **Abrir nota na SEFAZ**.
- Quando o portal pede captcha, dá para baixar o XML da nota e enviar no próprio aviso (**Já baixei o XML**). O app confere a chave de acesso do XML com a chave do QR e carrega os itens oficiais na conferência.
- A consulta depende do portal de cada estado. Alguns exigem captcha ou bloqueiam acesso automático; nesses casos o fluxo QR + XML manual continua funcionando.

### WhatsApp via n8n

A loja de demonstração é separada e somente leitura. O **n8n** recebe as mensagens do grupo e grava em `n8n_whatsapp_transactions` (vendas), `n8n_whatsapp_purchases` (compras) e `n8n_providers_group` (ofertas de fornecedores). O app só **lê** essas tabelas com a sessão anônima do usuário; não envia mensagens e não aceita escrita nessa loja.

Para abrir a loja, a função `entrar_loja_whatsapp` no Supabase garante o vínculo da sessão com o negócio fixo `LOJA_WHATSAPP_ID` em `src/lib/supabase/workspace.ts`. Esse vínculo usa o papel **staff** e as policies de escrita só aceitam **owner/manager**; por isso a demonstração é somente leitura. A conexão do número da **sua** loja continua fora do escopo: o que existe é a leitura do que o n8n já gravou.

### E-mail de fornecedor (XML)

O caminho manual já funciona: em **Importar**, envie o XML da NF-e/NFC-e. O parser lê emitente, data, itens, quantidade, valor unitário, total e forma de pagamento, e cria as compras na prévia. Ao importar, os produtos existentes têm o estoque e o custo médio atualizados; produtos novos são criados.

Para o modo automático, há dois caminhos:

**Webhook do provedor** — Postmark, Resend, Cloudflare Email Worker ou n8n chamam `POST /api/inbound/email` com o segredo `EMAIL_INGESTION_SECRET` e o anexo em base64:

```json
{
  "secret": "defina-no-servidor",
  "businessId": "id-do-negocio",
  "messageId": "id-do-email",
  "from": "fornecedor@exemplo.com",
  "subject": "NF-e 123",
  "attachments": [
    { "filename": "nota.xml", "contentType": "application/xml", "contentBase64": "..." }
  ]
}
```

**IMAP** — para Docker/VPS, o app consulta uma caixa existente e deixa os XMLs pendentes em `/integracoes` para importar com um clique. Variáveis:

```bash
EMAIL_IMAP_HOST=imap.exemplo.com
EMAIL_IMAP_PORT=993
EMAIL_IMAP_SECURE=true
EMAIL_IMAP_USER=notas@exemplo.com
EMAIL_IMAP_PASSWORD=senha-de-app
EMAIL_IMAP_MAILBOX=INBOX
EMAIL_IMAP_BUSINESS_ID=id-do-negocio
SUPABASE_SERVICE_ROLE_KEY=chave-secreta-do-supabase
EMAIL_INGESTION_SECRET=segredo-do-webhook
```

O worker é acionado por um cron/n8n:

```bash
curl -X POST https://seu-dominio/api/inbound/imap \
  -H "Authorization: Bearer $EMAIL_INGESTION_SECRET"
```

O endpoint lê os e-mails não vistos, extrai o XML, grava um `ingestion_event` com status `pending_review` e marca o e-mail como lido. A tela **Integrações** lista os pendentes e importa tudo para o estoque e o histórico de compras. O modo IMAP precisa de um servidor de longa duração; em Vercel/serverless, prefira o webhook do provedor.

Sem `EMAIL_INGESTION_SECRET`, os endpoints respondem `503` e nada é processado.

### Docker

A imagem é multi-stage, roda como usuário sem privilégios e usa a saída
`standalone` do Next.js (somente o necessário para produção). O health check
usa `GET /api/health`.

```bash
docker compose up -d --build     # http://localhost:3000
docker compose logs -f web       # acompanhar logs
docker compose down              # parar
```

No servidor, as credenciais entram por um `.env` (o Compose também aceita
`.env.local` no desenvolvimento):

```bash
cp .env.example .env
chmod 600 .env
docker compose up -d --build
```

Variáveis opcionais do Compose:

```bash
APP_PORT=8080        # porta publicada no host (padrão 3000)
APP_BIND=127.0.0.1   # só aceita conexão local (use com proxy reverso)
```

Para testar em uma URL pública temporária, o Compose já traz um túnel do
Cloudflare no profile `public`:

```bash
docker compose --profile public up -d
docker compose logs -f tunnel    # mostra a URL *.trycloudflare.com
```

A URL do quick tunnel é temporária e muda a cada reinício. Para uma rota
permanente, crie um túnel nomeado no Cloudflare e troque o `command` do serviço
`tunnel` por `tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}`.
Os detalhes de VPS, HTTPS, firewall e rollback estão em [`DEPLOY.md`](DEPLOY.md).

---

## 3. O que já funciona

### Fluxos principais

- **Escolha do ramo** — no menu da loja, o seletor **Confeitaria / Barbearia / Loja de roupas** troca nome, produtos, exemplos e vocabulário. A troca pede confirmação porque recomeça os dados do ramo.
- **Registrar** — o botão principal e o botão fixo no rodapé abrem um hub com **Vender**, **Gasto**, **Compra**, **Retirada**, **Foto da nota**, **Áudio** e **Estoque**, além dos atalhos para **Importar planilha ou XML** e **WhatsApp e integrações**. É a porta única de entrada, para o usuário não precisar decorar onde cada coisa mora.
- **Venda rápida em uma tela** — “O que vendeu?”, “Quanto entrou?” e “Como pagou?”. O seletor de produto recolhe depois da escolha para os três campos caberem no celular. Itens com estoque baixam automaticamente; serviços não movimentam estoque.
- **Gasto rápido** — descrição, valor e forma de pagamento (opcional).
- **Fornecedores** — cadastro com telefone, e-mail e observações. A tela de cada fornecedor reúne o que falta pagar, o histórico de compras, os itens comprados e o preço praticado.
- **Compra de mercadoria** — escolhe fornecedor, item, quantidade e custo unitário. Se for item novo, ele entra no estoque; se existir, o custo é recalculado pela média ponderada. A compra pode ser paga na hora (sai do caixa) ou ficar para pagar (vira conta a pagar).
- **Compra pela nota (fornecedor)** — no detalhe do fornecedor, o botão **Registrar compra pela nota** abre a compra já vinculada a ele, com foto opcional do cupom para guardar o comprovante. Ao cadastrar um fornecedor novo, **Salvar e registrar nota** faz o mesmo em um passo. Com foto, o lançamento fica com `source_type = image_recognition`; sem foto, continua `manual`. A imagem não é enviada ao servidor. Para **ler os dados do cupom automaticamente**, use **Foto da nota** no hub **Registrar**.
- **Integrações** — a rota `/integracoes` mostra o WhatsApp como **não conectado**, com todas as letras, e permite salvar o número e as regras de entrada neste navegador (`estokar:whatsapp:v1`). Também lista o que já funciona (**planilha, foto, áudio, XML e QR Code**) e o que está em preparação (grupos automáticos de WhatsApp e e-mail/XML por caixa de entrada). Nenhuma conexão é simulada.
- **Loja do WhatsApp (n8n)** — no menu da loja, o atalho **Loja de roupas (WhatsApp)** abre `/whatsapp` com o que o n8n gravou no Supabase: vendas e compras do grupo da loja e ofertas de fornecedores agrupadas pelo melhor preço. A loja é uma **demonstração somente leitura**, compartilhada entre os testadores; o app só lê esses dados e a conexão do WhatsApp é feita pelo n8n. Para voltar à sua loja, use **Voltar para a minha loja**.
- **Contas a pagar** — criadas por compra a prazo ou manualmente. O caixa **só muda no dia do pagamento**. A previsão agrupa vencidas, próximos 7 dias e “mais para frente”.
- **Retirada** — dinheiro que você tira do caixa para uso pessoal. Entra em “Saiu” e no extrato com o rótulo **retirada**, mas não é despesa do negócio nem conta a pagar.
- **Importar planilha ou XML** — CSV, TSV, XLSX ou o XML de uma NF-e/NFC-e com vendas, gastos, compras, contas e retiradas. O XML vira uma compra por item, com fornecedor, data, quantidade e pagamento; o histórico alimenta os preços por fornecedor. Mostra prévia, valida linha por linha e não mexe no estoque atual.
- **Análises** — previsão de pagamento, comparação de preço do mesmo item entre fornecedores, itens encalhados com o valor parado e resumo de retiradas.
- **Foto da nota** — tira ou escolhe a foto do cupom/comprovante; o app lê o texto no próprio aparelho com **Tesseract.js em português**, separa fornecedor, itens, quantidade, custo, total, data, CNPJ e forma de pagamento, e **só então** abre a tela de conferência. Se a foto tiver o **QR Code da NFC-e**, o app lê o código e tenta carregar os itens oficiais direto do portal da SEFAZ; se o portal não responder, continua com a leitura da foto. Cada item é comparado com o estoque: os que já existem aparecem como **No estoque**, com o nome cadastrado, e os demais como **Produto novo**. Você corrige o que precisar, escolhe entre **compra** (entra no estoque e no custo) e **venda** (baixa estoque e entra no caixa) e confirma. A imagem não é enviada nem guardada no servidor; o lançamento fica com `source_type = image_recognition`. Se a leitura não render, **Prefiro digitar sem foto** abre o mesmo formulário vazio e salva como `manual`.
- **Áudio** — grava de verdade pelo microfone do navegador (`MediaRecorder`), transcreve em português com a Web Speech API quando disponível e permite corrigir o texto. O rascunho nasce como `pending_review` com `source_type = audio_transcription`; o áudio fica só na memória da página e não é enviado ao servidor.
- **Entrada rápida de estoque** — produto, quantidade e custo. Continua disponível para repor um item sem passar pela compra completa.
- **Radar de estoque** — produtos no mínimo ou zerados aparecem no topo do extrato e na página de estoque/produtos, com ação direta para repor.
- **Conferência de IA** — card de rascunho com os dados pré-preenchidos. Nada entra no caixa até a confirmação. É possível confirmar ou descartar.
- **Extrato enxuto** — agrupado por dia, com venda e gasto no mesmo lugar. Mostra a origem quando o lançamento veio de áudio, foto ou WhatsApp.
- **Detalhe do lançamento** — valor, horário, pagamento, origem e exclusão com reversão de estoque.
- **Edição de item** — nome, preço e, apenas para itens com estoque, o aviso de reposição.
- **Demo controlada** — no menu “Sua loja” é possível simular um áudio recebido, trocar de ramo (com confirmação), restaurar os dados de exemplo e abrir a loja de demonstração do WhatsApp.

### Dados de exemplo

Cada ramo tem um cenário próprio:

| Ramo | Negócio | Caixa | Entrou hoje | Saiu hoje | Áudio pendente |
| --- | --- | --- | --- | --- | --- |
| Confeitaria | Bia Confeitaria | R$ 82,00 | R$ 148,00 | R$ 38,00 | R$ 50,00 |
| Barbearia | Barbearia do Léo | R$ 117,00 | R$ 165,00 | R$ 25,00 | R$ 60,00 |
| Loja de roupas | Loja da Cida | R$ 483,00 | R$ 360,00 | R$ 32,00 | R$ 120,00 |

Cada cenário também traz fornecedores com histórico de compras, contas em aberto (uma atrasada), retiradas e pelo menos um item sem venda há mais de 30 dias. Na confeitaria, a **Torta de limão** é o exemplo de dinheiro parado: 3 tortas e R$ 66,00 sem giro.

Na barbearia, **Corte**, **Barba** e **Corte + barba** são serviços: aparecem na venda e no catálogo, mas não baixam estoque. **Pomada** e **Shampoo** são produtos controlados.

Para voltar ao estado inicial: menu **Sua loja** → **Restaurar exemplo**. No modo nuvem isso recria o cenário do ramo no Supabase; no modo local, limpa o `localStorage`. A preparação do WhatsApp é independente e continua salva; para apagá-la também, remova `estokar:whatsapp:v1`.

```js
localStorage.removeItem("estokar:demo:v3");
localStorage.removeItem("estokar:whatsapp:v1");
location.reload();
```

Quem tinha a demo antiga (`v2`) não perde nada: os dados são migrados para a `v3` no primeiro carregamento, com fornecedores, compras e contas vazios.

---

## 4. Estrutura do projeto

```text
Dockerfile                  # imagem multi-stage de produção (standalone)
compose.yaml                # app + túnel opcional do Cloudflare
DEPLOY.md                   # guia de deploy (Vercel, VPS, Render, Railway)
.env.example                # modelo das credenciais do Supabase
.github/workflows/ci.yml    # typecheck, build e imagem Docker no CI
scripts/prepare-ocr.mjs     # copia worker e núcleo do Tesseract para public/tesseract
public/                     # arquivos estáticos
public/tesseract/           # idioma do OCR (worker/núcleo gerados no predev/prebuild)
src/
  app/
    layout.tsx              # fontes, providers, metadata e viewport
    page.tsx                # rota inicial (home)
    estoque/page.tsx        # rota de estoque
    contas/page.tsx         # contas a pagar
    fornecedores/page.tsx   # fornecedores e histórico de compras
    analises/page.tsx       # previsão, preços, encalhe e retiradas
    importar/page.tsx       # importação de CSV/TSV/XLSX
    integracoes/page.tsx    # preparação do WhatsApp e estado dos canais
    api/config/route.ts     # entrega URL + chave pública em runtime
    api/health/route.ts     # health check para Docker e monitoramento
    api/integrations/route.ts # contrato de entrada para conectores futuros
    globals.css             # tokens, componentes utilitários e sheets
  components/
    app-shell.tsx           # moldura responsiva + splash de abertura
    navigation.tsx          # topo no desktop e barra inferior no celular
    logo.tsx
    home-view.tsx           # composição da tela principal
    balance-card.tsx        # Entrou / Saiu / Sobrou
    payables-card.tsx       # resumo de contas a pagar na home
    insights-card.tsx       # dinheiro parado e economia na home
    quick-actions.tsx       # botão Registrar da home
    pending-review-card.tsx # card de conferência da IA
    activity-feed.tsx       # extrato + alertas de estoque
    stock-view.tsx          # página de estoque
    suppliers-view.tsx      # lista e busca de fornecedores
    supplier-sheet.tsx      # cadastro/edição de fornecedor
    supplier-detail-sheet.tsx # compras, contas e preços do fornecedor
    purchase-sheet.tsx      # compra com estoque, custo, nota opcional e conta a pagar
    bills-view.tsx          # previsão e lista de contas
    bill-sheet.tsx          # conta manual
    bill-pay-sheet.tsx      # pagamento de conta
    withdrawal-sheet.tsx    # retirada do caixa
    analytics-view.tsx      # previsão, preços, encalhe e retiradas
    import-view.tsx         # upload, prévia e importação
    integrations-view.tsx   # canais de entrada e status honesto do WhatsApp
    whatsapp-connect-sheet.tsx # número e regras da futura conexão
    action-provider.tsx     # estado global dos sheets
    sheet.tsx               # bottom sheet mobile / modal central no desktop
    register-sheet.tsx      # hub: venda, gasto, compra, retirada, foto, áudio
    audio-sheet.tsx         # gravação real, transcrição, revisão e rascunho
    receipt-sheet.tsx       # foto → OCR local → conferência → compra ou venda
    sale-sheet.tsx          # venda + confirmação de pendente + sucesso
    expense-sheet.tsx
    stock-entry-sheet.tsx
    transaction-detail-sheet.tsx
    product-edit-sheet.tsx
    more-sheet.tsx          # ramo, conexão com a nuvem, restaurar exemplo
    money-input.tsx
    quantity-stepper.tsx
    payment-picker.tsx
    toast.tsx
  lib/
    types.ts                # domínio e enums (inclui SegmentId e trackStock)
    segments.ts             # perfis de ramo, produtos e exemplos
    seed.ts                 # monta a demo a partir do ramo escolhido
    store.tsx               # estado, ações, totais e modo local/nuvem
    analytics.ts            # previsão, preços por fornecedor, encalhe, retiradas
    import.ts               # parser CSV/TSV/XLSX, modelo e validação
    ingestion.ts            # contrato e normalização de entradas externas
    integrations.ts         # preferências locais do WhatsApp e exemplos
    audio.ts                # interpreta a transcrição (item, quantidade, valor, pagamento)
    speech.ts               # tipos e detecção da Web Speech API
    ocr.ts                  # preparação da foto, Tesseract local e parser de cupom
    format.ts               # moeda, datas e saudação
    cn.ts
    supabase/
      config.ts             # normaliza URL, rejeita placeholders e service_role
      client.ts             # cliente único + leitura de /api/config
      workspace.ts          # sessão anônima, carga, seed, RPCs e importação
supabase/
  schema.sql                # schema de produção (tabelas, RLS e RPCs)
```

### Onde está o código da tela principal

1. `src/app/page.tsx` renderiza `HomeView`.
2. `src/components/home-view.tsx` monta o grid de duas colunas no desktop e a pilha no celular.
3. `src/components/balance-card.tsx` mostra **Sobrou no caixa**, **Entrou hoje** e **Saiu hoje**.
4. `src/components/quick-actions.tsx` concentra o botão **Registrar** da home; os atalhos ficam dentro do hub.
5. `src/components/register-sheet.tsx` é o hub; cada opção abre uma sheet específica (`sale-sheet.tsx`, `expense-sheet.tsx`, `purchase-sheet.tsx`, `withdrawal-sheet.tsx`, `receipt-sheet.tsx`) ou a gravação real (`audio-sheet.tsx`).
6. `src/components/payables-card.tsx` e `insights-card.tsx` resumem contas e dinheiro parado na home.
7. `src/components/pending-review-card.tsx` aparece só quando há rascunho de IA.
8. `src/components/activity-feed.tsx` junta alertas de estoque, grupos por dia e o botão “Ver mais”.

---

## 5. Design system

### Paleta

| Token | Hex | Uso |
| --- | --- | --- |
| `cream` | `#FAF6F0` | fundo geral |
| `paper` | `#FFFDF9` | cards e sheets |
| `ink` | `#332D2B` | texto e superfícies escuras |
| `terracotta` | `#D97757` | ação primária, marca |
| `sage` | `#6B8E6B` | entradas, venda, positivo |
| `mustard` | `#E89F4C` | alerta de estoque |
| `sand` / `line` | `#F2E9DE` / `#E4D8C9` | apoio e divisórias |

### Princípios

- **Mobile first**, com largura máxima de `1120px` no desktop e navegação inferior no celular.
- **Cantos de no máximo 4px** — visual de bloco, sem “cartão flutuante” genérico.
- **Alvos de toque grandes** — botões e campos com pelo menos `3.25rem` de altura.
- **Linguagem humana** — Entrou, Saiu, Sobrou, “está acabando”, “repor”. Nada de débito, crédito ou lançamento contábil.
- **Números tabulares** para alinhamento de valores.
- **Movimento discreto** — transform e opacidade, respeitando `prefers-reduced-motion`.
- **Acessibilidade** — foco visível, labels reais, `aria` nos diálogos e contraste alto.

Os tokens ficam em `src/app/globals.css` dentro de `@theme`, então também funcionam como utilitários Tailwind (`bg-cream`, `text-ink`, `border-line` etc.).

---

## 6. Modelo de dados

O schema completo está em [`supabase/schema.sql`](supabase/schema.sql). Ele foi escrito para o Supabase, com RLS e funções transacionais.

### Tabelas

| Tabela | Papel |
| --- | --- |
| `businesses` | O negócio (nome, dono, cidade e `segment`). |
| `memberships` | Quem acessa cada negócio e com qual papel (`owner`, `manager`, `staff`). |
| `products` | Catálogo, estoque atual, estoque mínimo, custo, preço, `track_stock` e fornecedor preferido. |
| `suppliers` | Fornecedores do negócio, com telefone, e-mail e observações. |
| `transactions` | Vendas, gastos e retiradas. Dinheiro em centavos. |
| `purchases` | Histórico de compras: fornecedor, item, quantidade, custo unitário e vínculo com conta/transação. |
| `bills` | Contas a pagar, com vencimento, status e vínculo com a despesa no pagamento. |
| `inventory_logs` | Entradas, saídas e ajustes de estoque, ligados ou não a uma transação. |
| `ingestion_events` | Áudios, fotos, planilhas e mensagens recebidas, com payload, idempotência e status do pipeline. |

### Regras importantes

- **Dinheiro é `integer` em centavos.** Nunca `float`.
- **Quantidade é `numeric(12,3)`**, permitindo venda por peso no futuro.
- Toda transação e todo log de estoque têm `source_type` e `status`.
- `segment` classifica o negócio como `confeitaria`, `barbearia` ou `roupas` e orienta rótulos e catálogo no app.
- `products.track_stock = false` identifica serviços: eles vendem normalmente, mas não têm saldo, alerta de mínimo nem log de estoque.
- `source_type`: `manual`, `audio_transcription`, `image_recognition`, `whatsapp_import`, `email_import`, `qr_code`, `spreadsheet_import`.
- `status`: `processed` ou `pending_review`.
- Um lançamento `pending_review` **não entra nos totais** até ser confirmado.
- `transactions.kind` inclui `sale`, `expense` e `withdrawal`. Retirada sai do caixa, mas não é despesa nem conta a pagar.
- Compra paga gera uma despesa na hora; compra a prazo cria uma `bill` e só mexe no caixa quando a conta é paga.
- `purchases` guarda o custo unitário por fornecedor e alimenta a comparação de preços e o custo médio do produto.
- `inventory_logs` guarda o vínculo com a transação para permitir estorno correto.
- Exclusões passam pela RPC `delete_transaction`; o DELETE direto está bloqueado por RLS para não dessincronizar o estoque.
- RLS em todas as tabelas: o usuário só vê negócios dos quais participa.
- `daily_totals` é uma view com `security_invoker = true` para respeitar o RLS e facilitar os totais do dia.

### RPCs transacionais

| Função | O que faz |
| --- | --- |
| `create_business` | Cria o negócio (com o ramo escolhido) e o membership `owner` na mesma transação. |
| `register_sale` | Trava o produto, valida estoque quando há controle, cria a venda e grava a baixa só para itens com `track_stock`. |
| `confirm_pending_sale` | Confirma um rascunho de IA, preserva a origem e baixa o estoque apenas quando o item controla quantidade. |
| `register_purchase` | Cria compra, entrada de estoque, custo médio e — se pago — a despesa correspondente; se a prazo, cria a conta. |
| `pay_bill` | Marca a conta como paga, grava a despesa no caixa e mantém o vínculo para estorno. |
| `delete_transaction` | Exclui o lançamento e reverte o efeito no estoque e nas contas ligadas. |

Essas funções evitam o clássico problema de venda e baixa de estoque gravadas pela metade.

### Diagrama resumido

```text
auth.users
    │
memberships ─── businesses
                    │
        ┌───────────┼──────────────┬────────────┐
        │           │              │            │
    products   transactions    suppliers     bills
        │           │              │            │
        └── inventory_logs ───────┴──── purchases
                    │
             ingestion_events
```

---

## 7. Arquitetura para IA e dados não estruturados

O produto foi desenhado para receber dados bagunçados sem sujar o caixa.

### Pipeline previsto

```text
Áudio / Foto / WhatsApp / E-mail / QR Code / Planilha
        ↓
ingestion_events (received, external_id para idempotência)
        ↓
Whisper / Vision / parser fiscal / leitor de planilha
        ↓
status = processed ──────► transactions, purchases ou bills
        │
        └── baixa confiança ─────► pending_review
                                      ↓
                         card “Confira essa venda”
                                      ↓
                         usuário corrige e confirma
```

O contrato de entrada fica em `GET /api/integrations` e em `src/lib/ingestion.ts`. Ele descreve canais, `source_type`, campos obrigatórios e a regra de idempotência (`external_id` + canal por negócio). Nenhum conector precisa conhecer o banco ou usar chave secreta no navegador.

### Fallback de IA

Quando a IA não consegue identificar todos os campos, o app não inventa dados. Ele mostra:

> **Confira o último áudio — faltou identificar alguns dados.**

O card abre o mesmo formulário de venda, já pré-preenchido com o que a IA entendeu. O usuário confirma ou descarta. O `raw_input` e o `ai_confidence` ficam preservados no registro para auditoria.

### Por que `source_type` e `status` ficam nas duas tabelas?

`transactions` responde “de onde veio esse dinheiro?”. `inventory_logs` responde “de onde veio essa mexida no estoque?”. Uma foto de comprovante pode gerar uma venda e uma saída de estoque; as duas precisam carregar a mesma origem e o mesmo estado de conferência.

### Importação de planilha

A tela **Importar** aceita `.csv`, `.tsv` e `.xlsx`. O cabeçalho é flexível (`data`, `tipo`, `descricao`, `valor`, `quantidade`, `produto`, `fornecedor`, `vencimento`, `pago`, `forma_pagamento`) e há um modelo para baixar. A prévia mostra linhas válidas, linhas recusadas e o motivo.

- Vendas, gastos e retiradas entram como lançamentos processados com `source_type = spreadsheet_import`.
- Compras viram histórico em `purchases`; se `pago = sim`, também geram despesa, senão geram conta a pagar.
- Contas viram `bills`; se já pagas, a despesa é criada junto.
- O estoque **não é alterado** pela importação: ela traz histórico financeiro e preços, não um inventário.
- Fornecedores e produtos existentes são vinculados por nome; fornecedor novo é criado na hora.

### Integrações futuras

- **Áudio**: guardar a gravação no bucket privado `ingestion`, transcrever com Whisper no servidor e extrair produto/quantidade/valor/pagamento com um modelo mais robusto que o Web Speech atual.
- **Foto**: Vision para ler cupom, comanda ou comprovante; `extracted_payload` guarda o JSON bruto.
- **WhatsApp**: webhook recebe a mensagem, cria um `ingestion_event` com `whatsapp_import` e segue o mesmo pipeline. A demo atual já lê os grupos via n8n.
- **E-mail/XML**: o parser, a importação manual, o webhook do provedor e o worker IMAP estão implementados; a tela de integrações lista os XMLs pendentes e importa com um clique. Falta configurar a caixa/credenciais no servidor.
- **QR Code/SEFAZ**: implementado para QR de NFC-e, com consulta server-side ao portal `.gov.br` e fallback para OCR.
- **Fila**: Edge Function ou worker processa, atualiza `ingestion_events` e cria o lançamento apenas quando a confiança passa do limite.
- **Revisão**: tudo abaixo do limite nasce `pending_review`; a interface de conferência já existe no MVP.

---

## 8. O que é demo e o que é produção

### Hoje (MVP)

- **Persistência real no Supabase**, com sessão anônima por navegador e RLS por negócio.
- Fallback local: sem Supabase configurado, o app funciona em `localStorage`; se a nuvem cair depois de já ter sido usada, abre o último retrato salvo em modo somente leitura. A tela avisa qual modo está ativo e não finge sincronização.
- Fornecedores, compras, contas a pagar, retiradas, análises e importação de CSV/TSV/XLSX funcionando nos dois modos.
- Compra pela nota no detalhe do fornecedor, com foto opcional e vínculo com o fornecedor; a origem `image_recognition` é gravada no lançamento.
- Tela `/integracoes` com o WhatsApp em estado **não conectado**, preparação local do número e regras, e a lista real dos demais canais.
- O áudio é gravado e transcrito no navegador, e o rascunho é real; nada é enviado ao servidor e a transcrição depende da Web Speech API (indisponível no Firefox e dependente de rede no Chrome). A foto também fica só no navegador (preview) e o lançamento é salvo com `source_type = image_recognition`.
- Os três ramos usam dados fictícios e trocam o cenário inteiro ao serem selecionados.
- Sem multiusuário: uma sessão anônima = um negócio. Sair do navegador ou limpar os dados perde a sessão; use **Sua loja → Baixar meus dados** antes.

### Deploy

- **Vercel** e **Docker** prontos: a imagem multi-stage gera um servidor standalone, roda sem privilégios e expõe health check em `/api/health`.
- **Configuração em runtime** (`/api/config`): as credenciais entram por variável de ambiente no host, sem rebuild e sem ir para o bundle.
- **CI** no GitHub Actions valida tipos, build e a imagem Docker a cada push.
- Passo a passo, HTTPS, backup e checklist em [`DEPLOY.md`](DEPLOY.md).

### Limitações conscientes

- A sessão anônima é por navegador; não há como recuperar o caixa em outro celular.
- Limpar os dados do navegador apaga o vínculo com o negócio (o registro continua no banco, mas sem acesso).
- O modo privado pode bloquear o `localStorage` e a sessão.
- A foto não é armazenada: o OCR de texto roda no próprio navegador e a imagem não sai do aparelho. O reconhecimento é de texto, não de imagem (não identifica objetos).
- A consulta por QR Code depende do portal da SEFAZ do estado. Alguns portais usam captcha ou bloqueiam acesso automático; nesses casos o app mantém a leitura da foto e oferece o link oficial.
- O WhatsApp ainda não está conectado para a sua loja: a tela de integrações só salva o número e as preferências neste navegador. A loja de demonstração em `/whatsapp` é alimentada pelo n8n e pelas tabelas `n8n_*` do Supabase. O worker IMAP e a fila de e-mails pendentes existem; falta configurar a caixa e as credenciais do servidor.

### Próximos passos para produção

1. Criar o bucket privado `ingestion` e as políticas de Storage para áudios e fotos.
2. Implementar o pipeline de IA em Edge Functions (Whisper/Vision) gravando em `ingestion_events`.
3. Adicionar upgrade de conta anônima para e-mail/telefone, recuperando o mesmo negócio em outros aparelhos.
4. Conectar o WhatsApp da própria loja e o worker de e-mail/XML ao contrato de `ingestion_events`; a importação manual de XML já está pronta.
5. Transformar o app em PWA com fila offline e sincronização.
6. Ampliar a leitura de QR Code/SEFAZ para os estados que usam captcha ou layouts diferentes do DANFE.

---

## 9. Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Ambiente de desenvolvimento. |
| `npm run build` | Build de produção com Turbopack. |
| `npm start` | Serve o build de produção. |
| `npm run typecheck` | Checagem de tipos sem gerar arquivos. |
| `npm run lint` | ESLint com as regras do Next. |
| `npm test` | Testes unitários (Vitest). |

---

Feito com calma, cor e foco em quem vende bolo, corta cabelo ou atende na loja — não em quem decora balanço patrimonial.
