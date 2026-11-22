# v4.19 追加记录：语音链路与寒暄快路径

> 状态：已完成（2026-11-22），随 `WorkBuddyForMe-Setup-4.18.0.exe`（commit `80b5ab6c`）打包
> 关联提交：`75735692`（流式 TTS / Matcha / 腾讯云）、`43d2c975`（寒暄快路径）、`80b5ab6c`（微软 Edge 在线朗读）
> 说明：本主题不在 v4.19 原范围（见 [README.md](./README.md)），属于实现期追加；安装包版本号曾沿用 4.18.0，v4.19.0 发布时已统一升版。

## 1. 背景

1. **首音慢**：本地 Kokoro 合成首句等待偏长，逐句整段合成后语音桥才下发，用户体感是「回答出来很久才出声」。
2. **简单提问 token 成本高**：内置助手启用了 122 个工具（MCP 占多数），「你好」实测 `prompt_tokens=27671`；意图识别虽已存在，但只做分类/配额，不裁剪工具与记忆。
3. **在线方案缺位**：只有本地模型一条路；不想下载模型、也没有腾讯云密钥的用户没有可用选项。
4. **设置页歧义**：选择在线引擎时，本地「朗读引擎」卡片仍展示，容易误以为在线也依赖这些本地模型。

## 2. 目标与边界

目标：

- 降低首音延迟（流式合成 + 更快的本地模型 + 在线兜底）；
- 提供两种在线朗读：腾讯云（有密钥、音质更好）与微软 Edge（免密钥、免安装）；
- 把「你好」这类高置信短寒暄从完整链路中剥离，显著降低 prompt token；
- 设置页按朗读来源展示对应配置，避免本地/在线选项混杂。

非目标：

- 不做声音克隆、情感强度调节；
- 不改 ASR 链路；
- 不把微软在线音频做成逐块流式（当前按句缓冲后返回）；
- 不做在线服务商的可配置代理或负载均衡。

> 偏离说明：本追加引入 `ws` 与 `mpg123-decoder` 两个运行时依赖，偏离 v4.19「零新增运行时依赖」约束。二者均为纯 JS/WASM，无原生编译；已验证可随 Next standalone 正常打包运行。

## 3. 流式 TTS

- `TtsEngine` 增加可选的 `synthesizeStream(text, opts, sink)`：引擎按生成顺序回传增量 PCM，返回值仍为完整结果；
- 本地 sherpa worker 改用 `generateAsync` + 进度回调，逐块 `postMessage`；取消在块边界生效；
- 语音桥收到音频块立即下发 `voice_audio`，不再等下一个文本事件；文本与音频顺序由同一队列保证；
- 未实现流式的引擎由上层退回一次性 `synthesize`，行为不变。

## 4. 本地 Matcha 模型

- 模型清单新增 `matcha`：声学模型 + 独立 vocoder + lexicon + tokens + jieba 词典；
- 运行时按 Matcha 配置构造 sherpa 引擎，与 Melo/Kokoro 共用同一套下载/预热/缓存链路；
- 设置页新增「Matcha 快速单声」卡片；默认仍为 Melo，用户可切换；
- 定位：单一中文女声，合成速度约为 Kokoro 的 10 倍，适合追求首音速度的场景。

## 5. 腾讯云在线 TTS

- 新增 `TencentTtsEngine`：调用 `TextToVoice`（API 3.0），`TC3-HMAC-SHA256` 签名，`Codec=pcm` 直出；
- 应用语速 1.0 映射到腾讯云 `Speed` 档位，按官方档位线性插值；
- 单次请求文本上限 150 字，超长按标点切分；15 秒超时；取消即中断请求；
- 凭据（SecretId/SecretKey/Region）通过 `SecretCipher` 加密落库，读接口只返回脱敏状态；
- 设置项：地域、音色 ID、模型类型、采样率；引擎按凭据 + 音色 + 采样率惰性重建；
- 合成失败自动回退本地引擎；本地模型也未就绪时返回带引导的错误。

## 6. 微软 Edge 免密钥在线朗读

- 使用 Edge「大声朗读」WSS 端点，内置公开客户端令牌，无需用户密钥；
- 鉴权采用 `Sec-MS-GEC` v2：对「版权声明 + Windows 时间戳（5 分钟取整）+ 内置令牌」做 CS64 + SHA256，格式为 `<16 hex>-<64 hex>`；
- 请求头模拟 Edge 浏览器（Origin / User-Agent / Accept-Language 等），`ws` 建立连接；
- 服务只接受 MP3 / WebM / Ogg：固定请求 `audio-24khz-48kbitrate-mono-mp3`，再用 `mpg123-decoder`（WASM）解码为 24kHz 单声道 float32；
- 音色用 ShortName 标识，默认 `zh-CN-XiaoxiaoNeural`；设置页提供 8 个中英快捷音色，已保存的其他音色 id 原样保留；
- 失败、超时、断网、解码失败均回退本地引擎；界面注明「朗读文本会发送到微软语音服务」；
- 打包注意：webpack 会把 `ws` 一起打进 server bundle，而其可选依赖 `bufferutil` 被解析为空模块，长帧发送会报 `mask is not a function`。处理方式：运行时动态 `import('ws')`，并在加载前设置 `process.env.WS_NO_BUFFER_UTIL ??= '1'`，强制使用内置 JS mask。已在 standalone 产物中实测通过。

## 7. 朗读来源展示与就绪判定

