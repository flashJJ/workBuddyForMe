# v2.15 方案：可运营——历史可清理、证据可锚定、凭证可轮换、版本可对比

> 状态：✅ M0 已冻结（2026-10-31，见 [01-M0-契约冻结](01-M0-契约冻结.md) / [02-M0-评审记录](02-M0-评审记录.md)）；✅ M1 技能版本清理（[03-M1-实施记录](03-M1-实施记录.md)）；✅ M2 审计归档与外部锚点（[04-M2-实施记录](04-M2-实施记录.md)），进入 M3 凭证轮换
> 上一正式版：v2.14.0（可维护：技能版本化、工作流生产版本、能力包降级修复、运行下钻、诊断包）
> 主题一句话：**v2.14 把「出事之后能回退、能定位」补齐，v2.15 把「日常运维」补齐：历史能清理、证据能锚定、凭证能轮换、版本能对比。**

## 1. 版本主题与目标

v2.14 解决了五件「事后」问题：技能能回退、工作流有生产版本、能力包能降级、证据能下钻、故障能诊断。但运维闭环仍缺四个动作：

- 版本快照只增不减，用户看不到占用，也无法清理非启用版本；
- 审计只能全量导出 JSONL，整表尾部被截断时链仍然自洽，无法对账；
- 密钥没有轮换入口，系统密钥变化或密文损坏时只能逐条重新输入；
- 工作流版本列表只有时间与生产标记，改动前后差了什么只能靠人眼比对图。

v2.15 不加新能力面，只把这四件事收口：**快照可清理、审计可锚定、凭证可轮换、版本可对比**。

### 1.1 成功指标（可验收）

| 指标 | 现状（v2.14） | 目标（v2.15） |
|---|---|---|
| 技能快照 | 自动保留最近 5 版，无占用展示与删除入口 | 版本面板展示总数 / 占用；非启用快照可删除；启用版本与最后一份受保护 |
| 审计归档 | 只能全量 JSONL 导出；尾部截断不可检出 | 按日期导出 ZIP：JSONL + `anchor.json`；上传锚点可检出尾部截断与哈希错位 |
| 凭证轮换 | Provider API Key 只能重新输入；无重封装入口 | 一键重封装全部可解密 Provider Key；跳过不可解密项；Web 主密钥轮换双密钥回退 |
| 工作流版本 | 版本列表只有版本号 / 时间 / 生产标记 | 任意两版节点、边与配置摘要差异；版本抽屉内可对比 |
| 全量门禁 | 单测 2842 / Web e2e 134/134 / 桌面 10/11 | 不降级；新增运维 e2e ≥ 4 例 |
| 迁移 | v042 | **零迁移**（`LATEST_SCHEMA_VERSION` 保持 42），除非 M0 明确升级 |

## 2. 现状与缺口（v2.14 取证）

> 详细代码位置见 [00-现状取证](00-现状取证.md)。

| 面 | 现状 | 缺口 |
|---|---|---|
| 技能快照 | `skill_versions` 行 + `skill-versions/<stateId>/<version>/` 目录；服务内置 `prune` 保留最近 5 版，永不删除 active | 没有删除服务 / API / UI；面板只列版本与时间，不展示占用；删除需处理跨状态行共享目录 |
| 审计 | `audit_events` 追加式哈希链；`GET /api/audit/export?format=jsonl` 全量导出；`verify` 可检出中间断链 | 没有按日期归档、没有链尾锚点文件、没有锚点校验；尾部整段截断仍自洽 |
| 凭证 | Provider `api_key_cipher` 经 `cipher.encrypt` 存储，desktop 走 safeStorage 回环桥，web 走 `keys/master.key` | 无批量重封装 / 轮换入口；不可解密行只能靠人工重输；web 主密钥无 keyring |
| 工作流版本 | `workflow_versions` 保存 `graph_json`；版本接口返回版本列表与 production 标记 | 没有图差异计算与对比接口 / UI；节点 id、边、config 变化不可见 |
| 迁移 | `LATEST_SCHEMA_VERSION = 42` | 本版四项均可复用现有表；只需 shared 契约与 core 服务增量 |

## 3. 功能清单

### P0 必做

**P0-1 技能版本清理与占用视图**

