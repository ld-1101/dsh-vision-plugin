# dsh-vision 可视化配置面板 — 设计方案

> ✅ **v3 已实现**（2026-08）：两态 provider（系统模型 / 自定义）已落地，测试 19 项全过。
> 正文第 1–12 节为 v1 原始设计（历史存档）；附录 A（v3）为当前实现依据。

> 目标：让 URL、Key、提示词等配置**在 GUI 中可视化编辑**，保存后**立即生效**（无需重启、无需手改 YAML）。

## 1. 需求清单

| # | 需求 | 优先级 |
|---|---|---|
| R1 | GUI 中选择供应商预设（opencode-go / mimo / zhipu / … / custom） | 高 |
| R2 | GUI 中自定义 API Base URL | 高 |
| R3 | GUI 中填写/更换 API Key（只写不读，不显示明文） | 高 |
| R4 | GUI 中编辑默认提示词（多行文本） | 高 |
| R5 | 自定义模型名、Key 环境变量名 | 高 |
| R6 | 高级参数：timeout / maxTokens / temperature / remoteImageMode | 中 |
| R7 | 保存后**立即生效**（live），工具下一次调用即用新配置 | 高 |
| R8 | 单字段可**重置回默认值**（而不是整表单清空） | 中 |
| R9 | 保存/修改后可用「测试连接」按钮验证新配置 | 高 |
| R10 | 已有 YAML 配置（cordis.patch.yml）无缝兼容 | 高 |

## 2. 现状盘点

**已有能力**（当前插件）：
- ✅ 9 个供应商预设 + `resolveConfig`（手动值 > 环境变量 > 预设）三级解析
- ✅ `view_image` 工具（LLM 动态提示词 + defaultPrompt 兜底）
- ✅ GUI「视觉模型」面板：配置摘要（GET `/dsh-vision/config`）+ 测试按钮（POST `/dsh-vision/test`）
- ✅ 配置 Schema（Schemastery，含校验与默认值）

**缺口**：
- ❌ 配置只能手改 `cordis.patch.yml`（无 GUI 表单）
- ❌ 配置修改需重启 DSH 才生效（cordis config 加载时定值，闭包捕获）
- ❌ 前端无法安全读写 Key（目前摘要只显示"已配置"，无写入通道）

## 3. 架构设计

### 3.1 为什么走 DSH 官方 settings 通道（而不是自建写文件）

调研结论（读 `dsh-settings` / `dsh-settings-file` / `dsh-client-ui-settings` 源码）：

| 方案 | 问题 |
|---|---|
| ❌ 自建路由写 cordis.patch.yml | 破坏用户手写内容；无注释保留；无法触发热更新 |
| ❌ 写独立 JSON 文件 | 两套配置源；无 revision 冲突检测；外部编辑不同步 |
| ✅ **官方 settings 通道** | 免费获得：注释保留的原子写、revision 冲突检测、chokidar 外部编辑热发布、`role('secret')` 自动脱敏、跨进程锁 |

### 3.2 数据流

```
┌─ GUI（dsh-vision-client，settings.section「视觉模型」）────────────┐
│  表单：provider / apiBaseUrl / apiKey(只写) / apiKeyEnv / model    │
│        defaultPrompt(多行) / timeout / maxTokens / temperature /   │
│        remoteImageMode                                            │
│  操作：保存（批量 set）/ 单字段重置（unset）/ 测试连接              │
└──────────────┬───────────────────────────────────────────────────┘
               │ settingsScope.set('apiKey', v)  ← dsh-client-ui-settings 服务
               ▼
connection.api.settings.mutate({ ns:'dsh-vision', ops, expectedRevision })
（RPC，loopback-only；revision 冲突自动检测）
               ▼
┌─ host 侧 ─────────────────────────────────────────────────────────┐
│ dsh-settings 服务（ctx.settings）                                 │
│   ├─ register('dsh-vision', schema, { base: cordisConfig,         │
│   │                                       applies: 'live' })      │
│   └─ 解析 = schema 默认值 → composition base → 用户 section        │
│ dsh-settings-file provider                                        │
│   └─ 写 ~/.dsh/settings.yaml 的 dsh-vision section                 │
│      （注释保留、原子写、跨进程锁、chokidar 监听外部编辑）           │
└──────────────┬───────────────────────────────────────────────────┘
               │ scope.watch() → 内部配置引用更新（live，无需重启）
               ▼
dsh-vision 插件运行时（view_image 工具 / 测试路由）
  每次执行读 scope.get() 的最新解析值 → resolveConfig（预设兜底）
```

