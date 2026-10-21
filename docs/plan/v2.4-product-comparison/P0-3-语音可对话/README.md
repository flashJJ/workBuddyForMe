# P0-3 语音可对话（方案分册）

> 来源：[竞品体验对比 §4.2 P0-3](../01-竞品体验对比与差距诊断.md)。
> 目标：把语音从「可配置」升级为**「一键开启语音对话」**——不必懂参数、不必先搞清模型体积，就能开口连续对话。

## 文档

| 文档 | 内容 |
|---|---|
| [01 现状与差距](01-现状与差距.md) | 语音链路取证（参数/模型清单/下载/免手编排/入口），D1–D5 差距 |
| [02 功能设计](02-功能设计.md) | 一键开启、参数收进高级、下载体验、打断与轮次口径 |
| [03 实施路线与风险](03-实施路线与风险.md) | 任务拆解与验收、e2e、风险红线、明确不做 |

## 一页结论

- **链路已经通了**，比竞品报告里写得更完整：免手连续聆听（`use-vad-monitor` → 段缓冲 → ASR → 自动发送）已在（[use-handsfree-voice.ts:43-157](../../../../apps/web/src/features/voice/use-handsfree-voice.ts#L43-L157)），
  模型清单/体积/镜像/进度/取消/文件级断点也已在（[manifest.ts](../../../../packages/voice/src/models/manifest.ts)、[downloader.ts:48-137](../../../../packages/voice/src/models/downloader.ts#L48-L137)）。
- **缺的是「心智入口」与「默认值」**：
  - 用户必须先懂**灵敏度 / 尾静音 / 半双工提示**才能用（[voice-input-section.tsx:15-126](../../../../apps/web/src/features/voice/settings/voice-input-section.tsx#L15-L126)）；
  - 「语音」在 UI 上是「设置里一个开关 + 对话页一个小按钮」（[mic-button.tsx](../../../../apps/web/src/features/voice/mic-button.tsx)、[handsfree-mic-button.tsx](../../../../apps/web/src/features/voice/handsfree-mic-button.tsx)），不是一个可理解的模式；
  - 模型下载入口未在**第一次要用语音时**明示体积与等待成本。
- **现状边界（必须说清）**：当前是**半双工**——「说完再听」，打断靠 barge-in（播放中止）；**不是**全双工（边听边说）。
  本项只做「好用的半双工」；全双工列入 P2 候选，不做承诺。

## 待拍板

1. **「一键开启语音对话」的落点**：只在设置页（简单）vs 设置页 + 对话页双入口（推荐）。
2. **默认是否武装免手**：开启后直接进免手模式（推荐，最省事）vs 保持 PTT（更省电/更可控）。
3. **语音模型的默认选择**：默认选哪个 TTS/ASR（体积与音质权衡），需在 M0 用真机确认后冻结。

## M3 落地口径（2026-10-20）

M0 §4/§5/D7–D9 的落地形式（默认值口径 T5）：

| 项 | 落地值 | 落点 |
|---|---|---|
| 默认档位（默认路径唯一选择） | **反应快** = `vadSensitivity: balanced` + `vadSilenceMs: 600` | [voice-quick-config.ts](../../../../apps/web/src/features/voice/voice-quick-config.ts) 的 `VOICE_PROFILES.fast` |
| 备选档位 | **更宽容** = `low` + `1200` | 同上 `VOICE_PROFILES.tolerant` |
| 灵敏度三档 / 尾静音四档 | 退入「高级」（**默认收起**），保留「高」灵敏度可调 | [voice-input-section.tsx](../../../../apps/web/src/features/voice/settings/voice-input-section.tsx) |
| 「说完了」口径 | 由档位尾静音决定；UI 以人话标注「约 X 秒未说话即认为说完」 | 同上（`voice.input.silenceNow`） |
| 打断响应 | 由 barge-in 承担（文案「助手朗读时你开口即可打断」），无独立数值 | [use-handsfree-voice.ts](../../../../apps/web/src/features/voice/use-handsfree-voice.ts) |
| 一键开启行为 | 写入 `asrEnabled:true` + `inputMode:'vad'` + `ttsEnabled:true` + 默认档位；对话页入口**同时武装免手** | [voice-quick-start.tsx](../../../../apps/web/src/features/voice/voice-quick-start.tsx) / [voice-quick-start-button.tsx](../../../../apps/web/src/features/voice/voice-quick-start-button.tsx) |
| TTS 默认 | **仍为 Kokoro**；改 MeloTTS 待 §5 真机工装通过（见 M0 §8 变更记录） | `packages/shared/src/schemas/voice.ts` |

- **回归**：`voice-quick-config.test.ts` 断言两档取值与「默认设置属于默认档」；e2e [voice-quickstart-v24.spec.ts](../../../../tests/e2e/voice-quickstart-v24.spec.ts) 覆盖 A1–A5。
- **A5（文件级断点）** 由 [downloader.test.ts](../../../../packages/voice/src/models/downloader.test.ts) 的「已存在且大小匹配的文件跳过下载」承担；e2e 只断言 UI 侧「就绪后不再要求下载」。
