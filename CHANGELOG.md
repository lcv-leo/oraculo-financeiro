# Changelog — Oráculo Financeiro

## [v01.02.00] — 2026-03-24
### Alterado
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
- Upgrade Gemini API: modelo gemini-pro-latest, endpoint v1beta, thinkingLevel HIGH, safetySettings, retry com 1 tentativa extra
- Padronização do sistema de versão para formato APP v00.00.00

## [v01.00.00] — Anterior
### Histórico
- Versão inicial com análise LCI/LCA e Tesouro IPCA+ via IA Gemini