### 3.3 配置三层结构（官方语义，直接复用）

```
┌───────────────────────────────┐
│ ① schema 默认值（插件内置）      │ ← 兜底：默认 opencode-go 等
├───────────────────────────────┤
│ ② composition base            │ ← 旧 cordis.patch.yml 的 config 块
│   （cordis config 传进来）      │   自动迁移为此层，零破坏兼容
├───────────────────────────────┤
│ ③ 用户 section（settings.yaml）│ ← GUI 表单写入，优先级最高
│   dsh-vision: {...}           │   单字段 unset 即回落到②/①
└───────────────────────────────┘
```

## 4. 配置模型（settings namespace: `dsh-vision`）

### 4.1 可填字段总览（11 个可填 + 只读展示项）

**A 组 · 连接配置（5 个可填）**

| # | 字段 | 类型/约束 | 默认值 | 留空语义 | 控件 |
|---|---|---|---|---|---|
| 1 | `provider` | enum，9 值 | `opencode-go` | 无留空 | 下拉（选项带供应商名） |
| 2 | `apiBaseUrl` | string | `''` | **留空 = 用预设端点** | 单行文本 |
| 3 | `apiKey` | string，`role('secret')` | `''` | **留空 = 不改**（若配了 apiKeyEnv 则用它） | 密码框（只写不读） |
| 4 | `apiKeyEnv` | string | `''` | 留空 = 无环境变量 | 单行文本 |
| 5 | `model` | string | `''` | **留空 = 用预设模型** | 单行文本 |

**B 组 · 提示词（2 个可填）**

| # | 字段 | 类型/约束 | 默认值 | 说明 | 控件 |
|---|---|---|---|---|---|
| 6 | `defaultPrompt` | string | 中文详细描述提示词 | LLM 未传 `prompt` 参数时的兜底提示词 | 多行文本（4 行） |
| 7 | `systemPrompt` | string | `''` | 发给视觉 API 的 system 消息（"你是图片识别助手…"）；留空 = 不发送 system 角色 | 多行文本（2 行） |

> 说明：工具参数 `prompt`（LLM 每次动态生成）不是配置字段——它由 Agent 调用时生成，配置面板只管理"兜底默认值"。

**C 组 · 请求参数（4 个可填，折叠区）**

| # | 字段 | 类型/约束 | 默认值 | 说明 | 控件 |
|---|---|---|---|---|---|
| 8 | `timeoutMs` | number，1000–300000 | 90000 | 请求超时 | 数字 |
| 9 | `maxTokens` | number，64–8192 | 2048 | 视觉模型最大输出 | 数字 |
| 10 | `temperature` | number，0–2 | 0.2 | 采样温度 | 数字 |
| 11 | `remoteImageMode` | enum | `direct` | URL 图片直传 or 下载转 base64 | 下拉 |

**只读展示（不可填，用于帮助用户理解生效状态）**

| 展示项 | 来源 |
|---|---|
| 生效摘要行：当前 provider / 端点 / 模型 / Key 状态 | `GET /dsh-vision/config`（host 按 scope 解析值生成，不含 Key 明文） |
| 预设预览：选中 provider 的预设端点 + 推荐模型 | 前端内置常量表（与 host `PROVIDER_PRESETS` 同步） |
| 字段来源徽标：`预设` / `自定义` / `默认` | describe 的 `user` 层（字段是否被用户覆盖） |