- 用户故事：技能快照越攒越多，我想看到它们占了多少磁盘，并删掉不再需要的旧版本。
- 契约：`SkillVersionsResponse` 增加 `totalBytes`；版本项已有 `sizeBytes`。
- 删除：`DELETE /api/skills/:name/versions/:version`；仅允许删除非 active 快照；active 返回 409 `SKILL_VERSION_ACTIVE`。
- 磁盘：删除前检查同一 `dir_path` 是否被其他版本行引用；无引用才删目录，避免误删共享快照。
- 审计：删除成功写 `skill_version_deleted`（技能名、版本、释放字节），不写绝对路径。
- UI：版本面板展示总占用；每行非 active 版本提供删除按钮，二次确认；active 行显示「当前，不可删除」。
- 验收：删除后列表与目录一致；active 删除被拒；重启后不复活；启用态不变。

**P0-2 审计归档与外部锚点**

- 用户故事：我要给一段时间的审计账本做归档，并且以后能证明「尾部没有被悄悄删掉」。
- 归档：`GET /api/audit/archive?from=<ISO>&to=<ISO>` 返回 ZIP（复用 `yazl`），包含 `events-<from>-<to>.jsonl` 与 `anchor.json`。
- 锚点：`anchor.json` 记录 `formatVersion / appVersion / schemaVersion / range / count / firstSeq / lastSeq / lastHash / chainValid / firstBrokenSeq`；不含事件正文之外的新字段。
- 校验：`POST /api/audit/anchor/verify` 接收锚点 JSON（不落库）：
  - 当前最大 seq < `anchor.lastSeq` → `AUDIT_ANCHOR_TAIL_TRUNCATED`（409）；
  - 当前账本在 `anchor.lastSeq` 处不存在或 `hash` 不等 → `AUDIT_ANCHOR_MISMATCH`（409）；
  - 锚点格式非法 → `AUDIT_ANCHOR_INVALID`（422）；
  - 其余 → `{ ok: true, anchorLastSeq, currentLastSeq }`。
- UI：审计页新增「导出归档」与「验证锚点」；验证结果展示通过 / 尾部截断 / 哈希错位，不写审计账本。
- 边界：归档只导出，不自动删除；锚点文件由用户自行保存到应用之外，应用只负责生成与校验。
- 验收：ZIP 内容与锚点字段正确；正常账本校验通过；删除尾部事件后返回 `TAIL_TRUNCATED`；篡改事件后返回 `MISMATCH`；非法 JSON 返回 422。

**P0-3 凭证轮换与重封装**

- 用户故事：系统密钥变化或密文损坏后，我想一次性处理所有已存凭证，而不是逐个供应商重输。
- 范围：Provider `api_key_cipher`（当前唯一经 `SecretCipher` 存储的凭证）。MCP `env/headers` 的加密上收列 P1-3，不在本 P0 范围。
- 服务：`POST /api/secrets/rotate`：
  1. 遍历全部有密文的 Provider，逐条 `decrypt`；
  2. 可解密项用新密钥代 `encrypt` 并写回；
  3. 不可解密项保留旧密文，计入 `skipped`；
  4. 返回 `{ mode: 'web' | 'desktop', rotated, skipped, keyId? }`，不返回任何明文。
- Web 主密钥：`keys/master.key` 升级为 `keys/master-keyring.json`（`activeKeyId` + 最多 3 把 key：active + 两个 fallback）；写入顺序为「先加新 key 并设 active → 重封装 → 旧 key 保留为 fallback」；旧 key 不在同一次轮换中删除。启动时若只存在旧 32 字节 `master.key`，按 `legacy` key 读入；`failed===0` 时把新 active key 同步写回旧 `master.key`，保证回退到 v2.14 可解密。
- Desktop：safeStorage 的系统密钥由 OS 管理，桥只负责重新封装；UI 文案使用「重新加密已存凭证」，不宣称更换系统密钥。
- 失败：单条解密失败只跳过该条；keyring 写入失败则不更新任何 Provider 行；轮换成功写 `secrets_rotated` 审计（仅计数与 mode）。
- UI：设置 → 关于 / 安全区新增「轮换凭证」按钮，二次确认，展示 rotated / skipped。
- 验收：轮换后全部可解密 Provider 的密文变化且仍可解密；Provider 列表与连接测试正常；不可解密项被跳过并提示；Web 重启后仍可解密；桌面重封装后重启仍可解密。

