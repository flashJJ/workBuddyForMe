# 素材许可 / Asset License

## 代码

WorkBuddyForMe 源代码采用 **PolyForm Noncommercial License 1.0.0**（见根 `LICENSE`），仅限非商业用途，不提供任何担保。

## 内置角色 VRM（鲸鱼娘-雪团 / 运动健将-冉卡露丽 / 兔耳娘-菲比）

- 文件：
  - `apps/web/public/vrm/models/xuetuan.vrm`（鲸鱼娘-雪团）
  - `apps/web/public/vrm/models/rankaluli.vrm`（运动健将-冉卡露丽）
  - `apps/web/public/vrm/models/feibi.vrm`（兔耳娘-菲比）
- 作者：WorkBuddyForMe / flashJJ
- 随项目分发许可：三个内置模型统一采用 **CC BY-NC-SA 4.0**（<https://creativecommons.org/licenses/by-nc-sa/4.0/>）
- 允许：署名、非商业使用、复制、修改与再分发；衍生作品需注明修改并以相同许可分享。
- 禁止：任何商业用途。
- 三个模型均不适用 PolyForm Noncommercial License；随包分发的 VRM 文件内嵌 meta 已统一：`licenseName` = `CC_BY_NC_SA`、`allowedUserName` = `Everyone`、`commercialUssageName` / `sexualUssageName` / `violentUssageName` = `Disallow`，`otherLicenseUrl` 与 `reference` 均指向 CC BY-NC-SA 4.0 全文。可用 `node scripts/avatar/normalize-vrm-meta.mjs --check` 复核，`--write` 写入前会备份到 `.tmp/vrm-meta-backup/`。
- 修改说明（v3.0 S6）：分发的模型经 `apps/web/scripts/optimize-vrm.mjs` 做两步体积优化：(1) morph sparse 化（POSITION 零位移改为 sparse accessor），表情数量、名称、索引与 VRM 绑定保持不变；(2) 贴图重编码为 WebP —— 无 alpha 使用的 albedo 走有损 q90，五官 cutout 走无损，法线/matcap/mask 保留原图，原本内嵌的 base64 data URI 图片转为 bufferView；材质与贴图引用关系不变。原始未压缩模型保存在本地 `apps/web/assets-src/vrm/`（不入库），可随时重新生成。
- 雪团生成链路：AI Agent 按「蓝色大肥鱼」主题生成独立形象参考图 → Neural4D 付费会员图生 3D 得到原始高模 `白娘子_鲸尾.vrm`（仅本地制作源文件，不随项目分发）→ Blender/VRM Add-on 与 `optimize-vrm.mjs` 二次制作、压缩。Neural4D 付费方案明确生成结果可用于商业用途、平台不主张版权；需保留订阅凭证、生成时间与原始文件作为权属证据。溟月图集不作为生成输入。
- 说明：AI 生成内容的著作权认定因法域而异；本项目对二次制作、绑定、压缩与整合部分主张权利，分发时统一采用 CC BY-NC-SA 4.0。

## 第三方素材

Live2D 官方样本模型（Haru / Hiyori / Mark / Mao / Wanko）遵循各自 Sample Content License，声明见 `apps/web/src/features/avatar/ui/avatar-models.ts` 与设置页「关于」。

### CMU 动捕片段

- 文件：`apps/web/public/motions/cmu/*.vrma`（idle / stand / stretch / walk 四条，各 3 秒）
- 来源：CMU Graphics Lab Motion Capture Database（<http://mocap.cs.cmu.edu/>），数据库声明 **free for all uses**
- 致谢：*This data was created with the support of NSF EIA-0196217.*
- 加工：经 `scripts/motion/bvh-to-vrma.mjs` 转换（30fps 取段、静息对齐、锁朝向、脚底贴地），仅保留骨骼旋转，不含原始 BVH
- 说明：仅作为动作素材归档，不自动进入运行时动作池；详见 `apps/web/public/motions/cmu/README.md`

### 剧场背景（S3）

- 实现：`apps/web/src/features/stage/theater/theater-backdrop.tsx`
- 来源：项目自建，纯 CSS 渐变绘制后墙暖光、聚光灯、地面光池、木地板、侧幕/檐幕与暗角
- 素材：不含任何外部图片、纹理或音频文件，不引入第三方许可

### 剧场音乐与音效（M4）

