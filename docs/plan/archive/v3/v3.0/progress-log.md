# v3.0 进度与决策留痕

> 用途：每次推进都留下“做了什么、为什么、结果、下一步”，避免只靠聊天记录追踪。
> 关联：[执行路线](./execution-roadmap.md)、[阶段表](./README.md#7-阶段拆分)。

## 记录规则

1. 每个任务完成后追加一条工作日志：日期、阶段、任务、结果、文件/提交、指标、遗留。
2. 影响范围或方向的选择写入决策日志：背景、选项、选择、原因、待复核点。
3. 性能/体积等数字必须写口径与来源；未实测的标注“待实测”。
4. 计划变更先改 `execution-roadmap.md`，再在本文件记录变更原因。
5. 每个 Gate 通过时更新“当前状态”；未通过不提前标记完成。

## 当前状态

| 阶段 | 状态 | 最近更新 |
|---|---|---|
| P0 基线收尾 | 进行中（binding 入仓 + 家族校验完成；T0.9 采样脚本就绪待跑） | 2026-11-12 |
| P1 M0d-A 能力解锁 | 进行中（T2.1–T2.4 完成） | 2026-11-11 |
| P2 M0d-B 内容做厚 | 完成（L2 15 / L3 10） | 2026-11-11 |
| P3 M0d-C 剧本接线 | 完成（4 场戏已接线 + 台词池） | 2026-11-12 |
| P4 M0b 运行时补齐 | 完成（热替换/回收/Q 版，真机验收通过） | 2026-11-12 |
| P5 M1/M2 | M1 完成；M2 放弃，转向动效库深化 | 2026-11-12 |
| P6 M3/M4/M5 | 完成（M3 声线/画像/Utility；M4 小剧场/分享；M5 门禁与 3.0.0） | 2026-11-14 |
| P7 插件化 | 方案完成 | 2026-11-11 |
| P8.8 主动播放 | 完成（预算/空闲/勿扰/去重已接线） | 2026-11-14 |
| P9 设置页 IA | 完成（P0 注册表/搜索/深链/命令面板；P1 常用入口） | 2026-11-14 |

## 决策日志

| 编号 | 日期 | 决策 | 原因 | 待复核 |
|---|---|---|---|---|
| D1 | 2026-11-11 | 代码许可改为 PolyForm Noncommercial 1.0.0；雪团模型 CC BY-NC-SA 4.0 | 用户要求禁止商用；代码与美术素材分别适用不同协议 | 正式发布前法务口径 |
| D2 | 2026-11-11 | 内置雪团 VRM 作为新用户默认形象 | 避免用户导入；静态资源随包分发 | 安装包体积 |
| D3 | 2026-11-11 | AnimeArt 模型按“家族模板”处理：同骨架 + 同面部 morph + 共享 binding | 6 个模型 49/49 骨骼、rest 0° 差、118 morph、18 表情索引一致 | 100 个非标准 morph 的语义顺序需抽查 |
| D4 | 2026-11-11 | 动效库升级先做执行器（morph/look/expression），再做内容 | 轨道已定义但未执行，是当前瓶颈 | 无 |
| D5 | 2026-11-11 | 正式 cast 暂定雪团；小白鲸/海豚先做回归 cast，不入正式名单 | 用户暂未选角色；先用 2 个模型验证可移植性 | M1 角色评审 |
| D6 | 2026-11-11 | 测试模型保留 Animeit/CC0，仅内部测试；正式入项目再改许可 | 避免过早改元数据；当前只做技术验证 | M1 角色评审 |
| D7 | 2026-11-11 | P4（Q 版）与 P2/P3 并行；P7 插件化等 P3 后 | 避免阻塞内容主线；契约稳定后再拆包 | P3 结束后复核 |
| D8 | 2026-11-11 | 模型体积暂按 25–32MB 可接受，正式角色目标 ≤20–25MB | 精简后仍超 20MB；先保观感，后续做贴图压缩 | P2 资产评审 |
| D9 | 2026-11-11 | 自然垂手由程序化手指微屈保证；姿势/动作约束集中到 `13-human-pose-reference.md` | 手指笔直像站军姿；后续内容扩容需要统一的人体约束参考 | 握拳/手势动作接入时复核角度 |
| D10 | 2026-11-11 | 手部拆成 L1 手型（放松/握拳/摊开）+ L2 动作集（fidget）+ 待机程序化调用，左右错峰 3.2s | 手臂静止像木偶；同步双手动作像机械爪 | 行为自带手部轨道时需跳过程序化调用 |
| D11 | 2026-11-11 | 运行时坚持 VRM humanoid + 数据驱动姿势；SMPL-X/mink/Kimodo/AMASS 只作离线参考，不进客户端 | 本地 Electron 无法承载 Python/MuJoCo/大模型依赖；SMPL-X/AMASS 还有许可与体积问题 | 需要 BVH 导入或端点 IK 时再评估 |
| D12 | 2026-11-11 | 四肢端点用两骨解析 IK（纯 TS）；不换 Mixamo 骨架，FABRIK/CCD 按需再引入 | VRM 表情/SpringBone/材质绑定 humanoid，换骨架成本高；两骨解析零迭代、足够实时 | 抓取/坐窗沿真正接入时复核极点与权重 |
| D13 | 2026-11-11 | 离线动作管线用纯 Node 的 BVH→VRMA 转换器；Mixamo 只作 BVH 来源 | 运行时不引入 Python/Blender 依赖；输出直接兼容现有 VRMA 动作池 | A-pose/根位移/未映射关节需人工复核 |
| D16 | 2026-11-12 | 放弃宠物养成（M2 投喂/五维/成长），本期改为动效库能力深化与内容扩容 | 用户决定：养成链路收益低于动效库；先把表现力做扎实 | 后续如需养成另行评审 |
| D14 | 2026-11-11 | 动作来源不依赖 Mixamo 官网；优先 Blender Mixamo Rig / CMU / ActorCore 等，任意 BVH 用 `--bone-map` | 国内无法直连 Mixamo；转换器只需骨骼名映射，链路与 IK/ROM 不变 | 第三方动作包仅内部使用，不二次分发 |
| D15 | 2026-11-11 | 开源基线选 CMU（明确可商用）；LaFAN1/Bandai/SFU/NUS 等 NC 数据只做本地实验；入库统一 `--fps 30 --range` 截 2–4s | CMU 是唯一查到既开源又允许商用的 BVH 库；长片段与 120fps 不适合宠物场景 | CMU 无手指与锁骨，手部由 L1/L2 组件补齐 |
| D17 | 2026-11-13 | 新增 P8「AI 剧情推进器」：AI 生成受限 schema 剧本，引擎负责演出；不做运行时逐帧动作生成 | 堆几百个手写动画不可持续；LLM 只出意图与编排，动作必须落在已注册原语白名单，才能保证不穿模、不抽搐 | P8 启动前需先完成 P8.1 schema 与校验 |
| D18 | 2026-11-14 | 设置页走「注册表 + 页内搜索 + 深链 + 命令面板」，暂不做两级 IA 重做 | 37 个面板仍在单页可控范围；搜索是收益最高的一步，注册表也为后续渐进披露/常用置顶留好数据基础 | 面板数翻倍或搜索命中率不足时再评估两级导航 |
| D19 | 2026-11-14 | M3 Utility 采用「硬门控 → 纯函数打分 → 设置页最近决策」；首批输入时段/心情、关系等级、工作信号、空闲与去重；先主动播放、后触发键与低语 | 现有 Director 的冷却/优先级/预算已可靠，缺的是合法候选之间的排序与可解释性；先做小闭环，避免一次性重写触发链路 | 真机调权重后再定是否进入阶段 2 |
| D20 | 2026-11-14 | M3 Utility 阶段 1 落地口径：只替换 P8.8 主动播放选场；权重 0.20/0.15/0.15/0.20/0.15/0.15；只记录实际开演，拒绝候选仅 dev；存 20 条展示 5 条；去重先按最近道具，theme/tags 留阶段 2 | 阶段 1 不依赖生成队列新增元数据即可闭环；先验证打分是否符合直觉，再统一触发键与低语，避免一次改太多选择链路 | 真机对比忙碌/深夜/关系变化下的排序，再调权重 |
| D21 | 2026-11-14 | Utility 阶段 2 先接触发键候选排序；环境低语只加「工作忙静默」，不引入池间打分 | 触发键已有 Scene 特征可直接复用阶段 1 打分；低语池没有场景元数据，硬造候选会产生伪精度 | 低语池补主题/风格元数据后再评估 |
| D22 | 2026-11-14 | 阶段 3 的 theme/tags 去重按 `recentSceneIds` 排除候选自身；弱偏好只做小幅加分且非法即丢弃 | 生成场景生成时就进入 recent，不排除自身会把「自己的主题/标签」误判成重复；弱偏好必须 fail-open，不能反向卡住场次 | 模型稳定输出偏好后复核权重 |
| D23 | 2026-11-15 | 三个内置 VRM（雪团 / 冉卡露丽 / 菲比）统一 CC BY-NC-SA 4.0、作者 WorkBuddyForMe / flashJJ、禁商用、衍生同协议；D6 的 AnimeArt/CC0 仅适用于未入内置名单的测试模型 | 用户确认三者同一授权口径；此前文档多处只写雪团、roadmap 仍把「测试模型许可」列为待确认，读起来像三套授权 | 已按 `CC_BY_NC_SA` 规范化，三模型 meta 同步；后续换模型复用 `normalize-vrm-meta.mjs --check` |
| D24 | 2026-11-15 | 雪团来源口径：参考「蓝色大肥鱼」主题 → AI Agent 独立生成形象参考图 → Neural4D 付费会员图生 3D → 项目二次制作与压缩；不把溟月图集作为生成输入 | 用户澄清实际生成链路；此前 README 把「形象源头」写成溟月，容易被理解为直接二创 | 保留 Neural4D 订阅凭证、生成时间与原始文件；如后续发现参考图含溟月元素，需按 CC BY-NC-SA 复核 |

## 工作日志

### 2026-11-14 预研：项目级插件化可行性

- 背景：对照 DSH/Cordis 微内核方案，评估本项目插件化的适用性、仓库策略与能力接入改造。
- 盘点：已有能力包（六类 effect + 签名/健康/升级预检）、MCP 全链路、provider 适配器、工具运行时、内容/模组包服务；缺口是统一插件契约、依赖拓扑、运行时内容注入、能力发现。
- 候选结论（待评审）：不搬 Cordis 微内核；保留 monorepo；走「能力包 + 服务提供者 + MCP 桥」三线；不做运行时代码插件。
- 产出：[05-plugin-architecture.md](../../../../roadmap/scheduled/v3.1-05-plugin-architecture.md)，含 S1–S6 预研 spike 与验收口径（已排期 v3.1 的 S1/S3）。
- 关联：P7 插件化。

### 2026-11-14 M3 Utility 阶段 3（生成场景 theme/tags 与弱偏好）

- 元数据：生成队列视图新增 `sceneMeta`（sceneId → theme/tags/moods/hours），由剧情状态 `recent` 回填；`recentSceneIds` 与 `recentThemes` 对齐，打分时排除候选自身，避免「自己的主题匹配自己」。
- 打分：去重惩罚真正计入总分（道具/主题/梗 + 长场景），修复阶段 1 只写理由不改分数的问题；新增 `dedupe:theme` / `dedupe:tag` / `pref:hour` / `pref:mood`，弱偏好只做小幅加分。
- 生成：`story.moods`（最多 2 个）与 `story.hours`（最多 1 段）为可选弱提示，提示词规则 15；非法/缺失由 zod catch 丢弃，不影响场次校验；剧情 `recent` 持久化提示。
- 验证：utility 12 项、parse 9 项及 service/story/scheduler/settings 等 48 项通过；web/shared typecheck、eslint、行数/结构/循环/ASCII 门禁通过；真机 `recentSceneIds`/`sceneMeta` 返回正常，主动播放 `gen.raised-hand-question`（plays 2→3），理由为道具重复 -0.12 / 今日未播 +0.075 / 空闲陪伴 +0.07 / 场景偏长 -0.06 / 工作时段 -0.02，未出现自身主题/标签去重。
- 遗留：模型不一定输出弱偏好（本次未输出，属可选）；标签去重只在最近 5 场内且 sceneMeta 可见时生效。

### 2026-11-14 M3 Utility 阶段 2（触发键候选排序 + 低语忙碌静默）

- 排序：`utility/trigger.ts` 把同触发键的 Scene 特征交给同一打分器；同分候选在最高分组内沿用轮换游标，低分候选只在高分候选被冷却/门控拒绝时兜底。
- 触发接线：`useScriptDirector` 新增 `decisionContext` 取值器，桌宠传入工作信号与最近道具；实际开演后以 `source: 'trigger'` 上报分数、理由与粗粒度上下文。
- 低语：`usePetAmbientTalk` 新增 `work` 参数，工作信号为忙时不开口；池选择仍按深夜/久无互动/日常，完整池间打分留待候选元数据。
- 验证：utility 8 项、ambient 9 项、director 10 项、settings/decisions 6 项通过；script+pet+settings 37 文件 221 项、shared i18n 35 项通过；web typecheck、eslint、行数/结构/循环/ASCII 门禁通过；真机（`WBFM_PET_SCRIPT=1`）点击身体触发 `touch.body-tap`，决策记录 `source=trigger`、score 0.7（今日未播 +0.075 / 工作时段 +0.07），无页面错误。
- 遗留：低语只有忙碌静默，没有池间打分；生成场景 theme/tags 仍未进入排序；触发决策会占用最近决策名额，后续观察是否需要过滤。

### 2026-11-14 M3 Utility 阶段 1（主动播放选场 + 最近决策）

- 契约：shared 新增 `script/decision.ts`（来源、工作状态、11 个理由码、上下文、记录/上报 schema；存 20 / 展示 5 / 单条最多 6 个理由）。
- 打分：新增 `script/utility/`（`score.ts` / `select.ts` / `types.ts`）：时段 0.20、心情 0.15、关系 0.15、工作信号 0.20、空闲与打扰成本 0.15、新鲜度 0.15；先过滤已播，再排序，平局按「上次播放 → sceneId」保证确定性；阶段 1 用道具去重（`dedupe:prop`），theme/tags 留阶段 2。
- 接入：桌宠把关系等级、心情、工作信号（`workView.base` → idle/busy/unknown）与最近道具传入 `usePetProactivePlayback`；claim 成功且真正开演后才上报决策，上报失败静默。
- 服务/界面：`generation/decisions/` 负责裁剪与标题回填（gen.* 查剧情日记），新增 `GET/POST /api/pet/script/decisions`；设置页「AI 日常剧情」新增「最近决策」区块（时间、标题、来源、得分、理由 chips），中英文案与空态齐全。
- 验证：utility 6 项、decisions 3 项、设置组件 2 项通过；script+pet+settings 37 文件 218 项、shared i18n 35 项通过；web typecheck、eslint、行数/结构/循环/ASCII 门禁通过；真机（`WBFM_PET_SCRIPT=1`）静置 1 分钟自动开演 `gen.flight-pause`，plays 1→2/3，决策记录 score 0.538（道具重复 -0.12 / 今日未播 +0.075 / 空闲陪伴 +0.07 / 场景偏长 -0.06 / 工作时段 -0.02），设置页「最近决策」滚动到可见区域后显示标题、来源、得分与理由，无页面错误。
- 说明：设置页沿用 `useVisibleQuery`，面板滚动进入视口后才会请求决策接口；未滚动时显示空态属预期。
- 遗留：首场观察显示道具重复惩罚偏高（-0.12），阶段 2 前用更多样本复核权重；触发键候选与环境低语仍未接入。

### 2026-11-14 M3 Utility 决策层方案

- 产出：[14-utility-decision.md](./pet-engine/14-utility-decision.md)（方案稿，未改代码）。
- 边界：硬门控（勿扰/睡眠/busy/冷却/预算/关系/已播）仍是唯一否决权；Utility 只在合法候选间排序，纯函数、无额外 rAF、无运行时 LLM。
- 输入：时段与心情、关系等级、工作信号（仅粗粒度 idle/busy/away）、空闲时长、最近播放/主题/道具去重；权重表 0.20/0.15/0.15/0.20/0.15/0.15。
- 可解释性：每次实际开演生成 `DecisionRecord`（场景、来源、总分、理由码、粗粒度上下文），`settings_kv` 保留 20 条，设置页「AI 日常剧情」展示最近 5 条；被门控/claim 拒绝的候选只进 dev 日志。
- 分阶段：阶段 1 只替换 P8.8 主动播放选场并落地记录/设置页；阶段 2 再统一触发键候选与环境低语，并补候选 theme/tags 与可选软偏好；阶段 3 让生成器输出弱偏好提示。
- 下一步：评审权重与设置页展示口径，通过后按 M3-U1–U3 实施。

### 2026-11-14 M3 用户画像注入剧本生成

- 背景：M3 的「称呼/忌口/作息入记忆」此前只在对话回合注入，后台生成的剧本看不到用户画像，容易出现与用户无关的通用剧情。
- 实现：新增子域 `generation/profile/`（`selectProfileMemories` / `profileContextForPrompt`）：只取 active 的 constraint/fact/preference/relationship，置顶优先、其次重要度，最多 8 条、480 字；提示词新增「用户画像」背景块与规则 14（自然称呼、避开忌口、尊重作息，不复述隐私）。
- 装配：`createPetScriptServer` 用 `createMemoryRepository(db).list({ status: 'active', limit: 40 })` 提供画像，读取失败静默降级为「按普通用户处理」，不阻断生成；自动生成仍默认关闭，画像只在用户开启生成后随提示词发送。
- 验证：profile 4 项 + generation 10 文件 63 项通过；web typecheck、行数/结构/循环/ASCII 门禁通过。
- 遗留：M3 的 Utility 决策未做；画像命中率需在真实记忆库上观察（当前只做类型与置顶/重要度筛选，未按剧本主题召回）。

### 2026-11-14 真机验收（P9 深链 / P8.8 主动播放 / 长剧本收尾）

- 环境：`WBFM_PET_SCRIPT=1` + `pnpm dev:desktop`（42337/42338），CDP 驱动真实 Electron 窗口。
- P9：桌宠调 `focusMain('/settings#panel-script-schedule')`，同页深链 panel 11ms、高亮 188ms、常用入口芯片 11ms；跨页（/chat → /settings）panel 1156ms、高亮与芯片 1359ms；搜索「主动播放」唯一命中，空关键词显示空态，置顶写入 localStorage 且刷新后保留。
- P8.8：设置空闲阈值 1 分钟后重开桌宠，约 90 秒后自动 claim 并演出 `gen.morning-note-tap`，`playsToday 1/3`；场景持续约 149 秒后 `active` 清空，资源 25 geometries / 50 textures / 6 programs，无残留。
- 预算门：实机 API 依次验证勿扰（`quiet-hours`）、每日 0 场（`disabled`）、当日已播（`duplicate`），三种情况均不扣预算；验收后已还原勿扰时段与 idleMinutes。
- 说明：搜索「备份」会命中所属分组「数据与备份」下的全部面板，属注册表按分组名匹配的预期行为，不是回归。

### 2026-11-14 P9 设置页信息架构（注册表 + 搜索 + 深链 + 命令面板）

- 注册表：新增 `lib/settings/catalog.ts`（纯数据：11 个分组、37 个面板的 id / i18n key / 中英别名）与 `features/settings/base/settings-registry.tsx`（id → 面板节点映射）；设置页不再手写面板数组，导航、搜索、深链、命令面板共用一份元数据。放在 `lib` 是为了避开跨 feature 深引用门禁，也避免命令面板把面板组件打进主布局包。
- 搜索：顶部输入框按标题、描述、中英别名和分组名分词匹配（全部词命中），命中后只渲染匹配面板，显示结果数；空结果显示引导与清除按钮；每个面板包 `#panel-*` 锚点与 `settings-panel-*` testid。
- 深链：`#panel-*` 首帧与 `hashchange` 都会清空搜索并滚动定位，目标面板短暂高亮 2.4s；`#setting-*` 分组锚点保留。
- 命令面板：设置分组新增 11 条分组跳转命令，供应商 / 主题 / 关于 / 新建角色卡改为深链到具体面板；已在设置页时只改 hash，由页面监听滚动。
- 验证：`catalog` 5 项、settings 6 项、shared i18n 35 项通过；shared/web typecheck、行数/结构/循环/ascii 门禁通过；浏览器实测搜索「备份」只保留备份面板、清除后恢复、`#panel-backup` 滚动并出现 ring 高亮。
- 遗留（P1 backlog）：常用配置置顶、快速设置折叠区、从对话/桌宠页就地跳到对应面板。

### 2026-11-13 P8.7 打扰预算（勿扰时段门控）

- 调度：tick 在到期判定前读取 AppSettings 的勿扰配置（默认开启 23:00–06:00）；命中时段直接返回 `quiet-hours`，不写 `runsToday`、不调用生成器，醒来后下一个整点心跳再触发。
- 判定：`isQuietHour` 支持跨午夜、同日关闭与同起止；`quietHoursFrom` 对缺失字段按默认 23–6、显式关闭才放行；手动生成/试演不走该门控。
- 验证：schedule 7 项、scheduler 6 项、设置面板 1 项、shared i18n parity 3 项通过；web/shared typecheck 与行数/结构/循环/ascii 门禁通过。
- 下一步：P8.8 生成剧本的主动播放（空闲 + 非勿扰 + 每日主动场次上限 + 播放去重），以及 P8.6 长剧本真机复验（需 AI 额度）。

### 2026-11-13 每日次数范围扩到 0–24

- 设置：每日次数下拉从 1–8 扩到 0–24，默认仍 5；0 表示不生成，到期判定直接不成立。
- 校验：schema 与 `normalizePerDay` 同步放宽到 0–24，越界仍夹取。
- 验证：schedule 测试补充 0 次与负值归零用例。

### 2026-11-13 P8.6 间隔调度 + 回顾保留设置

- 调度：每日窗口改为间隔机制——启动时检查一次、之后每小时心跳一次，距上次运行满 30 分钟且当天次数未用尽才触发；每日次数默认 5（设置页可配），仍是当天上限；跨天保留开关与次数并清零今日进度。
- 保留：剧情日记保留天数移入设置页「AI 日常剧情」（默认永久，可选 7/30/90/365 天），改动即按新保留期裁剪旧记录；`/journal` 日期选择器不再限制最近 14 天。
- 验证：schedule/scheduler/journal/设置面板/回顾页共 19 项、shared i18n parity 3 项通过；web/shared typecheck、行数/结构/循环/ascii 门禁通过。
- 遗留：长剧本尚未用真机 3 分钟完整跑完（今日 AI 额度剩 1 次，未再生成）；台词池重复仅提示词约束，待下次生成复验。

### 2026-11-13 P8.6 设置页开关 + 持物/行为仲裁

- 设置：新增「AI 日常剧情」面板，读取 `GET /api/pet/script` 的 schedule 摘要，勾选即 `POST /api/pet/script/schedule`；每日次数可配 1–8、默认 5（1 次固定 10 点，2 次沿用 10/16 点，其余按 9–22 点均分窗口）；乐观更新 + 失败回滚，dev 面板保留快捷入口。
- 回顾：`/journal` 增加日期选择器（限最近 14 天），保留前后一天与「今天」快捷回到当天。
- 仲裁：道具持握不再无条件覆盖整条右臂；行为已占用右臂时只补 `pose.hand-right-cup-hold` 手指握型，托腮/伏案等行为不会被茶杯/手机盖回去。
- 验证：web 250 文件 1269 项、shared i18n/schema 301 项通过；typecheck、行数/结构/循环/ascii 门禁通过；浏览器实测 `/settings` 每日次数 5→3→5 可持久化、`/journal` 日期选择与「今天」正常。
- 遗留：长剧本尚未用真机 3 分钟完整跑完（今日 AI 额度剩 1 次，未再生成）；台词池重复仅提示词约束，待下次生成复验。

### 2026-11-13 P8.6 日常回顾页

- 数据：新增 `generation/journal.ts`，settings_kv 单键 `pet-script.journal` 记录生成场景的标题/主题/触发键/来源（auto|manual）；播放上报按 sceneId 累加次数与最近播放时间；保留 14 天或 200 条，坏数据逐条丢弃。
- 服务：生成成功即写日记（调度传 `source: 'auto'`，手动接口缺省 `manual`）；新增 `GET/POST /api/pet/script/journal`，POST 只接受 `gen.*` 场景，未记录或已过期直接忽略。
- 前端：`useScriptDirector` 在场景真正开播后静默上报（失败不阻塞表演）；新增 `/journal` 页与侧栏「日常回顾」，按天展示「生成 N 段 / 已播放 M 段」和逐条时间线，支持前后一天切换与空态引导。
- 验证：journal 5 项、页面 2 项新增用例通过；web 247 个测试文件、shared 385 项全过；typecheck、行数/结构/循环门禁通过。
- 下一步：长剧本真机复验；台词池重复规则复验。

### 2026-11-13 P8.6 长剧本 + 每日时事 + 额度扩容

- 长度：生成契约改为 60–180 秒（8–80 beats、至少 3 条台词、允许 wait 停顿）；校验拒绝过短/过长/beat 不足；cooldown 收紧到 2–30 分钟。
- 时事：新增 `generation/topics/`；每日话题优先百度热搜（更贴近当天），失败/为空时退回设置里的联网搜索（SearXNG/Brave/Tavily）；按生活/科技/文娱/天气/交通白名单过滤，同日缓存、失败 30 分钟后重试；标题以「今日时事」注入 user prompt，规则要求轻量影射不复述原文。
- 搜索：本机 SearXNG（127.0.0.1:42390，容器 `wbfm-searxng`，支持自定义端口）已写入设置，`/api/search/test` 返回可用；SearXNG provider 补 `time_range`，让 freshness 真正生效。
- 额度：每日调用 3→8、估算 token 20k→60k、队列 6→10。
- 验证：generation 42 项（含 topics 7 项）、shared 385 项通过；结构/行数门禁通过；真机生成 `gen.cool-down-wardrobe`（22 beats / 90 秒 / 6 句台词 / 3 次停顿，源自热搜「大回暖后迎大降温」），19 个非 wait cue 全部执行，结束无残留、无控制台错误。
- 备注：Bing News RSS 在 Node 下会被重定向到首页（PowerShell 走系统代理才成功），因此兜底改用百度热搜。
- 下一步：P8.6 回顾页与设置页自动生成开关。

### 2026-11-13 P8.6 剧情母题去重 + 道具扩容

- 背景：连续三场生成都围绕茶/饮水，原因是续接规则优先收旧悬念，且道具白名单只有 teacup/bowl/book/table。
- 剧情状态：`story/threads.ts` 增加每场 `props/linePools` 记录与 `recentProps` 摘要；`findDuplicate` 拦截最近 2 场重复道具（resolves 收线场例外）；开放线索连续 2 场后，下一场必须收线，收旧开新会重置场次。
- 提示词：`protocol.ts` 新增规则 11/12；`story/context.ts` 注入线索场次（n/3）、最近道具与台词池。
- 道具资产：重写 `scripts/avatar/generate-props.mjs`，茶杯/碗/书/桌改用带内壁、圆角与双色材质；新增 `phone`、`flower`（hand）与 `cushion`、`lamp`（stage），共 8 个道具；dev 快捷键 5/6/7/8 可预览。
- 验证：story 7 项、service 7 项、props 8 项、generation + validation 共 54 项通过；结构/行数/循环门禁通过。
- 真机：新提示词生成 `gen.offwork-glance`（下班题材，phone + lamp，17 beats / 4269 tok），17/17 cue 全部执行，手机/台灯按 4.6s/9.6s 出现、13.2s/16.4s 收起，结束回到待机，无控制台错误。
- 仍存在：`behavior.chin-rest` 与右手道具（茶杯/手机）同时出现时，行为会被道具抢占到收道具后才可见；后续在生成器提示词或 FrameLedger 仲裁里限制。
- 下一步：P8.6 回顾页与设置页自动生成开关；道具可继续替换为外部 CC0 GLB（保持文件名与原点约定）。

### 2026-11-13 SearXNG 一键部署支持自定义端口

- 部署：`searxng-deploy.ts` 接受 `requestedPort`（1024–65535），端口被占用直接失败；已有容器端口不一致时 `docker rm -f` 后按新端口重建；端口探测拆到 `searxng-port.ts`。
- 链路：shared bridge / preload 的 `deploySearxng(port?)` 打通，设置页新增端口输入（留空自动选择），非法端口前端提示。
- 验证：本机容器重建为 `127.0.0.1:42390 -> 8080`，`deploySearxng(80)` 返回端口校验失败，`deploySearxng(42390)` 返回 ok，`/api/search/test` 可用。

### 2026-11-13 规划：新增 P8 AI 剧情推进器

- 背景：对比 dsh-pet「几百个动画堆剧情」的路线，确定本项目走「动作原语 + 剧本编排」的组合路线。
- 变更：[execution-roadmap.md](./execution-roadmap.md) 新增 P8 与 G8；主线图、并行轨道、不建议做三处同步更新。
- 分工：AI 只出剧情意图、编排与台词；动作必须引用已注册的 `behavior.*` / `motion.*` / `pose.*`，非法 cue 直接丢弃。
- 四个硬前提：受限 schema、离线降级、剧情状态管理、打扰预算。
- 启动条件：P3（剧本接线）与 P6（记忆/主动说话）之后；P8.1 schema 先行，热点抓取默认关闭。
- 关联决策：D17。

### 2026-11-12 邻家大姐兔耳娘精简

- 输入：`C:\Users\<用户名>\Documents\3D模型\邻家大姐兔耳娘.vrm`（61.0MB，VRM0、49 骨骼、118 morph、11 个 morph primitive）。
- 处理：`scripts/avatar/compress-vrm.mjs` → `AI模型精简版/邻家大姐兔耳娘_精简.vrm`，删除 1298 个全零 morph 属性。
- 校验：POSITION 哈希 0 差异；13 表情绑定一致；49 humanoid、118 morph；targetNames 11/11。
- 结果：61.0MB → 25.8MB。
- 遗留：未做穿模检查与真机观感验收。

### 2026-11-12 邻家大姐精简

- 输入：`C:\Users\<用户名>\Documents\3D模型\邻家大姐.vrm`（58.4MB，VRM0、49 骨骼、118 morph、11 个 morph primitive）。
- 处理：`scripts/avatar/compress-vrm.mjs` → `AI模型精简版/邻家大姐_精简.vrm`，删除 1298 个全零 morph 属性。
- 校验：POSITION 哈希 0 差异；13 表情绑定一致；49 humanoid、118 morph；targetNames 11/11。
- 结果：58.4MB → 25.9MB。
- 遗留：未做穿模检查与真机观感验收。

### 2026-11-12 大明星精简

- 输入：`C:\Users\<用户名>\Documents\3D模型\原生\大明星.vrm`（72.8MB，VRM0、49 骨骼、118 morph、11 个 morph primitive）。
- 处理：`scripts/avatar/compress-vrm.mjs` → `AI模型精简版/大明星_精简.vrm`，删除 1298 个全零 morph 属性。
- 校验：POSITION 哈希 0 差异；13 表情绑定一致；49 humanoid、118 morph；targetNames 11/11。
- 结果：72.8MB → 33.5MB。
- 遗留：体积仍偏大（贴图未压缩）；未做穿模检查与真机观感验收。

### 2026-11-12 不穿裤子精简

- 输入：`C:\Users\<用户名>\Documents\3D模型\不穿裤子.vrm`（54.7MB，VRM0、49 骨骼、118 morph、11 个 morph primitive）。
- 处理：`scripts/avatar/compress-vrm.mjs` → `AI模型精简版/不穿裤子_精简.vrm`，删除 1298 个全零 morph 属性。
- 校验：POSITION 哈希 0 差异；13 表情绑定一致；49 humanoid、118 morph；targetNames 11/11。
- 结果：54.7MB → 29.1MB。
- 遗留：未做穿模检查与真机观感验收。

### 2026-11-12 运动健将精简

- 输入：`C:\Users\<用户名>\Documents\3D模型\运动健将.vrm`（58.7MB，VRM0、49 骨骼、118 morph、11 个 morph primitive）。
- 处理：`scripts/avatar/compress-vrm.mjs` → `AI模型精简版/运动健将_精简.vrm`，删除 1298 个全零 morph 属性。
- 校验：POSITION 哈希 0 差异；13 表情绑定一致；49 humanoid、118 morph；targetNames 11/11。
- 结果：58.7MB → 24.9MB。
- 遗留：未做穿模检查与真机观感验收。

### 2026-11-12 泥白色野蛮女友精简

- 输入：`C:\Users\<用户名>\Documents\3D模型\泥白色野蛮女友.vrm`（53.2MB，VRM0、49 骨骼、118 morph、11 个 morph primitive）。
- 处理：`scripts/avatar/compress-vrm.mjs` → `AI模型精简版/泥白色野蛮女友_精简.vrm`，删除 1298 个全零 morph 属性。
- 校验：POSITION 哈希 0 差异；13 表情绑定一致；49 humanoid、118 morph；targetNames 11/11。
- 结果：53.2MB → 25.3MB。
- 遗留：未做穿模检查与真机观感验收。

### 2026-11-12 泥色短裙精简

- 输入：`C:\Users\<用户名>\Documents\3D模型\泥色短裙.vrm`（49.3MB，VRM0、49 骨骼、118 morph、11 个 morph primitive）。
- 处理：`node scripts/avatar/compress-vrm.mjs` → `AI模型精简版/泥色短裙_精简.vrm`，删除 1298 个全零 morph 属性。
- 校验：POSITION accessor 哈希 0 差异；13 表情绑定一致；49 humanoid、118 morph 不变；11/11 primitive 保留 `targetNames`。
- 结果：49.3MB → 30.8MB。
- 遗留：未做臀部穿模检查；尚未真机观感验收。

### 2026-11-12 内衣红发臀缝修补（修正版）

- 反馈修正：第一次补片（9×11 平面网格）把两腿之间的缝隙糊成一片，已回退。
- 重新诊断：`Body_Model_down` 在背部中线有一条开放缝，边界左右各约 13 个点，y 0.647~0.806、x ±0.014、z 0.007~0.065；其中 y≥0.72 是臀缝段，y<0.69 是大腿间隙（正常应分开）。
- 修复：沿真实边界逐层配对（按 y 就近），生成 `ButtSeam` 窄条蒙皮网格（29 顶点 / 28 三角），只覆盖 y 0.72~0.806；顶点直接复制原边界的 POSITION/JOINTS/WEIGHTS/UV/NORMAL。
- 二次修正（关键）：缝合面原先复用 `material_body`（alphaMode=MASK），UV 落在贴图透明区导致「有面但不可见」，背面仍透出桌面。改为新建 `material_butt_seam`（KHR_materials_unlit + alphaMode=OPAQUE），颜色从身体贴图不透明像素采样得 RGB(254,227,207) → 线性 (0.9911, 0.7682, 0.624)。
- 三次修正：用户反馈仍穿透。斜后方射线检查发现薄片在侧视角挡不住缝隙，改为**闭合楔形**：外层贴原边界、内层沿 -z 挤出 2.2cm，四周加侧壁与上下封口，覆盖 y 0.685~0.806；64 顶点 / 124 三角，材质同上。
- 结果：结构 49 骨骼 / 118 morph 不变，文件 31.32MB；正面与斜后方均无「薄片边缘漏光」。
- 未能完成：临时预览页依赖 dev server（当时已停止）与本地 three 副本，渲染验证未成功，已清理 `public/_tmp`；需要用户在查看器复核。
- 结果：背面射线采样（x ±0.01，y 0.71~0.805）空洞 6 → 1（剩余 1 点在 y=0.71，内裤下沿以下的大腿自然间隙）；大腿间隙 y 0.64~0.68 空洞保持 11 不变，确认未被粘连。
- 结构：49 humanoid、118 morph、13 表情绑定不变；无 NaN；文件 31.32MB。
- 备份：`.tmp/vrm-slim-backup/内衣红发_精简.vrm`（未修补版）。
- 待确认：y=0.71 那一点是否需要一并闭合（继续向下补会连上大腿上段）；已请用户在查看器复核。

### 2026-11-12 内衣红发臀部空洞补片（已回退）

- 现象：`内衣红发_精简.vrm` 背侧臀部中心有可见穿透/空洞。
- 诊断：按蒙皮矩阵把顶点变换到世界坐标后，从背侧向身体做射线采样（x −0.08~0.08、y 0.70~0.82，步长 1cm），中心 x≈0、y 0.70~0.79 共 7 个采样点无命中；部分邻居点皮肤先于内衣被命中。
- 修复：生成 9×11 的蒙皮补片（99 顶点 / 160 三角），使用 `material_body` 皮肤材质；每个顶点从最近的身体顶点复制 JOINTS/WEIGHTS/UV/NORMAL，再按 `A = Σw·M` 反解局部坐标，保证跟随骨骼变形；补片深度取邻域平均 z 再内收 2mm，避免顶出。
- 结构：补片作为新 mesh + node（`ButtPatch`）追加，不改动原有 mesh/primitive 顺序；表情绑定索引与备份逐项一致，49 humanoid、118 morph 不变，无 NaN / 越界引用。
- 验证：补片前 7 个空洞采样点 → 补片后 0；文件 31.32MB（基本不变）。
- 备份：`.tmp/vrm-slim-backup/内衣红发_精简.vrm`（补片前）。
- 遗留：另外 4 个原生模型未做同样检查；补片是几何补洞，未改 UV 接缝，极端光照下可能看出轻微接缝。

### 2026-11-12 原生 VRM 批量精简（第二批）

- 来源：`C:\Users\<用户名>\Documents\3D模型\原生`（内衣红发 / 短黑发 / 红发 / 红发黑丝 / 金发）。
- 处理：`node scripts/avatar/compress-vrm.mjs` 逐条精简 → `AI模型精简版/<名>_精简.vrm`；每个模型删除 1298 个全零 morph 属性（11 primitive × 118 target）。
- 结果（48.2/77.3/46.3/54.4/49.6 MB → 31.3/30.9/31.9/33.4/26.7 MB）：
  - 118 morph、11 个 morph primitive、49 humanoid 骨骼保持不变；
  - POSITION accessor 哈希与原文件逐 primitive 一致（0 差异）；
  - 13 个表情绑定索引与原文件完全一致；
  - `extras.targetNames`（118）原文件已具备，精简后完整保留，无需回填。
- 结论：与 AnimeArt 家族同源，可直接复用 `animeart-v1` 共享 binding；仍属测试模型，正式入项目前需改许可与元数据。
- 遗留：模型体积仍 26.7–33.4MB，贴图未压缩；未做真机观感验收。

### 2026-11-11 M0c T1.7–T1.9

- 内容：behavior cue 贯通剧本；行为观测 + `__petDebug.behaviors` + dev 预览面板；golden 快照与 dt=0 冻结测试。
- 结果：avatar 35 文件 212 测试通过；typecheck/lint/行数/结构/循环全绿。
- 提交：`e616f2ae`（M0c 动效库）、`2ea20207`（dev 黑屏重试）、`7b0ceeb3`（方案文档）。
- 遗留：p95/4h 长稳。

### 2026-11-11 内置雪团 + 许可

- 内容：`public/vrm/models/xuetuan.vrm` 24.05MB；`builtin:xuetuan` 静态解析；模型选择器“内置 · 雪团”；新用户默认；代码许可 PolyForm NC；模型 CC BY-NC-SA。
- 结果：静态资源 200；shared/web/core/pet 相关测试通过；门禁全绿。
- 提交：`686f5ca2`（功能 + 许可合并提交，避免中间态 GPL 代码 + 非商用素材）。
- 遗留：安装包体积增加约 24MB；正式发布前复核许可。

### 2026-11-11 AnimeArt 家族验证与精简

- 模型：小白鲸、海豚、鲨鱼、水母、企鹅、海獭；原始 39.6–46.6MB。
- 骨架：6/6 与雪团一致（49 humanoid、父级 0 差异、rest 四元数 0° 差、比例 RMS 0.015–0.09）。
- 面部：6/6 为 118 morph、11 个面部 primitive、18 个 VRM 表情绑定索引一致；缺 `targetNames`。
- 精简：删除 118 个全零 morph NORMAL（约 14.34MB/模型）；输出 24.98–32.24MB 到 `C:\Users\<用户名>\Documents\3D模型\AI模型精简版`。
- 补齐：118 个 `targetNames` 按雪团顺序写入；POSITION 哈希一致；0 orphan / 0 NORMAL target。
- binding：`animeart-v1.binding.json`（家族级，standardExpressions + channels + reservedChannels）；fingerprint 记录 6 个模型。
- 遗留：海豚/企鹅仍 >20MB（贴图/材质）；100 个非标准 morph 语义顺序需抽查；测试模型许可未改。

### 2026-11-11 执行路线评审

- 用户确认按 `execution-roadmap.md` 逐步推进，要求过程中多留痕。
- 本文件建立；P0 启动。

### 2026-11-11 T1.9 4h 长稳（已完成）

- 口径：桌宠页每 5 分钟采样 10s，rAF 回调耗时 + WebGL clear 帧数 + 堆 + DOM。
- 结果（`t19-longrun.jsonl`，49 个采样点 / 0 错误）：
  - 时长 4h；渲染 24.8–40.2fps（采样含隐藏/降档波动，稳态 30fps）。
  - rAF 回调 p95：平均 0.99ms、最大 1.5ms，无退化。
  - 堆：141.4 → 179.5MB，峰值 203.9MB；4h 漂移约 +38MB，未见持续线性增长，需在 T0.9 对比基线。
- 结论：T1.9 通过（p95 ≤ 2ms）；堆漂移留作 T0.9 基线对比项。

### 2026-11-11 导入模型报错定位（bufferView 越界）

- 现象：桌宠窗只显示 `Cannot read properties of undefined (reading 'extensions')`，设置页同样弹这条 toast。
- 定位：在 `VrmCanvas` 的 catch 里补 dev 堆栈日志后，堆栈指向 `GLTFMeshoptCompression.loadBufferView` → `bufferView.extensions`，即 `bufferView` 为 undefined。
- 根因：`vrm-9b865bbe`（小白鲸·短发版_精简）内部 26 张 image 引用 bufferView 295–320，但文件只声明了 203 个 bufferView —— 精简/导出环节删掉了 bufferViews 却没改引用，模型文件本身损坏（水母娘同项校验 0 越界）。
- 修复：
  - 导入阶段新增引用越界校验（`broken_references`）：image/accessor 的 bufferView、texture 的 source 越界直接拒绝，提示「模型文件不完整（内部 bufferView 引用越界），请重新导出后再导入」。
  - `VrmCanvas` 加载失败时在 dev 打印完整错误对象，避免只剩一句 message。
- 处置：桌宠临时切回内置雪团；坏模型仍留在形象列表，待用户删除或用原始文件重导。
- 结果：core media 19 项测试通过（新增越界用例）；typecheck / 行数通过。
- 文件：`packages/core/src/services/media/vrm-sniff.ts`、`vrm-avatar-service.ts`、`vrm-avatar-service.test.ts`、`vrm/vrm-canvas.tsx`。

### 2026-11-11 P2 内容扩容：L2 15 / L3 10

- 内容：L2 动作 7 → 15（`nod-double` / `shake` / `look-around` / `wave` / `shy` / `stretch-up` / `stomp` / `eat-bite`）；L3 行为 5 → 10（`head-pat` / `eat-rice` / `work-focus` / `wake` / `scold-fat`）。
- L1 支撑：新增 `pose.idle-body`（全身中立锚点）、`shy`、`scold-huff`（叉腰）、`eat-hold` / `eat-bite`、`wave-raised/out/in`、`stomp-lift/down`、`head-up` / `head-shake-*` / `head-look-up-*`。
- 角度标定：用 CDP 读归一化骨骼世界坐标，按目标手部落点反推肩/肘组合；wave 手落在头侧上方、stretch 双臂 V 形过顶、eat 右手到嘴边、shy/端碗双手落在胸前中线。
- 约束调整：手臂单轴限位放宽（肩 ±105°、肘 ±110°），仍拦截超限姿势；`constraints` 测试改用 2.6rad 超限用例。
- 运行时接线：行为激活时待机 `relaxArms`/手部组件让位（`pose.behavior.id === null`），避免与行为自带手臂轨道叠加；同时修掉 `behavior.sleep` 双臂被叠加两次的隐患。
- 结果：avatar 48 文件 295 测试通过；typecheck / lint / 行数 / 结构 / 循环全绿；真机截图确认 wave / stretch / eat / scold-fat（抬腿跺脚）/ head-pat 姿态成立。
- 文件：`poses/{arms,head,legs,posture,daily}.ts`、`motions/{head-gestures,gestures,eating}.ts`、`behaviors/{touch,daily,social}.ts`、`constraints/index.ts`、`vrm-controller.ts`、golden 快照。
- 遗留：`eat-rice` 无道具时双手略交叉；`work-focus` 长时间伏案观感待剧本联调；下一步 P3 接线 4 场戏。

### 2026-11-11 P3 剧本接线：4 场戏接行为

- 内容：触摸 / 干饭 / 工作提醒 / 被叫胖四场戏全部接到新增行为。
  - 触摸：改造 `touch.head-tap`，`pose:tap`（react-flinch）换成 `behavior.head-pat`，保留 squash / joy / 台词。
  - 干饭：新增 `moment.eat-rice`（priority 2，冷却 120s，空 triggers）。
  - 工作提醒：新增 `moment.work-rest`（`context::workStreak`，冷却 30min），0–2.4s 伏案 → `behavior.wake` 伸懒腰 → 视线回正。
  - 被叫胖：新增 `moment.called-fat`（priority 1，冷却 30s，空 triggers），生气 morph 由行为自带。
- 关键修复：`VrmCueAdapter` 之前没实现 `CueSink.end`，`behavior.*` 进入 loop 后永不退出。现在按 `sceneId → 最近行为` 记录，场景结束/被抢占/取消时 `stopBehavior()`；多场景逐个结束时不会误停别场行为。
- 时长：Scene 无独立 duration，末尾加 `look camera` 锚点决定结束时刻（2.8 / 4 / 5.4 / 3s）。
- dev：`useScriptDirector.playScene(sceneId)` + `__petDebug.playScene`，手动播干饭/被叫胖（触发源等 M2 喂饭与 M3 对话）。
- 验证：script 目录 67 项测试通过（新增 moments 8 项、适配器 2 项）；avatar 49 文件 305 测试通过；typecheck / lint / 行数 / 结构 / 循环全绿。
- 真机（CDP，临时打开 `WBFM_PET_SCRIPT=1`）：`moment.called-fat` 3 条 cue 后行为回 null；`moment.eat-rice` 4 条 cue 后回 null；`moment.work-rest` 依次 work-focus → wake → look 后回 null；`touch.head-tap` 为 pose → head-pat → expression → line → look 后回 null；四场结束后 `active` 为空。
- 文件：`script/scenes/moments.ts`、`script/scenes/touch.ts`、`script/scenes.ts`、`script/adapters/vrm-adapter.ts`、`script/use-script-director.ts`、`script/debug.ts`、对应测试。
- 遗留：干饭/被叫胖还没有真实触发源；台词池未加（已于 2026-11-12 补齐，见下一条）；`work-focus` 长时间伏案观感仍待联调。

### 2026-11-12 P3 收尾：日常三场戏补台词池

- 内容：为干饭 / 工作提醒 / 被叫胖补本地台词池，P3 闭合（4 场戏 + 台词）。
  - 台词池：`PetLinePoolId` 新增 `eat-rice` / `work-rest` / `called-fat`，`PET_LINE_POOLS` 各映射 3 条 i18n key。
  - i18n：`emotion` 命名空间新增 `eatRice` / `workRest` / `calledFat`，中英各 3 条；`enEmotion: typeof zhEmotion` 保证结构一致。
  - 场景：三场戏各插入 1 条 `line` cue —— 干饭 / 被叫胖在 0s 与行为同拍，工作提醒与 `behavior.wake` 同在 2.4s 抬头时说出。
- 边界说明：P3 spec 第 8 节原写「不新增台词池与 i18n 词条」，本轮按进度日志「先验证单 cue 可预览再加台词」的既定顺序补上，属 spec 预留的下一轮项，不是范围外扩张。
- 验证：`script` 目录 8 文件 67 项测试通过（含新增 3 条 line cue 断言与 playScene 字幕断言）；`shared` i18n 3 文件 35 项通过（含 parity）；`pnpm typecheck`、`check:lines` / `check:structure` / `check:cycles`、web lint 全绿。
- 文件：`packages/shared/src/schemas/interaction/pet-lines.ts`、`packages/shared/src/i18n/messages/emotion.ts`、`apps/web/src/features/avatar/script/scenes/moments.ts`、`moments.test.ts`、`use-script-director.test.tsx`。
- 遗留：干饭 / 被叫胖仍无真实触发源（等 M2 喂饭、M3 对话）；三场戏只在 dev 手动 `playScene` 验证过链路。

### 2026-11-12 自然度参数接上游（tension 跟随交互状态）

- 内容：`LivelinessLayer.tension` 之前只有参数入口、没有上游；现在由 `VrmController` 每帧按交互状态派生并平滑跟随。
  - 纯函数 `animation/liveliness/tension.ts`：`tensionTarget(state)` 按优先级取值（睡眠 0.05 → 拎起 0.85 → 触摸/按住 0.6 → L3 行为 0.45 → 说话 0.3 → 背对 0.2 → 待机 0.15）；`dampTension` 用指数趋近（tau 0.35s），状态切换时呼吸/微扰幅度不跳变。
  - 接线：`vrm/overlay/vrm-tension.ts` 持有当前值，控制器 Step 0.6 每帧 `pose.setLiveliness({ tension })`；`touching` 取「触摸反应中或交互阶段非 idle」。
- 顺带拆分：`tickAmbient` 外迁为 `vrm/overlay/vrm-ambient.ts`（`tick(now, idle)` / `reset()`），避免 `vrm-controller` 超过 300 行（现 297 行）。
- 结果：animation / vrm / script 35 文件 227 项测试通过（新增 tension 7 项）；typecheck、行数、结构、循环、lint 全绿。
- 文件：`animation/liveliness/tension.ts`、`liveliness/index.ts`、`animation/__tests__/liveliness/tension.test.ts`、`vrm/overlay/vrm-tension.ts`、`vrm/overlay/vrm-ambient.ts`、`vrm/vrm-controller.ts`。
- 遗留：观感尚未真机对比（呼吸/微扰幅度变化偏小，需 CDP 或录屏 A/B）；`asymmetry` / `breathMix` 仍未接上游。

### 2026-11-12 站姿/坐姿变体簇（5 个姿势 × 3 变体）

- 内容：把 T2.6 的变体机制接上正式内容，待机不再固定同一个站姿 / 坐姿。
  - 站姿：`pose.stance-weight-left/right` 各 3 个变体（肩线高低、支撑腿与放松腿角度交替），直接影响待机 `motion.stance-sway` 的落点。
  - 坐姿：`pose.sit-ready` / `pose.sit-sill` / `pose.sit-desk` 各 3 个变体（抬腿角、后靠角度、垂腿摆幅、撑沿与搭膝手位）。
  - 样本集中在 `poses/variant-samples.ts`，姿势定义只引用数组，避免姿态文件超行数。
- 约束与校验：新增测试要求变体骨骼键与基准完全一致（否则切换时缺失骨骼会归零）、全部落在 mask 内、与基准差异 ≤0.12 rad。
- 验证：animation / vrm 27 文件 163 项测试通过（variants 7 项）；typecheck、行数、结构、循环、lint 全绿。
- 文件：`animation/poses/variant-samples.ts`、`poses/posture.ts`、`poses/sitting.ts`、`animation/__tests__/variants/pose-variants.test.ts`。
- 遗留：实际观感未真机对比（变体幅度 1~7°，需 CDP 录屏）；`pose.sit-cross-legged` / `pose.sit-floor` / `pose.crouch` 等仍未配变体。

### 2026-11-12 坐窗沿 / 坐桌沿：高度锚点 + 腿部端点 IK

- 内容：把坐姿从「静态姿势」推进到「带锚点和端点约束」的运行时能力。
  - 纯数学 `animation/seating/seat.ts`：`computeSeatPlacement` 按站立髋高比例算 root 下沉（sill 0.18 / desk 0.32，可用 dropRatio 覆盖），脚踝目标为「桌沿回到站立踝高、窗沿垂到腿长 0.9 以内」，并按 0.98×腿长钳位。
  - VRM 侧 `vrm/overlay/vrm-seating.ts`：每帧叠加 `pose.sit-sill` / `pose.sit-desk`，量髋/踝的场景局部坐标 → 算目标 → root 下沉 → 左右腿两骨软 IK（relax 0.12）；0.35s 淡入淡出。
  - 接线：`VrmPoseLayer.setSeat` / `seated`、`VrmController.setSeat`；坐姿期间待机重心与垂臂让位。
  - 剧本：`pose` 预设新增 `sit-sill` / `sit-desk` / `stand`；新增 `moment.sit-sill`（0s 坐、6s 起身，空 triggers，dev 手动播）；适配器在场景结束/打断时强制恢复站立。
- 顺带拆分：squash 包络外迁 `vrm/overlay/vrm-squash.ts`，给坐姿层腾出行数。
- 验证：animation / vrm / script 36 文件 237 项测试通过（新增 seat 4 项、适配器坐姿 2 项、场戏 1 项）；typecheck、行数、结构、循环全绿；`vrm-controller` 300 行、`vrm-pose-layer` 295 行。
- 文件：`animation/seating/*`、`vrm/overlay/vrm-seating.ts`、`vrm/overlay/vrm-squash.ts`、`vrm/vrm-pose-layer.ts`、`vrm/vrm-controller.ts`、`script/adapters/vrm-adapter.ts`、`script/scenes/moments.ts`、对应测试。
- 遗留：真机观感未验证（悬空/落地的脚位与膝盖朝向需 CDP 看）；手部未做 IK（撑沿/搭膝仍靠姿势）；触发源待 M2（座位检测）。

### 2026-11-12 CMU 动捕片段正式入库

- 内容：把 4 条最终版片段从 `.tmp/mocap-clips` 归档到 `apps/web/public/motions/cmu/`。
  - 片段：`cmu-idle-13_27`（13_27 7.88–10.88s）、`cmu-stand-40_10`（46.25–49.25s）、`cmu-stretch-42_01`（4.25–7.25s）、`cmu-walk-01_01`（0–3s）。
  - 校验：SHA256 与 `.tmp` 源文件逐一一致；4 条合计约 168KB；旧 `cmu-wave-13_27`（走位+抱手段）不归档。
  - 来源与许可：CMU Graphics Lab Motion Capture Database（free for all uses，致谢 NSF EIA-0196217），已写入 `ASSETS-LICENSE.md` 与目录 README。
- 边界：仅素材归档，不自动进动作池（运行时默认待机仍是 `daiji.vrma`）；试播仍走设置页导入 / 预览面板。
- 文件：`apps/web/public/motions/cmu/*`、`apps/web/public/motions/cmu/README.md`、`ASSETS-LICENSE.md`。
- 遗留：`.tmp/mocap-clips` 源文件暂未删除（保留一轮，确认无回滚需求后清理）；正式 cast 的动作评审未做。

### 2026-11-12 真机观感验收（坐窗沿 / 变体 / tension）

- 方式：`next dev`（`WBFM_PET_SCRIPT=1`）+ headless Chromium（WebGL，Playwright 注入 pet 桥），通过 `__vrmDebug` / `__petDebug` 采样骨骼与场景状态，并截图 `.tmp/{baseline,sill,desk}.png`。
- 发现并修复 6 个问题：
  1. 坐姿姿势每帧 additive 叠加且无基准复位，腿部角度持续漂移（upper 从 -1.35 漂到 -2.3 以下）；`VrmAnimationRuntime.applyPose` 新增 `additive` 参数，坐姿层改用 `additive=false`。
  2. root 下沉用 `anim.root.y -=` 每帧累加（实测 -4.39m）；改为 `VrmSeating.depth` 由姿态层在场景 Y 上一次性减去。
  3. `hips` 不在 normalized 骨骼名单，rig 采集失败（`rig=null`）；改为优先 `vrm.humanoid.getNormalizedBoneNode('hips')`。
  4. 坐姿手臂停在 T-pose 高度；坐姿层补叠加 `pose.arms-hang`。
  5. 软 IK 收敛过紧，腿被拉直；relax 调整为窗沿 0.65 / 桌沿 0.55，保留坐姿轮廓；落地目标改为「保地面高度、只收水平距离」。
  6. 剧本 hook 的控制器代理缺 `setSeat` 转发，场景只播视线/表情；补齐并加回归测试。
- 验证数据（模型局部）：站立髋 0.813 / 踝 0.065 / 腿长 0.757；窗沿下沉 0.112、膝 0.575/前 0.346、踝 0.202/前 0.396；桌沿下沉 0.24、踝 0.19；`setSeat(null)` 后踝回到 0.065、场景 Y 回基线。
- 剧本：`moment.sit-sill` 1.2s `seated=true`，6.4s 执行 `pose:stand`，7.6s `seated=false` 且 `active` 清空。
- tension 上游：睡眠 0.052 → 唤醒 0.14 → 点击中 0.34 → 回落 0.233（默认 0.25）。
- 结果：script/animation 10 文件 81 项测试通过（新增 applyPose 不累加、剧本 setSeat 转发）；typecheck / 行数 / 结构 / 循环 / lint 全绿。
- 文件：`animation/adapters/vrm.ts`、`vrm/overlay/vrm-seating.ts`、`vrm/vrm-pose-layer.ts`、`script/use-script-director.ts`、`animation/seating/seat.ts`、对应测试。
- 遗留：没有座位道具，坐姿主要靠「腿前伸 + 身体下沉」读出；要更明确地表现坐在桌沿/窗沿，需要加简易坐面或道具（待产品决策）。

### 2026-11-11 VRM 精简脚本重写与六个海洋模型重压

- 脚本：`scripts/avatar/compress-vrm.mjs`；只删全零 morph NORMAL/TANGENT，accessor / bufferView 重新编号并重建 BIN，同步 image.bufferView，输出前做引用越界自检。
- 结果（原始 → 精简，MiB）：企鹅 43.4→29.0、小白鲸 39.4→25.0、水母 41.0→26.6、海獭 39.6→25.2、海豚 46.6→32.2、鲨鱼 39.7→25.3；每个模型删 1298 个全零 morph 属性。
- 验证：6/6 通过导入校验并在桌宠窗用 three-vrm 实际加载（`__vrmDebug` 就绪）；测试导入已回收，旧输出备份在 `.tmp/vrm-slim-backup/`。
- 注意：旧精简文件仍在形象库（`小白鲸·短发版_精简`、`海獭娘_精简`），需删除后重导新文件；`shirokujira-slim-v2` 为新文件测试导入，可直接使用。

### 2026-11-11 T2.7 手部防穿模（抱手/拥抱片段的穿模校准）

- 现象：动作池里 5.97s 的抱手片段（池内 index 7）在双手并拢时手掌互相穿插。
- 方案：新增 `animation/liveliness/hand-clearance.ts`（纯数学）+ `vrm/overlay/vrm-hand-clearance.ts`（VRM 适配）。
  - 每帧测左右手骨世界间距，低于阈值时给出 0..1 的张开需求（`clearanceTarget`）；
  - 用 `smoothDamp` 平滑后，按「目标 - 已应用」的差值给两侧上臂叠加负 Z 增量（复用 `applyPose` additive，不累积）；
  - 阈值 0.18m（手掌网格有宽度，只按骨骼距离会漏）、最大外旋 0.3 rad；睡眠时自动回落到 0。
- 方向标定：在真机同一片段上给上臂加 ±0.08 rad 实测，负 Z 让手间距 0.15→0.21、0.07→0.11，因此统一用负 Z。
- 验证：同一片段 A/B，关掉防穿模时最小手距 0.054，开启后 0.127；截图确认双手改为并排不再交叠。
- 结果：animation + vrm 26 文件 148 测试通过（新增 clearance 4 项）；typecheck / 行数 / 结构全绿。
- 文件：`animation/liveliness/hand-clearance.ts`、`animation/liveliness/index.ts`、`vrm/overlay/vrm-hand-clearance.ts`、`vrm/vrm-pose-layer.ts`。
- 遗留：阈值按当前雪团模型手宽标定，换模型可能需要按掌宽缩放；双手持物的动作会被强行撑开（后续由命令层按 `tension`/持物标记关闭）。

### 2026-11-11 T2.6 自然度层（姿态变体 / 呼吸 / 不对称 / 微扰 / Soft IK / 重心）

- **姿态变体簇**：`PoseDefinition` 新增 `variants`；`PoseLibrary.get` 统一解析变体（默认 9s 保持、600ms 交叉淡入，避免硬切），`pose.react-flinch` 首批接入 3 个变体。所有走 pose 的链路（applyPose / applyMotion / composer）自动生效。
- **自然度层** `animation/liveliness`：
  - 呼吸：脊柱/胸/肩 ±0.5~1° 慢正弦（周期 3.8s），用力时变浅；
  - 不对称：3 组预定义偏移池，18s 轮换，幅度受 `asymmetry` 与重心支撑系数衰减；
  - 微扰：平滑正弦伪噪声，只写脊柱/胸/肩/上臂，`tension` 越高越小，睡眠时关闭；
  - 叠加方式：先撤销上一帧自己的增量（`cur * prev⁻¹`）再乘新增量，避免在无重写骨骼上累积。
- **Soft IK**：`solveTwoBoneSoft` / `softenTarget`，把末端目标与极点向先验姿态插值（`relax` 0=硬 IK、1=完全保持基准）；`applyTwoBoneIk` 新增 `relax` 参数，默认 0 不改变现有行为。
- **重心校验**：`supportFactor` 用髋投影到双脚连线的距离计算 0..1 支撑系数，越界时只衰减不对称，不直接改骨骼。
- 接入位置：`applyBodyIdle` 末尾（动画/IK/头部叠加之后），每帧一次；参数入口 `VrmPoseLayer.setLiveliness` 预留给后续命令层。
- 结构：新增子域 `animation/liveliness/`、`animation/variants/`（直接文件回到 12 以内）。
- 结果：avatar 47 文件 286 测试通过（新增 liveliness 6 项、variants 4 项、soft IK 2 项）；typecheck / 行数 / 结构 / 循环全绿。
- 文件：`animation/liveliness/*`、`animation/variants/*`、`animation/pose.ts`、`animation/contracts.ts`、`animation/ik/two-bone.ts`、`animation/adapters/vrm-ik.ts`、`vrm/overlay/vrm-liveliness.ts`、`vrm/vrm-pose-layer.ts`、`animation/poses/react.ts`。
- 遗留：呼吸/不对称参数还没有上游（LLM 命令层 `VrmMotionCommand`）驱动；变体目前只有 flinch 一条真实接入；重心校验只用于衰减不对称，尚未反馈到 IK 或支撑脚。

### 2026-11-11 CMU 片段脚底贴地 + 过渡动作替换

- 反馈：待机时脚不着地、双手交叉过度、整体不协调。
- 待机回退：`idleMotionId` 置空 → 使用内置 `daiji.vrma`；CMU 片段留在动作库，不再作为默认待机。
- 新增 `--ground`：逐帧前向运动学取「脚掌/脚趾最低点」，把 hips 平移到该点贴地；hips 节点静息高度改写为整段平均髋高。
  - 关键坑：three-vrm 用 `humanoidY / restHipsPosition.y` 做比例换算，静息高度为 0 会除零 → hips 位置 NaN、整只消失；必须写非零静息髋高。
- 替换过渡片段：原 `cmu-wave-13_27`（0–3s 实际是走位+抱手）改为 13_27 的 7.88–10.88s 平稳段，重命名 `cmu-idle-13_27` 并重新导入、删除旧 motion；walk/stretch/stand 三条也按新参数重导并替换。
- 验证：动作池 8 条逐条播放，脚尖最低 0.058–0.095（内置 daiji 为 0.074），无 NaN；真机截图站姿自然。
- 结果：`bvh-pipeline.test.ts` 12 项通过（新增 `--ground` 断言）；typecheck / 行数 / 结构全绿。
- 文件：`scripts/motion/bvh-to-vrma.mjs`、`motion/__tests__/offline/bvh-pipeline.test.ts`、`motion/__tests__/offline/bvh-fixtures.ts`、`docs/plan/archive/v3/v3.0/pet-engine/13-human-pose-reference.md`。
- 遗留：贴地按「最低点压到 0」处理，跳跃/抬脚动作会被压平；取景仍按动作池包围盒并集，含蹲伏动作时整只会偏小。

### 2026-11-11 CMU 片段「左右脚反了、在打转」修复

- 现象：导入的 CMU 片段播放时角色持续转身，双腿内旋交叉，像左右脚反了、在原地打转。
- 量化：解析 VRMA 的 hips 轨道，`stand` 前向量 3s 内从 +Z 转到 -X（约 150°），`wave` 约 130°；大腿方向在 hips 空间是 `左 -0.35 / 右 +0.46`（负交叉）。
- 根因一：CMU 的 Hips 旋转包含演员全局朝向，转换器原样写入 VRMA；桌宠没有转回正前方的补偿。
- 根因二：CMU 是 A-pose 骨架（大腿静息外张约 20°），直接套用局部旋转会把「A→竖直」的补偿也算进去，落到竖直的 VRM 腿上就是过度内旋 → 双腿交叉。
- 修复：
  - `bvh-to-vrma.mjs` 新增 `--lock-yaw`（`q' = Ry(-yaw) * q`），去掉世界 Y 朝向，保留俯仰/侧倾。
  - 默认做静息对齐：按「VRM T-pose 骨骼方向 → 源骨架静息方向」求最短弧四元数并右乘，`--no-rest-align` 可关闭；子关节零 offset 时退回单位四元数（否则会写出非单位四元数把身体扭歪）。
  - 重新挑选 3 秒窗口：wave `19.38–22.38`（抬手）、stand `46.25–49.25`（双腿分开）、stretch `4.25–7.25`、walk `0–3`；此前 0–3 的 wave/stand 其实是演员「走位/转身」段。
- 重新导出 4 条片段并替换 `~/.workbuddy-for-me/motions/` 下已导入文件（原件备份在 `.tmp/mocap-clips-orig/`）；文件路由 `Cache-Control: private, max-age=3600`，替换后需清一次浏览器缓存。
- 验证：4 条片段 hips 前向量稳定 (0,0,1)、upY≈1；真机逐条播放截图，双腿分开、正面朝向；`bvh-pipeline.test.ts` 11 项通过。
- 文件：`scripts/motion/bvh-to-vrma.mjs`、`motion/__tests__/offline/bvh-pipeline.test.ts`、`docs/plan/archive/v3/v3.0/pet-engine/13-human-pose-reference.md`。
- 遗留：CMU 片段仍是通用素材，内容质量参差；正式入库前按「hips 偏差 ≤18° + 有明显肢体动作 + 双腿不交叉」逐条筛 3 秒窗口。

### 2026-11-11 T2.5 动作接线 + 姿态先验库扩容（第二批）

- **接线（L2 → 真实链路）**：新增 `vrm/overlay/vrm-idle-overlay.ts`。
  - 待机：`motion.stance-sway` 在「没有 clip 待机」（procedural）时按帧采样，权重 0.6；有 clip 时让位，避免和 VRMA 抢脊柱/腿。
  - 触摸：点击优先播 `motion.react-flinch`（720ms 一次性），动作缺失才退回动作池手势/程序化手势；播放期间跳过待机垂臂，避免手臂被 arms-hang 覆盖。
  - `applyMotion` 新增 `mask` 参数（默认 `HAND_MASK`）：重心/反应要写脊柱与腿，原实现用手部掩码会把它们过滤掉。
- **第二批 L1**（`poses/sitting.ts`，7 条）：坐窗沿、坐桌沿、盘腿坐、坐地伸腿、蹲姿、跪坐、撑桌/伏案；L1 33 → 40。
- 限位取舍：髋屈曲按 ROM 表上限 1.35 rad（`SIT_READY` 同值），膝盖折叠 1.74 rad（100° 上限），因此蹲/跪坐是「半程」而非全折叠；要全折叠需先放宽 ROM 表或引入分阶段限位。
- 验证：avatar 23 个测试文件 132 项通过（animation + vrm）；typecheck / 行数 / 结构 / 循环全绿。
- 文件：`vrm/overlay/vrm-idle-overlay.ts`、`vrm/vrm-pose-layer.ts`、`vrm/vrm-controller.ts`、`animation/adapters/vrm.ts`、`animation/motions/sway.ts`、`animation/poses/sitting.ts`、`animation/poses/index.ts`。
- 遗留：反应姿态是「从 rest 覆盖」，有 clip 待机时可能出现短暂姿态跳变（幅度小）；重心摆动只作用于 procedural；第二批姿态尚未进触摸/待机链路，留给坐窗沿 IK 与剧本。

### 2026-11-11 T2.5 姿态先验库扩容（第一批）

- L1 姿势 17 → 33：
  - `poses/posture.ts` 新增 10 条：重心压左/右、双手身前、抱臂、手插兜、伸懒腰、靠墙、踮脚、脊柱中立、坐姿基底（`pose.sit-ready`）。
  - `poses/react.ts` 新增 6 条：缩肩护胸、双手护头、后仰、向左躲、蹭手、惊起。
- L2 动作 5 → 7：`motion.stance-sway`（8s 重心换脚循环）、`motion.react-flinch`（720ms 缩肩回弹）。
- 全部通过 ROM 限位与 mask 归属校验；animation 19 个测试文件 111 项通过；typecheck / 行数 / 结构 / 循环全绿。
- 文件：`poses/posture.ts`、`poses/react.ts`、`motions/sway.ts`、`motions/flinch.ts`。
- 未接线：新增动作还没进待机/触摸真实链路（待机仍走 clip + 手部 fidget）；`pose.sit-ready` 留给坐窗沿 IK 用。

### 2026-11-11 桌宠大小设置 + 设置页导航细化

- **桌宠变小定位**：取景（`fitVrmToCamera`）按「整个动作池包围盒并集」计算 scale；导入挥手/伸展后包围盒被拉大，整只被等比缩小。另叠加一个因素：原先选中的自定义 VRM 文件丢失（`vrm-450c1c85…` ENOENT），回落到内置雪团，比例本就不同。
- **新增 `petSize` 设置**（`sm/md/lg`）：`DEFAULT_VOICE_SETTINGS.petSize='md'`；取景时在 base scale 上乘 0.8 / 1.0 / 1.2；大档允许轻微超出视口。UI 在设置 → 形象模型 → 桌宠模式下方。
- 跨窗口即时生效：`useVoiceSettings` 保存后复用设置广播，`useSettingsSync` 同时失效 `voiceSettings`；桌宠收到后重取并 `refit()`。
- 取景逻辑从 `vrm-canvas.tsx` 抽到 `vrm-fit.ts#createCanvasFit`（顺带解决 300 行门禁）。
- **设置页导航 4 → 10 组**：主题外观 / 形象模型 / 动作库 / 语音与对话 / 情绪与关系 / 事件与提醒 / 工具与权限 / 技能与智能体 / 数据与备份 / 帮助与关于；面板本身不变，仅重排分组与锚点。
- 验证：voice/pet/settings 27 个测试文件 136 项通过；typecheck / 行数 / 结构 / 循环全绿。
- 未做：`petSize` 只作用于 VRM 取景，Live2D 忽略；取景包围盒仍取动作池并集，极端大幅动作会继续压低 idle 尺寸（可用「大」抵消，后续可改为按 idle clip 取景）。

### 2026-11-11 真实开源 BVH 验收（CMU）

- 来源核实：CMU MoCap 授权原文「free for use in research and commercial projects worldwide」，Bruce Hahne 的 BVH 转换无附加限制；GitHub 镜像 `una-dinosauria/cmu-mocap`，国内直连 raw 被重置，改走 jsDelivr。
- 实跑：`01_01`（行走）、`13_27`（挥手/指）、`42_01`（伸展）、`40_10`（等车站立）全部转换成功；23 骨骼、源 120fps；未映射 6 个关节（`LHipJoint/RHipJoint/LeftFingerBase/LThumb/...`）是 CMU 无手指、无锁骨导致，属预期。
- 新增 `--fps` 降采样与 `--range 秒:秒` 裁剪（时间轴归零）；`--fps 30 --range 3:6` 输出 3s / 约 41KB，可直接进动作池。
- 测试：离线管线 8 项通过（新增降采样、裁剪首帧对齐）。
- 许可结论：CMU 可用于商业产品；LaFAN1 / Bandai Namco / SFU / NUS 为 NC 或仅限研究，不随包分发。
- 文件：`scripts/motion/bvh-to-vrma.mjs`、`apps/web/src/features/avatar/motion/__tests__/offline/bvh-pipeline.test.ts`、`docs/plan/archive/v3/v3.0/pet-engine/13-human-pose-reference.md` §11.1。
- 遗留：尚未把片段放进动作池看观感；CMU 无手指，手部仍需 L1/L2 组件覆盖。

### 2026-11-11 离线 BVH → VRMA 管线

- 新增 `scripts/motion/bvh-to-vrma.mjs`：纯 Node 解析 BVH、映射 VRM humanoid、按 VRM 父子关系重建节点、输出 `VRMC_vrm_animation` 1.0 GLB。
- 支持：Mixamo/CMU 常见命名、手指 1/2/3→Proximal/Intermediate/Distal、`--unit-scale`（默认 cm→m）、`--root-motion`（默认原地）。
- 扩展：新增 `--bone-map map.json`（任意 BVH 骨骼名 → VRM humanoid）与未映射关节报告；内置 CMU `LowerBack/Spine1` 等别名。
- 验证：6 项测试通过，其中一项用运行时同一个 `GLTFLoader + VRMAnimationLoaderPlugin` 成功解析生成文件；CLI 冒烟输出 1896 bytes。
- 限制：源需 T-pose；未映射关节旋转会丢失；不做重心/脚接触/IK 修正。
- 文件：`scripts/motion/bvh-to-vrma.mjs`、`apps/web/src/features/avatar/motion/__tests__/offline/bvh-pipeline.test.ts`。
- 遗留：尚未导入真实 Mixamo BVH 做观感验收；VRMA 进动作池的批量目录/导入流程未做。

### 2026-11-11 两骨解析 IK（轻量前端 IK）

- 内容：新增 `animation/ik/two-bone.ts`（纯数学，零迭代）、`adapters/vrm-ik.ts`（世界空间写入 VRM 骨骼）；支持目标钳位、极点控制、weight 混合。
- 选型：四肢端点用两骨解析 IK；FABRIK/CCD 留给多骨链或辅链，按需再引入；不换 Mixamo 骨架。
- 结果：IK 6 项测试通过（可达/超长钳位/过近钳位/极点退化/适配器落点/骨骼缺失）。
- 文件：`animation/ik/two-bone.ts`、`animation/ik/index.ts`、`animation/adapters/vrm-ik.ts`、`animation/adapters/index.ts`、`animation/index.ts`、`animation/__tests__/ik/two-bone.test.ts`。
- 遗留：暂无运行时消费者（等抓取/坐窗沿等端点交互）；极点与 weight 需真机调参。

### 2026-11-11 运动学约束层 + 外部动作方案评估

- 新增 `animation/constraints/`：按 `13-human-pose-reference.md` 的关节舒适范围定义单轴限位，覆盖身体骨骼与 30 根手指；`validatePose/validatePoses` 拦截反向肘、手指过弯、NaN 与溢出。
- 约束定位：内容入库/离线候选筛选用，不在运行时拒绝动作；所有内置姿势必须通过，新增骨骼必须补限位表。
- 外部方案结论：运行时保持 VRM humanoid + 数据驱动；SMPL-X/SOMA 不引入双骨架，mink/OpenSim/Kimodo/AMASS/Motion-X 只作离线参考或候选生成，GMR/BVH 作为未来离线重定向与导入路径；FABRIK/两骨 IK 等出现端点目标再引入。
- 结果：constraints 4 项测试通过；`13-human-pose-reference.md` 新增第 10 节“外部动作技术取舍”。
- 文件：`animation/constraints/`、`animation/index.ts`、`animation/__tests__/constraints/constraints.test.ts`、`docs/plan/archive/v3/v3.0/pet-engine/13-human-pose-reference.md`。
- 遗留：离线 BVH→VRMA 管线、多骨 FABRIK/CCD、文本动作离线生成均未开工。

### 2026-11-11 待机手部组件（L1 手型 + L2 动作集）

- 问题：待机时手臂只有很小的世界空间摆动，手指/手腕没有动作，和头发的 SpringBone 摆幅不匹配。
- L1：新增 `pose.hand-{left|right}-{relaxed|fist|open}` 6 个手型，含腕部掌屈、四指 MCP/PIP/DIP 屈曲与摊开（左右镜像）。
- L2：新增 `motion.hand-fidget-left/right`（6.4s 循环：放松 → 握拳 → 摊开 → 放松）；左右手在待机时错开 3.2s 播放。
- 调用：`VrmPoseLayer.relaxArms` 在垂臂后直接采样两个 fidget；`applyMotion` 以 `additive=false` 写入，避免逐帧累加。
- 重构：morph 预览/行为通道混合外迁到 `MorphMixer`，`vrm.ts` 回到 300 行以内。
- 当前内容盘点：L1 19（头 7 / 臂 2 / 腿 2 / 躯干 2 / 手 6）；L2 5（nod/tilt/glance/左右 fidget）；L3 5；语义表情通道 35；目标为 36 / 26 / 14–15，内容仍是主要缺口。
- 结果：animation 17 文件 98 测试通过；typecheck/lint/行数/结构/循环全绿。
- 运行时复核（CDP `window.__vrmDebug`，重载 `/pet` 后）：左手食指近端 0.168（放松）→ 0.81（握拳）→ 0.09（摊开）→ 0.168；右手在下一半周期重复，确认左右错峰生效。
- 注意：Next Fast Refresh 不会重建 Three 场景里的 `VrmController` 实例，改动画层后需重载宠物窗口才生效（重载前页面仍在跑旧 bundle，`applyMotion` 不存在）。
- 文件：`animation/poses/hands.ts`、`animation/motions/hand-fidget.ts`、`animation/poses/index.ts`、`animation/motions/index.ts`、`animation/adapters/vrm.ts`、`animation/adapters/vrm-executors.ts`、`animation/morph/mixer.ts`、`vrm/vrm-pose-layer.ts`、`animation/__tests__/hands/hands.test.ts`。
- 遗留：行为自带手部轨道时，待机 fidget 需要让位（当前所有行为都没有手部轨道）；握拳/摊开还没接进剧本 cue。

### 2026-11-11 垂手自然手型 + 人体姿势参考库

- 问题：垂臂时手指保持 T-pose 笔直，像站军姿，不符合自然放松手型。
- 修复：`NORM_BONE_NAMES` 从 17 扩到 47（新增 30 根手指），`pose.arms-hang` 执行器在垂臂后按 MCP/PIP/DIP 逐节微屈（拇指约食指一半，小指略多）；归一化骨架屈曲轴为局部 Z，左手 +、右手 -，直接写 `baseQuat × Rz`，不逐帧累加。
- 文档：新增 [13-human-pose-reference.md](./pet-engine/13-human-pose-reference.md)，整理关节舒适范围、自然手型/握拳、行为约束、动作相位与评审 checklist；`11-motion-library-v2.md` 更新骨骼口径并互链。
- Golden：采样只取 `BODY_BONE_NAMES`（17 根），手势层手指不进运行时 golden，原快照无需改。
- 结果：avatar 41 文件 243 测试通过；typecheck/lint/行数/结构/循环全绿。
- 文件：`animation/mask.ts`、`animation/adapters/vrm-executors.ts`、`animation/__tests__/executors/fingers.test.ts`、`animation/__tests__/mask.test.ts`、`animation/__tests__/golden.test.ts`、`docs/plan/archive/v3/v3.0/pet-engine/13-human-pose-reference.md`。
- 遗留：`behavior.lifted` 走 Composer 欧拉兜底，未经过 limp 执行器，被拎起时手指仍为直线；等姿势执行器接入 Composer 后统一。

### 2026-11-11 P1 T2.4 LookExecutor 与视线优先级

- 内容：运行时消费 `look` 轨道，输出 `activeLookTarget/activeLookWeight`（行为权重 × 轨道权重）；多轨道取权重最大者，不叠加角度。
- 新增 `animation/look.ts`：`LOOK_DIRECTIONS`（camera/pointer/away/up/down），并与剧本 cue 适配器共用，去掉重复坐标表。
- 新增 `pose/gaze-resolver.ts`：视线优先级纯函数；`vrm-pose-layer` 行长超限，把 gaze 解析外迁。
- 优先级：睡眠 > 行为 look > 「指针 gaze / 背对静默」；`pointer` 目标沿用实时指针坐标，只提升权重；环境漂移仍随背对静默。
- 效果：`behavior.face-away` 的 look 不再空转；背对时行为仍能让头部转向 away，停止后头部回正。
- 结果：avatar 40 文件 241 测试通过；typecheck/lint/行数/结构/循环全绿（期间两次 vitest worker 崩溃：`spawn UNKNOWN` / `VirtualAlloc failed`，重跑或单文件运行通过，判为系统内存压力）。
- 文件：`animation/look.ts`、`animation/adapters/vrm.ts`、`animation/index.ts`、`pose/gaze-resolver.ts`、`vrm/vrm-pose-layer.ts`、`script/adapters/vrm-adapter.ts`、`animation/__tests__/look/look.test.ts`、`pose/gaze-resolver.test.ts`、`vrm/vrm-pose-layer.test.ts`。
- 遗留：look 轨道无独立 `fadeMs`（只跟行为权重）；`gaze.*` morph 通道仍留作精修眼动。

### 2026-11-11 P1 T2.3 morph 轨道接入

- 内容：`TrackDefinition` 新增 `kind: 'morph'`（语义通道 → 0..1 权重 + 可选轨道权重）；运行时在 `compose()` 消费，行为权重 × 轨道权重后写入通道。
- 合并规则：同阶段多轨道同通道取最大值，避免 enter/loop 叠加翻倍；不同语义通道映射到同一 morph 时由执行器累加并截断 1。
- 层级：dev 预览通道打底，行为通道覆盖同名项；行为结束后清除行为通道、恢复预览；行为空闲时释放全部。
- 内容：`behavior.face-away` 背对时 `brow.bored 0.7 + mouth.sad 0.35`；`behavior.lifted` 进入惊讶（`brow.surprised 1 / mouth.o.big 0.6`）、悬空与退出降为 0.5/0.3，退出随行为权重淡出。
- 观测：dev 面板轨道列表的 `ref` 显示 morph 通道名。
- 结果：animation 14 文件 86 测试、avatar 38 文件 230 测试通过；typecheck/lint/行数/结构/循环全绿（一次 vitest worker `ERR_IPC_CHANNEL_CLOSED`，重跑通过，判为环境抖动）。
- 文件：`animation/contracts.ts`、`animation/adapters/vrm.ts`、`animation/observability.ts`、`animation/behaviors/*`、`animation/__tests__/morph/tracks.test.ts`、`animation/__tests__/behaviors.test.ts`。
- 遗留：`behavior.sleep` 暂未加表情（闭眼/呼吸仍由脸层处理）；morph 轨道尚无独立 `fadeMs`，当前只跟行为权重。

### 2026-11-11 P1 T2.2 MorphExecutor 与预览

- 内容：新增 `animation/morph/executor.ts`（语义通道 → `morphTargetInfluences`，不依赖 three）；`adapters/vrm-morph.ts` 负责网格定位与 binding 装载；运行时 `attachMorph/setMorphChannels/applyMorph`；控制器 Step 9.5 写入；dev 面板增加 8 个可叠加表情通道。
- 网格定位：优先 `binding.mesh` 名称；家族模型改名时退化为“包含全部 target 名称”的唯一网格；数量/名称/索引任一不符即降级为不可用，只 warn 不阻塞渲染。
- 写入规则：每帧先释放上一帧自己写过的索引；本帧首次触达先清零，避免叠加 preset；同一索引多通道累加并截断 1；`blink` / `viseme` 保留通道直接跳过；值为 0 视为释放（释放帧归零一次，下一帧 preset 恢复）。
- 时序：`vrm.update` 与表情/口型/眨眼之后、render 之前（Step 9.5），行为表情优先于三维 preset，但下一帧 preset 会重新应用。
- 结果：animation 13 文件 82 测试、avatar 37 文件 226 测试通过；typecheck/lint/行数/结构/循环全绿。
- 文件：`animation/morph/*`、`animation/adapters/vrm-morph.ts`、`animation/adapters/vrm.ts`、`animation/devtools/preview-panel.tsx`、`vrm/vrm-pose-layer.ts`、`vrm/vrm-controller.ts`、`animation/__tests__/morph/executor.test.ts`。
- 遗留：T2.3 把 `morph` 轨道接入 Runner/Composer；非 AnimeArt 模型尚无 binding（需按模型/家族选择）；`gaze.*` 通道保留给 T2.4 LookExecutor。

### 2026-11-11 P1 T2.1 binding 契约与加载器

- 内容：`MotionBinding` zod schema、`buildMorphBinding`（O(1) 通道索引、名称/索引/保留通道校验）、`animeart-v1` 家族 binding 入代码。
- 决策：`standardExpressions.weight` 统一为 0..1；VRM0 原始的 0–100 已在 binding JSON 中归一。
- 结构：`binding.test.ts` 放入 `__tests__/binding/`，避免测试目录直接文件超 12。
- 结果：binding 5 项测试通过；typecheck/lint/行数/结构/循环通过。
- 文件：`animation/binding.ts`、`animation/bindings/animeart-v1.json`、`animation/__tests__/binding/binding.test.ts`、`animation/index.ts`。
- 遗留：T2.2 `MorphExecutor`；100 个非标准 morph 首次导入抽查；运行时按模型选择 family binding。

### 2026-11-12 座位道具 + 腿骨朝向修正（坐姿观感做实）

- 背景：上一轮真机验收结论是「没有座位道具时，坐姿只能靠腿前伸 + 身体下沉读出，近看像半蹲悬浮」，本轮按该优先级补坐面。
- 座位道具：
  - 纯数学 `animation/seating/seat.ts` 新增 `computeSeatProp(mode, rig)`：sill 宽 0.92 / 深 0.46 / 厚 0.07、desk 0.9 / 0.42 / 0.09（均按髋高比例换算），坐面色与下沉量同源。
  - 新增 `vrm/overlay/vrm-seat-prop.ts`：`BoxGeometry` 坐面 + `MeshStandardMaterial`，随坐姿权重淡入淡出；`hide()` 时 `scale` 归零，避免影响 `fitVrmToCamera` 的 `Box3` 取景。
  - 定位：用与下沉同一套髋部测量，背向由「髋 → 双脚中点」方位反推，不依赖各模型朝向约定；前缘对齐髋中心（`frontGap 0.02`），保证坐面托住臀部且两侧露出。
- 根因修复（关键）：坐姿/蹲姿/踢踏等腿部动作此前全部折向身后，正面看像站立。
  - 用 `.tmp/probe-leg.mjs` 实测 `leftUpperLeg` 归一化骨：rest 膝盖 y0.44/z0.017；x=+1.35 → 膝盖 y0.719/z **-0.341**（身体前方）；x=-1.35 → y0.758/z **+0.406**（身后）。
  - 结论：雪团（VRM0）腿骨 x 正值为屈髋前抬，与仓库原 pose/约束表约定相反。已翻转 `sitting.ts`、`posture.ts`、`legs.ts`、`variant-samples.ts` 全部腿部数值，并同步约束表（upperLeg [-30°, 80°]、lowerLeg [-100°, 5°]）。
  - golden 中 `behavior.lifted` / `behavior.work-focus` / `behavior.scold-fat` 3 项为有意修复后更新。
- 顺带修复：`invalidateMeshBounds` 之前对普通 Mesh 也写 `boundingBox = null`，触发 `object.computeBoundingBox is not a function`；改为只对 `isSkinnedMesh` 置空。
- 下沉量上限：宠物窗口 640×800 下约 478px/m、底部余量 ~100px，实测下沉 >0.24 就开始裁脚；`DEFAULT_DROP_RATIO` 定为 sill 0.18 / desk 0.2。
- 验证（headless Chromium + Playwright + SwiftShader，注入假桥读 `__vrmDebug`）：
  - baseline：hips y0.813 / knee y0.441 z0.034 / ankle y0.065 z0.06 / toes z-0.033；prop hidden。
  - sill：sceneY -0.047（权重≈0.86）、knee z-0.201、ankle z-0.224、prop pos[-0.025, 0.678, 0.233] scale[0.748, 0.057, 0.374] opacity 0.86。
  - desk：sceneY -0.085、knee z-0.235、ankle z-0.245、prop scale[0.731, 0.073, 0.341] opacity 1。
  - back：sceneY 0.108、ankle 回 0.075、prop hidden scale 0、seated=false。
- 门禁：avatar 52 文件 330 测试通过；typecheck 无错；eslint 改动目录无错；行数 / 结构 / 循环通过。
- 文件：`animation/seating/seat.ts`、`animation/seating/index.ts`、`vrm/overlay/vrm-seat-prop.ts`、`vrm/overlay/vrm-seat-prop.test.ts`、`vrm/overlay/vrm-seating.ts`、`ui/animated-bounds.ts`、`animation/constraints/index.ts`、`animation/poses/{sitting,posture,legs,variant-samples}.ts`、`animation/__tests__/seating/seat.test.ts`、golden 快照。
- 遗留：模特穿长裙 + 正面机位下沉幅度受取景限制，正面仍偏「站在长凳后」，尚未完全读出「坐」。若要进一步加强，方向是 3/4 侧机位、窗台/桌面框架做遮挡，或模型侧改短裙；另外样张权重只到 0.86 是无头渲染帧数不足，非逻辑问题。

### 2026-11-12 P4 M0b 运行时补齐（原位换模型 / 资源回收 / Q 版）

- 背景：旧 `vrm-canvas` 唯一 effect 依赖 `[fileRef]`，cleanup 会销毁 renderer → 换模型必闪黑帧；桌面 `swapModel` 销毁重建窗口，位置/穿透/悬停状态丢失；Q 版无运行时开关；模型释放顺序散落。
- P4-1a Web 热替换：
  - 新增 `vrm/session/vrm-session.ts`：renderer/scene/camera/rAF 只建一次；`loadModel` 用 swapToken 作废过期加载；新模型（含动作池/旋转配置/控制器）全部就绪后同步 `active=next → release(previous) → scene.add → installProbe → fit.reset/refit`，rAF 不会看到空场景。
  - 失败策略：已有模型时仅 dev 告警并保留旧模型；首次加载失败才显示错误层。
  - `vrm-canvas.tsx` 退化为薄包装（mount 建 session + ResizeObserver，`[fileRef]` 调 `loadModel`），props 全兼容并新增 `chibi`。
  - `vrm-fit.ts` 增加 `reset()`（清 fitted/bounds/fitW/fitH，保留 lastW/lastH）。
- P4-2 资源回收：
  - 新增 `vrm/session/release-model.ts`：固定顺序 controller.dispose → removeProbe → scene.remove → VRMUtils.deepDispose，每步独立 try 且幂等；热替换与卸载共用。
  - `__vrmDebug.resources()` 暴露 geometries/textures/programs（取自 `renderer.info`）。
  - 单测 4 条：释放顺序、幂等、空模型、controller dispose 抛错仍继续释放。
- P4-1b 桌面同窗口换模型：
  - 通道：`pet:model-changed`（主 → 渲染）、`pet:model-applied`（回执）；preload 桥新增 `onModelChange / confirmModel`，IPC 侧仅接受当前桌宠窗发送方。
  - 新增 `PetModelSwitcher`：pending + seq（连续切换作废旧请求）+ 1500ms 超时；超时回退 `recreateWindow`；关窗/退出 `cancel()` 后不再重建。
  - 换模型成功不广播 open-changed（桌宠始终开着），窗口位置/穿透/悬停状态保留。
  - `/pet` 页订阅变更 → `setModelId` → 回执 → `history.replaceState` 同步 `?model=`。
  - 测试：同窗口回执热替换 / 超时回退重建（位置沿用）/ 等待回执期间关窗不重建。
- P4-3 Q 版：
  - 设置：`avatarChibi` 进 update / required / 默认值 false；i18n 中英；设置页形象区复选框（即时生效）。
  - 运行时：`applyChibi` 只写 raw bone（three-vrm 的 normalized→raw 只同步旋转与 hips 位移），head ×1.35、左右 upperLeg ×0.7，原值存 `scene.userData.__wbfmChibiBase`，幂等且可还原；`VrmController.setChibi` 后 `pose.refreshSeating()` + `captureBaseScale()`。
  - `vrm-seating` 的 `nodeOf` 改 raw-first 并提供 `refreshRig()`，坐面/下沉按新骨架重算；新模型挂载时按当前开关应用（`applyRuntime`）。
  - 接线：`useAvatarChibi()`（可见 query）→ `avatar-host` / `pet-stage` → `avatar-canvas-router` → `vrm-canvas`，切换后 `session.refit()` 保证脚底贴底。
- 结构/门禁：`packages/shared/src/schemas/media` 直接文件 13>12，把 voice-polish schema 迁到 `media/polish/index.ts` 并由 `voice.ts` 转出；为压缩行数外迁 `switch/pet-model-switch`、`motion/pet-motion`、`session/vrm-controller-like`。
- 验证：desktop pet 74 测试通过；web avatar/vrm + ui + pet 17 文件 85 测试通过；typecheck 14/14；web lint 无错误；行数 / 结构 / 循环全绿。
- 文件：`vrm/session/{vrm-session,release-model,release-model.test,vrm-controller-like}.ts`、`vrm/chibi/{apply-chibi,apply-chibi.test}.ts`、`vrm/{vrm-canvas,vrm-fit,vrm-debug,vrm-controller,vrm-pose-layer,vrm-seating}.ts(x)`、`avatar/ui/{use-avatar-chibi.ts,avatar-host.tsx,avatar-canvas-router.tsx}`、`features/pet/pet-stage.tsx`、`features/voice/settings/avatar-section.tsx`、`shared/schemas/media/{voice.ts,polish/index.ts}`、`shared/i18n/messages/{voice,voice-en}.ts`、`desktop/main/pet/{pet-manager,pet-ipc,pet-constants,pet-types,switch/pet-model-switch,motion/pet-motion}.ts`、`desktop/preload/index.ts`、`shared/pet.ts`、`web/app/pet/page.tsx`。
- 真机验收（2026-11-12，CDP 驱动）：
  - 连续切换 B → 雪团 → B → 雪团 共 4 次：窗口内 `__swapMarker` 存活（未重建）、位置恒定、canvas 恒为 260×340。
  - 资源回基线：导入模型两次均 28 geometries / 66 textures / 5 programs；雪团两次均 24 / 57 / 6，无随切换次数增长。
  - 旁注：导入模型静止时脚底有约 0.11 世界单位空隙（取景按动作池并集对齐，属 P3 既有策略，非 P4 回归）；Q 版开启时已由 `alignFeetToGround()` 贴地。
- 真机回归修复（同日）：
  - 桌宠画面被拉伸裁切：VrmSession 重构时 ResizeObserver 只调了 `refit()`（只算取景），漏掉 `resize()`（renderer 尺寸 / canvas CSS / camera.aspect），canvas 一直停在默认 300×150。现 session 暴露 `resize()`，挂载与尺寸变化都走它；实测桌宠窗 260×340 时 canvas 260×340（缓冲 455×595）。
  - Q 版取景：改为沿用首次动作池并集比例，缩放骨架后由 `VrmController.alignFeetToGround()` 按当前骨架把脚底贴地（坐姿跳过）；避免重新 `primeForFit` 被当前行为姿态污染导致关闭 Q 版后整体放大。
  - 真机链路已验证：主窗切换导入模型 → 桌宠窗 URL 实时变为新模型（`pet:model-changed` 回执生效，未重建窗口）；Q 版开/关头×1.35、腿×0.7 与还原正确。

### 2026-11-12 P5 M1 角色与互动（分层台词 / 不打扰 / 动作入口）

- 分层台词：
  - `PET_LINE_POOLS` 新增 first-meet / late-night / idle-long / hungry；i18n 中英各 3 条；`hungry` 留给 M2 饥饿度消费者。
  - 自主低语选池 `pickAmbientPool(hour, idleMs)`：23–6 点 late-night > 2h 无互动 idle-long > 日常 ambient；上次互动时间写 localStorage（30s 节流），跨会话生效。
  - 首次见面：PetStage 挂载后 1.2s 说一句 first-meet 台词；标记 `wbfm.pet.met` 在真正开口后才写入——否则 StrictMode 的挂载→清理→再挂载会吞掉问候（已真机复验）。
- 不打扰与动作入口（右键菜单）：
  - 新增 `pet:quick-action` 通道：主进程菜单 → 桌宠渲染层；动作 toggle-mute / toggle-proactive / play-eat-rice / play-called-fat。
  - 静音与主动说话走语音设置 update（BroadcastChannel 跨窗口即时同步），写失败静默可重试；干饭/炸毛直接播放内置场戏。隐藏桌宠沿用原菜单项。
  - 5 组动作对应：待机 behavior.idle、摸鱼/伏案 behavior.work-focus、干饭 eat-rice、被戳 head-pat、炸毛 scold-fat。
  - 点击反应（react-flinch）重做：欧拉左乘偏移在不同模型/重载下方向会漂移（曾把手摆到身后），且欧拉插值会经过“手臂水平”的中间态。改为世界方向执行器 `POSE_EXECUTORS['pose.react-flinch']`：大臂向前外展、前臂向中线收拢，由 `aimBone` 直接求解；`applyMotion` 全程按动作进度在垂臂↔抱姿方向间插值（退出段反向），首尾锚点改为 `pose.arms-hang`。真机轨迹 60/110/140/300ms 均为抱姿（腕距 16cm、前向 21cm、胸前高度），500ms 平滑回落；约束表保持原样。
- 测试：ambient 8 项（选池/深夜/久无互动）、companion 4 项（首次见面仅一次、场戏、静音/主动取反）、desktop pet 74 项；typecheck 14/14、lint 无错误、行数/结构/循环全绿。
- 文件：`shared/schemas/interaction/pet-lines.ts`、`shared/i18n/messages/emotion.ts`、`shared/pet.ts`、`web/features/pet/stage/use-pet-ambient-talk.ts`、`web/features/pet/stage/companion/*`、`web/features/pet/pet-stage.tsx`、`desktop/main/pet/{pet-menu,pet-manager,pet-constants}.ts`、`desktop/preload/index.ts`。
- 遗留：菜单的静音/主动说话是「切换」语义（主进程不持有设置，无勾选态）；饿了台词池待 M2 接入；「摸鱼」暂由 idle/work-focus 承担，若要独立动作需补内容。

### 2026-11-12 P5.5 动效库深化（M2 养成取消）

- 方向：按用户决定放弃宠物养成（D16），本期聚焦动效库能力与内容。
- 扎实：
  - 执行器过渡协议通用化：`TRANSITION_EXECUTORS` + `resolveTransitionExecutor`（进入=t、停留=1、退出=1-t）；`applyMotion` 不再写死 react-flinch，后续拥抱/被拎起等世界方向动作可直接复用。
  - 新增动作定义校验测试：姿势必须存在、关键帧时间递增且在时长内、首尾禁止空姿势（防止绑定 T-pose 泄露）。
- 丰富：
  - 新增 5 个站姿动作：`motion.hands-front` / `hands-pocket` / `arms-crossed` / `lean-wall` / `tiptoe`，全部复用已验收的 L1 姿势，首尾用垂臂/全身立姿锚点。
  - 待机余兴轮播：无 clip 待机时每 25–40s 随机插一段（上限 3.9s），与反应/头部叠加兼容，避免待机只剩重心换脚。
- 行为/场戏扩容（第二轮）：
  - 新增 L1 姿势 `pose.bow` / `pose.hands-on-hips` / `pose.chin-rest` / `pose.yawn`，全部通过 JOINT_LIMITS 校验。
  - 新增 L2 动作 `motion.bow` / `motion.yawn`，首尾 `pose.idle-body`，避免 T-pose 泄露。
  - 新增 L3 行为 `behavior.bow` / `behavior.hands-on-hips` / `behavior.chin-rest` / `behavior.yawn`：鞠躬/打哈欠为一次性 enter→exit，叉腰/托腮用 loop 保持并由场景结束时停行为。
  - 新增场戏 `moment.bow` / `moment.hands-on-hips` / `moment.chin-rest` / `moment.yawn`，共用 `touch::body::tap`；`useScriptDirector.playEvent` 增加同触发键轮换游标，身体单击依次轮换「原戳一下反应 → 鞠躬 → 叉腰 → 托腮 → 打哈欠」。
  - 验证：animation + script 231 测试、vrm 33 测试通过；typecheck、行数/结构/循环门禁全绿；golden 仅新增 4 条行为快照。
  - 文件：`animation/poses/daily.ts`、`animation/motions/{postures,index}.ts`、`animation/behaviors/{gestures,index}.ts`、`script/scenes/{moments.ts,touch.test.ts}`、`script/use-script-director.ts`。
- 验证：动画 + VRM 188 测试通过；typecheck、行数/结构/循环门禁全绿。
- 文件：`animation/adapters/{vrm-executors,vrm}.ts`、`animation/motions/{postures,index}.ts`、`animation/__tests__/motions/motion-library.test.ts`、`vrm/overlay/vrm-idle-overlay.ts`。
- 待验：5 个余兴姿势在真机待机中的观感（停留 25–40s 可见）；不合适可从 `ACCENT_MOTIONS` 移除。

### 2026-11-12 P5.5 拥抱行为

- L1：`pose.hug`（上身前倾 + 双臂环抱，欧拉兜底值与 react-flinch 同源）。
- L2：`motion.hug` 2200ms，首尾 `pose.arms-hang` 显式锚点。
- L3：`behavior.hug` 一次性 enter → exit（`pose.idle-body`），morph 走 `expr.shy` / `eye.smile`。
- 场戏：`moment.hug` 接入 `touch::body::tap` 轮换（第 6 个候选，cooldown 120s）。
- 测试：animation 162、script 72 通过；golden 新增 `behavior.hug` 快照；typecheck、行数/结构/循环全绿。
- 遗留：拥抱幅度与手部穿模待真机统一验收；「后退」未单独接线（现有 `pose.react-lean-back` 可复用），「被拎起」已有 `behavior.lifted` / `behavior.land`。

### 2026-11-12 动作节奏、悬空挣扎与动效 Wiki

- 普通手势放慢：鞠躬 2200ms、打哈欠 3000ms、拥抱 2800ms；叉腰/托腮 enter 800/900ms；新增 `PhaseDefinition.fadeMs`，普通动作 500–700ms、被拎起 120ms。
- 悬空挣扎改为多轴慢频：手脚同时有前后/左右分量，左右相位差 π，不同频率叠加，不再像正步；root 保持固定，只做垂直上提。
- 场景 beat 与动作时长对齐（鞠躬 2300 / 打哈欠 3100 / 拥抱 2900）。
- 新建独立动效库 Wiki：`docs/wiki/motion-library/`（README、changelog、pitfalls、plans），并在 10-motion-library 顶部挂入口。
- 验证：animation 171 + script 72 通过；真机采样四肢 x/z 持续变化、`sceneY` 稳定；typecheck、行数/结构/循环门禁全绿。

### 2026-11-12 动作起手双手后翻定位

- 现象：动作切换时，某个动作起手双手翻到身体后侧。
- 定位：逐帧采样双手世界坐标。**叉腰**双手 z 约 -0.08，100 帧里 79 帧双手都在身体后侧；**鞠躬**起手因躯干前倾，双手也有约 16 帧落后于身体。
- 修复：叉腰前臂目标 z 从 -0.2 改为 +0.08（手落腰侧/略前）；鞠躬双臂目标改为略前摆（`BOW_UPPER/BOW_LOWER`），不再垂直落向身后。
- 验证：修复后所有动作起手、动作互切、退出、触摸反应中「双手同时在身后」的帧数均为 0；叉腰 minZ -0.016，鞠躬 minZ -0.009。
- 回归：新增「叉腰双手在腰侧，不藏到身后」断言；171 animation + 72 script 测试、typecheck、行数/结构/循环门禁全绿。

### 2026-11-12 点击/拎起判定与被抓固定

- 点击歧义：窗口跟手拖动后 `clientY` 不再变化，导致「拎起」阈值（-24px）有时永远达不到，被当成点击触发动作切换。`PetHitBody` 的拖拽/拎起/点击抑制改用 `screenX/screenY`，向上拖动可稳定进入拎起；位移 ≥6px 后不再算点击。
- 被抓固定：`motion.lift-hover` 去掉 yaw/roll 与上下颠，root 只保留垂直上提；挣扎全部由四肢执行器表现，抓点/主干不再摇摆。
- 表情与台词：`behavior.lifted` 进入惊讶、loop 转为生气（brow/eye/mouth.angry）；`touch.raised-tap` 去掉搭档等级门槛，`raised` 台词池新增「喂喂，要干嘛呀？先放我下来。」。
- 验证：真机按住 0.4/1.2/2.4/3.6s，`sceneY` 稳定在 3.151–3.153，四肢方向持续变化；松手落地手臂保持垂臂。170 animation + 72 script + 78 shared 测试、typecheck、行数/结构/循环门禁全绿。
- 遗留：单击（位移 ≤6px）仍会触发身体动作轮换；如需「单击也只做轻反应、不再切动作」，需再调整点击语义。

### 2026-11-12 被拎起持续挣扎

- 反馈：按住角色拎起时只动一下，之后像静止；应持续挣扎。
- 根因：行为 loop 其实一直在跑，但 Composer 的姿势执行器固定传 `t=0`，`pose.arms-limp` / `pose.legs-dangle` 的摆动被冻结；`motion.lift-hover` 只有很小的 root 摆动。
- 修复：
  - `ComposeTrack.executor` 增加 `timeMs`，执行器按行为总时长驱动，`pose.lift-struggle` 四肢交替摆动。
  - 新增 `pose.lift-struggle`（L1）与执行器：手臂外展/前臂甩动、双腿交替踢动，左右相位差 π。
  - `motion.lift-hover` 增大 yaw/roll（0.12/0.08）并加入轻微上下颠。
  - `behavior.lifted` loop 改用挣扎姿势；exit 增加垂臂基准，`behavior.land` enter/exit 补手臂回落，修复松手落地时回 A-pose。
- 验证：真机按住 0.4/1.2/2.4/3.6s，四肢方向持续变化；松手后 land 阶段手臂保持垂臂。170 animation + 72 script 测试、typecheck、行数/结构/循环门禁全绿。
- 遗留：挣扎幅度/频率与手指张开程度待真机观感确认。

### 2026-11-12 手势大臂规则修正

- 反馈：鞠躬/叉腰/托腮/打哈欠/拥抱的大臂被过度外展，看起来像伸懒腰；正常人大臂只微调方向，主要变化在小臂。
- 根因：这些行为走 Composer 的欧拉姿势轨道，大臂 x/z 角度过大；世界方向执行器此前只在待机/直接动作路径生效，行为轨道没有走执行器。
- 修复：
  - Composer 新增执行器轨道（`executor: { id, progress }`），`VrmAnimationRuntime` 解析 pose/motion 时优先世界方向执行器；motion 进出复用 `resolveTransitionExecutor`。
  - 新增 `pose.bow` / `pose.hands-on-hips` / `pose.chin-rest` / `pose.yawn` / `pose.hug` 执行器：躯干单独应用，大臂保持自然下垂附近，小臂负责主要方向变化。
  - 调整叉腰前臂目标（手落到髋部两侧）、托腮前臂目标（手到下巴）、拥抱上/前臂目标（双手分开环抱，不再合掌）。
  - 轨道解析拆到 `adapters/vrm-compose.ts`，控制 `vrm.ts` 行数。
- 回归：新增 `executors/gestures.test.ts`，断言大臂相对自然下垂 < 40°、小臂变化 > 大臂 1.5 倍、拥抱双手间距 > 15cm；golden 改为分层人形 rest 骨架，8 个行为快照更新。
- 验证：animation + script 240 测试通过；typecheck、行数/结构/循环门禁全绿；真机截图复核五个手势。
- 修复动作切换闪回 T/A-pose：行为权重从 0 起步，执行器此前在 weight=0 时不写骨骼，底层绑定姿态会露出。手势执行器改为「weight 0 也先写自然垂臂，再按权重过渡到目标」；`pose.arms-limp` 同样先写垂臂。`pose.arms-hang` 保留 weight=0 让位给 clip 的语义，避免覆盖 VRMA 手臂动画。
- 回归：`gestures.test.ts` 增加 weight=0 手臂接近自然下垂断言；真机探测 hug/bow 切换 +45ms 上臂仍在垂臂方向（非水平 T-pose）。
- 交叉淡化（2026-11-12）：新增 `adapters/vrm-crossfade.ts`，行为切换瞬间捕获上一帧手臂姿势，作为 Composer 的帧基准；执行器从上一姿势直接向新目标过渡，不再先回垂臂。最短 180ms，权重 ≥0.95 或 500ms 上限后释放。
- 退出回落：新增 `pose.gesture-hang`（weight 0 也写自然垂臂）与手势 exit 轨道「垂臂基准 → idle-body → 目标姿势」，权重下降时从目标平滑回落到垂臂，修复退出阶段回 A-pose。
- 验证：真机探测叉腰→鞠躬 +45ms 上臂仍接近叉腰（躯干前倾导致世界 z 略变），鞠躬退出时上臂保持垂直；169 animation + 72 script 测试、typecheck、行数/结构/循环门禁全绿。
- 遗留：更强接触动作（握手/接吻）如需精确手部落点，后续加两骨 IK。

### 2026-11-12 开发端口统一

- 原因：`3000` 是 Next.js 默认端口，早期 `dev.mjs` 直接沿用，与其他项目冲突概率高；`9222` 也是常见 CDP 端口。
- 新约定：Web dev **42337** / Electron CDP **42338** / E2E **42339**，均可用 `WBFM_DEV_PORT` / `WBFM_DEBUG_PORT` / `WBFM_E2E_PORT` 覆盖；生产托管服务仍用随机回环端口。
- 改动：`apps/web/package.json`、`apps/desktop/scripts/dev.mjs`、`apps/desktop/src/main/{config,index}.ts`、`apps/web/playwright.config.ts`、`scripts/dev-web.ps1`、`scripts/eval/*`、`scripts/perf/pet-longrun.mjs`，以及 README / development / architecture / api 文档。
- 重启验证：旧 3210 dev server 与 9222 Electron 已停止；`pnpm dev:desktop`（带 `WBFM_PET_SCRIPT=1`）拉起 42337/42338，`/api/health` 200，桌宠页 `__petDebug` 22 场戏、桥含 `reportCompanionSettings`。
- 遗留：旧地址收藏/书签需改；历史 blog 与旧版本发布说明里的 3000 保持原样。

### 2026-11-12 内置 VRM 角色声线（M3 切片）

- `BUILTIN_VRM_TTS_VOICES`：`builtin:xuetuan` → sid 18（zf_026）、`builtin:rankaluli` → sid 32（zf_049）、`builtin:feibi` → sid 3（zf_001）。
- `getAvatarSpeakerId` 支持 `vrm:` 前缀：内置角色按 fileRef 查表，未登记的导入 VRM 继续回落默认角色声线。
- 测试：shared voice 12 项通过；typecheck、行数门禁通过。
- 遗留：三个声线为初选，待真机试听确认；导入 VRM 暂不支持自定义声线。

### 2026-11-12 桌宠右键菜单勾选态

- `WbfmPetBridge` 新增 `reportCompanionSettings`；伴身 hook 在 `ttsEnabled` / `proactiveEnabled` 变化时上报静音与主动说话状态。
- 主进程新增 `PetCompanionSettingsStore`（只接受完整布尔字段，非法上报忽略），右键菜单两项改为 checkbox，弹菜单时读取最近上报值。
- 测试：desktop pet 74、web companion 5 + relay 18；typecheck、行数/结构门禁通过。
- 遗留：需真机确认菜单勾选态与设置页同步（设置写走 BroadcastChannel，桌面壳重启后由渲染层首次挂载重新上报）。

### 2026-11-12 P0 家族校验脚本

- 新增 `scripts/avatar/validate-family.mjs` 与 `pnpm check:family`。
- 校验：49 骨骼集合、骨骼父级（按骨骼名而非节点索引）、rest 四元数 ≤ 0.5°、面部 mesh 每个 primitive 的 118 morph、`targetNames` 顺序、18 个 VRM 表情 bind 索引、morph 仅 POSITION。
- 实测：内置 3 个角色 + `AI模型精简版` 15 个样本 = 18/18 PASS（rest 0°、11 primitive × 118 morph、18 binds）。
- binding/fingerprint 已在仓库：运行时 `animation/bindings/animeart-v1.json`（zod `binding.ts`），评审快照在 `docs/plan/archive/v3/v3.0/pet-engine/bindings/`。
- 新增 T0.9 采样脚本 `scripts/perf/pet-longrun.mjs`（`pnpm perf:pet-longrun`）：每 5 分钟采样 10s，记录 rAF p95、WebGL clear、堆、DOM，输出 `.tmp/t09-longrun.jsonl`。
- 遗留：T0.9 4h 未跑，需要 `WBFM_PET_SCRIPT=1` 的 dev server 会话与 4h 窗口；跑前先用 1 分钟短采样确认 `__petDebug` 挂载。

### 2026-11-12 抓取动作 4 倍速

- 交叉淡化支持自定义时长：抓取/落地 45ms（原 180ms），普通动作不变。
- `behavior.lifted` enter 80ms / exit 75ms；`behavior.land` enter 80ms / exit 30ms；对应 fadeMs 同比缩短。
- root 上提/回落 320/300 → 80/75ms；`pose.lift-struggle` 摆动频率 ×4（主频约 1.1Hz），幅度与多轴相位保持不变。
- 测试：animation + script 243 项通过；golden 快照更新；typecheck、行数/结构/循环门禁通过。
- 备查：悬空测试改为 0.15s 密集采样，避免高频摆动在稀疏采样点混叠。

### 2026-11-12 悬空手指与落地交叉淡化

- 悬空挣扎增加手指动画：四指共享伸缩包络（微小相位差），拇指独立频率/相位并轻微外张，相对 `baseQuat` 写入。
- 放下首帧 A-pose 根因：`lifted exit → land enter` 在 `runner.update()` 帧内切换，`captureFrame` 已把手臂重置为 mixer 姿势，`BoneCrossFade.begin` 读到 T-pose。
- 修复：每帧 mixer 写骨骼前 `rememberFrame()` 缓存上一帧最终手臂姿势，`begin` 优先使用缓存；`VrmController` Step 0.7 接线。
- 真机采样：`behavior.land/enter` 首帧 `leftUpper=(0.258,-0.964,0.066)`，为垂臂；悬空 index/thumb 屈曲角持续变化。
- 测试：animation/script/vrm 278 项通过；typecheck、行数/结构/循环门禁通过。

### 2026-11-12 表情多网格与动作交接过渡

- 表情不联动根因：家族模型把脸拆成 11 个 `Body_Model_up_N` primitive，morph 名为数字；旧执行器按 `Body_Model_up` 查找失败，morph 层整体不可用。
- 修复：`MorphExecutor` 支持多网格；新增前缀 + morph 数量 + 已校验索引顺序的回退绑定。真机 raw morph 24/64/75 = 0.30/0.55/0.35（嘴/眉/眼联动）。
- 交接跳变根因：交叉淡化 500ms 强制释放（权重约 0.53）回 A-pose；`pose.idle-body` 手臂欧拉与垂臂基准叠加；一次性动作 exit 重摆目标姿势。
- 修复：淡化等权重 ≥0.95；手势 enter/loop 加 `pose.arms-hang` 基准；一次性动作用 `settledExit`；新增 `pose.idle-torso` 锚点；行为结束垂臂权重 0.7→1。
- 真机采样 hips→bow：最大单帧臂向变化 24.2° → 5.63°（淡化释放 3.77°、exit 起始 5.63°）。
- 测试：animation/script/vrm 279 项通过；typecheck、行数/结构/循环门禁通过。

### 2026-11-12 伸懒腰路径与干饭手臂

- work-rest 一闪而过的「双臂横展、掌心朝上」根因：伸懒腰从垂臂直接插值/aim 到正上方，欧拉横向穿过 T-pose；方向接近 180° 时最短弧随意选轴。
- 修复：新增 `pose.stretch-cycle` 执行器，按「垂臂 → 前平举 → 上举」分段路径抬落；`behavior.wake` 改用该执行器，exit 用 gesture-hang + idle-torso。
- 干饭 `pose.eat-hold/eat-bite` 欧拉会把双臂绞在胸前；新增 `pose.eat-cycle` 执行器，端碗/送口走世界方向目标。
- work-focus / scold-fat / head-pat 的 exit 统一改为 gesture-hang + idle-torso，去掉 idle-body 手臂欧拉叠加。
- 验证：work-rest 场景 34 帧采样无 T-pose 闪帧；eat-rice 逐帧端碗/送口自然；animation 173 + script/vrm 106 测试通过；typecheck、行数/结构/循环门禁通过。

### 2026-11-12 伏案起手手臂

- `behavior.work-focus` 起手第一帧双手绕到身后：`pose.lean-desk` 的欧拉手臂叠加在上一姿势基准上，且 x 轴实际是沿臂长 roll。
- 修复：新增 `pose.lean-desk` 执行器，躯干/腿沿用原数据，手臂改为世界方向前伸目标。
- 验证：work-focus 16 帧采样，起手与保持阶段双臂都在身前；animation 173 + script/vrm 106 测试通过；typecheck、行数/结构/循环门禁通过。

### 2026-11-12 抓起释放兜底与点击不切换

- 根因：窗口跟手/指针移出命中盒时 `pointerup` 丢失，`behavior.lifted` 停在 loop；它 priority 1 且 `interrupt: 'all'`，后续点击行为全部排队，所以点击也不切换动作。
- 修复：`useRaisedGesture` 增加全局 `pointerup`/`pointercancel` 兜底释放；命中盒 `buttons===0` 自愈分支同步 `release()` 与 `endInteraction()`。
- 验证：真实 pointerdown → 上移 → window pointerup：`lifted → land → null`；随后 `playBehavior('behavior.hands-on-hips')` 立即接管；pet 43 项测试通过；typecheck、行数/结构/循环门禁通过。

### 2026-11-12 手掌朝向修正

- 伏案/待机「手像扭到身后」的残留根因：`aimBone` 只对齐方向不控制 roll，手部 fidget 又覆写手骨，掌心朝外。
- 修复：新增 `orientPalm` 绕前臂轴校掌；待机在 fidget 后把掌心转向大腿；`pose.lean-desk` 把掌心转向桌面；干饭/伸懒腰拆到 `vrm-arm-cycles.ts`。
- 验证：待机掌心法线由 ±X 变为朝大腿，work-focus 掌心朝下（dotUp ≈ -0.9）；第一帧截图自然；302 项测试通过；typecheck、行数/结构/循环门禁通过。

### 2026-11-12 伸懒腰掌心翻转

- 伸懒腰抬手时掌心翻到上面：`aimBone` 不控制 roll，stretch-cycle 未校正掌心。
- 修复：`aimStretchCycle` 在抬臂过程中按路径同步转掌，前平举阶段掌心朝下，垂臂/上举阶段朝内。
- 验证：work-rest 34 帧采样掌心不再翻上；animation 196 + script/vrm/pet 149 测试通过；typecheck、行数/结构/循环门禁通过。

### 2026-11-12 全局掌心统一与手臂求解排查

- 逐动作补掌心导致掌心朝向随机、越改越乱：手骨 roll 没有单一所有者，fidget/pose/crossfade 都会继承或覆写。
- 修复：`vrm.update` 前统一 `orientPalmsInward()`，移除伏案/伸懒腰的逐动作掌心补丁；8 个动作采样掌心内积均 >0.9。
- 结论：方向、肘平面、腕 roll 应由同一 ArmSolver 一次算完；后续按阶段迁移到 swing-twist + pole + wrist roll，避免继续打补丁。
- 验证：302 项测试通过；typecheck、行数/结构/循环门禁通过。

### 2026-11-13 统一手臂求解器与掌心轴修正

- 问题：全局强制掌心朝内对垂臂有效，但伏案（应朝下）、干饭（应朝上）、伸懒腰（应朝前）被改错；同时掌心局部轴判反，内外/上下整体反转。
- 修复：新增 `animation/arms/intents.ts`（意图表）与 `solver.ts`（唯一求解入口，方向 + 腕 roll）；删除全局内扣与逐动作 `orientPalm`；`PALM_LOCAL` 改为局部 `-Y`；`frameYaw` 贯通行为轨道。
- 验证：真机探针 8 动作——伏案 `up=-0.93`、干饭 `up=0.98`、伸懒腰 `forward=0.97`、其余 `inward≥0.9`；avatar+pet 409 项测试通过；typecheck、行数/结构/循环门禁通过；golden 15 项更新。

### 2026-11-13 帧区域台账（区域所有权第一步）

- 问题：同一身体区域有 base clip / 行为 / 待机垂臂 / 叠加层多个写者，仅靠 if 条件避让；出问题无法回答「这一帧是谁写的」。
- 实现：`animation/frame/ledger.ts`（区域 claim、优先级、冲突检测）+ `behavior-claims.ts`（行为轨道 mask 投影）+ `vrm/overlay/vrm-frame-ledger.ts`（接线）；`__vrmDebug.state().frames` / `controller.frameDebug` 可读。
- 验证：真机待机 `arms=idle:relax`、`work-focus/hands-on-hips` 全区域 `behavior:*`、tap 反应 `spine/head/arms=idle:react`，冲突 0；animation/vrm/script 312 项测试通过；typecheck、行数/结构/循环门禁通过。
- 下一步：winner 变为写权限 + 固定拓扑序；再迁移剩余欧拉手臂。

### 2026-11-13 固定拓扑序第一步：阶段归属 + 掌心最后写者

- 问题：呼吸/手部防穿模在手臂求解之后改写上臂，手骨随子节点旋转，掌心最终 roll 被带偏。
- 实现：`animation/frame/ownership.ts`（骨骼 → 阶段、`root→legs→spine→head→arms→hands→fingers`、父子顺序断言）；`arms/solver.ts` 登记掌心意图并新增 `reapplyPalms()`；`applyBodyIdle` 在 liveliness/clearance 之后重新滚腕。
- 验证：ownership 4 项 + 掌心最后写者 1 项新增测试；avatar+pet 422 项通过；真机 8 动作掌心数据无回退；typecheck、行数/结构/循环门禁通过。
- 下一步：Composer 按阶段拆分写入 + 同区域同优先级拒绝后写者；再迁移剩余欧拉手臂。

### 2026-11-13 Composer 阶段拆分

- 问题：Composer 按 priority + 轨道声明顺序写骨骼，全身体态轨与手臂轨混排；手臂可能先于脊柱落盘。
- 实现：`stageOfTrack()` 把触及手臂子树的轨道统一归到 `arms`，纯躯干/腿/头归各自阶段；`compose()` 先按 `STAGE_ORDER` 再按 priority/轨道顺序执行。
- 验证：avatar+pet 425 项通过；golden 16 项未变化（当前行为集观感一致）；真机台账冲突 0；typecheck、行数/结构/循环门禁通过。
- 下一步：同区域同优先级拒绝后写者（帧计划先决议 winner），再迁移剩余欧拉手臂。

### 2026-11-13 帧计划写入前决议与拒绝后写者

- 问题：帧台账只在写入后记录冲突，winner 没有变成写权限，画面仍由后写者决定。
- 实现：新增 `frame/regions.ts`（共享定义）与 `frame/plan.ts`（`resolveClaims`/`FramePlan`）；`FrameLedger` 复用决议；`VrmFrameLedger` 拆成 `beginFrame/allows/commit`；控制器在待机垂臂前查询 `allows('idle:relax')`，同优先级落败者不写。
- 验证：plan 5 项新增测试；avatar+pet 430 项通过；真机台账冲突 0；typecheck、行数/结构/循环门禁通过。
- 下一步：迁移剩余欧拉手臂；前置是 `applyMotion` 在混合关键帧时绕过执行器，需要补意图混合。

### 2026-11-13 生气叉腰迁入手臂意图

- 行为链路上最后一条纯欧拉手臂：`pose.scold-huff`（`behavior.scold-fat`）。
- 实现：新增 `SCOLD_HUFF` 意图与 `pose.scold-huff` 执行器；躯干/头保留原姿势，手臂走 `solveArmPair`。
- 验证：真机双手落在髋部、肘部外张、掌心 inward 0.93；430 项测试通过；golden 仅 scold-fat 更新；门禁通过。
- 遗留：`motion.wave/shy/stretch-up` 与待机余兴仍有欧拉手臂，但当前有 idle clip 时不走 procedural 路径；需先决定接回余兴或清理。

### 2026-11-13 待机余兴接回 clip 待机

- 问题：有 idle clip 时 `procedural=false`，待机余兴从未播放；即使播放，`relaxArms` 也会覆盖手臂。
- 实现：`updateAccent()` 移出 `procedural` 分支；余兴登记 `idle:accent` claim（priority 12，全身体），余兴期间 relaxWeight=0；行为接管时清空余兴并重置排期。
- 验证：真机强制 `motion.hands-front`，台账六区域 `idle:accent`，清除后恢复 `idle:relax`，冲突 0；手臂方向与姿势基准一致；432 项测试通过；门禁通过。
- 下一步：余兴动作按需迁入意图表；清理未引用的 `motion.wave/shy/stretch-up`。

### 2026-11-13 待机余兴手臂迁入意图表

- 问题：余兴/动作采样仍走欧拉手臂，与行为动作的求解器不一致，手部 roll 依赖姿势基线。
- 实现：`arms/pose-intents.ts` 登记双手身前/插兜/抱臂/害羞/垂臂意图；`arms/motion-intent.ts` 在 `applyMotion` 应用姿势/混合后按进度插值意图并调用 `solveArmPair`。
- 验证：4 个余兴/动作关键帧手臂方向与意图偏差 <0.01 rad；真机 hands-front 方向与意图一致；avatar+pet 436 项通过；typecheck、门禁通过。
- 遗留：`motion.wave/shy/stretch-up` 未引用，保留欧拉数据；需要时再登记。

### 2026-11-13 wave/shy 接回点击兜底

- 排查：Git 基线没有这三个 id，`motions/gestures.ts` 是未提交新内容，未发现引用被改坏的痕迹；`stretch-up` 是伸懒腰修复时刻意换成 `pose.stretch-cycle`。
- 实现：`VrmController.playMotion` 播放内部 MOTION；点击顺序改为反应 → VRMA（池 >1）→ wave/shy → 程序化手势；`pickMotionGesture`；反应时清余兴。
- 验证：真机 `motion.wave` 台账 `idle:react`、冲突 0，右手抬到肩上方，结束后回 `idle:relax`；437 项测试通过；门禁通过。

### 2026-11-13 P8 与动效库衔接评估

- 结论：P8 的「AI 受限剧本 + 引擎演出」组合路线成立；当前动效库重构就是 P8 的动作原语层与冲突治理层。
- 现状：POSES 约 60 / MOTIONS 23 / BEHAVIORS 15；`wave/shy` 已接点击兜底；`playMotion` 可播内部 MOTIONS；`FramePlan/FrameLedger/arms solver` 已就绪，生成 cue 的组合冲突可查。
- 启动 P8 前补齐：`validateScene` 白名单校验、`sceneBusy` 门控（抑制余兴/点击兜底）、脚本专用 `script:motion` overlay；热点抓取仍默认关闭。
- 记录位置：`execution-roadmap.md` P8 章节已补「与当前动效库的衔接」。

### 2026-11-13 松手立即落地、行为队列拥塞与摸头手臂

- 问题：同级/低优先级行为无限入队，连续点击后拥塞；松手依赖 exit→queue，挣扎继续；摸头 nuzzle 的大臂欧拉 z 把手臂甩到侧面。
- 修复：`BehaviorRunner.playNow` 强制接管 + 清队列 + 队列上限 4；场景 cue 走 `playBehaviorNow`；`setRaised(false)` 直接强制进 land；`pose.react-nuzzle` 执行器只写头颈、手臂走 HANG。
- 验证：真机松手 40ms 进 land、120ms 回 idle；连续 3 次强制行为队列为 0；head-pat 手臂 `±0.26,-0.97`、掌心 inward 0.94；439 项测试通过；golden 仅 head-pat 更新；门禁通过。

### 2026-11-13 场景行为归属停止与待机恢复

- 问题：待机出现头歪、手臂停在某个姿势、没有微摆；排查发现 `behavior.head-pat` 卡在 loop 85 秒，活动场景已为空。
- 根因：`VrmCueAdapter.end` 只在「没有其他场景行为」时才停，另一个场景条目让它跳过；行为接管时 reaction 未清，`reacting` 残留抑制 relax。
- 修复：场景结束按本场景行为 id 精确停止 + 清队列；行为 id 不匹配拒绝停止；行为接管时清空 reaction。
- 验证：摸头场景 +1s loop、+3.2s 行为/场景/队列全空；待机 owner 回到 `base:clip + idle:relax`；2 秒微摆 hand 0.053 / foot 0.017 / finger 0.522；强制 hands-pocket 余兴 4.6s 后清除并恢复微摆；439 项测试通过；门禁通过。

### 2026-11-13 头部拖拽改用屏幕坐标

- 问题：拖身体能拎起，拖头部不能；其他问题未复现。
- 根因：头部命中盒用 `clientY` 计算 dy，窗口跟手后 clientY 不变，永远到不了 24px 阈值；身体盒已用 `screenY`。
- 修复：`PetHitHead` 的按下点与 dx/dy 改为 `screenX/screenY`。
- 验证：合成指针事件保持 clientY 不变、screenY 上移 60px → lifted loop；pointerup → idle；126 项 pet/script/pose 测试通过；typecheck、行数/结构门禁通过。

### 2026-11-13 桌宠窗加高与拎起头部余量

- 问题：大小选大后拖起角色，头顶被透明窗上沿裁掉。
- 根因：`PET_SIZE_SCALE.lg=1.2` 在高度受限的取景上再放大，模型已轻微超出视口；拎起 root.y=0.1 后裁头。只加高窗口无效，相机会按新高度重新取景。
- 修复：窗高 340→400；桌宠取景改「脚底贴底 + 顶部 10% 余量」，放大后 scale 被 headroom cap 截断；主窗仍居中。
- 验证：260×400 + lg，`scale=0.970`、`fitsX/fitsY=true`；拎起截图头部完整、头顶约 50px 余量；web 441 + desktop 74 测试通过；门禁通过。
- 重启主进程复验（2026-11-13）：新窗视口 260×400（dpr 1.5），`fit.scale=0.9701`、`fitsX/fitsY=true`；待机/拎起截图头脚完整，脚底贴底；`setRaised(false)` 后 2s 行为为空、手臂 owner 回 `idle:relax`，无残留队列。

### 2026-11-13 道具层规划（P8 前置）

- 结论：道具独立 GLB、不写进 VRM；运行时不做联网下载，AI 只提案，资产离线入库后剧本只引用 `prop.id` 白名单。
- 归属：挂载/加载放 `vrm/props`，持物手型 `cup-hold` 进动效库 L1，`prop` cue 进 shared schema；不进入 Composer 骨骼轨道，仅 `prop:hold` 在 FrameLedger claim 左右臂（priority 20）。
- 顺序：程序化茶杯原型 → 3 个 CC0 资产入库 → `prop` cue 接入 → 场景道具/对象池 → 道具自身动画。
- 详见 [plans.md](../../../../wiki/motion-library/plans.md) 的「P8 前置：道具层」。

### 2026-11-13 S1 道具层茶杯原型

- 实现：`VrmPropLayer` 程序化茶杯挂 `rightHand` raw bone；`cup-hold` 半握只写手指；`PROP_HOLD_RIGHT` + `pose.prop-hold` 执行器把右臂抬到髋前；帧台账新增 `prop:hold`（priority 20，只 claim 持物手）；`VrmController.attachProp(id, on)` 作为 dev 入口。
- 验证：260×400 桌宠窗 attach 后 `props.hold=pose.prop-hold`、右臂 owner `prop:hold`，杯心沿掌心法线 4.8cm + 掌侧向 2.2cm、完整入画；detach 后 owner 回 `idle:relax`；单测覆盖挂载/幂等/卸载/未知 id/持物手型/执行器；web 全量 231 文件 1177 项、typecheck、行数/结构/循环门禁通过。
- 遗留：握持为近似接触，不透明杯身下不可见穿模；S2 换 GLB 时按资产调整握持点与手型。

### 2026-11-13 S2 道具 GLB 入库与 manifest

- 资产：`scripts/avatar/generate-props.mjs` 生成 `public/props/{teacup,bowl,book}.glb`（项目自建 CC0-1.0，5.7–15.6 KB），根脚本新增 `pnpm props:build`；`ASSETS-LICENSE.md` 登记来源/许可/原点约定。
- 运行时：新增 `prop-manifest.ts`（id/url/kind/license/contact/lateral/handPose/scale/yaw）；`VrmPropLayer` 改为异步加载 GLB，加载期间先进入持物姿态，detach 可取消 pending；`attachProp` 返回 Promise。
- dev 验证：新增 `usePetPropDebug`，桌宠窗聚焦时按 `1/2/3` 切换茶杯/碗/书、`0` 卸下（仅 dev；生产构建不注册）。
- 验证：260×400 桌宠窗 teacup/bowl/book 逐一 attach/detach，`props` 与右臂 owner 正确切换，三张截图完整入画；书 contact=0.10 避免手指穿封面；单测 7 条覆盖加载/pending 取消/幂等/卸载/未知 id/manifest 校验；web 全量 232 文件 1180 项、typecheck、行数/结构/循环门禁通过。
- 遗留：书/碗复用 `cup-hold` 手型，S3 接 `prop` cue 时按资产再调手型；外部 CC0 GLB 替换同名文件即可。

### 2026-11-13 S3 剧本 prop cue

- 契约：shared 新增 `PropCue`（`prop` + `attach/detach/show/hide`），`cueTrack` 归 `world`，与 body/voice/face 并行。
- 执行：`VrmCueAdapter` 按 `PROPS` 白名单校验；`propScenes` 按场景记录，场景结束/打断自动 detach，多场景共用不抢卸；`show/hide` 暂映射 attach/detach。
- 场景：新增 `moment.tea`（body tap 轮换）：0s 挂茶杯 → 3.2s 卸下 → 场景结束。
- 验证：shared cues/scene 10 项、adapter 19 项、moments 10 项通过；`moment.tea` 经 Director → Adapter → Controller 的 attach/detach 闭环有集成测试；web 全量 233 文件 1185 项、typecheck、行数/结构/循环门禁通过。
- 待真机：以 `WBFM_PET_SCRIPT=1` 重启桌面端后触发 `moment.tea`，检查 cue 日志与茶杯生命周期。

### 2026-11-13 S4 场景道具与对象池

- 资产：`table.glb` 入库（4.1 KB，自建 CC0），manifest 增加 `kind: 'stage'` 与 `position/rotationY/scale`。
- 运行时：`VrmPropLayer` 支持 hand/stage；stage 挂渲染场景根节点（不是 `vrm.scene`），不跟随拎起/呼吸；GLB 只加载一次并进入对象池，detach/hide 只换父节点，dispose 统一释放。
- 契约：`attach/detach` 只对 hand、`show/hide` 只对 stage，错配丢弃并 warn；场景结束按 kind 自动清理。
- 场景：`moment.tea` 同时挂茶杯 + 显示桌子，3.2s 后一起收起。
- 验证：桌宠窗按 `4` 显示桌子、`0` 全部收起；web 全量 233 文件 1188 项、typecheck、行数/结构/循环门禁通过。
- 遗留：桌子是自建低模占位；S5 道具自身动画未接。

### 2026-11-13 S5 道具自身动画

- 采样：`prop-animation.ts`（4.8s 循环）输出倾倒角、书封开合角、水柱透明度；`prop-animation-apply.ts` 写入 three 对象。
- 运行时：manifest 增加 `animation` 白名单，teacup=pour、book=flip；`VrmPropLayer.update(dt)` 由 `VrmController` 在 `vrm.update` 后、render 前调用，与角色共用同一 dt。
- 资产：`book.glb` 封面改为书脊枢轴 `book-cover`；茶杯挂载时补 `wbfm-pour-stream` 水柱。
- 验证：真机 pour 杯身倾倒、水柱 opacity 0.548；flip 封面 `coverY=-1.2`；web 全量 234 文件 1191 项、typecheck、行数/结构/循环门禁通过。
- 说明：水柱为单根半透明圆柱，不做液体碰撞；翻页为封面开合，多页翻动留后续。

### 2026-11-13 P8 三个桥接点

- 校验：新增 `script/validation/validate.ts`；按 POSES/MOTIONS/BEHAVIORS/表情/台词池/道具白名单清洗 cue，branch 递归、空 branch 丢弃；`useScriptDirector` 启动时清洗内置场景并在 dev 打印丢弃原因。
- 场次门控：`VrmIdleOverlay.setScriptBusy` 在剧本播放期间释放并抑制待机余兴；`useScriptDirector.onFrame` 每帧按活动场次同步；无触发键/无场景的旧点击在剧本进行中直接吞掉。
- 剧本动作：新增 `VrmScriptMotionOverlay`（全身 mask、loop/fadeMs、非循环结尾自动淡出），独立于触摸反应槽；`VrmCueAdapter` 按场景记录 motion，场景结束停止循环动作（共用不抢停）；帧台账新增 `script:motion`（priority 15）。
- 验证：新增 overlay 4 项、idle scriptBusy 1 项、adapter 场景清理 1 项；web 全量 236 文件 1201 项、shared 385 项、typecheck、行数/结构/循环门禁通过。
- 待真机：`WBFM_PET_SCRIPT=1` 下 `moment.tea` 与循环 `motion` cue 的完整验收。

### 2026-11-13 P8.1 原语注册表与时间约束 / P8.2 剧本池与 dev 面板

- P8.1 注册表：新增 `script/validation/registry.ts`，统一导出 `SCRIPT_PRIMITIVES` 与运行时集合视图；`validate.ts` 改为消费同一来源，避免白名单两处漂移。
- P8.1 约束：beat.at 限定 0..BEAT_MAX_MS，乱序稳定排序并记录；wait/holdMs/line.ms、gesture intensity、look weight、speak 文本与 VRMA fileRef 长度纳入校验；新增 Gate 用例覆盖 10 类合法原语与 10 类非法原语。
- P8.2 剧本池：新增 `scenes/pool.ts` 3 条手动剧本（morning-tea / reading-break / desk-stretch），覆盖道具、行为与 script:motion；并入内置场景后 23→26，Director 可完整播完并结束。
- P8.2 dev 面板：新增 `script/devtools/script-debug-panel.tsx`，分组播放全部场景、显示活跃游标与最近 12 条 cue 日志；`WBFM_PET_SCRIPT=1` 时挂在桌宠左下角，生产不渲染。
- 验证：registry 2 项、pool 5 项、validate 7 项通过；web 全量 238 文件 1212 项、typecheck、行数/结构/循环门禁通过。
- 修复：真机发现行为 cue 未强制接管——`useScriptDirector` 目标层漏了 `playBehaviorNow` 与 `stopBehavior(id, clearQueue)` 转发；补齐后 reading-break 能接管 work-focus，场景结束行为为空。
- 真机：面板点击三条 pool 剧本均通过——morning-tea 道具成对清理、reading-break 行为接管/停止、desk-stretch 剧本 motion 自动释放；面板展开/收起正常。

### 2026-11-13 P8.3 受限剧本生成器

- 契约：shared 新增生成请求/结果/用量与上限（3 次/日、20k 估算 token、24 beat / 30s、队列 6）。
- 协议与校验：`generation/protocol.ts` 用原语注册表拼受限提示词；`parse.ts` 在 `sceneSchema` 之上加生成专用约束（gen 前缀、触发键白名单、状态原语黑名单、道具成对、禁 VRMA/speak/branch），再过 `validateScene`，任何丢弃即整条拒绝。
- 服务与路由：每日预算 → 默认模型 → 提示词 → 文本 → 校验 → 入队；失败回落本地池且消耗一次调用；队列/用量存 `settings_kv`，跨天清零；新增 `GET/POST /api/pet/script`。
- 客户端：`useGeneratedScripts` + `useScriptDirector.extraScenes` 动态并入触发键索引；面板新增「生成剧本」、gen 分组与用量显示。
- 验证：generation 13 项 + director 动态触发 1 项；真机生成 `gen.work-streak-teacup`（9 beats、1612 tok、1/3），可播放且道具按时收起；web 241 文件 1226 项、typecheck、门禁通过。
- 下一步：P8.4 剧情状态机（剧情线/已用梗/悬念/去重），再把 P8.3 接到定时入口。

### 2026-11-13 P8.4 剧情状态机

- 契约：shared 增加剧情元信息（title/theme/tags/cliffhanger/resolves）与只读摘要；生成结果/队列视图带 `story`。
- 状态：`generation/story.ts` 持久化线索、当前悬念、最近主题与已用梗；`findDuplicate`（同主题或共享 2 标签拒绝）、`ingestStory`（续接/收线/开新坑）、`storyContextForPrompt`（生成前上下文）。
- 协议/服务：输出改为 `{ story, scene }` 并兼容裸 Scene；生成前带上下文，生成后去重入账；`settings_kv` 新增 `pet-script.story`。
- 面板：显示「线索 n · 悬念 …」，悬停看最近主题。
- 验证：story 5 项、parse +2、service +2；真机 `gen.work-streak-tea`（2/3 次，3473 tok）留下悬念「茶杯见了底…」，面板线索 1；播放后行为/茶杯清理干净；web 242 文件 1235 项、typecheck、门禁通过。
- 下一步：P8.5 定时入口（每天只跑 1–2 次）与 P8.6 回顾页。



### 2026-11-13 剧本面板穿透态可点击（P5.5.32）

- 现象：桌宠 `clickThrough=true` 时剧本面板点不到；面板在模型命中轮廓之外，主进程轮询判定为穿透，渲染层收不到点击。
- 修复：`PetHitPolygon` 新增 `ui`；`hit-proxy.ts` 将面板 DOMRect 与模型轮廓合并上报；面板默认收起、移到右上角，每 300ms 同步实际矩形。
- 验证：真实鼠标点击「剧本」可展开、点击 `pool.morning-tea` 可播放；身体点击仍触发 `touch::body::tap`；web 238 文件 1212 项、shared 14 项、typecheck 与门禁通过。


### 2026-11-13 P8.5 定时入口

- 调度：`generation/schedule/` 固定 10/16 点两窗口、每日最多 2 次、间隔 ≥4h；开关跨天保留、今日次数每天清零，默认关闭。
- 服务/路由：`createPetScriptScheduler` 无常驻定时器，tick 到期才生成（先记窗口再生成，失败也消费）；`GET /api/pet/script` 带 `schedule`，新增 `tick` / `schedule` 路由；装配收敛到 `generation/server.ts`。
- 客户端：启动 tick 一次 + 10 分钟心跳；面板新增「自动：开/关」与自动次数。
- 验证：schedule 3 项、scheduler 5 项；真机开启后立即触发（1/2、usage 3/3），模型漏 `behavior.` 前缀被拒并回落；web 244 文件 1243 项（默认并发在 dev 双进程下 OOM，改用 2 worker）、typecheck、门禁通过。
- 下一步：P8.6 日常回顾（「她今天做了什么」）与设置页开关。

### 2026-11-14 P8.8 主动播放（空闲预算 + claim 去重）

- 契约：shared 新增 `PetScriptPlaybackSummary`、`PET_SCRIPT_PLAYBACK_LIMITS`（每日 3 场 / 0–10、空闲 10 分钟 / 1–120）、claim 结果与请求 schema。
- 服务端：`generation/playback/` 纯函数 + 服务；`pet-script.playback` 跨天清零，按「关闭 → 勿扰 → 场次上限 → 当日去重」顺序阻断；claim 先扣预算再返回，避免客户端失败后反复重试。
- 路由：`GET/POST /api/pet/script/playback`（读取/修改场次与空闲阈值）、`POST /api/pet/script/playback/claim`（队列校验 + 勿扰 + 记账）。
- 客户端：`useProactivePlayback` 在有生成队列时每 30s 判定一次，空闲窗口内 `claim` 后交给 Director；语音非 idle、触摸、勿扰结束都会刷新空闲计时；`usePetSleep` 增加 `wake()`，播放前唤醒。
- 设置页：「AI 日常剧情」新增「每日主动播放」「空闲触发」与今日已播计数。
- 验证：playback 7 项、sleep 4 项、设置面板 1 项；`avatar/script + pet/stage + settings/script` 28 文件 179 项通过；web/shared typecheck 与行数/结构/循环/ASCII 门禁通过。
- 待真机：开启自动生成攒够队列后，静置 10 分钟观察主动播放与预算消耗；勿扰时段确认零播放。

### 2026-11-14 P9 P1 常用入口（收藏 + 最近访问）

- 新增 `lib/settings/shortcuts.ts`：只存面板 id，读取时按注册表校验去重；最近 8 条、展示最多 6 条，置顶优先。
- 设置页搜索下方新增「常用设置」chips；面板右上角新增置顶按钮（hover 显示，置顶常亮）；深链/命令面板/常用 chips 跳转都会记录最近访问。
- 存储用 localStorage（`wbfm.settings.shortcuts`），坏数据与隐私模式静默降级；水合后才渲染，避免 SSR 不一致。
- 未做：两级导航仍留待面板数增长后评估。
- 就地入口：桌宠右键菜单新增「设置：AI 日常剧情」，唤回主窗并深链到 `#panel-script-schedule`；`DeepLinkHost` 对同页 hash 补发 `hashchange`，确保已在设置页时也能滚动高亮。
- 验证：shortcuts 4 项 + catalog 5 项；设置域 11 文件 39 项通过；desktop 类型检查与桌宠菜单 13 项通过；web/shared typecheck 与行数/结构/循环/ASCII 门禁通过。

### 2026-11-14 M4 小剧场 / 分享卡 / 角色包验收

- 舞台深链新增 `stage=play` 与 `ep`，解析抽到 `stage/theater/stage-target.ts`；`StageMode` 增加 `theater`，`data-mode` 同步。
- 小剧场 `theater-script.ts`：1 集「摸鱼小剧场 · 深夜茶歇」，三席全部内置 VRM（雪团 / 冉卡露丽 / 菲比），6 句按人设分工；`theaterDirections()` 纯函数输出 focus + speech + expression + motion，越界回落首句。
- `use-stage-theater.ts`：进入换 cast，5.2s 节拍循环，支持上一句/下一句/重播；只复用舞台既有 StageDirection 执行链。
- 分享卡 `stage-share-card.tsx`：420×560 卡面含标题、日期、当前台词、席位、今日主动播放/生成；数据走 `/api/pet/script` 与 `/api/pet/script/playback`，失败显示 `--`；保存复用 `requestScreenshot()`，截图时只隐藏按钮不隐藏卡面。
- 角色包：验收既有 Markdown 导出/导入（仅文本、非法 frontmatter 不落库、无脚本执行），无代码改动。
- 验证：theater 5 项 + 分享卡 4 项 + 形状/宽高；舞台/设置存储域共 12 文件 62 项通过。

### 2026-11-14 M5 剧本 lint/golden、合规声明、3.0.0

- `scenes/lint.test.ts`：跨场景校验 id 唯一、触发键/打断白名单、priority/cooldown、beats 时间单调且 ≤240s、可感知 cue、prop 成对、`validateScene` 零丢弃。
- `scenes/golden.test.ts`：内置场景 `id → [{at, kind}]` 与 id 顺序快照；新增 `pnpm check:scenes`（6 文件 37 项）。
- 关于页新增「原创角色与二创说明」（CC BY-NC-SA 4.0、无官方关联、角色包不含代码），中英文 i18n。
- 版本 2.35.0 → 3.0.0，`pnpm sync-version` / `sync-version:check` 通过；新增 [release-notes.md](./release-notes.md)。
- 门禁：lint 8 包 0 error；行数/结构/循环/ASCII 全绿；`stage/` 直接文件未增长（新代码在 `stage/theater/`）。

### 2026-11-14 文档对齐 v3.0.0

- 根 `README.md`：版本 2.22.2 → 3.0.0，替换旧补丁摘要为 v3.0 陪伴里程碑，补剧本/决策/小剧场/分享卡能力、219 个 Route Handler、`check:scenes` 等门禁与 v3.0 文档入口。
- `docs/roadmap/README.md`：v3.0 从「规划中」改为已发布章节与索引行，补齐 v2.28–v2.35 索引，修正 5 个 `candidates/` → `scheduled/` 失效链接。
- `docs/plan/archive/v3/v3.0/README.md`：里程碑补状态、M2 标注取消、验收口径改为分享卡今日播放/生成数据、物料改为 3 篇博客；`execution-roadmap.md` 状态表与 M1–M3 行同步。
- `docs/architecture.md`：文档版本 2.0（对齐 v3.0.0）、Next.js 15.5，新增「4.3 剧本生成与主动播放」数据流。
- `docs/api.md`：补 8 条 `/api/pet/script*` 路由总览与 4.33–4.40 明细，说明其余能力以 Route Handler 为准。
- `docs/development.md`：Node ≥22.13 / pnpm 11.24、`check:scenes` / 结构 / 循环 / ASCII / sync-version 命令、`WBFM_PET_SCRIPT`、舞台深链；修正英文发行说明相对路径。
- `docs/learn/desktop-pet-implementation.md`：基线版本改为 v3.0.0，补剧本/决策/小剧场增量说明；`pet-engine/README.md` 与 14 号文档状态同步为已实施。
- 校验：更新文档的相对链接全部可解析，`pnpm check:ascii` 通过（767 个 Markdown）。

### 2026-11-14 剧场 VRM 待机姿态修复

- 现象：小剧场三席手脚交叉/扭曲，尤其在「第 2/6 句」等开场阶段；固定内置待机后仍有手指爪状与双脚重叠。
- 定位：三层原因叠加——
  1. `/api/motions` 里用户导入的 `cmu-walk / cmu-stretch / beishou` 等 `segment=single` 动作进入待机池，每 8 秒轮播，三席落到走路/背手帧；
  2. 内置 `daiji` 在 VRM0 模型上会抬小腿、内扣脚掌、屈指；
  3. `clipAnimatesArms` 只按 humanoid 词表 `leftUpperArm.quaternion` 匹配，而 VRMA 实际轨道名是 `Normalized_DEF-Left_arm.quaternion`，导致判定为「无手臂动画」，程序化垂臂与 hand-fidget 手指屈曲叠在待机动作上，形成爪状手。
- 修复：
  - `loadMotionPool` 新增 `builtinOnly`；`VrmSessionRuntime` 增加 `builtinIdleOnly`，`VrmCanvas` 增加 `motionProfile`，舞台 `StageActor` 固定传 `stage`，只加载内置 `daiji`（池大小 1）。
  - 舞台待机按 humanoid 节点映射剔除腿/脚/脚趾/手指轨道（`stage-idle`，保留骨盆、脊柱、肩臂与手腕），避免抬腿、内扣脚掌与屈指；`setScriptBusy(true)` 关闭踮脚/插兜/抱臂等待机余兴。
  - `clipAnimatesArms(clip, armNodes)` 支持传入模型归一化上臂节点名，VRMA 轨道也能正确判定手臂动画，不再叠加程序化垂手与 hand-fidget。
  - `setStageStance(true)` 给上腿各加约 5° 外旋，固定自然站姿，避免三席并排时鞋子重叠。
- 影响面：舞台/展示面；桌宠与主窗形象栏仍按用户动作池轮播。`clipAnimatesArms` 的修复同时改善桌宠上 VRMA 待机的手臂/手指叠加。
- 验证：`vrm-motion-loader.test.ts`（builtinOnly + 轨道剔除）、`motion.test.ts`（归一化节点名识别）等 VRM/动效 16 文件 69 项通过；真机 `poolSize=1`、`stage-idle` 12 条轨道，等待 20 秒越过轮播周期后三席手指自然、双脚分开，截图确认。

### 2026-11-15 M4 剧场硬化 S5 验收与门禁

- 单测：新增 `use-stage-theater.test.ts`（开演换 cast、逐句派发、按句长推进、暂停/恢复、跳句循环、语音保持与 15s 兜底）、`use-theater-audio.test.ts`（TTS 触发/停止、BGM 跟随、duck、静音、自动播放拦截与手势解锁、切后台补播）、`theater-bgm.test.ts`（WebAudio 拦截、增益 0.055/duck 0.35/静音、9s 换和弦、dispose 重建）；剧场域 7 文件 34 项通过。
- 控制入口：工具栏接线 `toggle`，新增「暂停/继续」按钮与中英文词条；暂停同时停时间线、语音与 BGM。
- 真机（`/stage?stage=play`，1440×900）：三席 3/3 就绪后开演；真实 TTS 200，speakerId 18/32/3 分别对应雪团/冉卡露丽/菲比；BGM 起播 0.055、说话 duck 0.35、结束恢复 1、静音归零；12s 推进 2→4，暂停 8s 不动，继续后恢复；下一句 4→5、上一句 5→4；幕布/聚光灯/地板/暗角齐全；分享卡数据与卡面正常，浏览器裸访保存 PNG 按预期提示需桌面端；控制台无错误，`/vrm/` 无失败请求。
- 门禁：typecheck 14 tasks；lint 8 包 0 error（28 存量 warning）；lines ≤300；structure 通过（`stage/` 21 个直接文件未增长）；cycles 8 个存量 SCC；ascii 769 个 Markdown；scenes 6 文件 37 项。
- 文档：`theater-hardening-plan.md` 标记 S0–S6 完成并记录验收；发布说明、开发指南同步。
- 所有改动未提交。

### 2026-11-15 剧场补强：表情强度 / 短音效 / 多集 i18n / 桌面 PNG

- 表情强度：`StageDirection.expression` 增加可选 `intensity`（1/2/3）；控制器新增 `expressionIntensities`，经 `StageActor → AvatarCanvasRouter → VrmCanvas → VrmSession` 透传到 KK morph 组合；剧场第 2 句标 3、第 6 句标 1，换 cast 重置 2。新增 `expression-intensity.test.ts` 3 项，真机 `data-expression-intensity` 确认 2→3→1。
- 短音效：新增 `theater-sfx.ts`（WebAudio 合成幕布音与换句提示音），与 BGM 共用静音；`theater-sfx.test.ts` 4 项 + 音频编排断言。真机：幕布 buffer ×1、换句振荡器 +1、静音后 +0。
- 多集与 i18n：新增 `morning-drill` 集（聚光灯背景）；`titleEn` / `textEn` + `localizeTheaterEpisode()`，舞台根按 locale 重算；英文界面标题与台词自动切换，缺省回落中文。
- 桌面 PNG：Playwright `_electron` 启动桌面壳并替换保存对话框，经分享卡保存 2561×1601 PNG（1.05MB），toast「截图已保存」、UI 恢复、主进程无错误。
- 验证：剧场 9 文件 45 项通过；typecheck 14 tasks、lines、structure 通过；真机无控制台错误。
- 所有改动未提交。

### 2026-11-15 剧场体验扩展：相对朝向 / 分幕 / 类型配乐 / 四集

- 朝向：新增 `stageFacingYaw()`（按同台 x 坐标面向其他人重心，最大约 19.5°），`VrmPoseLayer` 增加平滑朝向偏移并叠加转身/微摆；全链 `StageActor → VrmCanvas → VrmSession` 透传，拖拽换位自动重算。真机截图确认左右整体向内、站姿自然。
- 数据：剧集拆到 `theater/episodes/`（types/cast/4 集/index）；`TheaterAct` 用 `[from,to)` 描述幕，`genres` 标记喜剧/日常/悲剧/悬疑；新增《提案夜》《等伞》，共 4 集 24 句，保留 en 标题/台词。角标显示「幕名 · 第 n/N 句」。
- 配乐：`TheaterBgm` 增加四套情绪和弦与 `setMood()`（运行中平滑换和弦、调整周期）；`theaterMoodAt` 按幕/剧集/类型推导；换句音效按类型选择音高。
- 研究取舍：舞台调度采用小角度整体内转保留正面可读性；配乐继续 WebAudio 合成，避免第三方音频许可；外部 CC0/FMA/Musopen/豆包素材的登记规则写入 `ASSETS-LICENSE.md`。
- 验证：剧场 10 文件 57 项 + 布局 8 项通过；真机 `proposal-night` 第 1→2 幕确认角标、幕布背景与配乐频率切换，无控制台错误。
- 修复：`joy` 强度 3 原来用 `Mouth_happy_broad_op`，该 morph 会把舌头一起带出；改为闭口版 `Mouth_happy_broad_cl`，并在说话时由 `stripMouthMorphs()` 剥掉表情层嘴部 morph，只保留眼/眉，嘴型交给口型通道。真机复验 joy3 / joy2 / smirk 三句均不再露舌。
- 所有改动未提交。

### 2026-11-15 全局背景音乐模块

- 新增 `features/music/`：`MusicProvider`（单 `<audio>` 播放、列表/单曲/不循环、音量与进度、localStorage 记忆）、右下角迷你播放条、设置页「音乐与背景声」面板。
- 内置 7 个主题曲槽位（`public/audio/music/theme-*.mp3`），缺失时提示路径；导入支持 MP3/M4A/OGG/WAV/FLAC，单曲 ≤40MB，存 IndexedDB（无 IndexedDB 时退回内存），删除仅移除本地记录。
- 氛围清单：7 首曲目的 BPM/时长/场景/豆包提示词，设置面板可逐条或全部复制；文档 `docs/plan/archive/v3/v3.0/music-atmospheres.md`；许可登记补入 `ASSETS-LICENSE.md`。
- 曲目接入：9 首豆包生成 MP4 去除视频轨并转 MP3 192kbps（-16 LUFS），33.3MB → 21.5MB；三首主题曲进入组内轮播，6 首氛围曲按暖光/浪漫/深夜/俏皮/活力/忧郁近似匹配，悬疑与专注保留待生成槽位。
- 许可修正（依据豆包平台反馈）：9 首仅为个人学习娱乐使用，无商用与再分发授权；`music-tracks.ts` 标记 `license: 'personal-only'`（2 个待生成槽位不标），设置面板加入「个人仅用」徽标与提示，`.gitignore` 排除 `apps/web/public/audio/music/*.mp3`；发布/交付/商用前必须移除或替换为 CC0/已授权曲目。
- 可发布曲目协议建议：公开非商业版首选 CC0 1.0；需署名用 CC BY 4.0；仅非商业可用 CC BY-NC 4.0 / CC BY-NC-SA 4.0；商业交付购买付费商用授权（Epidemic Sound / Artlist / Mubert / Suno 付费计划等）；豆包火山 API 条款需单独核对并留档。
- 验证：音乐 2 文件 9 项通过；Edge 真机 3 首主题曲自动 1/3→2/3→3/3 轮播、氛围曲 1:00 播放正常；Playwright 内置 Chromium 不含 MP3 解码，音乐验收改用系统 Edge/Chrome。
- 所有改动未提交。

### 2026-11-15 背景音乐替换为 CC0 可分发曲目

- 来源：OpenGameArt.org，11 首 **CC0 1.0**；3 首主题曲 + 8 首氛围曲（`theme-tense` / `theme-focus` 已补齐，不再有待生成槽位）。
- 处理：原始 MP3 / OGG / WAV → MP3 192kbps 44.1kHz 立体声，`loudnorm -16 LUFS`，合计约 30.4MB；逐曲作者、来源页与时长登记在 `ASSETS-LICENSE.md` 与 `docs/plan/archive/v3/v3.0/music-atmospheres.md`。
- 代码：`BUILTIN_TRACKS` 全部标记 `license: 'cc0'`，移除 `pending`；设置页改为绿色「CC0」徽标与可分发提示；`.gitignore` 移除 MP3 排除规则，音频可随仓库与安装包分发。
- 旧批次：9 首豆包 App 曲目已移出 `public/audio/music/`，仅在本机 `.tmp/personal-music/` 留档；豆包 App 输出仍仅限个人学习娱乐，不进入发布版。
- 验证：音乐单测 2 文件 10 项通过（11 首全 CC0、零 pending）；`pnpm typecheck` 14 tasks、`pnpm lint` 8 包 0 error、`check:lines`、`check:ascii` 770 个 Markdown 通过；Edge 真机设置页显示 11 首与 11 个 CC0 徽标，主题曲 `readyState=4`、时长 84.6s 正常播放，`/audio/` 无失败请求。
- 所有改动未提交。

### 2026-11-15 剧场背景乐接入 CC0 曲目

- 实现：`theater/theater-bgm.ts` 从 WebAudio 振荡器垫音改为 HTMLAudioElement 播放，复用应用内置的 4 首 CC0 曲目：`warm` → `theme-warm`、`playful` → `theme-playful`、`tense` → `theme-tense`、`melancholy` → `theme-melancholy`。
- 行为：进入剧场淡入到音量 0.3，说话时 duck 到 35%（约 0.105）；换幕先淡出旧曲再换源淡入；暂停、静音、切后台、退出与 dispose 都会淡出并暂停；自动播放拦截仍返回 false，由首次手势解锁。
- 复用面：`TheaterBgm` 对外接口（`start / stop / setMuted / setMood / setDucked / dispose`）不变，`use-theater-audio` 未改；舞台路由随主布局卸载全局播放器，不会叠音。
- 文档：`ASSETS-LICENSE.md` 剧场音乐章节改为「背景乐复用 CC0、音效仍合成」；`release-notes.md` 与 `music-atmospheres.md` 同步四情绪映射与音量口径。
- 验证：剧场域 9 文件 49 项通过，其中 `theater-bgm.test.ts` 重写为音频元素用例（拦截/淡入、duck/静音/停止归零、换幕切曲、未运行切情绪、淡出途中停止后补齐曲目、dispose）；`pnpm typecheck`、`pnpm lint`、`check:lines`、`check:ascii` 通过。
- 跨幕真机（Edge，`/stage?stage=play`）：第一幕 `theme-warm.mp3` 音量 0.3 播放；8 秒采样最低 0.105、最高 0.3，确认说话 duck 生效；点 3 次下一句跨到第二幕（明日之约 5/6 句），切到 `theme-playful.mp3` 并回到 0.3；静音后音量 0、暂停，恢复后 0.3 继续；两个曲目均 206，`/audio/` 无失败请求，控制台无错误。
- 构建：`pnpm build` 通过；`apps/web/.next/standalone` 内含 11 首 MP3 共 30.4MB；启动 standalone 后 `/audio/music/theme-warm.mp3` 返回 200（1,496,109 字节），`/stage?stage=play` 返回 200。
- 桌面冒烟：electron-builder 26 的 winCodeSign 缓存需按新布局预置 7z（校验 sha256 通过），之后打包成功；安装包 `resources/server/apps/web/public/audio/music` 含 11 首 MP3 共 30.4MB。
- 两处既有用例修复：① 桌宠 `/pet` 首次加载时设置默认形象会覆盖 URL 显式 `model=haru`，改为 URL 模型优先、后续设置变更仍热替换；② `/windows/focus` 在受限桌面被前台锁拒绝，增加 Alt 键解锁、前台状态轮询与 AttachThreadInput/SwitchToThisWindow 兜底，测试侧改为聚焦后点击编辑区、回车提交输入法预处理、Ctrl+S，并清理进程树避免 worker 退出挂起。
- 最终 `pnpm test:e2e:desktop` 11 项全部通过（50.3s），覆盖键鼠通道、记事本落盘、桌宠四例、窗口渲染、四模块导航、安全基线、控制通道与托管令牌。
- 所有改动未提交。

### 2026-11-15 三个内置 VRM 许可一致性审计

- 事实：`xuetuan.vrm` / `rankaluli.vrm` / `feibi.vrm` 内嵌 meta 的 `licenseName` 均为「CC BY-NC-SA 4.0」，`author` 均为 WorkBuddyForMe / flashJJ，`commercialUssageName` 均为 Disallow；三者一致，没有某一个漏写。
- 文档：`docs/plan/archive/v3/v3.0/README.md`、`milestone-m4-m5/spec.md` 原先只写雪团，`execution-roadmap.md` 第 6 条仍把「测试模型许可」列为待确认；已统一为三个模型同一授权口径，并在决策日志补 D23，说明 D6 的 AnimeArt/CC0 只适用于未入内置名单的测试模型。
- 来源口径（用户已确认）：雪团参考「蓝色大肥鱼」主题，由 AI Agent 独立生成形象图片，再经 Neural4D 付费会员图生 3D，后期二次制作与压缩；不以溟月图集作为生成输入。README 第 14/38/46/151 行、`ASSETS-LICENSE.md`、`public/vrm/models/LICENSE.md` 已按此链路改写。
- 内嵌 meta 规范化（已完成）：三个模型的 `licenseName` 从自由文本改为枚举 `CC_BY_NC_SA`；`sexualUssageName` / `violentUssageName` 由 `Allow` 改为 `Disallow`；`reference` 补 CC 许可 URL；商用保持 `Disallow`。脚本 `scripts/avatar/normalize-vrm-meta.mjs` 支持 `--check` / `--write`，写入前备份到 `.tmp/vrm-meta-backup/`，并断言 BIN chunk SHA256 不变。
- 验证：`validate-family` 三模型 49 骨骼 / 118 morph / 18 binds 全部通过；`check:lines` 通过。`contactInformation` 仍为空，如后续有公开联系地址可再补。
- 范围：本次只改文档，未改 `.vrm` 二进制与代码。

### 2026-11-15 v3.0 收尾：版本总结与 10 篇博客

- 总结：新增 `docs/plan/archive/v3/v3.0/version-summary.md`，按「这一版解决了什么 → 里程碑 → 关键数字 → 用户可见变化 → 已知限制 → 未完成项 → 下一版本」收口，并补进路线图索引。
- 博客：新增 `blog/v3.0/` 10 篇（B01 总览、B02 受限剧本、B03 Utility 决策、B04 生成队列与画像、B05 舞台深链与时间线、B06 分享卡截图复用、B07 剧场音频与 CC0 曲库、B08 剧本 lint/golden、B09 表情强度、B10 复盘）；全部无 frontmatter、首行 `#`、94–129 行。
- 索引与物料：`blog/README.md` 新增 v3.0 系列行；`docs/roadmap/README.md` 补版本总结与 10 篇博客；发布说明物料表把「技术博客」改为完成，`v3.0/README.md` 的 3 篇口径统一为 10 篇。
- 验证：10 篇禁用词扫描零命中（产品名/角色名/路径/版本与里程碑编号/外链）；抽检 B01/B10 通读通过。
- 未完成：T0.9 四小时长跑采样、演示短片、4 张截图、更新公告。

### 2026-11-15 修复右键菜单「干饭 / 炸毛」正式包无效

- 根因：两个菜单项调用 `script.playScene`，但剧本导演只在 `WBFM_PET_SCRIPT=1` 时创建；正式包未开该开关，`playScene` 恒为 false。
- 修复：VRM 下导演常驻，新增 `triggersEnabled` 控制普通交互是否交给剧本；关开关时仍可手动播放内置场戏。Live2D 或导演不可用时回退本地台词池。
- 验证：相关单测 17 项、pet/script 37 文件 233 项通过；打包态 Electron 通过 IPC 触发菜单，字幕依次出现「开饭啦，今天也要好好吃饭。」与「哼，我才不胖，这叫圆润！」。

## 下一步

P4、P5 M1 与动效库两轮深化已完成。后续：

1. 统一真机验收：待机余兴 5 姿势、鞠躬/叉腰/托腮/打哈欠、拥抱；按反馈微调骨骼数值或轮换冷却。
2. P8.1–P8.8 与 P9 P1 已完成并真机验收（深链/搜索/常用入口/主动播放/长剧本收尾）；M3 Utility 阶段 1–3 已落地并真机验收，低语池间打分仍待候选元数据。
3. T0.9：用 `WBFM_PET_SCRIPT=1` 会话跑 `pnpm perf:pet-longrun` 4h，补 p95/堆漂移报告。
4. 资产管线：贴图压缩（13 个精简模型仍 25–33MB）、各模型穿模检查、100 个非标准 morph 语义抽查。
5. P6 已收尾（M3 决策层、M4 小剧场/分享、M5 发布门禁）；v3.0 版本总结与 10 篇博客已完成；后续为 P7 插件化拆包与剩余发布物料（短片/截图/公告）。
6. 待产品决策：坐姿观感二轮（3/4 侧机位或加坐面道具）、模型体积口径（20MB 硬门槛 vs 25–30MB）。
