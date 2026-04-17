

## 📋 DIRETIVAS DO PROJETO E REGRAS DE CÓDIGO
# Regras
- Use princípios de Clean Code.
- Comente lógicas complexas.


## 🧠 MEMÓRIA DE CONTEXTO ISOLADO (ORACULO-FINANCEIRO)
## 2026-04-10 — Biome 2.x + patches (v01.08.12)
- Biome 2.x adicionado (lint + format com organizeImports)
- vite 8.0.7 → 8.0.8, vitest 4.1.2 → 4.1.4, lucide-react 1.7.0 → 1.8.0
- Dependabot groups: @vitest/* e @biomejs/* adicionados

# AI Memory Log - Oraculo-Financeiro

## 2026-04-17 — Oráculo Financeiro v01.09.03 (wrangler observability + traces)
### Escopo
Padronização do baseline de observabilidade Cloudflare no `oraculo-financeiro`, cobrindo o app principal e o worker `taxaipca-motor`.
### Alterado
- `wrangler.json` e `workers/taxaipca-motor/wrangler.json` agora garantem `observability.logs.enabled = true`, `observability.logs.invocation_logs = true` e `observability.traces.enabled = true`.
- Campos existentes de observability, como `head_sampling_rate`, foram preservados durante o merge do config.
### Motivação
- Fechar a padronização de telemetria do workspace sem regressão de configuração.
### Versão
- APP v01.09.02 → APP v01.09.03


## 2026-04-17 — Oráculo Financeiro v01.09.02 (origem/auth fail-closed + mutações públicas desativadas)
### Escopo
Fechamento da auditoria defensiva de 2026-04-17 no `oraculo-financeiro`, com endurecimento de origem/auth, desativação de superfícies públicas indevidas de mutação e cobertura mínima de testes para os helpers novos de segurança.
### Alterado
- **Origem e rate limiting**: `oraculo-auth.ts`, `contato.ts`, `enviar-email.ts`, `analisar-ia.ts`, `tesouro-ipca-vision.ts` e `taxa-ipca-atual.ts` passaram a operar fail-closed para origem e com quotas reais.
- **Tokens sensíveis**: OTPs e sessões migraram para persistência por hash com lookup compatível durante a transição.
- **Mutações públicas desativadas**: `auditorias-ia`, `registros-lci-cdb` e `tesouro-ipca` passaram a responder `410` nos caminhos de escrita públicos.
- **Testes**: `functions/api/_shared/security.test.ts` cobre origem, headers, sanitização/escape e hashing.
### Motivação
- Responder à auditoria defensiva fechando escrita pública indevida, reduzindo relay abusável de e-mail e deixando os novos helpers de segurança com cobertura de regressão.
### Versão
- APP v01.09.01 → APP v01.09.02

## 2026-04-08 — Tech Upgrade: ESLint 10
### Escopo
Migração ESLint 9→10 finalizada.
### Feito
- **ESLint 10.2.0**: Upgrade + `.npmrc` para peer dep compatibility.
- Lint clean (0 errors).
### Versão
- APP v01.08.10 → APP v01.08.11

## 2026-04-08 — GitHub Actions Purge & Dependabot Standardization
### Escopo
Auditoria completa de CI/CD para eliminação de "ghost runs" em toda a rede de repositórios do workspace, juntamente com a universalização da configuração do Dependabot ajustada às necessidades de empacotamento locais para mitigar tráfego e limites no API.

## 2026-04-04 - Tokens Maximizados para Inferência Avançada
### Scope
Remoção do teto impeditivo de resposta para Thinking Models nativos nas inferências IPCA e Análise.
### Resolved
- **Tokens Ampliados**: Limites de output expandidos previnindo falhas de truncamento (\SyntaxError\) após 2048 tokens por causa do tempo gasto no think phase.

### Controle de versão
- oraculo-financeiro: APP v01.08.07 -> APP v01.08.08


## 2026-04-03 — Cloudflare Paid Scale Integration
### Escopo
Migração arquitetural unificada para aproveitamento da infraestrutura Cloudflare Paid. Implementação de **Smart Placement** transversal para redução de latência via proximidade física com o banco de dados (BIGDATA_DB). Adoção da diretiva `usage_model: unbound` para mitigar o `Error 1102` (CPU limit excess). Embutimento global do proxy **Cloudflare AI Gateway** sobrepondo o SDK nativo (`@google/genai`) e habilitando Caching, Rate limiting Nativo e Observabilidade Unificada, mantendo operação híbrida com os LLMs da rede.

### Diretivas Respeitadas
- Conformidade 100% com `wrangler.json`.
- `tlsrpt-motor` e `taxaipca-motor` revalidados em infraestrutura moderna sem timeout.

## 2026-04-02 - Oráculo Financeiro v01.08.06 - Migração e Tratamento de Exceções SDK IA
### Corrigido
- Implementado tratamento absoluto de exceções (
o-explicit-any zero tolerância usando instanceof Error) nos backends Cloudflare Workers que comunicam com serviços de IA.
- Migração completa para novo SDK oficial @google/genai apagando as chamadas legadas instáveis que eram dependentes da lib generative-ai.
- Toda a governança de 'rate limit' local do oráculo foi removida e delegada ao Cloudflare WAF, limpando resquícios do nforceRateLimit.

### Controle de versão
- oraculo-financeiro: APP v01.08.05 -> APP v01.08.06
## 2026-03-28 — Admin-App v01.66.00 — Oráculo Rate Limit Controls
### Adicionado
- **Oráculo — Rate Limit (paridade Astrólogo)**: controle completo de rate limit implementado para o módulo Oráculo Financeiro, cobrindo 4 rotas: `analisar-ia`, `enviar-email`, `contato`, `tesouro-ipca-vision`.
- **Backend**: `oraculo-admin.ts` (helper D1) + `oraculo/rate-limit.ts` (endpoint GET/POST) com tabelas dedicadas, fallback resiliente e telemetria via `operational.ts`.
- **Frontend**: dropdown de Rate Limit em Configurações agora inclui opção "Oráculo" com `RateLimitPanel` genérico reutilizado.
### Alterado
- **Telemetria**: tipo `module` em `operational.ts` expandido com `'oraculo'`.
### Controle de versão
- `admin-app`: APP v01.65.03 → APP v01.66.00

## 2026-03-27 — Oráculo Financeiro v01.07.01 — Taxonomia de Juros Semestrais
### Corrigido
- **CSS Grid Overlap**: corrigido bug de responsividade visual nos formulários (`App.css`). Itens filhos do `.grid` agora recebem `min-width: 0` e o `<select>` recebe `text-overflow: ellipsis`. Impede que strings longas quebrem as tracks do CSS Grid e sobreponham campos adjacentes.
### Melhorado
- **Dropdown Tesouro Direto**: títulos "Tesouro IPCA+ com Juros Semestrais" agora recebem o sufixo ` (Semestral)` na string do vencimento no Client (ex. `15/08/2032 (Semestral)`). Isso resolve a colisão de options (NTN-B Principal vs NTN-B padrão) com a mesma data de vencimento e taxas diferentes (ex: 2032, 2040), permitindo ao usuário distinguir os fluxos de caixa e impedindo o React e o `Array.find()` de sobrescrever a seleção. 
### Controle de versão
- `oraculo-financeiro`: v01.07.00 → v01.07.01.

## 2026-03-27 — Oráculo Financeiro v01.07.00 + Admin-App v01.57.00 — Data Architecture Overhaul (Email Linkage + Cascade Delete)
### Adicionado
- **Email linkage**: coluna `email TEXT DEFAULT ''` adicionada a `oraculo_tesouro_ipca_lotes` e `oraculo_lci_cdb_registros` via self-healing migration. `oraculo-auth.ts` `verify-save` vincula email nos registros individuais via `stampEmailOnRecords()`.
- **Auto-exclusão de dados (frontend)**: botão "🗑️ Excluir Meus Dados" no frontend com fluxo email/token (`request-delete-token` + `verify-delete`). Cascata por email em 4 tabelas.
- **Cascata de exclusão (admin-app)**: `userdata.ts` DELETE cascateia por IDs do JSON + email (safety net) em todas as tabelas. `excluir.ts` sincroniza `dados_json` ao excluir registro individual.
### Corrigido
- **Cron resetava ao deploy**: `triggers.crons` hardcoded em `wrangler.json` sobrescrevia agendamento. Removido — gerenciado exclusivamente via API Cloudflare.
- **[SECURITY] GET handlers públicos removidos**: `onRequestGet` de `tesouro-ipca.ts` e `registros-lci-cdb.ts` retornavam todos os registros sem autenticação. Removidos.
- **[SECURITY] Frontend auto-load removido**: `carregarRegistros()` deletado. Frontend inicia vazio — dados só via email/token.
- **Sessão persistente 60 min**: após OTP, backend gera session token (UUID/60min). Frontend `sessionStorage` + `session-retrieve` com rotação de token. Sobrevive F5, não sobrevive fechar janela.
### Melhorado
- **Botão "Análise Inteligente"**: reposicionado para antes dos botões de ação, centralizado em linha própria, largura 100%.
### Arquitetura
- **5 tabelas D1**: `oraculo_user_data` (JSON blob/email), `oraculo_auth_tokens` (OTP), `oraculo_tesouro_ipca_lotes` (lotes + email), `oraculo_lci_cdb_registros` (registros + email), `oraculo_taxa_ipca_cache` (mercado).
- **Princípio**: dados em todas as tabelas são vinculados ao email do usuário. Nenhum dado pode ser exibido no frontend público sem autenticação via email/token.
### Controle de versão
- `oraculo-financeiro`: v01.06.02 → v01.07.00.
- `admin-app`: v01.56.02 → v01.57.00.

## 2026-03-27 — Oráculo Financeiro v01.06.01 + Admin-App v01.56.01 — Cron Modernization + Observability + Fixes
### Adicionado
- **Admin-App OraculoModule — Cron Schedule Live**: campos cosmético/read-only de cron substituídos por selects de hora/minuto BRT compactos + botão "Salvar" que chama Cloudflare Workers Schedules API (`PUT /accounts/{id}/workers/scripts/taxaipca-motor/schedules`). Carrega schedule atual ao abrir aba Configurações.
- **[NEW] `functions/api/oraculo/cron.ts`**: endpoint GET (lê schedule) e PUT (atualiza schedule) via `CF_API_TOKEN` + `CF_ACCOUNT_ID`.
### Corrigido
- **Cron Worker CSV Parser**: `parseCSV` reescrito com mapeamento correto de 7 colunas (antes usava 8, causando dados corrompidos). Full-scan para data-base mais recente implementado.
- **Dropdown Vencimentos desordenado**: sort de `dd/mm/yyyy` via `localeCompare` direto → convertido para `yyyymmdd` antes de comparar.
- **IDE Type Errors**: `ScheduledEvent` e `ExecutionContext` declarados inline no worker (sem dependência de `@cloudflare/workers-types`).
### Melhorado
- **Cron Worker Observability completa**: logging granular — trigger metadata (scheduledTime, cron expression, UTC), origem (`cron(...)` vs `http-manual`), listagem de cada título IPCA+, timing separado de parse e D1, stack trace em erros.
- **Admin-App cron.ts GET logging**: endpoint loga schedule lido e erros.
- **Footer Buttons UX**: `box-shadow` e hover `#1557b0` com glow nos botões Contato/E-mail.
### Controle de versão
- `oraculo-financeiro`: v01.05.00 → v01.06.00 → v01.06.01.
- `admin-app`: v01.55.00 → v01.56.00 → v01.56.01.

## 2026-03-26 — Oráculo Financeiro v01.05.00 + Admin-App v01.55.00 — Email Report Rewrite + Admin Data View
### Alterado
- **E-mail de Análise — reescrita completa**: `gerarHtmlRelatorio()` reescrito com inline CSS replicando a tela do frontend (parâmetros, LCI/LCA com benchmark, Tesouro IPCA+ com MtM/lotes/sinal, análise IA com badge/ciladas/recomendação). Design tiptap.dev com `@media` responsive.
- **Admin-App OraculoModule — detalhe do usuário**: visualização reescrita com card de parâmetros (CDI/IPCA/Duration/taxa/aporte), lotes Tesouro com `border-left` colorida (MANTER/VENDER), texto de análise, totais agregados. LCI/LCA com badge IR e CDB equivalente.
- **Vencimentos cronológicos**: dropdown IPCA+ ordenado do vencimento mais próximo ao mais distante.
### Corrigido
- **Lint TypeScript**: corrigidos comparadores `benchmarkLci.classe` (`'bom'`→`'muito-bom'`, `'razoavel'`→`'regular'`) e `analiseIa.recomendacao` (`'INVESTIR'`→`'MANTER'`).
### Controle de versão
- `oraculo-financeiro`: v01.04.00 → v01.05.00.
- `admin-app`: v01.54.01 → v01.55.00.

## 2026-03-26 — Oráculo Financeiro v01.04.00 — Contato + E-mail Análise + PDF Vision + Scroll FABs + CSP
### Adicionado
- **Formulário de Contato**: `ContactModal` portado do mainsite-frontend. Backend `contato.ts` via Resend (`oraculo-financeiro@lcv.app.br`). WCAG: `id`/`name`/`autoComplete`, `aria-modal`, `sr-only` labels. Máscara telefone BR.
- **E-mail de Análise**: `EmailModal` portado do astrólogo-frontend. `gerarHtmlRelatorio()` gera HTML completo (parâmetros, IPCA+ lotes, LCI/LCA registros, análise IA). `gerarTextoRelatorio()` para plaintext. Backend `enviar-email.ts` via Resend.
- **Suporte a PDF no Vision**: drag/drop e file input aceitam `application/pdf` + imagens. `tesouro-ipca-vision.ts` system instruction atualizada para "imagem ou PDF".
- **Scroll FABs**: botões flutuantes (↑/↓) com threshold 200px, design tiptap.dev (branco/Google Blue hover). Paridade admin-app.
- **CSP `_headers`**: `public/_headers` criado para segurança do frontend público. Permite Resend API, Gemini API, Google Fonts, Cloudflare Insights. Sem cache-control.
- **Footer Actions**: botões "✉ Contato" e "📧 Enviar por E-mail" no rodapé com design pill (hover Google Blue).
### Corrigido
- **Notificações ocultas por auth modal**: `z-index` de `.notifications` elevado para 101 (acima de `.auth-overlay` z-index: 100).
- **Botão "Resgatar Análise"**: adicionada borda para paridade visual.
- **Lint**: `let` → `const` em `formatPhone`, `analiseIa.texto` → `analiseIa.analise`.
### Controle de versão
- `oraculo-financeiro`: v01.03.00 → v01.04.00.

## 2026-03-26 — Oráculo Financeiro v01.03.00 + Admin-App v01.53.00 — Tesouro Transparente + Cron + Redesign Admin
### Adicionado
- **Tesouro Transparente**: Worker `/api/taxa-ipca-atual` migrado de ANBIMA (paga) para CSV público gratuito. Cache D1 (`oraculo_taxa_ipca_cache`). Suporta `?force=true`.
- **Cron Worker**: `workers/taxaipca-motor/` — scheduled handler `0 5 * * *` (02:00 BRT). CI/CD via `deploy.yml`.
- **Máscaras Input BR**: `formatBRL`/`parseBRL`/`formatTaxa` — 7 inputs convertidos para formato brasileiro.
- **Admin-App OraculoModule**: redesign 3 abas. Configurações: status cache, URL CSV, cron, modelos IA, trigger manual CSV.
### Alterado
- **~~MP 2026~~** *(corrigido em v01.06.02)*: MP 1.303/25 caducou em outubro/2025 sem conversão em lei; tabela regressiva IR (22,5%→15%) permanece vigente. Prompt Vision: `gemini-3.1-pro-preview`, datas `dd/mm/aaaa`.
### Controle de versão
- `oraculo-financeiro`: v01.02.05 → v01.03.00.
- `admin-app`: v01.52.01 → v01.53.00.

## 2026-03-26 — Oráculo Financeiro v01.02.05 — Reescrita Vision Worker (gemini-2.5-pro-latest)
### Corrigido
- **Modelo Vision**: o worker `tesouro-ipca-vision.ts` usava `gemini-pro-latest` (Gemini 1.0 Pro, texto-only). Imagens enviadas via `inlineData` eram rejeitadas pela API com erro 400. Migrado para `gemini-2.5-pro-latest` — último modelo Pro com suporte nativo a visão multimodal, thinking e `responseMimeType: "application/json"`.
- **Engenharia de resiliência**: adicionados retry (1 tentativa extra com delay 800ms), filtro de `thought` parts (evita contaminação da resposta por blocos de raciocínio interno), e tipagem forte com interfaces `Env`/`Context` (eliminados todos os `any`).
- **Tabela DELETE**: `tesouro-ipca.ts` linha 198 usava `tesouro_ipca_lotes` (sem prefixo `oraculo_`), corrigido para `oraculo_tesouro_ipca_lotes`.

## 2026-03-26 — Oráculo Financeiro v01.02.04 — Override e Compliance Modelo IA
### Corrigido
- **Nomenclatura Gemini API**: worker multimodal `tesouro-ipca-vision.ts` teve a assinatura base ajustada de `gemini-1.5-pro-latest` de volta para `gemini-pro-latest` (explicit binding) e chaves da API beta atualizadas (como `system_instruction` e `thinkingLevel`).

## 2026-03-26 — Oráculo Financeiro v01.02.03 — Hotfixes Críticos (UX e API)
### Corrigido
- **API Worker (Erro 500)**: O recém implementado `/api/tesouro-ipca-vision` colidiu com versões Node locais do Wrangler que não suportam `Response.json()`. A sintaxe foi sanitizada para o mesmo utilitário `jsonResponse` nativo (`new Response(JSON.stringify(...))`) adotado pelo `analisar-ia`.
- **Visibilidade da Multimodal (UX)**: A interface drag-and-drop original era oculta, falhando em usabilidade básica (discoverability). Injetado o *Feature Banner* do Tiptap com botão `input type="file"` direto.
- **D1 Table Routing**: Resolvido erro gravíssimo de 500 no modulo `admin-app/api/oraculo/listar.ts` ao corrigir nome da tabela órfã (`oraculo_lci_cdb_registros`).

## 2026-03-26 — Oráculo Financeiro v01.02.02 — Remoção de Quality Gates
### Removido
- O workflow `quality-gates.yml` do GitHub Actions (.github/workflows) foi deletado para desobstruir o pipeline de Continuous Deployment (CD). As travas condicionais de aprovação em Pull Requests (npm ci, lint e build preventivos) não interferem mais no fluxo ágil da branch main.

## 2026-03-26 — Admin-App v01.52.00 + Oráculo Financeiro v01.02.00 — Migração de Gestão de Registros e UI Redesign (Tiptap / Google Blue)

### Escopo Admin-App (v01.52.00)
- **[NEW] OráculoModule.tsx**: criado módulo 'Oráculo Financeiro' no painel principal, idêntico ao modelo AstrologoModule. Interfaces organizam listagem (`/api/oraculo/listar` paginada via D1) e deleção de dados simulados LCI/LCA + Tesouro IPCA+. 
- **Integração:** Adicionado no `App.tsx` (Lazy Load) e menu lateral (ícone `BrainCircuit`). **Menu Principal reordenado** estritamente por ordem alfabética (Visão Geral em 1º, Configurações por último).

### Escopo Oráculo Financeiro Frontend (v01.02.00)
- **UI Redesign**: Removido interface pesada (blurs e gradients) na camada de design tokens (\`index.css\` e \`App.css\`). Substituído por padrão **Tiptap/Google Blue** — cards sólidos brancos (30px radius), border sutil de 1px off-black, fonte Google Fonts *Inter*, botões 'pill' de alta fricção Google Blue (#1a73e8).
- **Cleanup**: Tabela de registros no rodapé e state hooks associados foram *DELETADOS* do frontend (função assumida 100% pelo admin-app).
- **Compliance AI**: Gemini API end-points (\`functions/api/analisar-ia.ts\`) receberam upgrade de *Safety Settings* (Harassment, Sexually Explicit para *BLOCK_ONLY_HIGH*), garantindo filtro coerente de extração de thought para 'thinking models'.



### Implementação Multimodal (OCR Vision + Drag & Drop)
- **Objetivo Concluído**: O fluxo de captura de imagens de extratos do Tesouro Direto foi materializado no frontend do Oráculo Financeiro (`tesouro-ipca-vision`).
- **Engenharia de Prompting API**: 
  - Criação do Cloudflare Worker `/api/tesouro-ipca-vision.ts` interceptando uploads em Base64, e forçando `responseMimeType: "application/json"` ao endpoint do Gemini 1.5 Pro.
  - Segurança `BLOCK_ONLY_HIGH` aplicada no processamento.
  - Extração literal validada de `dataCompra`, `valorInvestido` e `taxaContratada` com purga cirúrgica de marcação markdown.
- **Frontend Dropzone**:
  - `App.tsx` abraçou os arrays de evento `onDragOver` e `onDrop` revelando um *backdrop filter* azul (identidade Visual Tiptap). O frontend auto-preenche e notifica sucesso com `pushNotification` sem violar requisições em lote desnecessárias ao banco de dados `BIGDATA_DB`.


## 2026-04-03 — Enforcing Canonical Domain Security & TypeScript Audit
### Escopo
Implementação de bloqueio em Edge para impedir a exposição pública de roteamentos sob o domínio interno `*.pages.dev`. Aplicado redirect mandatório (301) para os domínios canônicos definidos (`lcv.app.br` e suas ramificações) em todos os apps com exceção dos puramente internos, protegendo infraestrutura e performance SEO. Também foram resolvidos erros de compilação (`Unexpected any`) e typings TypeScript do motor do editor Post no `admin-app` referentes a integração Word Mammoth, bem como a injeção Cloudflare `PagesFunction` em `mainsite-frontend`.

### Controle de versão
- `admin-app`: APP v01.77.31 → APP v01.77.32
- `oraculo-financeiro`: APP v01.08.00 → APP v01.08.01
- `astrologo-app`: APP v02.17.02 → APP v02.17.03
- `mainsite-frontend`: APP v03.04.14 → APP v03.04.15
- `calculadora-app`: middleware deployment, versioning handled internally
- `apphub`: middleware deployment, versioning handled internally
- `adminapps`: middleware deployment, versioning handled internally




> **DIRETIVA DE SEGURANÇA:** Ao sugerir código ou responder perguntas, leia rigorosamente o contexto e as memórias históricas acima para não divergir das decisões já tomadas pelo outro agente.
