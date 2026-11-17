# v4.6 Tasks

> 勾选即代表有代码/文档/测试证据。

## M0 方案与分支

- [x] 现状取证：内置/导入 VRM 声线路径、设置页不一致、舞台 `voicePreference` 未消费
- [x] 方案 README / Spec / Tasks / progress-log
- [x] 分支 `feat/v4.6-voice-binding`

## M1 一致性

- [x] `resolveAvatarVoice` 纯函数（source: override / builtin-vrm / live2d / default）
- [x] `getAvatarSpeakerId` 改为解析函数薄封装
- [x] 设置页形象区改用真实解析结果（内置 VRM 显示/试听不再回落 Haru）
- [x] 舞台 `voicePreference.speakerSid` 接入 `useStageVoice.speak`
- [x] `useStageSpeech` / `useTheaterAudio` 传入 cast 声线偏好
- [x] shared 单测覆盖解析顺序与边界
- [x] web 定向测试通过

## M2 导入 VRM 绑定

- [ ] 迁移 `v052`：`vrm_avatars.voice_sid`
- [ ] `vrmAvatarSchema.voiceSid` 与 `vrmAvatarVoiceUpdateSchema`
- [ ] `VrmAvatarService.setVoiceSid` + 导入可选 voiceSid
- [ ] `PATCH /api/vrm-avatars/:id`
- [ ] 已导入 VRM 列表增加声线选择与试听
- [ ] 服务端合成读取绑定值（未绑定回落默认）
- [ ] core/web 定向测试

## M3 加载提效

- [ ] `TtsSynthOptions.speed` 与 worker/inline 逐句使用
- [ ] `ttsConfigKey` 移除 `ttsSpeed`；设置更新不再因语速重建
- [ ] `prewarmTts` 失效/重试；模型下载与切换后重新预热
- [ ] 短句 LRU（64 条、≤80 字、引擎重建清空）
- [ ] voice 包定向测试

## M4 验收与发布

- [ ] 全量测试与 `pnpm check`
- [ ] 真机：内置/导入 VRM 切换、绑定持久化、Melo/Kokoro 切换、语速修改
- [ ] 安装包构建归档
- [ ] release-notes、version-summary、blog
