# Meu Caixa

> Gestor Inteligente de Pequenos Negócios — gestão sem planilha, sem termo difícil e sem fricção.

MVP de um sistema web responsivo para MEIs e autônomos. A tela principal responde três perguntas com palavras do dia a dia: **quanto entrou**, **quanto saiu** e **quanto sobrou**. O registro de uma venda leva uma tela só, com produto, valor e pagamento, e já baixa o estoque — exceto para serviços, que não controlam quantidade.

A demo tem três ramos prontos (**confeitaria**, **barbearia** e **loja de roupas**) e troca a identidade, os produtos e os exemplos junto com o ramo.

Demo: [`http://localhost:3000`](http://localhost:3000) após rodar o projeto.

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
| Fallback | **localStorage** (`meu-caixa:demo:v2`) | Se o Supabase não estiver configurado ou a conexão cair, o app continua funcionando neste navegador. |
| Backend | **Next.js Route Handler** (`/api/config`) | Entrega URL e chave pública em tempo de execução: trocar de projeto não exige rebuild da imagem. |
| IA futura | **Whisper + Vision + fila/Edge Functions** | Transcrição de áudio, leitura de comprovantes/fotos e importação de WhatsApp sem acoplar a IA ao front-end. |

### Por que login anônimo?

O público do app não quer criar conta para registrar uma venda. O login anônimo do Supabase dá um `auth.users` real (com RLS e `memberships`) sem pedir e-mail nem senha, e o mesmo código aceita e-mail/telefone no futuro. A sessão fica em `meu-caixa:auth` no navegador — por isso, hoje, ela não sincroniza entre aparelhos.

As credenciais usadas no navegador são apenas a URL do projeto e a chave **publishable/anon**. A chave `service_role`/`sb_secret_` é rejeitada em `src/lib/supabase/config.ts`, porque ela ignora o RLS.

---

## 2. Como rodar

Requisitos: Node.js 20+ e npm.

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
`standalone` do Next.js (somente o necessário para produção).

```bash
docker compose up -d --build     # http://localhost:3000
docker compose logs -f web       # acompanhar logs
docker compose down              # parar
```

Para testar em uma URL pública temporária, o Compose já traz um túnel do
Cloudflare no profile `public`:

```bash
docker compose --profile public up -d
docker compose logs -f tunnel    # mostra a URL *.trycloudflare.com
```

A URL do quick tunnel é temporária e muda a cada reinício. Para uma rota
permanente, crie um túnel nomeado no Cloudflare e use o token:

```bash
export CLOUDFLARE_TUNNEL_TOKEN="seu-token"
```

No `compose.yaml`, troque o `command` do serviço `tunnel` por:

```yaml
command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
```

Não há variáveis obrigatórias: o `compose.yaml` lê o `.env.local` em tempo de execução (`env_file` com `required: false`).

---

## 3. O que já funciona

### Fluxos principais

- **Escolha do ramo** — no menu da loja, o seletor **Confeitaria / Barbearia / Loja de roupas** troca nome, produtos, exemplos e vocabulário. Cada ramo tem seus próprios dados de demonstração.
- **Registrar** — o botão principal da home abre um hub com quatro caminhos: **Vender**, **Gasto**, **Foto da nota** e **Áudio**. É a porta única de entrada, para o usuário não precisar decorar onde cada coisa mora.
- **Venda rápida em uma tela** — “O que vendeu?”, “Quanto entrou?” e “Como pagou?”. O seletor de produto recolhe depois da escolha para os três campos caberem no celular. Itens com estoque baixam automaticamente; serviços não movimentam estoque.
- **Gasto rápido** — descrição, valor e forma de pagamento (opcional).
- **Foto da nota** — anexa cupom/comprovante, escolhe se é venda ou compra, confirma produto, valor e pagamento, e salva com `source_type = image_recognition`. O preview fica só no navegador: nesta versão o arquivo não é enviado ao servidor.
- **Áudio** — cria um rascunho `pending_review` com `source_type = audio_transcription` para conferência na home.
- **Entrada de estoque** — produto, quantidade e custo. Se o produto não existe, ele é criado com preço sugerido; se existe, o custo é recalculado pela média ponderada. A compra também entra como gasto no caixa.
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
| Confeitaria | Bia Confeitaria | R$ 202,00 | R$ 148,00 | R$ 38,00 | R$ 50,00 |
| Barbearia | Barbearia do Léo | R$ 237,00 | R$ 165,00 | R$ 25,00 | R$ 60,00 |
| Loja de roupas | Loja da Cida | R$ 783,00 | R$ 360,00 | R$ 32,00 | R$ 120,00 |

Na barbearia, **Corte**, **Barba** e **Corte + barba** são serviços: aparecem na venda e no catálogo, mas não baixam estoque. **Pomada** e **Shampoo** são produtos controlados.

Para voltar ao estado inicial: menu **Sua loja** → **Restaurar exemplo**. No modo nuvem isso recria o cenário do ramo no Supabase; no modo local, limpa o `localStorage`. No console do navegador, o equivalente local é:

```js
localStorage.removeItem("meu-caixa:demo:v2");
location.reload();
```

---

## 4. Estrutura do projeto

```text
Dockerfile                  # imagem multi-stage de produção (standalone)
compose.yaml                # app + túnel opcional do Cloudflare
.env.example                # modelo das credenciais do Supabase
public/                     # arquivos estáticos
src/
  app/
    layout.tsx              # fontes, providers, metadata e viewport
    page.tsx                # rota inicial (home)
    estoque/page.tsx        # rota de estoque
    api/config/route.ts     # entrega URL + chave pública em runtime
    globals.css             # tokens, componentes utilitários e sheets
  components/
    app-shell.tsx           # moldura responsiva + splash de abertura
    navigation.tsx          # topo no desktop e barra inferior no celular
    logo.tsx
    home-view.tsx           # composição da tela principal
    balance-card.tsx        # Entrou / Saiu / Sobrou
    quick-actions.tsx       # botão Registrar + atalhos de gasto e estoque
    pending-review-card.tsx # card de conferência da IA
    activity-feed.tsx       # extrato + alertas de estoque
    stock-view.tsx          # página de estoque
    action-provider.tsx     # estado global dos sheets
    sheet.tsx               # bottom sheet mobile / modal central no desktop
    register-sheet.tsx      # hub: venda, gasto, foto da nota, áudio
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
    format.ts               # moeda, datas e saudação
    cn.ts
    supabase/
      config.ts             # normaliza URL, rejeita placeholders e service_role
      client.ts             # cliente único + leitura de /api/config
      workspace.ts          # sessão anônima, carga, seed e RPCs
supabase/
  schema.sql                # schema de produção (tabelas, RLS e RPCs)
```

### Onde está o código da tela principal

1. `src/app/page.tsx` renderiza `HomeView`.
2. `src/components/home-view.tsx` monta o grid de duas colunas no desktop e a pilha no celular.
3. `src/components/balance-card.tsx` mostra **Sobrou no caixa**, **Entrou hoje** e **Saiu hoje**.
4. `src/components/quick-actions.tsx` abre o hub **Registrar** (venda, gasto, foto, áudio) e mantém os atalhos de gasto e estoque.
5. `src/components/register-sheet.tsx` é o hub; cada opção abre uma sheet específica (`sale-sheet.tsx`, `expense-sheet.tsx`, `receipt-sheet.tsx`) ou cria um rascunho de áudio.
6. `src/components/pending-review-card.tsx` aparece só quando há rascunho de IA.
7. `src/components/activity-feed.tsx` junta alertas de estoque, grupos por dia e o botão “Ver mais”.

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
| `products` | Catálogo, estoque atual, estoque mínimo, custo, preço e `track_stock`. |
| `transactions` | Vendas e gastos. Dinheiro em centavos. |
| `inventory_logs` | Entradas, saídas e ajustes de estoque, ligados ou não a uma transação. |
| `ingestion_events` | Áudios, fotos e mensagens recebidas, com payload da IA e status do pipeline. |

### Regras importantes

- **Dinheiro é `integer` em centavos.** Nunca `float`.
- **Quantidade é `numeric(12,3)`**, permitindo venda por peso no futuro.
- Toda transação e todo log de estoque têm `source_type` e `status`.
- `segment` classifica o negócio como `confeitaria`, `barbearia` ou `roupas` e orienta rótulos e catálogo no app.
- `products.track_stock = false` identifica serviços: eles vendem normalmente, mas não têm saldo, alerta de mínimo nem log de estoque.
- `source_type`: `manual`, `audio_transcription`, `image_recognition`, `whatsapp_import`.
- `status`: `processed` ou `pending_review`.
- Um lançamento `pending_review` **não entra nos totais** até ser confirmado.
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
| `delete_transaction` | Exclui o lançamento e reverte o efeito no estoque. |

Essas funções evitam o clássico problema de venda e baixa de estoque gravadas pela metade.

### Diagrama resumido

```text
auth.users
    │
memberships ─── businesses
                    │
        ┌───────────┼──────────────┐
        │           │              │
    products   transactions   ingestion_events
        │           │
        └── inventory_logs ──────┘
```

---

## 7. Arquitetura para IA e dados não estruturados

O produto foi desenhado para receber dados bagunçados sem sujar o caixa.

### Pipeline previsto

```text
Áudio / Foto / WhatsApp
        ↓
ingestion_events (received)
        ↓
Whisper / Vision / parser
        ↓
status = processed ──────────────► transactions (entra no caixa)
        │
        └── baixa confiança ─────► pending_review
                                      ↓
                         card “Confira essa venda”
                                      ↓
                         usuário corrige e confirma
```

### Fallback de IA

Quando a IA não consegue identificar todos os campos, o app não inventa dados. Ele mostra:

> **Confira o último áudio — faltou identificar alguns dados.**

O card abre o mesmo formulário de venda, já pré-preenchido com o que a IA entendeu. O usuário confirma ou descarta. O `raw_input` e o `ai_confidence` ficam preservados no registro para auditoria.

### Por que `source_type` e `status` ficam nas duas tabelas?

`transactions` responde “de onde veio esse dinheiro?”. `inventory_logs` responde “de onde veio essa mexida no estoque?”. Uma foto de comprovante pode gerar uma venda e uma saída de estoque; as duas precisam carregar a mesma origem e o mesmo estado de conferência.

### Integrações futuras

- **Áudio**: gravar no bucket privado `ingestion`, transcrever com Whisper e extrair produto/quantidade/valor/pagamento.
- **Foto**: Vision para ler cupom, comanda ou comprovante; `extracted_payload` guarda o JSON bruto.
- **WhatsApp**: webhook recebe a mensagem, cria um `ingestion_event` com `whatsapp_import` e segue o mesmo pipeline.
- **Fila**: Edge Function ou worker processa, atualiza `ingestion_events` e cria a transação apenas quando a confiança passa do limite.
- **Revisão**: tudo abaixo do limite nasce `pending_review`; a interface de conferência já existe no MVP.

---

## 8. O que é demo e o que é produção

### Hoje (MVP)

- Persistência real no **Supabase**, com sessão anônima por navegador e RLS por negócio.
- Fallback automático para `localStorage` quando o Supabase não está configurado ou a conexão falha — a tela avisa qual modo está ativo.
- Sem upload real de áudio/foto no servidor: a foto é lida no navegador (preview) e o lançamento é salvo com `source_type = image_recognition`; o áudio é simulando com um rascunho de exemplo.
- Os três ramos usam dados fictícios e trocam o cenário inteiro ao serem selecionados.
- Sem multiusuário: uma sessão anônima = um negócio. Sair do navegador ou limpar os dados perde a sessão.

### Limitações conscientes

- A sessão anônima é por navegador; não há como recuperar o caixa em outro celular.
- Limpar os dados do navegador apaga o vínculo com o negócio (o registro continua no banco, mas sem acesso).
- O modo privado pode bloquear o `localStorage` e a sessão.
- A foto ainda não é armazenada nem processada por OCR/Vision.

### Próximos passos para produção

1. Criar o bucket privado `ingestion` e as políticas de Storage para áudios e fotos.
2. Implementar o pipeline de IA em Edge Functions (Whisper/Vision) gravando em `ingestion_events`.
3. Adicionar upgrade de conta anônima para e-mail/telefone, recuperando o mesmo negócio em outros aparelhos.
4. Modelar boletos/contas a pagar, fornecedores e histórico de preço de compra.
5. Separar caixa da empresa × pessoal (`withdrawal`/pró-labore).
6. Análise de encalhe: capital parado por item sem saída há X dias.
7. Transformar o app em PWA com fila offline e sincronização.
8. Importação de planilha, QR Code/SEFAZ e e-mail de fornecedor (parser de XML).

---

## 9. Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Ambiente de desenvolvimento. |
| `npm run build` | Build de produção com Turbopack. |
| `npm start` | Serve o build de produção. |

---

Feito com calma, cor e foco em quem vende bolo, corta cabelo ou atende na loja — não em quem decora balanço patrimonial.
