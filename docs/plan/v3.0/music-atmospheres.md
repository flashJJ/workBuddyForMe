# 背景音乐曲库与氛围清单

> 内置 11 首 **CC0 1.0** 曲目，全部来自 OpenGameArt.org，已转为 MP3 192kbps
> 放入 `apps/web/public/audio/music/`；设置页「音乐与背景声」可试听、轮播主题曲或导入自己的歌曲。

## 1. 已接入曲目

| 文件名 | 曲目 | 作者 | 情绪 | 时长 | 用途 |
|---|---|---|---|---|---|
| `theme-song-1.mp3` | The Field of Dreams | pauliuw | 史诗开场 | 1:25 | 主题曲轮播 |
| `theme-song-2.mp3` | Determination | artisticdude | 史诗开场 | 3:40 | 主题曲轮播 |
| `theme-song-3.mp3` | Tower Defense Theme | DST | 史诗开场 | 3:19 | 主题曲轮播 |
| `theme-warm.mp3` | A New Town | The Cynic Project | 温暖日常 | 1:02 | 日常、主界面、小剧场 warm |
| `theme-warm-romance.mp3` | A Secret to Tell You | Deeppixel | 温暖浪漫 | 0:51 | 暧昧、低语 |
| `theme-calm.mp3` | Meadow Thoughts | Ecrivain | 深夜安静 | 2:30 | 深夜、阅读 |
| `theme-playful.mp3` | Magic Town | controllerhead | 轻快俏皮 | 0:56 | 喜剧、摸鱼、小剧场 playful |
| `theme-playful-burst.mp3` | Adventure Time | Scribe | 轻快活力 | 1:26 | 冒险、活跃提示 |
| `theme-melancholy.mp3` | At the End of Hope | Emma_MA | 忧郁抒情 | 3:03 | 雨夜、悲剧、小剧场 melancholy |
| `theme-tense.mp3` | Unsolved Investigation | isaiah658 | 悬疑紧张 | 0:48 | 调查、悬念、小剧场 tense |
| `theme-focus.mp3` | Lifewave 2k | The Cynic Project | 专注工作 | 3:07 | 写代码、长任务 |

## 2. 主题曲轮播

- 在主题曲组内点任意一首播放，上一首/下一首、自动结束都会在三首之间循环。
- 设置页「轮播主题曲」从第一首开始；迷你播放器副标题显示「主题曲 n/3」。
- 默认列表循环；切到「不循环」时播完第三首停止。

## 2.1 剧场背景乐

- `stage/theater/theater-bgm.ts` 复用 4 首氛围曲作为小剧场背景乐：`warm` → `theme-warm`，`playful` → `theme-playful`，`tense` → `theme-tense`，`melancholy` → `theme-melancholy`。
- 进入剧场淡入到音量 0.3；说话时压到 35%（约 0.105）；换幕先淡出旧曲再淡入新曲；暂停、静音、切后台或离开立即淡出。
- 舞台路由随主布局卸载全局播放器，剧场内只会有这一路 BGM，不会叠音。

## 3. 转码口径

- 原始文件来自 OpenGameArt，格式为 MP3 / OGG / WAV，时长 0:48–3:40。
- 统一转 MP3 192kbps 44.1kHz 立体声，并做 `loudnorm -16 LUFS` 响度归一；11 首合计约 **30.4MB**。
- 未做裁剪；短循环曲（如 `theme-tense`）由播放器循环播放。

## 4. 来源页

- `theme-song-1`：<https://opengameart.org/content/the-field-of-dreams>
- `theme-song-2`：<https://opengameart.org/content/determination>
- `theme-song-3`：<https://opengameart.org/content/tower-defense-theme>
- `theme-warm`：<https://opengameart.org/content/a-new-town-rpg-theme>
- `theme-warm-romance`：<https://opengameart.org/content/a-secret-to-tell-you-mp3>
- `theme-calm`：<https://opengameart.org/content/meadow-thoughts>
- `theme-playful`：<https://opengameart.org/content/magic-town>
- `theme-playful-burst`：<https://opengameart.org/content/adventure-time>
- `theme-melancholy`：<https://opengameart.org/content/at-the-end-of-hope>
- `theme-tense`：<https://opengameart.org/content/unsolved-investigation>
- `theme-focus`：<https://opengameart.org/content/calm-ambient-3-lifewave-2k>

## 5. 许可与记录

- 11 首均为 **CC0 1.0**（公共领域贡献）：允许商用、修改、再分发，无需署名。
- 与代码 / 角色模型许可独立：不适用 PolyForm Noncommercial License 与 CC BY-NC-SA 4.0。
- 此前的 9 首豆包 App 生成曲目已从发布目录替换，仅在本机 `.tmp/personal-music/` 留档；豆包 App 输出仍只能个人学习娱乐，不可商用或再分发。
- 后续替换 / 导入只接受可分发许可（CC0、CC BY、付费商用授权等），逐曲登记来源、作者、协议与获取日期；详细清单见 `ASSETS-LICENSE.md`。
- 氛围生成提示词保留在设置页与 `apps/web/src/features/music/music-atmospheres.ts`，仅作为后续自制或生成素材的参考，不用于豆包 App 输出发布。

## 6. 自检

1. 打开「设置 → 音乐与背景声」，确认主题曲 3 首、氛围音乐 8 首，且不再显示「待生成」。
2. 每首曲目旁应显示绿色「CC0」徽标，顶部提示为 CC0 可分发说明。
3. 播放主题曲，等第一首结束，确认自动切到第二首并在三首内循环。
4. 播放任意氛围曲，检查进度、音量、上一首/下一首、列表循环。
5. 刷新页面，确认当前曲目与音量被记住（不自动播放）。
6. 进入舞台页面，确认全局播放器随主布局卸载；打开小剧场后播放对应情绪的 CC0 背景乐，说话时音量变低、暂停后停止。
