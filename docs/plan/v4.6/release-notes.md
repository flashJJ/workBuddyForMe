# WorkBuddyForMe v4.6.0 发布说明

> 版本：4.6.0（2026-11-18）
> 主题：声线有归属——导入 VRM 声线绑定与 TTS 加载提效
> 范围：M0 方案 → M1 统一解析 → M2 导入绑定 → M3 加载提效 → M4 验收与发布
> 数据库：一次纯加法迁移 `v052`，`LATEST_SCHEMA_VERSION = 52`；备份 schema 9 不变。
> 状态：安装包已构建归档；打包态启动与 v052 迁移烟测通过；真机听感矩阵待人工验收。

## 1. 本版交付

| 里程碑 | 交付内容 |
|---|---|
| M0 | 现状取证、方案/Spec/Tasks、分支 `feat/v4.6-voice-binding` |
| M1 | `resolveAvatarVoice` 统一解析；设置页形象区修复；舞台 `voicePreference` 生效 |
| M2 | 迁移 `v052`、`voiceSid` 契约、`setVoiceSid`、PATCH API、导入 VRM 声线选择/试听、备份携带 |
| M3 | 逐句 `speed`、语速不再重建模型、预热失效/重试、短句 LRU 缓存 |
| M4 | 全量测试、打包态烟测、安装包归档、发布文档与博客 |

## 2. 用户可见变化

- 内置雪团、冉卡露丽、菲比在设置页「角色试听」与对话实际使用同一声线，不再显示成 Haru。
- 已导入 VRM 可以单独选择 Kokoro 声线，支持「跟随默认」与 103 个音色分组；选择后可试听，重启仍生效。
- 导入 VRM 声线绑定会随备份导出/恢复；旧备份缺少该字段时按「跟随默认」处理。
- 舞台/小剧场 cast 的显式 `speakerSid` 现在真正生效，不再只是配置字段。
- 修改朗读语速后立即生效，不再触发整个 TTS 模型重建；第二句开始按新语速合成。
- 模型下载完成或切换模型后会后台重新预热；首次朗读不再总是背一次冷加载。
- 试听、问候、剧场重复短句命中合成缓存，重复播放更快。

## 3. 内部改动

- 契约：`resolveAvatarVoice(avatarModelId, override?)` 统一解析顺序：用户绑定 > 内置 VRM > Live2D > 默认 Haru；`getAvatarSpeakerId` 改为薄封装。
- 迁移：`vrm_avatars.voice_sid INTEGER NULL`；旧库/旧备份为 NULL，合成行为与升级前一致；表缺失的测试夹具安全跳过。
- API：`PATCH /api/vrm-avatars/:id`，body `{ voiceSid: 0–102 | null }`；越界 422、记录不存在 404。
- 服务：`VrmAvatarService.setVoiceSid`；导入时支持初始声线；服务端合成读取绑定值，未绑定回落默认。
- 合成：`TtsSynthOptions.speed` 逐句传递；`ttsConfigKey` 移除 `ttsSpeed`；`ttsSpeed` 设置不再使引擎失效。
- 预热：`prewarmTts(force)` 失败不永久缓存；`invalidateTts` 清空预热与缓存；模型/线程/目录变化后后台预热；TTS 下载完成自动预热。
- 缓存：`SynthesisCache` key = 模型|sid|速度|文本；64 条 / 80 字 / 200 万 PCM 样本上限；命中返回副本，引擎重建清空。
- 备份：`vrmAvatars.json` 携带 `voiceSid`；旧归档缺省 null；`.vrm` 二进制仍不进备份。
- 结构：导入 VRM 绑定查询拆到 `voice-avatar-override.ts`，`voice-runtime.ts` 保持 298 行；声线表拆到 `voice/profiles.ts` 避免 300 行门禁。

## 4. 门禁结果

- 全量测试：9 个包 751 个测试文件 4258 项通过。
  - web 285 文件 1445 项；core 273 文件 1674 项；database 76 文件 285 项；shared 48 文件 420 项；desktop 39 文件 247 项；voice 9 文件 85 项；ai 16 文件 86 项；config 4 文件 14 项；motion 1 文件 2 项。
