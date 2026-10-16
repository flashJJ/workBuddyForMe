# 04 · `.wbfm-pack` mod 包规范（M0 冻结稿）

> 状态：M0 评审稿（manifest 字段形状 M4 起冻结）
> 上游：[../v1.6-v2.0/v2.0-情感闭环与mod生态.md](../v1.6-v2.0/v2.0-情感闭环与mod生态.md) G5；本版 [README](README.md) Non-Goals 3、7
> 基座：v1.8 角色卡（character_cards，Markdown+frontmatter）、v1.7 剧本（event definitions，`builtin.*`）、v1.8 四主题 token、v1.6 助手人格四权重、v1.9 stage_scenes

## 1. 定位与红线

`.wbfm-pack` 是**本地个性化成果的打包格式**，不是模型/音频资产容器，也不是在线分发渠道。

- 单用户本地导入导出；无账号、无商店、无云端（Non-Goal，本地优先宪法）。
- **不含且解包层硬拒**：Live2D 模型与动作（`.moc3`/`.model3.json`/`.motion3.json`/`.physics3.json`/`.cdi3.json` 等）、VRM/3D 模型（`.vrm`/`.glb`/`.gltf`/`.fbx`）、音频（`.wav`/`.mp3`/`.ogg`/`.m4a`/`.flac`）。VRM 导入是独立通道（见 [02](02-VRM导入可行性调研报告.md)），**不进 pack**。
- 不做 CA/信任链：只有「来源标记」（builtin/imported/本地导出 + 导入时间 + 包作者自填署名），不做签名验证。
- 内置内容受 `builtin.*` 命名空间保护，永远不可被 pack 覆盖。

## 2. 容器格式

| 项 | 规格 |
|---|---|
| 外层 | ZIP（扩展名 `.wbfm-pack`，MIME 自定 `application/x-wbfm-pack`） |
| 压缩 | DEFLATE；单文件 tar/未加密 zip 不接受 |
| 大小上限 | `WBFM_PACK_MAX_BYTES = 20 MB`（唯一可能含二进制的是可选原创背景图，已单张限 2 MB） |
| 编码 | 文本文件一律 UTF-8；JSON 不带 BOM |
| 必需根文件 | `manifest.json`（唯一入口，其余条目按 manifest 声明索引） |
| Zip 安全 | 解压前逐条校验 entry 名：禁绝对路径/盘符/`..`/反斜杠/控制字符/空字节；禁符号链接（external attr 检测）；嵌套压缩包条目直接拒绝 |

## 3. manifest.json

```json
{
  "format": "wbfm-pack",
  "schemaVersion": 1,
  "pack": {
    "id": "p_<uuid>",
    "name": "清冷搭档套装",
    "description": "一张卡 + 两个剧本 + 夜金主题微调",
    "author": { "name": "本地用户", "url": null },
    "createdAt": "2026-10-15T00:00:00.000Z",
    "packVersion": "1.0.0"
  },
  "contents": {
    "characterCards": ["cards/cool-partner.md"],
    "events": ["events/evening-greeting.json"],
    "themes": ["themes/nocturne-tweak.json"],
    "personas": ["personas/frank-a.json"],
    "gesturePresets": ["gestures/confidant-wave.json"],
    "stageBackgrounds": ["backgrounds/bg-dusk.png"]
  }
}
```

### 3.1 zod 契约（M4 落 `packages/shared/src/schemas/wbfm-pack.ts`，M0 冻结形状）

- `format` 字面量校验（非 `wbfm-pack` 直接拒）；`schemaVersion` 当前 1，更高版本按「请升级应用」拒绝（同备份版本策略），不做向前猜测。
- 各条目路径必须位于声明的子目录内且扩展名匹配白名单；manifest 列出但包内缺失的条目 = 整包拒绝（不做部分导入）。
- 文本条目（md/json）单文件大小上限：卡片 16 KB（沿用 v1.8 CARD_MAX）、事件 JSON 32 KB、主题/人格/动作各 8 KB；背景图 ≤2 MB、整包 ≤20 MB。

## 4. 内容条目白名单与复用契约

