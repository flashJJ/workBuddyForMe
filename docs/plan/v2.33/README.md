# v2.33 方案：备份可托付——加密归档、附件引用计数与恢复核对

> 主题：备份不仅能带走，还能加密保管、说清引用、恢复后可核对。
> 分支：`feat/v2.33-backup-trust`（待创建）
> 目标：一次纯加法迁移、零物理删除、单一主题闭环。

## 1. 背景与目标

v2.32 打通了「预检 → 恢复 → 打包 → 清理」，但数据托付仍有三处断点：

- **不敢外放**：备份归档是明文 tar.gz，包含对话、知识、记忆与附件。用户把它放到网盘或移动硬盘时没有任何保护，泄露即全量泄露。
- **引用说不清**：附件与消息仍是松耦合。删除消息只删 JSON 引用，`attachments` 行与文件仍在；「孤儿」只能靠「文件是否在附件表中」判断，无法回答「这条附件还被谁用着」。
- **恢复不可核对**：恢复只返回导入/跳过计数，用户无法确认 manifest 声明的条目是否真的落库、附件文件是否齐全、哪些条目因为外键或冲突被跳过。

v2.33 补三条链路：归档在容器层支持密码加密；附件引用计数内建到写入链路并随备份迁移；导出与恢复都产出可读核对报告。回收流程复用 v2.32 的 `.trash` 机制，只补一份回收清单，保证可恢复。

## 2. 盘点结论

| 能力 | 现状 | 本版动作 |
|---|---|---|
| 归档保护 | `export.ts` 产出明文 tar.gz；`manifest.json` 可直接读取 | 容器层增加 `WBFM-ENC1` 加密头，scrypt + AES-256-GCM；内层备份格式不变 |
| 附件引用 | `attachments` 表无引用字段；消息通过 `content_parts` JSON 持有 id；产物复用附件表 | 迁移 v051 新增 `attachment_refs`，写入登记、删除触发器清理、启动幂等回填 |
| 孤儿判定 | `scanOrphanAttachments` 只判断「文件不在附件表」 | 增加「有记录但无引用且超过 7 天」一类，dry-run 分类展示 |
| 回收可恢复 | `.trash/<date>/` 只存文件，恢复依赖附件行仍存在 | 回收目录补 `manifest.json` 记录附件行快照，恢复可重建记录 |
| 核对报告 | 导出只有进度；恢复只有导入/跳过计数 | 导出返回轨道条目/字节/耗时；恢复返回 manifest 与实际写入差异、缺失附件与跳过原因 |

## 3. 主题与边界

- 单一主题：备份可托付，不新增对话、记忆、能力或文档功能。
- 加密只发生在容器层：内层 `manifest.json` 与轨道文件保持 v8 结构，备份 schema 不升版。
- 数据库一次纯加法迁移 v051（`attachment_refs` 表与索引），`LATEST_SCHEMA_VERSION = 51`。
- 删除仍不物理删除附件：清理只移入回收目录，回收目录保留 7 天，恢复入口始终可用。
- 密码不落库、不写日志、不进归档明文；不提供密钥托管或密码找回。

## 4. 功能清单

### 4.1 加密归档（P0）

- 新增 `packages/core/src/backup/archive-cipher.ts`：
  - `sealArchive(buffer, password)` / `openArchive(buffer, password)`；
  - 容器格式：magic `WBFM-ENC1` + 4 字节头长度 + 明文 JSON 头（`version`、`kdf`、`salt`、`N/r/p`、`iv`）+ AES-256-GCM 密文（tag 附尾）；
  - 口令派生使用 scrypt（N=2^15、r=8、p=1、keylen=32），每次导出生成新 salt 与 iv。
- 导出接口接受可选 `password`（8–128 字符，二次确认由前端保证）；响应头增加 `x-backup-encrypted: 1`。
- 预检与恢复接口接受可选 `password`：
  - 加密归档未带密码 → `BACKUP_PASSWORD_REQUIRED`；
  - 密码错误 → `BACKUP_PASSWORD_INVALID`；
  - 两类错误都不区分「salt 错」与「tag 错」，不泄露额外信息。
- 前端备份面板增加「启用密码保护」开关与二次输入；选择加密归档做预检时提示输入密码，密码错误可原地重试。
- 大小为加密前的归档上限，沿用 `BACKUP_MAX_ARCHIVE_BYTES`；加密在已有整包缓冲上完成，不引入流式依赖。

### 4.2 附件引用计数内建（P1，迁移 v051）

- 新表：

  ```sql
  CREATE TABLE attachment_refs (
    attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
    owner_type TEXT NOT NULL CHECK (owner_type IN ('message', 'artifact')),
    owner_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (attachment_id, owner_type, owner_id)
  );
  CREATE INDEX idx_attachment_refs_owner ON attachment_refs(owner_type, owner_id);
  ```

- 写入侧：
  - `message-repo.create/update` 解析 `content_parts` 中的图片 `attachmentId`，登记 `owner_type='message'`；同一消息更新时先删后插，保持幂等。
  - `attachment-service.saveArtifact` 登记 `owner_type='artifact'`，`owner_id` 即附件 id。
- 删除侧：
  - `AFTER DELETE ON messages` 触发器删除对应引用；`attachment_refs.attachment_id` 外键级联覆盖附件删除。
  - 会话删除依赖既有 `messages` 级联，不新增删除路径。
- 回填：启动后单飞一次，扫描 `messages.content_parts` 与产物 MIME 重建引用；完成后写设置项 `attachmentRefs.backfilledAt`，重复启动幂等，失败只告警不阻塞。
- 备份：attachments 轨新增可选 `refs.json`；恢复在附件与消息写入之后按主键 `INSERT OR IGNORE`；v8 旧归档缺文件时走启动回填补齐。