- `pnpm check`：typecheck、lint、行数、结构、循环依赖、ASCII、资产、表面样式全部通过。
- 定向测试：shared 声线 19 项、core 语音运行时与缓存 18 项、voice 引擎 15 项、database v052/v030 4 项、web 语音域 73 项通过。
- 打包态烟测：`win-unpacked` 以临时 `userData` 启动，数据库 `user_version=52`，`vrm_avatars` 列为 `id,name,file_ref,byte_length,meta_json,created_at,voice_sid`。
- 迁移兼容：v51 库增量迁移只新增可空列，旧记录 `voice_sid` 为 NULL；重复执行迁移函数幂等。

## 5. 已知限制

- 多角色声线仅 Kokoro 生效；MeloTTS 为单说话人，所有形象同声，设置页继续提示。
- 103 音色名称按官方 sid 顺序推导（3–57 zf_001–zf_055、58–102 zm_009–zm_053）；如上游音色表调整，以试听为准。
- 导入 VRM 绑定的是 sid，不绑定模型；切换到 Melo 时忽略，切回 Kokoro 后恢复。
- 短句缓存只存在进程内，不跨重启、不持久化；长文不进缓存。
- 仍为单 TTS worker；chat 与剧场并发时串行合成，流式 PCM/AudioWorklet 与多 worker 留后续版本。
- 本版未做声线克隆、音高/情感参数与自定义训练。
- 真机听感矩阵（内置/导入切换、Melo/Kokoro、语速、重启持久化）待人工验收。

## 6. 安装包与校验

| 项目 | 值 |
|---|---|
| 安装包 | `WorkBuddyForMe-Setup-4.6.0.exe` 273.23 MB（286,499,963 字节） |
| 安装包 SHA256 | `e333ac9e6978202affa6df1c3213e181c8ca6c3176c6b678c0137f374a87f3fb` |
| blockmap SHA256 | `4de4757f2eb5480477bea8893a3c26aa7ee39630711e08e363fd1cc2656ac40b` |
| latest.yml SHA256 | `9a02741179fc22dd261620a79d8e3c3752f29df3bd9a6713bbba891e9743ec72` |
| 归档目录 | `E:\builds\archive\v4.6.0` |
| build-info | commit `ed4f8397`、branch `feat/v4.6-voice-binding`、构建时间 `2026-11-17T18:59:49Z` |
| 体积对比 | 较 4.5.1 增加 6,808 字节（约 0.0067MB），仍远低于 300MB 预算 |
| 校验复核 | `node scripts/release-manifest.mjs --check --dir E:\builds\archive\v4.6.0` |

## 7. 更新公告

本版让每个形象真正有自己的声音：内置 VRM 的设置试听与对话声线一致；导入 VRM 可以绑定 Kokoro 声线并随备份保存；舞台 cast 的声线偏好开始生效。同时修掉三处加载浪费——改语速不再重建整个 TTS 模型、模型下载/切换后会重新预热、试听与剧场重复短句命中进程内缓存。数据库只做一次纯加法迁移（`vrm_avatars.voice_sid`），旧库与旧备份升级后行为不变。安装包 273.23MB，仍在预算内。

## 8. 发布物料清单

| 物料 | 状态 | 要点 |
|---|---|---|
| 发布说明（本文） | 完成 | 安装包数据已回填 |
| 版本总结 | 完成 | [version-summary.md](./version-summary.md) |
| 技术博客 | 完成 | `blog/v4.6/` 7 篇 |
| 安装包 | 完成 | 归档于 `E:\builds\archive\v4.6.0` |
| 校验和复核 | 完成 | manifest 3 个产物 |
| 打包态烟测 | 完成 | 启动成功、v052 列就位 |
| 真机听感矩阵 | 待执行 | 内置/导入切换、绑定持久化、Melo/Kokoro、语速、重启 |
| 截图 | 待补 | 导入 VRM 声线选择器、设置页声线、Melo 提示 |
