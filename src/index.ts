import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, resolve } from 'node:path'
import { Service, type Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { BlockAssembler, contentHasImage, createUserMessage } from '@deepseek-ai/dsh-llm'

export const name = 'dsh-vision'

/** 静态兜底视觉模型表：系统枚举失败/为空时使用，保证 GUI 永远有可选模型（与 pi-ai 内置目录一致） */
export const FALLBACK_SYSTEM_MODELS = [
  { provider: 'xiaomi', providerName: 'Xiaomi', model: 'mimo-v2.5', modelName: 'MiMo-V2.5' },
  { provider: 'xiaomi', providerName: 'Xiaomi', model: 'mimo-v2-omni', modelName: 'MiMo-V2-Omni' },
  { provider: 'opencode-go', providerName: 'OpenCode Zen Go', model: 'mimo-v2.5', modelName: 'MiMo-V2.5' },
  { provider: 'opencode-go', providerName: 'OpenCode Zen Go', model: 'kimi-k2.6', modelName: 'Kimi K2.6' },
  { provider: 'opencode-go', providerName: 'OpenCode Zen Go', model: 'kimi-k2.7-code', modelName: 'Kimi K2.7 Code' },
  { provider: 'opencode-go', providerName: 'OpenCode Zen Go', model: 'kimi-k3', modelName: 'Kimi K3' },
  { provider: 'opencode-go', providerName: 'OpenCode Zen Go', model: 'qwen3.6-plus', modelName: 'Qwen3.6 Plus' },
  { provider: 'opencode-go', providerName: 'OpenCode Zen Go', model: 'qwen3.7-plus', modelName: 'Qwen3.7 Plus' },
  { provider: 'opencode-go', providerName: 'OpenCode Zen Go', model: 'minimax-m3', modelName: 'MiniMax-M3' },
  { provider: 'opencode-go', providerName: 'OpenCode Zen Go', model: 'grok-4.5', modelName: 'Grok 4.5' },
]

/** 常见 OpenAI 兼容端点示例（自定义模式帮助信息，同时供前端渲染） */
export const CUSTOM_EXAMPLES = [
  { label: '智谱 GLM-4V', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: 'glm-4v-flash / glm-4v-plus' },
  { label: '通义千问 VL', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: 'qwen-vl-max / qwen-vl-plus' },
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: 'gpt-4o / gpt-4o-mini' },
  { label: '火山方舟（豆包）', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: 'ep-xxxx 推理接入点 ID' },
  { label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', models: 'Qwen/Qwen2.5-VL-72B-Instruct 等' },
  { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: '任意视觉模型' },
  { label: 'OpenCode Go', baseUrl: 'https://opencode.ai/zen/go/v1', models: 'mimo-v2.5 / kimi-k2.7-code 等' },
  { label: '小米 MiMo', baseUrl: 'https://api.xiaomimimo.com/v1', models: 'mimo-v2.5 / mimo-v2-omni' },
]

export interface Config {
  /** 连接模式：system = 复用 DSH 系统已启用模型；custom = 手动填 OpenAI 兼容端点 */
  provider: 'system' | 'custom'
  /** system 模式：系统供应商 id */
  systemProvider: string
  /** system 模式：系统模型 id */
  systemModel: string
  /** custom 模式：OpenAI 兼容 API Base URL（不含 /chat/completions 后缀） */
  apiBaseUrl: string
  /** custom 模式：API Key（手动填写；留空时尝试 apiKeyEnv 环境变量） */
  apiKey: string
  /** custom 模式：API Key 环境变量名 */
  apiKeyEnv: string
  /** custom 模式：视觉模型名称 */
  model: string
  /** 默认视觉理解提示词：调用方未传入 prompt 时使用 */
  defaultPrompt: string
  /** 发给视觉 API 的 system 消息（留空不发送） */
  systemPrompt: string
  /** 请求超时（毫秒） */
  timeoutMs: number
  /** 视觉模型最大输出 token 数 */
  maxTokens: number
  /** 采样温度 */
  temperature: number
  /** URL 图片处理方式：direct = 直接把 URL 传给 API；download = 下载后转 base64 */
  remoteImageMode: 'direct' | 'download'
}

export const Config = Schema.object({
  provider: Schema.union(['system', 'custom'])
    .default('system')
    .description('连接模式：system = 复用 DSH 系统已启用模型（Key 零配置）；custom = 手动填 OpenAI 兼容端点'),
  systemProvider: Schema.string()
    .default('')
    .description('system 模式：系统供应商 id（如 xiaomi / opencode-go）'),
  systemModel: Schema.string()
    .default('')
    .description('system 模式：系统模型 id（如 mimo-v2.5），仅支持视觉能力的模型'),
  apiBaseUrl: Schema.string()
    .default('')
    .description('custom 模式：OpenAI 兼容 API Base URL，如 https://open.bigmodel.cn/api/paas/v4'),
  apiKey: Schema.string()
    .default('')
    .role('secret')
    .description('custom 模式：API Key；留空时读取 apiKeyEnv 环境变量'),
  apiKeyEnv: Schema.string()
    .default('')
    .description('custom 模式：API Key 环境变量名，如 OPENCODE_GO_API_KEY'),
  model: Schema.string()
    .default('')
    .description('custom 模式：视觉模型名称'),
  defaultPrompt: Schema.string()
    .default('请详细描述这张图片的内容，包括主要物体、人物、文字（OCR）、场景和布局。')
    .description('默认视觉理解提示词：当工具调用未传入 prompt 参数时使用'),
  systemPrompt: Schema.string()
    .default('')
    .description('发给视觉 API 的 system 消息（留空不发送），如“你是专业的图片识别助手，输出简洁准确”'),
  timeoutMs: Schema.number()
    .default(90000)
    .min(1000)
    .description('请求超时（毫秒）'),
  maxTokens: Schema.number()
    .default(2048)
    .min(64)
    .description('视觉模型最大输出 token 数'),
  temperature: Schema.number()
    .default(0.2)
    .min(0)
    .max(2)
    .description('采样温度，0-2'),
  remoteImageMode: Schema.union(['direct', 'download'])
    .default('direct')
    .description('URL 图片处理方式：direct = 直接把 URL 传给 API（省流量）；download = 下载后转 base64'),
})

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

/** 内置 1x1 PNG（用于连接测试的最小请求） */
const TEST_IMAGE_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** 将图片参数解析为可直接使用的 image_url（data URI 或 http URL） */
async function resolveImageUrl(image: string, mode: Config['remoteImageMode'], signal: AbortSignal): Promise<{ url: string; source: string }> {
  // 1) http(s) URL
  if (/^https?:\/\//i.test(image)) {
    if (mode === 'direct') {
      return { url: image, source: image }
    }
    const res = await fetch(image, { signal })
    if (!res.ok) {
      throw new Error(`下载图片失败 (HTTP ${res.status}): ${image}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]?.trim() || 'image/jpeg'
    return { url: `data:${mime};base64,${buf.toString('base64')}`, source: image }
  }

  // 2) data URI（测试用）
  if (image.startsWith('data:')) {
    return { url: image, source: 'data URI' }
  }

  // 3) 本地文件路径
  const p = isAbsolute(image) ? image : resolve(process.cwd(), image)
  let buf: Buffer
  try {
    buf = await readFile(p)
  } catch (err) {
    throw new Error(`无法读取图片文件: ${p}（${(err as Error).message}）`)
  }
  const mime = MIME_BY_EXT[extname(p).toLowerCase()] ?? 'image/png'
  return { url: `data:${mime};base64,${buf.toString('base64')}`, source: p }
}

/** 把 image_url（data URI / http URL）转成字节 + 媒体类型 */
async function imageUrlToBytes(url: string, signal: AbortSignal): Promise<{ data: Buffer; mediaType: string }> {
  if (url.startsWith('data:')) {
    const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url)
    if (!match) throw new Error('无效的 data URI')
    const mediaType = match[1] || 'image/png'
    const data = match[2]
      ? Buffer.from(match[3], 'base64')
      : Buffer.from(decodeURIComponent(match[3]), 'utf8')
    return { data, mediaType }
  }
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`下载图片失败 (HTTP ${res.status}): ${url}`)
  const data = Buffer.from(await res.arrayBuffer())
  const mediaType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0]?.trim() || 'image/jpeg'
  return { data, mediaType }
}

/** 调用 OpenAI 兼容的视觉模型 chat/completions 接口（custom 模式） */
async function callVisionModel(ep: { baseUrl: string; model: string; apiKey: string }, config: Config, imageUrl: string, prompt: string, signal: AbortSignal): Promise<string> {
  const base = ep.baseUrl.replace(/\/+$/, '')
  const timeoutSignal = AbortSignal.timeout(config.timeoutMs)
  const combined = AbortSignal.any([signal, timeoutSignal])
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ep.apiKey}`,
  }
  // 兼容部分服务商（如小米 MiMo）的 api-key 头
  headers['api-key'] = ep.apiKey
  const messages: Array<Record<string, unknown>> = []
  if (config.systemPrompt?.trim()) {
    messages.push({ role: 'system', content: config.systemPrompt.trim() })
  }
  messages.push({
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: imageUrl } },
    ],
  })
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: ep.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
    }),
    signal: combined,
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 600)
    } catch {
      /* ignore */
    }
    throw new Error(`视觉模型 API 请求失败 (HTTP ${res.status}): ${detail}`)
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>
    error?: { message?: string }
  }
  if (data.error?.message) {
    throw new Error(`视觉模型返回错误: ${data.error.message}`)
  }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('视觉模型未返回有效内容')
  }
  return content.trim()
}

