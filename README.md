# Meu Caixa

> Gestor Inteligente de Pequenos Negócios — gestão sem planilha, sem termo difícil e sem fricção.

MVP de um sistema web responsivo para MEIs e autônomos. A tela principal responde três perguntas com palavras do dia a dia: **quanto entrou**, **quanto saiu** e **quanto sobrou**. O registro de uma venda leva uma tela só, com produto, valor e pagamento, e já baixa o estoque — exceto para serviços, que não controlam quantidade.

Além do caixa, o app acompanha **fornecedores**, **compras** (com custo por fornecedor), **contas a pagar**, **retiradas** e **análises** de preço, previsão de pagamento e dinheiro parado no estoque. O histórico pode ser trazido de uma vez por **CSV, TSV ou XLSX**.

A demo tem três ramos prontos (**confeitaria**, **barbearia** e **loja de roupas**) e troca a identidade, os produtos e os exemplos junto com o ramo.

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
| Fallback | **localStorage** (`meu-caixa:demo:v3`) | Se o Supabase não estiver configurado ou a conexão cair, o app continua funcionando neste navegador. A v2 é migrada automaticamente. |
| Backend | **Next.js Route Handlers** (`/api/config`, `/api/health`, `/api/integrations`) | Configuração em runtime, health check e contrato público para os conectores de entrada. |
| Planilhas | **Parser próprio + `fflate`** | CSV/TSV são lidos no navegador; XLSX é descompactado e interpretado sem planilha externa pesada. |
| IA futura | **Whisper + Vision + fila/Edge Functions** | Transcrição de áudio, leitura de comprovantes/fotos e importação de WhatsApp sem acoplar a IA ao front-end. |

### Por que login anônimo?

O público do app não quer criar conta para registrar uma venda. O login anônimo do Supabase dá um `auth.users` real (com RLS e `memberships`) sem pedir e-mail nem senha, e o mesmo código aceita e-mail/telefone no futuro. A sessão fica em `meu-caixa:auth` no navegador — por isso, hoje, ela não sincroniza entre aparelhos.

As credenciais usadas no navegador são apenas a URL do projeto e a chave **publishable/anon**. A chave `service_role`/`sb_secret_` é rejeitada em `src/lib/supabase/config.ts`, porque ela ignora o RLS.

---

## 2. Como rodar

Requisitos: Node.js 20.9+ (recomendado 22, igual ao Docker e ao CI) e npm.

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

- **Escolha do ramo** — no menu da loja, o seletor **Confeitaria / Barbearia / Loja de roupas** troca nome, produtos, exemplos e vocabulário. Cada ramo tem seus próprios dados de demonstração.
- **Registrar** — o botão principal abre um hub com **Vender**, **Gasto**, **Compra**, **Retirada**, **Foto da nota** e **Áudio**, além do atalho para **Importar planilha**. É a porta única de entrada, para o usuário não precisar decorar onde cada coisa mora.
- **Venda rápida em uma tela** — “O que vendeu?”, “Quanto entrou?” e “Como pagou?”. O seletor de produto recolhe depois da escolha para os três campos caberem no celular. Itens com estoque baixam automaticamente; serviços não movimentam estoque.
- **Gasto rápido** — descrição, valor e forma de pagamento (opcional).
- **Fornecedores** — cadastro com telefone, e-mail e observações. A tela de cada fornecedor reúne o que falta pagar, o histórico de compras, os itens comprados e o preço praticado.
- **Compra de mercadoria** — escolhe fornecedor, item, quantidade e custo unitário. Se for item novo, ele entra no estoque; se existir, o custo é recalculado pela média ponderada. A compra pode ser paga na hora (sai do caixa) ou ficar para pagar (vira conta a pagar).
- **Contas a pagar** — criadas por compra a prazo ou manualmente. O caixa **só muda no dia do pagamento**. A previsão agrupa vencidas, próximos 7 dias e “mais para frente”.
- **Retirada** — dinheiro que você tira do caixa para uso pessoal. Entra em “Saiu” e no extrato com o rótulo **retirada**, mas não é despesa do negócio nem conta a pagar.
- **Importar planilha** — CSV, TSV ou XLSX com vendas, gastos, compras, contas e retiradas. Mostra prévia, valida linha por linha e não mexe no estoque atual. As compras importadas alimentam o histórico de preços por fornecedor.
- **Análises** — previsão de pagamento, comparação de preço do mesmo item entre fornecedores, itens encalhados com o valor parado e resumo de retiradas.
- **Foto da nota** — anexa cupom/comprovante, escolhe se é venda ou compra, confirma produto, valor e pagamento, e salva com `source_type = image_recognition`. O preview fica só no navegador: nesta versão o arquivo não é enviado ao servidor.
- **Áudio** — cria um rascunho `pending_review` com `source_type = audio_transcription` para conferência na home.
- **Entrada rápida de estoque** — produto, quantidade e custo. Continua disponível para repor um item sem passar pela compra completa.
- **Radar de estoque** — produtos no mínimo ou zerados aparecem no topo do extrato e na página de estoque/produtos, com ação direta para repor.
- **Conferência de IA** — card de rascunho com os dados pré-preenchidos. Nada entra no caixa até a confirmação. É possível confirmar ou descartar.
- **Extrato enxuto** — agrupado por dia, com venda e gasto no mesmo lugar. Mostra a origem quando o lançamento veio de áudio, foto ou WhatsApp.
- **Detalhe do lançamento** — valor, horário, pagamento, origem e exclusão com reversão de estoque.
- **Edição de item** — nome, preço e, apenas para itens com estoque, o aviso de reposição.
- **Demo controlada** — no menu “Sua loja” é possível simular um áudio recebido, trocar de ramo e restaurar os dados de exemplo.

