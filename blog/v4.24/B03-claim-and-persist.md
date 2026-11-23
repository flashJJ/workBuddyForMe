# 调度落库：一张表 + 一次原子认领

定时任务的可靠性，取决于两个问题：

1. 应用重启后，配置与「下次什么时候跑」还在不在；
2. 同一个时间点，会不会被触发两次。

这一版用一张表和一个条件更新，回答了这两个问题。

## 一、表设计

```sql
CREATE TABLE workflow_schedules (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL UNIQUE REFERENCES workflows(id) ON DELETE CASCADE,
  cron TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  input_json TEXT,
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  last_run_id TEXT,
  last_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

几个设计点：

- `workflow_id UNIQUE`：一个流程一条定时；
- `next_run_at` 存 ISO 文本：SQLite 没有原生 datetime，ISO 文本可以直接做字符串比较与排序；
- `last_status` 记录最近一次触发结果，用于 UI 与排障；
- 索引 `(enabled, next_run_at)`：调度器的唯一查询模式就是「启用且到点」。

迁移是纯加法：只新增表与索引，不动任何现有表。旧版本读到这张表也无害。

## 二、为什么要持久化 next_run_at

如果只存 cron，每次启动都要从「现在」重新计算下次时间，会带来一个隐蔽的问题：应用在 9:00 关闭、9:05 打开，配置是「每天 9:00」，那么「今天 9:00 那次」到底算不算错过？

- 如果只存 cron，启动后计算的下次时间会是「明天 9:00」，今天的执行被静默吞掉；
- 如果存 next_run_at，启动时看到它已经过期，就知道「有一次该跑没跑」。

所以 `next_run_at` 不是缓存，而是状态。它记录了「调度器承诺的下一次触发时刻」。

## 三、原子认领

扫描到到期项后，第一件事不是创建运行，而是推进下次时间：

```sql
UPDATE workflow_schedules
SET next_run_at = @next, updated_at = @now
WHERE id = @id AND enabled = 1 AND next_run_at = @expected
```

只有 `next_run_at` 仍然等于扫描时读到的值时，更新才会成功。

这解决了两个问题：

- 如果一次 tick 还没结束，另一次 tick 又扫到同一条，第二次会更新失败，不会重复创建运行；
- 如果用户在扫描与创建之间禁用了定时，`enabled = 1` 条件会让更新失败。

先认领、后创建，而不是先创建、后更新。因为创建运行是「有副作用」的动作，而更新 next_run_at 是幂等的状态推进；把有副作用的动作放在后面，失败时最多是「时间推进了但没跑」，可以由用户手动补，而不会重复跑。

## 四、tick 的完整顺序

```text
1. 查 enabled=1 且 next_run_at <= now
2. 计算下次时间（cron 解析失败 → 记录 error）
3. 条件更新 next_run_at（失败 → 跳过，说明已被处理）
4. 检查流程是否存在、已发布、有生产版本
5. 检查同流程是否有在途运行
6. 创建 trigger=schedule 的运行
7. 记录 last_run_at / last_run_id / last_status
```

第 4 到第 6 步任何一步失败，都会落到 `last_status`，并且**不会回滚 next_run_at**。这是刻意的：如果失败就回滚，调度会在每个 tick 重复尝试同一条坏配置，形成日志风暴。推进到下一次，让它在下一个周期再试，更符合「守时」的预期。

## 五、启动补跑

调度器 `start()` 时会先立即执行一次 tick，再挂 30 秒的定时器。

这一下解决的是「应用关闭期间错过」的问题：数据库里的 `next_run_at` 已经过期，tick 会把它当作到期项处理。

只补一次的原因在下一篇展开，但机制就藏在这里：补跑时计算的下次时间是从「当前时刻」出发的，所以过期多久都只会产生一次执行。

## 六、为什么是 30 秒

调度精度不需要秒级：

- cron 本身就是分钟粒度；
- 30 秒的扫描间隔，最坏延迟半分钟，对「每天早上九点」完全够用；
- 更短的间隔只会增加空转。

定时器调用了 `unref`，不会阻止 Node 进程退出；这对开发与测试都更友好。

## 七、失败可见

调度失败不能只写日志。表里的 `last_status` 有三个非成功值：

- `skipped_busy`：上一次还没跑完，本次跳过；
- `error`：流程未发布、版本缺失或创建运行失败；
- `disabled`：预留的停用标记。

UI 会显示「上次运行：时间 · 状态」，用户不需要翻日志就知道「为什么今天没跑」。

## 八、小结

一张表 + 一次条件更新，构成了这个调度器的核心：

- 表保证重启后状态还在；
- 条件更新保证同一时刻只被处理一次；
- 先认领后创建保证失败不会导致重复；
- 状态字段保证失败可见。

下一篇讲剩下的两条规则：单飞与错过补偿。
