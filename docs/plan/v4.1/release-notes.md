# WorkBuddyForMe v4.1.0 发布说明

> 版本：4.1.0（2026-11-16）
> 主题：陪伴质量可回放、性能预算可门禁
> 范围：M0 方案与归档 → M1 打分契约下沉 → M2 评测与质量卡 → M3 性能采样与短跑门禁 → M4 收尾
> 说明：零数据库迁移，`LATEST_SCHEMA_VERSION = 51` 与备份 schema 均不变。
> 状态：✅ 已发布；安装包已归档并复核。

## 1. 本版交付

| 里程碑 | 交付内容 |
|---|---|
| M0 | v4.1 方案、Spec、Tasks 落盘；候选 07/11 移入 `docs/roadmap/scheduled/` 并更新三处索引 |
| M1 | Utility 打分、候选提取与确定性排序下沉 `@wbfm/shared/script`；web 保留同名 re-export；决策历史上限 20 → 50，设置页仍展示 5 条 |
| M2 | 新增离线回放、12 组场景矩阵、指标汇总纯函数；新增 `eval:companion` 报告脚本与 fixtures；新增 `GET /api/pet/script/quality` 与设置页只读质量卡 |
| M3 | `pet-longrun` 补齐 p50、长任务、GPU 资源计数与 `--summary-out`；新增 10 分钟短跑门禁 `perf-budget.mjs` 与 dev-only `window.__perfNav` |
| M4 | `pnpm check` 与全量测试；归档性能基线；进度日志与路线图状态收尾 |

## 2. 用户可见变化

- 设置页「AI 日常剧情」新增只读「陪伴质量」卡：最近决策窗口、场景重复率、去重命中率、弱偏好命中率、未播命中率、预算/勿扰状态与高频理由。
- 质量卡只读、本机汇总，不上传；接口不可用时只降级该卡，不影响其他设置项。
- 决策记录保留窗口从 20 条提升到 50 条，设置页仍只展示 5 条，旧记录兼容读取。
- 新增开发期命令 `pnpm eval:companion`：读取本机决策与生成队列，输出回放、场景矩阵与指标报告。
- 新增本地性能门禁 `pnpm check:perf` 与 `pnpm perf:baseline`：只比较相对基线，不设绝对帧率。

## 3. 内部改动

- 打分契约：`packages/shared/src/script/{types,score,select}.ts` 承接原 web Utility 实现；`scoreCandidate` 与排序函数增加可选 `weights` 末参，默认权重不变；web `utility/*` 改为 re-export。
- 评测纯函数：`packages/shared/src/script/eval/{types,matrix,replay,metrics}.ts` 提供 12 组固定上下文、矩阵与排名差异、离线回放、质量指标；回放重算六个基础维度，去重/弱偏好/长场次增量沿用记录理由码。
- 报告脚本：`scripts/eval/companion-report.mjs` 以只读方式打开 SQLite，仅读取 `pet-script.decisions` / `generation` / `journal` / `playback` / `schedule` 五个 settings 键，支持 `--db`、`--out`、`--weights`、`--limit`。
- 质量服务：`createPetScriptServer(...).quality()` 聚合最近决策、生成队列、播放预算与勿扰状态；shared 统一统计，前端只格式化。
- 长跑采样：`scripts/perf/pet-longrun.mjs` 增加 rAF p50、`longtask` 观测、`__vrmDebug.resources()` 快照与 `--summary-out`；原 JSONL 字段向后兼容。
- 短跑门禁：`scripts/perf/perf-budget.mjs` 按待机 → 主动播放 → 模型热替换 → 小剧场进出四段执行；假 `wbfm.pet` 桥捕获 `onModelChange` 触发真实热替换；`PerfNavDebug` 仅在非生产环境安装 `window.__perfNav`。
- 阈值：p50 ≤ 基线 ×1.2 + 2ms、p95 ≤ 基线 ×1.25 + 3ms、堆峰值 ≤ 基线 + 48MB、资源末值每项 ≤ 基线峰值 + 4、页面错误为 0；硬件指纹不一致默认警告，`--strict-machine` 才失败。

## 4. 门禁结果

- 全量测试：9 个包 724 个测试文件 4133 项通过。
  - core 265 文件 1637 项；web 276 文件 1408 项；database 75 文件 283 项；desktop 33 文件 218 项。
  - shared 45 文件 400 项；ai 16 文件 86 项；voice 9 文件 85 项；config 4 文件 14 项；motion 1 文件 2 项。
