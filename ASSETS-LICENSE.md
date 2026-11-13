# 素材许可 / Asset License

## 代码

WorkBuddyForMe 源代码采用 **PolyForm Noncommercial License 1.0.0**（见根 `LICENSE`），仅限非商业用途，不提供任何担保。

## 内置角色 VRM（鲸鱼娘-雪团 / 运动健将-冉卡露丽 / 兔耳娘-菲比）

- 文件：
  - `apps/web/public/vrm/models/xuetuan.vrm`（鲸鱼娘-雪团）
  - `apps/web/public/vrm/models/rankaluli.vrm`（运动健将-冉卡露丽）
  - `apps/web/public/vrm/models/feibi.vrm`（兔耳娘-菲比）
- 作者：WorkBuddyForMe / flashJJ
- 随项目分发许可：三个内置模型统一采用 **CC BY-NC-SA 4.0**（<https://creativecommons.org/licenses/by-nc-sa/4.0/>）
- 允许：署名、非商业使用、复制、修改与再分发；衍生作品需注明修改并以相同许可分享。
- 禁止：任何商业用途。
- 三个模型均不适用 PolyForm Noncommercial License；随包分发的 VRM 文件内嵌 meta 已写入上述作者、许可与「禁止商用」标记。
- 雪团的原始高模 `白娘子_鲸尾.vrm` 仅作为制作源文件保留，不随项目分发。

## 第三方素材

Live2D 官方样本模型（Haru / Hiyori / Mark / Mao / Wanko）遵循各自 Sample Content License，声明见 `apps/web/src/features/avatar/ui/avatar-models.ts` 与设置页「关于」。

### CMU 动捕片段

- 文件：`apps/web/public/motions/cmu/*.vrma`（idle / stand / stretch / walk 四条，各 3 秒）
- 来源：CMU Graphics Lab Motion Capture Database（<http://mocap.cs.cmu.edu/>），数据库声明 **free for all uses**
- 致谢：*This data was created with the support of NSF EIA-0196217.*
- 加工：经 `scripts/motion/bvh-to-vrma.mjs` 转换（30fps 取段、静息对齐、锁朝向、脚底贴地），仅保留骨骼旋转，不含原始 BVH
- 说明：仅作为动作素材归档，不自动进入运行时动作池；详见 `apps/web/public/motions/cmu/README.md`

### 道具 GLB（S2）

- 文件：`apps/web/public/props/teacup.glb`、`bowl.glb`、`book.glb`、`table.glb`
- 来源：项目自建，由 `scripts/avatar/generate-props.mjs` 用 three.js 几何程序化生成
- 许可：**CC0-1.0**（公共领域贡献，无需署名）；不适用项目的 PolyForm Noncommercial License
- 规格：低模纯色、Y 轴向上、单位米；茶杯原点在杯心、碗原点在碗底中心、书原点在书心、桌子原点在底部中心；单文件 4.1–15.6 KB
- 替换：外部 CC0 GLB 可直接覆盖同名文件；若改 id/路径/原点/尺度，同步更新 `apps/web/src/features/avatar/vrm/props/prop-manifest.ts` 与本清单
