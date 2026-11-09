# 给记忆加一张关系边表：一次纯加法迁移

这一版新增了一张表 `memory_edges`，用来记录记忆之间的关系。

它很小，但几个设计决定值得写下来。

## 一、字段只保留必要的

```sql
CREATE TABLE memory_edges (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  relation TEXT NOT NULL,
  weight REAL NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (from_id, to_id, relation)
);
```

- `relation` 是关系类型，本版只写 `same_source`，`co_turn` 只在枚举里预留；
- `weight` 是边权，参与邻居分数计算；
- 唯一约束把「同一对记忆的同一关系」压成一行，重复写入不会膨胀。

## 二、不建外键

记忆会归档、会被整理、会删除，但边是派生数据。

如果建外键并级联删除，整理任务和恢复流程会被数据库约束绑住；如果建外键但不级联，又会留下悬空边。

所以干脆不建：查询侧 `JOIN memories` 过滤掉已归档的端点，整理任务定期清理悬空边。

## 三、两个索引

邻居召回是双向的：既可能从 `from_id` 找出去，也可能从 `to_id` 找回来。

因此 `from_id` 与 `to_id` 各建一个索引，而不是只给一端建。

## 四、纯加法，不回填

迁移只做 `CREATE TABLE` 与 `CREATE INDEX`，不扫描历史记忆、不补边。

旧库升级后表是空的，第一次新回合写入时自然产生第一批边；不想等的话，可以在空闲整理后由新回合补齐。

这样迁移成本可预期，也不会在启动时因为历史数据量卡住。

## 五、版本号前移

新增迁移意味着 `LATEST_SCHEMA_VERSION` 从 49 变成 50。

仓库里所有断言「当前版本」的迁移测试、E2E 的 schema 断言都要同步，否则 CI 会在最意想不到的地方红。

这次的经验是：**迁移版本号是全局常量，改它等于改所有断言，必须一次性批量处理。**

## 小结

关系边表不是图数据库。

它只是一张带唯一约束的小表，加上两个索引和一条「不建外键」的决定——足够支撑这一版的来源关系与一跳召回。
