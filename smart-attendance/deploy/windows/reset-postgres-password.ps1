# ============================================================
#  AttendAI - forgot the PostgreSQL "postgres" password? Run this AS ADMINISTRATOR.
#  1. backs up pg_hba.conf, lets this PC log in without a password for a moment
#  2. sets the new postgres password you type
#  3. puts pg_hba.conf back exactly as it was and restarts PostgreSQL
#  4. runs create-database.ps1 (type the NEW password there)
# ============================================================
$ErrorActionPreference = "Stop"
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Asking Windows for administrator rights..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList "-NoExit -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

$pgRoot = Get-ChildItem "C:\Program Files\PostgreSQL" -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (-not $pgRoot) { throw "PostgreSQL folder not found in C:\Program Files\PostgreSQL" }
$hba = Join-Path $pgRoot.FullName "data\pg_hba.conf"
$psql = Join-Path $pgRoot.FullName "bin\psql.exe"
$service = Get-Service "postgresql*" | Select-Object -First 1
if (-not (Test-Path $hba) -or -not (Test-Path $psql) -or -not $service) { throw "Couldn't find pg_hba.conf, psql.exe or the PostgreSQL service." }

$p1 = Read-Host "New password for the postgres admin (write it down)" -AsSecureString
$p2 = Read-Host "Type it again" -AsSecureString
$plain = { param($s) [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
$new = & $plain $p1
if ($new -ne (& $plain $p2) -or $new.Length -lt 6) { throw "The passwords didn't match or are shorter than 6 characters. Run this again." }

$backup = "$hba.attendai-backup"
Copy-Item $hba $backup -Force
Write-Host "Backed up pg_hba.conf to $backup"
try {
    $lines = Get-Content $hba
    $lines | ForEach-Object {
        if ($_ -match '^\s*host\s+all\s+all\s+(127\.0\.0\.1/32|::1/128)\s+') { $_ -replace '(scram-sha-256|md5|password)\s*$', 'trust' } else { $_ }
    } | Set-Content $hba -Encoding ascii
    Restart-Service $service.Name
    Start-Sleep -Seconds 3
    $escaped = $new.Replace("'", "''")
    & $psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -c "ALTER USER postgres PASSWORD '$escaped';"
    if ($LASTEXITCODE -ne 0) { throw "Couldn't set the new password." }
    Write-Host "postgres password changed." -ForegroundColor Green
} finally {
    Copy-Item $backup $hba -Force          # always restore the original rules
    Restart-Service $service.Name
    Write-Host "pg_hba.conf restored and PostgreSQL restarted."
}

Write-Host ""
Write-Host "Now setting up the AttendAI database. Type the NEW password when asked." -ForegroundColor Cyan
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "create-database.ps1")
