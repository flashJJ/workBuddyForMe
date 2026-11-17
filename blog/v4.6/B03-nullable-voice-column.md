# 给用户导入的模型一个声线：可空列迁移与旧备份兼容

用户导入 VRM 后，最直接的疑问是：“为什么它和默认角色一个声音？”

答案在数据层：导入模型表只有形象元数据，没有声线字段。要回答这个问题，必须让“用户偏好”有一个落点。

## 一、声线该存在哪里

有三个候选位置：

1. 存进 VRM 文件的 meta；
2. 存进设置里的一个映射表；
3. 给导入模型表加一列。

存进 VRM 文件不可行：模型是用户资产，应用不应该改写它；重新导入后偏好也会丢。

存进设置映射表可行，但会形成一个“模型 id → sid”的大 JSON，删除模型时要清理，备份时要单独处理，容易残留。

最终选择给导入模型表加一列。声线是“用户对这个模型的偏好”，和名称、许可信息一样属于模型记录，删除模型时自然一起删除。

## 二、为什么是可空列

新列 `voice_sid INTEGER` 允许 NULL，表达“未绑定，跟随默认”。

这带来三个好处：

- 旧库升级后不需要回填，旧记录 NULL，合成行为与升级前完全一致；
- 旧备份缺少该字段时按 NULL 读取；
- 用户主动清除绑定，也只需要写 NULL，不需要删除记录。

没有写 CHECK 约束。SQLite 的 `ALTER TABLE ADD COLUMN` 不支持直接加带 CHECK 的列；为了一个 0–102 的范围去重建表，风险和收益不成比例。范围校验放在两处：服务层和 API schema。

## 三、迁移要防“表不存在”

真实 v51 库一定有 `vrm_avatars`，但测试里存在一种夹具：只把 `user_version` 设到 30 之前，然后跑全量迁移。此时表还没创建，直接 `ALTER TABLE` 会报 `no such table`。

迁移函数先检查表是否存在：

```ts
const table = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' AND name='vrm_avatars'"
).get();
if (!table) return;
```

再检查列是否已存在，保证重复执行幂等。这两道判断让迁移同时兼容真实旧库和轻量测试夹具。

## 四、服务与 API 的边界

服务层提供：

```ts
setVoiceSid(id, voiceSid: number | null): VrmAvatar
```

- 记录不存在 → 404；
- sid 越界 → 422；
- 成功返回更新后的完整记录。

导入时也可以带初始 sid，但 UI 默认不传，让用户导入后再选，避免导入表单过重。

API 只暴露一个 PATCH：

```
PATCH /api/vrm-avatars/:id
{ "voiceSid": 18 }
```

请求体用严格 schema：只允许 `voiceSid`，必须是 0–102 的整数或 null。多余字段直接拒绝，防止客户端把整条模型记录误传回来。

## 五、备份兼容是重点

备份里的 `vrmAvatars.json` 只存元数据引用，不打包 `.vrm` 二进制。新字段加入后：

- 导出时带上 `voiceSid`；
- 恢复时写入 `voice_sid`；
- 旧归档没有这个字段，schema 默认 null；
- 恢复后模型文件可能悬空，仍沿用原来的 warning，提示用户重新导入。

我们没有升级备份 schema 版本，因为这是纯加法字段，旧读取端忽略即可。升级 schema 反而会让旧版本无法读取新备份。

## 六、读取路径

服务端合成时，根据 `avatarModelId` 解析出文件引用，再查 `voice_sid`：

```ts
const fileRef = parseVrmAvatarId(avatarModelId);
if (!fileRef || fileRef.startsWith('builtin:')) return undefined;
const row = db.prepare(
  'SELECT voice_sid FROM vrm_avatars WHERE file_ref = ?'
).get(fileRef);
return row?.voice_sid ?? undefined;
```

内置 VRM 和 Live2D 不查库，避免每次合成多一次无意义查询。查询异常（例如迁移前表缺失）按未绑定处理，不影响朗读。

这段逻辑被拆到独立模块，主运行时只调用一个函数，保持文件在行数门禁内。

## 七、测试矩阵

- v51 库增量迁移：只应用 v052，新增列，旧记录 NULL；
- 直接调用迁移函数两次：不报错；
- 服务：导入带 sid、更新 sid、清空为 NULL、越界拒绝、记录不存在拒绝；
- 契约：PATCH body 接受 0/102/null，拒绝 103 和额外字段；
- 备份：导出带 18，恢复后仍为 18；旧条目缺字段按 null。

这些用例覆盖了“新库、旧库、旧备份、异常输入”四条路径。

## 八、经验

1. **用户偏好不要写进用户资产。** 模型文件是只读输入，偏好应存在应用数据库。
2. **新增字段优先可空。** 可空列让旧数据自然拥有“未设置”语义，避免回填和默认值争议。
3. **迁移要兼容测试夹具。** 不是所有“旧库”都有完整表结构，先判断再改。
4. **范围校验放应用层。** 为一个整数范围重建 SQLite 表不划算。
5. **备份是契约的一部分。** 加字段时同时想清楚导出、恢复和旧归档读取。

一个可空列看起来很小，但它让导入模型第一次拥有了“自己的声音”，而且没有破坏任何旧数据。