- 实现：`theater/theater-bgm.ts`（背景乐）与 `theater/theater-sfx.ts`（幕布/换句提示音）
- 背景乐：复用「应用背景音乐」中的 4 首 CC0 曲目，按剧集类型标签或幕配置切换；说话时 duck 到 35%，换幕淡出旧曲再淡入新曲——`warm` → `theme-warm.mp3`，`playful` → `theme-playful.mp3`，`tense` → `theme-tense.mp3`，`melancholy` → `theme-melancholy.mp3`
- 音效：项目用 WebAudio 振荡器与噪声程序化合成，**不包含任何第三方音频文件**
- 后续替换或新增外部素材的规则（若使用 CC0/免版税曲目或豆包生成素材）：
  - 文件统一放 `apps/web/public/audio/theater/`，按 `<mood>-<variant>.mp3/ogg` 命名，并在本清单逐条登记来源、许可、署名要求与获取日期
  - Pixabay Music 采用 Pixabay License，允许商用且通常无需署名，但禁止把音乐作为独立素材再分发；需逐曲确认页面许可
  - Free Music Archive 逐曲许可不同（CC BY / BY-NC / CC0 等），必须逐首核对，不能只看站点总声明
  - Musopen 需同时确认「作曲」与「演奏录音」都处于公共领域或可用 CC 许可
  - 豆包 App 生成内容：仅限个人学习娱乐，无商用与再分发授权，不可作为发布版素材；火山引擎方舟 API 是另一套条款，需单独核对并保存记录
  - 任何外部音频都不得改变项目「非商业」代码许可的边界；含 NC 限制的曲目只允许在非商业发行中使用

### 应用背景音乐（v3.0 音乐模块）

- 实现：`apps/web/src/features/music/`（全局播放器、主题曲轮播、导入曲库、氛围清单）
- 来源：**OpenGameArt.org**，11 首内置曲目全部为 **CC0 1.0**（公共领域贡献）；允许商用、修改与再分发，无需署名。
- 与代码 / 角色模型许可的关系：背景音乐独立授权，**不适用** PolyForm Noncommercial License 与 CC BY-NC-SA 4.0；CC0 曲目可随项目与安装包分发，不改变代码与角色的非商业限制。
- 已接入文件（`apps/web/public/audio/music/`）：

| 文件 | 曲目 | 作者 | 时长 | 用途 |
|---|---|---|---|---|
| `theme-song-1.mp3` | The Field of Dreams | pauliuw | 1:25 | 主题曲轮播 |
| `theme-song-2.mp3` | Determination | artisticdude | 3:40 | 主题曲轮播 |
| `theme-song-3.mp3` | Tower Defense Theme | DST | 3:19 | 主题曲轮播 |
| `theme-warm.mp3` | A New Town | The Cynic Project (cynicmusic) | 1:02 | 温暖日常 |
| `theme-warm-romance.mp3` | A Secret to Tell You | Deeppixel | 0:51 | 温暖浪漫 |
| `theme-calm.mp3` | Meadow Thoughts | Ecrivain | 2:30 | 深夜安静 |
| `theme-playful.mp3` | Magic Town | controllerhead | 0:56 | 轻快俏皮 |
| `theme-playful-burst.mp3` | Adventure Time | Scribe | 1:26 | 轻快活力 |
| `theme-melancholy.mp3` | At the End of Hope | Emma_MA | 3:03 | 忧郁抒情 |
| `theme-tense.mp3` | Unsolved Investigation | isaiah658 | 0:48 | 悬疑紧张 |
| `theme-focus.mp3` | Lifewave 2k | The Cynic Project (cynicmusic) | 3:07 | 专注工作 |

- 来源页（逐曲）：
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
- 处理方式：原始 MP3 / OGG / WAV 统一转 MP3 192kbps 44.1kHz 立体声，并做 -16 LUFS 响度归一；11 首合计约 30.4MB。
- 旧批次说明：此前的 9 首豆包 App 生成曲目已从 `public/audio/music/` 替换，仅在本机 `.tmp/personal-music/` 留档（`.tmp/` 已被忽略），不随仓库或安装包分发；如另行使用，仍受“个人学习娱乐、不可商用与再分发”限制。
- 导入歌曲保存在本机 IndexedDB，不上传服务器；删除歌曲时只移除本地记录。
- 后续替换 / 导入约定：只接受可分发许可（CC0、CC BY、付费商用授权等），逐曲登记来源 URL、作者、协议与获取日期；不要使用豆包 App 输出作为发布素材。
- 若使用 Pixabay / Free Music Archive / Musopen 素材：逐曲核对许可（Pixabay License 允许商用但禁止独立再分发；FMA 逐曲许可不同；Musopen 需同时确认作曲与录音权利）。

### 道具 GLB（S2）

- 文件：`apps/web/public/props/teacup.glb`、`bowl.glb`、`book.glb`、`table.glb`
- 来源：项目自建，由 `scripts/avatar/generate-props.mjs` 用 three.js 几何程序化生成
- 许可：**CC0-1.0**（公共领域贡献，无需署名）；不适用项目的 PolyForm Noncommercial License
- 规格：低模纯色、Y 轴向上、单位米；茶杯原点在杯心、碗原点在碗底中心、书原点在书心、桌子原点在底部中心；单文件 4.1–15.6 KB
- 替换：外部 CC0 GLB 可直接覆盖同名文件；若改 id/路径/原点/尺度，同步更新 `apps/web/src/features/avatar/vrm/props/prop-manifest.ts` 与本清单
