[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('home', 'work')]
    [string]$Profile,

    [switch]$DryRun,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$profilePath = Join-Path $repoRoot "deploy.$Profile.local.ps1"
$statePath = Join-Path $repoRoot ".deploy-state.$Profile.json"

$publishFiles = @(
    'index.html',
    'styles.css',
    'app.js',
    'export-model.js',
    'export-core.js',
    'routebook.js',
    'poi-search.js',
    'poi-projection.js',
    'poi-clustering.js',
    'poi-config.js',
    'poi-provider-overture.js',
    'resupply-profile.js',
    'api/places.php',
    'config/poi-categories.json',
    'config/resupply-profile.json'
)

function Assert-LocalJavaScriptImportsPublished([string[]]$Files) {
    $published = @{}
    foreach ($file in $Files) {
        $published[$file.Replace('\', '/')] = $true
    }

    foreach ($relativePath in $Files | Where-Object { $_.EndsWith('.js') }) {
        $localPath = Join-Path $repoRoot $relativePath
        if (-not (Test-Path -LiteralPath $localPath)) {
            continue
        }

        $source = Get-Content -LiteralPath $localPath -Raw
        $imports = [regex]::Matches($source, '(?ms)^\s*import\s+.*?\s+from\s+["''](?<specifier>\.[^"'']+)["'']')
        foreach ($import in $imports) {
            $resolvedPath = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $localPath) $import.Groups['specifier'].Value))
            $resolvedRelativePath = [System.IO.Path]::GetRelativePath($repoRoot, $resolvedPath).Replace('\', '/')
            if (-not $published.ContainsKey($resolvedRelativePath)) {
                throw "Local JavaScript import '$($import.Groups['specifier'].Value)' from '$relativePath' is not in the publish file list."
            }
        }
    }
}

Assert-LocalJavaScriptImportsPublished $publishFiles

