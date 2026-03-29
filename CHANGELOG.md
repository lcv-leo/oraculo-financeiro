# Changelog — Oráculo Financeiro

## [v01.07.02] — 2026-03-29
### Alterado
- **CI/CD branch standardization**: workflow de deploy padronizado para publicar no branch `main` na Cloudflare Pages, com trigger GitHub em `main` e `concurrency.group` atualizado para `deploy-main`.

### Controle de versão
- `oraculo-financeiro`: APP v01.07.01 → APP v01.07.02

## [v01.07.01] — 2026-03-27
### Corrigido
- **CSS Grid Overlap**: os containers `.grid` em formulários (especialmente em *"Registrar novo lote"*) agora possuem `min-width: 0` nos itens filhos e `text-overflow: ellipsis` no `<select>`. Isso evita que a string de vencimento alongada do Tesouro IPCA+ com Juros Semestrais expanda a trilha do grid para fora da tela, encavalando sobre o input de "Valor Investido".

### Melhorado
- **Taxonomia de Juros Semestrais**: Títulos "Tesouro IPCA+ com Juros Semestrais" agora recebem o sufixo `(Semestral)` na string de vencimento (ex: `15/08/2032 (Semestral)`). Isso resolve o bug visual no dropdown onde as NTN-Bs Principais se misturavam às NTN-Bs padrão, impedindo o usuário de selecionar a opção correta devido à sobreposição de \`value\` no `<select>`, e melhora a clareza do relatório.

## [v01.07.00] — 2026-03-27
### Adicionado
- **Email linkage nas tabelas individuais**: coluna `email` adicionada a `oraculo_tesouro_ipca_lotes` e `oraculo_lci_cdb_registros` via self-healing migration. Todos os registros são vinculados ao email do usuário ao salvar via autenticação.
- **Auto-exclusão de dados (frontend)**: botão "🗑️ Excluir Meus Dados" no frontend aberto com fluxo completo de email/token (actions `request-delete-token` + `verify-delete`). Cascata por email em todas as 4 tabelas.
- **`stampEmailOnRecords`**: função auxiliar em `oraculo-auth.ts` que vincula email aos registros individuais referenciados no `dados_json` durante `verify-save`.
- **Sessão persistente (60 min)**: após autenticação via OTP, backend gera session token (UUID) com TTL de 60 minutos. Frontend armazena em `sessionStorage` (sobrevive F5, não sobrevive fechar janela). Ao recarregar, dados são restaurados automaticamente via `session-retrieve` com validação server-side e rotação de token.

### Corrigido
- **Exposição de dados no frontend público**: registros em `oraculo_tesouro_ipca_lotes` e `oraculo_lci_cdb_registros` permaneciam após exclusão do usuário no admin-app. Agora a cascata de exclusão remove registros por IDs do JSON + por email (safety net) em todas as tabelas.
- **Cron resetava ao deploy**: `triggers.crons` hardcoded em `wrangler.json` sobrescrevia a configuração de agendamento a cada deploy. Removido — agendamento agora gerenciado exclusivamente via API Cloudflare (admin-app).
- **[SECURITY] GET handlers públicos removidos**: `onRequestGet` de `tesouro-ipca.ts` e `registros-lci-cdb.ts` retornavam todos os registros sem autenticação. Removidos. Dados de usuário agora acessíveis somente via fluxo autenticado em `oraculo-auth.ts`.
- **[SECURITY] Frontend auto-load removido**: `carregarRegistros()` e `useEffect` que carregavam todos os dados ao abrir a página foram deletados. Frontend agora inicia vazio — dados populados somente após validação via email/token.

### Melhorado
- **Botão "Análise Inteligente" reposicionado**: movido para antes dos botões de ação, centralizado em linha própria com largura 100% e espaçamento adequado.
- **Notificações de sessão**: autenticação bem-sucedida informa ao usuário que a sessão dura 60 minutos e sobrevive refresh.

## [v01.06.02] — 2026-03-27
### Corrigido
- **IR Tesouro Direto — remoção de MP 2026 fictícia**: `aliquotaIrRegressiva` aplicava alíquota fixa de 17,5% para compras a partir de 2026. Corrigido para tabela regressiva padrão (22,5% / 20% / 17,5% / 15%) conforme Lei 11.033/2004 e site oficial do Tesouro Direto.
- **`diasParaMenorIr`**: removia contagem regressiva para IR 15% em compras pós-2026 (retornava 0). Corrigido para sempre calcular 720 − dias decorridos.
- **`gerarSinalTesouro`**: lógica de decisão considerava 17,5% como IR mínimo. Corrigido para reconhecer apenas 15% como piso.

## [v01.06.01] — 2026-03-27
### Corrigido
- **Dropdown Vencimentos desordenado**: sort de datas `dd/mm/yyyy` usava `localeCompare` direto (ordenava por dia, não por ano). Corrigido para converter `dd/mm/yyyy` → `yyyymmdd` antes de comparar, garantindo ordem cronológica (mais próximo → mais distante).
- **IDE Type Errors**: declarados `ScheduledEvent` e `ExecutionContext` inline no worker (evita dependência de `@cloudflare/workers-types`).

### Melhorado
- **Cron Worker Observability completa**: logging granular em cada etapa — trigger metadata (`scheduledTime`, expressão cron, UTC), origem do disparo (`cron(...)` vs `http-manual`), listagem individual de cada título IPCA+ encontrado, timing de parse e D1 separados, e stack trace em erros.

## [v01.06.00] — 2026-03-27
### Corrigido
- **Cron Worker CSV Parser**: reescrito `parseCSV` para mapear corretamente as 7 colunas do CSV do Tesouro Transparente (antes mapeava 8 colunas incorretamente, causando dados corrompidos e falha na identificação de títulos IPCA+).
- **Cron Worker Full-Scan**: implementada varredura completa do CSV para identificar a data-base mais recente (dados não são cronologicamente ordenados).

### Adicionado
- **Cron Worker Observability**: logging estruturado (`console.log`/`console.error`) em todo o pipeline do worker (download, parse, upsert) para monitoramento via Cloudflare Observability.

### Melhorado
- **Footer Buttons (UX)**: botões "Contato" e "Enviar por E-mail" agora possuem `box-shadow` para profundidade visual e hover mais intenso (`#1557b0` com glow), melhorando discoverability.