| 键 | 文件 | 复用的现有契约 | 校验 |
|---|---|---|---|
| `characterCards` | `cards/*.md` | v1.8 角色卡 Markdown 零依赖解析器（frontmatter + 四约定章节） | 逐张过现有解析器；frontmatter 可选含 `nicknameByLevel`（v2.0 M1 新增字段，见 [03 §7.1](03-关系等级与解锁契约.md)） |
| `events` | `events/*.json` | v1.7 event definition JSON（含 id/kind/触发/剧本段） | 过现有 event schema；id 必须非 `builtin.*`（用户事件）；可含 `minRelationshipLevel` |
| `themes` | `themes/*.json` | v1.8 主题 token 注册表形状（HSL token 集） | hex/HSL 值域 + WCAG AA 对比度校验（沿用 theme-contrast.mjs 阈值），不达标拒绝 |
| `personas` | `personas/*.json` | v1.6 助手人格四权重（frankness/tsundere/shy/tolerance 0–1） | 四值全在 [0,1]，不绑定助手 id/模型 id（人格参数是可复用模板，不夹带机器配置） |
| `gesturePresets` | `gestures/*.json` | v2.0 新增（见 03 §7.1） | **封闭枚举**：expression 仅 neutral/joy/sadness/anger，motion 仅 idle/listening/thinking/working；不允许任何文件路径/URL 字段 |
| `stageBackgrounds` | `backgrounds/*.{png,jpeg,jpg,webp}` | v1.9 舞台背景（20MB 总限内、本条目 2MB 上限） | 魔数校验真实图片类型（不只看扩展名）；导入走现有背景服务落 `data/stage-backgrounds/bg-<uuid>`，原图不保留包内路径 |

禁含条目（出现即拒，不论 manifest 是否声明）：`assistants/**`（不迁移助手行与模型绑定）、`settings/**`、任何数据库文件、`*.vrm`、`*.moc3` 等 §1 黑名单。

## 5. 命名空间与冲突策略

- 内置 id 形态：卡片/事件的内置 id 以 `builtin.` 开头（v1.7/v1.8 既有约定）。**任何条目 id 命中 `builtin.*` 一律拒绝导入**（错误信息明示内置内容不可覆盖），而不是静默改名——避免用户以为自己替换了内置卡。
- 用户条目冲突（与现有条目同 id/同名）：
  1. 预览页标红列出「与现有内容重名/id」；
  2. 用户二选一：**导入为副本**（系统生成新 id，原名加「（导入副本）」后缀）或**取消整个条目**；
  3. 不做「覆盖」选项（与备份恢复的 INSERT OR IGNORE 同哲学：本机数据永不被外来包静默改写）。
- 背景图永远是新 uuid 复制（无 id 冲突面）。

## 6. 导入流程（M4 向导 UI 契约）

1. 选文件 → 容器层校验（zip 结构/大小/路径穿越/嵌套/扩展名）——不过直接报错，不进内容解析。
2. manifest 解析 → 逐条目 schema+领域校验，聚合错误清单（逐条列明，不做部分成功）。
3. **预览页**：分组展示将新增的卡/剧本/主题/人格/动作/背景，每项给名称/作者/来源；冲突项标红；主题对比度结果可见。
4. 用户确认（可选勾选导入哪些条目，默认全选；整包级无「信任作者」持久化勾选——每次导入都看清单）。
5. 写库/落盘 → 结果页给出各类导入计数；全部进 v6 备份轨与 mod 安装记录（见 [05](05-表结构备份与指标路线.md)）。
6. 来源标记：导入内容记录 `source: 'imported-pack'`、`packId`、`importedAt`（角色卡现有来源位扩展；事件/主题等同口径字段，M4 随表结构落地）。

## 7. 导出流程（M4）

- 入口：设置→个性化→「导出为 .wbfm-pack」；勾选要带走的卡/自建剧本/主题/人格参数/动作/舞台背景。
- 导出器只收**用户自建**内容：`builtin.*` 与非本人创建项不出现在勾选列表。
- pack 作者字段自填（默认本机设置昵称）；导出不做加密/签名。

## 8. 负例 eval（M4 必做，M0 冻结清单）

| 构造 | 期望 |
|---|---|
| 扩展名为 .wbfm-pack 实际是 tar/7z/文本 | 容器校验拒绝 |
| entry `../../Windows/x`、`C:\\x`、含 `\0` | 路径校验拒绝 |
| 内层嵌套 zip / zip 内再放 wbfm-pack | 嵌套压缩包拒绝 |
| 夹带 `models/a.moc3`、`avatar.vrm`、`voice.wav`（含改后缀为 .png 与改魔数两种伪装） | 黑名单拒绝；图片条目以魔数为准 |
| manifest 列了 cards/a.md 但包内缺失 | 整包拒绝 |
| id=`builtin.event.goodnight` 的事件 JSON | 命名空间拒绝 |
| 主题对比度不达 AA | 主题条目拒绝并给具体不达标色对 |
| schemaVersion=99 | 版本拒绝并提示升级 |

## 9. M0 不做

- 打包/解包器实现、向导 UI、来源标记字段（M4）；
- 在线模板库/扫码分享/云同步（Non-Goal 永久）；
- 包签名/CA（仅保留 manifest.pack.author 自填署名位）。
