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

if ($failures.Count -gt 0) {
  foreach ($f in $failures) { Write-Error $f }
  exit 1
}

Write-Host "[ok] $Exe"
Write-Host "     Product=$($info.ProductName) Version=$($info.FileVersion) Copyright=$($info.LegalCopyright)"