**P0-4 工作流版本对比**

- 用户故事：我要把生产版本和当前草稿对比一下，看看这次改了什么，而不是打开两张图来回找。
- 纯函数：`diffFlowGraphs(before, after)` 输出：
  - nodes：`added / removed / typeChanged / configChanged`（config 只做顶层键比较，不逐字段 diff）；
  - edges：按 `source → target → handle` 归一化，输出 `added / removed`；
  - summary：节点与边的新增 / 删除 / 变更计数。
- API：`GET /api/flows/:id/versions/compare?from=<n>&to=<n>`；版本不存在返回 422 `FLOW_VERSION_NOT_FOUND`。
- UI：版本抽屉增加「对比」选择（默认当前版本 vs 生产版本），展示摘要列表；不修改任何版本。
- 验收：新增 / 删除节点、改 type、改 config、增删边均正确；未变化图返回全零；对比只读，不改变 `current_version` / `published_version`。

### P1 争取

1. **技能保留策略可配置**：设置 `skillVersionKeep`（1–20，默认 5），下一次扫描生效；面板提示当前保留策略。
2. **审计归档按天自动生成**：服务端按天生成归档到数据根 `audit-archives/`，提供列表与清理入口；仍不自动删除审计账本。
3. **MCP 敏感字段加密**：`mcp_servers.env/headers` 中的令牌不再明文落库，纳入同一轮换事务与状态展示。
4. **工作流 diff 字段级高亮**：在对比摘要基础上展开 config 子键差异，不做到逐行文本 diff。

### P2 留白

- IM 渠道与远程访问、多用户与团队部署。
- 多 Agent 并行与可移植 Recipes。
- 远程技能 / 流程市场。
- OS 级沙箱、云 Worker、跨设备续跑。

## 4. 架构影响

| 层 | 改动 |
|---|---|
| `packages/shared` | 技能版本删除响应 / `totalBytes`、审计锚点 schema、凭证轮换结果、工作流 diff schema、四个错误码与中英文案 |
| `packages/database` | **零迁移**；复用 `skill_versions` 行与目录、`providers.api_key_cipher`、`workflow_versions.graph_json`；仅补仓储查询方法 |
| `packages/core` | 技能快照删除与占用统计、审计归档 / 锚点校验、凭证轮换服务、图差异纯函数与版本对比服务 |
| `apps/web` | 技能版本删除与占用、审计归档 / 锚点验证、凭证轮换入口、工作流版本对比抽屉 |
| `apps/desktop` | 无新通道；凭证重封装复用既有 cipher 桥；safeStorage 语义在 UI 文案中区分 |
| `tests/e2e` | 新增 v2.15 运维 e2e：快照清理、归档锚点、凭证轮换、版本对比 |

数据模型：**零迁移**。旧版本可打开同一数据库；技能快照目录、审计账本与 Provider 密文均不删除。若 M0 确认需要落库锚点历史，再升级 v043，且必须保持纯加法。

## 5. 里程碑

| 里程碑 | 内容 | 出口 |
|---|---|---|
| M0 契约冻结 | 删除保护、锚点字段与校验码、轮换顺序与失败语义、diff 形状；零迁移确认 | 评审通过，契约文档落盘 |
| M1 技能版本清理 | 服务删除 / 占用统计、API、面板、审计事件 | 非启用删除成功；active 409；重启一致 |
| M2 审计归档与锚点 | ZIP 归档、锚点 JSON、校验端点、审计页入口 | 正常通过；截断 / 篡改 / 非法锚点分别报错 |
| M3 凭证轮换 | 轮换服务、Web keyring、Desktop 重封装、API / UI、审计 | 可解密项全部重封装；跳过项不影响既有调用 |
| M4 版本对比 | 纯函数 diff、对比 API、版本抽屉 UI | 节点 / 边 / config 差异准确；只读 |
| M5 回归与 e2e | 四项运维 e2e、全量单测 / 构建 / Web e2e / 桌面冒烟 | 门禁不降级 |
| M6 验收与发布 | 版本 2.15.0、验收文档、发行说明、NSIS 与 Release | Release 置 Latest |