### 4.2 Key 的三种呈现状态

```
● 已配置(手动)      ← apiKey 字段有值（sidecar 标记，值永不出 host）
● 环境变量 OPENCODE_GO_API_KEY  ← apiKey 空 + apiKeyEnv 指向的变量存在
○ 未配置           ← 两者皆无（测试按钮会明确报错）
```

## 5. UI 设计（设置 → 视觉模型 面板）

### 5.1 布局草图

```
┌────────────────────────────────────────────────┐
│ 视觉模型（dsh-vision）            ● 配置实时生效  │
│────────────────────────────────────────────────│
│ ▌连接配置                                      │
│  供应商预设    [opencode-go ▾]                  │
│    └ 预设端点 https://opencode.ai/zen/go/v1     │
│    └ 预设模型 mimo-v2.5                        │
│  API Base URL [___________________________] ↺  │
│    └ 徽标: 预设值 或 自定义                      │
│  API Key      [___________________________]    │
│    └ 徽标: ●已配置(手动) / ●环境变量 / ○未配置    │
│    └ 提示: 留空=不修改，输入=覆盖保存            │
│  Key 环境变量 [___________________________] ↺  │
│  模型名称     [___________________________] ↺  │
│                                                │
│ ▌提示词                                        │
│  系统提示词(可选) [系统角色消息，留空不发送__] ↺  │
│  默认提示词      [请详细描述这张图片的内容…___] ↺  │
│                                                │
│ ▸ 高级参数                                      │
│   ▸ 请求超时 [90000] ms   最大输出 [2048] token │
│   ▸ 采样温度 [0.2]    URL 图片 [direct ▾]      │
│                                                │
│ [💾 保存更改]  [全部重置为默认]   (2 处未保存改动) │
│────────────────────────────────────────────────│
│ ▌连接测试（用上方已保存配置发起真实请求）          │
│  [🔌 测试连接]                                  │
│  ✅ 连接成功（312ms）：这是一张 1x1 像素的测试图… │
└────────────────────────────────────────────────┘
```

### 5.2 控件与交互状态

| 控件 | 交互细节 |
|---|---|
| 下拉（provider / remoteImageMode） | 选中即入草稿；切换 provider 只更新预设预览行，**不自动清空** baseUrl/model 的用户覆盖值（避免丢输入） |
| 单行文本 | 失焦或输入即入草稿；右侧 ↺ 仅当该字段有用户覆盖值时出现，点击 = 计划 unset（回落预设/默认） |
| 密码框（apiKey） | 永远空值显示（读不到明文）；placeholder 显示"留空=不修改"；输入即计划覆盖；无 ↺ 按钮（unset 通过清空+保存表达，或保留 ↺ 清 Key） |
| 多行文本（提示词） | 4 行高度；内容变化入草稿 |
| 数字 | 失焦校验：非法（非数字/超范围）标红并禁用保存 |
| 保存按钮 | 无草稿时禁用；点击批量提交所有 staged 字段（每字段一次 `scope.set`/`scope.unset`），提交后 read-back 刷新 |
| 全部重置 | 二次确认 → 对 11 个字段逐个 `unset` → 全部回落 schema 默认层 |
| 测试按钮 | 始终用 host 当前生效配置（已保存的），与草稿无关；显示 latency + 模型返回摘要 |

### 5.3 字段状态机

```
每个字段：
  clean ──输入/选择──▶ dirty ──保存(set/unset)──▶ saving ──成功──▶ clean(生效)
                       ▲                            │
                       └──────── 失败(标红) ─────────┘
字段值来源徽标（读自 describe 的 user 层）：
  无徽标 = 默认层    ·    `自定义` = 用户覆盖（可 ↺）   ·   `预设` = 留空由预设兜底
```

### 5.4 前端数据绑定（dsh-vision-client）

