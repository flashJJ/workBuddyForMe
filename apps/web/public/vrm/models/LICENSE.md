# 内置角色 VRM / Built-in Character VRM

本目录包含三个随 WorkBuddyForMe 分发的内置角色模型：

| 文件 / File | 角色 / Character | 作者 / Author |
| --- | --- | --- |
| `xuetuan.vrm` | 鲸鱼娘-雪团 / Whale Girl - Xuetuan | WorkBuddyForMe / flashJJ |
| `rankaluli.vrm` | 运动健将-冉卡露丽 / Athlete - Rankaluli | WorkBuddyForMe / flashJJ |
| `feibi.vrm` | 兔耳娘-菲比 / Bunny Girl - Feibi | WorkBuddyForMe / flashJJ |

- 许可 / License：**CC BY-NC-SA 4.0**
- 许可全文 / License text：<https://creativecommons.org/licenses/by-nc-sa/4.0/>
- 禁止商用 / Commercial use prohibited.
- 三个模型均不适用 WorkBuddyForMe 代码许可（PolyForm Noncommercial 1.0.0），详见仓库根 `ASSETS-LICENSE.md`。
- None of these models is covered by the project's code license; see `ASSETS-LICENSE.md` in the repository root.
- 修改说明 / Modification：v3.0 起经 `apps/web/scripts/optimize-vrm.mjs` 处理：(1) morph target 的 POSITION 改为 sparse accessor；(2) 贴图重编码为 WebP（无 alpha 使用的 albedo 有损 q90，五官 cutout 无损），base64 data URI 图片转为 bufferView。表情数量/名称/索引、VRM 绑定、材质与贴图引用关系均未改变；原始未压缩模型保存在本地 `apps/web/assets-src/vrm/`（不入库）。
- 生成链路 / Provenance：雪团参考「蓝色大肥鱼」主题，由 AI Agent 生成独立形象参考图，经 Neural4D 付费会员图生 3D，再由项目二次制作与压缩；冉卡露丽 / 菲比经项目二次制作与优化。溟月图集不作为生成输入。
