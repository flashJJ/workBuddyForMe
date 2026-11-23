# SSE 契约机械派生：让「漏列一个事件」在编译期就不可能

SSE 事件是这个应用最老的 wire 契约之一：从第一个流式对话版本开始，服务端发什么帧、客户端认什么帧，全靠一组字符串事件名维系。功能一路加到 12 个事件，这套契约的维护方式却一直没变——**三处手写联合类型，漏列一个事件不会产生任何编译错误**，只能靠评审时肉眼对照。这篇讲怎么把「不能漏列」这个不变量，从人的记忆里搬进类型系统和测试。

## 痛点：三份手写名单，漂移没有任何声音

重构前同一个事件契约被抄了三遍：

- **core 编排器**：手写一份「会发哪些事件」的联合；
- **web 消费侧**：再手写一份「会收哪些事件」的联合；
- **wire 窄化层**：拿到线上来的 `{event: string, data: unknown}`，手写字符串判断收窄类型。

加一个新事件的标准流程是：先在 core 发，然后**记得**去另外两处补上。忘了？运行时那个帧被静默丢弃或者落到 `as any` 分支，编译全程绿。更糟的是 web 端为了让松散的 wire 数据过类型检查，散落了大量 `as` 断言——类型系统在边界上实际上是瞎的。

## 重构：一张载荷表，机械派生一切

新的结构只有一个真源：shared 包里的载荷映射。

```ts
// 唯一真源：事件名 -> 载荷类型
type SsePayloadMap = {
  meta: { messageId: string; conversationId: string; proactive?: boolean };
  delta: { content: string };
  tool: ToolEventPayload;
  done: { content: string; usage: TokenUsage | null };
  error: { code: string; message: string };
  // ……共 12 个事件
};

// 条件类型机械派生：{ event: E; data: 对应载荷 } 的联合
type SseEvent<K extends SseEventName = SseEventName> = {
  [E in K]: { event: E; data: SsePayloadMap[E] };
}[K];
```

关键在那个分布式条件类型：把键名并集 `K` 映射一遍再用 `[K]` 取出，结果就是每个事件各自身家清白的联合。任何 `{ event, data }` 联合**禁止再手写**——要某个子集，给 `SseEvent<>` 传键名并集就行：

```ts
type OrchestratorEvent = SseEvent<OrchestratorEventName>; // 编排器只取它那 8 个
```

漏列一个事件？那它在映射表里就根本不存在，`formatSse('新事件', ...)` 连编译都过不去。**「事件必须有载荷类型」第一次成为编译期事实。**

## 类型与运行时：satisfies 锁住同源

类型管编译期，但发事件是运行时行为——还需要一份运行时的事件名集合去做白名单、过滤、序列化。这份数组不能又是手写名单，否则它和类型会成为新的两份真源。

做法：运行时数组用 `satisfies` 向类型自首同源：

```ts
const ORCHESTRATOR_EVENT_NAMES = [
  SSE_EVENT.META, SSE_EVENT.DELTA, /* …8 个… */ SSE_EVENT.DONE,
] as const satisfies readonly OrchestratorEventName[];
```

`satisfies` 的含义是：**数组里每个值都必须是合法的编排器事件名，但不允许把类型拓宽成 string**。多写一个不在联合里的名字，编译报错；联合里加了事件、数组没加——别急，这层由契约测试抓（下面讲）。编译期类型与运行时集合从同一组名字派生，谁也不能私下漂移。

## web 边界：唯一入口 + 穷尽检查

线上读出来的帧永远是 `{event: string, data: unknown}`，窄化逻辑被收敛成全仓**唯一**一个入口函数：

```ts
function narrowChatSseEvent(raw: RawSseEvent): WebChatSseEvent | null {
  return CHAT_EVENT_NAME_SET.has(raw.event) ? (raw as WebChatSseEvent) : null;
}
```

对话流不认的帧（task/flow/未知帧）返回 null，由调用方忽略。全仓对 wire 数据的边界断言只存在于这一处，下游拿到的全是类型干净的派生联合。

消费侧的 switch 则配上穷尽检查助手：

```ts
function assertNever(value: never): never {
  throw new Error(`未穷尽的 SSE 事件分支: ${JSON.stringify(value)}`);
}
// switch (ev.event) { case 'meta': … default: assertNever(ev) }
```

将来联合里加了事件而 switch 漏处理，`ev` 在 default 分支不再是 `never`，tsc 当场报错。

这次收敛删掉了 **voice 桥里的 7 处、流钩子中的 10 处 `as` 断言（共 17 处）**，以及四段手写事件联合。边界上的类型谎言被整片拔掉。

## 三份契约测试互锁

类型只能保证「写出来的代码自洽」，保证不了「运行时真的和类型同源」。于是三份契约测试把三个包钉在一起：

1. **shared 契约**：载荷映射的键表与运行时事件名数组做**等集**断言——不多、不少；并锁死事件总数为 **12**。加事件忘登记、删事件忘清理，测试立刻红。
2. **core 契约**：编排器的事件 switch 必须穷尽；同时反向断言 task/flow 这两类**不属于**编排器事件（排除也是契约：8 个就是 8 个，谁也别顺手塞进来）。
3. **web 契约**：录一段真实 wire——**13 帧**序列过窄化函数，断言 **10 帧被收、3 帧被弃**（混入的 task/flow/乱码帧必须落到 null）。窄化白名单与线上实况的对应关系，用录制帧固定下来。

## 变异验证：删掉任意一处映射，必须见红

契约测试自己也得证明不是恒真。手段是变异：**删掉载荷映射里的任意一个事件、或者从运行时数组里摘掉一个名字，三份测试中对应的一份必须立刻失败。**

- 删映射键：shared 等集测试报「键表与数组不等」，且用到该事件的 core/web 代码编译期先红；
- 删运行时数组项：等集测试报差集；
- 窄化白名单摘掉一个：13 帧录制里对应的帧从「被收」变「被弃」，数量断言失败。

每一种「漏列」的漂移方式，都有一个测试在那个具体位置等着。

## 方法论：一个不变量，两层强制

收口这次重构，最值得带走的是强制力的分工：

> **「不能漏列」这个不变量，单一真源 + 穷尽检查管编译期，运行时镜像 + 变异测试管运行期。**

类型系统擅长回答「写出来的代码是否自洽」：派生联合让漏列无法编译，`assertNever` 让漏处理无法编译，`satisfies` 让运行时名单没法写进野名字。但类型在运行时不存在——线上来的永远是字符串，所以需要等集测试和录制帧守住运行期，再用变异测试证明这些守卫自己没有睡着。

不变量不靠评审时有人记得，而靠漏列的那条路在编译期或测试里物理不通——这正是整个 v1.1 加固主题在 SSE 契约上的样子。