```
settingsScope.bind({ namespace: 'dsh-vision' })
   ├─ getSnapshot()          → { value: 生效值, user: 用户覆盖层, secrets: [已设置标记] }
   ├─ subscribe()            → host 更新/外部改 settings.yaml 时自动刷新表单
   ├─ set(field, value)      → 单字段写入（走 RPC settings.mutate，revision 冲突检测）
   └─ unset(field)           → 单字段回落
测试/摘要：
   fetch('/dsh-vision/config')   → 生效摘要（含 keySource，不含明文）
   fetch('/dsh-vision/test')     → 真实连接测试
```

### 5.5 前端依赖注入变化

```
exports.inject = ["slots", "settingsScope"]   // 新增 settingsScope（dsh-client-ui-settings 提供，设置页内置，可用）
```

## 6. 安全设计

1. **Key 永不回传**：schema 中 `apiKey` 标 `role('secret')`，`settings.describe` 跨 wire 前自动移除该字段值，仅 sidecar 标记"已设置"——前端渲染只写输入框（官方 WebSearchCard 同款模式）
2. **Key 不落前端**：写入走 RPC（loopback-only），`settings.yaml` 中为唯一落盘点（本机）
3. `/dsh-vision/config` 摘要路由保持现状：只返回 keyConfigured/keySource，永不含明文
4. **revision 冲突检测**：settings mutate 带 expectedRevision，多窗口/多进程写不互相覆盖
5. 前端不渲染 schema 表单（不依赖 schema-form 内部 API），字段逐个受 host schema 校验

## 7. 生效机制

- `register(..., { applies: 'live' })`：保存 → `scope.watch` 触发 → 插件内部配置引用更新
- `view_image` 工具执行时读 `scope.get()` 最新值（替换现在的 config 闭包捕获）
- 外部手改 `settings.yaml` 也走同一 watch 通道（chokidar），GUI 同步刷新
- **唯一需要重启的场景**：修改的是 cordis.patch.yml 的 base 层（基本不会再用到）

## 8. 兼容与迁移

- 插件 cordis `Config` schema 保留（`export const Config`），cordis 传入的 config 作为
  `register(..., { base: config })` 的 composition base 层
- 用户过去在 `cordis.patch.yml` 写的 config → 自动成为 base 层，GUI 可逐字段覆盖/reset
- `resolveConfig` 保留（预设兜底逻辑），输入从"闭包 config"改为"scope 解析值"
- 测试路由与摘要路由路径不变（前端 fetch 兼容）

## 9. 文件改动清单

| 文件 | 改动 |
|---|---|
| `src/index.ts` | inject 加 `settings`；`apply` 中 `ctx.settings.register('dsh-vision', schema, { base: config, applies: 'live' })`；工具/路由改用 `scope.get()`；`apiKey` 加 `.role('secret')` |
| `dist/lib/client.js` | 重写面板：表单（staged edits + 单字段重置 + 保存）+ 测试按钮；inject 加 `settingsScope`；用 `settingsScope.bind({ namespace: 'dsh-vision' })` 读写 |
| `dist/lib/index.js` | 不变（空 apply） |
| `install.ps1` | 不变（client 包结构不变） |
| `test/e2e.mts` | mock `ctx.settings`（register/scope.get/watch/update），验证：base 层兼容、live 更新后工具用新配置、secret 脱敏行为 |
| `test/client-bundle.mts` | 更新契约：inject 含 settingsScope；表单组件 props（scope 快照） |
| `README.md` | 配置方式改为 GUI 优先，YAML 为备选 |

## 10. 测试计划

| 层 | 用例 |
|---|---|
| node | base 层（旧 patch config）→ scope 解析值正确合并 |
| node | scope.update 后 `view_image` 用新 URL/Key/提示词（live） |
| node | `role('secret')`：describe 结果不含 apiKey 值、含已配置标记 |
| node | 单字段 unset 回落 base/默认层 |
| node | 测试路由读 scope.get() 最新值 |
| bundle | settingsScope mock：表单快照渲染、set/unset 调用形状 |
| bundle | 组件 props/注册参数契约（inject 含 settingsScope） |
| 手工 | 重启后在 GUI 改 URL/Key/提示词 → 保存 → 测试连接 → 对话中用 view_image 验证新配置生效 |

