# Dashboard-only credential helpers. Compatible with Windows PowerShell 5.1.
# Never print a SecureString, password, or Authorization header.
$script:LifeOsDashboard = 'https://project-lantern-life-os-poc.mb-projectlantern.workers.dev/life-os/'

function Get-LifeOsCredentialPath {
    # AppData can be redirected into an MSIX package's LocalCache. Use a shared
    # user-profile location visible to both packaged Codex and ordinary terminals.
    $profileDirectory = [Environment]::GetFolderPath('UserProfile')
    if (-not $profileDirectory) { throw 'Windows could not resolve the current user profile.' }
    Join-Path $profileDirectory '.projectlantern\dashboard-credential.xml'
}

function Get-LifeOsLegacyPath {
    Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ProjectLantern\life-os-secrets.xml'
}

function Get-LifeOsRecoveryPaths {
    $localDirectory = [Environment]::GetFolderPath('LocalApplicationData')
    Join-Path $localDirectory 'ProjectLantern\dashboard-credential.xml'
    Join-Path $localDirectory 'ProjectLantern\dashboard-credential.xml.pending'
    Get-LifeOsLegacyPath
    # Ordinary PowerShell must inspect the physical location of files that the
    # packaged app previously wrote through a redirected AppData path.
    $packages = Join-Path $localDirectory 'Packages'
    if (Test-Path -LiteralPath $packages -PathType Container) {
        foreach ($package in (Get-ChildItem -LiteralPath $packages -Directory -Filter 'OpenAI.Codex_*' -ErrorAction SilentlyContinue)) {
            foreach ($name in @('dashboard-credential.xml', 'dashboard-credential.xml.pending', 'life-os-secrets.xml')) {
                Join-Path $package.FullName ('LocalCache\Local\ProjectLantern\' + $name)
            }
        }
    }
}

function Read-LifeOsCredential {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    try {
        $stored = Import-Clixml -LiteralPath $Path -ErrorAction Stop
        if ($stored -is [System.Management.Automation.PSCredential]) {
            $credential = $stored
        } elseif ($stored -is [System.Collections.IDictionary] -and
                  $stored['DASHBOARD_USER'] -is [Security.SecureString] -and
                  $stored['DASHBOARD_PASSWORD'] -is [Security.SecureString]) {
            # Recover only the dashboard credential from the original deployment file.
            $user = [Net.NetworkCredential]::new('', $stored['DASHBOARD_USER']).Password
            $credential = [System.Management.Automation.PSCredential]::new($user, $stored['DASHBOARD_PASSWORD'])
        } else { throw 'Invalid credential format' }
        if ($credential.UserName -ne 'lantern' -or $credential.Password.Length -lt 24) { throw 'Invalid dashboard credential' }
        # Force DPAPI decryption now, so failure is caught before clipboard/network use.
        if ($credential.GetNetworkCredential().Password.Length -lt 24) { throw 'Invalid password' }
        return $credential
    } catch {
        throw "Cannot decrypt or read the dashboard credential at '$Path'. Use the same Windows user and machine that saved it, or run initialize-access.ps1 to import your existing dashboard password. No credential was changed."
    }
}

function Assert-LifeOsAuthentication {
    param([System.Management.Automation.PSCredential]$Credential)
    $authorization = $null
    try {
        # TLS 1.2 is needed on older Windows PowerShell configurations; no policy change.
        [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
        $authorization = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(
            $Credential.UserName + ':' + $Credential.GetNetworkCredential().Password))
        $response = Invoke-WebRequest -Uri $script:LifeOsDashboard -Headers @{ Authorization = 'Basic ' + $authorization } -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 20 -ErrorAction Stop
        if ([int]$response.StatusCode -ne 200 -or $response.Content -notmatch 'LIFE OS') {
            throw 'Unexpected dashboard response'
        }
    } catch {
        # Do not include underlying exceptions that could include request metadata.
        throw 'Dashboard verification failed. Check your network and the deployed dashboard credential. No password was copied. Run initialize-access.ps1 to recover/import a known password; use -ResetPassword only when recovery is impossible.'
    } finally { $authorization = $null }
}

function Save-LifeOsCredential {
    param([System.Management.Automation.PSCredential]$Credential, [string]$Path)
    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $directory -Force -ErrorAction Stop | Out-Null
    $temporary = Join-Path $directory ('dashboard-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    try {
        $Credential | Export-Clixml -LiteralPath $temporary -ErrorAction Stop
        # Verify the encrypted file is readable before replacing a previous copy.
        $roundTrip = Read-LifeOsCredential -Path $temporary
        if ($roundTrip.GetNetworkCredential().Password -cne $Credential.GetNetworkCredential().Password) { throw 'Credential round-trip failed' }
        Move-Item -LiteralPath $temporary -Destination $Path -Force -ErrorAction Stop
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
}

function New-LifeOsCredential {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $password = [Convert]::ToBase64String($bytes)
    [System.Management.Automation.PSCredential]::new('lantern', (ConvertTo-SecureString $password -AsPlainText -Force))
}

function Set-LifeOsCloudPassword {
    param([System.Management.Automation.PSCredential]$Credential)
    $repo = Split-Path -Parent $PSScriptRoot
    $wrangler = Join-Path $repo 'node_modules\wrangler\bin\wrangler.js'
    $config = Join-Path $repo 'wrangler.jsonc'
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node -or -not (Test-Path -LiteralPath $wrangler)) {
        throw 'Password reset requires Node and the pinned Wrangler dependency. Install dependencies with pnpm install --frozen-lockfile, then run pnpm exec wrangler login.'
    }
    # Do not send the candidate until the existing dashboard secret names are confirmed.
    $listing = & $node.Source $wrangler secret list --config $config 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect Cloudflare secrets. Sign in with Wrangler before resetting the dashboard password.' }
    try { $names = @((($listing -join "`n") | ConvertFrom-Json).name) } catch { throw 'Could not validate Cloudflare secret configuration; nothing changed.' }
    if ('DASHBOARD_USER' -notin $names -or 'DASHBOARD_PASSWORD' -notin $names) {
        throw 'Expected existing dashboard secrets are missing. Complete initial Worker setup before using password recovery.'
    }
    # Only this dashboard secret is updated. Never bulk-replace secrets or deploy code.
    # Password goes over stdin, not an argument or a plaintext file. Suppress CLI output.
    $null = $Credential.GetNetworkCredential().Password | & $node.Source $wrangler secret put DASHBOARD_PASSWORD --config $config 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Cloudflare password update did not complete. The encrypted pending credential was retained for recovery.' }
}

function Copy-LifeOsPassword {
    param([System.Management.Automation.PSCredential]$Credential)
    Set-Clipboard -Value $Credential.GetNetworkCredential().Password -ErrorAction Stop
}
