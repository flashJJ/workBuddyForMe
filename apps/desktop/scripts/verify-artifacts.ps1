# 构建产物自检：版本资源（rcedit 写入的品牌名/版本/版权）与可选的数字签名链。
# 用法：
#   pwsh verify-artifacts.ps1 -Exe .\release\win-unpacked\WorkBuddyForMe.exe
#   pwsh verify-artifacts.ps1 -Exe ... -RequireSignature:$true   # CI 配置了证书时
param(
  [Parameter(Mandatory = $true)][string]$Exe,
  [switch]$RequireSignature
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $Exe)) { throw "exe 不存在：$Exe" }

$info = (Get-Item $Exe).VersionInfo
$failures = @()

if ($info.ProductName -ne 'WorkBuddyForMe') { $failures += "ProductName 异常：'$($info.ProductName)'" }
if ([string]::IsNullOrWhiteSpace($info.FileVersion)) { $failures += 'FileVersion 为空（rcedit 未执行？）' }
if ($info.LegalCopyright -notlike '*WorkBuddy*') { $failures += "Copyright 异常：'$($info.LegalCopyright)'" }

if ($RequireSignature) {
  $sig = Get-AuthenticodeSignature $Exe
  if ($sig.Status -ne 'Valid') {
    $failures += "数字签名无效：$($sig.Status) ($($sig.StatusMessage))"
  } else {
    Write-Host "[sign] $($sig.SignerCertificate.Subject) via $($sig.TimeStamperCertificate.Subject)"
  }
} else {
  $sig = Get-AuthenticodeSignature $Exe
  Write-Host "[sign] 未要求签名，当前状态：$($sig.Status)（NotSigned 为预期）"
}

# asar 生产依赖自检：electron-builder 误判包管理器时会漏掉 pnpm hoisted 依赖，安装后
# 启动即报 Cannot find module（v2.22.0 事故）。逐项核对 desktop 声明的 dependencies。
$asar = Join-Path (Split-Path $Exe) 'resources/app.asar'
if (-not (Test-Path $asar)) { throw "app.asar 不存在：$asar" }
$asarLib = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\node_modules\@electron\asar')).Path
$desktopPkg = Get-Content (Join-Path $PSScriptRoot '..\package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$entries = & node -e "const a=require(process.argv[1]);for(const p of a.listPackage(process.argv[2]))console.log(p)" $asarLib $asar
foreach ($name in $desktopPkg.dependencies.PSObject.Properties.Name) {
  $needle = '\node_modules\' + ($name -replace '/', '\') + '\package.json'
  if ($entries -notcontains $needle) { $failures += "app.asar 缺少生产依赖：$name" }
}

if ($failures.Count -gt 0) {
  foreach ($f in $failures) { Write-Error $f }
  exit 1
}

Write-Host "[ok] $Exe"
Write-Host "     Product=$($info.ProductName) Version=$($info.FileVersion) Copyright=$($info.LegalCopyright)"