## 11. 实施步骤（设计确认后执行）

1. host：`src/index.ts` 接入 `ctx.settings`（register + watch + scope.get 重构）
2. 重写 `dist/lib/client.js` 配置表单 UI
3. 更新两个测试文件并跑通
4. `install.ps1` 重新安装 → 重启 DSH → GUI 验证
5. 更新 README（GUI 配置方式 + 迁移说明）

## 12. 风险与对策

| 风险 | 对策 |
|---|---|
| `settingsScope` 服务在桌面版 client 环境可用性 | dsh-client-ui-settings 为 dsh-web-app 内置（设置页已用），同 profile 可用 |
| secret 字段被 role 声明后 describe 缺值导致表单误判 | 用 sidecar `secrets` 数组（path + set 布尔）渲染"已配置"徽标 |
| provider 切换时 baseUrl/model 仍留有旧用户覆盖值 | 前端在切换预设时提示"重置这两个字段可回预设值"（不自动 unset，避免丢用户输入） |
| 数字字段非法输入 | host schema 校验拒绝（min 约束），表单标红并阻止保存 |

---

# 附录 A：v2 设计更新（预设全展示 + 视觉模型可选 + 系统模型复用）

> 用户追加需求：① 预设全部显示；② 每个预设下"支持视觉的模型"可选；③ 自定义与预设分离；
> ④ 检测 DSH 系统已启用的模型并复用其 API Key，或手动从已添加模型中选择。

## A.1 调研结论（系统能力）

| 系统 API | 用途 | 结论 |
|---|---|---|
| `ctx.llm.listProviders()` | 枚举已注册供应商 | pi-ai（xiaomi/opencode-go 等）+ deepseek-official 等都在列 |
| `ctx.llm.listModels(provider)` | 枚举某供应商模型 | 返回 `{ provider, id, name, inputModalities }`——**`inputModalities` 含 `image` = 视觉模型** |
| `ctx.llm.stream({ provider, model, messages })` | 发起模型调用 | **消息内容块原生支持 `type:'image'`**（`contentHasImage` 系统级图像策略），Key/端点/重试由系统处理，插件零接触 |
| `ctx.credentials.resolve(ref)` | 解析 Key 引用 | 从 `.credentials.yaml` / 环境变量 / 配置 fallback 取值 |
| `@earendil-works/pi-ai` 内置目录 | 40+ 供应商模型库 | `getBuiltinModels()` 按供应商给出含 `input` 模态的权威模型列表 |

**实测系统内视觉模型**（pi-ai 目录，本机 llm-pi-ai 已启用 xiaomi/opencode-go）：
- `xiaomi`：`mimo-v2.5`、`mimo-v2-omni` ★（其余 v2-flash/v2-pro 等仅 text）
- `opencode-go`（openai-completions 协议）：`mimo-v2.5`、`kimi-k2.6`、`kimi-k2.7-code`、`kimi-k3`、`qwen3.6-plus` ★（anthropic-messages 协议另有 minimax-m3/qwen3.7-plus，本插件不支持）

## A.2 配置模型 v3（provider 两态——按用户要求精简）

```
provider: 'system'   → 复用 DSH 系统已启用模型（Key 零配置），
                       只显示支持视觉能力（inputModalities 含 image）的模型
        | 'custom'   → 完全手动（独立区块）
```

> v3 变更：**移除全部预设供应商**（v2 的 8 个预设不再提供），只保留系统模型与自定义两个模式。

