# WorkBuddyForMe v4.3.0 发布说明

> 版本：4.3.0（2026-11-16）
> 主题：内容与资产收口——场景包、道具包、体积预算与平台元数据
> 范围：M0 方案与归档 → M1 资产预算 → M2 场景包 → M3 道具包 → M4 音频输出设备 → M5 平台元数据 → M6 收尾
> 说明：零数据库迁移，`LATEST_SCHEMA_VERSION = 51` 与备份 schema 均不变。
> 状态：安装包已构建，待真机验证；验证通过后再合并 main、打 tag 并推送。

## 1. 本版交付

| 里程碑 | 交付内容 |
|---|---|
| M0 | v4.3 方案、Spec、Tasks 与进度日志落盘；候选 08 转正并更新三处路线图索引 |
| M1 | 新增 `check:assets`：GLB/贴图/morph 快照/安装包体积扫描；预算表与 13 条警告基线 |
| M2 | 新增 `scene-pack`：声明式 Scene/Beat/Cue、`pack.` 命名空间、样例包、内容快照与桌宠触发索引；样例含道具展示场景 |
| M3 | 新增 `prop-pack`：包内 GLB 资源、路径与预算校验、资源路由、运行时道具注册表 |
| M4 | AudioDirector 输出设备偏好；music/theater-bgm/sfx/voice 四个 sink 接入 `setSinkId` 与默认回退 |
| M5 | 统一 `ToolDescriptor`；内置/MCP/流程工具共用适配层；provider 协议能力只读徽章 |
| M6 | 全量测试、`pnpm check`、安装包构建、发布文档与博客 |

## 2. 用户可见变化

- 设置页「语音」分组新增「音频输出」：可选择系统默认或具体扬声器/耳机；设备拔出或切换失败时自动回退默认。
- 安装 `scene-pack` 后，包内场景进入桌宠剧本触发索引；调试面板可手动播放，停用后下一次挂载消失。
- 安装 `prop-pack` 后，包内 GLB 道具可被场景 `prop` cue 引用，挂到角色手部或舞台；停用后下一次 cue 不再可见。
- 样例场景包新增 `pack.sample.cube-showcase`：同时安装两个样例包后，抬手触发可看到示例立方体出现并在 3 秒后收起。
- 供应商卡片新增协议能力徽章：流式、工具调用、视觉、向量；只读展示，不参与模型路由。
- 工具调试台列表字段统一为 `inputSchema` / `permissions`，并纳入已发布流程工具。

## 3. 内部改动

- 资产预算：`scripts/assets/check-assets.mjs` 解析 GLB JSON/BIN、PNG/JPEG/WebP 尺寸与 morph 有序签名；预算为单模型 25MB、合计 25MB、安装包 300MB；贴图硬上限 4096、目标颜色 2048/数据 1024。
- 场景包：`shared/schemas/script/scene-pack.ts` 约束 1–50 场、`pack.` 前缀与包内去重；core effect 校验 payload；`services/script/scene-content-service.ts` 生成 `packs:<sha256>` 快照。
- 道具包：`shared/schemas/prop/prop-pack.ts` 约束 1–20 个道具、许可必填、hand/stage 参数互斥；core 校验资源存在、路径越界与 5MB/20MB 预算；web 通过 `/api/prop-assets` 只读 payload 声明文件。
- 音频设备：`output-device.ts` 的 `applySinkId` 首次失败后回退 `''`；导演快照新增 `outputDevice`，注册 sink 即应用，`storage` 事件跨窗口同步。
- 平台元数据：`schemas/tool/tool.ts` 定义统一描述符；`tools/descriptor/` 适配内置/流程/MCP；provider 能力为协议级常量，不落库、不参与路由。

## 4. 门禁结果

- 全量测试：9 个包 736 个测试文件 4180 项通过。
  - web 282 文件 1433 项；core 270 文件 1657 项；database 75 文件 283 项；shared 46 文件 402 项；desktop 33 文件 218 项；ai 16 文件 86 项；voice 9 文件 85 项；config 4 文件 14 项；motion 1 文件 2 项。
- `pnpm check`：typecheck、lint、行数、结构、循环依赖、ASCII、资产检查全部通过。
- `check:assets`：三席合计 22.29MB / 25MB；xuetuan 9.28MB、feibi 7.01MB、rankaluli 6.00MB；三席均 118 morph / 49 骨骼且签名一致；13 条非阻断警告（3 张 4096 颜色贴图、10 张 PNG/JPEG 未转 WebP）。
- 迁移：零数据库迁移，`LATEST_SCHEMA_VERSION = 51`；备份 schema 不变。

## 5. 已知限制

- 场景包只接共享 `Scene`（桌宠剧本），不接小剧场 `TheaterEpisode`；小剧场仍只读静态剧集。
- 场景包与道具包不做热替换：安装/停用后下一次挂载或下一次 cue 生效。
- 道具包只支持 `payload/` 下的 `.glb`，不支持 `.gltf`、贴图外链或远程 URL。
- 音频输出设备枚举依赖浏览器/Electron 支持；没有权限时设备标签可能为空，`setSinkId` 不支持时静默回退默认。
- provider 能力是协议级声明，不代表单个模型都支持；不参与模型选择或自动路由。
- P2（WebAudio 全图、自动响度归一、语音/音乐统一队列、非默认模型下载包）仍未排期。

## 6. 安装包与校验

| 项目 | 值 |
|---|---|
| 安装包 | `WorkBuddyForMe-Setup-4.3.0.exe` 264.88 MB（277,742,581 字节） |
| 安装包 SHA256 | `7129f2a886656218603f4664a039327b9168d04b9a9d093da25af7384a437fac` |
| blockmap SHA256 | `8d108a55f87bda6a8e7a74d9bd82f49096c5fcaa131919fe13c8006a8f352301` |
| latest.yml SHA256 | `1a8081f33fbc4183da01ba9cff8549c640a08d01ef841b0fc4c70633aba043af` |
| 归档目录 | `E:\builds\archive\v4.3.0` |
| build-info | commit `ca9d63df`、branch `feat/v4.3-content-and-assets`、构建时间 `2026-11-16T16:18:42Z` |
| 体积对比 | 较 v4.2.0（源码发布，无安装包）不可比；较 v4.1.0 264.61MB 增加 0.26MB（277,103 字节） |

## 7. 更新公告

本版把内容生态和资产门槛一起收口：现在可以安装声明式场景包与道具包，音频可以选输出设备，工具与供应商元数据也统一成只读描述。安装包体积与三席资产仍在预算内，没有数据库迁移；升级后首次启动无需额外操作。

## 8. 发布物料清单

| 物料 | 状态 | 要点 |
|---|---|---|
| 发布说明（本文） | 完成 | 安装包数据已按最终构建回填 |
| 版本总结 | 完成 | [version-summary.md](./version-summary.md) |
| 技术博客 | 完成 | `blog/v4.3/` 10 篇 |
| 资产预算表 | 完成 | [assets-budget.md](./assets-budget.md) |
| 安装包 | 完成 | 归档于 `E:\builds\archive\v4.3.0` |
| 校验和复核 | 已完成 | `node scripts/release-manifest.mjs --check --dir E:\builds\archive\v4.3.0` 输出「校验通过 3 个产物（4.3.0）」 |
| 真机验证 | 待执行 | 安装、启动、场景包/道具包、音频设备、供应商徽章 |
| 截图 | 待补 | 场景包安装、道具可见、音频输出设置、供应商能力徽章 |
