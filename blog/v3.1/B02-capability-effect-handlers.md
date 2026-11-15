# 六种能力、三套生命周期：把 switch 换成 handler 注册表

能力包系统最容易被低估的是“停用”和“卸载”。

启用只是把资源建出来，停用要把它撤干净，卸载还要判断哪些资源应该删行、哪些应该保留禁用状态。六类能力各有各的语义，写在一个 `switch` 里，时间一长就会出现“启用分支改了、停用分支忘了”的问题。

我们的桌面 AI 应用早期就是这种结构：`enableCapabilityEffect` 六个 case，`disableCapabilityEffect` 再六个 case，卸载函数里再加两个 `if`。新增一类能力要改三处，漏一处就是脏状态。

## 一、先把生命周期说清楚

六类能力对应的资源不一样：

| 能力类型 | 启用 | 停用 | 卸载补偿 |
|---|---|---|---|
| 技能 | 把 payload 拷进技能目录并注册 | 移除目录与注册 | 无额外动作 |
| MCP | 创建服务器连接 | 移除服务器 | 无额外动作 |
| 工作流 | 建行、存版本、发布 | 取消发布或禁用 | 删行或保留禁用行 |
| 宠物动作 | 写入动作服务 | 移除动作 | 无额外动作 |
| 事件剧本 | 写剧本定义 | 标记禁用 | 清剧本行 |
| 报表卡片 | 建卡片行 | 标记禁用 | 清卡片行 |

“启用”和“停用”成对，“卸载补偿”只有部分类型需要。原来的写法把这三件事混在一个文件里，阅读者必须同时理解六种资源。

## 二、handler 契约

改造后的契约很小：

```ts
interface CapabilityEffectHandler {
  enable(manifest, packDir, deps): string;
  disable(effectRef, deps): void;
  uninstall?(effectRef, deps): void;
}
```

三个方法都拿到同一份依赖集合，但每个 handler 只取自己需要的部分。返回值是一个句柄，通常是资源 id；停用与卸载都用这个句柄定位资源。

内置表按 kind 登记：

```ts
const BUILTIN_HANDLERS: Record<CapabilityKind, CapabilityEffectHandler> = {
  skill: { enable, disable },
  mcp: { enable, disable },
  workflow: { enable, disable, uninstall },
  'pet-action': { enable, disable },
  'event-script': { enable, disable, uninstall },
  'report-widget': { enable, disable },
};
```

`Record<CapabilityKind, ...>` 在这里很关键：新增 kind 时 TypeScript 会强制补全，不会出现“忘记登记”的运行时缺口。

## 三、分发函数只做三件事

```ts
function enableEffect(manifest, packDir, deps) {
  const handler = HANDLERS.get(manifest.kind);
  if (!handler) throw ApiError.validation(`尚未接入：${manifest.kind}`);
  return handler.enable(manifest, packDir, deps);
}
```

停用与卸载更短：

```ts
function disableEffect(manifest, effectRef, deps) {
  HANDLERS.get(manifest.kind)?.disable(effectRef, deps);
}

function uninstallEffect(manifest, effectRef, deps) {
  if (!effectRef) return;
  HANDLERS.get(manifest.kind)?.uninstall?.(effectRef, deps);
}
```

这三段代码保留了原有语义：

- enable 找不到 handler 必须报错，因为调用方需要知道能力没有落地。
- disable 找不到 handler 保持静默，避免旧数据或未来 kind 让停用流程卡死。
- uninstall 只对声明了 `uninstall` 的类型执行，未声明就是空操作。

语义不变是重构的底线。测试里专门覆盖了“未知 kind 的 enable 报错、disable 静默、uninstall 静默”。

## 四、注册函数与覆盖策略

新 kind 通过一个显式函数登记：

```ts
registerCapabilityEffectHandler(kind, handler);
```

它只做两件事：检查是否已存在，写入表。已存在则抛冲突。

为什么不允覆盖？因为能力 kind 是持久化数据的一部分，覆盖会让同一份数据在不同进程状态下表现不同。真需要替换实现，应该换一个 kind 名，或者在更高层做显式迁移，而不是悄悄改表。

这也意味着本版不会把注册函数暴露给能力包清单。能力包只能使用内核已登记的类型；运行时代码插件仍然不做。

## 五、依赖形状的取舍

每个 handler 拿到完整依赖集合，只解构自己需要的字段。这样分发层简单，等依赖继续膨胀时再按能力类型拆子依赖。

## 六、为什么不做“能力插件热加载”

能力包已经有 manifest、校验和、签名、健康检查与升级回滚。再往前一步是“安装后不重启就生效”，那需要内容快照刷新、依赖拓扑与失败隔离。

这一版刻意停在“注册口”：

- 新 kind 能注册，但安装 schema 没放开。
- 能启停，但不承诺热加载。
- 不执行第三方代码。

先把“改内核”变成“登记一行”，再决定要不要把登记入口开放给外部。

## 七、验证

- 六类现有能力的安装、启停、卸载、升级测试原样通过。
- 新增 registry 单测：自定义 kind 注册后可 enable/disable/uninstall；未注册 kind 的三种行为；重复注册被拒绝；空句柄卸载无操作。
- 能力包相关 9 个测试文件、57 项测试通过。

## 八、可迁移的结论

如果你的系统里也有一个按类型分发的 `switch`，并且每类资源的生命周期不一致，可以先问三个问题：

1. 这三件事（启用、停用、卸载补偿）是不是每类都要？
2. 新增一类时，是否必须修改分发函数？
3. 分发函数是否承担了业务语义？

如果答案分别是“不、是、是”，那么 handler 表通常比 switch 更合适。它不引入新框架，也不改变调用方，只是把“选择实现”和“实现细节”分开。

下一篇讲另一个分发点：模型 provider 的 protocol → factory 注册表。
