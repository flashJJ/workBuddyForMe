# 在 SQLite 里去掉一个 UNIQUE：重建表的代价与分寸

`workflow_schedules.workflow_id` 原本带 `UNIQUE`，对应「一个流程一条定时」。

要支持多定时，直觉是 `ALTER TABLE ... DROP CONSTRAINT`。SQLite 没有这个语法：约束属于表定义，只能重建表。

## 一、重建步骤

```sql
CREATE TABLE workflow_schedules_new (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  cron TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  enabled INTEGER NOT NULL DEFAULT 1,
  input_json TEXT,
  next_run_at TEXT NOT NULL,
  last_run_at TEXT,
  last_run_id TEXT,
  last_status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO workflow_schedules_new (...)
SELECT id, workflow_id, '', cron, 'Asia/Shanghai', enabled, input_json, next_run_at,
       last_run_at, last_run_id, last_status, created_at, updated_at
FROM workflow_schedules;

DROP TABLE workflow_schedules;
ALTER TABLE workflow_schedules_new RENAME TO workflow_schedules;
```

最后重建两个索引：

- `(enabled, next_run_at)`：调度器扫描到期项；
- `(workflow_id)`：列表与计数。

## 二、为什么敢直接 DROP

`workflow_schedules` 是子表，没有其他表引用它。删除它不会触发别的表的外键级联；复制旧行时对 `workflows` 的引用也仍然有效。

迁移跑在事务里，任何一步失败都会整体回滚，不会留下「新表建了一半、旧表已删」的状态。

## 三、旧数据怎么处理

- `id` 原样保留：已有运行入参里的 `scheduleId` 仍然能对上；
- `cron`、`input_json`、`last_*` 原样复制；
- `name` 为空串，UI 回落到显示 cron；
- `timezone` 回填 `Asia/Shanghai`，与旧版本「系统本地时区」在中国区用户上的实际行为一致。

## 四、测试要覆盖两条路径

只测「新库直接迁移到最新」不够，还要模拟旧库：

1. 先迁移到 v55；
2. 插入一条旧格式定时；
3. 再迁移到 v56；
4. 断言行还在、字段被正确回填、`workflow_id` 不再唯一。

迁移测试里还发现，早期版本有几个用例靠 `PRAGMA user_version = 29` 模拟旧库，实际没有任何表。v056 的复制语句会因为父表不存在而失败。把它们改成真正迁移到目标版本，测试反而更接近真实升级路径。

## 五、分寸

重建表不是为了炫技。它是 SQLite 下修改约束的唯一正路，代价是必须一次性想清楚：

- 哪些列保留、哪些新增；
- 默认值如何回填；
- 索引是否重建；
- 旧数据在测试里是否真的被覆盖。

想清楚这四点，重建就只是一次安静的搬家。
