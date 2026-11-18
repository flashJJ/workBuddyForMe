# v4.6.1 Kokoro 模型下载修复

> 状态：M1–M2 代码完成；待 Windows 真机下载验证与提交  
> 基线：v4.6.0（`APP_VERSION = 4.6.0`；本版无 DB 迁移）  
> 分支：`fix/v4.6.1-kokoro-download`  
> 一句话：修掉 Kokoro「下载后校验缺失」的误报，并把 377 文件 / 394MB 的下载链路升级为**可重试、可续传、可校验**。

## 1. 问题与证据

用户报错：

```text
下载后校验缺失：lexicon-zh.txt, model.onnx
```

实际不是下载失败，而是 manifest 的期望大小过期：

| 文件 | 本地 / 上游实际 | manifest 旧值 |
|---|---:|---:|
| `model.onnx` | 325,561,476 | 325,631,784 |
| `lexicon-zh.txt` | 2,120,131 | 2,119,465 |

上游 `hf-mirror.com` 的 `Content-Length` 与本地文件完全一致；[findMissingFiles](file:///e:/code/traeWork/workBuddyForMe/packages/voice/src/models/manifest.ts#L125-L137) 把「大小不符」也归类为「缺失」，所以文案看起来像文件没下下来。

当前链路的结构性问题：

1. **377 个文件、约 394MB 顺序下载**，任何一个文件失败都会中止整个 Kokoro。
2. **大文件没有 Range 续传**：`model.onnx` 325MB、`voices.bin` 54MB，失败后从 0 重下。
3. **没有重试 / 退避 / 超时**：一次 429、503、连接重置就是最终错误。
4. **整文件先读进内存再写盘**：325MB 文件会占用 325MB 以上内存再加一次拷贝。
5. **只校验大小**：同尺寸损坏、上游内容变化都会误判；没有 revision 固定和哈希。
6. **镜像链路长**：`hf-mirror` 大文件会 302 到 `cas-bridge.xethub.hf.co` 的签名地址，长连接容易被重置或签名过期。
7. **镜像配置判断粗糙**：`modelMirrorBase.includes('hf-mirror')`，自定义镜像不含该字符串时会回落到官方 `huggingface.co`。
8. **错误文案不区分**：缺失、大小不符、哈希不符都叫「缺失」，排查成本高。

## 2. 目标与非目标

### 目标

| 编号 | 目标 | 验收 |
|---|---|---|
| G1 | 修掉误报 | 已下载且大小正确的 Kokoro 文件直接判定就绪，不再报「校验缺失」 |
| G2 | 上游变更可控 | 模型 URL 固定 revision；上游改 `main` 不会静默破坏校验 |
| G3 | 大文件完整性 | LFS 大文件带 SHA256；同尺寸损坏能被发现 |
| G4 | 网络可恢复 | 单文件重试、退避、超时；大文件断点续传；流式写盘 |
| G5 | 错误可诊断 | 区分缺失 / 大小不符 / 哈希不符；UI 能看到当前文件与重试次数 |

### 非目标

- 不把 394MB Kokoro 权重打进安装包；不在本版做 Full / Offline 安装包。
- 不改 `sherpa-onnx` 本地推理路线，不引入云 TTS。
- 不拆分 `voices.bin`，不提供按语言/性别裁剪的音色包。
- 不处理 `espeak-ng-data` 的 GPL 许可问题（单独评估）。
- 不做下载器 UI 大改；只补错误文案、状态与诊断字段。

## 3. 范围

### P0 先修错（必须）

| 编号 | 内容 | 文件 |
|---|---|---|
| P0-1 | 更新 Kokoro manifest 两个过期大小；补 `lexicon-zh.txt` 断言 | `manifest-kokoro-files.ts`、`manifest.test.ts` |
| P0-2 | 给 `VoiceModelSpec` 增加 `revision`，固定到 `423bfb9ccd6a66115a76602a9630ffea265ae176`；`modelFileUrl` 使用 `/resolve/<revision>/` | `manifest.ts` |
| P0-3 | `findMissingFiles` 返回结构化结果：`missing` / `sizeMismatch` / `hashMismatch`；错误文案分开 | `manifest.ts`、`voice-runtime.ts` |
| P0-4 | 状态刷新以磁盘为准：已有正确文件时清除旧 error，不要求重新下载 | `voice-runtime.ts`、状态路由 |
| P0-5 | 单测：manifest 尺寸、revision URL、已有文件识别、错误分类 | `manifest.test.ts` |

> P0-1 已在工作区完成，纳入本版提交。

### P1 下载稳定性（本版主体）

| 编号 | 内容 | 验收 |
|---|---|---|
| P1-1 | 单文件重试 3–5 次，指数退避 + 抖动；429 读 `Retry-After`；区分可重试/不可重试 | 本地 HTTP 桩：500/429 后成功 |
| P1-2 | 单请求超时：连接超时 + 空闲读取超时；避免永久挂起 | 挂起连接在阈值内失败并重试 |
| P1-3 | `.part` 文件 Range 续传：`Range: bytes=<已有>-`；206 追加，200 重下，416 重新校验 | 中断 50% 后续传，最终文件哈希一致 |
| P1-4 | 流式写盘：`createWriteStream` / `FileHandle.write`，移除 `concatChunks` 整文件缓冲 | 下载 325MB 时峰值内存不随文件线性增长 |
| P1-5 | 校验 `Content-Length` 与 `Content-Type`；拒绝 HTML/JSON 错误页 | 200 HTML 桩被拒绝，不落盘为正式文件 |
| P1-6 | 大文件 SHA256：从 HF LFS `oid` 生成；下载时边写边算，完成后比对 | 篡改 1 字节但大小不变时被识别 |
| P1-7 | 修镜像配置：直接使用配置的 base URL；默认 `hf-mirror`，支持官方/自定义 | 自定义镜像不再回落到官方 |
| P1-8 | 帮助文案更新：Kokoro 约 394MB / 377 文件 | 设置页与帮助文案一致 |
| P1-9 | `voice:manifest:sync` / `voice:manifest:check` 脚本：按 pinned revision 从 HF tree API 生成 path / size / LFS SHA256；升级模型时运行 | 生成结果与本地 manifest 一致 |

### P2 后续（不阻塞 v4.6.1）

- 下载诊断面板：当前文件序号、已重试次数、镜像、最后 HTTP 状态。
- CI 校验 + 签名远程 manifest：定期比对上游 revision，支持不跟发版的清单更新。
- Full / Offline 安装包或独立 Kokoro 语音包。
- 下载任务持久化：应用重启后继续未完成任务。
- `espeak-ng-data` 许可与再分发方案评估。

### 3.1 动态校验策略

**结论：可以做动态，但动态的对象必须是「固定 revision 的元数据」，不能是 `main`。**

- **保留本地 manifest**：它是 pinned revision 的快照，用于离线校验和下载进度总量；不每次下载都请求 377 个文件。
- **下载时动态校验**：用响应 `Content-Length` 校验截断，用大文件 SHA256 校验完整性；本地 `size` 只做快速预检。
- **可选远端比对**：下载前拉取 pinned revision 的 tree 元数据，和本地 manifest 比对；漂移只告警，不自动跟随。
- **升级模型**：由 `voice:manifest:sync` 重新生成快照并 bump revision；`voice:manifest:check` 用于 CI 比对上游。
- **不采纳完全动态跟随 `main`**：那会重新引入「三方一更新就漂移」和 TOCTOU 问题，还增加启动时的网络依赖。

> 这次的问题不是「有 manifest」，而是 manifest 固定了 `main` 的瞬时大小。固定 revision 后，三方更新 `main` 不再影响已发布版本；只有我们主动升级 revision 时才需要更新清单。

## 4. 里程碑

| 阶段 | 交付 | 出口条件 |
|---|---|---|
| M1 修误报 | P0-1 ~ P0-5 | 本机已有文件直接就绪；manifest 单测通过 |
| M2 下载稳定 | P1-1 ~ P1-7 | 重试/Range/流式/哈希的本地桩测试通过 |
| M3 收尾 | P1-8、发布说明、真机验证 | Windows 冷启动 + 中断续传 + 最终哈希通过 |

## 5. 验收

### 自动化

- `pnpm vitest run src/models`：manifest + downloader 全绿。
- 新增本地 HTTP 桩测试：
  - 500 → 200：重试成功；
  - 429 + `Retry-After`：等待后成功；
  - 连接挂起：超时后重试；
  - `Range` 206：从 `.part` 续传，最终哈希一致；
  - 200 HTML：拒绝并清理；
  - 哈希不符：报 `hashMismatch`，不标记 ready。
- 现有 manifest 测试仍断言 377 文件、`model.onnx` / `lexicon-zh.txt` / `voices.bin` 精确大小。
- pinned revision 的远端 metadata 与本地 manifest 不一致时，报 `manifestDrift` 并提示升级清单，不误报 `missing`。

### 手动

- Windows 开发态 + 打包态各跑一次 Kokoro 下载。
- 在 50% 处断网/杀进程，恢复后确认续传而不是从 0 开始。
- 下载完成后 `getModelStatus` 显示 ready；不再出现「下载后校验缺失」。
- 切换 hf-mirror / 官方 / 自定义镜像，确认 URL 与错误提示正确。

## 6. 风险与回滚

| 风险 | 处理 |
|---|---|
| 固定 revision 后上游更新需手动 bump | `voice:manifest:sync` + `voice:manifest:check`；发布说明写清 |
| hf-mirror 302 到 Xet 后 Range 行为不一致 | 先探测 206；不支持则回退整文件重下，不阻塞 |
| 为 377 个文件都加 SHA256 成本高 | 只对 LFS 大文件加哈希；小文件保留 size + Content-Type |
| 老用户已有文件与 pinned revision 不一致 | 只重下哈希不符的文件；当前两份文件已匹配，不会重下 325MB |
| 流式写盘引入部分文件残留 | 保留 `.part` + 原子 rename；失败/取消清理策略不变 |
| 许可问题被误认为本版解决 | 发布说明明确：本版只修下载，不改 `espeak-ng-data` 分发 |

**回滚**：本版无 DB 迁移；回滚 `manifest.ts` / `downloader.ts` / `voice-runtime.ts` 即可。manifest-only 修复可单独保留。

## 7. 发布说明草案

- 修复 Kokoro 在文件已下载正确时仍提示「下载后校验缺失」的问题。
- 模型下载固定 revision，避免上游 `main` 变更导致的校验误报。
- 大文件支持断点续传、单文件重试与流式写盘，弱网下更稳定。
- 已下载文件无需重新下载；如界面仍显示错误，点一次重试即可。
- 本版无数据库迁移，不影响 MeloTTS / ASR 现有模型。

## 8. 开放问题

1. SHA256 覆盖范围：只覆盖 LFS 大文件，还是全量 377 文件？建议先只覆盖大文件。
2. 是否在 v4.6.1 提供「修复/重新校验」按钮？建议先做状态刷新，按钮放 P2。
3. 是否支持自定义镜像 URL？P1-7 先修逻辑，UI 是否暴露另定。
4. Full / Offline 安装包是否单独立项？本版不做。
5. `espeak-ng-data` 的 GPL 义务由谁负责评估？建议单独开合规任务。
6. ASR / MeloTTS 仍使用 `main`；下一版可复用 `revision` + SHA256 机制固定。

## 9. 实施进度（2026-11-18）

| 项 | 状态 |
|---|---|
| P0-1 manifest 尺寸 + `lexicon-zh.txt` 断言 | 完成 |
| P0-2 Kokoro revision 固定到 `423bfb9c...` | 完成 |
| P0-3 缺失 / 大小 / 哈希错误分类 | 完成 |
| P0-4 状态刷新以磁盘为准，清旧 error | 完成 |
| P1-1 重试 + 退避 + `Retry-After` | 完成 |
| P1-2 请求 / 空闲超时 | 完成 |
| P1-3 `.part` Range 续传 | 完成 |
| P1-4 流式写盘，移除整文件缓冲 | 完成 |
| P1-5 Content-Length / Content-Type 校验 | 完成 |
| P1-6 四个 LFS 大文件 SHA256 | 完成 |
| P1-7 镜像 base URL 直传 | 完成 |
| P1-8 帮助文案 394MB / 377 文件 | 完成 |
| P1-9 `voice:manifest:sync` / `check` | 完成 |
| Windows 真机下载 / 断网续传 | 待验证 |
| 提交 / 推送 | 待办 |

验证结果：

- `packages/voice`：`manifest` 15 项 + `downloader` 4 项 + `downloader-http` 7 项通过
- `packages/core`：`synthesis-cache` 4 项 + `voice-runtime` 14 项通过
- voice / core / shared / web 类型检查通过
- `check:lines`、`check:structure`、`check:cycles`、`check:ascii`、`check:assets`、`check:surfaces` 通过
- `voice:manifest:check`：377 files @ `423bfb9c...` 通过
