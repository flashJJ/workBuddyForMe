# M4-VAD 持续聆听与打断（barge-in）方案设计

> 版本：v1（2026-10-07）
> 状态：✅ 已实现（2026-10-07），代码/单测/e2e 门禁全绿；M4-6 真机 10 轮冒烟待人工验收
> 依赖：M1（TTS 朗读）、M2（SenseVoice ASR + PTT）、M3（Live2D 形象）均已完成
> 参照：`04-实施路线与风险.md` M5-1（原排期"vad-web 端点检测"）、开源调研 `virtual-person-master`（其 VAD/轮次/打断实现已逐行核实）

## 16. 实施结果（2026-10-07）

- **新增**：`voice/vad/`（vad-detector 纯状态机 19 测、asr-turn-tracker 7 测、use-vad-monitor 7 测）、`public/worklets/vad-capture.worklet.js`、use-handsfree-voice（5 测）+ handsfree-mic-button、设置「输入方式」分段（vadSensitivity/尾静音）、shared `vadSensitivity` 契约（服务端零改动）。
- **加固**：播放队列 epoch 代际 + pumpToken（旧轮迟到帧/旧 final 丢弃）；useVoicePlayback 暴露 `getGate()`（speaking + 停播 500ms 冷却）；apiUpload 支持 RequestInit signal。
- **真机前发现并修复**：①AudioWorkletNode 不经 0 增益 GainNode 落地 destination 则 process() 不调度；②StrictMode 下 start 握手须只发存活挂载链，否则帧发给已置空 handler 的旧节点。
- **门禁**：typecheck/lint/check:lines 7/7；全量单测 14/14 包（M4 新增 38 测 + 队列 epoch 1）；e2e 14/14（voice-asr 4 + live2d-avatar 6 + voice-vad 4）。
- **e2e 取证方式**：Playwright `page.route` 拦不住 addModule 的内部模块加载，voice-vad 用 addInitScript 桩 AudioWorkletNode + 包装 AudioContext 构造器（实例级 defineProperty），确定性注入「校准→语音→尾静音」帧序列；算法正确性由纯函数单测覆盖，回声门控/真机打断留 M4-6 人工。

## 0. 排期说明

路线图原文把 VAD 列在 M5-1、M4 为桌宠。按 2026-10-07 讨论，**将"持续聆听/打断"提前为下一里程碑（本文称 M4-VAD）**，桌宠顺延。理由：免手语音是"对讲机 → 真陪伴"的关键体验跳变，且全部可复用 M2 已有端点，不依赖桌宠窗。

---

## 1. 目标与 Non-Goals

### 1.1 目标

1. **免手对话**：开启后持续监听，自动检测一段话的起止，尾静音到时自动识别并发送，无需按键。
2. **半双工回声规避**：助手朗读时不被扬声器回声自我触发；不新增任何原生声学 AEC。
3. **打断（barge-in）**：助手正在朗读/生成时，用户开口的同一帧立即停止播放与生成；识别完新问题后开启新一轮。
4. **轮次隔离**：识别中再说话不串话；旧识别结果不覆盖新轮次；识别卡死有超时自愈。
5. PTT 模式与全部既有行为保持不变，两套输入模式可在设置中切换。
6. 离线：VAD 为浏览器端纯算法，不增加模型下载、不增加网络端点。

### 1.2 Non-Goals（与路线图第 4 节一致）

- ❌ 声学回声消除（AEC）、唤醒词、流式 ASR（SenseVoice 仍按整段离线识别）
- ❌ 服务端 Silero VAD / WebSocket 音频流（列为 P2 可选演进，见 §13）
- ❌ 不承诺外放免耳机可用：回声门控是"用状态机补浏览器 AEC 的不完美"，耳机/近场麦克风为推荐环境
- ❌ 全双工（允许用户与助手同时说话）——本期只做半双工
- ❌ 多麦克风设备选择 UI（沿用浏览器当前默认设备；M2 自检/约束已具备）

