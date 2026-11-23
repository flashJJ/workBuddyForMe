# 01 · Servant 项目分析：画像、特性矩阵与借鉴分级

> 分析对象：`e:\code\github\Servant-main`（本地快照，版本日期约 2026-09/10）
> 分析方法：通读 README、docs/ 全部 15 篇文档与 `src/soul`、`src/event`、`src/ai`、`src/character`、`src/ui/meeting` 等关键模块源码，逐机制取证
> 许可前提：Servant 使用 **PolyForm Noncommercial License 1.0.0**，仓库内 VRM 模型、VRMA 动作、音效、字体另有权利人。**本项目只借鉴机制思想与协议设计，严禁复制其源码、文案与素材资产**

---

## 1. 项目画像

| 维度 | Servant | WorkBuddy（对照） |
|---|---|---|
| 定位 | 以 VRM 桌宠为载体的本地 AI 角色原型（陪伴/情绪优先） | 本地 AI 工作台 + 桌面助手（效率/协作为先，陪伴待补） |
| 桌面壳 | Tauri 2（Rust + WebView2） | Electron（成熟资产：透明窗、穿透、自启、全局快捷键） |
| 渲染 | Three.js + @pixiv/three-vrm（3D）、VRMA 动画、MMD | pixi-live2d-display + Cubism Core（2D），5 套官方样本模型 |
| 前端 | React + Vite + Mantine | Next.js App Router + React + Tailwind/shadcn 风格 token |
| 后端 | Node SEA sidecar（HTTP+WS）+ Python 记忆服务（LanceDB） | Next API Routes + packages/core + SQLite（FTS5/向量） |
| 语音 | SenseVoice ASR + 19 家 TTS 注册表 + GPT-SoVITS | SenseVoice ASR + MeloTTS + 云 TTS（v1.5 已做切块/后台并行） |
| LLM | 10 家 Provider 注册表 + Vercel AI SDK | 多家 Provider CRUD + 助手/角色级模型绑定 + Ollama |
| 协作 | 多角色会议（自由角色档案，串行发言） | v1.4 固定三角色协作（planner/executor/reviewer，结构化 Handoff） |
| 分发许可 | 非商业开源；VRM 生态 MIT 为主 | 私有项目；Live2D Cubism Core 专有（模型导入红线） |

**结论**：Servant 的长板恰好是 WorkBuddy 的短板——**情绪状态、可探索交互、剧情演出、舞台感、个性化配置**；WorkBuddy 的长板（RAG、Flow、MCP、协作拓扑、工程质量）Servant 不具备。借鉴是单向且互补的。

## 2. 特性矩阵（17 项，按对 WorkBuddy 的价值排序）

| # | 特性 | Servant 实现位置 | 价值 | 借鉴分级 |
|---|---|---|---|---|
| 1 | **SoulState 情绪/关系状态机** | `src/soul/`（约 10 个小文件） | ★★★ | A 平移设计 |
| 2 | **结构化情绪输出协议**（双 JSON：情绪/强度/短动作/灵魂事件/记忆候选） | `src/ai/llm/AiSdkClient.ts`、docs/conversation-and-voice.md | ★★★ | A 平移设计（协议重裁） |
| 3 | **桌宠触摸交互**（摸头 squash、连摸保护期、久不理会、空闲随机动作、状态标签） | `character/interaction/`、`vrm/headTouch*`、`interaction.config.json` | ★★★ | B 改造借鉴（2D 化） |
| 4 | **ABC 档微动作调度**（自主待机 + 情绪伴随，JSON 关键帧配置） | `character/micro-dynamics/` | ★★☆ | B 改造借鉴（Live2D 参数化） |
| 5 | **声明式剧情事件引擎**（10 种 step、优先级/打断/冷却/每日上限/FIFO/branch） | `src/event/`（EventDirector/EventRunner/conditions） | ★★★ | A 平移设计（step 集适配） |
| 6 | **内置剧本包 + 自定义触发器**（13 个 JSON 剧本；短语/亲密度/时段/日上限约束） | `event/events/scripts/*.json`、`custom/TriggerEngine.ts` | ★★★ | A 平移设计（剧本重写） |
| 7 | **Galgame 全屏舞台**（多角色站位、场景、背景、灯光、截图、快捷键） | `src/ui/meeting`、docs/galgame-stage.md、stage-lighting.md | ★★☆ | B 改造借鉴（2D 舞台） |
| 8 | **多角色会议调度**（manual/all/auto 接龙、转录防串角、单 abort 串行、独立音色） | `MeetingPage.tsx`、`meetingState.ts`、docs/meeting.md | ★★☆ | B 改造借鉴（接 v1.4 拓扑） |
| 9 | **Markdown 角色卡库（文本 mod）**（frontmatter+章节解析、多卡切换/导入、全局追加提示词） | `ai/personality/CharacterSkill.ts`、Rust `character_skill.rs` | ★★☆ | A 平移设计 |
| 10 | **命名主题皮肤**（夜金/月白/樱梦三套，单字段切换，Mantine 主题） | `settings/uiPreferences.ts`、`design-system/` | ★★☆ | B 改造借鉴（token 体系不同） |
| 11 | **人格权重六参数**（直率/嘴硬/肢体泄露/害羞躲藏/求安慰/调戏容忍，驱动剧本分支） | `app/runtimeTypes.ts` PersonalityWeights | ★★☆ | A 平移设计 |
| 12 | **模型配置式调优**（Provider 注册表、temperature、上下文条数 2–50 契约钳制、记忆 LLM 独立） | `ai/llm/LlmConfig.ts`、ChatContext 契约 | ★★☆ | C 增量补齐（基座已有） |
| 13 | **TTS 播放参数/音色库/情绪标签/预取** | `ai/tts/`（19 家注册表、localVoiceLibrary、SpeechPrefetcher） | ★★☆ | C 选择性吸收 |
| 14 | **提醒调度服务**（once/daily/weekly、FIFO、重启不丢、LLM 工具增删改查） | `scheduler/`（toad-scheduler） | ★★☆ | A 平移设计（替换现有 proactive） |
| 15 | **每日记忆仪式**（时区敏感、独立本地 LLM 提取、关系类记忆） | `ai/memory/DailyMemoryJob.ts` | ★☆☆ | B 与 v0.5 记忆融合 |
| 16 | **初始化资源门禁**（只列真缺资源、自选下载目录、磁盘为准记录会过期） | `app/provisioning/` | ★☆☆ | C 增量借鉴（语音模型下载器已有） |
| 17 | **外部事件管线**（弹幕/游戏日志：规范化→过滤→聚合→优先级→队列） | `src/integrations/` | ★☆☆ | D 暂不借鉴（v2.0 仅留边界） |

