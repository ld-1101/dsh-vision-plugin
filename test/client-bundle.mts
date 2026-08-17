// dsh-vision-client bundle 契约测试（浏览器侧，mock __ModuleLoader__）
// 运行：node test\client-bundle.mts
// 验证：bundle 格式、exports.apply/inject 契约、settings.section 注册参数、settingsScope 绑定、组件存在
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const bundleSource = readFileSync(
  'C:/Users/zq179/.dsh/profiles/node_modules/dsh-vision-client/lib/client.js',
  'utf8',
)

// ---- 1. 基本格式 ----
assert.ok(bundleSource.includes('window.__ModuleLoader__.load({'), '应使用 __ModuleLoader__.load')
assert.ok(bundleSource.includes('id: "dsh-vision-client"'), 'id 应为 dsh-vision-client')
console.log('✓ bundle 使用 __ModuleLoader__.load 格式，id 正确')

// ---- 2. 加载 bundle（mock 浏览器环境）----
let loaded = null
globalThis.window = {
  __ModuleLoader__: {
    load: (entry) => { loaded = entry },
  },
}
const reactMock = {
  useState: () => [{ system: [], customExamples: [] }, () => {}],
  useEffect: () => {},
  useMemo: () => ({}),
  createElement: () => null,
  useRef: () => ({ current: null }),
  useId: () => 'id',
  Fragment: 'Fragment',
}
const requireMock = (spec) => {
  if (spec === 'react') return reactMock
  if (spec === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null }
  throw new Error(`unexpected require: ${spec}`)
}
await import('file:///C:/Users/zq179/.dsh/profiles/node_modules/dsh-vision-client/lib/client.js')
assert.ok(loaded, 'load 应被调用')
const moduleExports = loaded.factory(requireMock)
assert.equal(typeof moduleExports.apply, 'function', 'exports.apply 应为函数')
assert.ok(Array.isArray(moduleExports.inject), 'exports.inject 应为数组')
assert.ok(moduleExports.inject.includes('slots'), 'inject 应声明 slots')
assert.ok(moduleExports.inject.includes('settingsScope'), 'inject 应声明 settingsScope')
console.log('✓ bundle factory 执行成功，inject = [slots, settingsScope]')

// ---- 3. apply：绑定 settingsScope 并注册 settings.section ----
let bindCalls = 0
let injectedSlot = null
let capturedOptions = null
let capturedComponent = null
const fakeScope = {
  getSnapshot: () => ({ status: 'ready', value: { provider: 'system' }, base: {}, user: {}, revision: 1, writable: true }),
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
          assert.equal(spec.namespace, 'dsh-vision', '应绑定 dsh-vision 命名空间')
          return fakeScope
        },
      }
    }
    throw new Error(`unexpected ctx.get: ${name}`)
  },
  slots: {
    inject: (name, callback) => {
      injectedSlot = name
      const disposer = callback()
      assert.equal(typeof disposer, 'function', 'register 应返回 disposer')
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
assert.equal(bindCalls, 1, '应只 bind 一次 settingsScope（组件共享同一 scope）')
assert.equal(injectedSlot, 'settings.section', '应注入 settings.section 槽位')
assert.ok(capturedOptions, 'register 应被调用')
assert.equal(capturedOptions.name, 'settings.section')
assert.equal(capturedOptions.id, 'dsh-vision')
assert.equal(typeof capturedOptions.label, 'function')
assert.equal(capturedOptions.label(), '视觉模型')
assert.equal(typeof capturedOptions.inject, 'function', '应有 inject 数据')
const injected = capturedOptions.inject()
assert.equal(injected.scope, fakeScope, 'inject 应提供共享 scope')
assert.equal(typeof capturedComponent, 'function', '组件应为函数')
console.log('✓ apply 绑定 settingsScope 一次，settings.section 注册正确，inject 提供共享 scope')

// ---- 4. 组件可渲染（smoke）----
try {
  const element = capturedComponent({ scope: fakeScope })
  assert.ok(element === null || element !== undefined, '组件应返回 React 元素或 null')
  console.log('✓ 组件函数可调用')
} catch (err) {
  assert.fail(`组件调用抛错: ${err.message}`)
}

// ---- 5. bundle 关键内容存在性 ----
assert.ok(bundleSource.includes('/dsh-vision/config'), '应包含 config 路由调用')
assert.ok(bundleSource.includes('/dsh-vision/models'), '应包含 models 路由调用')
assert.ok(bundleSource.includes('/dsh-vision/test'), '应包含 test 路由调用')
assert.ok(bundleSource.includes('系统模型'), '应包含系统模型区块')
assert.ok(bundleSource.includes('自定义模型'), '应包含自定义模型区块')
assert.ok(bundleSource.includes('默认提示词'), '应包含默认提示词字段')
assert.ok(bundleSource.includes('系统提示词'), '应包含系统提示词字段')
assert.ok(bundleSource.includes('查看常见服务商端点示例'), '应包含端点示例入口')
console.log('✓ bundle 内容完整性：双模式区块 + 提示词 + 示例 + 3 个路由')

console.log('\n全部 5 项 bundle 契约测试通过 ✅')
