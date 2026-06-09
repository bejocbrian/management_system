# deploy-web.ps1
# Builds the frontend and deploys to Hostinger via SCP
# Run from repo root: .\deploy-web.ps1

$ErrorActionPreference = "Stop"

Write-Host "Building frontend..." -ForegroundColor Cyan
$env:VITE_API_URL = "https://maroon-eland-586562.hostingersite.com"
Set-Location apps/web
pnpm run build
Set-Location ../..

Write-Host "Deploying to Hostinger..." -ForegroundColor Cyan
scp -P 65002 -r apps/web/dist/* u853826912@82.112.239.205:/home/u853826912/domains/powderblue-caterpillar-585125.hostingersite.com/public_html/

Write-Host "Done! Frontend deployed." -ForegroundColor Green
