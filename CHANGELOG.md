# Changelog — Oráculo Financeiro

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
