---
title: "工程约束怎么不拖后腿：TS strict + 单文件≤300行 + 外部调用 mock 的三层门禁实战"
series: "WorkBuddy For Me v0.2 技术拆解"
number: "B09"
tags: ["typescript", "testing", "engineering"]
date: "2025-Q4"
---

# 工程约束怎么不拖后腿

## 约束不是枷锁，是认知成本的下限

"约束"这个词听起来像限制——限制你用 20 种设计模式、限制你把所有逻辑塞一个文件、限制你想用 `any` 就用。但好的约束本质上是**把团队的认知成本固化成可机器检查的规则**：

- "单文件 ≤300 行"不是因为长文件一定坏，而是因为**当它超过 300 行时，大概率可以拆出独立的子模块**，而机器检查可以在你还没意识到时就拦住；
- "TS strict 全开"不是因为 `any` 不能用，而是因为**一旦你用了 `any`，TypeScript 就失去了大部分价值**，而 strict 模式可以在编译期把类型不匹配暴露出来；
- "外部调用必须 mock"不是因为真实调用不好，而是因为**单元测试需要确定性**，而真实 HTTP 调用、数据库、文件系统都是不确定的。

v0.2 在 v0.1 的基础上强化了三层门禁——每一层都有具体的工具实现、CI 集成和例外处理机制。

## 第一层：TS strict 全开

WorkBuddy For Me 的所有包共享 `tsconfig.base.json`（由 `packages/config` 里的 `repo-invariants.test.ts` 保证），里面：

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true
  }
}
```

几个被显式开启的 strict 子项里，`noUncheckedIndexedAccess` 和 `exactOptionalPropertyTypes` 对工具链影响最大。

### noUncheckedIndexedAccess：防止 undefined 爆炸

工具执行器里有这么一段（`packages/core/src/tools/tool-executor.ts`）：

```typescript
for (const name of assistant.enabledTools) {
  const tool = ALL_TOOLS[name];  // 索引 ALL_TOOLS Record
  map.set(name, tool);
}
```

在 strict 但 `noUncheckedIndexedAccess=false` 的情况下，TypeScript 会认为 `ALL_TOOLS[name]` 返回 `Tool`（Record 的值类型），但实际上如果 `name` 是一个不在 Record 里的 string，运行时会返回 `undefined`。开启 `noUncheckedIndexedAccess` 后，类型变成 `Tool | undefined`——你必须在使用前检查。

v0.2 的处理方式是**用类型守卫**让 TypeScript 推断出 `name` 一定存在于 Record 里：

```typescript
// orchestrator-helpers.ts
const VALID_TOOL_NAMES: readonly ToolName[] = ['current_time', 'knowledge_search', 'fetch_webpage'];
function isToolName(value: string): value is ToolName {
  return (VALID_TOOL_NAMES as readonly string[]).includes(value);
}

// 在 chat-orchestrator.ts 里
if (!isToolName(call.function.name)) {
  // 非工具声明，跳过
} else {
  const tool = toolMap.get(call.function.name);  // get(ToolName) 返回 Tool | undefined
  // ...
}
```

`isToolName` 是一个 TypeScript 类型谓词函数——通过它之后，`call.function.name` 的类型被收窄为 `ToolName`，`toolMap.get(ToolName)` 返回 `Tool | undefined`（Map.get 的标准签名），然后再做一次 `if (!tool) runUnknownTool(...)` 检查就完成了。

### exactOptionalPropertyTypes：undefined ≠ 未设置

```typescript
export interface ToolContext {
  signal?: AbortSignal;        // 可选
  knowledgeBaseId: string | null;  // 必选但允许 null
  retrieve: (...) => Promise<RetrievedChunk[]>;
}
```

开启 `exactOptionalPropertyTypes` 后，`signal: undefined` 和 `signal` 不存在是两个不同的概念——前者要求你显式赋值 `undefined`，后者可以完全不写。这在构建 `ToolContext` 时有点烦，但好处是**当你看到 `{ signal: undefined }` 时，你知道这是"有意不提供 signal"，而不是"忘了填"**。

### strict 不是没有出口

如果某个地方确实需要 `any`（比如接第三方库的返回值），WorkBuddy For Me 用 `// @ts-expect-error` + 注释说明理由，而不是在 tsconfig 里关掉 strict。关键原则：**strict 是默认行为，例外需要显式声明并解释**。

