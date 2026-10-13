# WorkBuddy For Me Windows 安装包自动归档
#
# 把 electron-builder 产物中的三件套（安装包 exe / blockmap / latest.yml）归集到
# <ArchiveRoot>\v<Version>\，并生成 SHA256SUMS.txt；默认清理 win-unpacked 等中间产物。
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/archive-installer.ps1
#   powershell -File scripts/archive-installer.ps1 -Source E:\builds\wbfm-v160-fix1
#   powershell -File scripts/archive-installer.ps1 -Copy              # 复制而非移动
#   powershell -File scripts/archive-installer.ps1 -KeepIntermediate  # 保留 win-unpacked
#
# 可覆盖项（参数优先）：
#   -Source       默认 <repo>\apps\desktop\release（dist:win 的默认输出目录）
#   -ArchiveRoot  默认 $env:WBFM_DIST_ARCHIVE，再缺省 E:\builds\archive
#   -Version      默认根 package.json 的 version
param(
    [string]$Source,
    [string]$ArchiveRoot,
    [string]$Version,
    [switch]$Copy,
    [switch]$KeepIntermediate
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $Source) {
    $Source = Join-Path $repoRoot 'apps\desktop\release'
}
if (-not $ArchiveRoot) {
    $ArchiveRoot = if ($env:WBFM_DIST_ARCHIVE) { $env:WBFM_DIST_ARCHIVE } else { 'E:\builds\archive' }
}
if (-not $Version) {
    $rootPkg = Get-Content (Join-Path $repoRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $Version = $rootPkg.version
}

$installer = "WorkBuddyForMe-Setup-$Version.exe"
$required = @($installer, "$installer.blockmap", 'latest.yml')

Write-Host "==> 源目录：$Source" -ForegroundColor Cyan
Write-Host "==> 版本：  $Version" -ForegroundColor Cyan
Write-Host "==> 归档到：$ArchiveRoot\v$Version（$(if ($Copy) { '复制' } else { '移动' })）" -ForegroundColor Cyan

if (-not (Test-Path $Source -PathType Container)) {
    throw "源目录不存在：$Source（先执行 pnpm dist:win，或用 -Source 指定构建输出目录）"
}

$missing = @($required | Where-Object { -not (Test-Path (Join-Path $Source $_) -PathType Leaf) })
if ($missing.Count -gt 0) {
    throw "源目录缺少必需产物：$($missing -join '、 ')"
}

$dest = Join-Path $ArchiveRoot "v$Version"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# 已存在同名资产时给出提示并覆盖（重复归档同一版本以新构建为准）
foreach ($name in $required) {
    $target = Join-Path $dest $name
    if (Test-Path $target) {
        Write-Host "    覆盖已存在：$name" -ForegroundColor DarkYellow
    }
    if ($Copy) {
        Copy-Item (Join-Path $Source $name) $target -Force
    } else {
        Move-Item (Join-Path $Source $name) $target -Force
    }
}

# 生成 coreutils 风格 SHA256SUMS.txt（小写哈希，便于 certutil/sha256sum -c 核对）
$sums = foreach ($name in $required) {
    $hash = (Get-FileHash (Join-Path $dest $name) -Algorithm SHA256).Hash.ToLower()
    "$hash  $name"
}
Set-Content -Path (Join-Path $dest 'SHA256SUMS.txt') -Value $sums -Encoding ASCII

# 清理构建中间产物（解包目录数百 MB；调试日志不进归档）
if (-not $KeepIntermediate) {
    foreach ($name in @('win-unpacked', 'builder-debug.yml', 'builder-effective-config.yaml')) {
        $p = Join-Path $Source $name
        if (Test-Path $p) {
            Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "    已清理中间产物：$name" -ForegroundColor DarkGray
        }
    }
}

$totalMb = [math]::Round((Get-ChildItem $dest -File | Measure-Object Length -Sum).Sum / 1MB, 2)
Write-Host "`n归档完成 ✅  $dest（$totalMb MB）" -ForegroundColor Green
Get-ChildItem $dest -File |
    Sort-Object Name |
    ForEach-Object { '  {0,-42} {1,9:N2} MB' -f $_.Name, ($_.Length / 1MB) }
