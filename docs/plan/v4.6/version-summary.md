# v4.6 版本总结：声线有归属

> 版本：4.6.0（2026-11-18）
> 主题：导入 VRM 声线绑定、统一声线解析与 TTS 加载提效
> 分支：`feat/v4.6-voice-binding`
> 迁移：一次纯加法迁移 `v052`，`LATEST_SCHEMA_VERSION = 52`；备份 schema 9 不变。

## 1. 本版解决什么

v4.5 收口了启动体验，但声音链路仍有三个断点：

1. **导入 VRM 没有声线归属**：`vrm_avatars` 只有形象元数据，没有声线字段；内置 VRM 有固定 sid，导入 VRM 统一回落默认 Haru。
2. **设置页与实际出声不一致**：形象设置区用 Live2D 注册表反查声线，任何 VRM 都回落 Haru；舞台 cast 的 `voicePreference` 也没有被运行时消费。
3. **加载与合成有浪费**：改语速触发整个模型重建；预热只执行一次且失败永久缓存；试听、问候、剧场重复台词每次重新合成。

v4.6 按“先修一致性、再做能力、最后提效”的顺序收口：

- 一个 `resolveAvatarVoice` 统一服务端、设置页、舞台的声线解析；
- `vrm_avatars.voice_sid` 让导入 VRM 拥有可持久化的声线；
- 逐句语速、可恢复预热与短句 LRU 缓存，把可避免的等待和重复合成降下来。

## 2. 里程碑结果

| 阶段 | 结果 |
|---|---|
| M0 | 现状取证、方案/Spec/Tasks、分支创建 |
| M1 | 统一解析、设置页修复、舞台 `voicePreference` 生效、解析单测 |
| M2 | `v052` 迁移、契约/服务/API、导入 VRM 声线选择与试听、备份携带 |
| M3 | 逐句 `speed`、配置键去速度、预热重试、短句缓存 |
| M4 | 全量测试、打包态烟测、4.6.0 安装包、发布文档与博客 |

## 3. 关键设计

### 3.1 声线解析只有一个入口

`resolveAvatarVoice(avatarModelId, override?)` 返回 `{ sid, voice, gender, source }`，顺序固定：

1. 用户为导入 VRM 绑定的 sid；
2. 内置 VRM 专用表（雪团 18 / 冉卡露丽 32 / 菲比 3）；
3. 内置 Live2D 角色表；
4. 默认 Haru（sid 3）。

服务端合成、设置页展示/试听、舞台/剧场都调用同一函数。`source` 只用于展示与排查，不参与合成；未知/空角色仍保持升级前行为。

### 3.2 迁移只加可空列

`vrm_avatars.voice_sid INTEGER NULL`：

- 旧库升级后为 NULL，合成回落默认，行为与升级前一致；
- 旧备份缺少 `voiceSid` 时 schema 默认 null；
- 迁移前先检查表是否存在，兼容只到 v30 之前的测试夹具；
- 不写 CHECK 约束，避免 SQLite 重建表；范围校验在服务层与 API schema 完成。

### 3.3 导入绑定走完整链路

`importAvatar` 可带初始 `voiceSid`；`setVoiceSid` 负责更新与校验；`PATCH /api/vrm-avatars/:id` 暴露给设置页；`VrmAvatarList` 提供「跟随默认 + 103 音色分组」选择与试听；`VoiceRuntime` 合成时按 `file_ref` 读取绑定值。

绑定值同时进入备份 `vrmAvatars.json`；`.vrm` 二进制仍不打包，恢复后引用悬空时沿用既有 warning。

### 3.4 速度是逐句参数，不是引擎身份

`TtsSynthOptions` 增加 `speed`，inline/worker 引擎按 `opts.speed ?? 默认速度` 合成；`ttsConfigKey` 只保留模型、目录、线程。

这条区分很关键：线程数变化需要重建原生引擎，语速只是 `generate` 的入参。之前把速度放进缓存键，用户每改一次语速都要重新加载数百 MB 模型；现在下一句直接生效。

### 3.5 预热要能重试

`prewarmTts(force)`：

- 成功结果复用，避免重复加载；
- 失败不永久缓存，下一次可重试；
- `invalidateTts` 清空预热与合成缓存；
- 模型下载完成、模型/线程/目录变化后后台重新预热。

预热仍不阻塞服务启动；失败静默，首次朗读会再试并给出真实错误。

### 3.6 短句缓存按“条数 + 文本长度 + PCM 样本”三重限制

`SynthesisCache` 的 key 是 `模型|sid|速度|文本`，默认 64 条、单条 ≤80 字、总样本 ≤200 万（约 8MB）。命中返回 PCM 副本，避免调用方修改污染缓存；引擎重建或配置失效时清空。

只缓存短句，是因为试听、问候、剧场重复台词是高频短文本；长文缓存体积不可控，收益也低。

## 4. 数据与验证

- 全量测试：9 包 751 文件 4258 项通过。
  - web 285/1445；core 273/1674；database 76/285；shared 48/420；desktop 39/247；voice 9/85；ai 16/86；config 4/14；motion 1/2。
- 定向：shared 声线 19 项、core 运行时/缓存 18 项、voice 引擎 15 项、database v052/v030 4 项、web 语音域 73 项。
- `pnpm check` 全绿。
- 打包态烟测：`win-unpacked` 以临时 `userData` 启动，`user_version=52`，`vrm_avatars` 含 `voice_sid`。
- 安装包：4.6.0 286,499,963 字节（273.23MB），SHA256 `e333ac9e…87f3fb`；manifest 3 个产物复核通过。
- 数据库：迁移 v052；备份 schema 9 不变。

## 5. 已知限制

- 多角色声线仅 Kokoro 生效；MeloTTS 单声，所有形象同声；
- 103 音色名按官方 sid 顺序推导，上游调整时以试听为准；
- 导入 VRM 绑定 sid，不绑定模型；切到 Melo 时忽略，切回 Kokoro 恢复；
- 短句缓存只在进程内，不持久化；
- 单 TTS worker，chat 与剧场并发时串行；流式 PCM/AudioWorklet 与多 worker 留后续；
- 真机听感矩阵待人工验收。

## 6. 下一步

先完成真机验收：内置/导入 VRM 切换、绑定持久化、Melo/Kokoro 切换、语速修改与重启恢复；通过后合入 main、打 tag `v4.6.0` 并推送工蜂。后续再评估流式音频、多 worker 与声线市场。