## 6. 风险与取舍

- **删除不可逆**：非启用版本删除后无法恢复；只允许逐条删除，必须二次确认并写审计；active 与唯一剩余版本硬拒绝。
- **锚点误判**：日期范围边界必须用 UTC 闭区间；锚点 `lastSeq` 大于当前最大 seq 时只报「尾部缺失 / 截断」，不猜测原因；哈希错位只报「不一致」。
- **主密钥轮换窗口**：keyring 保留旧 key 作为 fallback；写新 key → 重封装 → 旧 key 延迟退休，避免中途崩溃导致全部密文不可解。
- **桌面语义**：safeStorage 无法更换 OS 密钥，本版只做重封装；文案不夸大，避免用户误以为换了系统密钥。
- **零迁移约束**：若任一 P0 发现必须新增列 / 表，M0 立即升级 v043 并重新评估；不允许静默改 schema。
- **行数门禁**：审计归档、锚点、轮换、diff 均拆纯模块，单文件 ≤300 行。
- **范围控制**：不借「运维」扩成 IM 渠道、多用户或远程访问；MCP 凭证加密只到 P1。

## 7. Non-Goals（本版明确不做）

- 不做 IM 渠道、远程访问、多用户与团队协作。
- 不做新的 Agent 能力、子 Agent 并行、可移植 Recipes。
- 不做远程市场、自动更新技能 / 流程、依赖自动安装。
- 不做审计自动删除；归档只导出，不替代账本。
- 不做 OS 级沙箱、云 Worker、跨设备续跑。
- 不做凭证的明文导出 / 展示；轮换结果只返回计数。
- 不做工作流图的逐字段文本 diff。

## 8. 验收口径

1. 技能：版本面板展示总占用；删除非启用版本后列表、目录与磁盘一致；active 与唯一版本受保护；重启不复活。
2. 审计：按日期归档 ZIP 含 JSONL 与锚点；锚点校验覆盖通过 / 尾部截断 / 哈希错位 / 非法格式；不写审计账本。
3. 凭证：轮换后全部可解密 Provider Key 密文变化且可解密；不可解密项跳过并提示；Web 主密钥轮换可回退；桌面重封装后重启可用。
4. 工作流：任意两版对比准确列出节点 / 边 / config 摘要差异；未变化图返回全零；对比不改变生产版本。
5. 迁移：零迁移，`LATEST_SCHEMA_VERSION = 42` 不变；旧库直接可开。
6. 门禁：`pnpm check`、八包单测、生产模式 Web 全量 e2e（不低于 134 例）与桌面冒烟不降级。
7. 发布：版本 2.15.0、NSIS 安装包 + blockmap + latest.yml、Release 转正并置 Latest。

## 9. 与 backlog 的对应

| 来源 | 处置 |
|---|---|
| v2.14 P1-1：技能版本清理入口 | P0-1 |
| v2.14 P1-2 / v2.13 边界：审计归档与外部锚点 | P0-2 |
| v2.12 P1 / v2.14 P1-3：密钥轮换 | P0-3（Provider 范围） |
| v2.14 P1-4：工作流版本对比 | P0-4 |
| v2.14 P1：保留策略可配置 | P1-1 |
| v2.12 P1：MCP 敏感字段加密 | P1-3 |
| v2.14 P2：IM 渠道、多用户、多 Agent 并行、Recipes、远程市场、OS 沙箱、云 Worker | P2 / 后续版本 |

---

[^1]: 技能快照见 `packages/core/src/skills/skill-version-service.ts` 与 `packages/database/src/repositories/skill-version-repo.ts`。
[^2]: 审计导出见 `apps/web/src/app/api/audit/export/route.ts`；链校验见 `packages/core/src/governance/audit.ts` 与 `audit-verify.ts`。
[^3]: 凭证存储见 `packages/core/src/services/provider-service.ts`、`packages/core/src/secrets/master-key.ts`、`apps/desktop/src/main/cipher-server.ts`。
[^4]: 工作流版本见 `apps/web/src/app/api/flows/[id]/versions/route.ts` 与 `apps/web/src/features/flow-editor/flow-versions-dialog.tsx`。