## [v01.05.00] — 2026-03-26
### Alterado
- **E-mail de análise — reescrita completa**: `gerarHtmlRelatorio` agora replica a tela do frontend com inline CSS. Todas as seções: parâmetros (CDI/IPCA/Duration), LCI/LCA (alíquota IR, CDB equivalente, rendimentos, ganho real, benchmark colorido), Tesouro IPCA+ (resumo carteira, MTM com convexidade, lotes individuais com badge VENDER/MANTER, sinal), e análise IA completa (avaliação badge, números-chave, ciladas, recomendação, timing, resumo). Design tiptap.dev com `@media` responsive.
- **Vencimentos cronológicos**: dropdown de vencimentos de títulos IPCA+ ordenado do vencimento mais próximo ao mais distante via `.sort()`.

### Corrigido
- **Lint TypeScript**: corrigidos comparadores de tipo — `benchmarkLci.classe` usava `'bom'` e `'razoavel'` (inexistentes); corrigidos para `'muito-bom'` e `'regular'`. `analiseIa.recomendacao` usava `'INVESTIR'` (inexistente); corrigido para `'MANTER'`.

## [v01.04.00] — 2026-03-26
### Adicionado
- **Formulário de Contato**: botão no rodapé abre modal com formulário (nome, telefone, e-mail, mensagem). Backend `contato.ts` envia via Resend (`oraculo-financeiro@lcv.app.br`). Portado do `mainsite-frontend/ContactModal`.
- **E-mail de Análise**: botão no rodapé abre modal (portado do `astrologo-frontend/EmailModal`). Gera HTML completo com parâmetros, lotes IPCA+, registros LCI/LCA e análise IA. Backend `enviar-email.ts` via Resend.
- **Suporte a PDF no Vision**: drag/drop e file input aceitam `.pdf` além de imagens. Vision worker envia ao Gemini com `application/pdf`, system instruction atualizada.
- **Scroll FABs**: botões flutuantes de Voltar ao topo / Ir ao final (paridade admin-app). Threshold 200px, design tiptap.dev.

### Corrigido
- **Notificações ocultas**: `z-index` de `.notifications` elevado para 101 (acima de `.auth-overlay` z-index: 100).
- **Botão Resgatar Análise**: adicionada borda para paridade visual com demais botões.
- **Lint**: `let` → `const` em `formatPhone`, `analiseIa.texto` → `analiseIa.analise`.
- **500 em `/api/tesouro-ipca`**: self-healing migration — `ALTER TABLE ADD COLUMN vencimento` executa automaticamente na primeira request se a coluna não existir.
- **Labels PDF**: botão "Upload Imagem" → "Upload Imagem/PDF"; hint do drag/drop atualizado para "Anexe um print ou PDF do extrato".

## [v01.03.00] — 2026-03-26
### Adicionado
- **Tesouro Transparente**: Worker `/api/taxa-ipca-atual` reescrito para usar CSV público gratuito do Tesouro Transparente (dados abertos, ~13 MB) com cache D1 (`oraculo_taxa_ipca_cache`). ANBIMA (paga) removida.
- **Force Refresh**: endpoint aceita `?force=true` para bypass do cache (disparo manual via admin-app).
- **Cron Worker**: novo Worker standalone `workers/cron-taxa-ipca/` com Cron Trigger (02:00 BRT / 05:00 UTC) para pré-aquecimento diário do cache.
- **CI/CD Cron**: pipeline `deploy.yml` atualizado para deploy automático do cron worker.
- **Máscaras de Input**: 7 inputs monetários e de taxa convertidos para formato brasileiro (1.234,56) via helpers `formatBRL`/`parseBRL`/`formatTaxa`.
- **Auto-fetch Taxa**: frontend busca taxa IPCA+ indicativa do Tesouro Transparente ao montar componente, com indicador visual (loading/referência).

