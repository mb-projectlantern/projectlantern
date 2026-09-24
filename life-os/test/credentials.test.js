// Only local credential workflow tests. No live Cloudflare/GitHub calls or clipboard writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const windows = process.platform === 'win32';
function scenario(setup, action) {
  const dir = mkdtempSync(join(tmpdir(), 'life-os-credentials-'));
  const quote = value => "'" + value.replaceAll("'", "''") + "'";
  try {
    for (const name of ['access.ps1', 'initialize-access.ps1']) {
      writeFileSync(join(dir, name), readFileSync(new URL('../' + name, import.meta.url)));
    }
    mkdirSync(join(dir, 'data'));
    const helpers = readFileSync(new URL('../credentials.ps1', import.meta.url), 'utf8');
    // Mock only outside boundaries. Parsing, DPAPI, persistence, initialization and
    // access control flow are the real code, executed by Windows PowerShell 5.1.
    const mocks = `
function Get-LifeOsCredentialPath { Join-Path $PSScriptRoot 'data\\dashboard.xml' }
function Get-LifeOsLegacyPath { Join-Path $PSScriptRoot 'data\\legacy.xml' }
function Get-LifeOsRecoveryPaths {
  Get-LifeOsLegacyPath
  Join-Path $PSScriptRoot 'package-cache\\dashboard.xml'
}
function Invoke-WebRequest {
  param($Uri, $Headers, [switch]$UseBasicParsing, $MaximumRedirection, $TimeoutSec, $ErrorAction)
  $expected = Import-Clixml (Join-Path $PSScriptRoot 'expected.xml')
  $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Headers.Authorization.Substring(6)))
  if ($decoded -cne ('lantern:' + $expected.GetNetworkCredential().Password)) { throw 'HTTP 401' }
  if ($Uri -ne 'https://project-lantern-life-os-poc.mb-projectlantern.workers.dev/life-os/' -or $MaximumRedirection -ne 0) { throw 'Wrong verification destination' }
  @{StatusCode=200; Content='<h1>LIFE OS</h1>'}
}
function Set-Clipboard {
  param($Value, $ErrorAction)
  $expected = Import-Clixml (Join-Path $PSScriptRoot 'expected.xml')
  if ($Value -cne $expected.GetNetworkCredential().Password) { throw 'Wrong copied password' }
  Set-Content (Join-Path $PSScriptRoot 'copied.txt') 'MATCH'
}
function Read-Host {
  param($Prompt, [switch]$AsSecureString)
  (Import-Clixml (Join-Path $PSScriptRoot 'expected.xml')).Password
}
function Set-LifeOsCloudPassword {
  param([System.Management.Automation.PSCredential]$Credential)
  if (-not (Test-Path ((Get-LifeOsCredentialPath) + '.pending'))) { throw 'Missing recovery copy before remote change' }
  $Credential | Export-Clixml (Join-Path $PSScriptRoot 'expected.xml')
  Add-Content (Join-Path $PSScriptRoot 'updates.txt') 'DASHBOARD_PASSWORD'
  if (Test-Path (Join-Path $PSScriptRoot 'interrupt.txt')) { throw 'Simulated interruption after remote update' }
}
`;
    writeFileSync(join(dir, 'credentials.ps1'), helpers + mocks);
    writeFileSync(join(dir, 'run.ps1'), `
$ErrorActionPreference='Stop'
. ${quote(join(dir, 'credentials.ps1'))}
$fixture = [System.Management.Automation.PSCredential]::new('lantern', (ConvertTo-SecureString 'TEST-ONLY-local-credential-1234567890' -AsPlainText -Force))
$fixture | Export-Clixml ${quote(join(dir, 'expected.xml'))}
${setup}
${action}
if ($LASTEXITCODE) { exit $LASTEXITCODE }
`);
    const childEnv = {...process.env};
    // Node launched from pwsh inherits PS7 module paths; PS5 cannot load those modules.
    for (const key of Object.keys(childEnv)) if (key.toLowerCase() === 'psmodulepath') delete childEnv[key];
    childEnv.PSModulePath = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'Modules');
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(dir, 'run.ps1')], { encoding:'utf8', timeout:30000, env:childEnv });
    const output = result.stdout + result.stderr;
    assert.doesNotMatch(output, /TEST-ONLY-local-credential-1234567890/);
    return { status: result.status, output, read: name => {
      try { return readFileSync(join(dir, name), 'utf8'); } catch { return null; }
    }, cleanup: () => rmSync(dir, {recursive:true,force:true}) };
  } catch (error) { rmSync(dir, {recursive:true,force:true}); throw error; }
}
function check(setup, action, assertions) {
  const r = scenario(setup, action);
  try { assertions(r); } finally { r.cleanup(); }
}
test('missing credential gives initialization command, never a raw Import-Clixml crash', {skip:!windows}, () => {
  check('', '& (Join-Path $PSScriptRoot "access.ps1") -CopyPassword', r => {
    assert.equal(r.status,1); assert.match(r.output,/initialize-access.ps1/);
    assert.doesNotMatch(r.output,/DirectoryNotFoundException|Import-Clixml :/);
    assert.equal(r.read('copied.txt'),null); assert.equal(r.read('updates.txt'),null);
  });
});
test('bootstrap recovers legacy password into dashboard-only encrypted file without cloud update', {skip:!windows}, () => {
  check(`@{DASHBOARD_USER=(ConvertTo-SecureString 'lantern' -AsPlainText -Force);DASHBOARD_PASSWORD=$fixture.Password;INGEST_TOKEN='fixture-not-to-copy'} | Export-Clixml (Get-LifeOsLegacyPath)`, `
& (Join-Path $PSScriptRoot 'initialize-access.ps1')
& (Join-Path $PSScriptRoot 'access.ps1') -CopyPassword
`, r => {
    assert.equal(r.status,0,r.output); assert.match(r.output,/Recovered the existing/);
    assert.equal(r.read('copied.txt').trim(),'MATCH'); assert.equal(r.read('updates.txt'),null);
    assert.doesNotMatch(r.read('data/dashboard.xml'),/TEST-ONLY|INGEST_TOKEN|fixture-not-to-copy/);
  });
});
test('fresh machine securely imports known deployed password and creates missing directory', {skip:!windows}, () => {
  check(`Remove-Item -LiteralPath (Join-Path $PSScriptRoot 'data')`, `
& (Join-Path $PSScriptRoot 'initialize-access.ps1')
& (Join-Path $PSScriptRoot 'access.ps1') -CopyPassword
`, r => {
    assert.equal(r.status,0,r.output); assert.match(r.output,/Imported the existing verified/);
    assert.equal(r.read('copied.txt').trim(),'MATCH'); assert.equal(r.read('updates.txt'),null);
  });
});
test('packaged-app credential is recovered when ordinary AppData files are absent', {skip:!windows}, () => {
  check(`Save-LifeOsCredential -Credential $fixture -Path (Join-Path $PSScriptRoot 'package-cache\\dashboard.xml')`, `
& (Join-Path $PSScriptRoot 'access.ps1') -CopyPassword
& (Join-Path $PSScriptRoot 'initialize-access.ps1')
& (Join-Path $PSScriptRoot 'access.ps1') -CopyPassword
`, r => {
    assert.equal(r.status,0,r.output); assert.match(r.output,/Recovered the existing/);
    assert.equal(r.read('copied.txt').trim(),'MATCH'); assert.equal(r.read('updates.txt'),null);
    assert.ok(r.read('data/dashboard.xml')); assert.equal(r.read('data/legacy.xml'),null);
  });
});
test('wrong deployed password is never copied or silently rotated', {skip:!windows}, () => {
  check(`Save-LifeOsCredential -Credential (New-LifeOsCredential) -Path (Get-LifeOsCredentialPath)`, `& (Join-Path $PSScriptRoot 'access.ps1') -CopyPassword`, r => {
    assert.equal(r.status,1); assert.match(r.output,/Dashboard verification failed/);
    assert.equal(r.read('copied.txt'),null); assert.equal(r.read('updates.txt'),null);
  });
});
test('corrupt local credential reports recovery and initialization can recover legacy', {skip:!windows}, () => {
  check(`Set-Content (Get-LifeOsCredentialPath) 'broken'; Save-LifeOsCredential -Credential $fixture -Path (Get-LifeOsLegacyPath)`, `
& (Join-Path $PSScriptRoot 'initialize-access.ps1')
& (Join-Path $PSScriptRoot 'access.ps1') -CopyPassword
`, r => {
    assert.equal(r.status,0,r.output); assert.equal(r.read('copied.txt').trim(),'MATCH');
    assert.equal(r.read('updates.txt'),null);
  });
});
test('explicit reset stores pending password before remote update, verifies it and copies same value', {skip:!windows}, () => {
  check('', `
& (Join-Path $PSScriptRoot 'initialize-access.ps1') -ResetPassword
& (Join-Path $PSScriptRoot 'access.ps1') -CopyPassword
`, r => {
    assert.equal(r.status,0,r.output); assert.equal(r.read('updates.txt').trim(),'DASHBOARD_PASSWORD');
    assert.equal(r.read('copied.txt').trim(),'MATCH'); assert.equal(r.read('data/dashboard.xml.pending'),null);
  });
});
test('interrupted cloud reset retains encrypted pending password for the next initialization', {skip:!windows}, () => {
  check(`Set-Content (Join-Path $PSScriptRoot 'interrupt.txt') 'yes'`, `& (Join-Path $PSScriptRoot 'initialize-access.ps1') -ResetPassword`, r => {
    assert.equal(r.status,1); assert.ok(r.read('data/dashboard.xml.pending'));
    assert.equal(r.read('data/dashboard.xml'),null); assert.equal(r.read('updates.txt').trim(),'DASHBOARD_PASSWORD');
  });
});
test('pending password already active in cloud is recovered without a second reset', {skip:!windows}, () => {
  check(`Save-LifeOsCredential -Credential $fixture -Path ((Get-LifeOsCredentialPath)+'.pending')`, `
& (Join-Path $PSScriptRoot 'initialize-access.ps1') -ResetPassword
& (Join-Path $PSScriptRoot 'access.ps1') -CopyPassword
`, r => {
    assert.equal(r.status,0,r.output); assert.equal(r.read('updates.txt'),null);
    assert.equal(r.read('copied.txt').trim(),'MATCH'); assert.equal(r.read('data/dashboard.xml.pending'),null);
  });
});