### Dados de exemplo

Cada ramo tem um cenário próprio:

| Ramo | Negócio | Caixa | Entrou hoje | Saiu hoje | Áudio pendente |
| --- | --- | --- | --- | --- | --- |
| Confeitaria | Bia Confeitaria | R$ 82,00 | R$ 148,00 | R$ 38,00 | R$ 50,00 |
| Barbearia | Barbearia do Léo | R$ 117,00 | R$ 165,00 | R$ 25,00 | R$ 60,00 |
| Loja de roupas | Loja da Cida | R$ 483,00 | R$ 360,00 | R$ 32,00 | R$ 120,00 |

Cada cenário também traz fornecedores com histórico de compras, contas em aberto (uma atrasada), retiradas e pelo menos um item sem venda há mais de 30 dias. Na confeitaria, a **Torta de limão** é o exemplo de dinheiro parado: 3 tortas e R$ 66,00 sem giro.

Na barbearia, **Corte**, **Barba** e **Corte + barba** são serviços: aparecem na venda e no catálogo, mas não baixam estoque. **Pomada** e **Shampoo** são produtos controlados.

Para voltar ao estado inicial: menu **Sua loja** → **Restaurar exemplo**. No modo nuvem isso recria o cenário do ramo no Supabase; no modo local, limpa o `localStorage`. No console do navegador, o equivalente local é:

