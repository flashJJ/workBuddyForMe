# 一个 reducer 管三类运行：工作信号如何做到只有一套口径

任务、工作流、多智能体协作，是三条完全不同的执行链路：一个按步循环，一个按节点图走，一个按轮次交接。它们的数据结构不同、事件名不同、连「进度」的含义都不同。

如果让每条链路各算一套状态，再让桌宠和审批页各自解读一遍，最终会得到六种说法。这次的做法是：**三条链路在边界处各自被压成一个形状相同的对象，之后所有消费者只看这一个形状。**

## 一、形状先于语义

统一后的对象只有十几个字段，但每个字段回答一个固定问题：

| 字段 | 回答的问题 | 谁在消费 |
|---|---|---|
| `source` / `runId` | 这是哪条链路、哪一次运行 | 去重、深链、主运行选择 |
| `title` | 用户该怎么称呼它 | 气泡、审批列表 |
| `outcome` | 现在处于哪个阶段 | 七态映射、排序 |
| `attention` | 是不是在等人 | 待审批计数、提醒 |
| `activity` | 正在做什么动作 | 思考与工作的区分、文案 |
| `stepLabel` | 卡在哪一步 | 气泡第二行 |
| `completedSteps` / `totalSteps` | 进度 | 进度展示 |
| `startedAt` / `updatedAt` / `endedAt` | 时间 | 耗时口径、终态过期 |
| `deepLink` | 点它该去哪 | 跳转 |

字段少是有意的。每多一个字段，就多一处「三类链路填不填得上」的争论。真正的取舍是：**宁可少一个字段，也不要一个字段在两三类运行里填不出来。**

## 二、activity 与 attention 必须分开

早期实现里，「等审批」和「失败」都曾被当成状态的一种。这样做的直接后果是状态机迅速膨胀：等待审批、等待输入、工具出错、模型出错……

这次把它们拆成两个正交维度：

| 维度 | 取值 | 语义 |
|---|---|---|
| `outcome` | queued / running / waiting / succeeded / failed / cancelled / interrupted / budget_exceeded | 运行走到了哪一步 |
| `attention` | none / approval / input | 是否需要人介入 |
| `activity` | idle / thinking / searching / reading / writing / executing / verifying / … | 此刻在做什么动作 |

拆开之后，组合是有意义的：

- `running` + `attention=none`：正常干活，`activity` 决定是「思考」还是「工作」；
- `waiting` + `attention=approval`：等工具或授权，桌宠必须切到等待；
- `waiting` + `attention=input`：工作流人工节点等填写或审核；
- `failed` + `attention=none`：失败是终态，不需要人「处理」，只需要人「知道」。

如果当初把注意力塞进 `outcome`，那么「正在跑一个新任务，同时还有一笔历史审批待处理」这种现实情况就没有位置可放。正交维度是唯一能表达它的形状。

## 三、聚合：多个运行同时在跑时，谁当主角

桌宠只有一个身体，而同时可能有三个任务在跑。聚合函数要在这时候给出一个确定答案，而不是让 UI 现场投票。

优先级从高到低：

```text
待审批（有审批项且能对上 runId）
  > attention=approval
  > waiting
  > 失败类终态（failed / interrupted / budget_exceeded）
  > running（最近更新优先）
  > queued
  > succeeded
  > cancelled
```

对应的纯函数实现里，排序权重是一个小整数，比较时先比权重，再比 `updatedAt`：

```ts
function signalRank(signal, approvals) {
  if (approvals.some((a) => a.runId === signal.runId)) return 0;
  if (signal.attention === 'approval') return 1;
  if (signal.outcome === 'waiting') return 2;
  if (isFailureOutcome(signal.outcome)) return 3;
  if (signal.outcome === 'running') return 4;
  if (signal.outcome === 'queued') return 5;
  if (signal.outcome === 'succeeded') return 6;
  if (signal.outcome === 'cancelled') return 7;
  return 8;
}
```

为什么「待审批」压过「失败」？因为失败已经发生，用户晚十秒知道不会更糟；而审批卡在那里，整条运行是停住的，且只有用户能解开。**优先级排序的本质不是重要性，而是「用户延迟处理的代价」。**

聚合的产物不是「最新状态」，而是给桌宠的一个视图：基础态、主运行、进行中数量、待审批数量、是否脉冲、一行标题。UI 不做二次判断，否则同一份快照会在两处渲染出两种结论。

## 四、终态只留 60 秒

终态信号有两个用途：让桌宠打一次完成或失败脉冲，让用户瞥一眼结果。这两件事都在几十秒内完成。

所以规则是：**终态保留 60 秒，之后清理；非终态永不因时间被丢。**

```ts
function pruneWorkSignals(signals, now) {
  return signals.filter((s) => {
    if (!isTerminalOutcome(s.outcome)) return true;
    const endedAt = Date.parse(s.endedAt ?? s.updatedAt);
    return now - endedAt <= 60_000;
  });
}
```

这里有个容易写反的地方：如果按「最后更新时间」清理运行中的信号，那么一个卡在长工具调用上的任务，会因为十分钟没有新事件而被当成过期丢掉——桌宠突然回到空闲，而任务其实还在跑。**过期只属于已经结束的东西。**

60 秒不是拍脑袋的美学，它要覆盖三件事：桌宠脉冲窗口（约 15 秒）、用户从别的窗口切回来的反应时间、一次快照刷新周期。短于它，用户会错过；长于它，桌面会堆着已经没意义的历史。

## 五、为什么把这些纯函数放进 shared 包

三个理由，按重要性排序：

1. **前后端同口径。** 服务端用它排序快照，web 端用它聚合视图，桌宠用它决定七态。三处引用同一份代码，就不会出现「服务端认为 A 优先、客户端认为 B 优先」。
2. **可测。** 纯函数不碰数据库、不碰 React、不碰时钟单例（`now` 作为参数传入）。测试可以直接构造时间戳，断言 60 秒边界与 15 秒脉冲窗口，而不必等待真实时间。
3. **可替换。** 如果将来聚合规则要调整，改动点只有一处，而不是三个仓库各改一遍。

代价也很实在：shared 包必须保持零依赖，不能为了「方便」把时间格式化与文案塞进去。它只生产结构，不生产句子。

## 六、这套口径的边界

- 它不记录历史。想知道「昨天那次运行为什么失败」，要去运行报告，不在这里。
- 它不判断业务对错。`failed` 只是「这次运行失败了」，失败原因由映射层写入 `errorReason`，聚合层不解释。
- 它不承担调度。优先级只决定「先给用户看谁」，不决定「先执行谁」。

下一篇讲边界上的事：三类运行事件形状差异那么大，怎么把它们压进同一个 reducer。
