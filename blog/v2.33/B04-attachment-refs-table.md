# 附件引用计数：用一张关联表回答「这个文件还被谁用着」

附件是典型的「文件 + 元数据 + 业务引用」三层结构。

文件在磁盘上，元数据在附件表里，业务引用散落在消息 JSON 与产物记录中。前两层好查，第三层一直缺失。

这一版新增一张关联表，把引用关系显式化。

## 一、表结构

```sql
CREATE TABLE attachment_refs (
  attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('message', 'artifact')),
  owner_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (attachment_id, owner_type, owner_id)
);
CREATE INDEX idx_attachment_refs_owner
  ON attachment_refs(owner_type, owner_id);
```

三元组主键保证同一附件被同一所有者重复引用时不会产生多行。

`owner_type` 用枚举约束，避免出现无法解释的引用来源。

## 二、为什么不用计数字段

直觉做法是在附件表加一个 `ref_count` 字段。

问题是计数需要维护：新增引用加一，删除引用减一，任何一条路径漏掉就会漂移。漂移之后很难修复，因为不知道哪一次增减错了。

关联表记录的是事实，不是聚合。计数可以随时 `COUNT` 出来，事实不会漂移。

## 三、写入侧在哪登记

消息写入时，解析 `content_parts` 中的图片片段，取出附件 id，登记 `owner_type='message'`，`owner_id` 为消息 id。

产物保存时，登记 `owner_type='artifact'`，`owner_id` 为附件 id。

两处都走同一个仓储方法，避免不同调用方写出不同格式。

## 四、登记时过滤悬空 id

消息里的附件 id 可能指向一个不存在的附件。

直接插入会触发外键错误，导致整条消息写入失败。

实现上用 `INSERT ... SELECT ... WHERE EXISTS (SELECT 1 FROM attachments WHERE id = ?)`，附件不存在时静默跳过。

这样消息本身仍能写入，只是少一条引用。

## 五、引用能回答什么

- 这个附件被哪些消息引用；
- 这个附件是不是产物；
- 一个会话里的图片一共被引用多少次；
- 删除消息后哪些附件变成了零引用。

最后一条是清理功能的基础。

## 六、引用与文件的关系

引用表只记录「谁用了」，不记录「文件在不在」。

文件是否存在仍然由附件表的 `storage_path` 与磁盘决定。

两者分开的好处是：引用可以独立重建，文件可以独立移动，不会互相绑死。

## 七、为什么不做多态外键

`owner_type` 指向两张不同的表，SQLite 不支持多态外键。

所以 `owner_id` 没有数据库级外键约束，完整性由写入侧保证。

代价是可能出现悬空引用；收益是表结构简单、迁移轻量。清理时按 owner 查询，悬空引用会被忽略。

## 八、一条经验

「谁引用了这个文件」不应该靠扫描 JSON 猜。

把引用关系写成表，哪怕没有外键、哪怕需要回填，它也比隐式字符串匹配可靠得多。