function Get-Sha256([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-DeployState([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        return @{}
    }

    try {
        $raw = Get-Content -LiteralPath $Path -Raw
        if ([string]::IsNullOrWhiteSpace($raw)) {
            return @{}
        }

        $parsed = $raw | ConvertFrom-Json -AsHashtable
        if ($null -eq $parsed) {
            return @{}
        }
        return $parsed
    }
    catch {
        Write-Warning "Could not read deployment state '$Path'. A full publish set will be considered changed."
        return @{}
    }
}

function Save-DeployState([string]$Path, [hashtable]$State) {
    $tempPath = "$Path.tmp"
    $State | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $tempPath -Encoding UTF8
    Move-Item -LiteralPath $tempPath -Destination $Path -Force
}

function Find-WinScpAssembly([hashtable]$Config) {
    $candidates = [System.Collections.Generic.List[string]]::new()

    if ($Config.ContainsKey('WinScpAssemblyPath') -and $Config.WinScpAssemblyPath) {
        $candidates.Add([string]$Config.WinScpAssemblyPath)
    }

    if ($env:WINSCPNET_PATH) {
        $candidates.Add($env:WINSCPNET_PATH)
    }

    $candidates.Add((Join-Path $repoRoot 'WinSCPnet.dll'))
    $candidates.Add('C:\Program Files (x86)\WinSCP\WinSCPnet.dll')
    $candidates.Add('C:\Program Files\WinSCP\WinSCPnet.dll')

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw 'WinSCPnet.dll was not found. Install WinSCP or set WinScpAssemblyPath in the local deployment profile.'
}

if (-not (Test-Path -LiteralPath $profilePath)) {
    throw "Deployment profile '$profilePath' is missing. Copy deploy.$Profile.example.ps1 to deploy.$Profile.local.ps1 and fill in the local values."
}

$config = & $profilePath
if ($config -isnot [hashtable]) {
    throw "Deployment profile '$profilePath' must return a PowerShell hashtable."
}

foreach ($requiredKey in @('HostName', 'UserName', 'RemotePath', 'SshHostKeyFingerprint')) {
    if (-not $config.ContainsKey($requiredKey) -or [string]::IsNullOrWhiteSpace([string]$config[$requiredKey])) {
        throw "Deployment profile is missing required value '$requiredKey'."
    }
}

$previousState = Get-DeployState $statePath
$currentState = @{}
$changed = [System.Collections.Generic.List[object]]::new()

foreach ($relativePath in $publishFiles) {
    $localPath = Join-Path $repoRoot $relativePath
    if (-not (Test-Path -LiteralPath $localPath)) {
        throw "Publish file '$relativePath' does not exist."
    }

    $hash = Get-Sha256 $localPath
    $currentState[$relativePath] = $hash

    $previousHash = $null
    if ($previousState.ContainsKey($relativePath)) {
        $previousHash = [string]$previousState[$relativePath]
    }

    if ($Force -or $hash -ne $previousHash) {
        $changed.Add([pscustomobject]@{
            RelativePath = $relativePath
            LocalPath = $localPath
            Hash = $hash
        })
    }
}

if ($changed.Count -eq 0) {
    Write-Host "Bonkproof [$Profile]: no changed publish files."
    exit 0
}

Write-Host "Bonkproof [$Profile]: $($changed.Count) file(s) to deploy:"
$changed | ForEach-Object { Write-Host "  - $($_.RelativePath)" }

if ($DryRun) {
    Write-Host 'Dry run only. No connection opened and no files uploaded.'
    exit 0
}

$assemblyPath = Find-WinScpAssembly $config
Add-Type -Path $assemblyPath

$password = $null
if ($config.ContainsKey('Password') -and $config.Password) {
    $password = [string]$config.Password
}
elseif ($config.ContainsKey('PasswordEnvironmentVariable') -and $config.PasswordEnvironmentVariable) {
    $password = [Environment]::GetEnvironmentVariable([string]$config.PasswordEnvironmentVariable)
}

if ([string]::IsNullOrWhiteSpace($password)) {
    $securePassword = Read-Host "SFTP password for $($config.UserName)@$($config.HostName)" -AsSecureString
    $credential = New-Object System.Management.Automation.PSCredential($config.UserName, $securePassword)
    $password = $credential.GetNetworkCredential().Password
}

$sessionOptions = New-Object WinSCP.SessionOptions -Property @{
    Protocol = [WinSCP.Protocol]::Sftp
    HostName = [string]$config.HostName
    UserName = [string]$config.UserName
    Password = $password
    SshHostKeyFingerprint = [string]$config.SshHostKeyFingerprint
}

if ($config.ContainsKey('PortNumber') -and $config.PortNumber) {
    $sessionOptions.PortNumber = [int]$config.PortNumber
}

$session = New-Object WinSCP.Session
if ($config.ContainsKey('WinScpExecutablePath') -and $config.WinScpExecutablePath) {
    $session.ExecutablePath = [string]$config.WinScpExecutablePath
}
try {
    $session.Open($sessionOptions)

    $remoteRoot = ([string]$config.RemotePath).TrimEnd('/')
    if (-not $session.FileExists($remoteRoot)) {
        $session.CreateDirectory($remoteRoot)
    }

    $transferOptions = New-Object WinSCP.TransferOptions
    $transferOptions.TransferMode = [WinSCP.TransferMode]::Binary

    foreach ($item in $changed) {
        $normalizedRelativePath = $item.RelativePath.Replace('\\', '/')
        $remotePath = "$remoteRoot/$normalizedRelativePath"
        $remoteDirectory = $remotePath.Substring(0, $remotePath.LastIndexOf('/'))
        if (-not $session.FileExists($remoteDirectory)) {
            $session.CreateDirectory($remoteDirectory)
        }

        $result = $session.PutFiles($item.LocalPath, $remotePath, $false, $transferOptions)
        $result.Check()
        Write-Host "Uploaded $($item.RelativePath)"
    }

    Save-DeployState $statePath $currentState
    Write-Host "Bonkproof [$Profile] deployment complete."
}
finally {
    $session.Dispose()
}
