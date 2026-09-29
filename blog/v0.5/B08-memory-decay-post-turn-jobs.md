---
title: "遗忘与善后：软归档三条件、7 天间隔保护、post-turn-jobs 的统一入口"
series: "WorkBuddy For Me v0.5 技术拆解"
number: "B08"
tags: ["workbuddy", "memory", "decay", "background-jobs", "privacy"]
date: "2025-Q4"
---

## 问题：记忆库不能只进不出

M3 上线后，记忆库只增不减。用户的偏好会变（「我最近在减脂」三个月后失效）、一次性事件会过期（「下周三要答辩」答辩完就是噪音）、提取模型会记错（低重要性条目本就是「仅参考」级）。

没有遗忘机制的记忆库，半年后会变成一个信噪比持续下降的仓库：召回 Top-3 里塞满过时信息，面板里几百条记忆没人翻得动。**记忆系统的长期可用性取决于遗忘，不亚于取决于记住**。

P1-1 的遗忘策略（[memory-decay.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/memory/memory-decay.ts)）和承载它的回合后作业框架（[post-turn-jobs.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/chat/post-turn-jobs.ts)）是这篇的两个主角。

---

## 遗忘的三条件：与门，缺一不可

归档条件（[constants.ts](file:///e:/code/traeWork/workBuddyForMe/packages/shared/src/constants.ts)）是三个条件的**与**：

```typescript
export const MEMORY_DECAY_MIN_IMPORTANCE = 0.4;    // 重要性低于 0.4
export const MEMORY_DECAY_AFTER_DAYS = 30;          // 创建超过 30 天
export const MEMORY_DECAY_ACCESS_STALE_DAYS = 30;   // 从未召回，或上次召回也超 30 天
```

翻译成自然语言：**「又旧、又没人用、又不重要」的记忆才归档**。三个条件各挡一类误伤：

**importance < 0.4** 挡住「重要的旧记忆」。用户的职业、核心偏好可能创建半年了仍然重要——重要性评分（提取时打的，B04）在这里发挥第二次作用。0.4 的线对应 prompt 里「0.5 以下仅参考」的语义：归档候选本来就是那些被标记为「参考价值有限」的条目。

**创建 > 30 天**挡住「新记的碎记忆」。刚提取的低重要性条目可能只是还没遇到用它的场景，给它 30 天的观察期。

**未召回 > 30 天**挡住「常用但低重要性」。有些记忆重要性评分不高但被频繁召回（比如「用户喜欢简短回答」），`last_accessed_at` 在每次召回命中时刷新（`touchAccessed`），活跃记忆永远不满足这个条件。**召回行为本身就是对遗忘的一票否决**。

三条件与门的整体语义：遗忘只清理「系统在标记它不重要、时间证明它没用」双重确认过的记忆。

---

## 软归档：「忘记」是淡出视线，不是物理删除

归档是 `status: active → archived`，不是 DELETE：

```sql
-- repo.archiveStale
UPDATE memories SET status = 'archived', updated_at = :now
WHERE status = 'active'
  AND importance < :maxImportance
  AND created_at < :createdBefore
  AND (last_accessed_at IS NULL OR last_accessed_at < :accessedBefore)
```

为什么软而不硬？三个理由：

**隐私闭环的一致性**。B01 说过，v0.5 的记忆哲学是「控制权在用户」。系统自作主张物理删除记忆，哪怕条件再保守，也是对这条原则的破坏。软归档的语义是「系统帮你淡出视线，删除权永远留给你」——面板里可切换查看已归档、可单条恢复、可永久删除。

**召回零成本退出**。B06 提过，检索 SQL 内建 `status = 'active'` 过滤——归档记忆自动退出召回，向量都还在，恢复是 O(1) 状态翻转。

**误归档可逆**。遗忘是启发式判断，一定会错（比如某个低频但关键的记忆恰好三条件全中）。可逆性把「遗忘错了」从数据事故降级为一次点击恢复。

---

## 7 天间隔保护：为什么遗忘不能每轮都跑

`runMemoryDecay` 有个反直觉的设计：**两次运行至少间隔 7 天**（`MEMORY_DECAY_INTERVAL_DAYS`），上次运行时间记在 meta 表：

```typescript
const lastRun = getMeta(db, DECAY_META_KEY);
if (lastRun && elapsed < MEMORY_DECAY_INTERVAL_DAYS * DAY_MS) {
  return { archived: 0, skipped: true };
}
```

为什么？遗忘是借回合成功的机会执行的（见下文 post-turn-jobs），而条件里有两个时间窗口（30 天）——**遗忘的结果在 7 天尺度上几乎不变**。每轮对话后跑一次归档查询，99% 的时候归档数是 0，纯粹浪费一次全表扫描。

间隔保护把遗忘从「每轮一次的无用功」变成「每周一次的例行整理」。meta 表 KV 记录上次运行时间，跨重启持久——这正是 v0.5 给 meta 表开 KV 通道的第二个用途（第一个是 B06 的向量维度登记）。测试和手工触发可用 `force: true` 跳过保护，单测靠它验证归档逻辑本身。

---

## post-turn-jobs：所有回合后作业的统一入口

v0.5 的回合后作业有四个：递归压缩（M2）、摘要记忆化（M2+M3 联动）、记忆提取（M3）、衰减归档（P1-1）。它们如果散落在 orchestrator 各处，会出现两个问题：执行顺序不明（摘要记忆化依赖压缩的产出）、错误处理不一（各处写各的 try/catch）。

[post-turn-jobs.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/chat/post-turn-jobs.ts) 把它们收敛成一个统一入口：

```text
runPostTurnJobs
  ├─ 1. runPostTurnCompaction      递归压缩（B03）
  ├─ 2. rememberSummaryEvent       摘要 → 情景记忆（依赖第 1 步产出，importance 0.6）
  │       （assistant.memoryEnabled 为 false 时，2-4 步整体跳过）
  ├─ 3. runPostTurnMemory          记忆提取 → 去重入库（B04/B05）
  └─ 4. runDecaySafely             衰减归档（本篇）
```

**顺序有依赖语义**：压缩先行，因为它的产出（新摘要）是第 2 步的输入；记忆提取在摘要记忆化之后，因为摘要记忆走同一个去重管线，先入库的摘要会影响后续候选的去重判定；衰减最后，先让新记忆入库，再清理旧记忆。

**每一步独立 try/catch，失败只 warn**：

```typescript
function warn(message: string, error: unknown): void {
  console.warn(`[wbfm] ${message}：${error instanceof Error ? error.message : String(error)}`);
}
```

这条原则从 B03 贯穿到现在：回合后作业全是增强，任何一步失败都不影响已完成的回答。四步独立捕获意味着：压缩失败不影响记忆提取，提取失败不影响归档——**故障隔离粒度到步骤**。

**memoryEnabled 的开关语义**：助手关掉记忆时，第 2-4 步整体跳过，但第 1 步（压缩）照常——压缩是上下文管理，与记忆无关。开关的粒度精确到「记忆生命周期」，不误伤其他增强。

---

## 时机选择：为什么借回合成功的机会执行

遗忘也可以做成定时任务（cron 风格）。没这么做，理由有三：

1. **本地应用没有「常驻」保证**。桌面端可能几天不开，web 服务器可能只在用的时候启动。cron 在本地场景的触发保证很差，而「回合成功」是应用被真实使用的信号——用着用着顺便整理，比定时更贴合本地应用的生命周期。
2. **回合后是天然的低峰**。回答已发出，用户在读，CPU/IO 空闲。维护性作业插在这个窗口，用户零感知。
3. **少一个调度器**。定时任务需要调度器（setInterval + 持久化 + 时区处理），借回合触发只需一个间隔保护。简单性也是设计目标。

代价是：如果用户长期不用，遗忘不会发生——但这恰好是正确的行为：没人用的记忆库，遗忘与否无所谓。

---

## 小结

遗忘策略的三个数字——30 天、0.4、7 天——共同表达一个保守立场：**系统只清理「双重确认无用」的记忆，且永远可逆**。post-turn-jobs 的统一入口则把「回合后该做什么」从散落的逻辑收敛成一张清晰的作业清单：顺序有语义、故障有隔离、开关有粒度。

至此记忆生命周期的两端（记住、忘记）都齐了。下一篇 B09 讲质量闭环的另一半：消息级 👍/👎 反馈怎么设计，以及那条在 B07 里立下大功的 golden set 评估基线是怎么搭的。