| 字段 | 语义 |
|---|---|
| `provider` | `'system'` / `'custom'` |
| `systemProvider` / `systemModel` | provider=system：系统供应商 id + 视觉模型 id |
| `apiBaseUrl` / `apiKey` / `apiKeyEnv` / `model` | 仅 custom 使用；system 模式不填（系统凭证） |
| `defaultPrompt` / `systemPrompt` / `timeoutMs` / `maxTokens` / `temperature` / `remoteImageMode` | 两种模式共用（提示词 + 高级参数不变） |

## A.3 系统视觉模型列表（唯一来源：ctx.llm 动态枚举）

```
GET /dsh-vision/models →
{
  "system": [
    { "provider": "xiaomi",      "providerName": "Xiaomi",
      "model": "mimo-v2.5",      "modelName": "MiMo-V2.5" },
    { "provider": "xiaomi",      "providerName": "Xiaomi",
      "model": "mimo-v2-omni",   "modelName": "MiMo-V2-Omni" },
    { "provider": "opencode-go", "providerName": "OpenCode Zen Go",
      "model": "kimi-k2.7-code", "modelName": "Kimi K2.7 Code" },
    ...
  ]
}
```

- 枚举：`ctx.llm.listProviders()` × `ctx.llm.listModels(provider)`，**过滤 `inputModalities` 含 `image` 的模型**
- **不按协议过滤**：系统模式走 `ctx.llm.stream`，OpenAI / Anthropic / Responses 协议的转换由 pi-ai 完成，插件零感知
  → opencode-go 的 `minimax-m3`、`qwen3.7-plus`（anthropic-messages 协议）也会出现在列表中
- deepseek-official（纯文本）等供应商自动被过滤，不会出现
- 纯动态，系统新增/移除供应商或模型时列表自动跟随，无静态表需要维护
- 前端一次拉取渲染；列表为空时提示"系统未检测到支持视觉的模型，请使用自定义"

**本机实测可见**（llm-pi-ai 已启用 xiaomi / opencode-go）：
- `xiaomi`：`mimo-v2.5`、`mimo-v2-omni`
- `opencode-go`：`mimo-v2.5`、`kimi-k2.6`、`kimi-k2.7-code`、`kimi-k3`、`qwen3.6-plus`（openai-completions）；`minimax-m3`、`qwen3.7-plus`（anthropic-messages）

## A.4 调用模式 v3（双通道）

```
provider=system：  ctx.llm.stream({ provider, model,
                     messages:[{ role:'user', content:[
                       { type:'text', text: prompt },
                       { type:'image', image: <dataURI 或 buffer> }
                     ]}]})
                   → 系统解析 Key、端点、重试、超时、协议转换（pi-ai）；插件不接触 Key

provider=custom：  固定 OpenAI 兼容协议（POST {baseUrl}/chat/completions）
                   → fetch 直连（apiBaseUrl + apiKey/apiKeyEnv + model）
```

> **自定义模式不提供"接口类型"选择**：固定 OpenAI 兼容（事实标准，各主流服务商均提供）。
> 需要 Anthropic/Responses 等其他协议的模型时，走"系统模型"模式（pi-ai 自动转换）。
> 若未来确有需求，扩展点为 fetch 层抽象（新增协议转换器 + 接口类型下拉），本设计不预置。

### 自定义模式：支持的接口 URL 说明（UI 内置提示）

自定义区块内固定显示说明文字 + 示例（可折叠"查看常见服务商示例"）：

```
API Base URL 填写说明：
  · 只支持 OpenAI 兼容接口（POST {baseUrl}/chat/completions）
  · 填 Base URL，不要带 /chat/completions 后缀（插件自动拼接）
  · 认证方式：Authorization: Bearer <Key>（兼容部分服务商的 api-key 头）

常见 OpenAI 兼容端点示例：
  智谱 GLM-4V     https://open.bigmodel.cn/api/paas/v4
                    （glm-4v-flash / glm-4v-plus）
  通义千问 VL     https://dashscope.aliyuncs.com/compatible-mode/v1
                    （qwen-vl-max / qwen-vl-plus）
  OpenAI          https://api.openai.com/v1
                    （gpt-4o / gpt-4o-mini）
  火山方舟豆包    https://ark.cn-beijing.volces.com/api/v3
                    （ep-xxxx 推理接入点 ID）
  硅基流动        https://api.siliconflow.cn/v1
                    （Qwen/Qwen2.5-VL-72B-Instruct 等）
  OpenRouter      https://openrouter.ai/api/v1
  OpenCode Go     https://opencode.ai/zen/go/v1
  小米 MiMo       https://api.xiaomimimo.com/v1
```

