// dsh-vision 插件端到端逻辑测试（不依赖真实 API）
// 运行：node test\e2e.mts   （Node 24+，从 dsh-vision-plugin 目录）
// 注意：测试的是已安装到 profile 的插件副本（与 src/index.ts 内容一致）
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 1x1 PNG
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const mod = await import('file:///C:/Users/zq179/.dsh/profiles/desktop/plugins/dsh-vision/src/index.ts')
const { name, Config, apply, configSummary, resolveCustomConfig, listSystemVisionModels, CUSTOM_EXAMPLES, VisionImageBridge } = mod

let lastInit = null
let lastUrl = null
let savedImage = null
let llmCalls = []

/** mock ctx：tools + webServer + settings + llm + attachments + systemPrompt + 事件 */
function makeCtx() {
  const registrations = { tools: [], routes: [], sections: [] }
  const settingsValue = {}
  const scope = {
    get: () => Object.assign({}, settingsValue),
    watch: () => () => {},
    update: (patch) => Object.assign(settingsValue, patch),
    replace: (section) => Object.assign(settingsValue, section),
  }
  const agentListeners = {}
  const ctx = {
    reflect: { provide: () => {}, set: () => {} },
    tools: { register: (def) => { registrations.tools.push(def); return () => {} } },
    webServer: { register: (route) => { registrations.routes.push(route); return () => {} } },
    settings: {
      register: (ns, schema, options) => {
        assert.equal(ns, 'dsh-vision')
        // 用 schema 填充默认值
        Object.assign(settingsValue, schema({}))
        if (options.base) Object.assign(settingsValue, options.base)
        return scope
      },
    },
    systemPrompt: {
      section: (spec) => { registrations.sections.push(spec); return () => {} },
    },
    on: (event, handler) => { agentListeners[event] = handler; return () => {} },
    llm: {
      listProviders: () => [
        { id: 'xiaomi', name: 'Xiaomi' },
        { id: 'opencode-go', name: 'OpenCode Zen Go' },
        { id: 'deepseek-official', name: 'DeepSeek Official' },
      ],
      listModels: async (provider) => {
        if (provider === 'xiaomi') return [
          { provider, id: 'mimo-v2.5', name: 'MiMo-V2.5', inputModalities: ['text', 'image'] },
          { provider, id: 'mimo-v2-flash', name: 'MiMo-V2-Flash', inputModalities: ['text'] },
          { provider, id: 'mimo-v2-omni', name: 'MiMo-V2-Omni', inputModalities: ['text', 'image'] },
        ]
        if (provider === 'opencode-go') return [
          { provider, id: 'mimo-v2.5', name: 'MiMo-V2.5', inputModalities: ['text', 'image'] },
          { provider, id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', inputModalities: ['text', 'image'] },
          { provider, id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', inputModalities: ['text'] },
        ]
        return [{ provider, id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', inputModalities: ['text'] }]
      },
      stream: async function* (options) {
        llmCalls.push(options)
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: '系统模型识别结果' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: '系统模型识别结果' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
    attachments: {
      saveImage: async (input) => {
        savedImage = input
        return { id: 'test-ref-1', mediaType: input.mediaType }
      },
      readImage: async (ref) => ({
        data: Buffer.from(PNG_BASE64, 'base64'),
        ref: { mediaType: 'image/png' },
      }),
    },
    __registrations: registrations,
    __agentListeners: agentListeners,
    __scope: scope,
  }
  return ctx
}

/** 模拟 node http res */
function makeRes() {
  const res = { status: 0, headers: {}, body: '' }
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers || {} }
  res.end = (body) => { res.body = body }
  return res
}
/** 模拟 node http req（无 body，注册监听后立即触发 end） */
const makeReq = (method = 'POST') => ({
  method,
  on: (event, cb) => {
    if (event === 'end') queueMicrotask(cb)
  },
})

const signal = new AbortController().signal
const dir = mkdtempSync(join(tmpdir(), 'dsh-vision-test-'))
const img = join(dir, 'test.png')
writeFileSync(img, Buffer.from(PNG_BASE64, 'base64'))

// ---- 1. 模块导出 ----
assert.equal(name, 'dsh-vision')
assert.ok(CUSTOM_EXAMPLES.length >= 8, '应有常见端点示例表')
console.log('✓ 模块导出正常')

// ---- 2. 工具注册 + 路由注册（system 模式默认）----
const ctx0 = makeCtx()
const config = Config({}) // 默认 system 模式
apply(ctx0, config)
const registered = ctx0.__registrations.tools[0]
assert.ok(registered, '工具未注册')
assert.equal(registered.name, 'view_image')
const routePaths = ctx0.__registrations.routes.map((r) => r.path)
assert.deepEqual(routePaths.sort(), ['/dsh-vision/config', '/dsh-vision/models', '/dsh-vision/test'].sort())
console.log('✓ view_image 工具 + 3 个路由注册成功')

// ---- 3. system 模式：走 ctx.llm（不接触 Key）----
const cfg = ctx0.__scope
// 模拟用户在 GUI 选择了系统模型（settings 用户层更新）
cfg.replace({ provider: 'system', systemProvider: 'xiaomi', systemModel: 'mimo-v2.5', defaultPrompt: '请详细描述这张图片' })
llmCalls = []
savedImage = null
const out1 = await registered.execute({ image: img }, { signal })
assert.ok(out1.includes('系统模型识别结果'), `输出异常: ${out1}`)
assert.ok(out1.includes('xiaomi/mimo-v2.5'), `应标注系统模型: ${out1}`)
assert.equal(llmCalls.length, 1, '应调用 ctx.llm.stream 一次')
const call = llmCalls[0]
assert.equal(call.provider, 'xiaomi')
assert.equal(call.model, 'mimo-v2.5')
assert.ok(call.messages[0].content[0].type === 'text')
assert.equal(call.messages[0].content[0].text, '请详细描述这张图片', '应使用默认提示词')
assert.ok(call.messages[0].content[1].type === 'image', '应传 image 内容块')
assert.equal(call.messages[0].content[1].attachment.id, 'test-ref-1')
assert.ok(savedImage && savedImage.data.length > 0, '应保存图片 attachment')
assert.equal(savedImage.mediaType, 'image/png')
console.log('✓ system 模式：ctx.llm 调用 + image 块 + attachment 保存 + 不接触 Key')

// ---- 4. system 模式：LLM 动态 prompt 优先 + systemPrompt 传递 ----
cfg.replace({ systemPrompt: '你是图片识别助手' })
llmCalls = []
await registered.execute({ image: img, prompt: '识别图中文字' }, { signal })
assert.equal(llmCalls[0].messages[0].content[0].text, '识别图中文字', '动态 prompt 应优先')
assert.equal(llmCalls[0].system, '你是图片识别助手', 'systemPrompt 应通过 options.system 传递')
console.log('✓ system 模式：动态 prompt 优先 + systemPrompt 传递')

// ---- 5. system 模式：URL 图片 direct 模式下载后转 attachment ----
llmCalls = []
globalThis.fetch = async (url) => {
  if (String(url) === 'https://example.com/a.png') {
    return { ok: true, status: 200, headers: { get: () => 'image/png' }, arrayBuffer: async () => Buffer.from(PNG_BASE64, 'base64') }
  }
  throw new Error(`unexpected fetch: ${url}`)
}
await registered.execute({ image: 'https://example.com/a.png' }, { signal })
assert.ok(savedImage.data.length > 0)
console.log('✓ system 模式：URL 图片下载转 attachment')

// ---- 6. custom 模式：fetch 直连 chat/completions ----
const ctx2 = makeCtx()
apply(ctx2, Config({ provider: 'custom', apiBaseUrl: 'https://my-proxy.example.com/v1', model: 'my-vision-model', apiKey: 'my-key' }))
const reg2 = ctx2.__registrations.tools[0]
globalThis.fetch = async (url, init) => {
  lastUrl = String(url)
  lastInit = init
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '自定义识别结果' } }] }) }
}
const out2 = await reg2.execute({ image: img }, { signal })
assert.ok(out2.includes('自定义识别结果'))
assert.equal(lastUrl, 'https://my-proxy.example.com/v1/chat/completions')
assert.equal(lastInit.headers.Authorization, 'Bearer my-key')
const body2 = JSON.parse(lastInit.body)
assert.equal(body2.model, 'my-vision-model')
assert.equal(body2.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,'), true)
console.log('✓ custom 模式：fetch 直连 + Bearer 认证 + base64 图片')

// ---- 7. custom 模式：systemPrompt 进 system 消息 ----
apply(ctx2, Config({ provider: 'custom', apiBaseUrl: 'https://x/v1', model: 'm', apiKey: 'k', systemPrompt: '你是图片识别助手' }))
const reg3 = ctx2.__registrations.tools[0]
await reg3.execute({ image: img }, { signal })
const body3 = JSON.parse(lastInit.body)
assert.equal(body3.messages[0].role, 'system')
assert.equal(body3.messages[0].content, '你是图片识别助手')
assert.equal(body3.messages[1].role, 'user')
console.log('✓ custom 模式：systemPrompt 作为 system 消息')

// ---- 8. custom 模式：apiKeyEnv 环境变量 ----
const ctx4 = makeCtx()
apply(ctx4, Config({ provider: 'custom', apiBaseUrl: 'https://x/v1', model: 'm', apiKeyEnv: 'TEST_VISION_KEY' }))
process.env.TEST_VISION_KEY = 'env-key-xyz'
const reg4 = ctx4.__registrations.tools[0]
globalThis.fetch = async (url, init) => {
  lastUrl = String(url)
  lastInit = init
  return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }
}
await reg4.execute({ image: img }, { signal })
assert.equal(lastInit.headers.Authorization, 'Bearer env-key-xyz', '应读取环境变量 Key')
console.log('✓ custom 模式：apiKeyEnv 环境变量 Key')

