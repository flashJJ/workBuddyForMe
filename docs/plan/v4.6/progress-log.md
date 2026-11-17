# v4.6 Progress Log

> 方案：[README.md](./README.md) · Spec：[spec.md](./spec.md) · Tasks：[tasks.md](./tasks.md)
> 分支：`feat/v4.6-voice-binding`

## 状态

| 里程碑 | 状态 | 日期 |
|---|---|---|
| M0 方案与分支 | 完成 | 2026-11-17 |
| M1 一致性 | 完成 | 2026-11-17 |
| M2 导入 VRM 绑定 | 完成 | 2026-11-18 |
| M3 加载提效 | 完成 | 2026-11-18 |
| M4 验收与发布 | 待开始 | — |

## 记录

### 2026-11-17 M0 现状取证

- 默认 `ttsModel = melo`，单说话人；所有形象同声。
- Kokoro 下内置 VRM 有固定 sid：雪团 18、冉卡露丽 32、菲比 3；导入 VRM 未登记，统一回落 Haru sid 3。
- 设置页形象区用 `getAvatarModel` 反查 Live2D 表，任何 VRM 都回落 Haru；与实际合成不一致。
- 舞台 cast 有 `voicePreference`，但 `useStageVoice.speak` 只接收 `avatarModelId`，字段未生效。
- `ttsConfigKey` 含 `ttsSpeed`，改语速会重建模型；`prewarmTts` 用 `??=` 永久缓存结果，下载/切换后不重试。
- `vrm_avatars` 无声线字段；导入 VRM 没有绑定入口。

### 2026-11-17 M0 方案冻结

- 版本定位为小版本：先修一致性，再做导入 VRM 绑定，最后做加载提效；流式音频与多 worker 留白。
- 迁移 `v052` 只加可空 `voice_sid`，旧库/旧备份行为不变。
- 从 main（v4.5.1 merge `83310e8b`）切出 `feat/v4.6-voice-binding`。

### 2026-11-17 M1 一致性

- shared：新增 `resolveAvatarVoice(avatarModelId, override?)`，返回 `{ sid, voice, gender, source }`，解析顺序为用户绑定 > 内置 VRM > Live2D > 默认；`getAvatarSpeakerId` 改为薄封装。
- 设置页：`AvatarSection` 改用统一解析，内置雪团/冉卡露丽/菲比的展示与「角色试听」不再回落 Haru。
- 舞台：`StageVoice.speak` 增加可选 `speakerSid`；`useStageSpeech` 与 `useTheaterAudio` 传入 cast 的 `voicePreference.speakerSid`，显式偏好优先。
- 测试：shared `voice.test.ts` 16 项通过（新增解析顺序/覆盖/越界）；web 剧场音频 7 项通过；shared/web typecheck 通过。

### 2026-11-18 M2 导入 VRM 声线绑定

- 迁移 `v052`：`vrm_avatars` 新增可空 `voice_sid INTEGER`；旧库/旧备份为 NULL，行为不变；表缺失的测试夹具安全跳过。
- 契约：`vrmAvatarSchema.voiceSid` 缺省 null（旧备份可解析）；新增 `vrmAvatarVoiceUpdateSchema`（0–102 或 null，strict）。
- 服务：`VrmAvatarService.setVoiceSid`（越界/不存在拒绝）；`importAvatar` 支持初始 `voiceSid`。
- API：`PATCH /api/vrm-avatars/:id`，返回更新后的完整形象。
- 合成：`VoiceRuntime.synthesize` 对导入 VRM 读取 `voice_sid`，未绑定回落默认；内置 VRM/Live2D 不查库。
- UI：已导入 VRM 列表增加声线选择（跟随默认 + 103 音色分组）与试听；设置页形象区读取绑定值显示真实 sid。
- 备份：导出/恢复携带 `voiceSid`，旧备份缺省 null。
- 测试：database 全量 76 文件 285 项通过（含 v052 迁移/v030 列断言）；core 定向 25 项、shared 19 项通过；`pnpm check` 全绿。

### 2026-11-18 M3 加载提效

- `TtsSynthOptions` 增加 `speed`；inline/worker 引擎逐句使用 `opts.speed ?? 默认速度`；`/api/voice/tts` 透传请求里的 speed。
- `ttsConfigKey` 移除 `ttsSpeed`；设置页改语速不再 `invalidateTts`，下一句直接生效（引擎只创建一次）。
- `prewarmTts(force)`：失败不再永久缓存；`invalidateTts` 清空预热与合成缓存；模型/线程/目录变化后后台重新预热；TTS 下载完成自动预热。
- 新增 `SynthesisCache`：key = 模型|sid|速度|文本，64 条 / 80 字 / 200 万 PCM 样本三重上限；命中返回副本，引擎重建/失效时清空。
- 测试：voice 引擎 15 项、core 语音运行时与缓存 18 项通过；新增改语速不重建、缓存命中、预热失败重试、invalidate 重建用例。
