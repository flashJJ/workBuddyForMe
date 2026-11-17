# v4.6 声线有归属：导入 VRM 声线绑定与 TTS 加载提效

> 状态：M1 一致性、M2 导入 VRM 声线绑定、M3 加载提效完成；M4 验收与发布待开始。
> 基线：v4.5.1（main merge `83310e8b`，tag `v4.5.1`，`LATEST_SCHEMA_VERSION = 51`）。
> 一句话：让每个 VRM 形象都有自己的声音，并把声线解析、预热与短句合成从「各处各写一套」收成一条可测的链路。
> 分支：`feat/v4.6-voice-binding`。

## 1. 问题

当前声音链路有三个断点：

1. **导入 VRM 没有声线归属**：`vrm_avatars` 只有形象元数据，没有声线字段；`getAvatarSpeakerId` 对未登记的内置 VRM 走表，对导入 VRM 统一回落默认角色。用户导入自己的模型后，在多角色 TTS 下听起来永远像同一个角色。
2. **设置页与实际出声不一致**：形象设置区用 Live2D 注册表反查声线，任何 VRM id 都会回落 Haru；内置雪团/冉卡露丽/菲比在「角色试听」里听到的 sid 与实际对话不同。舞台 cast 的 `voicePreference` 字段也没有被运行时消费，目前只是碰巧与表一致。
3. **加载与合成有可避免的浪费**：改语速会触发整个 TTS 模型重建；启动预热只执行一次，模型下载完成或切换模型后不会重新预热；试听、问候、剧场重复台词每次重新合成；舞台没有下一句预取。

默认朗读模型是 MeloTTS，单说话人，所有形象同声。这不是 bug，但用户切到 Kokoro 后，上述问题会直接暴露。

## 2. 目标与非目标

### 目标

| 编号 | 目标 | 验收 |
|---|---|---|
| G1 | 声线解析只有一个入口 | 服务端合成、设置页展示/试听、舞台/剧场都调用同一个纯函数；内置 VRM 不再显示 Haru 的 sid |
| G2 | 导入 VRM 可绑定声线 | 绑定值持久化到数据库；重启、切换形象、重启应用后仍生效；未绑定时明确显示「跟随默认」 |
| G3 | 舞台声线偏好生效 | cast 里显式 `speakerSid` 优先于形象默认；不再存在「配了但不生效」的字段 |
| G4 | 改语速不重建模型 | `speed` 变成逐句参数；修改语速只影响下一次合成，不触发 worker 重建 |
| G5 | 预热可恢复 | 模型下载完成、切换模型、配置失效后能重新预热；失败不会永久缓存 |
| G6 | 短句不重复合成 | 进程内 LRU 缓存短句，试听/问候/剧场重复句命中缓存 |

### 非目标

- 不引入云 TTS，不改变 `sherpa-onnx` 本地推理路线；
- 不做流式 PCM / AudioWorklet / 二进制 SSE，这些留到延迟数据证明需要时再评估；
- 不做多 worker 池与并发优先级，本版只解决单 worker 的浪费；
- 不拆分 Kokoro 的 `voices.bin`，不提供按语言/性别下载的精简音色包；
- 不做声线克隆、音高/情感参数与自定义训练。

## 3. 范围

### P0 一致性（先修错）

| 编号 | 内容 |
|---|---|
| P0-1 | 新增 `resolveAvatarVoice(avatarModelId, override?)` 纯函数，返回 `{ sid, voice, gender, source }`；`getAvatarSpeakerId` 改为它的薄封装 |
| P0-2 | 设置页形象区改用统一解析，内置 VRM 的展示与试听使用真实 sid |
| P0-3 | 舞台 `voicePreference.speakerSid` 接入 `useStageVoice.speak`，显式值优先；没有显式值时仍按形象解析 |
| P0-4 | 单测覆盖：内置 VRM、Live2D、导入 VRM、空/未知、显式覆盖 |

### P1 导入 VRM 声线绑定

