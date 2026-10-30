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
| Persistência do MVP | **localStorage** (`meu-caixa:demo:v2`) | Permite testar todos os fluxos sem login, credenciais ou backend. |
| Banco de produção | **Supabase Postgres** | Postgres relacional, Auth, RLS, Storage para áudios/fotos e funções RPC para operações atômicas. |
| IA futura | **Whisper + Vision + fila/Edge Functions** | Transcrição de áudio, leitura de comprovantes/fotos e importação de WhatsApp sem acoplar a IA ao front-end. |

### Por que não começar com um banco online?

O objetivo do MVP é validar o fluxo de uso. O store local tem a mesma forma do modelo relacional e fica isolado em `src/lib/store.tsx`, então a troca por Supabase não exige reescrever a interface.

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

Não há variáveis de ambiente obrigatórias nesta fase.

---

## 3. O que já funciona

### Fluxos principais

- **Escolha do ramo** — no menu da loja, o seletor **Confeitaria / Barbearia / Loja de roupas** troca nome, produtos, exemplos e vocabulário. Cada ramo tem seus próprios dados de demonstração.
- **Venda rápida em uma tela** — “O que vendeu?”, “Quanto entrou?” e “Como pagou?”. O seletor de produto recolhe depois da escolha para os três campos caberem no celular. Itens com estoque baixam automaticamente; serviços não movimentam estoque.
- **Gasto rápido** — descrição, valor e forma de pagamento (opcional).
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

Para voltar ao estado inicial: menu **Sua loja** → **Restaurar exemplo**. Ou, no console do navegador:

```js
localStorage.removeItem("meu-caixa:demo:v2");
location.reload();
```

---

## 4. Estrutura do projeto

```text
src/
  app/
    layout.tsx              # fontes, providers, metadata e viewport
    page.tsx                # rota inicial (home)
    estoque/page.tsx        # rota de estoque
    globals.css             # tokens, componentes utilitários e sheets
  components/
    app-shell.tsx           # moldura responsiva + navegação
    navigation.tsx          # topo no desktop e barra inferior no celular
    logo.tsx
    home-view.tsx           # composição da tela principal
    balance-card.tsx        # Entrou / Saiu / Sobrou
    quick-actions.tsx       # vendeu, gastou, entrou estoque
    pending-review-card.tsx # card de conferência da IA
    activity-feed.tsx       # extrato + alertas de estoque
    stock-view.tsx          # página de estoque
    action-provider.tsx     # estado global dos sheets
    sheet.tsx               # bottom sheet mobile / modal central no desktop
    sale-sheet.tsx          # venda + confirmação de pendente + sucesso
    expense-sheet.tsx
    stock-entry-sheet.tsx
    transaction-detail-sheet.tsx
    product-edit-sheet.tsx
    more-sheet.tsx
    money-input.tsx
    quantity-stepper.tsx
    payment-picker.tsx
    toast.tsx
  lib/
    types.ts                # domínio e enums (inclui SegmentId e trackStock)
    segments.ts             # perfis de ramo, produtos e exemplos
    seed.ts                 # monta a demo a partir do ramo escolhido
    store.tsx               # estado, ações e totais (localStorage v2)
    format.ts               # moeda, datas e saudação
    cn.ts
supabase/
  schema.sql                # schema de produção (tabelas, RLS e RPCs)
```

### Onde está o código da tela principal

1. `src/app/page.tsx` renderiza `HomeView`.
2. `src/components/home-view.tsx` monta o grid de duas colunas no desktop e a pilha no celular.
3. `src/components/balance-card.tsx` mostra **Sobrou no caixa**, **Entrou hoje** e **Saiu hoje**.
4. `src/components/quick-actions.tsx` abre venda, gasto e entrada de estoque.
5. `src/components/pending-review-card.tsx` aparece só quando há rascunho de IA.
6. `src/components/activity-feed.tsx` junta alertas de estoque, grupos por dia e o botão “Ver mais”.

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

- Persistência apenas no navegador, via `localStorage`.
- Sem login, multiusuário ou sincronização entre dispositivos.
- Sem upload real de áudio/foto; o botão “Simular áudio” cria um rascunho de exemplo.
- Os três ramos usam dados fictícios e trocam o cenário inteiro ao serem selecionados.
- Sem Supabase client instalado; o schema está pronto, mas a camada de dados ainda é local.

### Limitações conscientes

- Limpar os dados do navegador apaga o histórico.
- Não há backup nem acesso de outro celular.
- O modo privado pode bloquear o `localStorage`.
- Os dados da demo não são compartilhados entre navegadores.

### Próximos passos para produção

1. Criar o projeto no Supabase e rodar `supabase/schema.sql`.
2. Ativar Auth (magic link ou OTP por e-mail) e criar o negócio via `create_business`.
3. Trocar `src/lib/store.tsx` por uma camada de dados tipada com Supabase, mantendo a interface do context.
4. Migrar venda, confirmação de IA e exclusão para as RPCs atômicas.
5. Criar o bucket privado `ingestion` e as políticas de Storage.
6. Implementar o pipeline de IA em Edge Functions.
7. Transformar o app em PWA com fila offline e sincronização.
8. Adicionar relatórios simples por período e exportação.

---

## 9. Scripts

| Comando | Descrição |
| --- | --- |
| `npm run dev` | Ambiente de desenvolvimento. |
| `npm run build` | Build de produção com Turbopack. |
| `npm start` | Serve o build de produção. |

---

Feito com calma, cor e foco em quem vende bolo, corta cabelo ou atende na loja — não em quem decora balanço patrimonial.