## 第二层：单文件 ≤300 行

这是 v0.1 就有的约束，v0.2 新增了大量代码后仍然坚持。检查脚本是 `scripts/check-file-lines.mjs`，逻辑简单直接：

1. 扫描 `apps/` 和 `packages/` 下所有手写 `.ts/.tsx` 文件；
2. 物理行数超过 300 的报错并 exit 1；
3. 白名单在 `scripts/.lines-whitelist.json`，每个豁免必须附理由。

这个脚本在 CI 里作为单独 step 运行（`.github/workflows/ci.yml`），任何 PR 里引入的超限文件都会被拦截。

### 真实例子：chat-orchestrator.ts 的拆分

v0.2 新增了工具链后，chat orchestrator 的逻辑膨胀了——如果全部塞在一个文件里，很容易超过 500 行。我们把它拆成了：

```
packages/core/src/chat/
├── chat-orchestrator.ts        (299 行 ← 刚好卡线)
├── tool-runner.ts              (108 行：provider 调用 + 工具降级)
├── model-resolver.ts           (60 行：模型解析 + vision 门控)
├── turn-preparation.ts         (74 行：用户消息准备 + 重生成)
├── orchestrator-helpers.ts     (150 行：isToolName、mergeCitations、safeParseArgs 等纯函数)
├── prompt.ts                   (120 行：消息历史构建 + RAG 上下文拼入)
├── multimodal.ts               (60 行：图片 data URL 构建)
├── types.ts                    (40 行：共享类型定义)
```

注意 `chat-orchestrator.ts` 是 299 行——**不是巧合，是拆分的边界**。每次加新功能时，如果 orchestrator 的行数接近 300，就会触发"把这段逻辑抽成独立模块"的思考。

### 例外处理：为什么 .lines-whitelist.json 有存在必要

v0.2 有一个白名单条目：`packages/database/src/migrations/runner.ts`，理由是"SQLite migrations runner，集中管理所有迁移版本号与执行顺序，拆分后反而破坏阅读性"。这个豁免是合理的——迁移文件确实不适合拆分，但**申请豁免必须附理由**，不能无条件放行。

## 第三层：外部调用必须 mock

WorkBuddy For Me 里的"外部调用"指：**HTTP fetch、数据库操作、文件系统读写、系统时间**。这些东西在单元测试里必须 mock，否则：

- HTTP fetch 依赖网络，CI 里可能超时或返回不同结果；
- 数据库需要起 SQLite，每个测试文件都要 setup/teardown；
- 文件系统读写可能污染 CI 工作目录；
- `Date.now()` 依赖真实时钟，测试里没法制造"明天"或"过去"。

### Mock 策略：分层替换点

WorkBuddy For Me 在架构设计时就预留了替换点：

| 外部调用 | 替换点 | 测试文件里的 mock |
|----------|--------|-------------------|
| HTTP fetch | `@wbfm/ai` 的 `fetch-with-retry` | `vi.mock('node:fetch', ...)` |
| 数据库 | `database` 包的 Repository 接口 | 直接 mock repository 方法（不 mock sqlite） |
| 时间 | 工具里 `new Date()` / `Date.now()` | `vi.useFakeTimers()` |
| LangSmith trace | `@wbfm/ai` 的 `tracer.ts` | 环境变量关闭 + `vi.fn()` 返回 null |

### 真实例子：tool-executor 的测试

`executeToolCall` 本身不直接做外部调用——它接收 `Tool` 对象，调 `tool.run(rawArgs, ctx)`。这意味着测试时只需要：