| 编号 | 内容 |
|---|---|
| P1-1 | 数据库迁移 `v052`：`vrm_avatars` 增加 `voice_sid INTEGER NULL`，范围 0–102 |
| P1-2 | 契约：`vrmAvatarSchema` 增加 `voiceSid: number \| null`；新增 `vrmAvatarVoiceUpdateSchema` |
| P1-3 | 服务：`createVrmAvatarService` 增加 `setVoiceSid(id, sid)`；导入时可带初始 sid |
| P1-4 | API：`PATCH /api/vrm-avatars/:id`，body `{ voiceSid: number \| null }`；校验 0–102 与记录存在 |
| P1-5 | UI：已导入 VRM 列表增加声线选择与试听；Kokoro 未就绪时禁用并提示；未设置显示「跟随默认」 |
| P1-6 | 解析：用户绑定 > 内置 VRM 表 > Live2D 表 > 默认 Haru |

### P1 加载提效

| 编号 | 内容 |
|---|---|
| P1-7 | `TtsSynthOptions` 增加 `speed`；worker/inline 引擎逐句使用 `opts.speed ?? defaultSpeed` |
| P1-8 | `ttsConfigKey` 移除 `ttsSpeed`；设置页改语速不再 `invalidateTts` 重建 |
| P1-9 | `prewarmTts` 支持失效/重试：模型下载完成、切换模型、`invalidateTts` 后清空预热结果并按需重新预热 |
| P1-10 | 短句 LRU：key = `model|sid|speed|text`，默认 64 条、单条 ≤80 字；不缓存长文；提供清空入口或随引擎重建清理 |

### P2 留白

- 流式 PCM / AudioWorklet 边收边播；
- 多 worker 池与 chat/剧场并发优先级；
- 启动音效与声线市场；
- VRM 声线自动推荐（按 meta/名称猜性别与音色）。

## 4. 里程碑

| 阶段 | 交付 |
|---|---|
| M0 | 方案、Spec、Tasks、进度日志；分支 `feat/v4.6-voice-binding` |
| M1 | 统一解析、设置页修复、舞台 `voicePreference` 生效、单测 |
| M2 | `v052` 迁移、`voice_sid` 契约/服务/API、导入 VRM 声线选择与试听 |
| M3 | 逐句 `speed`、预热失效、短句 LRU、定向测试 |
| M4 | 全量测试、`pnpm check`、安装包、发布文档与博客 |

## 5. 成功指标

- 内置雪团在设置页「角色试听」与对话实际 sid 都是 18；冉卡露丽 32、菲比 3；
- 导入 VRM 未绑定时明确显示「跟随默认（Haru）」；绑定后重启仍生效；
- 舞台 cast 显式 `speakerSid` 与合成请求一致；
- 修改语速后首句合成不出现模型重建耗时（日志可对比）；
- 短句重复试听命中缓存，合成耗时接近 0；
- 不引入新的数据库兼容问题：旧库升级后 `voice_sid` 为 NULL，行为与升级前一致。

## 6. 风险

| 风险 | 处理 |
|---|---|
| 迁移 52 影响备份/恢复 | 只加可空列；备份 schema 兼容读取，导出时带 `voiceSid`，旧归档缺省 NULL |
| 103 音色标签不准确 | 先用分组 + sid 展示；不伪造官方音色名，试听为准 |
| 用户把 Melo 当多角色用 | 设置页继续提示「Melo 单声，角色声线仅 Kokoro 生效」 |
| LRU 占用内存 | 只缓存短句、限制条数与总字节，随引擎重建清理 |
| 预热重试造成启动抖动 | 预热仍在后台异步执行，失败静默；不阻塞服务就绪 |

## 7. 参考

- 现状：[voice.ts](../../../packages/shared/src/schemas/media/voice.ts) · [voice-runtime.ts](../../../packages/core/src/voice/voice-runtime.ts)
- 服务：[vrm-avatar-service.ts](../../../packages/core/src/services/media/vrm-avatar-service.ts)
- 设置：[avatar-section.tsx](../../../apps/web/src/features/voice/settings/avatar-section.tsx)
- 舞台：[use-stage-voice.ts](../../../apps/web/src/features/stage/voice/use-stage-voice.ts)
