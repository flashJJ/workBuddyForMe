# v4.6 Spec：声线解析、导入绑定与加载提效

> 状态：M0 冻结。实现以本文为准；变更需同时更新 tasks 与 progress-log。
> 基线：`LATEST_SCHEMA_VERSION = 51`；本版迁移 `v052`。

## 1. 现状

| 位置 | 当前行为 | 问题 |
|---|---|---|
| `voice.ts` | `AVATAR_TTS_VOICES`（Live2D）与 `BUILTIN_VRM_TTS_VOICES`（内置 VRM）两张表；`getAvatarSpeakerId` 先查内置 VRM，再查 Live2D，最后回落 Haru | 导入 VRM 永远 Haru；调用方各自查表 |
| `avatar-section.tsx` | 用 `getAvatarModel(modelId)` 反查 Live2D 表 | 任何 VRM id 都返回 Haru，展示/试听错误 |
| `voice-engine-params.tsx` | 用 `getAvatarSpeakerId` | 与形象区不一致 |
| `use-stage-voice.ts` | `speak(text, avatarModelId)`，内部查表 | cast 的 `voicePreference` 未消费 |
| `voice-runtime.ts` | 逐句 `synthesize`，sid 由 `getAvatarSpeakerId` 解析；引擎缓存键含 `ttsSpeed` | 改语速重建模型；预热只跑一次 |
| `vrm-avatar-service.ts` | 只存 id/name/fileRef/byteLength/meta/createdAt | 没有声线字段 |

## 2. 声线解析契约

### 2.1 类型

```ts
export type AvatarVoiceSource = 'builtin-vrm' | 'live2d' | 'default' | 'override';

export interface ResolvedAvatarVoice extends AvatarTtsVoice {
  source: AvatarVoiceSource;
}

export interface AvatarVoiceOverride {
  /** 用户为导入 VRM 绑定的 sid；null/缺省表示未绑定 */
  speakerSid?: number | null;
}
```

约束：

- `sid` 必须是 0–102 的整数；
- `source` 只用于调试/展示，不参与合成；
- 不在共享层读取数据库；override 由调用方注入。

### 2.2 解析顺序

```ts
resolveAvatarVoice(avatarModelId, override?)
```

1. `override.speakerSid` 合法 → `{ sid, voice: 'custom', gender: bySid, source: 'override' }`；
2. `avatarModelId` 以 `vrm:` 开头且命中 `BUILTIN_VRM_TTS_VOICES` → `source: 'builtin-vrm'`；
3. 命中 `AVATAR_TTS_VOICES` → `source: 'live2d'`；
4. 其他（空、未知、导入 VRM 未绑定）→ `AVATAR_TTS_VOICES[DEFAULT_AVATAR_MODEL_ID]`，`source: 'default'`。

`getAvatarSpeakerId(id, override?)` 保持现有签名兼容，内部调用解析函数并返回 `sid`。

### 2.3 展示

- 内置角色：显示音色名（如 `zf_026`）、性别、sid；
- 导入 VRM 未绑定：显示「跟随默认（Haru / zf_001 / sid 3）」；
- 导入 VRM 已绑定：显示 `自定义声线 / sid N`，不伪造官方音色名；
- MeloTTS：统一显示单声说明，不展示 sid。

## 3. 数据库与 API

### 3.1 迁移 v052

```sql
ALTER TABLE vrm_avatars ADD COLUMN voice_sid INTEGER;
```

约束在应用层校验（0–102 整数或 NULL）；SQLite 的 `ALTER TABLE ADD COLUMN` 不写 CHECK，避免旧库重建风险。

### 3.2 契约

```ts
export const vrmAvatarSchema = z.object({
  // ...existing
  voiceSid: z.number().int().min(0).max(102).nullable(),
});

export const vrmAvatarVoiceUpdateSchema = z.object({
  voiceSid: z.number().int().min(0).max(102).nullable(),
}).strict();
```

旧记录读取时 `voice_sid` 为 NULL，映射为 `voiceSid: null`。

### 3.3 服务

`createVrmAvatarService(db)` 增加：

```ts
setVoiceSid(id: string, voiceSid: number | null): VrmAvatar
```

- 记录不存在 → `NOT_FOUND`；
- `voiceSid` 非空且越界 → `VALIDATION`；
- 成功返回更新后的完整记录。

`importAvatar` 可选接收 `voiceSid`，缺省 NULL。