/** 调用 DSH 系统模型（system 模式）：走 ctx.llm，Key/端点/协议由系统处理 */
async function callSystemModel(ctx: VisionCtx, config: Config, imageUrl: string, prompt: string, signal: AbortSignal): Promise<string> {
  const { data, mediaType } = await imageUrlToBytes(imageUrl, signal)
  const ref = await ctx.attachments.saveImage({ data, mediaType })
  const assembler = new BlockAssembler()
  const messages: Array<Record<string, unknown>> = [{
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      { type: 'image', attachment: ref },
    ],
  }]
  const options: Record<string, unknown> = {
    provider: config.systemProvider,
    model: config.systemModel,
    messages,
    signal,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  }
  if (config.systemPrompt?.trim()) options.system = config.systemPrompt.trim()
  for await (const chunk of ctx.llm.stream(options)) {
    assembler.push(chunk)
  }
  const text = assembler.blocks()
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim()
  if (!text) throw new Error('系统模型未返回有效文本内容')
  return text
}

/** 工具执行所需的 ctx 面 */
interface VisionCtx {
  llm: {
    stream(options: Record<string, unknown>): AsyncIterable<Record<string, unknown>>
  }
  attachments: {
    saveImage(input: { data: Buffer; mediaType: string }): Promise<unknown>
  }
}

