# deploy-web.ps1
# Builds the frontend and deploys to Hostinger via SCP
# Run from repo root: .\deploy-web.ps1

$ErrorActionPreference = "Stop"

$SSH_USER = "u853826912"
$SSH_HOST = "82.112.239.205"
$SSH_PORT = "65002"
$REMOTE_PATH = "/home/u853826912/domains/powderblue-caterpillar-585125.hostingersite.com/public_html/"
$DIST_PATH = "apps/web/dist"

Write-Host "Building frontend..." -ForegroundColor Cyan
$env:VITE_API_URL = "https://maroon-eland-586562.hostingersite.com"
Set-Location apps/web
pnpm run build
Set-Location ../..

Write-Host "Deploying to Hostinger..." -ForegroundColor Cyan

# Deploy the whole dist directory (scp -r on the folder itself avoids glob skipping dotfiles like .htaccess)
scp -P $SSH_PORT -r "${DIST_PATH}/." "${SSH_USER}@${SSH_HOST}:${REMOTE_PATH}"

Write-Host "Verifying .htaccess was uploaded..." -ForegroundColor Cyan
ssh -p $SSH_PORT "${SSH_USER}@${SSH_HOST}" "ls -la ${REMOTE_PATH}.htaccess && echo '.htaccess OK' || echo 'WARNING: .htaccess missing!'"

Write-Host "Done! Frontend deployed." -ForegroundColor Green
