# dsh-vision 宿主补丁脚本
# 作用：给 dsh-host-apiproxy 打两处补丁：
#   1. 图片准入（admission）：拒绝图片前检查 ctx.visionImageBridge 服务——
#      插件已安装即接管图片（由 pre-step 描述或引导配置视觉模型），未安装保持宿主拒绝。
#   2. settings namespace 暴露：exposedNamespaces 咨询插件的 settingsNamespaces，
#      使 dsh-vision 配置可从 GUI 写入（否则保存被 settings-not-exposed 静默拒绝）。
# 幂等：重复执行安全（已打补丁则跳过）。升级 DSH 后重跑本脚本即可重新打补丁。
# 用法：powershell -ExecutionPolicy Bypass -File patch-host.ps1

$ErrorActionPreference = 'Stop'

$file = Join-Path $env:USERPROFILE '.dsh\profiles\node_modules\@deepseek-ai\dsh-host-apiproxy\lib\index.js'
$backup = $file + '.bak-dsh-vision'

if (-not (Test-Path $file)) {
    Write-Error "未找到 dsh-host-apiproxy: $file"
    exit 1
}

$content = Get-Content $file -Raw

if ($content -match '\[dsh-vision patch\]') {
    Write-Host "补丁已存在，跳过（如需重打：手动从备份 $backup 还原后重新运行）"
    exit 0
}

# ── 补丁点 1：admission 图片桥 ──
$old1 = @'
						if (hasImage) {
							const current = selectionFor(agent).current;
							const modelInfo = await ctx.llm.resolveModelInfo(current.provider, current.model);
							if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image")) return err(request, {
								code: "attachment-error",
								message: `Model "${current.model}" does not support image input.`,
								details: { reason: "MODEL_DOES_NOT_SUPPORT_IMAGES" }
							});
						}
'@

$new1 = @'
						if (hasImage) {
							const current = selectionFor(agent).current;
							const modelInfo = await ctx.llm.resolveModelInfo(current.provider, current.model);
							if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image")) {
								// [dsh-vision patch] 图片桥：插件已安装即接管图片（pre-step 中描述或引导配置视觉模型），否则保持宿主拒绝
								const bridge = ctx.get("visionImageBridge");
								if (bridge === void 0) return err(request, {
									code: "attachment-error",
									message: `Model "${current.model}" does not support image input.`,
									details: { reason: "MODEL_DOES_NOT_SUPPORT_IMAGES" }
								});
							}
						}
'@

# ── 补丁点 2：settings namespace 暴露 ──
$old2 = @'
	function exposedNamespaces() {
		const exposed = modelProviderNamespaces();
		for (const ns of WEB_SETTINGS_NAMESPACES) exposed.add(ns);
		for (const ns of PRODUCT_SETTINGS_NAMESPACES) exposed.add(ns);
		return exposed;
	}
'@

$new2 = @'
	function exposedNamespaces() {
		const exposed = modelProviderNamespaces();
		for (const ns of WEB_SETTINGS_NAMESPACES) exposed.add(ns);
		for (const ns of PRODUCT_SETTINGS_NAMESPACES) exposed.add(ns);
		// [dsh-vision patch] 暴露插件声明的配置 namespace（GUI 写入通道）
		const bridge = ctx.get("visionImageBridge");
		if (bridge !== void 0 && typeof bridge.settingsNamespaces === "function") {
			for (const ns of bridge.settingsNamespaces()) exposed.add(ns);
		}
		return exposed;
	}
'@

# ── 校验两个补丁点 ──
$failures = @()
if (-not $content.Contains($old1)) { $failures += '补丁点1（admission 图片桥）未匹配' }
if (-not $content.Contains($old2)) { $failures += '补丁点2（exposedNamespaces）未匹配' }
if ($failures.Count -gt 0) {
    Write-Error "补丁点未匹配（宿主版本可能已变化），请人工检查："
    foreach ($f in $failures) { Write-Error "  - $f" }
    exit 1
}

# 备份（只在首次备份，不覆盖已有备份）
if (-not (Test-Path $backup)) {
    Copy-Item $file $backup -Force
    Write-Host "已备份原文件 → $backup"
}

$newContent = $content.Replace($old1, $new1).Replace($old2, $new2)
Set-Content $file $newContent -Encoding UTF8 -NoNewline
Write-Host "✅ 补丁已应用（2 处）：图片桥接管 + dsh-vision 配置 namespace 暴露"
Write-Host "请重启 DSH Desktop 生效。"