/** custom 模式配置解析：手动值 > apiKeyEnv 环境变量 */
export function resolveCustomConfig(config: Config): { baseUrl: string; model: string; apiKey: string } {
  const envName = config.apiKeyEnv.trim()
  const apiKey = config.apiKey.trim() || (envName ? process.env[envName] ?? '' : '')
  return { baseUrl: config.apiBaseUrl.trim(), model: config.model.trim(), apiKey }
}

/** 当前生效配置的安全摘要（不暴露 Key 明文） */
export function configSummary(config: Config): Record<string, unknown> {
  if (config.provider === 'system') {
    return {
      provider: 'system',
      systemProvider: config.systemProvider,
      systemModel: config.systemModel,
      keyConfigured: true,
      keySource: 'system',
      defaultPrompt: config.defaultPrompt,
      systemPrompt: config.systemPrompt,
      remoteImageMode: config.remoteImageMode,
    }
  }
  const ep = resolveCustomConfig(config)
  const envName = config.apiKeyEnv.trim()
  return {
    provider: 'custom',
    endpoint: ep.baseUrl,
    model: ep.model,
    keyConfigured: Boolean(ep.apiKey),
    keySource: config.apiKey.trim() ? 'manual' : (envName && process.env[envName] ? `env:${envName}` : 'none'),
    defaultPrompt: config.defaultPrompt,
    systemPrompt: config.systemPrompt,
    remoteImageMode: config.remoteImageMode,
  }
}

