# No permanent execution-policy change is needed; see LIFE_OS_POC.md.
param([switch]$CopyPassword)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'credentials.ps1')
try {
    $secretFile = Get-LifeOsCredentialPath
    $credential = Read-LifeOsCredential -Path $secretFile
    if (-not $credential) {
        foreach ($candidate in (Get-LifeOsRecoveryPaths)) {
            if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
            try {
                $credential = Read-LifeOsCredential -Path $candidate
                Assert-LifeOsAuthentication -Credential $credential
                $secretFile = $candidate
                break
            } catch { $credential = $null }
        }
    }
    if (-not $credential) {
        throw "No local dashboard credential was found for '$([Security.Principal.WindowsIdentity]::GetCurrent().Name)'. Expected '$secretFile'."
    }
    Assert-LifeOsAuthentication -Credential $credential
    Write-Output ('Dashboard: ' + $script:LifeOsDashboard)
    Write-Output 'Username: lantern'
    Write-Output ('Encrypted credential: ' + $secretFile)
    Write-Output 'Verified: this password authenticated to the deployed dashboard (HTTP 200).'
    if ($CopyPassword) {
        Copy-LifeOsPassword -Credential $credential
        Write-Output 'Password copied. Paste into the browser login, then clear your clipboard. Clipboard history/sync may retain copied passwords.'
    } else {
        Write-Output 'Add -CopyPassword to copy the verified dashboard password.'
    }
} catch {
    Write-Host $_.Exception.Message
    Write-Host 'Recover or initialize dashboard access (does not reset the password by default):'
    Write-Host ('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'initialize-access.ps1') + '"')
    exit 1
}
