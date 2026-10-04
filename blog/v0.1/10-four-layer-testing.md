# 外部模型调用 100% mock：四层测试体系的取舍

> 测试里调真实 API？那不是测试，是烧钱。

## 为什么必须 mock

AI 应用的核心依赖是大模型 API。如果测试里调真实 API：
- **慢**：一次对话几秒，集成测试跑几分钟
- **贵**：跑一遍测试花掉真金白银
- **不稳定**：上游限流、超时、返回内容变化，测试时绿时红
- **有副作用**：真的往数据库写东西，污染数据

所以铁律：**测试中外部模型调用 100% mock**。

## 四层测试体系

```text
┌─────────────────────────────────────┐
│  E2E（Playwright）                  │  关键路径，mock provider
├─────────────────────────────────────┤
│  集成测试（Route Handler）           │  真实 SQLite + mock provider
├─────────────────────────────────────┤
│  单元测试（core / ai / database）    │  纯函数 + 注入依赖
├─────────────────────────────────────┤
│  门禁（lint / typecheck / 行数）     │  静态质量
└─────────────────────────────────────┘
```

### 第一层：门禁

`pnpm check` = typecheck + lint + 300 行门禁。不跑业务逻辑，纯静态检查，秒级反馈。这是提交前的最低门槛。

### 第二层：单元测试

针对纯函数和注入式服务：
- `packages/shared`：Zod schema、错误码、SSE 序列化
- `packages/ai`：HTTP 重试、SSE 解析（mock fetch）
- `packages/database`：内存 SQLite，仓储 CRUD
- `packages/core`：服务层（mock 仓储 / mock provider）

覆盖率要求 statements ≥ 70%，Vitest 配置阈值阻断——不达标 CI 挂。

mock 的关键是**依赖注入**。服务层通过工厂函数接收依赖：

```ts
function createChatOrchestrator(deps: { db, cipher, providers }) {
  // 用 deps 里的东西，不直接 import 具体实现
}
```

测试时传入 mock 依赖，就能隔离测试。

### 第三层：集成测试

驱动真实 Route Handler，用**临时数据根 + 真实 SQLite + mock provider**：

```ts
const dataRoot = mkdtempSync(...);
setDataRootForTest(dataRoot);
// 用 mock provider 替换真实适配器
```

测试完整的 HTTP 链路：请求 → Zod 校验 → 服务层 → 数据库 → 响应。包括 SSE 流的拼接、中断、错误分支。

集成测试不 mock 数据库，因为要验证 SQL 和事务是否正确。但 provider 一定 mock，因为不能调真实 API。

### 第四层：E2E

Playwright 跑真实浏览器，走完整用户路径：

1. 配置供应商与模型（mock）
2. 创建自定义助手
3. 新建对话、流式收发、中途停止
4. 创建知识库、上传文档至 indexed
5. RAG 提问、验证引用

E2E 的 provider mock 通过环境变量 `WBFM_MOCK_AI=1` 注入进程内 mock，返回固定 SSE 分块。这样 E2E 验证的是**前端交互和全链路编排**，不是模型质量。

## mock fetch 的统一方式

Vitest 里用 `vi.stubGlobal('fetch', mockFetch)` 替换全局 fetch。mock 根据 URL 返回不同响应：

```ts
vi.stubGlobal('fetch', async (url, init) => {
  if (url.includes('/chat/completions')) {
    return mockSseResponse(['你', '好']);
  }
  if (url.includes('/embeddings')) {
    return mockJsonResponse({ data: [{ embedding: [0.1, 0.2, ...] }] });
  }
});
```

全库 25 处 `vi.stubGlobal('fetch', ...)` 覆盖所有外部调用点，没有任何真实网络请求。

## 测试数据隔离

每个用例用独立临时数据根：

```ts
beforeEach(() => {
  const dir = mkdtempSync(path.join(tmpdir(), 'wbfm-test-'));
  setDataRootForTest(dir);
});
```

禁止依赖用户真实数据目录，保证测试可重复、可并发。

## 覆盖率阈值的意义

不是为了数字好看，是为了**逼自己写可测的代码**。如果一个函数覆盖率上不去，通常说明它耦合太重、副作用太多——该拆了。

实测覆盖率：
- config: 96%
- database: 95%
- ai: 93%
- core: 85%

都在 70% 阈值以上。core 稍低是因为有些错误分支（极端异常）不容易构造，但核心路径全覆盖。

## 一个人的测试策略

一个人开发，时间有限，测试要讲究性价比：

- **核心路径必须有集成测试**：对话、知识库、设置——这些是产品价值所在
- **纯函数必须有单测**：分片、prompt 组装、SSE 解析——逻辑复杂、容易出 bug
- **UI 组件测关键交互**：不是每个组件都测，测容易坏的（表单、流式渲染）
- **E2E 测关键路径**：5 条够了，覆盖核心用户旅程

不追求 100% 覆盖率，追求**改了核心逻辑有测试兜底**。

## 小结

AI 应用的测试体系：

1. **外部调用 100% mock**：不慢、不贵、不稳定
2. **四层测试**：门禁 → 单元 → 集成 → E2E，各有侧重
3. **依赖注入**：让 mock 变得简单
4. **数据隔离**：临时数据根，测试可重复
5. **覆盖率阈值**：逼自己写可测代码

测试不是为了证明代码对，是为了改代码时不害怕。

下一篇聊聊「一个人的项目也要有 CI：本地一键脚本与 GitHub Actions」。
