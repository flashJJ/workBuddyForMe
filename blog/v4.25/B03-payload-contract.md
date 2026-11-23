# 事件入参契约：顶层合并与保留键

事件触发最容易让用户困惑的地方，是「我收到的 JSON 怎么在流程里引用」。这一版选择了一条最直观的规则：**body 顶层字段直接成为流程入参**，同时保留一份原始 payload。

## 一、Webhook 入参

调用方发送：

```json
{ "topic": "周报", "count": 3 }
```

流程 start 节点收到：

```json
{
  "topic": "周报",
  "count": 3,
  "payload": { "topic": "周报", "count": 3 },
  "source": "webhook",
  "triggerId": "tr_xxx",
  "receivedAt": "2026-11-23T09:00:00.000Z"
}
```

这样模板里可以直接写：

```text
{{$nodes.start.params.topic}}
```

而不需要先理解一层 `payload` 嵌套。

## 二、保留键不可覆盖

如果 body 里也带了 `source` 或 `triggerId`，不能让它覆盖系统字段。实现上先合并 body 的非保留键，再写入保留键：

```ts
const RESERVED = new Set(['source', 'triggerId', 'receivedAt', 'payload']);
const input = {};
for (const [key, value] of Object.entries(body)) {
  if (!RESERVED.has(key)) input[key] = value;
}
return { ...input, payload: body, source: 'webhook', triggerId, receivedAt };
```

保留 `payload` 的好处是：如果用户后续想改成严格模式，原始数据一直都在。

## 三、文件入参

文件事件没有 body，入参是结构化的事件描述：

```json
{
  "path": "E:\\notes\\a.md",
  "name": "a.md",
  "ext": "md",
  "eventType": "add",
  "changedAt": "2026-11-23T09:00:00.000Z",
  "source": "file",
  "triggerId": "tr_xxx",
  "file": { "path": "E:\\notes\\a.md", "name": "a.md", "ext": "md", "eventType": "add", "changedAt": "..." }
}
```

顶层字段方便直接引用，`file` 对象方便整体传给下游或作为 `$ref` 整字段绑定。

## 四、为什么不做可视化映射

字段映射需要一套 UI、校验与冲突规则，而且很容易演变成「低代码平台」。第一版先把原始数据完整、稳定地送进流程；等真实需求出现，再决定是加映射模板还是加条件过滤。

## 五、入参校验的边界

这一版不强制校验 start 节点的必填字段。事件源千差万别，缺字段时让流程自行判断（条件节点/LLM 提示词）比直接拒绝事件更实用。同步端点的严格校验仍然保留，两者语义不同。
