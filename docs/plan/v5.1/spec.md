# v5.1 规格：会设防

> 状态：📐 M0 草案（待评审）
> 关联：[选题](./README.md) · [契约](./contracts.md) · [任务](./tasks.md)
> 原则：应用层强制边界 + 危险动作可回滚；不承诺 CLI/子进程隔离。

## 1. 目标

1. 内置文件工具与产物写入只能在授权根内生效，系统目录与数据根敏感目录始终拒绝；
2. write/delete/move（含覆盖）执行前留下可回滚快照，按运行可预览并一键回滚；
3. 越界尝试、快照生成、回滚结果全部可审计、可在运行详情查看；
4. 默认安全：白名单与快照默认开启，拒绝时 fail-closed，不静默降级；
5. 质量收口：可靠性域变异得分 ≥ 60%，`pnpm selftest` 覆盖越界与回滚 dry-run。

## 2. 非目标

- AppContainer/低完整性/受限令牌等 OS 级隔离；
- CLI 子代理、桌面控制 PowerShell 的路径约束（保持人工审批 + 无人值守禁用）；
- 读取拦截、内容安全审核、跨设备同步；
- 目录递归删除的完整快照（v5.1 明确拒绝目录删除）；
- 全盘快照/系统还原点、与备份链合并。

## 3. 名词

| 名词 | 定义 |
|---|---|
| 授权根 | 允许内置文件工具读写的目录；默认 `<dataRoot>/workspace`，用户可追加 |
| 系统目录 | Windows 目录、Program Files/ProgramData、盘根、用户目录下未显式授权的其他路径 |
| 危险动作 | write（含覆盖）、delete（文件）、move（含覆盖） |
| 快照 | 危险动作执行前的文件内容或元数据记录，可按运行回滚 |
| 回滚 | 按运行把快照覆盖回原路径，或删除本次新建文件 |

## 4. 路径策略

### 4.1 授权根

- 默认根：`<dataRoot>/workspace`（首次启动自动创建）；
- 用户可在设置中追加根，最多 `WORKSPACE_ROOTS_MAX = 8` 个；
- 新增根必须是已存在的绝对目录，且通过系统目录拒绝规则；
- 删除根只影响后续校验，不删除文件；已生成快照仍保留至过期。

### 4.2 始终拒绝

以下路径即使被误加入授权根也必须拒绝（fail-closed）：