- 「朗读引擎来源」变为三选一：本地离线 / 腾讯云在线 / 微软在线（免费免密钥）；
- 只有本地离线时才展示「朗读引擎」卡片、推理线程、模型音色说明；在线模式只保留在线配置与通用语速；
- 语速对本地与两种在线引擎都生效；
- `ttsReady` 判定：本地看模型文件，腾讯云看凭据，微软在线恒为就绪，`none` 恒为未就绪；
- 切换引擎后立即失效引擎单例并刷新模型状态，避免开关仍停留在「未就绪」。

## 8. 寒暄快路径

触发条件（全部满足）：

- 意图为 `chitchat`，且 `source !== 'fallback'`、`confidence >= 0.7`；
- 文本非空且不超过 40 字；
- 无图片附件；
- 不含 URL；
- 不含任务/工具关键词（查、打开、搜索、文件、天气、翻译、总结、邮件等）。

效果：

- 本轮 `supportsTools=false`，`buildTools` 返回空 Map，主模型不再收到 122 个工具 schema；
- 跳过长期记忆召回，不产生 `memories` 事件；
- 现有 `isLeanTurn` 同时生效，技能提示词与流程工具声明也不再注入；
- `context_snapshot` 增加 `fastChitchat` 字段，便于核对是否命中。

前置修正：

- 原规则对「你好」只给出 `chitchat + fallback + 0.3`，快路径条件永远不成立；
- 新增纯寒暄规则：整句仅问候/致谢/确认（你好、在吗、谢谢、hello、好的等）时判为 `rule + 0.85`；
- 含任务或知识内容的句子不命中该规则，继续走完整链路。

保守回退：任务关键词、URL、图片、长文本、低置信度、fallback 任一出现即走完整链路，宁可多花 token，也不因误判丢能力。

预期效果：新会话发「你好」时，主请求由约 27.7k prompt tokens 降为人设 + 历史 + 会话事实的规模。

## 9. 关键文件

| 领域 | 文件 |
|---|---|
| 流式接口/worker | `packages/voice/src/engine/types.ts`、`packages/voice/src/engine/sherpa/tts-worker.ts`、`tts-worker-support.ts` |
| Matcha | `packages/voice/src/models/manifest.ts`、`packages/voice/src/engine/sherpa/tts-native-config.ts`、`packages/core/src/voice/voice-engine-config.ts` |
| 腾讯云 | `packages/core/src/voice/cloud/tencent-tts-engine.ts`、`voice-cloud-credentials.ts`、`voice-cloud-tts.ts` |
| 微软 Edge | `packages/core/src/voice/cloud/edge-tts-engine.ts`、`edge-tts-token.ts` |
| 运行时/就绪 | `packages/core/src/voice/voice-runtime.ts`、`packages/shared/src/schemas/media/voice.ts` |
| 设置页 | `apps/web/src/features/voice/settings/voice-engine-params.tsx`、`settings/cloud/edge-tts-section.tsx` |
| 语音桥 | `apps/web/src/lib/server/voice/voice-chat-bridge.ts` |
| 快路径 | `packages/core/src/chat/context/context-plan.ts`、`packages/core/src/chat/context/turn-context-assembly.ts`、`packages/shared/src/schemas/chat/intent/turn-intent.ts` |

## 10. 验收记录

- 单测：core chat 210 个通过；core voice 37 个通过；共享意图规则 5 个通过；语音设置页 9 个通过；
- 类型检查：`@wbfm/core`、`@wbfm/shared`、`@wbfm/web` 全部通过；
- Lint：0 error（仅存量 warning）；
- 门禁：文件行数、目录结构、循环依赖、包导出、surface 全部通过；
- 生产构建：`pnpm build:web` 成功；
- 生产 standalone 实测：切换 `ttsEngine=edge` 后调用 `/api/voice/tts` 返回 200，生成 168,236 字节 WAV（约 3.5 秒音频）；
- 桌面打包：`WorkBuddyForMe-Setup-4.18.0.exe`，265.46 MB，SHA256 `468fc64ec728e980ee2be1024584607eac734100d18b7e25ef643413522f9a5a`。

## 11. 风险与回退

| 风险 | 影响 | 缓解 |
|---|---|---|
| 微软朗读是非官方免费端点，可能改协议/限流 | 在线合成失败 | 失败自动回退本地；界面提示需要联网与已下载模型 |
| `ws` 被 bundler 打包后 bufferutil 缺失 | 长帧发送报错 | 动态加载 + `WS_NO_BUFFER_UTIL=1`；standalone 实测 |
| `mpg123-decoder` 增加包体 | 安装包略增 | 纯 WASM、无原生依赖；约 190KB |
| 寒暄规则误判 | 少召回记忆或工具 | 任务关键词/URL/图片/长文本/低置信度全部回落完整链路 |
| 在线文本外发 | 隐私预期 | 设置页注明文本会发送到对应云服务 |

回退方式：设置页切回「本地离线」即不再使用在线引擎；快路径可通过收紧 `isChitchatFastPath` 条件或移除纯寒暄规则快速停用。

## 12. 后续

- 寒暄轮目前仍会执行回合后的记忆提取；如仍在意成本，可让快路径同时跳过提取；
- 微软 Edge 目前按句缓冲解码，后续可改为边收 MP3 边解码，进一步压缩首音；
- v4.19 正式发版时补发行说明与博客，并把版本号从 4.18.0 统一升级。