分级含义：

- **A 平移设计**：机制与渲染栈无关（状态机、协议、调度、解析器），按 WorkBuddy 的语言/框架重新实现，设计可原样采用。
- **B 改造借鉴**：设计思想成立，但 Servant 的载体是 3D VRM/Three.js，必须做 2D Live2D 适配（见 02 文档逐机制映射）。
- **C 增量补齐/选择性吸收**：WorkBuddy 已有同类基座（provider CRUD、语音下载器、v0.5 记忆、v1.5 TTS 切块），只借缺失的那一小环。
- **D 暂不借鉴**：直播弹幕、POE2 游戏日志等与其目标用户强绑定，v2.0 前不做，仅在事件引擎设计中预留外部事件入口。

## 3. 不借鉴清单（明确排除，防止 scope 膨胀）

| Servant 能力 | 不借鉴原因 |
|---|---|
| VRM/VRMA/MMD 全栈（骨骼映射 VrmaBoneMapper、脚部 IK、手臂烘焙、PMX 加载、wasm 物理） | 与 Live2D 渲染栈完全异构，移植成本≈重写；其解决的「不同体型共用动作」问题在 2D 不存在。v2.0 仅做 VRM 路线授权/成本 spike |
| 19 家 TTS Provider、GPT-SoVITS 整合、语音克隆工作流 | WorkBuddy 已有 MeloTTS 离线 + 云厂商通道；扩 provider 边际收益低，维护成本高。只借「播放参数 + 情绪标签注入」思想 |
| LanceDB + Python sidecar 记忆服务 | WorkBuddy 已有 SQLite 向量 + FTS5（v1.3 RRF 融合）与纯 Node 架构，引入 Python 违背进程精简原则 |
| Tauri/Rust 侧能力（注册表自启、WS 5174 网关、reqwest 搜索） | Electron 均有对等实现；WorkBuddy 已有 global-shortcuts、自启、唯一 HTTP 栈 |
| 弹幕直播 / POE2 掉落检测 | 与「私人工作伙伴」定位不符；事件引擎预留适配口即可 |
| 得意黑字体系统与十级字号令牌全套 | 风格化字体取舍（单字重、窄斜体）是 Servant 的品牌选择；WorkBuddy 已过 a11y 验收，只借「令牌唯一、禁止裸值」的治理方法，不换字体 |
| 摸头铁盆、魔法阵等具体音效/彩蛋资产 | 版权归属第三方且风格跳脱；彩蛋机制保留，资产全部重做或用内置渠道生成 |
| 单条记忆混合检索固定权重 0.68/0.29/0.03 | v1.3 已定 RRF(k=60) 免标定方案，不回退到线性加权 |

## 4. 许可与合规结论（写入每版评审检查单）

1. Servant = PolyForm Noncommercial 1.0.0：**禁止**把其源码片段、JSON 剧本内容、提示词文案搬入本仓库；允许学习思路后独立实现（净室原则：读文档做设计，实现者按本项目规范重新写）。
2. 其 `public/assets` 下 VRM（8 个）、VRMA（59 个）、cute 音效、背景图**一律不下载、不分发、不模仿文件名体系**。
3. Live2D 侧继续只随包分发 Cubism Web Samples 五角色（Haru/Hiyori/Mark/Mao/Wanko）；角色卡/剧本/皮肤作为「数据 mod」分发，**不得捆绑任何 .model3.json/.moc3/.motion3.json 资产**。
4. 若 v2.0 spike 结论支持 VRM，选型仅限 MIT/Apache 许可的 three-vrm 生态与可再分发模型，独立走一轮合规评审。