/** 枚举系统支持视觉能力的模型（inputModalities 含 image） */
export async function listSystemVisionModels(ctx: { llm: { listProviders(): Array<{ id: string; name?: string }>; listModels(provider: string): Promise<Array<{ id: string; name: string; inputModalities?: string[] }>> } }): Promise<Array<{ provider: string; providerName: string; model: string; modelName: string }>> {
  const out: Array<{ provider: string; providerName: string; model: string; modelName: string }> = []
  for (const provider of ctx.llm.listProviders()) {
    try {
      const models = await ctx.llm.listModels(provider.id)
      for (const m of models) {
        if (m.inputModalities?.includes('image')) {
          out.push({ provider: provider.id, providerName: provider.name ?? provider.id, model: m.id, modelName: m.name })
        }
      }
    } catch {
      // 单个供应商枚举失败不影响其他
    }
  }
  return out
}

/** 系统尚未启用的视觉模型建议（pi-ai 目录里有、但 DSH 模型白名单未配置的），引导用户在 DSH 设置 → 模型中添加 */
export function missingVisionSuggestions(current: Array<{ provider: string; model: string }>): Array<{ provider: string; providerName: string; model: string; modelName: string }> {
  const present = new Set(current.map((m) => `${m.provider}/${m.model}`))
  return FALLBACK_SYSTEM_MODELS.filter((m) => !present.has(`${m.provider}/${m.model}`))
}

/** 连接测试：用 1x1 PNG 发最小请求 */
export async function testConnection(ctx: VisionCtx, config: Config, signal: AbortSignal): Promise<{ ok: boolean; latencyMs: number; message: string }> {
  if (config.provider === 'system') {
    if (!config.systemProvider || !config.systemModel) {
      return { ok: false, latencyMs: 0, message: '未选择系统模型（systemProvider / systemModel 为空）' }
    }
    const started = Date.now()
    try {
      const result = await callSystemModel(ctx, config, TEST_IMAGE_DATA_URI, '测试连接：请用一句话描述这张图片', signal)
      return { ok: true, latencyMs: Date.now() - started, message: result.slice(0, 120) }
    } catch (err) {
      return { ok: false, latencyMs: Date.now() - started, message: (err as Error).message }
    }
  }
  const ep = resolveCustomConfig(config)
  if (!ep.apiKey) return { ok: false, latencyMs: 0, message: '未配置 API Key（apiKey 为空且 apiKeyEnv 环境变量不存在）' }
  if (!ep.baseUrl) return { ok: false, latencyMs: 0, message: '未配置 apiBaseUrl' }
  if (!ep.model) return { ok: false, latencyMs: 0, message: '未配置 model' }
  const started = Date.now()
  try {
    const result = await callVisionModel(ep, config, TEST_IMAGE_DATA_URI, '测试连接：请用一句话描述这张图片', signal)
    return { ok: true, latencyMs: Date.now() - started, message: result.slice(0, 120) }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - started, message: (err as Error).message }
  }
}