// ---- 9. 未配置 Key → 明确报错 ----
delete process.env.TEST_VISION_KEY
const ctx5 = makeCtx()
apply(ctx5, Config({ provider: 'custom', apiBaseUrl: 'https://x/v1', model: 'm' }))
const reg5 = ctx5.__registrations.tools[0]
let threw = false
try {
  await reg5.execute({ image: img }, { signal })
} catch (err) {
  threw = true
  assert.ok(String(err.message).includes('API Key'), `错误信息应提示 API Key: ${err.message}`)
}
assert.ok(threw, '未配置 Key 时应抛出错误')
console.log('✓ 未配置 Key → 明确报错')

// ---- 10. resolveCustomConfig / configSummary ----
const ep = resolveCustomConfig(Config({ provider: 'custom', apiBaseUrl: ' https://x/v1 ', model: ' m ', apiKey: ' k ' }))
assert.equal(ep.baseUrl, 'https://x/v1')
assert.equal(ep.model, 'm')
const sum1 = configSummary(Config({ provider: 'system', systemProvider: 'xiaomi', systemModel: 'mimo-v2.5' }))
assert.equal(sum1.provider, 'system')
assert.equal(sum1.keyConfigured, true)
assert.equal(sum1.keySource, 'system')
const sum2 = configSummary(Config({ provider: 'custom', apiBaseUrl: 'https://x/v1', model: 'm', apiKey: 'secret-key-123' }))
assert.equal(sum2.keySource, 'manual')
assert.ok(!JSON.stringify(sum2).includes('secret-key-123'), '摘要不应包含 Key 明文')
console.log('✓ resolveCustomConfig / configSummary（不泄露 Key）')