- `pnpm check`：typecheck、lint、行数、结构、循环依赖、ASCII 全部通过。
- 迁移：无新增迁移，`LATEST_SCHEMA_VERSION = 51`；备份 schema 不变。
- 离线评测（本机库）：3 条决策、可回放 2、缺失 1，均值差 0.09；12 组上下文 × 7 个生成候选；权重覆盖输出 22 处排名变化。
- 性能短跑（SwiftShader，3 分钟）：基线 p95 1.757ms、堆峰值 227.9MB、资源峰值 24/56/6；复跑 p95 1.613ms、堆 202.2MB、资源末值 20/48/5，7 项 PASS。
- 4h 长跑（SwiftShader，49 组采样）：p50 0.008ms、p95 2.092ms（最大 2.6ms）、长任务 1 次（109ms）、堆 141.1 → 141.1MB（峰值 168.8MB）、资源峰值/末值 38/56/9、页面错误 0；资源在 125m 与 185m 两级台阶后稳定 55 分钟。

## 5. 已知限制

- 决策记录不含最近道具/主题/标签集合，回放只能重算基础维度并沿用记录中的去重/偏好增量；回放分不等同线上原始分。
- 评测脚本不读取 `app-settings`，报告中的勿扰状态固定为未生效；准确状态以设置页质量卡为准。
- 质量卡只做代理指标，不替代真实用户反馈；不做在线 A/B。
- 性能门禁只做相对基线，不设绝对帧率；当前在 SwiftShader 下运行，硬件指纹不一致时默认只警告。
- 门禁为本地命令，不接入工蜂 CI（工蜂无 CI）；4h 长跑仍需人工执行。
- 资产体积预算（候选 08）与统一音频导演（候选 10）不在本版范围。

## 6. 发布物料清单

| 物料 | 状态 | 要点 / 大纲 |
|---|---|---|
| 发布说明（本文） | 草稿 | 待回填 4h 长跑与安装包数据 |
| 版本总结 | 草稿 | [version-summary.md](./version-summary.md) |
| 技术博客 | 完成 | 10 篇已归档至 `blog/v4.1/`：总览、打分下沉、历史扩展、离线回放、场景矩阵、质量卡、长跑采样、短跑门禁、基线阈值、复盘 |
| 性能长跑 | 完成 | [v4.1-longrun.json](../../perf/v4.1-longrun.json)：240.2 分钟 49 组；p95 2.092ms、堆峰值 168.8MB、资源末值 38/56/9 |
| 性能基线 | 完成 | [baseline-v4.1.json](../../perf/baseline-v4.1.json)：Intel Core Ultra 9 275HX / 24 核 / 31.4GB / win32 x64；480×640；xuetuan ↔ rankaluli |
| 安装包 | 完成 | `WorkBuddyForMe-Setup-4.1.0.exe` 264.61 MB（277,465,478 字节）；归档于 `E:\builds\archive\v4.1.0`，同目录含 blockmap / latest.yml / SHA256SUMS.txt / build-info.json |
| 校验和 | 完成 | 安装包 `f0f1ccc8…f63951d`；blockmap `6704e188…d7c792`；latest.yml `2d1f29b3…b9aadc44`；`build-info.json` 记录 commit `ae5d3566`、branch `feat/v4.1-quality-gates`、构建时间 2026-11-16T01:27:14Z |
| 校验和复核 | 已通过 | `node scripts/release-manifest.mjs --check --dir E:\builds\archive\v4.1.0` 输出「校验通过 3 个产物（4.1.0）」 |
| 更新公告 | 草稿 | 见 §7 |
| 截图 | 待补 | 设置页陪伴质量卡；v4.0 遗留的内容包安装页、舞台动效菜单 |

## 7. 更新公告（草稿）

> v4.1.0 来了。设置页新增「陪伴质量」卡，能看到最近决策的重复率、去重与弱偏好命中情况，决策记录也扩到 50 条；开发者可以用 `pnpm eval:companion` 回放历史决策、跑 12 组场景矩阵，调权重前后直接看排序变化。性能侧补齐了 p50、长任务与 GPU 资源采样，新增 10 分钟本地短跑门禁，只和基线比、不设绝对帧率；4 小时长跑报告会随版本归档。

## 8. 复核方式

```powershell
node scripts/release-manifest.mjs --check --dir E:\builds\archive\v4.1.0
```

预期输出「校验通过 3 个产物（4.1.0）」；安装包 SHA256 为 `f0f1ccc8ccf011c23aff347b0ef4b26d302d4d7eb6c906cd672470be3f63951d`，`build-info.json` 记录 commit `ae5d3566` 与构建时间 2026-11-16T01:27:14Z。
