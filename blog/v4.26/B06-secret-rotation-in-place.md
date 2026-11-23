# 换钥匙，不换门：Webhook Secret 的原地轮换

v4.25 的 Webhook Secret 只能在创建时获得一次，库内只存哈希。

这在安全上是正确的，但在运维上很别扭：密钥疑似泄露时，唯一做法是删除触发器再重建。URL 变了，外部系统要改配置；历史状态也断了。

v4.26 增加一个更符合直觉的动作：**原地轮换**。

## 一、契约

```http
POST /api/flows/:id/triggers/:triggerId/rotate
```

响应：

```json
{
  "success": true,
  "data": {
    "trigger": { "id": "trg_xxx", "webhookPath": "/api/public/flows/triggers/trg_xxx" },
    "secret": "wft_..."
  }
}
```

- 触发器 id 与 URL 不变；
- 新 Secret 只在这个响应里出现一次；
- 数据库里仍然只有 SHA-256 哈希；
- 旧 Secret 从下一次请求开始即 401。

## 二、为什么不做双钥并存

双钥并存（新旧都可用一段时间）能平滑迁移，但会带来两个问题：

1. 泄露的旧钥在过渡期内仍然有效；
2. 需要额外的过期时间、清理任务与状态字段。

本地优先的桌面产品，外部调用方通常就是本机脚本或局域网内的工具。轮换后立即失效、调用方改一处配置，成本可控。因此这一版选择「立即切换」，不引入过渡期。

如果将来确有平滑迁移需求，可以作为显式选项加入，而不是默认行为。

## 三、实现只改一处

仓储新增：

```ts
rotateSecret(id: string, secretHash: string): FlowTriggerView | null {
  const result = db.prepare(
    `UPDATE workflow_triggers
     SET secret_hash = @secretHash, updated_at = @ts
     WHERE id = @id AND kind = 'webhook'`,
  ).run({ id, secretHash, ts: nowIso() });
  if (result.changes !== 1) return null;
  return mapTrigger(getRow(id)!);
}
```

服务层做三件事：

1. 校验触发器属于该流程；
2. 校验 `kind === 'webhook'`；
3. 生成新 Secret、哈希、写库，并把明文放进返回值。

路由只负责参数解析与错误映射。

## 四、UI 的二次确认

轮换是不可逆操作，按钮做成两段式：

- 第一次点击进入确认态；
- 第二次点击才真正调用。

成功后复用创建时的 Secret 面板，展示新 Secret 与 URL，并提供复制。关闭对话框后，明文不再可见。

## 五、验证

- 旧 Secret 请求返回 401；
- 新 Secret 请求通过；
- 库内哈希变化；
- 文件触发器调用轮换返回 422；
- 跨流程轮换返回 404。

这五条覆盖了「换钥不换门」的全部承诺。
