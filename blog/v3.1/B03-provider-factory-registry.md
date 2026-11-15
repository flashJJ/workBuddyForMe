# 模型协议不该写死在 switch 里：provider 注册表的边界

聊天接口看起来只有一种：发消息，收流。

真正接起来才发现，协议差异都藏在适配器里：OpenAI 兼容端点用 `/v1/chat/completions`，本地 Ollama 的模型列表走 `/api/tags`，对话却又能复用 OpenAI 兼容层。上层编排器只关心“有没有工具调用、能不能流式、embedding 维度多少”，不关心 URL 长什么样。

早期我们把这件事写成两个 case：

```ts
switch (connection.protocol) {
  case 'openai-compatible': return createOpenAiAdapter(connection);
  case 'ollama': return createOllamaAdapter(connection);
  default: throw ProviderError.unsupported(protocol);
}
```

两个协议够用，但每接一个新厂商就要改内核。更麻烦的是测试：想验证一个 mock provider，只能改 `switch` 或者绕过 `createProvider`。

## 一、注册表的最小形态

改造后只有一张表和一个查表函数：

```ts
type ProviderFactory = (connection: ProviderConnection) => ChatProvider;

const FACTORIES = new Map<string, ProviderFactory>([
  ['openai-compatible', createOpenAiAdapter],
  ['ollama', createOllamaAdapter],
]);

function createProvider(connection) {
  const factory = FACTORIES.get(connection.protocol);
  if (!factory) throw ProviderError.unsupported(connection.protocol);
  return factory(connection);
}
```

三个约束：

1. 内置协议在模块初始化时登记，顺序固定。
2. 未知协议仍然抛 `ProviderError.unsupported`，错误码、消息与原来一致。
3. 注册函数拒绝覆盖已有协议。

第三条值得解释。允许覆盖会让“同一个协议名”在不同启动顺序下指向不同实现，排查时无法复现。真需要替换，应该换协议名，或者通过配置显式选择版本。

## 二、注册表只负责“找得到”

这是最容易误解的地方：注册表解决的是分发，不解决能力一致性。

一个协议可能支持聊天但不支持工具调用，可能支持 embedding 但维度不固定，可能有视觉输入、也可能没有。把这些差异塞进 factory 表，会变成一堆可选字段和运行时分支。

本版明确不做能力元数据。上层仍然按现有字段判断：

- `supportsTools` 决定是否下发工具声明。
- `listModels` 返回发现项，上下文长度探测不到就是 null。
- `chatStream` 与 `embed` 的行为由适配器自己保证。

注册表只回答“这个 protocol 用哪个适配器创建”。

## 三、mock provider 的接入方式

测试里注册一个新协议，完全不需要改 `createProvider`：

```ts
registerProviderFactory('mock-protocol', () => stub);
const provider = createProvider({ protocol: 'mock-protocol', ... });
```

同时补一条重复注册测试：`registerProviderFactory('ollama', ...)` 必须抛错。

这两条测试的价值不在于覆盖率，而在于锁住边界：

- 新协议可接入，不碰内核。
- 内置协议不能被悄悄替换。

## 四、为什么不在本版做“协议能力声明”

我们评估过在注册表里增加元数据：

```ts
interface ProviderDescriptor {
  protocol: string;
  factory: ProviderFactory;
  capabilities: { chat: true; tools: boolean; vision: boolean; embedding: boolean };
}
```

听起来很完整，但会立刻遇到三个问题：

1. 能力不是布尔值。视觉有分辨率限制，embedding 有维度与批量上限，工具调用有并行限制。
2. 声明与实现容易漂移。适配器升级后忘记改声明，比没有声明更危险。
3. UI 需要重新设计。设置页目前按协议与厂商展示，改成按能力矩阵展示是另一个版本的工作量。

所以本版只留 factory 注册口。等真的出现第三个、第四个协议，再把共同差异提炼成元数据。

## 五、和容量、重试的关系

注册表不改变请求链路：

- 超时、重试、退避仍然在 HTTP 层统一处理。
- 流式解析仍然在 SSE 层统一处理。
- 供应商错误仍然归一化成结构化错误。

这也是把 factory 表放在最外层的原因：只替换“创建适配器”这一步，不侵入重试与错误处理。替换面越小，回归风险越低。

## 六、验证

- 现有 OpenAI / Ollama / 未知协议测试保留。
- 新增新协议注册测试与重复注册拒绝测试。
- 适配器自身的 chat、embedding、模型列表测试不参与这次改动。
- 类型检查覆盖所有调用方，包括 provider 服务、Ollama 探活与设置页测试。

## 七、可迁移的结论

判断一个 `switch` 该不该换成注册表，可以看两点：

- 分支是否对应“可替换实现”，而不是业务规则。
- 新增实现是否必然要改分发函数。

如果都是，注册表是低风险改造。它不引入依赖注入框架，也不改变调用方，只是把“选择”集中到一张表里。

但注册表不是能力系统。它只解决“找得到”，不解决“行为一致”。把这两件事混在一起，就会得到一个看似通用、实际到处特判的工厂。

下一篇讲动效内容的快照注入：怎么在不改变默认观感的前提下，让运行时接受另一组姿势、动作与行为。