### 3.4 API

`PATCH /api/vrm-avatars/:id`

```json
{ "voiceSid": 18 }
```

- 200：`{ avatar }`
- 404：记录不存在
- 422：sid 越界或 body 非法

`GET /api/vrm-avatars` 与 `GET /api/vrm-avatars/:id` 的响应自动带 `voiceSid`。

## 4. 服务端合成

`VoiceRuntime.synthesize(text, speakerId?)` 的优先级不变：

1. 显式 `speakerId`（试听/舞台 cast 覆盖）；
2. 当前 `avatarModelId` 的解析结果；
3. 默认角色。

导入 VRM 绑定值来自数据库，但 `VoiceRuntime` 不直接查 `vrm_avatars`。在 `synthesize` 前由调用方解析：

```ts
const override = resolveImportedVoiceOverride(settings.avatarModelId, vrmService);
const sid = speakerId ?? resolveAvatarVoice(settings.avatarModelId, override).sid;
```

为避免每次合成查库，`VrmAvatarService` 可提供轻量 `getVoiceSid(fileRef)`，主进程/服务端按需查询；本版先每次查询（单行主键读，成本可接受），M3 再按需缓存。

## 5. 加载提效

### 5.1 逐句 speed

`TtsSynthOptions` 增加：

```ts
export interface TtsSynthOptions {
  speakerId?: number;
  /** 逐句语速；缺省用引擎配置 */
  speed?: number;
}
```

- `SherpaTtsEngine.synthesize` 使用 `opts?.speed ?? this.speed`；
- `WorkerTtsEngine.synthesize` 消息里发送 `opts?.speed ?? this.speed`；
- `ttsConfigKey` 移除 `ttsSpeed`；
- `PUT /api/voice/settings` 不再因 `ttsSpeed` 调用 `invalidateTts`；
- `ttsSpeed` 仍在设置里持久化，下一次合成生效。

### 5.2 预热

```ts
prewarmTts(force?: boolean): Promise<boolean>
invalidateTts(): void // 同时清空 prewarmJob 与引擎
```

- 模型下载成功回调触发 `prewarmTts(true)`；
- `invalidateTts()` 后下一次 `prewarmTts()` 重新执行；
- 预热失败不缓存永久失败；下一次显式预热可重试；
- 预热仍不阻塞服务启动。

### 5.3 短句 LRU

- key：`${model}|${sid}|${speed}|${text}`；
- 仅缓存 `text.trim().length <= 80`；
- 默认 64 条，按条数与估算字节双重上限；
- 命中直接返回 `{ samples, sampleRate }` 的副本，避免调用方修改缓存；
- 引擎重建（模型/线程/目录变化）时清空；
- 不持久化到磁盘，不跨进程。

## 6. 舞台与剧场

`StageVoice.speak` 增加可选第三参数：

```ts
speak(text: string, avatarModelId: string, speakerSid?: number | null): Promise<StageSpeakResult>
```

- `speakerSid` 为合法整数时直接作为请求 `speakerId`；
- 缺省/`null` 时按 `avatarModelId` 解析；
- `useStageSpeech` 与 `useTheaterAudio` 传入 `member.voicePreference?.speakerSid`；
- `voicePreference.ttsModel` 本版不强制切换全局模型，只在文档标注为「建议值」。

## 7. 测试

| 层 | 用例 |
|---|---|
| shared | 解析顺序：override > 内置 VRM > Live2D > 默认；越界 override 忽略；内置 VRM 三个 sid；导入 VRM 回落 |
| database | `v052` 迁移幂等；旧记录 `voice_sid` 为 NULL；新列可更新 |
| core | `setVoiceSid` 正常/越界/不存在；`importAvatar` 带 voiceSid |
| web API | PATCH 200/404/422；GET 返回 voiceSid |
| voice | 逐句 speed 生效；config key 不含 speed；预热失效后可重试；LRU 命中/淘汰/清空 |
| web UI | 设置页显示真实 sid；舞台 speak 收到 cast 的 speakerSid |

## 8. 兼容与回滚

- 旧库升级：新增可空列，旧记录行为不变；
- 旧备份恢复：缺 `voiceSid` 时按 NULL；
- 回滚：代码回退后 `voice_sid` 列保留但不再读取，不影响启动；
- 不修改 `AVATAR_TTS_VOICES` 与内置 VRM 默认绑定，避免既有用户听感变化。
