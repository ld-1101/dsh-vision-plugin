# 👁️ dsh-vision-plugin — DSH 视觉理解插件

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）装上"眼睛"：**纯文本模型（如 deepseek-v4-flash）也能处理图片**——发图后自动用视觉模型生成描述，文本模型基于描述回答；描述不足时自动生成更具体的提示词重新解析。配置全程 GUI 可视化、保存即生效。

> ⚠️ 社区项目，非 DeepSeek 官方。已在 DSH 0.1.0-rc.6（Desktop）实测。
>
> 📦 v1.0.0 ｜ MIT License ｜ Windows + PowerShell 安装 ｜ 支持 desktop / web / headless profile

---

## ✨ 特性

- 🖼️ **发图自动接管**：对话模型收到图片不再被拒绝——用**默认提示词**调视觉模型生成描述，文本模型基于描述回答
- 🔁 **迭代式视觉解析**：描述不足时，对话模型**自动生成更具体的提示词调用 `view_image` 重新解析**（可省略 image 参数复用会话最近上传的图片）
- 🧩 **两种连接模式**：
  - **系统模型**：自动检测 DSH 已启用且支持视觉的模型（Xiaomi / OpenCode Zen Go 等），复用系统 API Key，**零配置**
  - **自定义模型**：手动填 OpenAI 兼容端点（URL + Key + 模型），内置 **8 家常见服务商示例**（智谱 GLM-4V / 通义千问 VL / OpenAI / 火山方舟 / 硅基流动 / OpenRouter / OpenCode Go / 小米 MiMo）
- 🎛️ **GUI 可视化配置**（设置 → 视觉模型）：**保存即生效（live）**，无需重启，带 read-back 校验
- 🔒 **Key 安全**：`role('secret')` 自动脱敏，**只写不读**，永不回流前端；配置摘要不泄露 Key 明文
- 📋 **未配置引导**：视觉模型未配置时明确提示"请到 设置 → 视觉模型 配置"，不再报"模型不支持图片"
- 🧪 **33 项自动化测试**（23 项逻辑 + 5 项 bundle 契约 + 5 项真实 React 渲染）

## 🧠 工作原理（三层机制）

```
① 图片桥（admission 接管 · 宿主补丁）
   图片到达 → 宿主原逻辑：模型不支持 image 则拒绝
   插件已装 → visionImageBridge 服务接管 → 放行（不拒绝）

② pre-step 自动描述（agent/pre-step 事件钩子）
   图片消息 → 用默认提示词调视觉模型 → 生成描述文本
   会话日志保留原图（surface 占位替换），模型侧只看到描述
   未配置视觉模型 → 插入引导消息，不报"不支持图片"

③ view_image 工具（迭代式解析）
   描述不足 → 对话模型自动调 view_image（可省略 image 复用最近图片）
   → 传入针对性提示词（OCR / UI 布局 / 具体数值…）→ 重新解析 → 基于新描述回答
```

## 📦 安装（3 步）

### 前置

- Windows + PowerShell（脚本为 Windows 编写）
- DSH Desktop（0.1.0-rc.6）或 DSH CLI（`web`/`headless` profile）
- 已启用至少一个支持视觉的模型供应商（DSH 设置 → 模型，如 xiaomi 的 mimo-v2.5）

### 步骤

```powershell
# 1) 克隆仓库，进入目录
git clone https://github.com/ld-1101/dsh-vision-plugin.git
cd dsh-vision-plugin

# 2) 安装插件（默认 desktop profile；web 用 -Profile web）
powershell -ExecutionPolicy Bypass -File install.ps1

# 3) 打宿主补丁（让文本模型接收图片；幂等，DSH 升级后重跑）
powershell -ExecutionPolicy Bypass -File patch-host.ps1
```

**重启 DSH**，打开 **设置 → 视觉模型** 配置。

> **补丁说明**：修改 `dsh-host-apiproxy` 两处——① 图片准入：插件已装即接管图片（pre-step 转描述），未装保持宿主原行为；② settings namespace 暴露：允许 GUI 写入配置。原文件自动备份为 `index.js.bak-dsh-vision`，可用备份还原。两处补丁点都有严格匹配校验，宿主版本变化会明确报错而非静默打坏。

### 卸载

1. 退出 DSH
2. 从 profile 的 `cordis.patch.yml` 中移除 `dsh-vision` 与 `dsh-vision-client` 两个条目
3. 删除 `~/.dsh/profiles/<profile>/plugins/dsh-vision` 与共享目录 `~/.dsh/profiles/node_modules/dsh-vision-client`
4. 如需还原宿主行为：用备份 `index.js.bak-dsh-vision` 还原 `dsh-host-apiproxy/lib/index.js` 后重启

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
| URL 图片模式 | direct 直传（省流量）/ download 下载转 base64 |

### 保存与验证

- **保存更改**：保存后立即生效（live），无需重启；带 read-back 校验，失败会明确提示
- **撤销改动**：清空未保存的草稿
- **测试连接**：用 1x1 测试图真实请求，显示延迟与模型返回

## 🔧 view_image 工具

对话中由模型自动调用的"看图"统一入口，也支持用户直接表达意图触发：