- 示例表同时在前端（展示）与 host（`GET /dsh-vision/models` 的 `customExamples` 字段）维护一份，前端空态/帮助区渲染
- 不强制校验 URL 归属（任何 OpenAI 兼容端点都可用，含私有中转站）

> 系统模式的 image 块格式需在实现时确认（`{ type:'image', ... }` 的字段形状，参考 dsh-llm content 类型与 pi-ai 的 image 转换）。

## A.5 前端设计 v3（设置 → 视觉模型）

```
┌ 连接配置 ─────────────────────────────────────────────┐
│ ◉ 系统模型（复用系统 Key，无需填写）                     │
│    └ 支持视觉的模型列表（GET /dsh-vision/models）：      │
│       ○ mimo-v2.5 · Xiaomi        ●已启用              │
│       ○ mimo-v2-omni · Xiaomi     ●已启用              │
│       ○ mimo-v2.5 · OpenCode Zen Go  ●已启用           │
│       ○ kimi-k2.7-code · OpenCode Zen Go               │
│       └ 或从下拉手动选： [已添加的视觉模型 ▾]            │
│ ──────────────────────────────────────────────────    │
│ ○ 自定义模型（独立区块）                                │
│   API Base URL [____________________]                 │
│   API Key      [____________________]（只写不读）      │
│   Key 环境变量  [____________________]                 │
│   模型名称     [____________________]                  │
│   ℹ 只支持 OpenAI 兼容接口（chat/completions），        │
│     填 Base URL（不带 /chat/completions 后缀）         │
│     ▸ 查看常见服务商端点示例（智谱/通义/OpenAI/豆包/…）   │
└───────────────────────────────────────────────────────┘
（下方保持：提示词区 / 高级参数 / 保存重置 / 测试连接）
```

- 两个模式单选互斥（radio），选 system 则 custom 输入灰显（或折叠）
- 系统模型列表 radio 单选；`●已启用` 徽标 = 该供应商凭证已配置
- 自定义区块：URL/Key/模型全手填（Key 走 secret 只写机制），模型名自由文本

## A.6 配置解析优先级 v3

```
provider=system:   systemProvider/systemModel → ctx.llm.stream（系统凭证）
provider=custom:   apiBaseUrl + (apiKey > apiKeyEnv 环境变量) + model
```

## A.7 新增/改动文件

| 文件 | 改动 |
|---|---|
| `src/index.ts` | inject 加 `llm`/`credentials`；`GET /dsh-vision/models`（系统视觉模型枚举，过滤 image 模态）；`view_image` 支持 system 模式（走 ctx.llm）；移除 PROVIDER_PRESETS |
| `dist/lib/client.js` | 两段式连接配置 UI（系统模型列表 / 自定义）+ 提示词/高级参数/测试区 |
| `test/e2e.mts` | 新增：system 模式走 ctx.llm、models 枚举过滤 image 模态、custom 模式回归 |
| `test/client-bundle.mts` | 更新契约（两段 UI 注册） |
| `docs/` | 本设计文档 |

## A.8 待确认项（实现前）

1. `ctx.llm.stream` 消息中 image 内容块的确切形状（`{ type:'image', ... }` 的字段）
2. `listProviders` 是否包含 deepseek-official（纯文本，会被 image 过滤自动排除，无影响）
3. 系统模式是否要支持"图片 URL 直传"（image 块可能只接受本地数据）——实现时看 pi-ai 的 image 序列化
