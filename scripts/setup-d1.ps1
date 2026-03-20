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

function Get-DatabaseIdFromWranglerJson($rawOutput) {
  $lines = $rawOutput -split "`r?`n"

  # Tenta pegar última linha JSON válida
  for ($i = $lines.Length - 1; $i -ge 0; $i--) {
    $line = $lines[$i].Trim()
    if ([string]::IsNullOrWhiteSpace($line)) { continue }

    try {
      $obj = $line | ConvertFrom-Json
      if ($obj.uuid) { return [string]$obj.uuid }
      if ($obj.database_id) { return [string]$obj.database_id }
      if ($obj.result.uuid) { return [string]$obj.result.uuid }
      if ($obj.result.database_id) { return [string]$obj.result.database_id }
    }
    catch {
      continue
    }
  }

  return $null
}

if (-not (Test-Path $WranglerTomlPath)) {
  throw "Arquivo '$WranglerTomlPath' não encontrado."
}

if (-not (Test-Path $SchemaPath)) {
  throw "Arquivo de schema '$SchemaPath' não encontrado."
}

Write-Info "Criando D1 '$DatabaseName' com wrangler latest..."
$createOutput = & npx --yes wrangler@latest d1 create $DatabaseName --json 2>&1 | Out-String

$databaseId = Get-DatabaseIdFromWranglerJson $createOutput
if (-not $databaseId) {
  Write-Host $createOutput
  throw "Não foi possível extrair o database_id/uuid do retorno do Wrangler."
}

Write-Ok "D1 criada. database_id = $databaseId"

Write-Info "Atualizando '$WranglerTomlPath'..."
$wranglerContent = Get-Content $WranglerTomlPath -Raw

if ($wranglerContent -match 'database_id\s*=\s*"REPLACE_WITH_D1_DATABASE_ID"') {
  $wranglerContent = $wranglerContent -replace 'database_id\s*=\s*"REPLACE_WITH_D1_DATABASE_ID"', "database_id = `"$databaseId`""
}
else {
  # fallback: substitui qualquer database_id existente
  $wranglerContent = $wranglerContent -replace 'database_id\s*=\s*"[^"]*"', "database_id = `"$databaseId`""
}

Set-Content -Path $WranglerTomlPath -Value $wranglerContent -Encoding UTF8
Write-Ok "wrangler.toml atualizado com database_id."

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
