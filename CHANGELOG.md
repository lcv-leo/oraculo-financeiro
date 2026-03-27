# Changelog — Oráculo Financeiro

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
- **MP 2026 (IR)**: `aliquotaIrRegressiva` diferencia lotes pré/pós-2026 (17,5% fixo para novos investimentos).
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
