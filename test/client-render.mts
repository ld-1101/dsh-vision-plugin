// dsh-vision-client 前端真实渲染测试（真实 React 18 + react-dom/server）
// 运行：node test\client-render.mts
// 验证：settings.section 注册、面板结构、空态、模型列表渲染、按钮/字段存在
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const bundleSource = readFileSync(
  'C:/Users/zq179/.dsh/profiles/node_modules/dsh-vision-client/lib/client.js',
  'utf8',
)

// ---- 1. 加载 bundle（require 返回真实 react）----
let loaded = null
globalThis.window = {
  __ModuleLoader__: {
    load: (entry) => { loaded = entry },
  },
}
await import('file:///C:/Users/zq179/.dsh/profiles/node_modules/dsh-vision-client/lib/client.js')
assert.ok(loaded, 'load 应被调用')
const reactMod = await import('file:///C:/Users/zq179/.dsh/profiles/node_modules/react/index.js')
const jsxRuntimeMod = await import('file:///C:/Users/zq179/.dsh/profiles/node_modules/react/jsx-runtime.js')
const requireReal = (spec) => {
  if (spec === 'react') return reactMod.default
  if (spec === 'react/jsx-runtime') return jsxRuntimeMod
  throw new Error(`unexpected require: ${spec}`)
}
const moduleExports = loaded.factory(requireReal)
assert.equal(typeof moduleExports.apply, 'function')
assert.ok(moduleExports.inject.includes('slots'))
assert.ok(moduleExports.inject.includes('settingsScope'))
console.log('✓ bundle 加载成功（真实 react）')

// ---- 2. apply：settings.section 注册 ----
let capturedOptions = null
let capturedComponent = null
let bindCalls = 0
const mockScope = {
  getSnapshot: () => ({
    status: 'ready',
    value: {
      provider: 'system',
      systemProvider: 'xiaomi',
      systemModel: 'mimo-v2.5',
      defaultPrompt: '请详细描述这张图片',
      systemPrompt: '',
      timeoutMs: 90000,
      maxTokens: 2048,
      temperature: 0.2,
      remoteImageMode: 'direct',
      apiBaseUrl: '',
      apiKeyEnv: '',
      model: '',
    },
    base: {},
    user: {},
    revision: 1,
    writable: true,
  }),
  subscribe: () => () => {},
  set: async () => true,
  unset: async () => true,
}
const fakeCtx = {
  get: (name) => {
    if (name === 'settingsScope') {
      return {
        bind: (spec) => {
          bindCalls++
          assert.equal(spec.namespace, 'dsh-vision')
          return mockScope
        },
      }
    }
    throw new Error(`unexpected ctx.get: ${name}`)
  },
  slots: {
    inject: (name, callback) => {
      assert.equal(name, 'settings.section', '应注册 settings.section（设置面板形式）')
      const disposer = callback()
      assert.equal(typeof disposer, 'function')
      return () => {}
    },
    register: (options, component) => {
      capturedOptions = options
      capturedComponent = component
      return () => {}
    },
  },
}
moduleExports.apply(fakeCtx)
assert.equal(capturedOptions.id, 'dsh-vision')
assert.equal(capturedOptions.name, 'settings.section')
assert.equal(typeof capturedComponent, 'function')
console.log('✓ apply 注册 settings.section（设置 → 视觉模型 面板）')

// ---- 3. 真实渲染：面板结构（renderToString）----
const React = reactMod.default
const { renderToString } = await import('file:///C:/Users/zq179/.dsh/profiles/node_modules/react-dom/server.browser.js')
const html = renderToString(React.createElement(capturedComponent, { scope: mockScope }))

// 结构断言
for (const [label, text] of [
  ['系统模型区块', '系统模型（复用系统 Key'],
  ['自定义模型区块', '自定义模型（OpenAI 兼容接口）'],
  ['API Base URL 字段', 'API Base URL'],
  ['API Key 字段', 'API Key'],
  ['Key 环境变量字段', 'Key 环境变量'],
  ['模型名称字段', '模型名称'],
  ['系统提示词字段', '系统提示词'],
  ['默认提示词字段', '默认提示词'],
  ['保存按钮', '保存更改'],
  ['测试连接按钮', '测试连接'],
  ['端点示例入口', '查看常见服务商端点示例'],
]) {
  assert.ok(html.includes(text), `应包含: ${label}`)
}
// 空态（models 未加载时的初始渲染）
assert.ok(html.includes('系统未检测到支持视觉的模型'), '初始应显示空态提示（数据加载后由列表替换）')
// 系统模型选中态（effective provider=system）
assert.ok(html.includes('checked'), '应渲染 radio 选中态')
console.log('✓ renderToString：面板结构完整（双模式/提示词/按钮/示例/空态）')

// ---- 4. 输入框 value 绑定（生效值回填）----
assert.ok(html.includes('请详细描述这张图片'), '默认提示词生效值应回填')
// 系统模式 radio 选中（effective.provider=system）
const checkedCount = (html.match(/checked/g) || []).length
assert.ok(checkedCount >= 1, '系统模式 radio 应处于选中态')
console.log('✓ 生效值回填正确，系统模式选中态正确')

// ---- 5. 关键交互逻辑源码断言（bundle 内）----
assert.ok(bundleSource.includes('valueOf'), '应有草稿优先取值逻辑')
assert.ok(bundleSource.includes('props.scope.set'), '保存应调用 scope.set')
assert.ok(bundleSource.includes('props.scope.unset'), '重置应调用 scope.unset')
assert.ok(bundleSource.includes('/dsh-vision/config'), '应读取配置摘要')
assert.ok(bundleSource.includes('/dsh-vision/models'), '应拉取模型列表')
assert.ok(bundleSource.includes('/dsh-vision/test'), '测试按钮应请求测试路由')
assert.ok(bundleSource.includes('type: "password"') || bundleSource.includes('type:"password"'), 'Key 应为密码框')
console.log('✓ 交互逻辑源码齐全（草稿/保存/重置/路由/密码框）')

console.log('\n全部 5 项前端真实渲染测试通过 ✅')