// ---- 11. listSystemVisionModels：只返回支持视觉的模型 ----
const visionModels = await listSystemVisionModels(ctx0)
const ids = visionModels.map((m) => m.provider + '/' + m.model).sort()
assert.ok(ids.includes('xiaomi/mimo-v2.5'), '应包含 xiaomi/mimo-v2.5')
assert.ok(ids.includes('xiaomi/mimo-v2-omni'))
assert.ok(ids.includes('opencode-go/kimi-k2.7-code'))
assert.ok(!ids.includes('xiaomi/mimo-v2-flash'), '纯文本模型应被过滤')
assert.ok(!ids.some((x) => x.includes('deepseek')), 'deepseek-official 纯文本应被过滤')
assert.ok(visionModels.every((m) => m.providerName && m.modelName), '应含可读名称')
console.log(`✓ listSystemVisionModels：仅返回 ${visionModels.length} 个视觉模型（过滤纯文本）`)

// ---- 12. HTTP 路由：config / test / models ----
const routes = ctx0.__registrations.routes
const configRoute = routes.find((r) => r.path === '/dsh-vision/config')
const testRoute = routes.find((r) => r.path === '/dsh-vision/test')
const modelsRoute = routes.find((r) => r.path === '/dsh-vision/models')

const res1 = makeRes()
await configRoute.handler(makeReq('GET'), res1)
assert.equal(res1.status, 200)
const cfgBody = JSON.parse(res1.body)
assert.equal(cfgBody.provider, 'system')
assert.equal(cfgBody.systemProvider, 'xiaomi')

