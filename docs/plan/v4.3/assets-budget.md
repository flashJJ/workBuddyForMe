# v4.3 资产预算口径

> 机器真源：[`scripts/assets/asset-budget.json`](../../../scripts/assets/asset-budget.json)
> 执行：`pnpm check:assets`（已接入 `pnpm check`）
> 最近扫描：2026-11-16

## 1. 预算表

| 项 | 硬上限（失败） | 目标（警告） | 说明 |
|---|---|---|---|
| 单模型 | 25MB | — | 三个内置模型逐个检查 |
| 内置合计 | 25MB | — | 当前 22.29MB |
| 颜色贴图 | 4096 | 2048 | 按图片名分类；未命名按颜色处理 |
| 法线/ORM/遮罩 | 4096 | 1024 | 名称含 normal/orm/rough/metal/ao/mask/matcap |
| 贴图格式 | WebP / PNG / JPEG | WebP | 历史 PNG/JPEG 保留，新资产优先 WebP |
| 安装包 | 300MB | — | 读取归档目录最新 exe；无归档时跳过 |
| morph 顺序 | 快照一致 | — | 新增/重排必须显式更新快照 |

硬上限用于阻止继续增长；目标值用于逐步优化。当前资产仍有三张 4096 颜色贴图与若干 PNG/JPEG，先以警告记录，不在本里程碑强制重压。

## 2. 当前扫描结果

| 模型 | 体积 | 贴图 | 最大尺寸 | morph | 骨骼 |
|---|---|---|---|---|---|
| xuetuan.vrm | 9.28MB | 21 张 | 4096 | 118 | 49 |
| feibi.vrm | 7.01MB | 80 张 | 4096 | 118 | 49 |
| rankaluli.vrm | 6.00MB | 49 张 | 2048 | 118 | 49 |
| 合计 | 22.29MB | 150 张 | — | — | — |

- 安装包：最新归档 v4.1.0 264.61MB，上一版 v4.0.0 264.58MB，均在 300MB 内。
- 警告：3 张 4096 颜色贴图超过 2048 目标；10 张 PNG/JPEG 未使用 WebP；不阻塞 `pnpm check`。

## 3. morph 快照

- 真源：[`scripts/assets/morph-snapshots.json`](../../../scripts/assets/morph-snapshots.json)。
- 每个模型记录 `morphCount`、有序 targetNames 的 SHA256 签名与骨骼数。
- 新增模型或调整 morph 顺序时：

```powershell
node scripts/assets/check-assets.mjs --write-snapshot
pnpm check:family
pnpm check:assets
```

写入后必须审阅快照 diff，确认是预期变更；快照缺失、签名不一致或模型增删都会让检查失败。

## 4. 报告与边界

- `node scripts/assets/check-assets.mjs --json .tmp/assets-report.json` 输出机器可读报告。
- 安装包检查默认读取 `E:\builds\archive`，可用 `--archive-dir` 或 `WBFM_ARCHIVE_DIR` 覆盖；目录不存在时跳过，不影响干净检出。
- 贴图分类按图片名启发式判断，未命名图片按颜色贴图处理；后续可在 B 阶段补材质级分类。
- 本阶段只做扫描与门槛，不自动压缩、不重排 morph、不修改 VRM 文件。
