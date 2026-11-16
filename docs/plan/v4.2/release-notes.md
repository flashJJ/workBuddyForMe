# WorkBuddyForMe v4.2.0 发布说明

> 版本：4.2.0（2026-11-16）
> 主题：统一音频导演——一条总线管住音乐、剧场、语音与音效
> 范围：M0 方案与归档 → M1 音频内核 → M2 全局音乐 → M3 小剧场 → M4 语音与解锁 → M5 收尾
> 说明：零数据库迁移，`LATEST_SCHEMA_VERSION = 51` 与备份 schema 均不变；按发布决定，本版不构建 exe 安装包。
> 状态：✅ 已发布（源码发布，不含安装包）。

## 1. 本版交付

| 里程碑 | 交付内容 |
|---|---|
| M0 | v4.2 方案、Tasks、进度日志落盘；候选 10 移入 `docs/roadmap/scheduled/` 并更新三处索引 |
| M1 | 新增浏览器侧 `AudioDirector`：音轨类型、mute、语音来源 Set、duck 0.35、背景互斥、音效并发上限 2、解锁回调与订阅快照 |
| M2 | 全局音乐注册为 `music` sink；迷你播放器新增全局静音；播放意图写 `sessionStorage`，舞台返回后恢复 |
| M3 | 剧场 BGM 改为 `setGain(gain)`，删除本地 mute/duck；剧场音效共用导演静音与并发限制 |
| M4 | 语音播放期间上报活跃，自动 duck 背景乐；根布局首次手势统一解锁，移除剧场重复监听 |
| M5 | 内置 11 首曲目登记 `loudnessLufs = -16`；`pnpm check` 与全量测试；文档收尾 |

## 2. 用户可见变化

- 全局音乐新增静音按钮；静音状态与剧场 BGM 按钮同步，刷新后保留。
- 语音说话时，全局音乐与剧场 BGM 都会自动压低到 35%，说完恢复；以前只有剧场 BGM 会压低。
- 进入小剧场会暂停全局音乐，返回主窗后恢复上一首与播放状态，不再需要手动点播放。
- 任意页面首次点击或按键后，语音、剧场 BGM 与音效统一解锁；被浏览器拦截时不弹错误。
- 剧场音效同时最多 2 个，避免连续换句时叠成噪音。

## 3. 内部改动

- 音频内核：`apps/web/src/features/audio/{types,constants,director,use-audio-director,index}.ts`；导演只持有状态，不创建播放器。
- 全局音乐：`use-music-audio-sink.ts` 负责 sink、背景互斥与解锁重试；`use-music-preferences.ts` 负责 localStorage 偏好与 sessionStorage 播放意图；`music-player.tsx` 保持 292 行。
- 小剧场：`TheaterBgm` 只保留 `setGain(gain)` 与淡入淡出；`useTheaterAudio` 注册 sink 并共享全局静音；`theater-sfx` 用 `tryPlaySfx/endSfx` 限流。
- 语音：`useVoicePlayback` 用 `useId` 作为来源 id 上报 `setVoiceActive`；卸载时清理来源，避免幽灵 duck。
- 解锁：新增 `app/audio-unlock.tsx` 挂到根布局；音乐、剧场音效、语音队列分别向导演注册解锁回调。
- 响度：`MusicTrack` 增加可选 `loudnessLufs`；内置 11 首全部 -16，导入曲目不做归一化。

## 4. 门禁结果

- 全量测试：9 个包 728 个测试文件 4147 项通过。
  - web 280 文件 1422 项；core 265 文件 1637 项；database 75 文件 283 项；desktop 33 文件 218 项。
  - shared 45 文件 400 项；ai 16 文件 86 项；voice 9 文件 85 项；config 4 文件 14 项；motion 1 文件 2 项。
- `pnpm check`：typecheck、lint、行数、结构、循环依赖、ASCII 全部通过。
- 迁移：无新增迁移，`LATEST_SCHEMA_VERSION = 51`；备份 schema 不变。

## 5. 已知限制

- 不做输出设备选择（`setSinkId`），仍跟随系统默认设备。
- 不把所有音频迁移到一条 WebAudio 图，也不加压缩器；各播放器仍保留自己的淡变与队列。
- 只登记内置曲库响度，不做运行时测量；导入曲目继续用相对音量。
- 全局音乐不进入语音队列，只共享 duck 与解锁；语音的取消与代际语义保持不变。
- 本版按发布决定不构建 exe 安装包，只发布源码与 tag；需要安装包时可单独执行 `pnpm release:win`。
- 真机音频验证与截图待补。

## 6. 发布物料清单

| 物料 | 状态 | 要点 |
|---|---|---|
| 发布说明（本文） | 完成 | 本版交付、门禁与限制 |
| 版本总结 | 完成 | [version-summary.md](./version-summary.md) |
| 技术博客 | 完成 | 10 篇归档至 `blog/v4.2/` |
| 安装包 | 按决定跳过 | 本版不构建 exe；源码与 tag 可复现 |
| 截图 | 待补 | 音乐静音按钮、剧场静音同步、语音 duck 真机表现 |

## 7. 更新公告（草稿）

> v4.2.0 来了。这一版把全局音乐、剧场 BGM、语音和音效收进一个音频导演：语音说话时背景乐自动压低到 35%，全局静音在音乐与剧场之间同步，进小剧场暂停音乐、返回后恢复播放。首次点击或按键统一解锁所有音频，剧场音效最多同时两个。内置曲库登记 -16 LUFS 响度基线；没有数据库迁移。

## 8. 复核方式

```powershell
pnpm check
pnpm test
git tag --points-at HEAD
```

本版不提供 exe 安装包，不需要校验 `SHA256SUMS.txt` / `build-info.json`。