// test 路由（system 模式成功）
const res2 = makeRes()
await testRoute.handler(makeReq('POST'), res2)
assert.equal(res2.status, 200)
const testBody = JSON.parse(res2.body)
assert.equal(testBody.ok, true)
assert.ok(testBody.latencyMs >= 0)

// models 路由
const res4 = makeRes()
await modelsRoute.handler(makeReq('GET'), res4)
assert.equal(res4.status, 200)
const modelsBody = JSON.parse(res4.body)
assert.ok(modelsBody.system.length >= 3, '应返回系统视觉模型列表')
assert.ok(modelsBody.customExamples.length >= 8, '应返回端点示例表')
console.log('✓ HTTP 路由 config/test/models 工作正常')

// ---- 13. test 路由失败路径（custom 401）----
const ctx6 = makeCtx()
apply(ctx6, Config({ provider: 'custom', apiBaseUrl: 'https://x/v1', model: 'm', apiKey: 'bad' }))
const routes6 = ctx6.__registrations.routes
const testRoute6 = routes6.find((r) => r.path === '/dsh-vision/test')
globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => '{"error":{"message":"invalid api key"}}' })
const res6 = makeRes()
await testRoute6.handler(makeReq('POST'), res6)
assert.equal(res6.status, 400)
const failBody = JSON.parse(res6.body)
assert.equal(failBody.ok, false)
assert.ok(failBody.message.includes('401'), `错误信息应包含 401: ${failBody.message}`)
console.log('✓ test 路由失败路径（401 透传）')

// ---- 14. system 模式未选择模型 → 报错 ----
const ctx7 = makeCtx()
apply(ctx7, Config({ provider: 'system' }))
const reg7 = ctx7.__registrations.tools[0]
let threw7 = false
try {
  await reg7.execute({ image: img }, { signal })
} catch (err) {
  threw7 = true
  assert.ok(String(err.message).includes('系统模型'), `错误信息: ${err.message}`)
}
assert.ok(threw7, '未选择系统模型应报错')
console.log('✓ system 模式未选择模型 → 明确报错')

// ---- 15. VisionImageBridge：admission 咨询点 ----
const ctx8 = makeCtx()
apply(ctx8, Config({ provider: 'system' }))
const bridge8 = ctx8.__bridge ?? new VisionImageBridge(ctx8, () => ctx8.__scope.get())
ctx8.__scope.replace({ provider: 'system', systemProvider: '', systemModel: '' })
assert.equal(await bridge8.acceptsImage(), false, '未选系统模型不应接管')
ctx8.__scope.replace({ provider: 'system', systemProvider: 'xiaomi', systemModel: 'mimo-v2.5' })
assert.equal(await bridge8.acceptsImage(), true, '选了系统模型应接管')
const ctx9 = makeCtx()
apply(ctx9, Config({ provider: 'custom', apiBaseUrl: 'https://x/v1', model: 'm', apiKey: 'k' }))
const bridge9 = new VisionImageBridge(ctx9, () => ctx9.__scope.get())
assert.equal(await bridge9.acceptsImage(), true, 'custom 配齐应接管')
const ctx10 = makeCtx()
apply(ctx10, Config({ provider: 'custom', apiBaseUrl: 'https://x/v1', model: 'm' }))
const bridge10 = new VisionImageBridge(ctx10, () => ctx10.__scope.get())
assert.equal(await bridge10.acceptsImage(), false, 'custom 缺 Key 不应接管')
assert.deepEqual(bridge10.settingsNamespaces(), ['dsh-vision'], '应暴露 dsh-vision 配置 namespace（GUI 写入通道）')
console.log('✓ VisionImageBridge.acceptsImage 判定正确 + settingsNamespaces 暴露')

