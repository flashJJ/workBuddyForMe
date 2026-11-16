# v4.2 Tasks

> 状态：开发中。每完成一项回填 [progress-log.md](./progress-log.md)。

## M0 方案与归档

- [x] T0.1 方案与任务落盘：`docs/plan/v4.2/README.md`、`tasks.md`、`progress-log.md`
- [x] T0.2 `git mv docs/roadmap/candidates/10-audio-director.md docs/roadmap/scheduled/v4.2-10-audio-director.md`
- [x] T0.3 更新 `docs/roadmap/candidates/README.md`：10 移出候选表
- [x] T0.4 更新 `docs/roadmap/scheduled/README.md`：新增 v4.2-10 行
- [x] T0.5 更新 `docs/roadmap/README.md`：新增 v4.2 开发中区块与序列行
- [x] T0.6 提交 `docs(v4.2): 音频导演方案与候选转正`

## M1 音频内核

- [x] T1.1 新增 `features/audio/types.ts`：音轨类型、优先级、sink、快照
- [x] T1.2 新增 `features/audio/constants.ts`：duck 0.35、音效上限 2、存储键
- [x] T1.3 新增 `features/audio/director.ts`：注册/注销、mute、语音来源 Set、背景互斥、解锁回调、订阅
- [x] T1.4 新增 `features/audio/use-audio-director.ts`：`useSyncExternalStore` 订阅
- [x] T1.5 新增 `features/audio/index.ts` 与 director 单测
- [x] T1.6 提交 `feat(v4.2): 音频导演内核`

## M2 全局音乐

- [x] T2.1 `MusicProvider` 注册 `music` sink，音量 = 基础音量 × 导演 gain
- [x] T2.2 静音开关接入迷你播放器，状态读写 `wbfm.audio.muted`
- [x] T2.3 播放意图写 `sessionStorage`，舞台返回后恢复
- [x] T2.4 更新音乐测试：sink 音量、静音、恢复意图
- [x] T2.5 提交 `feat(v4.2): 全局音乐接入音频导演`

## M3 小剧场

- [x] T3.1 `TheaterBgm` 改为 `setGain(gain)`，删除本地 muted/ducked
- [x] T3.2 `useTheaterAudio` 注册 `theater-bgm` sink，静音按钮改调导演
- [x] T3.3 `theater-sfx` 共用导演静音并限制同时 2 个
- [x] T3.4 更新剧场音频测试
- [x] T3.5 提交 `feat(v4.2): 剧场 BGM 与音效接入音频导演`

## M4 语音与解锁

- [x] T4.1 语音播放 hook 上报 `setVoiceActive(sourceId, active)`
- [x] T4.2 新增根布局 `AudioUnlockListener`，首次手势调用 `audioDirector.unlock()`
- [x] T4.3 移除剧场与语音的重复手势监听，保留解锁回调注册
- [x] T4.4 新增语音 duck 与解锁测试
- [x] T4.5 提交 `feat(v4.2): 统一语音 duck 与首次手势解锁`

## M5 收尾

- [x] T5.1 `MusicTrack` 增加 `loudnessLufs`，内置曲目标 -16 并加单测
- [x] T5.2 运行 `pnpm check` 与全量测试
- [x] T5.3 回填进度日志与验收结果
- [x] T5.4 提交 `docs(v4.2): 音频导演收尾`
