# v2.12 方案：可扩展 III——能力包收口，签名可验证、升级可回滚、健康可自检

> 状态：📐 M1 已完成（2026-10-30，见 [02-M1-实施记录](02-M1-实施记录.md)），待 M2
> 上一正式版：v2.11.0（六类 effect 全接通 + 本地 CLI 外部代理）
> 主题一句话：**v2.11 证明了「六类能力都能装、外部代理真能跑」，v2.12 要证明「装进来的包可信、升级不丢状态、坏了能自检」。**

## 1. 版本主题与目标

v2.11 把六类 effect 全部接通，能力包从「两类可装卸」变成「六类统一约束」。但收口仍有三处欠账，全部来自 v2.11 的已知边界：

- **清单里的 `signature` 只记录不验证**：包在传输或二次打包中被改动，宿主没有任何判断依据；
- **同 id 无法升级**：`install` 见到已安装 id 直接 409，用户想更新只能先卸载（会丢状态）再装；
- **坏了不会自己说**：包目录被删、动作文件缺失、工作流被手工停用、依赖被卸载，列表仍显示「已启用」，只有点一次启用才会暴露。

本版不扩新 kind、不加新资源类型，只做收口：**签名校验、升级回滚、健康自检**。宪法不变：不引入远程市场、不执行包内任意代码、不做自动更新、不共享宿主密钥。

### 1.1 成功指标（可验收）

| 指标 | 现状（v2.11） | 目标（v2.12） |
|---|---|---|
| 清单签名 | 字段存在，不验证 | **可验证**：有效/无效/未知密钥三态可判；`warn`/`require` 下无效签名 100% 拒绝 |
| 信任来源 | 无 | 本地信任公钥列表（用户手工添加，可删） |
| 签名策略 | 无 | 三档：关闭 / 提醒 / 强制；默认「提醒」不阻断既有包 |
| 同 id 升级 | 409，只能卸载重装 | **原地升级**：版本前进、状态保持、失败回滚到旧包 |
| 升级回滚 | 无 | 启用失败 → 旧包与旧状态恢复；恢复失败 → 明确 `disabled + lastError` |
| 包健康 | 仅启用时检查目录是否存在 | **按需自检**：目录/校验和/依赖/effect 目标/孤儿目录五类问题 |
| 依赖复核 | 仅安装时检查 | 启用时复核；健康检查报告缺失/停用/版本不符 |
| 全量门禁 | Web e2e 122/122 | 不降级；新增签名/升级/健康 e2e ≥ 3 例 |

### 1.2 非目标（见 §9）

不做远程市场、自动更新、CA/身份体系、多版本并存、依赖自动安装、包内代码执行、备份格式变更。

## 2. 现状与缺口（v2.11 取证）

| 面 | 现状 | 缺口 |
|---|---|---|
| 清单 schema | `capabilityManifestSchema.signature?: string`，注释写明「本期只记录不验证」 | 无 canonical 序列化、无验签、无信任库、无策略 |
| 安装 | `install()` 对同 id 直接 `ApiError.conflict` | 无升级入口；`capability_packs` 仓储的 `update` 也不能改 version/manifest |
| 依赖 | 安装时要求依赖已安装且版本**完全相等** | `enable()` 不复核依赖；依赖被卸载后，已禁用的从属包仍可被启用 |
| 卸载 | 有启用中的从属包时 409 | 已禁用但声明了依赖的包不拦；卸载后留成「永远启不了」的坏状态 |
| 启用 | 检查清单可解析、包目录存在 | 不校验 payload 校验和、不校验 effect 目标是否还在 |
| effect | 六类句柄都落在真实对象上 | 对象可被外部删除（工作流行、动作文件、剧本行），无健康报告 |
| 目录 | `install` 失败时会 `rmSync` 清理 | 进程崩溃/断电可能留 `.staging` 或孤儿目录；无扫描、无清理入口 |
| 管理页 | 列表/筛选/示例/启停/卸载 | 无签名徽章、无健康徽章、无升级入口、无「检查全部」 |
| 设置页 | 外部代理五字段 | 无信任公钥管理、无签名策略 |

结论：**缺的不是新功能，而是三条收口链路**——验签链路、升级状态机、健康自检。

## 3. 功能清单

### P0 必做

**P0-1 清单签名：canonical 序列化 + Ed25519 验签**