```js
localStorage.removeItem("meu-caixa:demo:v3");
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
public/                     # arquivos estáticos
src/
  app/
    layout.tsx              # fontes, providers, metadata e viewport
    page.tsx                # rota inicial (home)
    estoque/page.tsx        # rota de estoque
    contas/page.tsx         # contas a pagar
    fornecedores/page.tsx   # fornecedores e histórico de compras
    analises/page.tsx       # previsão, preços, encalhe e retiradas
    importar/page.tsx       # importação de CSV/TSV/XLSX
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
    quick-actions.tsx       # botão Registrar + atalhos
    pending-review-card.tsx # card de conferência da IA
    activity-feed.tsx       # extrato + alertas de estoque
    stock-view.tsx          # página de estoque
    suppliers-view.tsx      # lista e busca de fornecedores
    supplier-sheet.tsx      # cadastro/edição de fornecedor
    supplier-detail-sheet.tsx # compras, contas e preços do fornecedor
    purchase-sheet.tsx      # compra com estoque, custo e conta a pagar
    bills-view.tsx          # previsão e lista de contas
    bill-sheet.tsx          # conta manual
    bill-pay-sheet.tsx      # pagamento de conta
    withdrawal-sheet.tsx    # retirada do caixa
    analytics-view.tsx      # previsão, preços, encalhe e retiradas
    import-view.tsx         # upload, prévia e importação
    action-provider.tsx     # estado global dos sheets
    sheet.tsx               # bottom sheet mobile / modal central no desktop
    register-sheet.tsx      # hub: venda, gasto, compra, retirada, foto, áudio
    receipt-sheet.tsx       # foto da nota → venda ou compra
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
4. `src/components/quick-actions.tsx` abre o hub **Registrar** e mantém os atalhos de gasto e estoque.
5. `src/components/register-sheet.tsx` é o hub; cada opção abre uma sheet específica (`sale-sheet.tsx`, `expense-sheet.tsx`, `purchase-sheet.tsx`, `withdrawal-sheet.tsx`, `receipt-sheet.tsx`) ou cria um rascunho de áudio.
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

- **Áudio**: gravar no bucket privado `ingestion`, transcrever com Whisper e extrair produto/quantidade/valor/pagamento.
- **Foto**: Vision para ler cupom, comanda ou comprovante; `extracted_payload` guarda o JSON bruto.
- **WhatsApp**: webhook recebe a mensagem, cria um `ingestion_event` com `whatsapp_import` e segue o mesmo pipeline.
- **E-mail/XML**: conector server-side grava a NF-e em `ingestion_events` com `email_import`; o parser reaproveita o mesmo envelope.
- **QR Code/SEFAZ**: leitura do código fiscal grava `qr_code` e usa o mesmo rascunho revisável.
- **Fila**: Edge Function ou worker processa, atualiza `ingestion_events` e cria o lançamento apenas quando a confiança passa do limite.
- **Revisão**: tudo abaixo do limite nasce `pending_review`; a interface de conferência já existe no MVP.

---

## 8. O que é demo e o que é produção

### Hoje (MVP)

- Persistência real no **Supabase**, com sessão anônima por navegador e RLS por negócio.
- Fallback automático para `localStorage` quando o Supabase não está configurado ou a conexão falha — a tela avisa qual modo está ativo.
- Fornecedores, compras, contas a pagar, retiradas, análises e importação de CSV/TSV/XLSX funcionando nos dois modos.
- Sem upload real de áudio/foto no servidor: a foto é lida no navegador (preview) e o lançamento é salvo com `source_type = image_recognition`; o áudio é simulado com um rascunho de exemplo.
- Os três ramos usam dados fictícios e trocam o cenário inteiro ao serem selecionados.
- Sem multiusuário: uma sessão anônima = um negócio. Sair do navegador ou limpar os dados perde a sessão.

### Deploy

- **Vercel** e **Docker** prontos: a imagem multi-stage gera um servidor standalone, roda sem privilégios e expõe health check em `/api/health`.
- **Configuração em runtime** (`/api/config`): as credenciais entram por variável de ambiente no host, sem rebuild e sem ir para o bundle.
- **CI** no GitHub Actions valida tipos, build e a imagem Docker a cada push.
- Passo a passo, HTTPS, backup e checklist em [`DEPLOY.md`](DEPLOY.md).

### Limitações conscientes

- A sessão anônima é por navegador; não há como recuperar o caixa em outro celular.
- Limpar os dados do navegador apaga o vínculo com o negócio (o registro continua no banco, mas sem acesso).
- O modo privado pode bloquear o `localStorage` e a sessão.
- A foto ainda não é armazenada nem processada por OCR/Vision.
- WhatsApp, e-mail/XML e QR Code ainda não têm conector ativo: a tabela e o contrato de entrada já estão prontos, mas a integração fica para a próxima etapa.

### Próximos passos para produção

1. Criar o bucket privado `ingestion` e as políticas de Storage para áudios e fotos.
2. Implementar o pipeline de IA em Edge Functions (Whisper/Vision) gravando em `ingestion_events`.
3. Adicionar upgrade de conta anônima para e-mail/telefone, recuperando o mesmo negócio em outros aparelhos.
4. Conectar o WhatsApp e o e-mail/XML ao contrato de `ingestion_events` (o webapp já aceita o formato).
5. Transformar o app em PWA com fila offline e sincronização.
6. Criar leitura de QR Code/SEFAZ no celular para importar a nota fiscal.

---

## 9. Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Ambiente de desenvolvimento. |
| `npm run build` | Build de produção com Turbopack. |
| `npm start` | Serve o build de produção. |
| `npm run typecheck` | Checagem de tipos sem gerar arquivos. |

---

Feito com calma, cor e foco em quem vende bolo, corta cabelo ou atende na loja — não em quem decora balanço patrimonial.
