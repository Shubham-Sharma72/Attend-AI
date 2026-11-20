# ============================================================
#  AttendAI - create the PostgreSQL login and databases (once per PC)
#  Run:  powershell -ExecutionPolicy Bypass -File deploy\windows\create-database.ps1
#  Asks for the PostgreSQL admin ("postgres") password you chose when installing PostgreSQL.
#  Creates login "attendai" with a new random password, databases "attendai" and
#  "attendai_ithub", and saves DATABASE_URL in .env. Safe to run again.
# ============================================================
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\common.ps1"

$psql = Find-PgBin "psql.exe"
if (-not $psql) { Fail "psql.exe not found. Is PostgreSQL installed?" }

$secure = Read-Host "PostgreSQL admin (postgres) password" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))

$chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789".ToCharArray()
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 24; $rng.GetBytes($bytes)
$newPass = -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })

$sql = @"
SELECT format('CREATE ROLE attendai LOGIN PASSWORD %L', '$newPass') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'attendai') \gexec
ALTER ROLE attendai LOGIN PASSWORD '$newPass';
SELECT 'CREATE DATABASE attendai OWNER attendai' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'attendai') \gexec
SELECT 'CREATE DATABASE attendai_ithub OWNER attendai' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'attendai_ithub') \gexec
"@
$tmp = [IO.Path]::GetTempFileName()
try {
    [IO.File]::WriteAllText($tmp, $sql)
    & $psql -h localhost -U postgres -d postgres -v ON_ERROR_STOP=1 -q -f $tmp
    if ($LASTEXITCODE -ne 0) { Fail "PostgreSQL refused. Check the postgres password and that the PostgreSQL service is running." }
} finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
    $env:PGPASSWORD = $null
}

Set-EnvValue "DATABASE_URL" "postgresql+psycopg2://attendai:$newPass@localhost:5432/attendai"
Say "Login 'attendai' and databases 'attendai' + 'attendai_ithub' are ready." "Green"
Say "DATABASE_URL saved in .env. Next: double-click deploy\windows\setup.bat" "Green"
