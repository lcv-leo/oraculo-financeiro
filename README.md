# Oráculo Financeiro

Reconstrução do app **Oráculo Edge Analytics** com:

- Vite + React + TypeScript (versões mais recentes)
- UI em padrão **Glassmorphism + Material Design 3**
- 2 abas ativas:
  - `LCI/CDB IPCA+`
  - `Auditoria IA`
- Persistência real em **Cloudflare D1** (database: `bigdata_db`)
- Deploy automático via GitHub Actions

## Convenção de branch

- GitHub: `main`
- Cloudflare Pages (produção): `production`

## Banco D1

Arquivo de schema:

- `db/001_init.sql`

Configuração do binding:

- `wrangler.toml`
- binding: `BIGDATA_DB`
- database_name: `bigdata_db`

O `database_id` já está versionado no `wrangler.toml` para a base `bigdata_db`.

### Script automatizado (Windows/PowerShell)

Bootstrap completo da D1 `bigdata_db` (criação + atualização do `wrangler.toml` + migração):

```bash
npm run d1:setup
```

Somente aplicar schema remoto novamente:

```bash
npm run d1:migrate
```

Se quiser pular migração no bootstrap:

```powershell
pwsh -ExecutionPolicy Bypass -File ./scripts/setup-d1.ps1 -SkipMigrate
```

## Endpoints (Pages Functions)

- `GET /api/registros-lci-cdb`
- `POST /api/registros-lci-cdb`
- `GET /api/auditorias-ia`
- `POST /api/auditorias-ia`

Arquivos:

- `functions/api/registros-lci-cdb.ts`
- `functions/api/auditorias-ia.ts`

## Desenvolvimento local

Instalar dependências:

```bash
npm install
```

Rodar em dev:

```bash
npm run dev
```

Build de produção:

```bash
npm run build
```

## Deploy automático (GitHub Actions)

Workflow:

- `.github/workflows/deploy.yml`

Secrets necessários no GitHub:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Variable recomendada no GitHub (Actions → Variables):

- `APP_BASE_URL` (ex.: `https://oraculo-financeiro.lcv.app.br`)

> Se `APP_BASE_URL` não estiver definida, o workflow usa fallback para `https://oraculo-financeiro.lcv.app.br`.

Fluxo:

1. Push em `main`
2. Quality gate (lint + build)
3. Deploy no Cloudflare Pages com branch de destino `production`
4. Health-check pós deploy dos endpoints da API
