# v4.3 M4 音频输出设备规格

> 状态：已实现（M4 完成）。范围：输出设备偏好与回退；不改音量、duck 与播放器生命周期。

## 1. 目标

1. 设置页可选择音频输出设备，选择持久化到 `wbfm.audio.output`；
2. 已注册的音乐、剧场 BGM、音效与语音 sink 在支持 `setSinkId` 时切换设备；
3. 不支持、设备消失或切换失败时静默回退系统默认，不中断播放。

## 2. 决策

| 编号 | 决策 | 理由 |
| --- | --- | --- |
| D1 | 设备偏好由 `AudioDirector` 单点持有，`null` = 系统默认 | 与 mute/duck 同源，sink 只执行不决策 |
| D2 | `AudioSink.setOutputDevice?` 可选 | 不要求所有 sink 支持；旧实现零改动 |
| D3 | `setSinkId` 失败时二次尝试 `''`（默认设备） | 覆盖设备拔出/权限变化，保证仍有声音 |
| D4 | localStorage 持久化 + `storage` 事件同步 | 主窗、桌宠窗、舞台窗同源，跨窗口切换即时生效 |
| D5 | 只在设置面板枚举设备，监听 `devicechange` | 枚举需要权限/用户手势，不在桌宠启动路径调用 |
| D6 | 语音 sink 的 `setGain` 保持 no-op，只切设备 | 全局静音不改变既有“语音不受 BGM 静音影响”的行为 |
| D7 | 设置项放在「语音」分组，新增独立面板 | 与语音偏好相邻，避免新增一级分组 |

## 3. 契约

```ts
interface AudioSink {
  setGain(gain: number): void;
  setSuspended?(suspended: boolean): void;
  setOutputDevice?(deviceId: string | null): void;
}

interface AudioDirectorSnapshot {
  muted: boolean;
  voiceActive: boolean;
  background: 'music' | 'theater-bgm' | null;
  unlocked: boolean;
  outputDevice: string | null;
}
```

- `AudioDirector.getOutputDevice()` / `setOutputDevice(id | null)`；
- 注册 sink 时立即收到当前设备；
- `applySinkId(target, id)` 返回 `applied | fallback | unsupported`，设备消失时回退默认；
- 空字符串/空白统一归一化为 `null`。

## 4. 文件级改动

### audio

1. `features/audio/constants.ts`：`AUDIO_OUTPUT_STORAGE_KEY = 'wbfm.audio.output'`。
2. `features/audio/types.ts`：sink 增加 `setOutputDevice?`，快照增加 `outputDevice`。
3. `features/audio/output-device.ts`（新增）：`applySinkId`、偏好读写与归一化。
4. `features/audio/director.ts`：持有偏好、注册即应用、切换广播、`storage` 事件同步。
5. `features/audio/use-audio-output-devices.ts`（新增）：枚举 `audiooutput`、`devicechange` 刷新、`select` 写回导演。
6. `features/audio/settings/audio-output-panel.tsx`（新增）：设备下拉、默认项、缺失提示与刷新。
7. `features/audio/index.ts`：导出 hook 与面板。

### sinks

8. `features/music/use-music-audio-sink.ts`：HTMLAudioElement `setSinkId`。
9. `features/stage/theater/theater-bgm.ts`：保存偏好，元素创建后应用。
10. `features/stage/theater/theater-sfx.ts`：AudioContext `setSinkId`，上下文惰性创建后补应用。
11. `features/stage/theater/use-theater-audio.ts`：注册 BGM 与 SFX sink 的设备切换。
12. `features/voice/web-audio-player.ts`：AudioContext 设备切换。
13. `features/voice/use-voice-playback.ts`：注册 voice sink，只做设备路由。

### 设置与文案

14. `lib/settings/catalog.ts`：`audio-output` 面板（voice 分组）。
15. `features/settings/base/settings-registry.tsx`：渲染器接线。
16. `packages/shared/src/i18n/messages/audio.ts` / `audio-en.ts`（新增）：面板文案。
17. `packages/shared/src/i18n/zh-CN.ts` / `en-US.ts`：注册 `audio` 命名空间。
18. `settings-registry.ts`：面板标题/描述中英文。

### 测试

19. `features/audio/output-device.test.ts`：支持、首次失败回退、完全不支持三条路径。
20. `features/audio/director.test.ts`：注册即应用、切换广播、清空归一化。
21. `features/audio/use-audio-output-devices.test.tsx`：有设备 / 无 `mediaDevices` 两条路径。

## 5. 验证

```bash
pnpm --filter @wbfm/web exec vitest run src/features/audio
pnpm check
```

手工验收：设置页选择设备 → 音乐/剧场/音效/语音切换输出；选择不存在的设备 → 回退默认；刷新设备列表可见新设备。

## 6. 不做

- 不做麦克风输入设备选择；
- 不做每音轨独立设备；
- 不重构 AudioDirector 的 duck/静音策略；
- 不在桌宠/舞台启动时主动枚举设备。