- 新增 shared `canonicalizeCapabilityManifest(manifest)`：对对象键递归排序、数组保序、去掉 `signature` 字段，输出稳定 JSON；前缀域串 `capability-manifest-v1\n` 防跨协议复用。输入必须是 `capabilityManifestSchema.parse` 后的规范化清单（默认值已应用），不能直接 canonical 作者手写 JSON。
- 签名 = base64(Ed25519(privateKey, UTF-8(域串 + canonical JSON)))，放入 `manifest.signature`；新增可选 `signatureKeyId`（3–32 位小写字母/数字/._-），参与签名。
- 验签结果五态：`none`（无签名字段）/ `valid` / `invalid`（格式或密码学失败）/ `untrusted`（签名可解析但密钥不在信任库）/ `malformed`。
- **无效签名在 `warn` / `require` 下拒绝安装/升级/启用（422）**；策略只决定「无签名」与「未知密钥」是否放行；`off` 是显式跳过验签的逃生门。
- 信任库放 settings JSON：`capabilityTrustedKeys: Array<{ id, label, publicKey, createdAt }>`（≤20 条，PEM SPKI，导入时用 `crypto.createPublicKey` 校验）；策略 `capabilitySignaturePolicy: 'off' | 'warn' | 'require'`，默认 `warn`。
- canonicalize 留 shared（纯函数）；验签与公钥导入放 core `capabilities/signature.ts`（服务端），避免 `node:crypto` 进入客户端 bundle。
- 新增签名工具 `scripts/sign-capability.mjs`：读清单 → schema parse → 规范化 → 签名 → 打印 base64 与 keyId（`--write` 才回写文件）；从 `packages/shared/dist` 导入 canonicalize，不复制第二份实现。
- 验收：改任一清单字段后验签失败；键顺序不同的等价清单验签一致；ZIP 重打包不影响验签。

**P0-2 同 id 原地升级与回滚**

- 新端点 `POST /api/capabilities/:id/upgrade`（multipart，字段名 `file`）。
- 前置：清单 id 必须等于路径 id；kind 必须与已安装一致；版本必须**严格大于**当前版本（`1` / `1.0` / `1.0.0` 归一化比较，非法段 422）。
- 校验复用安装链路（ZIP 结构、checksums、权限、entry、payload schema、依赖已启用、签名策略）；新增依赖前置：所有**启用中**从属包声明的依赖版本必须与新版本完全相等，否则 409 并列出从属包。
- 状态机：
  - 旧包 `disabled`：写入新包与新清单，保持 `disabled`，不尝试启用；
  - 旧包 `enabled`：先 disable 旧 effect（失败则中止，磁盘与状态不变）→ 暂存目录写入 → 目录原子换位（live → backup，staging → live）→ 仓储替换清单与版本 → enable 新 effect；
  - enable 失败：恢复 backup 目录、恢复旧清单，并按 kind 适配回滚（工作流重新发布旧版本、剧本恢复旧定义、其余重新 enable 旧 effect）；旧 effect 恢复成功则返回 422（本次升级未发生），失败则落 `disabled + lastError` 并明确提示「请重新安装旧版本」。
- 按 kind 适配：`workflow` 升级加新版本并发布、`disabled` 旧包升级后显式置回 `disabled`；`event-script` 替换定义且 id 不可变；`skill` / `mcp` / `pet-action` 的 `effectRef` 可能变化，预检须排除旧句柄自身。
- 升级响应附带 `affectedDisabledDependents`；成功后才删除 backup 与 staging。`.staging` / `.backup` 超过 24 小时且无进行中升级时清理。
- 同一 id 升级进行中再次请求返回 409。
- `capability_repo` 新增 `replaceManifest(id, manifest)`（更新 kind/version/name/description/permissions/manifest_json，重置 effect/状态由服务层显式写）。
- 验收：启用态升级后新版本可用且历史数据保留；禁用态升级保持禁用；升级坏包 422 不动旧包；从属版本冲突 409；降级/同版本 422。

**P0-3 健康自检与残留清理**

- 新端点 `GET /api/capabilities/health`（按需计算，不缓存）返回：
  - `packs[]`：`{ id, status: 'ok' | 'warning' | 'broken', issues: [{ code, severity, message, detail? }] }`
  - `orphans[]`：能力包根目录下存在、但数据库无对应行的目录名（排除 `.staging` / `.backup`）。
