# WorkBuddy For Me 一键开发脚本：环境检查 + 启动桌面端（自动拉起 Next dev 与 Electron）
# 用法：powershell -File scripts/dev-desktop.ps1
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Test-Command($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# 1) Node.js 版本检查（要求 >= 20）
if (-not (Test-Command 'node')) {
    Write-Error '未检测到 Node.js，请安装 Node 20 或更高版本：https://nodejs.org/'
}
$nodeVersion = [version]((node -v) -replace '^v', '')
if ($nodeVersion.Major -lt 20) {
    Write-Error "Node 版本过低（$nodeVersion），要求 >= 20。"
}

# 2) pnpm 版本检查（要求 >= 9）
if (-not (Test-Command 'pnpm')) {
    Write-Error '未检测到 pnpm，请先执行：npm install -g pnpm'
}
$pnpmVersion = [version]((pnpm -v))
if ($pnpmVersion.Major -lt 9) {
    Write-Error "pnpm 版本过低（$pnpmVersion），要求 >= 9。"
}

# 3) 依赖安装检查
if (-not (Test-Path (Join-Path $repoRoot 'node_modules'))) {
    Write-Host '未检测到 node_modules，先执行 pnpm install...' -ForegroundColor Yellow
    Push-Location $repoRoot
    pnpm install
    Pop-Location
}

Write-Host "环境检查通过（node $nodeVersion / pnpm $pnpmVersion），启动桌面端开发模式..." -ForegroundColor Green
Write-Host '（将自动拉起 Next dev server 与 Electron 窗口，Ctrl+C 退出）' -ForegroundColor DarkGray
Set-Location $repoRoot
pnpm dev:desktop