// ---- 16. pre-step：图片消息 → 默认提示词描述 → 占位替换 + 描述消息 ----
const ctx11 = makeCtx()
apply(ctx11, Config({ provider: 'system', systemProvider: 'xiaomi', systemModel: 'mimo-v2.5', defaultPrompt: '请详细描述这张图片' }))
// 触发 agent/created 注册
const appends = []
const fakeAgent = {
  ctx: {
    on: (event, handler) => {
      if (event === 'agent/pre-step') fakeAgent.preStep = handler
      return () => {}
    },
  },
  session: {
    append: (type, data, opts) => {
      appends.push({ type, data, opts })
      return { seq: appends.length }
    },
  },
}
ctx11.__agentListeners['agent/created']({ agent: fakeAgent })
assert.ok(fakeAgent.preStep, '应注册 agent/pre-step 监听')
// 调用 pre-step：图片消息 + 用户问题
llmCalls = []
const imageMessage = {
  role: 'user',
  content: [
    { type: 'text', text: '图片里有什么动物？' },
    { type: 'image', attachment: { id: 'ref-1' } },
  ],
  source: { kind: 'user' },
}
const decision = await fakeAgent.preStep(
  { agent: fakeAgent, signal },
  async () => ({ kind: 'enter', messages: [imageMessage] }),
)
assert.equal(decision.kind, 'enter')
assert.equal(decision.messages.length, 1, '应替换为描述消息')
const descMsg = decision.messages[0]
assert.equal(descMsg.content[0].type, 'text')
assert.ok(descMsg.content[0].text.includes('系统模型识别结果'), '描述应来自视觉模型')
assert.equal(descMsg.source.kind, 'plugin')
assert.equal(descMsg.source.plugin, 'dsh-vision')
// 默认提示词应带用户问题
const descCall = llmCalls[llmCalls.length - 1]
assert.ok(descCall.messages[0].content.some((b) => b.type === 'image'), '描述调用应含图片块')
const descText = descCall.messages[0].content.filter((b) => b.type === 'text').map((b) => b.text).join('')
assert.ok(descText.includes('请详细描述这张图片'), '应使用默认提示词')
assert.ok(descText.includes('图片里有什么动物？'), '应拼接用户问题')
// session 管理：原图 append + 占位 replace
assert.ok(appends.length >= 2)
assert.equal(appends[0].type, 'user/message')
const placeholderText = appends[1].data.content.map((b) => b.text ?? '').join('')
assert.ok(placeholderText.includes('已上传图片'), '应写入占位替换')
console.log('✓ pre-step：默认提示词 + 用户问题 → 描述替换 + 会话占位管理')

// ---- 17. pre-step：无图片消息不处理；描述失败保持原消息 ----
const ctx12 = makeCtx()
apply(ctx12, Config({ provider: 'system', systemProvider: 'xiaomi', systemModel: 'mimo-v2.5' }))
const fakeAgent2 = {
  ctx: { on: (e, h) => { if (e === 'agent/pre-step') fakeAgent2.preStep = h; return () => {} } },
  session: { append: () => ({ seq: 1 }) },
}
ctx12.__agentListeners['agent/created']({ agent: fakeAgent2 })
const d1 = await fakeAgent2.preStep({ agent: fakeAgent2, signal }, async () => ({ kind: 'enter', messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] }))
assert.equal(d1.messages.length, 1, '无图片不应改动')
assert.equal(d1.messages[0].content[0].type, 'text')
console.log('✓ pre-step：无图片消息不处理')

// ---- 17b. pre-step：插件已装但未配置视觉模型 → 引导消息（不报"模型不支持视觉"）----
const ctx12b = makeCtx()
apply(ctx12b, Config({ provider: 'system' })) // 未选系统模型
const appendsB = []
const fakeAgentB = {
  ctx: { on: (e, h) => { if (e === 'agent/pre-step') fakeAgentB.preStep = h; return () => {} } },
  session: { append: (type, data, opts) => { appendsB.push({ type, data, opts }); return { seq: appendsB.length } } },
}
ctx12b.__agentListeners['agent/created']({ agent: fakeAgentB })
const imgMsgB = { role: 'user', content: [{ type: 'image', attachment: { id: 'r1' } }], source: { kind: 'user' } }
const dB = await fakeAgentB.preStep({ agent: fakeAgentB, signal }, async () => ({ kind: 'enter', messages: [imgMsgB] }))
assert.equal(dB.messages.length, 1, '应替换为引导消息')
const guidance = dB.messages[0]
assert.equal(guidance.source.kind, 'plugin')
assert.ok(guidance.content[0].text.includes('视觉模型未配置'), `引导文案: ${guidance.content[0].text}`)
assert.ok(guidance.content[0].text.includes('设置 → 视觉模型'), '应引导去设置页')
// 占位替换写入会话
const placeholderB = appendsB[1].data.content.map((b) => b.text ?? '').join('')
assert.ok(placeholderB.includes('未配置'), '占位应说明未配置')
console.log('✓ pre-step：未配置视觉模型 → 引导消息「视觉模型未配置」')

