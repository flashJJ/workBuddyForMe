# v4.6 Progress Log

> 方案：[README.md](./README.md) · Spec：[spec.md](./spec.md) · Tasks：[tasks.md](./tasks.md)
> 分支：`feat/v4.6-voice-binding`

## 状态

| 里程碑 | 状态 | 日期 |
|---|---|---|
| M0 方案与分支 | 完成 | 2026-11-17 |
| M1 一致性 | 完成 | 2026-11-17 |
| M2 导入 VRM 绑定 | 待开始 | — |
| M3 加载提效 | 待开始 | — |
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
