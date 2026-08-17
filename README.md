# 👁️ dsh-vision-plugin — DSH 视觉理解插件

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）装上"眼睛"：**纯文本模型（如 deepseek-v4-flash）也能处理图片**——发图后自动用视觉模型生成描述，文本模型基于描述回答；描述不足时自动生成更具体的提示词重新解析。配置全程 GUI 可视化、保存即生效。

> ⚠️ 社区项目，非 DeepSeek 官方。已在 DSH 0.1.0-rc.6（Desktop）实测。

---

## ✨ 特性

- 🖼️ **发图自动接管**：对话模型收到图片不再被拒绝——用**默认提示词**调视觉模型生成描述，文本模型基于描述回答
- 🔁 **迭代式视觉解析**：描述不足时，对话模型**自动生成更具体的提示词调用 `view_image` 重新解析**（可省略 image 参数复用会话图片）
- 🧩 **两种连接模式**：
  - **系统模型**：自动检测 DSH 已启用且支持视觉的模型（Xiaomi / OpenCode Zen Go 等），复用系统 API Key，零配置
  - **自定义模型**：手动填 OpenAI 兼容端点（URL + Key + 模型），内置常见服务商示例
- 🎛️ **GUI 可视化配置**（设置 → 视觉模型）：保存即生效，无需重启
- 🔒 **Key 安全**：`role('secret')` 自动脱敏，只写不读，永不回流前端
- 📋 **未配置引导**：视觉模型未配置时明确提示"请到 设置 → 视觉模型 配置"，不再报"模型不支持图片"
- 🧪 **37 项自动化测试**（含真实 React 渲染与真实 pi-ai 集成）

## 📦 安装（3 步）

### 前置

- Windows + PowerShell（脚本为 Windows 编写）
- DSH Desktop（0.1.0-rc.6）或 DSH CLI（`web`/`headless` profile）
- 已启用至少一个支持视觉的模型供应商（DSH 设置 → 模型，如 xiaomi 的 mimo-v2.5）

### 步骤

```powershell
# 1) 克隆/下载本仓库，进入目录

# 2) 安装插件（默认 desktop profile；web 用 -Profile web）
powershell -ExecutionPolicy Bypass -File install.ps1

# 3) 打宿主补丁（让文本模型接收图片；幂等，DSH 升级后重跑）
powershell -ExecutionPolicy Bypass -File patch-host.ps1
```

**重启 DSH**，打开 **设置 → 视觉模型** 配置。

> 补丁说明：修改 `dsh-host-apiproxy` 两处——① 图片准入：插件已装即接管图片（pre-step 转描述），未装保持宿主原行为；② settings namespace 暴露：允许 GUI 写入配置。原文件自动备份为 `index.js.bak-dsh-vision`，可用备份还原。

## ⚙️ 配置（设置 → 视觉模型）

### 连接模式

```
◉ 系统模型（复用系统 Key，无需填写）
   ○ MiMo-V2.5 · Xiaomi            ●系统凭证
   ○ mimo-v2-omni · Xiaomi         ●系统凭证
   ○ kimi-k2.7-code · OpenCode Zen Go
   ...（自动检测，只显示支持视觉的模型；
       "共 N 个视觉模型" + 可添加建议）
○ 自定义模型（OpenAI 兼容接口）
   API Base URL [____]   API Key [____]（只写不读）
   Key 环境变量 [____]   模型名称 [____]
   ▸ 查看常见服务商端点示例
```

### 提示词与参数

| 字段 | 说明 |
|---|---|
| 系统提示词 | 发给视觉 API 的 system 消息（留空不发送） |
| 默认提示词 | 发图自动描述/未传 prompt 时使用的提示词 |
| 超时 / 最大 token / 温度 | 请求参数（高级参数折叠区） |
| URL 图片模式 | direct 直传 / download 转 base64 |

### 保存与验证

- **保存更改**：保存后立即生效（live），无需重启；带 read-back 校验，失败会明确提示
- **撤销改动**：清空未保存的草稿
- **测试连接**：用 1x1 测试图真实请求，显示延迟与模型返回

## 🚀 使用

### 1. 聊天直接发图（核心场景）

```
用户发一张图
  → 自动：视觉模型用默认提示词生成详细描述
  → 文本模型基于描述回答
  → 追问细节（"图里小字写的什么？"）
  → 文本模型判断描述不足 → 自动调 view_image 生成更具体的提示词重新解析
  → 基于新描述回答
```

### 2. 说"看这个文件"

```
"看看 C:\shot.png 里是什么"
→ agent 调用 view_image（本地路径 → 自动 base64 → 视觉模型）
```

### 3. 发 URL

```
"看下 https://example.com/a.jpg"
→ view_image 直传 URL（或下载转 base64）
```

### 4. 未配置视觉模型时

发图后对话模型回复："**视觉模型未配置**：请在 设置 → 视觉模型 中选择系统模型或配置自定义模型"。

## 🗂️ 仓库结构

```
dsh-vision-plugin/
├── src/index.ts          # 插件主体（工具/图片桥/pre-step 描述/settings 接入/3 个路由）
├── dist/                 # GUI client 包（设置面板），安装到共享 node_modules
├── install.ps1           # 一键安装（-Profile 参数：desktop/web/…）
├── patch-host.ps1        # 宿主补丁（幂等，升级 DSH 后重跑）
├── test/
│   ├── e2e.mts           # 21 项逻辑测试（mock）
│   ├── client-bundle.mts # 5 项 bundle 契约测试
│   └── client-render.mts # 5 项真实 React 渲染测试
├── docs/design-gui-config.md  # 设计文档
└── README.md
```

## 🧪 测试

```powershell
node test\e2e.mts            # 逻辑（双模式/发图接管/桥/兜底/Key 安全）
node test\client-bundle.mts  # bundle 契约
node test\client-render.mts  # 真实 React 渲染
node ..\..\.dsh\profiles\integration-real.mjs  # 真实 pi-ai 集成（可放 profiles 目录运行）
```

## ❓ 常见问题

| 问题 | 解决 |
|---|---|
| 系统模型只有 1 个 | 面板会列出"可添加的视觉模型"；在 DSH 设置 → 模型 中给供应商添加视觉模型（如 kimi-k2.7-code / qwen3.6-plus / mimo-v2-omni） |
| 保存显示"未生效" | 确认已执行 `patch-host.ps1` 并重启 DSH（namespace 暴露补丁） |
| 发图仍提示"不支持图片" | 插件未加载（检查 设置 → 插件 中 dsh-vision 状态）/ 未打补丁 |
| DSH 升级后插件失效 | 重跑 `install.ps1` + `patch-host.ps1`（补丁点不匹配会明确报错，请把新版本宿主文件发 issue） |
| 跨机器部署 | 复制仓库 → 运行两个脚本 → 拷贝 `~/.dsh/settings.yaml` 中的 `dsh-vision:` 配置节 |

## 🙏 致谢

- **思路借鉴**：[dsh-llm-image-routing](https://github.com/CuzWeAre/dsh-llm-image-routing)（MIT）——发图接管机制（`agent/pre-step` 描述 + 会话占位管理）参考了其 describe 模式设计思路；本插件代码为独立实现，并针对 DSH 0.1.0-rc.6 采用宿主补丁方案。
- **官方参考**：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的工具定义 DSL、settings 配置通道、`settings.section` 注册方式。
- **数据来源**：系统视觉模型清单来自 `@earendil-works/pi-ai` 内置模型目录。

## 📄 License

[MIT](./LICENSE)
