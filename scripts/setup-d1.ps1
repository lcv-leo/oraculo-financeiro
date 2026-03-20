param(
  [string]$DatabaseName = "financeiro-db",
  [string]$WranglerTomlPath = "wrangler.toml",
  [string]$SchemaPath = "db/001_init.sql",
  [switch]$SkipMigrate
)

$ErrorActionPreference = "Stop"

function Write-Info($Message) {
  Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Ok($Message) {
  Write-Host "[OK] $Message" -ForegroundColor Green
}

if (-not (Test-Path $WranglerTomlPath)) {
  throw "Arquivo '$WranglerTomlPath' não encontrado."
}

if (-not (Test-Path $SchemaPath)) {
  throw "Arquivo de schema '$SchemaPath' não encontrado."
}

Write-Info "Criando D1 '$DatabaseName' com wrangler latest..."
$createOutput = & npx --yes wrangler@latest d1 create $DatabaseName --binding FINANCEIRO_DB --update-config 2>&1 | Out-String

if ($LASTEXITCODE -ne 0) {
  if ($createOutput -match 'already exists|already configured|already has') {
    Write-Info "Banco já existe. Prosseguindo com migração e validação de config..."
  }
  else {
    Write-Host $createOutput
    throw "Falha ao criar D1 '$DatabaseName'."
  }
}

$wranglerContent = Get-Content $WranglerTomlPath -Raw
if ($wranglerContent -match 'database_id\s*=\s*"REPLACE_WITH_D1_DATABASE_ID"') {
  Write-Host ""
  Write-Host "[ATENÇÃO] O database_id ainda está como placeholder em wrangler.toml." -ForegroundColor Yellow
  Write-Host "Execute manualmente 'npx wrangler d1 create financeiro-db --binding FINANCEIRO_DB --update-config' e confirme alteração." -ForegroundColor Yellow
}
else {
  Write-Ok "wrangler.toml atualizado com database_id válido."
}

if (-not $SkipMigrate) {
  Write-Info "Aplicando schema remoto em '$DatabaseName'..."
  & npx --yes wrangler@latest d1 execute $DatabaseName --remote --file $SchemaPath
  Write-Ok "Schema aplicado com sucesso."
}
else {
  Write-Info "Migração ignorada via -SkipMigrate."
}

Write-Host ""
Write-Ok "Bootstrap D1 concluído."
Write-Host "Próximos passos:" -ForegroundColor Yellow
Write-Host "  1) Confirmar o binding FINANCEIRO_DB no painel Cloudflare Pages" -ForegroundColor Yellow
Write-Host "  2) Commitar alteração do wrangler.toml" -ForegroundColor Yellow