### Alterado
- **~~MP 2026 (IR)~~** *(corrigido em v01.06.02)*: MP 1.303/25 caducou em outubro/2025 sem conversão em lei. Alíquota fixa de 17,5% nunca entrou em vigor; tabela regressiva (22,5%→15%) permanece vigente.
- **Prompt Vision**: formato brasileiro dd/mm/aaaa explícito, modelo `gemini-3.1-pro-preview`.

## [v01.02.05] — 2026-03-26
### Corrigido
- **Modelo Vision reescrito**: worker `tesouro-ipca-vision.ts` inteiramente refatorado — modelo migrado de `gemini-3-pro-preview` (texto-only, incapaz de processar imagens) para `gemini-2.5-pro-latest` (último Pro com suporte nativo a visão multimodal + thinking). Adicionados retry com 1 tentativa extra, filtro de thought parts, tipagem forte (zero `any`), e alinhamento completo ao padrão de engenharia do `analisar-ia.ts`.
- **Tabela DELETE órfã**: corrigido nome da tabela no `onRequestDelete` de `tesouro-ipca.ts` de `tesouro_ipca_lotes` para `oraculo_tesouro_ipca_lotes` (bug latente que causaria falha silenciosa caso invocado).

## [v01.02.04] — 2026-03-26
### Corrigido
- **API Multimodal Versionamento**: forçado fallback explícito para identificador do modelo `gemini-3-pro-preview` e incluído novo property name das features v1beta (`system_instruction` em detrito do padrão REST original) com o framework `thinkingLevel: "HIGH"` assegurando as 10 modern-features de processamento IA estritas.

## [v01.02.03] — 2026-03-26
### Corrigido
- **Erro 500 no Worker (Vision API)**: substituídas as chamadas do método `Response.json` (incompatível com certas engines locais de Node do Wrangler) pelo utilitário `jsonResponse`, restaurando o fluxo de leitura de extratos no ambiente dev e produção.

## [v01.02.02] — 2026-03-26
### Removido
- **Quality Gates**: removida a configuração estrita do Github Actions (`quality-gates.yml`) que bloqueava merges na branch principal por linting e build, permitindo fluidez de deploy para o app.

## [v01.02.01] — 2026-03-26
### Corrigido
- **UX Drag & Drop Invisível**: injetado banner visual fixo (Feature Banner) na interface do Tesouro Direto, possuindo call-to-action explícito com botão de `Upload Imagem` (input file), sanando a grave falha de discoverability onde a tela exigia um drop às cegas.

## [v01.02.00] — 2026-03-26
### Adicionado
- **API Multimodal (Cloudflare Workers)**: endpoint nativo `/api/tesouro-ipca-vision.ts` implementado para ingerir Base64 do extrato do Tesouro e realizar parser JSON via modelo Gemini 1.5 Pro. Sistema com `responseMimeType: application/json`.
- **Interface Drag & Drop**: adicionada overlay interativa no painel da Marcação a Mercado para recepção instantânea de capturas de tela, extração de texto em OCR cognitivo e preenchimento autômato do lote.

### Alterado
- **Redesign UI/UX Completo**: transição de glassmorphisms pesados para a filosofia sólida `Tiptap.dev` (Google Blue, Pill buttons, Solid Cards 30px radius, fonte Inter).
- **Adequação WCAG/eMAG**: inputs validados para id/name e autocomplete.
- **Migração de Frontend para Admin**: as tabelas de histórico persistente foram deletadas do frontend (`App.tsx`), delegando a leitura e exclusão para a matriz do Admin-app.
- Migração de D1 para `bigdata_db` com prefixação de tabelas (`oraculo_lci_cdb_registros`, `oraculo_auditorias_ia`, `oraculo_tesouro_ipca_lotes`)

### Infra
- `wrangler.json` atualizado para `bigdata_db` (binding `BIGDATA_DB`)
- Versionamento consolidado para `APP v01.02.00` + `package.json` 1.2.0

## [v01.01.00] — 2026-03-22
### Adicionado
- Footer com exibição de versão via APP_VERSION
- Classe CSS `.app-version-footer` em App.css
- Cabeçalho de código em App.tsx e analisar-ia.ts

### Alterado
- Upgrade Gemini API: modelo gemini-3-pro-preview, endpoint v1beta, thinkingLevel HIGH, safetySettings, retry com 1 tentativa extra
- Padronização do sistema de versão para formato APP v00.00.00

## [v01.00.00] — Anterior
### Histórico
- Versão inicial com análise LCI/LCA e Tesouro IPCA+ via IA Gemini
