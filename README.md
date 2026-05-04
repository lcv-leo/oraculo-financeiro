<p align="center">
  <img src=".github/assets/lcv-ideas-software-logo.svg" alt="LCV Ideas &amp; Software" width="520" />
</p>

# oraculo-financeiro

[![status: stable](https://img.shields.io/badge/status-stable-brightgreen.svg)](#status)
[![version](https://img.shields.io/github/v/release/LCV-Ideas-Software/oraculo-financeiro.svg)](https://github.com/LCV-Ideas-Software/oraculo-financeiro/releases)
[![runtime: Cloudflare Pages](https://img.shields.io/badge/runtime-Cloudflare%20Pages-orange.svg)](https://pages.cloudflare.com/)
[![framework: React 19 + Vite 8](https://img.shields.io/badge/framework-React%2019%20%2B%20Vite%208-61dafb.svg)](https://react.dev/)
[![license: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)

**Oráculo Financeiro** — dashboard de análise financeira focado em renda fixa indexada à inflação (LCI/CDB com IPCA+, Tesouro IPCA+ etc.) com análise contextual via Gemini AI. React 19 + Vite 8 sobre Cloudflare Pages com D1 backing store + Cron Worker auxiliar para pre-warming de cache de taxa.

**Status.** Stable. Current release: **v01.10.03**. See [CHANGELOG.md](./CHANGELOG.md) for the full release history.

The version history at a glance:

| Release | Scope |
|---|---|
| **`v01.10.03`** | **README organizational standardization.** Adopted the shared repository README opening pattern, corrected public release and clone links to the organization, surfaced the top-level version-history table, and kept the GitHub Sponsors link on `lcv-leo` by explicit beneficiary decision. |
| **`v01.10.02`** | **Pages modernization.** Migrated fully to the current GitHub Pages artifact-deployment model and enabled idempotent Pages setup for fresh clones/forks. |
| **`v01.10.01`** | **Public flip prep.** Finalized repo-publication hygiene, D1 placeholder injection, Cron trigger versioning, bootstrap consistency, and parser-based HTML sanitization. |
| **`v01.10.00`** | **Critical runtime fixes.** Fixed same-origin GET origin handling, stabilized JSON error responses in auth handlers, and improved public endpoint resilience. |

## What it does

Aplicação para analisar e comparar produtos de renda fixa atrelados ao IPCA:

1. **Coleta**: usuário registra LCIs/CDBs (taxa de juro real + vencimento + emissor + valor) e/ou consulta o Tesouro Direto.
2. **Cálculo determinístico** (`functions/api/registros-lci-cdb.ts`, `functions/api/tesouro-ipca.ts`): cálculo de rentabilidade real, projeção até vencimento usando IPCA atual.
3. **Análise por IA** (`functions/api/analisar-ia.ts`, `functions/api/auditorias-ia.ts`): Gemini 2.5 Pro recebe os números calculados + contexto macro e produz insights executivos sem invenção.
4. **Cache + auditoria**: D1 mantém cache de taxa IPCA + registros do usuário + log de auditorias IA.
5. **Cron Worker** (`workers/taxaipca-motor`): pre-warm diário (02h BRT) de cache IPCA+ a partir do CSV do Tesouro Transparente, garantindo que requests síncronos não dependam de fetch live.

Funcionalidades adicionais:
- **Auth opcional** (`oraculo-auth.ts`): resgate por e-mail/código para recuperar registros previamente salvos.
- **Compartilhamento via e-mail** (`enviar-email.ts`) com sanitização parser-based (sanitize-html).
- **Rate limiting por D1** (`_shared/security.ts`): proteção contra abuso de endpoints públicos.

## Architecture

```
Browser -> Cloudflare Pages (React build)
                |
                v
       client-side fetch to /api/*
                |
                v
   Cloudflare Pages Functions (functions/api/*)
                |                       |
                v                       v
            D1: BIGDATA_DB        External APIs:
            (oraculo_*            - Tesouro Transparente CSV
             tables: registros,   - Gemini AI
             auditorias, cache,
             rate limit, sessões)
                ^
                |
       Cloudflare Worker (cron)
       workers/taxaipca-motor
       (pre-warm cache 02h BRT)
```

## Deploy your own fork

You will need:
- A Cloudflare account ([free tier](https://www.cloudflare.com/plans/)) with Pages + D1 + Workers enabled.
- The Cloudflare CLI [`wrangler`](https://developers.cloudflare.com/workers/wrangler/).
- Node.js 22+.
- A Google AI Studio API key for Gemini integration.

### 1. Clone + install

```bash
git clone https://github.com/LCV-Ideas-Software/oraculo-financeiro.git
cd oraculo-financeiro
npm ci
```

### 2. Create your D1 database

```bash
npx wrangler d1 create bigdata_db
# wrangler outputs:
#   database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 3. Wire the database_id into both wrangler.json files

Replace the placeholder `00000000-0000-0000-0000-000000000000` in:
- `wrangler.json` (Pages app at root)
- `workers/taxaipca-motor/wrangler.json` (Cron Worker — same D1 binding)

```jsonc
{
  "d1_databases": [
    {
      "binding": "BIGDATA_DB",
      "database_name": "bigdata_db",
      "database_id": "<your-d1-id-from-step-2>"
    }
  ]
}
```

There is also a helper script `npm run d1:setup` that automates wrangler.json mutation + schema apply for fresh forks.

### 4. Apply schema

```bash
npx wrangler d1 execute bigdata_db --remote --file db/001_init.sql
npx wrangler d1 execute bigdata_db --remote --file db/002_tesouro_ipca_lotes.sql
```

Or run `npm run d1:setup` which wraps both.

### 5. Configure secrets

```bash
npx wrangler secret put GEMINI_API_KEY --env production
npx wrangler secret put RESEND_APPKEY --env production  # only if using email feature
```

### 6. Build + deploy

```bash
npm run build
npx wrangler pages deploy dist --project-name=oraculo-financeiro
npx wrangler deploy --config workers/taxaipca-motor/wrangler.json
```

The Pages app and the Cron Worker are deployed independently but share the same D1 binding.

## CI deploy (this repo)

This repo's [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on every push to `main`. Steps: setup-node 24 → npm install + build → `jq` substitution to inject `D1_DATABASE_ID` from secret into BOTH `wrangler.json` files (root + `workers/taxaipca-motor/`) → `wrangler pages deploy` (Pages) → `wrangler deploy --config workers/taxaipca-motor/wrangler.json` (Cron Worker). Real D1 ID kept out of git, lives only as a GitHub Actions secret.

## Repository conventions

- **License**: [AGPL-3.0-or-later](./LICENSE). Network-service trigger applies — running a modified fork as a public service obligates you to publish modifications. See AGPL §13 source-offer below.
- **Security disclosure**: see [SECURITY.md](./SECURITY.md).
- **Changelog**: [CHANGELOG.md](./CHANGELOG.md).
- **Sponsorship**: see the repo's `Sponsor` button or [GitHub Sponsors profile](https://github.com/sponsors/LCV-Ideas-Software).
- **Action pinning**: all GitHub Actions are pinned by full SHA per supply-chain hardening baseline.
- **Code owners**: [.github/CODEOWNERS](./.github/CODEOWNERS).

## License

Copyright (C) 2026 Leonardo Cardozo Vargas.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY. See the GNU Affero General Public License for more details. The full license text is at [LICENSE](./LICENSE).

### AGPL §13 source-offer (operators of public deployments)

If you operate a modified copy of this app as a publicly-accessible network service, AGPL-3.0 §13 obligates you to make the corresponding source code available to your remote users. Comply via:

- A "Source" link in the app's footer pointing to your fork's repository URL.
- A `GET /source` route in `functions/api/` returning your fork's URL as `text/plain`.

If you only deploy this app for your own infrastructure (no external users), §13 does not apply.

---

<p align="center"><sub>© LCV Ideas &amp; Software<br>LEONARDO CARDOZO VARGAS TECNOLOGIA DA INFORMACAO LTDA<br>Rua Pais Leme, 215 Conj 1713  - Pinheiros<br>São Paulo - SP<br>CEP 05.424-150<br>CNPJ: 66.584.678/0001-77<br>IM 05.424-150</sub></p>