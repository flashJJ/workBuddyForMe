# 动效 binding 草案

## 文件

- `animeart-v1.binding.json`：AnimeArt 家族级语义 → morph 绑定，6 个模型共用。
- `animeart-v1.fingerprint.json`：家族指纹（49 humanoid、118 morph、18 标准表情索引、精简前后体积）。

## 来源

- 基线：`雪团.vrm`（`Body_Model_up`，118 个 targetNames）。
- 家族样本：小白鲸·短发版、海豚娘、鲨鱼娘、水母娘、企鹅娘、海獭娘。
- 校验：6/6 模型 49 humanoid、父级 0 差异、rest 四元数 0° 差、118 morph、18 个 VRM 表情绑定索引一致。

## 使用边界

- 这是规划/校验草案；T2.1 已把同一结构收敛为运行时 zod schema（`animation/binding.ts`），本目录保留评审快照。
- `channels` 首批覆盖眼/眉/嘴/视线与 5 组组合表情；`standardExpressions` 保留 VRM 原生 13 组，`weight` 统一为 0..1（VRM0 原始 0–100 已归一）。
- `gaze.*` 运行时优先用 eye bone，morph 作为回退。
- `blink` / `viseme` 为 `VrmFaceLayer` 保留通道，行为轨道不得写入。
- 100 个非标准 morph 的语义顺序按同一模板推断；首次导入后建议抽查 `Eye_look_left`、`Mouth_shocked_op` 等。

## 重新生成

- 精简：删除全零 morph NORMAL、补 `targetNames`、重建 buffer。
- 绑定：以雪团的 118 个 `targetNames` 为索引表，生成 `standardExpressions` 与 `channels`。
- 新增 AnimeArt 模型时先跑家族校验，偏差超过阈值不并入 `animeart-v1`。