### 4.3 清理判定与回收清单（P1）

- `scanOrphanAttachments` 返回两类候选：
  - `files`：文件不在附件表（v2.32 口径，不变）；
  - `unreferenced`：附件行存在、引用数为 0、且 `created_at` 早于 7 天（避免回收仍在途的上传）。
- dry-run 分类展示数量与字节，不产生任何文件与数据库变更。
- 回收时在 `.trash/<date>/manifest.json` 写入附件行快照（id、文件名、MIME、字节、hash、storage_path）与文件清单；`unreferenced` 类在同一事务中删除附件行。
- 恢复入口读取 manifest：先按快照重建附件行，再把文件移回 `attachments/`；manifest 缺失时退回 v2.32 的「仅移文件」语义并在结果中标注。
- 到期清理只删除 `date < today-7d` 的回收目录（含 manifest），保留期与 v2.32 一致。

### 4.4 导出与恢复核对报告（P2）

- 导出结果增加 `report`：各轨条目数、字节数、总字节、耗时；前端导出完成后展示摘要，并写入设置项 `backup.lastExport`（时间、是否加密、总字节、轨道数）。
- 恢复结果增加 `verification`：
  - manifest 声明条目 vs 实际写入 vs 跳过；
  - 附件缺失清单（manifest 有、归档内无文件）；
  - 引用缺失计数（恢复后 refs 为空且非产物的附件）。
- 预检与恢复共用同一核对结构；报告只读，不改变既有覆盖/跳过语义。
- 缺失附件与引用缺失只产生警告，不让整次恢复失败。

## 5. Non-Goals

- 增量备份与链式恢复（需要多轨水位审计与基线链状态，评估后放入 v2.34，避免半成品）。
- 云同步、跨设备自动同步、自动定时备份。
- 密钥托管、密码找回、恢复密钥。
- 附件物理删除、消息删除级联删文件。
- 附件去重策略调整、附件合并视图。
- zip 打包格式（统一沿用 tar.gz）。

## 6. 阶段拆分

| 阶段 | 内容 | 验证 |
|---|---|---|
| P0-M1 | 加密归档 + 导出/预检/恢复适配 + 前端密码输入 | 加密 roundtrip；错误密码拒绝；不加密行为不变 |
| P1-M2 | 迁移 v051 + 写入登记 + 删除触发器 + 启动回填 + 备份 refs 轨 | 引用行数与消息/产物一致；删除级联；回填幂等 |
| P1-M3 | 孤儿分类 + 回收清单 + 按清单恢复 | dry-run 无变更；回收后可恢复行与文件；到期清理只删旧目录 |
| P2-M4 | 导出概览 + 恢复核对报告 + 最近备份卡片 | 条目/字节/耗时与 manifest 一致；差异有可读原因 |

## 7. 验收口径

1. 加密归档：正确密码可预检与恢复；无密码返回 `BACKUP_PASSWORD_REQUIRED`；错误密码返回 `BACKUP_PASSWORD_INVALID`；归档与数据库、日志中均不出现明文密码；未加密导出与 v2.32 输出结构一致。
2. 引用计数：新消息含 2 张图片时新增 2 行引用；同消息更新不产生重复行；删除消息后引用自动清零；删除会话后其下引用全清；重启回填两次结果一致。
3. 备份兼容：v7 / v8 未加密归档仍可恢复；恢复后旧归档附件引用可由回填补齐；含 `refs.json` 的归档恢复后引用条数与 manifest 一致。
4. 清理：dry-run 前后文件与数据库无变化；回收后 `.trash/<date>/manifest.json` 条目与移动文件一致；恢复后附件可读取、行元数据完整；到期清理只删除 7 天前目录。
5. 核对：导出报告的轨道条目、字节与归档内 manifest 一致，耗时非负；恢复报告能指出缺失附件与跳过原因，且恢复仍返回成功。
6. 工程门禁：`pnpm check` 通过；core / web / database / shared / config / ai / voice / desktop 测试全绿。

## 8. 风险与对策

| 风险 | 对策 |
|---|---|
| 用户遗忘密码导致归档不可恢复 | 导出前强提示「密码丢失无法找回」；不提供任何找回入口；文档明确密码责任 |
| scrypt 在低端设备耗时明显 | 固定参数并测量一次真实归档耗时；预检/恢复单请求串行，超时给可读提示 |
| 加密导致内存翻倍 | 在整包缓冲上加密，估算峰值约为归档 2 倍；超过上限直接拒绝，不产生半份文件 |
| 触发器覆盖不到新的删除路径 | 删除侧以触发器兜底，写入侧统一走仓储方法；测试覆盖消息、会话、附件三条链路 |
| 回填耗时或中途失败 | 单飞 + 设置标记 + `INSERT OR IGNORE` 幂等；失败只告警，下次启动重试 |
| 回收后恢复丢元数据 | 回收清单随目录落盘；manifest 缺失时明确降级为「仅移文件」并在结果标注 |
| 核对报告误报 | 报告只做只读比对，差异只告警不阻断恢复；缺失项按「manifest 有、实际无」单向判断 |

## 9. 下一版本衔接

v2.33 完成后，本地数据链路具备「加密保管 → 预检 → 恢复 → 核对 → 回收可恢复」的闭环。

v2.34 候选待盘点，优先评估：增量备份与链式恢复、手动跨设备迁移指引、引用计数驱动的附件合并视图、备份密钥托管可行性。