- 检查项（issue code 固定）：
  | code | 含义 |
  |---|---|
  | `pack_dir_missing` | 行在、包目录不在 |
  | `manifest_invalid` | `manifest_json` 无法解析或 schema 不通过 |
  | `checksum_mismatch` | payload 文件实际 sha256 与清单不符 |
  | `payload_extra_file` | payload 存在清单未登记的文件 |
  | `dependency_missing` / `dependency_disabled` / `dependency_version_mismatch` | 依赖三态 |
  | `effect_missing` | 句柄指向的对象已不存在（按 kind 判定） |
  | `effect_status_mismatch` | 包为 enabled，但工作流/剧本实际是 disabled |
  | `signature_invalid` / `signature_untrusted` | 验签失败 / 未知密钥（前者 error，后者 warn） |
- 六类 `effect_missing` 判定：技能目录、MCP 注册表 id、工作流行、动作资产 + 文件、剧本行、卡片行。
- `POST /api/capabilities/health/cleanup`：只删除「执行时仍无数据库行」的孤儿目录；返回删除清单；绝不删除有行的目录或进行中升级的 backup。
- `enable()` 增加签名与依赖复核：`require` 下非 `valid` → 422；依赖缺失/停用/版本不符 → 422（文案区分三种），状态保持 `disabled` 并写 `lastError`。
- 健康检查始终验签（即使安装策略为 `off`），签名问题只进报告与徽章，不阻断安装。
- 验收：六类各构造一个 broken 场景能被报告；孤儿目录可列出并清理；依赖卸载后从属包无法启用。

**P0-4 管理页与设置页收口**

- `/capabilities`：先拆 `capability-row.tsx` / `capability-upgrade-dialog.tsx` / `capability-health-banner.tsx`（页面当前 245 行），再挂签名徽章、健康徽章、"升级"入口、"检查全部"与孤儿清理。
- `/settings`：信任公钥列表（label + PEM 添加、删除）、签名策略三档；切换为「强制」前显示将受影响的未签名/未知密钥包数量。
- i18n 中英双语；错误信息复用领域错误码。

### P1 争取

1. 外部代理 cwd 的 realpath 校验（符号链接指向系统目录/数据目录时拒绝），承接 v2.11 已知边界。
2. `/capabilities` 运行下钻：从运行记录跳到对应会话时间线并按 runId 过滤，不再只做行高亮。
3. 升级历史与审计（保留最近 N 次 from→to、结果与耗时）。
4. 降级/回滚入口（显式 `allowDowngrade`，保留 backup 至下一次成功升级）。
5. 信任密钥轮换：同一公钥多 label、导出/导入信任库 JSON。

### P2 留白

- 远程能力市场 / 自动更新 / 一键升级。
- 依赖版本区间语义与自动安装。
- 多版本并存与包内容差异视图。
- 证书链 / CA / 身份体系。

## 4. 架构影响

| 层 | 改动 |
|---|---|
| `packages/shared` | 清单 schema 增 `signatureKeyId`；`canonicalizeCapabilityManifest`（纯函数）；settings 增信任库与策略字段及 Zod 形状校验（PEM 可导入性由 core 校验） |
| `packages/database` | `capability_repo.replaceManifest`、`installed_event_script_repo.replaceDefinition`；无迁移（复用 `manifest_json` / `updated_at`） |
| `packages/core` | 新增 `capabilities/signature.ts`（验签 + 公钥导入）、`upgrade.ts`、`health.ts`；`CapabilityServiceDeps` 注入 settings；`capability-service` 接入 upgrade/health/签名与依赖复核；单文件 ≤300 行，按职责拆分 |
| `apps/web` | 新增 upgrade / health / cleanup 路由；设置页新增独立信任库组件；能力包页拆行/升级对话框/健康提示三个组件；i18n |
| `apps/desktop` | 无改动（如需目录选择复用 v2.11 的 dialog 桥） |
| `scripts` | 新增 `sign-capability.mjs`（作者侧工具，从 shared 构建产物导入 canonicalize，不复制实现） |

数据模型：**零迁移**。签名状态按需计算；信任库与策略存 settings JSON；升级只改 `capability_packs` 行内字段。

## 5. 里程碑

