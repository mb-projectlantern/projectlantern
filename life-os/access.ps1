# Run locally as the Windows user who deployed the POC. No secrets are in this file.
param([switch]$CopyPassword)
$ErrorActionPreference = 'Stop'
$secretFile = Join-Path $env:LOCALAPPDATA 'ProjectLantern\life-os-secrets.xml'
$protectedValues = Import-Clixml -LiteralPath $secretFile
$dashboardUser = [Net.NetworkCredential]::new('', $protectedValues['DASHBOARD_USER']).Password
$dashboardPassword = [Net.NetworkCredential]::new('', $protectedValues['DASHBOARD_PASSWORD']).Password
Write-Output 'Dashboard: https://project-lantern-life-os-poc.mb-projectlantern.workers.dev/life-os/'
Write-Output ('Username: ' + $dashboardUser)
if ($CopyPassword) {
    Set-Clipboard -Value $dashboardPassword
    Write-Output 'Password copied to your clipboard. Paste it into the dashboard browser login; clear your clipboard afterward.'
} else {
    Write-Output 'Run this script with -CopyPassword to copy only the dashboard password to your clipboard.'
}
