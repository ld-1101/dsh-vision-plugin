# dsh-vision 插件一键安装脚本
# 作用：
#   1. 将插件源码复制到指定 DSH profile 的 plugins 目录（依赖从共享 profiles/node_modules 解析）
#   2. 将 GUI client 包安装到共享 profiles/node_modules（提供设置页“视觉模型”面板）
#   3. 在指定 profile 的 cordis.patch.yml 中注册两个条目（工具插件 + client 包）
# 用法：powershell -ExecutionPolicy Bypass -File install.ps1            （默认 desktop）
#       powershell -ExecutionPolicy Bypass -File install.ps1 -Profile web
# 注意：宿主补丁（patch-host.ps1）作用于共享 profiles/node_modules，web/desktop 通用。
# 安装后需重启 DSH 生效。

param(
    [string]$Profile = 'desktop'
)

$ErrorActionPreference = 'Stop'

$profileDir = Join-Path $env:USERPROFILE (".dsh\profiles\" + $Profile)
$pluginDest = Join-Path $profileDir 'plugins\dsh-vision'
$clientDest = Join-Path $env:USERPROFILE '.dsh\profiles\node_modules\dsh-vision-client'
$patchFile = Join-Path $profileDir 'cordis.patch.yml'
$srcFile = Join-Path $PSScriptRoot 'src\index.ts'
$distDir = Join-Path $PSScriptRoot 'dist'

if (-not (Test-Path $profileDir)) {
    Write-Error "未找到 profile 目录: $profileDir（请检查 profile 名：desktop / web / headless 等）"
    exit 1
}
if (-not (Test-Path $srcFile)) {
    Write-Error "未找到插件源码: $srcFile"
    exit 1
}
if (-not (Test-Path (Join-Path $distDir 'lib\client.js'))) {
    Write-Error "未找到 client bundle: $distDir\lib\client.js（请先构建 dist）"
    exit 1
}

# 1) 复制工具插件源码
New-Item -ItemType Directory -Force -Path (Join-Path $pluginDest 'src') | Out-Null
Copy-Item $srcFile (Join-Path $pluginDest 'src\index.ts') -Force
Write-Host "[1/3] 工具插件源码已复制到 $pluginDest"

# 2) 安装 client 包到 profile node_modules
if (Test-Path $clientDest) { Remove-Item $clientDest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $clientDest | Out-Null
Copy-Item (Join-Path $distDir 'package.json') $clientDest -Force
New-Item -ItemType Directory -Force -Path (Join-Path $clientDest 'lib') | Out-Null
Copy-Item (Join-Path $distDir 'lib\index.js') (Join-Path $clientDest 'lib\index.js') -Force
Copy-Item (Join-Path $distDir 'lib\client.js') (Join-Path $clientDest 'lib\client.js') -Force
Write-Host "[2/3] GUI client 包已安装到 $clientDest"

# 3) 注册到 cordis.patch.yml
$pluginName = (Join-Path $pluginDest 'src\index.ts').Replace('\', '/')

$fullBlock = @"
- insert:
    - id: dsh-vision
      name: '$pluginName'
    - id: dsh-vision-client
      name: 'dsh-vision-client'
"@

$clientEntry = "    - id: dsh-vision-client`n      name: 'dsh-vision-client'"

$content = Get-Content $patchFile -Raw
$hasTool = $content -match 'dsh-vision'
$hasClient = $content -match 'dsh-vision-client'

if ($hasTool -and $hasClient) {
    Write-Host "[3/3] cordis.patch.yml 已包含 dsh-vision 与 dsh-vision-client，跳过注册"
} elseif (-not $hasTool) {
    $pattern = '(?ms)^\[\s*\]\s*$'
    if ($content -match $pattern) {
        $newContent = $content -replace $pattern, $fullBlock
    } else {
        $newContent = $content.TrimEnd() + "`n" + $fullBlock + "`n"
    }
    Set-Content $patchFile $newContent -Encoding UTF8 -NoNewline
    Write-Host "[3/3] 已在 cordis.patch.yml 中注册 dsh-vision 与 dsh-vision-client"
} else {
    # 已有工具插件条目，把 client 条目追加到第一个 insert 块
    $newContent = $content -replace '(?ms)(- insert:\s*\n)', ('$1' + $clientEntry + "`n")
    Set-Content $patchFile $newContent -Encoding UTF8 -NoNewline
    Write-Host "[3/3] 已在 cordis.patch.yml 的 insert 块中追加 dsh-vision-client"
}

Write-Host ""
Write-Host "完成！已安装到 profile [$Profile]，请重启 DSH 使插件生效。"
Write-Host "重启后在 设置 -> 视觉模型 中配置并点击“测试连接”验证。"
Write-Host "注意：若未打过宿主补丁，请先执行 patch-host.ps1（web/desktop 通用）。"