| 里程碑 | 内容 | 出口 |
|---|---|---|
| M0 契约冻结 | canonical 序列化、签名格式与策略矩阵、升级状态机、健康 issue 码、API/UI 口径 | 方案评审通过，[00-M0-契约冻结](00-M0-契约冻结.md) 落盘 |
| M1 签名与信任库 | shared 规范化、core 验签、settings 字段与 wiring 注入、安装/启用接入、签名工具、管理页徽章 | 策略矩阵全绿；无效签名拒绝；键序无关键 |
| M2 升级与回滚 | `replaceManifest` / `replaceDefinition`、upgrade 端点、按 kind 适配、原子换目录、从属预检、回滚状态机 | 启用/禁用两态升级；失败回滚可验证 |
| M3 健康与残留 | health 端点、六类 effect 检查、孤儿与过期目录清理、enable 签名与依赖复核 | 六类 broken 均可诊断；清理不误删 |
| M4 收口与端到端 | 管理页拆组件、设置页信任库、i18n、e2e ≥3 例、文档 | Web 全量 e2e 不降级 |
| M5 验收与发布 | 全量门禁、版本 2.12.0、迁移回归（确认零迁移）、发布归档 | check / 单测 / 生产 e2e / 桌面冒烟不降级 |

## 6. 风险与取舍

- **canonical 序列化漂移**：签名端与验签端必须共用同一实现，且输入都必须是 schema 解析后的规范化清单（默认值已应用）。只允许一份 `canonicalizeCapabilityManifest`，并加黄金向量测试（键序、转义、Unicode、数字格式、缺省字段）。
- **默认策略选「提醒」**：既不让既有未签名包突然不可用，也不把验签做成摆设。切到「强制」前先做影响面预览，避免用户把自己锁死。
- **`warn`/`require` 下无效签名无条件拒绝**：策略只放行「没有」与「不认识」，不放行「对不上」。否则签名反而变成降级攻击面；`off` 是用户显式选择跳过验签。
- **升级回滚可能二次失败**：例如旧 effect 依赖的资源已被删。此时不假装成功，落 `disabled + lastError`，提示重新安装旧包；绝不停在「半升级」。
- **健康检查成本**：重算 sha256 是 O(包体积)，只在用户点「检查」时执行，不在列表加载时执行；单包上限 20MB，可接受。
- **零迁移**：不新增表/列，回退旧版本仍可打开同一数据库；代价是没有持久化的「上次检查时间」，健康结果每次实时计算。
- **升级不删历史**：工作流运行、动作资产的用户引用、剧本触发额度都按 v2.11 口径保留；升级只换包与清单，不动引用。

## 7. Non-Goals（本版明确不做）

- 不做远程能力市场、评分、自动更新、一键升级。
- 不做 CA / 证书链 / 身份体系；签名只回答「这份清单是否由某个本地信任的公钥签发」。
- 不做多版本并存；同一 id 同时只有一个版本。
- 不做依赖自动安装与传递闭包；缺依赖仍然是 422。
- 不做包内任意脚本/任意代码执行；能力包仍只登记既有资源类型。
- 不做备份格式变更；信任库随 settings JSON 备份。
- 不做外部代理第二实现（ACP 仍列后续版本）。

## 8. 验收口径

1. 签名：五态判定正确；策略矩阵（off/warn/require × none/untrusted/valid/invalid）逐格通过；`warn`/`require` 下无效签名 422；键序不同的等价清单验签一致；签名工具与运行时对同一清单 canonical 一致。
2. 升级：启用态升级成功、禁用态保持禁用、同版本/降级 422、kind 不符 422、从属版本冲突 409、坏包不动旧包、enable 失败回滚旧包可继续使用；`skill`/`mcp`/`pet-action` 句柄变化后行内 `effectRef` 正确。
3. 健康：六类各至少一个 broken 场景被报告；孤儿目录列出并可清理；清理后列表与磁盘一致；依赖卸载后从属包 enable 422；`require` 下启用未签名包 422。
4. `pnpm check`（typecheck / lint 0 error / 300 行门禁）；五包单测不降级；Web 全量生产模式 e2e 不降级且新增 ≥3 例；桌面冒烟不降级。
5. 零迁移：旧库直接可用；不新增表/列；回退 v2.11 不破坏数据。

## 9. 与 v2.11 遗留项的对应

| v2.11 遗留 | v2.12 处置 |
|---|---|
| 签名只记录不验证 | P0-1 验签 + 信任库 + 策略 |
| 符号链接 realpath 校验 | P1-1 |
| `/capabilities` 运行下钻 | P1-2 |
| 能力包升级/依赖版本 | P0-2 原地升级；版本区间列 P2 |
| 健康检查与独立日志 | P0-3（健康检查）；独立 effect 日志列 P2 |

---

## 附：不在本版的候选

- 一键诊断包、压缩预算可视化、单次运行下钻。
- 外部代理 ACP 第二实现、运行树与子运行预算。
- 计划子运行树、会议 WorkSignal、桌面控制授权并入审批中心。