---

## 2. 现状盘点（已核实的代码事实）

### 2.1 已具备（直接复用）

| 能力 | 位置 | 说明 |
|---|---|---|
| 输入模式契约 | [voice.ts](file:///E:/code/traeWork/workBuddyForMe/packages/shared/src/schemas/voice.ts#L12) `VOICE_INPUT_MODES=['ptt','vad']` | M2 已预埋；默认 `ptt`，`vadSilenceMs` 默认 900（范围 300–5000） |
| 语音四态契约 | 同上 `VOICE_STATES=['idle','listening','thinking','speaking']` | SSE 已用 speaking/idle；listening/thinking 本期客户端驱动 |
| ASR 端点 | [asr/route.ts](file:///E:/code/traeWork/workBuddyForMe/apps/web/src/app/api/voice/asr/route.ts) | multipart WAV → `{text,lang}`，热态约 256ms |
| 采集/编解码 | [use-voice-recorder.ts](file:///E:/code/traeWork/workBuddyForMe/apps/web/src/features/voice/use-voice-recorder.ts)、[pcm-wav.ts](file:///E:/code/traeWork/workBuddyForMe/apps/web/src/features/voice/pcm-wav.ts) | getUserMedia 约束（`echoCancellation+noiseSuppression`）、降采样 16k、WAV 编码、RMS |
| 流中断 | [use-chat-stream.ts](file:///E:/code/traeWork/workBuddyForMe/apps/web/src/lib/hooks/use-chat-stream.ts#L42-L44) | `stop()` → AbortController.abort() |
| abort 全链路 | chat/route.ts → orchestrator(`input.signal`) → tool-runner → LLM fetch；withVoice 桥每事件查 `signal.aborted` | **客户端断连会真正停掉上游 LLM 读取与 TTS 合成**，不只是停播放 |
| 播放取消 | [audio-playback-queue.ts](file:///E:/code/traeWork/workBuddyForMe/apps/web/src/features/voice/audio-playback-queue.ts) `cancel()` | 立即停 source、清队列；`useVoicePlayback` 已暴露 `speaking` |
| 会话急停 | [use-chat-session.ts](file:///E:/code/traeWork/workBuddyForMe/apps/web/src/features/chat/use-chat-session.ts#L227-L243) `stop()` | abort + cancelPlayback + 流式消息置 stopped |

### 2.2 缺口（本期新增）

1. 无端点检测：只有 PTT 的整段录制。
2. **播放队列无"代际（epoch）"概念**：abort 后网络缓冲里已解析的在途 SSE 帧仍可能入队；旧轮 `final` 帧可能错误复位新轮状态。
3. 无 ASR 轮次跟踪：无超时、无单飞、无 stale 响应丢弃。
4. 无"播放感知"门控信号（还需暴露停播时刻）。
5. 设置面板尚无 inputMode/sensitivity 的 UI（契约字段在，界面未建）。

---

## 3. 总体架构

### 3.1 分层

```
┌──────────────────────────── 浏览器渲染进程（离线） ───────────────────────────┐
│                                                                              │
│  AudioWorklet(vad-capture)          纯 TS 可单测（音频时钟驱动，无 DOM/rAF）  │
│  16k 单声道 PCM 帧 + 每帧 RMS  ──▶  VadDetector（状态机/底噪/双阈值/门控）    │
│                                            │ 决策：candidate/start/end/discard│
│                                            ▼                                 │
│                              AsrTurnTracker（turnId/超时/单飞/单槽排队）      │
│                                            │ speech-end 段                    │
│                                            ▼                                 │
│              useHandsfreeVoice（编排）：16k WAV → POST /api/voice/asr        │
│                                            │                                 │
│        speech-start（且助手在播）─▶ playback.cancel(epoch++) + streamStop()   │
│                                  ◀── 播放门控输入：isSpeaking / lastStopAt    │
│                                            │                                 │
│                            识别文本非空 ─▶ session.send(text)（新一轮）        │
└──────────────────────────────────────────────────────────────────────────────┘
                                            │ HTTP（本机）
┌──────────────────────────── 服务端（零改动） ────────────────────────────────┐
│  /api/voice/asr（SenseVoice，已有）  /api/chat/stream（abort 透传，已有）     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 为什么 VAD 放浏览器端（vad-web）而不是服务端 Silero

- `sherpa-onnx-node@1.13.8` 确实导出 `Vad`（Silero/Ten-VAD，配置面 `{threshold, minSilenceDuration, minSpeechDuration, windowSize, maxSpeechDuration}`，`acceptWaveform/front/pop/flush`），但它是 **Node 原生绑定，渲染进程不可用**；走服务端必须新建 WebSocket 持续上传麦克风 PCM。
- barge-in 的停止决策对延迟极敏感，必须在本地、在检测到开口的同一帧触发；多一跳 RTT（即便本机）也让"顿挫感"变差。
- 浏览器端能量 VAD 是参考项目真机验证过的方案；叠加浏览器自带 AEC/NS + 播放感知门控，半双工场景够用，且**零新增模型/端点**，与路线图命名"vad-web"一致。
- 服务端 Silero 留作 P2：高噪环境可加 WS 旁路（§13），接口预留但本期不建。

### 3.3 典型时序

**免手首轮**：麦克风常开 → 校准底噪 → 用户说话 240ms 确认（listening）→ 尾静音 900ms（speech-end）→ 整段上传 ASR（thinking）→ 文本自动发送 → SSE 流式回复 + TTS（speaking）→ 播完 idle。

**打断**：speaking 中用户开口 → 门控要求"更响（2.2×）且更久（600ms）"确认 → 确认当帧：`playback.cancel()`（epoch+1）+ `streamStop()`（abort 上游）→ 继续录完用户这句 → ASR → `send()` 新轮次。被打断的助手半截回复由现有 `stop()` 标记为 stopped，不写记忆（post-turn-jobs 随 signal 取消，符合预期）。

---

## 4. VadDetector 纯函数设计（M4-1）

新文件 `apps/web/src/features/voice/vad/vad-detector.ts`，**无 DOM、无 rAF、无可变 Date**：输入为"已知时长的 RMS 采样"，时钟来自音频帧本身（worklet 每 512 样本@16k = 32ms），因此后台标签节流不影响判定，且测试可确定性喂序列。

### 4.1 配置参数（代码侧唯一入口，默认值与用户设置合并后生效）

| 参数 | 默认 | 说明 |
|---|---|---|
| `sampleRate` | 16000 | worklet 已降采样 |
| `frameSamples` | 512 | 32ms/帧 |
| `calibrationMs` | 800 | 启动只学底噪不判语音 |
| `speechStartMs` | 240 | 连续超起始阈值的确认时长（候选期预录不丢起字） |
| `minSpeechMs` | 320 | 短于此判 discard（磕碰/点击） |
| `silenceMs` | **900（取设置 `vadSilenceMs`，300–5000 可调）** | 尾静音判句结束 |
| `maxSpeechMs` | 30000 | 安全上限：到点强制 speech-end，防异常长录 |
| `startMultiplier` | 2.6 / **3.2** / 3.8 | 灵敏度 high / balanced / low（新契约 `vadSensitivity`） |
| `stopMultiplier` | 1.8 | 结束阈值更低（迟滞，防止句中抖回静音） |
| `minStartThreshold` / `minStopThreshold` | 0.025 / 0.015 | 绝对下限（极安静房间不为零阈值误触发） |
| `noiseFloorInit` | 0.008 | 底噪初值 |
| `noiseEma` | 0.94（新样本 0.06） | 瞬时值先 clamp 到 `noiseFloor*2.5` 防巨响抬高底噪；仅校准期或低于起始阈值时更新 |
| 播放态门控 | 起始阈值 ×2.2、确认 600ms；停播后 500ms 内 RMS 按 0 计 | 见 §6 |

> 调参纪律（吸取既有经验）：所有参数仅从构造配置注入并可在日志中 dump 最终生效值；UI 只暴露灵敏度三档与尾静音时长，其余为内部常量，避免散落在多处魔法数字。

### 4.2 状态机

```
none ──rms≥start(连续240ms)──▶ speech-start（起点回溯到候选时刻，预录前缀保留）
  │ candidate 期间任一帧 < start ─▶ none（候选取消，已录 chunk 丢弃）
speech-start ──rms<stop 连续 silenceMs──▶ 时长≥320ms ? speech-end : discard
speech-start ──连续说话达 maxSpeechMs──▶ speech-end（强制收尾）
```

`sample(frame: {rms, ms})` 返回判别事件：`none | candidate | candidate-cancel | speech-start | speech-end | discard`，由编排层消费；检测器不碰录音缓冲（缓冲在 monitor hook 中管理），保持纯函数。

### 4.3 单测（密集，确定性时钟）

- 底噪 EMA：巨响不抬高底噪；说话期冻结底噪。
- 双阈值迟滞：start/stop 之间的抖动不翻转。
- 候选取消、最短短语 discard、正常起止、maxSpeech 强切。
- 校准期内不产事件。
- 门控参数注入后阈值/确认时长改变（用序列帧数表达，不依赖真实定时器）。

---

## 5. 采集链路：AudioWorklet（M4-2）

- 新文件 `apps/web/public/worklets/vad-capture.worklet.js`（原生 JS，无构建依赖；Next 与 standalone 均从 public 提供；dev 态 Electron 走 http://127.0.0.1:3000 加载不受 file:// 限制）。
- worklet 职责：`port.onmessage` 启动后对输入做 16k 降采样（复用线性插值算法的 worklet 内实现），**每 32ms 一帧** post `{rms, pcm16k}`（`ArrayBuffer` transfer，零拷贝）；不做任何状态决策。
- 麦克风约束沿用并收紧：`{channelCount:1, sampleRate:16000, echoCancellation:true, noiseSuppression:true, autoGainControl:false}`（AGC 关：自动增益会让回声也变大，破坏门控阈值假设）。
- 录音源**只接 worklet，不接 destination**（PTT 用的 0-gain 落地技巧在 worklet 架构下不需要，天然无自激）。
- hook：`useVadMonitor({enabled, sensitivity, silenceMs, gate, onEvent})` 管理 AudioContext/worklet/生命周期；StrictMode 下遵循 M3 教训——**worklet/ctx 等一次性资源一律在 effect 内创建与销毁**。
- 缓冲策略（参考项目"预录不丢前缀"）：candidate 阶段就开始累积 PCM；candidate-cancel 丢弃；speech-end 交出整段 Float32(16k)。
- 复用 [pcm-wav.ts](file:///E:/code/traeWork/workBuddyForMe/apps/web/src/features/voice/pcm-wav.ts) 的 `encodeWav16k` 出 WAV。
- 上下文解锁：worklet/AudioContext 必须在用户手势后创建——开启免手模式的点击即手势；hook 处理 suspended→resume。
- hook 单测用 fake MediaStream + 假 worklet（直接向 hook 喂帧消息）测事件接线；worklet JS 本体靠真机验收（jsdom 无 AudioWorklet）。

---

## 6. 回声门控与 barge-in（M4-2/M4-3 核心）

### 6.1 半双工软门控（不是硬闭麦）

路线图写"speaking 闭麦"，但硬闭麦会使 barge-in 不可能（用户在播 TTS 时根本无法触发）。采用参考项目真机方案的**软门控**：

| 场景 | VAD 输入 |
|---|---|
| idle / listening / thinking | 原始 RMS，正常阈值 |
| speaking（助手朗读中） | 起始阈值 ×2.2、确认时长 600ms——近讲人声比扬声器回声"更响更久"才放行 |
| 刚停播 500ms 内（冷却窗） | RMS 按 0 计——屏蔽声学拖尾/混响 |

门控输入来自 `useVoicePlayback`：已有 `speaking`，**新增暴露 `lastSpeakEndedAt`**（player active 集合归零的时间戳）。monitor 每帧查 `gate = {speaking, cooldownMs(500)}` 决定参数缩放；这些参数仍从 VadDetector 配置入参进，单测可覆盖。

外放特别响/麦距特别远时门控可能误拒真人说话——Non-Goal 已声明不承诺免耳机，设置中后续可加"最严档（播放时硬闭麦）"，本期不建。

### 6.2 打断动作（speech-start 事件的消费者，同步执行）

1. `playback.cancel()`——立即停所有 source（队列同时 epoch+1，§8）。
2. `streamStop()`——abort 当前 SSE；上游 LM fetch 与 TTS 合成随 signal 停止（已核实现链路）。
3. 本地语音态：speaking → listening；不弹 toast、不改消息流（半截助手消息在最终 send 新轮次时由会话既有逻辑处理；若用户 ASR 为空则不发新轮，接受本次打断即"让她闭嘴"语义）。
4. monitor 继续当前段录制不停麦——打断者的这句话正是下一轮输入。

### 6.3 空识别与误触发

- speech-end 段 ASR 为空/纯标点：丢弃，不发消息，回 idle；计入 `asrEmpty` 指标。
- discard（<320ms）不计 ASR 请求。
- 连续 3 次空识别自动进入 30s "打盹"（提高 startMultiplier ×1.5），任一中端语音恢复——防风扇/键盘环境持续空转。本期可只做计数器+提示，不做复杂自适应。

---

## 7. ASR 轮次隔离（M4-2）

新文件 `vad/asr-turn-tracker.ts`（纯类，可单测）：

- 每段话一个 `turnId`（crypto.randomUUID）+ 起始时间戳；`start/finish/cancel/isCurrent`。
- **单飞 + 单槽排队**：识别中又结束一段，只保留最新一段，识别完自动补发（不并发 ASR）。
- **20s 无结果超时**：释放单飞、记 asrTimeout、回 listening，永不卡死在 thinking。
- ASR 响应回来时校验 turnId，stale 直接丢弃（abort 后迟到的响应等）。
- 会话切换/关闭监控/页面卸载：cancel 当前 turn + abort 上传请求。

---

## 8. 播放队列代际作废（M4-3）

改造 [audio-playback-queue.ts](file:///E:/code/traeWork/workBuddyForMe/apps/web/src/features/voice/audio-playback-queue.ts)：

- 增加 `epoch: number`，`cancel()` 时自增。
- 帧入队时加盖当前 epoch；`pump()` 取出帧若 `frame.epoch !== current` 一律丢弃（含旧轮迟到的 `final=true`——防止它把新轮状态错误复位为 idle）。
- `VoicePlayback.cancel()` 返回新 epoch（或暴露 getEpoch），编排层在 abort 时不依赖时序。
- 现有 4 个队列单测全部保留，新增：cancel 后迟到帧不落播放器、旧 final 不复位新轮。
- WebAudioPlayer 不改（cancelAll 已能立即停 source）。

---

## 9. 契约、设置与 UI（M4-3）

### 9.1 shared 契约增量

- 已存在：`inputMode('ptt'|'vad')`、`vadSilenceMs`（默认 900）——无需迁移（readVoiceSettings 合并默认值）。
- 新增：`vadSensitivity: z.enum(['low','balanced','high'])`，默认 `'balanced'`；同步进 update schema（`.strict()`，不加会被拒绝）、required 完整 schema、DEFAULT_VOICE_SETTINGS。服务端 `patchVoiceSettings` 是通用 spread 合并 + zod 校验，**无需改服务端代码**（已核实现有实现）。
- 不新增任何 API 端点。

### 9.2 设置面板（语音偏好）

在 ASR 区块下加「输入方式」分段控件：`按住说话（PTT） / 免手持续聆听`；选 vad 时展开：
- 灵敏度三选（高/均衡/低 → startMultiplier 2.6/3.2/3.8，文案说明"外放环境选低"）；
- 尾静音时长（复用 vadSilenceMs，300–5000ms，步进 100）；
- 一行半双工提示："朗读时需要明显更大的声音才能打断；建议使用耳机。"
- 沿用既有本地乐观态模式（M2 ToggleRow 经验：onChange 同步本地 + effect 回同步服务端值）。

### 9.3 对话页编排与入口

- 新 hook `useHandsfreeVoice`（或在 chat-page 组合 monitor + tracker + session/playback）：
  - 仅当 `asrEnabled && inputMode==='vad'` 且模型 asrReady 时挂载监控。
  - 输出语音四态（idle/listening/thinking/speaking）供 UI 与形象消费（VAD 模式下 listening/thinking 由客户端主导；speaking/idle 与服务端 voice_state 合并：以本地队列为准，避免双源抖动——合并器：speaking 由 playback 驱动，listening/thinking 覆盖）。
- Composer：vad 模式下把 PTT 的 `MicButton` 换成**免手开关按钮**（Mic/Waveform 图标 + data-state=四态，呼吸/波纹样式表示 listening）；再次点击关闭监控（用户对麦克风保有显式控制权，关闭即无任何采集）。
- PTT 模式代码路径零改动，两按钮互斥渲染。
- 形象栏：`listening` 时可驱动一个"在听"微状态（本期仅边框/波纹，不新增 Live2D 参数）。

---

## 10. 服务端改动评估

**预期零改动**，评审时需逐项确认：

1. ASR 复用 `/api/voice/asr`（频率从每按一次变为每段一次，无新负载类型）。
2. 打断复用 HTTP abort；已核实 signal 透传：route(`request.signal`) → `streamChat` → orchestrator → `runProviderTurn(chatStream)` → `openSseChannel`；withVoice 每事件查 `deps.signal.aborted` 退出合成。
3. post-turn 记忆/摘要随 signal 取消——被打断轮不抽记忆，下一完整轮覆盖，行为正确。
4. 无需为 VAD 新增模型/下载器条目（能量法）。

---

## 11. 文件清单与任务分解

| # | 内容 | 测试 |
|---|---|---|
| M4-1 | `voice/vad/vad-detector.ts` 纯状态机 + 配置合并（§4） | vad-detector.test.ts（≥10 例，喂 RMS+时长序列） |
| M4-2 | `public/worklets/vad-capture.worklet.js`、`voice/vad/use-vad-monitor.ts`、`voice/vad/asr-turn-tracker.ts`（§5/§7） | tracker 单测；monitor hook 用假 worklet 帧 + fake MediaStream |
| M4-3 | 队列 epoch 改造（§8）、playback 暴露 lastSpeakEndedAt、契约 `vadSensitivity`（仅 shared 改）+ 设置面板输入方式/灵敏度/尾静音 UI（§9.1-9.2） | 队列新增 2 测；契约/设置沿用 voice-preference-panel.test 模式补 |
| M4-4 | `useHandsfreeVoice` 编排 + 四态合并 + Composer 免手按钮 + 打断接线（§6.2/§9.3） | 组件测（假帧驱动：自动发送、打断调 cancel/stop、空识别不发） |
| M4-5 | e2e `tests/e2e/voice-vad.spec.ts`（§12） | Playwright fake mic |
| M4-6 | 真机 10 轮免手冒烟 + 指标记录 + 门禁（typecheck/lint/lines/全量单测） | 人工取证 |

---

## 12. 测试策略

- **纯函数**：VAD 全部边界、tracker 超时/单飞/stale、队列 epoch——不依赖任何计时器实现。
- **组件/Hook**：假 MediaStream/AudioWorklet（注入帧序列），mock `/api/voice/asr` 与 chat SSE：
  1. 静音→语音→尾静音：自动 ASR 且自动发送一条消息；
  2. <320ms 噪声：discard，无 ASR 请求；
  3. 播放中注入普通能量：不触发（门控抑制）；注入 2.2× 持续 600ms：触发打断（断言 play 被停、stream 请求 abort）；
  4. 停播 300ms 内说话不触发、600ms 后正常；
  5. ASR 20s 超时回 listening；识别中再说只排队一段；
  6. PTT 模式回归：按钮与自动监控互不挂载；关闭免手后无麦克风轨残留（track.readyState 断言）。
- **e2e**：Chromium fake audio capture 注入静音/语音 WAV 段（参考 M2 voice-asr.spec 已跑通的 fake mic 方案），WBFM_MOCK_AI=1。
- **真机**：系统 Edge/Chrome 与 Electron 各一轮（TRAE 内置窗 getUserMedia 不可用，不用）；耳机与笔记本外放两种环境记录误触发率。

## 13. 指标与 P2 演进

- 轻量本地指标（localStorage，沿用 M2 设置存储风格即可，不建服务端）：`vadDiscardRate`、`asrEmpty`、`asrTimeout`、打断响应延迟（speech-start 帧时间戳→source 停止）、每小时误触发次数。仅本地留存最近 200 条，供参数调优，不上报。
- **P2（不在本期）**：高噪环境可选 WebSocket 旁路到服务端 sherpa `Vad`（Silero，阈值/minSilence 等参数面已核实存在），客户端能量门作为预切；流式 ASR/唤醒词仍不做。

## 14. 风险与对策

| 风险 | 级别 | 对策 |
|---|---|---|
| 外放回声自我触发 | 高 | 浏览器 AEC/NS + 播放态 2.2×/600ms 门控 + 500ms 冷却；Non-Goal 写明不承诺免耳机；灵敏度低档与文案引导 |
| 键盘/风扇误触发 | 中 | 最短短语 320ms + 240ms 确认 + 连续空识别打盹；指标暴露 discard/empty 率便于调参 |
| ScriptProcessor 弃用/主线程开销 | 中 | 用 AudioWorklet（32ms 帧、音频时钟），长时监听不占主线程、不受后台节流 |
| worklet 资源路径（打包/standalone/Electron） | 中 | 放 public/ 固定 URL 提供；真机覆盖 dev:3000 与打包态；CSP 若收紧需放行 worklet 源（评审确认现有 CSP） |
| abort 后迟到 SSE 帧错误播放/复位 | 中 | 队列 epoch 作废（§8）；解析器在 abort 后停止读循环（use-chat-stream finally 已 cancel body） |
| 麦克风常开的用户心理负担 | 中 | 显式开关按钮 + listening 可视状态 + 关闭即释放 track；默认 PTT，不默认常开 |
| 尾静音固定值在自然停顿处截断 | 中 | 默认 900ms 且 300–5000 可调；参考项目把 800 调到 1200 的教训记录在注释；P2 可接 ASR 尾点二次确认 |

## 15. 真机验收标准（M4-6）

1. 免手 10 轮连续对话：自动起止、自动发送，无一次漏句/截断/自发自收。
2. 朗读中打断 ≥5 次：人物立即闭嘴、生成停止（服务端日志无继续合成）、新问题得到对应回答。
3. 耳机环境 30 分钟零误触发；外放环境误触发 ≤2 次/小时（人工记录，超标则调灵敏度默认档）。
4. 关闭免手/切换会话/关页面后：无麦克风指示灯残留、无 AudioContext/source 泄漏（DevTools 计数前后一致）。
5. PTT 路径回归无变化；门禁 typecheck/lint/check:lines 0 error，全部单测 + e2e 绿。
6. Electron 打包态断网全链路可用（VAD 纯本地、ASR/TTS 已离线）。
