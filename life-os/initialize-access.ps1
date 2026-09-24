# Recovery first. Reset is explicit and changes only DASHBOARD_PASSWORD.
param([switch]$ResetPassword)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'credentials.ps1')
try {
    $path = Get-LifeOsCredentialPath
    $pending = $path + '.pending'
    $credential = $null
    foreach ($candidate in (@($path, $pending) + @(Get-LifeOsRecoveryPaths))) {
        if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
        try {
            $existing = Read-LifeOsCredential -Path $candidate
            Assert-LifeOsAuthentication -Credential $existing
            $credential = $existing
            break
        } catch {
            Write-Host ('Could not verify existing credential at ' + $candidate + '; leaving it unchanged.')
        }
    }
    if ($credential) {
        Save-LifeOsCredential -Credential $credential -Path $path
        Write-Output 'Recovered the existing verified dashboard password. Cloudflare was not changed.'
    } elseif (-not $ResetPassword) {
        Write-Host 'Cloudflare secret values cannot be downloaded. Enter the existing dashboard password from your password manager or original machine.'
        $password = Read-Host 'Existing dashboard password (hidden input)' -AsSecureString
        $credential = [System.Management.Automation.PSCredential]::new('lantern', $password)
        if ($password.Length -lt 24) { throw 'The dashboard password must contain at least 24 characters. Nothing changed.' }
        Assert-LifeOsAuthentication -Credential $credential
        Save-LifeOsCredential -Credential $credential -Path $path
        Write-Output 'Imported the existing verified password. Cloudflare was not changed.'
    } else {
        # Retain a pending encrypted copy before a network operation can change the server.
        # Rerunning this script first checks whether that candidate already authenticates.
        $credential = Read-LifeOsCredential -Path $pending
        if (-not $credential) { $credential = New-LifeOsCredential }
        Save-LifeOsCredential -Credential $credential -Path $pending
        Set-LifeOsCloudPassword -Credential $credential
        Assert-LifeOsAuthentication -Credential $credential
        Save-LifeOsCredential -Credential $credential -Path $path
        Write-Output 'Reset only the Cloudflare dashboard password and verified it. Ingestion and webhook credentials were not changed.'
    }
    # A pending copy is no longer needed only after verified canonical persistence succeeds.
    if (Test-Path -LiteralPath $pending) { Remove-Item -LiteralPath $pending -Force }
    Write-Output ('Encrypted dashboard credential: ' + $path)
    Write-Output 'Username: lantern'
    Write-Output ('Copy the verified password: powershell.exe -NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'access.ps1') + '" -CopyPassword')
} catch {
    Write-Host $_.Exception.Message
    Write-Host 'Existing credentials were not deleted. If a cloud update was attempted, keep the encrypted .pending file and rerun initialization to recover.'
    exit 1
}