// ---- 18. view_image 省略 image → 复用会话最近图片 ----
const ctx13 = makeCtx()
apply(ctx13, Config({ provider: 'system', systemProvider: 'xiaomi', systemModel: 'mimo-v2.5' }))
const reg13 = ctx13.__registrations.tools[0]
llmCalls = []
const sessionEvents = [
  { type: 'user/message', data: { content: [{ type: 'text', text: 'hi' }, { type: 'image', attachment: { id: 'latest-ref' } }] } },
  { type: 'user/message', data: { content: [{ type: 'text', text: 'later text only' }] } },
]
const execAgent = { agent: { session: { events: sessionEvents } } }
const out13 = await reg13.execute({ prompt: '识别图中所有文字' }, { signal, ...execAgent })
assert.ok(out13.includes('系统模型识别结果'))
assert.ok(llmCalls[0].messages[0].content.some((b) => b.type === 'image'), '应传会话图片')
console.log('✓ view_image 省略 image → 复用会话最近上传的图片')

// ---- 19. systemPrompt 指引 section ----
const ctx14 = makeCtx()
apply(ctx14, Config({}))
const sections = ctx14.__registrations.sections
assert.ok(sections.length >= 1, '应注册系统提示 section')
const visionSection = sections.find((s) => s.name === 'dsh-vision')
assert.ok(visionSection, '应注册 dsh-vision section')
assert.ok(visionSection.text.includes('view_image'), '指引应提及 view_image 重新解析')
console.log('✓ systemPrompt 指引：描述不足时生成新提示词重新解析')

// ---- 20. models 路由：系统枚举为空 → 返回兜底表（GUI 不空目录）----
const ctx15 = makeCtx()
ctx15.llm.listProviders = () => [] // 模拟系统无视觉模型
apply(ctx15, Config({}))
const routes15 = ctx15.__registrations.routes
const modelsRoute15 = routes15.find((r) => r.path === '/dsh-vision/models')
const res15 = makeRes()
await modelsRoute15.handler(makeReq('GET'), res15)
assert.equal(res15.status, 200)
const body15 = JSON.parse(res15.body)
assert.equal(body15.fallback, true, '应标记兜底')
assert.ok(body15.system.length >= 10, `兜底表应含 10+ 模型，实际 ${body15.system.length}`)
assert.ok(body15.system.every((m) => m.provider && m.model && m.providerName && m.modelName), '兜底条目应完整')
console.log('✓ models 路由：枚举为空 → 兜底表（永不空目录）')

// ---- 20b. models 路由：suggestions（未启用的视觉模型建议）----
const ctx15b = makeCtx()
apply(ctx15b, Config({}))
const routes15b = ctx15b.__registrations.routes
const modelsRoute15b = routes15b.find((r) => r.path === '/dsh-vision/models')
const res15b = makeRes()
await modelsRoute15b.handler(makeReq('GET'), res15b)
const body15b = JSON.parse(res15b.body)
assert.ok(Array.isArray(body15b.suggestions), '应返回 suggestions')
assert.ok(body15b.suggestions.length >= 1, `当前 mock 有 4 个视觉模型，建议应列出其余（实际 ${body15b.suggestions.length}）`)
assert.ok(body15b.suggestions.every((m) => m.provider && m.model), '建议条目应完整')
const sugKeys = body15b.suggestions.map((m) => m.provider + '/' + m.model)
const sysKeys = body15b.system.map((m) => m.provider + '/' + m.model)
assert.ok(sugKeys.every((k) => !sysKeys.includes(k)), '建议不应包含已启用的模型')
console.log(`✓ models 路由：suggestions 列出 ${body15b.suggestions.length} 个可添加的视觉模型`)

// ---- 21. models 路由：枚举抛错 → 兜底表 + 错误信息 ----
const ctx16 = makeCtx()
ctx16.llm.listProviders = () => { throw new Error('llm broken') }
apply(ctx16, Config({}))
const routes16 = ctx16.__registrations.routes
const modelsRoute16 = routes16.find((r) => r.path === '/dsh-vision/models')
const res16 = makeRes()
await modelsRoute16.handler(makeReq('GET'), res16)
assert.equal(res16.status, 200)
const body16 = JSON.parse(res16.body)
assert.equal(body16.fallback, true)
assert.ok(body16.error, '应携带错误信息')
assert.ok(body16.system.length >= 10)
console.log('✓ models 路由：枚举抛错 → 兜底表 + 错误信息')

console.log(`\n全部 21 项测试通过 ✅`)