- 盘根（`C:\`、`D:\` 等）；
- `%WINDIR%`、`%ProgramFiles%`、`%ProgramFiles(x86)%`、`%ProgramData%`；
- `<dataRoot>` 本身及其非 workspace 子目录（数据库、密钥、备份、快照库）；
- UNC/网络路径（`\\server\share`）与可移动盘符（v5.1 不支持，避免快照一致性风险）。

### 4.3 规范化与判定

1. 输入必须是绝对路径；
2. 先 `resolve`，再对已存在的最深祖先做 `realpath`（防止符号链接逃逸），拼回剩余段；
3. Windows 按大小写不敏感比较，其他平台按大小写敏感；
4. 判定「等于根」或「以根 + 分隔符开头」才算命中；
5. 任何一步失败（不存在、无权限、链接环）→ 拒绝并返回原因码。

### 4.4 执行点

| 入口 | 处理 |
|---|---|
| 内置文件工具（write/delete/move） | 统一调用 `assertPathAllowed`，越界直接拒绝 |
| `artifact_write` | 走受控产物目录，不经过通用根校验，但仍禁止路径穿越与绝对路径文件名 |
| 未来新增文件工具 | 必须接入同一守卫，并由契约测试强制（门禁） |
| CLI 子代理 / 桌面控制 | 明确例外：不经过守卫，靠人工审批与无人值守禁用 |

## 5. 快照

### 5.1 触发时机

| 动作 | 快照内容 |
|---|---|
| 覆盖写（目标已存在） | 旧内容 + 旧哈希 + `existed_before=true` |
| 新建写（目标不存在） | 仅元数据 + `existed_before=false`，回滚即删除 |
| 删除文件 | 内容 + 哈希 |
| 移动 | 源文件内容 + 源/目标路径 + 目标是否已存在 |

不触发：目录操作、只读读取、`artifact_write`（产物由备份/清理体系管理）。

### 5.2 存储

- 元数据写 SQLite（v058 表 `file_snapshots`）；
- 内容按 SHA-256 去重存 `dataRoot/snapshots/blobs/<sha256>`；
- 单文件内容上限 `FILE_SNAPSHOT_MAX_BYTES = 20MB`；超过时：
  - 人工态：允许执行，但记录 `truncated=true`，回滚时标注「不可恢复内容」；
  - 无人值守：直接拒绝（`FILE_SNAPSHOT_TOO_LARGE`）。

### 5.3 配额与保留

- 总配额 `FILE_SNAPSHOT_QUOTA_BYTES = 512MB`；
- 先清理超过 30 天的快照，再判断配额；仍不足时：
  - 无人值守拒绝执行；
  - 人工态提示「清理旧快照/关闭快照」后重试；
- 按流程可关闭快照：关闭时越界校验仍生效，运行详情标注「本运行未启用快照」。

## 6. 回滚

### 6.1 单位与入口

- 单位为**运行**；UI 可按节点筛选要回滚的文件，但 API 只有运行级；
- 预览（dry-run）默认开启，确认后才落盘；
- 回滚本身也必须通过 `assertPathAllowed`；根被移除时该文件跳过并报 `path_not_allowed`。

### 6.2 算法

1. 取该运行全部快照，按 `created_at DESC, id DESC` 排序；
2. 同一路径只处理最新一条（更早的已被后续覆盖）；
3. 对每条：
   - `existed_before=true`：目标当前哈希与 `written_sha256` 不一致则冲突；一致则原子写回内容（临时文件 + rename）；
   - `existed_before=false`：目标存在且哈希一致则删除；不一致则冲突；
   - move：先恢复源，再按目标是否原本存在决定删除或保留；
4. 单文件失败不阻断其余文件，返回逐文件结果；
5. 全部完成后写审计 `file_rollback_applied`，含恢复/删除/冲突/跳过计数。

### 6.3 冲突

- 目标被外部修改（哈希不一致）→ `conflict`，默认跳过；
- 用户可勾选「强制覆盖」，但必须逐文件确认；
- 目标父目录不在授权根 → `path_not_allowed`；
- 快照内容缺失（blob 被清理）→ `content_missing`。

## 7. API 与 UI

| 能力 | 入口 |
|---|---|
| 授权根列表/更新 | `GET/PUT /api/workspace/roots` |
| 运行快照列表 | `GET /api/flow-runs/[id]/snapshots` |
| 回滚预览/执行 | `POST /api/flow-runs/[id]/rollback`（`dryRun` 默认 true） |
| 快照占用/清理 | `GET/POST /api/flow-runs/snapshots/cleanup` |
| 设置页 | 授权根编辑、占用展示、清理、按流程关闭快照 |
| 运行详情 | 快照清单（路径/动作/大小/时间）+ 回滚入口 + 冲突清单 |

## 8. 数据模型（v058）

`file_snapshots`：

| 列 | 说明 |
|---|---|
| `id` | 主键 |
| `run_id` / `workflow_id` / `node_id` | 关联；node 可为空 |
| `tool_name` | 触发工具名 |
| `action` | `write_overwrite` / `write_new` / `delete` / `move` |
| `path` | 源/目标绝对路径（规范化后） |
| `target_path` | 仅 move |
| `existed_before` | 目标是否已存在 |
| `byte_size` / `sha256` | 旧内容摘要（新建写为空） |
| `written_sha256` | 写/移动完成后内容哈希，用于冲突检测 |
| `blob_path` | 相对 `snapshots/blobs` 的路径，可空 |
| `truncated` | 超限只记元数据 |
| `created_at` | 时间 |

索引：`(run_id, created_at)`、`(created_at)`、`(path)`。

## 9. 审计与可观测

新增审计事件：

- `file_path_denied`：越界拒绝（含工具、路径、原因码、触发方式）；
- `file_snapshot_created`：快照生成（动作、大小、是否截断）；
- `file_rollback_applied`：回滚结果（恢复/删除/冲突/跳过计数）；
- `file_snapshot_cleanup`：清理结果（删除数、释放字节、dryRun）。

运行详情展示：越界拒绝徽标、快照数量与占用、回滚结果摘要。

## 10. 错误码

| 码 | HTTP | 场景 |
|---|---|---|
| `FILE_PATH_OUTSIDE_WORKSPACE` | 422 | 路径不在授权根或命中系统目录 |
| `FILE_PATH_INVALID` | 422 | 非绝对路径、UNC、链接环、无法规范化 |
| `FILE_SNAPSHOT_TOO_LARGE` | 422 | 超过单文件上限且无人值守 |
| `FILE_SNAPSHOT_QUOTA_EXCEEDED` | 422 | 总配额不足 |
| `FILE_SNAPSHOT_UNAVAILABLE` | 503 | 快照库不可写 |
| `FILE_ROLLBACK_CONFLICT` | 409 | 存在冲突且未强制 |
| `FILE_ROLLBACK_FAILED` | 500 | 回滚写盘失败 |

## 11. 兼容与降级

- 先保证 Windows；macOS/Linux 只做基础规范化，设置页标注「未做系统级验证」；
- 快照库不可写：人工态提示并允许关闭快照继续（写审计）；无人值守 fail-closed；
- 旧运行无快照：运行详情显示「该运行未启用快照」，不回滚；
- 回滚不改写运行状态，只影响文件与审计。

## 12. 测试矩阵

| 层 | 用例 |
|---|---|
| 纯函数 | 路径规范化（`..`、符号链接、大小写、UNC、盘根）、配额计算、冲突判定 |
| database | v058 迁移、快照写入/查询/清理、并发同一路径、级联删除 |
| core | write/delete/move 快照生成、超大文件策略、无人值守拒绝、回滚算法（正常/冲突/部分失败/path_not_allowed） |
| web | 授权根设置、运行详情快照列表、回滚预览与确认、占用展示 |
| E2E | 越界拒绝 → 审计可见；覆盖写 → 回滚恢复；新建写 → 回滚删除；冲突文件跳过 |
| 质量 | `pnpm selftest` 增加越界拒绝 + 回滚 dry-run；变异得分 ≥ 60% |

## 13. 验收映射

对应 [选题 §7](./README.md) 的 9 条验收；每条至少一个自动化用例，E2E 覆盖越界与回滚主路径。