/** 读取请求体（JSON） */
function readBody(req: { on: (event: string, cb: (chunk: Buffer) => void) => void }): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** 发送 JSON 响应 */
function sendJson(res: { writeHead: (code: number, headers: Record<string, string>) => void; end: (body: string) => void }, status: number, payload: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

/** 路由 handler 的 req/res 形状 */
interface HttpReq { method?: string; on: (event: string, cb: (chunk: Buffer) => void) => void }
interface HttpRes { writeHead: (code: number, headers: Record<string, string>) => void; end: (body: string) => void }

// ───────────────────────── 发图自动接管（图片桥 + pre-step 描述） ─────────────────────────

/** 图片桥服务：宿主 admission 在拒绝图片前咨询它；可接管时放行，由 pre-step 转文本描述 */
export class VisionImageBridge extends Service {
  private getConfig: () => Config

  constructor(ctx: Context, getConfig: () => Config) {
    super(ctx, 'visionImageBridge')
    this.getConfig = getConfig
  }

  /** 当前配置可解析图片（system 选了模型，或 custom 配齐了端点/Key/模型） */
  acceptsImage = async (): Promise<boolean> => {
    const cfg = this.getConfig()
    if (cfg.provider === 'system') {
      return Boolean(cfg.systemProvider && cfg.systemModel)
    }
    const ep = resolveCustomConfig(cfg)
    return Boolean(ep.apiKey && ep.baseUrl && ep.model)
  }

  /** 需要暴露给 GUI 配置客户端的 settings namespace（宿主补丁据此放行写入） */
  settingsNamespaces = (): string[] => ['dsh-vision']
}

/** 简化版 agent 面（事件监听与 session append 所需） */
interface AgentLike {
  ctx: {
    on(event: string, handler: (...args: never[]) => unknown, options?: { prepend?: boolean }): () => void
  }
  session: {
    append(type: string, data: unknown, options?: unknown): { seq: number }
  }
}

/** 消息内容里的文本块拼接 */
function textOfContent(content: Array<{ type: string; text?: string }>): string {
  return content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join(' ')
}

/** 把内容里的 image 块替换为占位文本 */
function imagelessContent(content: Array<Record<string, unknown>>, placeholder: string): Array<Record<string, unknown>> {
  return content.map((block) => {
    if (block.type === 'image') return { type: 'text', text: placeholder }
    if (block.type === 'tool-result' && Array.isArray(block.content) && contentHasImage(block.content as never)) {
      return { ...block, content: imagelessContent(block.content as Array<Record<string, unknown>>, placeholder) }
    }
    return block
  })
}

/**
 * 一次视觉调用：图片块 + 提示词 → 描述文本。
 * system 模式走 ctx.llm（复用 attachment ref，不重新上传）；custom 模式读取 attachment 转 base64 直连。
 */
async function visionCall(ctx: VisionCtx & { attachments: { readImage(ref: unknown, signal?: AbortSignal): Promise<{ data: Buffer; ref: { mediaType: string } }> } }, cfg: Config, imageBlocks: Array<{ attachment: unknown }>, prompt: string, signal: AbortSignal): Promise<string> {
  if (cfg.provider === 'system') {
    const assembler = new BlockAssembler()
    const options: Record<string, unknown> = {
      provider: cfg.systemProvider,
      model: cfg.systemModel,
      messages: [createUserMessage({
        content: [...imageBlocks as never, { type: 'text', text: prompt }],
        source: { kind: 'user' },
      })],
      signal,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
    }
    if (cfg.systemPrompt?.trim()) options.system = cfg.systemPrompt.trim()
    for await (const chunk of ctx.llm.stream(options)) {
      assembler.push(chunk)
    }
    return assembler.blocks()
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim()
  }
  // custom 模式：attachment ref → 字节 → data URI → OpenAI 兼容请求
  const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = []
  for (const block of imageBlocks) {
    const stored = await ctx.attachments.readImage(block.attachment)
    parts.push({ type: 'image_url', image_url: { url: `data:${stored.ref.mediaType};base64,${stored.data.toString('base64')}` } })
  }
  parts.push({ type: 'text', text: prompt })
  const ep = resolveCustomConfig(cfg)
  const base = ep.baseUrl.replace(/\/+$/, '')
  const messages: Array<Record<string, unknown>> = []
  if (cfg.systemPrompt?.trim()) messages.push({ role: 'system', content: cfg.systemPrompt.trim() })
  messages.push({ role: 'user', content: parts })
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ep.apiKey}`, 'api-key': ep.apiKey },
    body: JSON.stringify({ model: ep.model, messages, max_tokens: cfg.maxTokens, temperature: cfg.temperature }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(cfg.timeoutMs)]),
  })
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.text()).slice(0, 400) } catch { /* ignore */ }
    throw new Error(`视觉模型 API 请求失败 (HTTP ${res.status}): ${detail}`)
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> }
  const content = data.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) throw new Error('视觉模型未返回有效内容')
  return content.trim()
}

/**
 * pre-step 描述：图片消息 → 默认提示词调视觉模型 → 描述文本。
 * 会话日志保留原图（append）+ surface 占位替换；模型看到描述消息。
 * 返回描述消息；失败返回 undefined（保持原消息，宿主下一轮仍可路由）。
 */
async function describeMessage(
  ctx: VisionCtx & { attachments: { readImage(ref: unknown, signal?: AbortSignal): Promise<{ data: Buffer; ref: { mediaType: string } }> } },
  cfg: Config,
  message: { content: Array<Record<string, unknown>>; source: unknown },
  signal: AbortSignal,
): Promise<{ id?: string; content: Array<{ type: 'text'; text: string }>; role: string; source: Record<string, unknown> } | undefined> {
  const imageBlocks = message.content.filter((b) => b.type === 'image') as Array<{ attachment: unknown }>
  if (imageBlocks.length === 0) return undefined
  const userText = textOfContent(message.content as Array<{ type: string; text?: string }>).trim()
  // 首次解析：默认提示词（如消息里带用户问题则拼接）
  const prompt = userText.length > 0 ? `${cfg.defaultPrompt}\n用户问题：${userText}` : cfg.defaultPrompt
  const answer = await visionCall(ctx, cfg, imageBlocks, prompt, signal)
  if (!answer) return undefined
  return {
    role: 'user',
    content: [{ type: 'text', text: answer }],
    source: {
      kind: 'plugin',
      plugin: 'dsh-vision',
      form: 'description',
      summary: '视觉模型已描述图片',
    } as Record<string, unknown>,
  }
}

/** 从会话日志找最近的用户图片块（view_image 省略 image 参数时使用） */
async function latestImageUrl(ctx: VisionCtx & { attachments: { readImage(ref: unknown, signal?: AbortSignal): Promise<{ data: Buffer; ref: { mediaType: string } }> } }, agent: { session: { events: Array<{ type: string; data?: { content?: Array<{ type: string; attachment?: unknown }> } }> } }, signal: AbortSignal): Promise<{ url: string; source: string }> {
  for (const event of [...agent.session.events].reverse()) {
    if (event.type !== 'user/message') continue
    const content = event.data?.content ?? []
    const image = [...content].reverse().find((b) => b.type === 'image')
    if (image?.attachment) {
      const stored = await ctx.attachments.readImage(image.attachment, signal)
      return { url: `data:${stored.ref.mediaType};base64,${stored.data.toString('base64')}`, source: '会话最近上传的图片' }
    }
  }
  throw new Error('会话中没有找到图片，请传入 image 参数（本地路径或 URL）')
}

export const inject = ['tools', 'webServer', 'settings', 'llm', 'attachments', 'systemPrompt']

export function apply(ctx: Context & {
  settings: {
    register(ns: string, schema: unknown, options: { base?: Config; applies?: 'live' | 'restart' }): { get(): Config; watch(cb: () => void): () => void }
  }
}, config: Config) {
  // 配置注册到 settings namespace：schema 默认值 → cordis config(base) → settings.yaml 用户层
  const scope = ctx.settings.register('dsh-vision', Config, { base: config, applies: 'live' })
  // live 更新：工具执行时读 scope.get() 拿到最新解析值

  // 图片桥服务（宿主 admission 咨询点，需配合 patch-host.ps1 补丁）
  const bridge = new VisionImageBridge(ctx, () => scope.get())

  // pre-step：图片到达 agent 时用默认提示词调视觉模型生成描述，文本模型看到描述而非图片
  ctx.on('agent/created', ({ agent }: { agent: AgentLike }) => {
    agent.ctx.on('agent/pre-step', async (payload: { agent: AgentLike; signal: AbortSignal }, next: () => Promise<{ kind: string; messages?: Array<Record<string, unknown>> }>) => {
      const decision = await next()
      if (decision.kind !== 'enter' || !decision.messages) return decision
      const cfg = scope.get()
      const visionCtx = ctx as unknown as VisionCtx & { attachments: { readImage(ref: unknown, signal?: AbortSignal): Promise<{ data: Buffer; ref: { mediaType: string } }> } }
      const messages: Array<Record<string, unknown>> = []
      let changed = false

      // 未配置视觉模型：不描述，插入引导消息并占位替换（不再报"模型不支持视觉"）
      if (!(await bridge.acceptsImage())) {
        const hasImage = decision.messages.some((m) => {
          const content = m.content as Array<Record<string, unknown>> | undefined
          return content !== undefined && content.some((b) => b.type === 'image')
        })
        if (hasImage) {
          const guidance = createUserMessage({
            content: [{ type: 'text', text: '视觉模型未配置：无法解析图片。请在 设置 → 视觉模型 中选择系统模型或配置自定义模型（API Base URL + Key + 模型），然后重试。' }],
            source: {
              kind: 'plugin',
              plugin: 'dsh-vision',
              form: 'notice',
              summary: '视觉模型未配置',
            } as Record<string, unknown>,
          })
          for (const message of decision.messages) {
            const content = message.content as Array<Record<string, unknown>> | undefined
            if (content && content.some((b) => b.type === 'image')) {
              const originalSeq = agent.session.append('user/message', message, { surfaceOp: 'append' }).seq
              agent.session.append('user/message', createUserMessage({
                content: imagelessContent(content, '（已上传图片，但视觉模型未配置，无法解析）'),
                source: message.source,
              }), {
                surfaceOp: { op: 'replace', start: originalSeq, end: originalSeq },
                sourceEventSeqs: [originalSeq],
              })
              messages.push(guidance as Record<string, unknown>)
              changed = true
              continue
            }
            messages.push(message)
          }
          return changed ? { ...decision, messages } : decision
        }
        return decision
      }

      for (const message of decision.messages) {
        const content = message.content as Array<Record<string, unknown>> | undefined
        if (content && content.some((b) => b.type === 'image')) {
          const description = await describeMessage(visionCtx, cfg, message as { content: Array<Record<string, unknown>>; source: unknown }, payload.signal)
          if (description) {
            // 日志保留原图 + surface 占位替换；模型看到描述
            const originalSeq = agent.session.append('user/message', message, { surfaceOp: 'append' }).seq
            agent.session.append('user/message', createUserMessage({
              content: imagelessContent(content, '（已上传图片，视觉描述见下一条消息）'),
              source: message.source,
            }), {
              surfaceOp: { op: 'replace', start: originalSeq, end: originalSeq },
              sourceEventSeqs: [originalSeq],
            })
            messages.push(description as Record<string, unknown>)
            changed = true
            continue
          }
        }
        messages.push(message)
      }
      return changed ? { ...decision, messages } : decision
    })
  })

  // 系统提示指引：描述不足时由对话模型生成新提示词重新解析
  ctx.systemPrompt.section({
    name: 'dsh-vision',
    order: 116,
    text:
      '用户上传的图片已由视觉模型自动描述（见消息中“视觉模型已描述图片”文本）。' +
      '如果现有描述不足以回答用户的问题（例如需要读取图中细小的文字、具体数值、界面元素位置等），' +
      '请调用 view_image 工具（可省略 image 参数以复用会话中最近上传的图片），' +
      '并针对当前问题生成更具体、更有针对性的提示词传入 prompt 参数来重新解析图片。',
  })

  ctx.tools.register(defineTool({
    name: 'view_image',
    description:
      '使用视觉模型查看图片并返回文字描述。' +
      '适用场景：理解图片内容、识别图片中的文字（OCR）、识别物体/场景/人物/图表/UI 布局、检查截图等。' +
      '参数说明：image 可选——图片的本地绝对路径或 http(s) URL，省略时使用会话中最近上传的图片；' +
      'prompt 为可选的视觉理解提示词——请根据当前用户任务动态生成具体、有针对性的提示词（例如“识别图中所有文字并逐行列出”、“描述这个页面的 UI 布局”）；' +
      '若省略 prompt，将使用插件配置的默认提示词。',
    parameters: {
      image: { type: 'string', description: '图片的本地绝对路径或 http(s) URL（可选，省略时使用会话中最近上传的图片）' },
      prompt: { type: 'string', description: '视觉理解提示词（可选，省略时使用配置的默认提示词）' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      // 每次执行读取最新生效配置（live）
      const cfg = scope.get()
      const prompt = args.prompt?.trim() || cfg.defaultPrompt
      const visionCtx = ctx as unknown as VisionCtx & { attachments: { readImage(ref: unknown, signal?: AbortSignal): Promise<{ data: Buffer; ref: { mediaType: string } }> } }
      let imageUrl: string
      let source: string
      if (args.image?.trim()) {
        const resolved = await resolveImageUrl(args.image, cfg.remoteImageMode, exec.signal)
        imageUrl = resolved.url
        source = resolved.source
      } else {
        // 省略 image：复用会话最近上传的图片
        const agent = (exec as unknown as { agent?: { session: { events: Array<{ type: string; data?: { content?: Array<{ type: string; attachment?: unknown }> } }> } } }).agent
        if (!agent) throw new Error('当前没有会话上下文，请传入 image 参数')
        const latest = await latestImageUrl(visionCtx, agent, exec.signal)
        imageUrl = latest.url
        source = latest.source
      }

      if (cfg.provider === 'system') {
        if (!cfg.systemProvider || !cfg.systemModel) {
          throw new Error('dsh-vision 插件 provider=system 但未选择系统模型，请在 设置 → 视觉模型 中选择')
        }
        const result = await callSystemModel(ctx as unknown as VisionCtx, cfg, imageUrl, prompt, exec.signal)
        return `[视觉模型 ${cfg.systemProvider}/${cfg.systemModel} 对 ${source} 的识别结果]\n${result}`
      }

      const ep = resolveCustomConfig(cfg)
      if (!ep.apiKey) {
        throw new Error(
          'dsh-vision 插件未配置 API Key（provider=custom）。' +
          '请在 设置 → 视觉模型 中填写 apiKey，或设置 apiKeyEnv 指向的环境变量。',
        )
      }
      if (!ep.baseUrl) {
        throw new Error('dsh-vision 插件未配置 apiBaseUrl，请在 设置 → 视觉模型 中填写')
      }
      if (!ep.model) {
        throw new Error('dsh-vision 插件未配置 model，请在 设置 → 视觉模型 中填写')
      }
      const result = await callVisionModel(ep, cfg, imageUrl, prompt, exec.signal)
      return `[视觉模型 ${ep.model} 对 ${source} 的识别结果]\n${result}`
    },
  }))

  // GUI 后端：配置摘要 + 连接测试 + 系统模型列表
  ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-vision/config',
    handler: (_req: HttpReq, res: HttpRes) => {
      sendJson(res, 200, configSummary(scope.get()))
    },
  })
  ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-vision/test',
    handler: async (req: HttpReq, res: HttpRes) => {
      try {
        if (req.method === 'POST') {
          await readBody(req)
        }
        const cfg = scope.get()
        const result = await testConnection(ctx as unknown as VisionCtx, cfg, AbortSignal.timeout(cfg.timeoutMs))
        sendJson(res, result.ok ? 200 : 400, result)
      } catch (err) {
        sendJson(res, 500, { ok: false, latencyMs: 0, message: `测试请求失败: ${(err as Error).message}` })
      }
    },
  })
  ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-vision/models',
    handler: async (_req: HttpReq, res: HttpRes) => {
      try {
        const system = await listSystemVisionModels(ctx as never)
        if (system.length > 0) {
          sendJson(res, 200, { system, suggestions: missingVisionSuggestions(system), customExamples: CUSTOM_EXAMPLES })
        } else {
          // 系统枚举为空：用静态兜底表，保证 GUI 有可选模型
          sendJson(res, 200, { system: FALLBACK_SYSTEM_MODELS, fallback: true, customExamples: CUSTOM_EXAMPLES })
        }
      } catch (err) {
        sendJson(res, 200, { system: FALLBACK_SYSTEM_MODELS, fallback: true, customExamples: CUSTOM_EXAMPLES, error: (err as Error).message })
      }
    },
  })
}