| 参数 | 必填 | 说明 |
|---|---|---|
| `image` | 否 | 图片的本地绝对路径或 http(s) URL；**省略时自动复用会话最近上传的图片** |
| `prompt` | 否 | 视觉理解提示词；省略时使用配置的「默认提示词」 |

- **本地路径** → 自动读取转 base64 data URI（png / jpg / webp / gif / bmp / avif / svg / ico）
- **URL** → 按配置 direct 直传，或下载后转 base64
- **返回** → `[视觉模型 {model} 对 {source} 的识别结果]` + 描述文本

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
├── src/index.ts            # 插件主体（view_image 工具 / 图片桥 / pre-step 描述 / settings 接入 / 3 个路由）
├── dist/                   # GUI client 包（设置 → 视觉模型 面板），随 install.ps1 安装到共享 node_modules
│   ├── package.json        #   dsh-vision-client 包声明（platform: web）
│   └── lib/
│       ├── index.js        #   client 包入口
│       └── client.js       #   React 设置面板 bundle（__ModuleLoader__ 格式）
├── install.ps1             # 一键安装（-Profile 参数：desktop / web / …）
├── patch-host.ps1          # 宿主补丁（幂等，升级 DSH 后重跑）
├── cordis.patch.yml        # bundle patch 声明（随包发布）
├── package.json            # 插件声明（main: src/index.ts，dsh.client platform: web）
├── docs/
│   └── design-gui-config.md # GUI 配置设计文档（方案对比 / 数据流 / 历史）
├── test/
│   ├── e2e.mts             # 23 项逻辑测试（mock：双模式/发图接管/桥/兜底/Key 安全）
│   ├── client-bundle.mts   # 5 项 bundle 契约测试（mock __ModuleLoader__）
│   └── client-render.mts   # 5 项真实 React 18 渲染测试
├── LICENSE                 # MIT
└── README.md
```

## 🧪 测试与开发

> ⚠️ 前置：测试读取的是**已安装到 profile 的插件副本**（与 `src/index.ts` 内容一致，见各测试文件头注释），请先执行 `install.ps1`（desktop）完成安装，再运行测试。换机器运行时，把测试文件里硬编码的本机 profile 路径替换为对应路径即可。

```powershell
node test\e2e.mts            # 23 项逻辑测试（双模式 / 发图接管 / 图片桥 / 兜底表 / Key 安全）
node test\client-bundle.mts  # 5 项 bundle 契约测试
node test\client-render.mts  # 5 项真实 React 渲染测试（React 18 + react-dom/server）
```

- 测试不依赖真实网络与 API Key，全部本地可跑
- 真实 API 集成验证：安装后到 GUI「设置 → 视觉模型」点击**测试连接**（1x1 测试图真实请求），或在本地按需编写 `integration-real.mjs`（不入库）
- 修改 GUI 面板（dist/）后，需同步更新 dist 产物再执行 `install.ps1` 才会生效

## ❓ 常见问题

| 问题 | 解决 |
|---|---|
| 系统模型只有 1 个 | 面板会列出"可添加的视觉模型"；在 DSH 设置 → 模型 中给供应商添加视觉模型（如 kimi-k2.7-code / qwen3.6-plus / mimo-v2-omni） |
| 保存显示"未生效" | 确认已执行 `patch-host.ps1` 并重启 DSH（namespace 暴露补丁） |
| 发图仍提示"不支持图片" | 插件未加载（检查 设置 → 插件 中 dsh-vision 状态）/ 未打补丁 |
| DSH 升级后插件失效 | 重跑 `install.ps1` + `patch-host.ps1`（补丁点不匹配会明确报错，请把新版本宿主文件发 issue） |
| 跨机器部署 | 复制仓库 → 运行两个脚本 → 拷贝 `~/.dsh/settings.yaml` 中的 `dsh-vision:` 配置节 |
| 测试报错找不到文件 | 先执行 `install.ps1`（测试读取已安装到 profile 的插件副本） |
| 自定义模式请求失败 | 检查 Base URL 是否含 `/chat/completions` 后缀（应只填到版本路径为止）、Key 是否有效、模型名是否支持视觉 |

## 📝 版本记录

| 版本 | 日期 | 说明 |
|---|---|---|
| v1.0.0 | 2026-08-17 | 首个发布版：发图自动接管 + `view_image` 迭代式解析 + GUI 可视化配置（系统/自定义双模式）+ 宿主补丁方案 + 33 项自动化测试 |

## 🙏 致谢

- **思路借鉴**：[dsh-llm-image-routing](https://github.com/CuzWeAre/dsh-llm-image-routing)（MIT）——发图接管机制（`agent/pre-step` 描述 + 会话占位管理）参考了其 describe 模式设计思路；本插件代码为独立实现，并针对 DSH 0.1.0-rc.6 采用宿主补丁方案。
- **官方参考**：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的工具定义 DSL、settings 配置通道、`settings.section` 注册方式。
- **数据来源**：系统视觉模型清单来自 `@earendil-works/pi-ai` 内置模型目录。

## 📄 License

[MIT](./LICENSE)
