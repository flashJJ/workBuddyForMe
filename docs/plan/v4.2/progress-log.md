# v4.2 进度与决策留痕

> 用途：记录 v4.2 每次推进的「做了什么、为什么、结果、下一步」。
> 关联：[v4.2 方案](./README.md) · [Tasks](./tasks.md)。

## 当前状态

| 里程碑 | 状态 | 最近更新 |
|---|---|---|
| M0 方案与归档 | ✅ 完成（方案/tasks 落盘，候选 10 转正，三处索引已更新） | 2026-11-16 |
| M1 音频内核 | ✅ 完成（AudioDirector、sink、duck、背景互斥、解锁、7 项单测） | 2026-11-16 |
| M2 全局音乐 | ✅ 完成（sink、静音、会话播放意图、偏好 hook） | 2026-11-16 |
| M3 小剧场 | ✅ 完成（BGM sink、SFX 限流、静音同步） | 2026-11-16 |
| M4 语音与解锁 | ✅ 完成（语音活跃上报、根布局统一解锁） | 2026-11-16 |
| M5 收尾 | ✅ 完成（响度登记、728 文件 4147 项测试、检查全绿） | 2026-11-16 |

## 决策日志

| 编号 | 日期 | 决策 | 原因 | 待复核 |
|---|---|---|---|---|
| D1 | 2026-11-16 | AudioDirector 放 web `features/audio/`，不放 shared/独立包 | 所有消费者都在浏览器；shared 目前保持纯数据，不应引入 DOM 类型 | 若未来桌面壳需要同源调度再抽包 |
| D2 | 2026-11-16 | 只做状态导演，不接管播放器内部 | 保留音乐/剧场现有淡变与队列语义，降低回退风险 | 若出现更多音轨再统一播放器 |
| D3 | 2026-11-16 | 全局音乐不接语音队列，只共享 duck 与解锁 | 语音队列有代际与 barge-in 语义，混入音乐会破坏取消边界 | 若未来做统一播放列表再评估 |
| D4 | 2026-11-16 | 舞台进出用 `sessionStorage` 播放意图恢复 | 路由卸载是现状；持久化意图即可满足「退出恢复」 | 若改为同页舞台再调整 |
| D5 | 2026-11-16 | 设备选择与 WebAudio 全图留到后续 | `setSinkId` 与全图迁移成本高，不是当前痛点 | 有真实设备切换需求再开 |
| D6 | 2026-11-16 | 响度只登记 -16 LUFS，不做运行时测量 | 运行时测量需要音频分析或离线工具，收益低于调度统一 | 若导入曲目增多再补归一化 |

## 工作日志

### 2026-11-16 M0 方案与归档

- 新增 `docs/plan/v4.2/README.md`：AudioDirector 单例、优先级/duck、舞台播放意图、全局静音、统一解锁与响度登记。
- 新增 `docs/plan/v4.2/tasks.md`：M0–M5 可勾选任务。
- 调研现状：全局音乐 `music-player.tsx`、剧场 `theater-bgm.ts` / `use-theater-audio.ts` / `theater-sfx.ts`、语音 `audio-playback-queue.ts` / `web-audio-player.ts`。
- 待执行：候选 10 转正与三处索引更新。

### 2026-11-16 M1 音频内核

- 新增 `features/audio/{types,constants,director,use-audio-director,index}.ts`：音轨类型、duck 0.35、音效上限 2、mute/语音来源 Set/背景互斥/解锁回调。
- 新增 8 项测试（含静音持久化），覆盖注册注销、duc、背景互斥、音效限流与解锁失败隔离。
- 结果：`pnpm --filter @wbfm/web exec vitest run src/features/audio` 8 项通过，web typecheck 通过。

### 2026-11-16 M2 全局音乐

- `MusicProvider` 注册 `music` sink；有效音量 = 本地音量 × 导演 gain；静音读取 `wbfm.audio.muted`。
- 迷你播放器新增静音按钮；播放意图写 `sessionStorage`，舞台返回后恢复。
- 拆分 `use-music-audio-sink.ts` 与 `use-music-preferences.ts`，`music-player.tsx` 从 345 行降至 292 行。
- 验证：music/audio 测试 20 项通过，web typecheck 通过。

### 2026-11-16 M3 小剧场

- `TheaterBgm` 改为 `setGain(gain)`，删除本地 mute/duck；`useTheaterAudio` 注册 `theater-bgm` sink 并共享全局静音。
- `theater-sfx` 去掉模块级静音，改用导演 `tryPlaySfx/endSfx`，同时最多 2 个。
- 验证：theater 测试 70 项通过（含并发限流与静音）。

### 2026-11-16 M4 语音与解锁

- `useVoicePlayback` 用 `useId` 作为来源 id 上报 `setVoiceActive`，语音结束自动恢复背景乐。
- 新增根布局 `AudioUnlockListener`，首次 pointerdown/keydown 调用导演解锁，并移除剧场重复手势监听。
- 音乐、剧场音效、语音队列分别注册解锁回调。
- 验证：语音 duck 与解锁测试通过；全量定向 73 项通过。

### 2026-11-16 M5 收尾

- 内置 11 首曲目登记 `loudnessLufs: -16`，新增单测锁定；导入曲目不受影响。
- `pnpm check` 全绿；全量 9 包 728 文件 4147 项测试通过（web 280 文件 1422 项）。
- 结果：v4.2 开发完成，零数据库迁移；发布动作待用户确认。

### 2026-11-16 发布收尾

- 版本号升至 `4.2.0`，`sync-version:check` 通过。
- 按发布决定不构建 exe 安装包，本版仅源码与 tag；`pnpm release:win` 未执行。
- `pnpm check` 全绿；全量 9 包 728 文件 4147 项测试通过。
- 发布说明、版本总结与 `blog/v4.2` 10 篇补齐；合入 main、打 tag `v4.2.0`，仅推送工蜂 `tencent`。
- 待补：真机截图（音乐静音按钮、剧场静音同步、语音 duck）。