```typescript
// packages/core/src/tools/tool-executor.test.ts
const mockTool: Tool = {
  name: 'current_time',
  description: 'test',
  parameters: {},
  async run(_args, _ctx): Promise<ToolResult> {
    return { ok: true, output: '2026-09-22', summary: '2026-09-22' };
  },
};

describe('executeToolCall', () => {
  test('正常执行返回 ok:true', async () => {
    const ctx: ToolContext = { signal: undefined, knowledgeBaseId: null, retrieve: vi.fn() };
    const result = await executeToolCall(mockTool, {}, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toBe('2026-09-22');
  });

  test('超时返回 ok:false + 超时原因', async () => {
    const slowTool: Tool = {
      ...mockTool,
      async run(_args, ctx) {
        await new Promise((r) => setTimeout(r, 100));
        return { ok: true, output: 'done', summary: 'done' };
      },
    };
    const ctx: ToolContext = { signal: undefined, knowledgeBaseId: null, retrieve: vi.fn() };
    const result = await executeToolCall(slowTool, {}, ctx, 10);  // 10ms 超时
    expect(result.ok).toBe(false);
    expect(result.summary).toContain('超时');
  });
});
```

整个测试文件不 import 任何 HTTP、数据库、文件系统模块。`executeToolCall` 的所有外部依赖都通过参数传入（`Tool` 对象和 `ToolContext`）——**可注入 = 可测试**。

### 另一个例子：ssrf-guard 的测试

SSRF 防护是纯函数（除了 DNS 解析那步），所以测试极其直接：

```typescript
// packages/core/src/tools/ssrf-guard.test.ts
describe('isBlockedIp', () => {
  test.each([
    ['127.0.0.1', true, '回环'],
    ['10.0.0.1', true, '私网 A'],
    ['169.254.169.254', true, '云元数据'],
    ['192.168.1.1', true, '私网 C'],
    ['8.8.8.8', false, 'Google DNS'],
    ['1.1.1.1', false, 'Cloudflare DNS'],
    ['2001:4860::8888', false, 'Google IPv6'],
    ['::1', true, 'IPv6 回环'],
  ])('%s → blocked=%s（%s）', (ip, blocked, _desc) => {
    expect(isBlockedIp(ip).blocked).toBe(blocked);
  });
});
```

纯函数 = 100% 覆盖率 = 不需要 mock = 不需要 setup/teardown。

## 三层门禁的 CI 集成

CI（`.github/workflows/ci.yml`）按以下顺序执行检查：

```yaml
- run: pnpm typecheck          # 第一层：TS strict 编译
- run: node scripts/check-file-lines.mjs  # 第二层：300 行门禁
- run: pnpm test               # 第三层：单元测试 + mock 策略
- run: pnpm lint               # 补充：ESLint（prefer-const、no-unused-vars 等）
```

顺序很重要——typecheck 和行数检查失败是"确定性拒绝"（代码还没写对），应该先执行；测试失败可能需要调试，放到后面。

## 约束什么时候会成为瓶颈

诚实地说，这些约束有时候确实会让开发变慢：

- 想在 orchestrator 里加一个辅助函数，但文件已经 295 行了 → 得拆模块或申请白名单；
- 想写 `toolMap.get(call.name)!.run(...)` 但 strict 要求先判空 → 多写 3 行；
- 想直接在测试里 `fetch('http://localhost:11434')` 但规则要求 mock → 改用 `vi.mock`。

但这些"变慢"换来的是**长期稳定性**：

- 300 行门禁保证了每个模块都小到可以理解——review 一个 PR 时，你不需要同时理解 1000 行代码；
- strict 编译期报的类型错，比上线后用户遇到的 undefined 错便宜一万倍；
- mock 测试保证了 CI 结果可重复——"我本地测过了但 CI 红了"这种情况在 WorkBuddy For Me 里很少见。

## 小结

v0.2 的三层工程约束：

| 层 | 工具 | 强制点 | 例外机制 |
|----|------|--------|---------|
| TypeScript | `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` | `tsc --noEmit` | `// @ts-expect-error` + 注释 |
| 文件规模 | `scripts/check-file-lines.mjs` | 物理行数 ≤300 | `.lines-whitelist.json` + 理由 |
| 测试 | Vitest + 架构上的依赖注入 | 外部调用不进入单元测试 | E2E 测试里真实调用 |

三层约束的共同原则是：**约束是默认行为，例外需要显式声明并解释**。这保证了在没有额外思考时，开发者总是走"安全、可维护、可测试"的路径。

B10 是本系列最后一篇——从 v0.1 到 v0.2 的架构债盘点，看看哪些可以还、哪些留给 v0.3。
