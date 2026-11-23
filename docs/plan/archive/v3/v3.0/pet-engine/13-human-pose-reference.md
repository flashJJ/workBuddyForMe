# 人体姿势与动作参考库（Pose & Motion Reference）

> 状态：**v1，随内容扩充维护**。
> 用途：编写 L1 姿势、L2 动作、L3 行为与剧本 beat 时，用同一份人体常识做约束与评审，避免「手指笔直、关节锁死、左右完全对称」这类违和感。
> 关联：[11-motion-library-v2.md](./11-motion-library-v2.md)、[10-motion-library.md](./10-motion-library.md)。

## 1. 怎么用

1. **写新姿势前**：先查第 3、4 节的关节范围与手型，再落 `pose.*`。
2. **写动作关键帧时**：用第 5 节的节奏与相位约束，避免所有骨骼同帧启动。
3. **评审时**：用第 6 节 checklist 逐条过；不满足的姿势不进 `POSES`。
4. **实现与文档不一致时**：以代码常量为准，并回来更新本文件。

本文件是「约束与参考」，不是逐骨骼的数值规范；具体角度以当前模型实测与视觉验收为准。

## 2. 坐标系与骨架约定（雪团 / AnimeArt 家族）

- 运行时使用 three-vrm 的 **normalized humanoid rig**：各骨骼 rest 旋转为单位四元数，位置取自模型世界坐标。
- rest 为 **T-pose**：手臂沿 ±X 展开、掌心朝下；雪团实测左手在 -X、右手在 +X，食指到小指沿 +Z 排开，掌心法线约 -Y。
- 因此手指屈曲轴是**局部 Z**：左手 `+Z`、右手 `-Z`；手臂下垂后手指继承手臂旋转，屈曲方向仍指向掌心。
- 垂臂、悬空等世界方向求解由 `animate/adapters/vrm-executors.ts` 负责；欧拉姿势值只作为通用消费者与预览兜底。

## 3. 全身关节自然范围

| 部位 | 动作 | 舒适范围 | 备注 |
|---|---|---|---|
| 肩 | 前屈 / 后伸 | 0–60° / 0–20° | 待机前屈 0–5°，不要耸肩 |
| 肩 | 外展 | 0–45° | 待机手臂贴近躯干，留 2–3cm 间隙 |
| 上臂 | 内旋 / 外旋 | ±30° | 与垂臂组合时优先用世界方向求解 |
| 肘 | 屈曲 | 5–145° | **待机保持 5–15°**，完全伸直会像军姿 |
| 前臂 | 旋前 / 旋后 | ±80° | 手心相对大腿时约中立位 |
| 腕 | 掌屈 / 背屈 | 0–80° / 0–70° | 待机掌屈 5–10°，不要折成 90° |
| 颈 | 屈伸 / 侧屈 / 旋转 | ±40° / ±40° / ±70° | 与头部叠加层共享，避免超过 70° 扭转 |
| 髋 | 屈曲 / 外展 | 0–120° / 0–45° | 站立待机保持 0°，膝盖不锁死 |
| 膝 | 屈曲 | 0–130° | 待机 0–5°，落地缓冲 20–35° |
| 踝 | 背屈 / 跖屈 | 20° / 50° | 落地时先跖屈再回正，避免脚底穿地 |

Q 版角色可以适度夸张，但「关节锁死」「左右镜像同相位」仍会显假。

## 4. 手部：自然垂手与握拳

### 4.1 核心结论

自然站立时手指**不会笔直**：掌指关节（MCP）约 10–20°、近端指间（PIP）约 20–30°、远端指间（DIP）约 10–20°，小指通常比食指略弯，拇指约为食指的一半。表现为「半握、指尖朝掌心」的放松手型。

### 4.2 当前实现（手部组件）

| 层 | 资产 | 说明 |
|---|---|---|
| L1 | `pose.hand-{left\|right}-{relaxed\|fist\|open}` | 6 个手型；含腕部微屈、四指屈曲与摊开 |
| L2 | `motion.hand-fidget-left/right` | 6.4s 循环：放松 → 握拳 → 摊开 → 放松 |
| L2 | `motions/head-gestures.ts`、`gestures.ts`、`eating.ts` | 双次点头/摇头/环顾、挥手/害羞/伸懒腰/跺脚、进食循环 |
| 调用 | `VrmPoseLayer.relaxArms` | 待机时左右手错开 3.2s 播放，避免双手同步 |

- 屈曲角度：拇指 8/13/8°，食指 14/24/14°，中指 15/26/15°，无名指 17/29/16°，小指 18/30/17°。
- 握拳：MCP 66–74°、PIP 89–99°、DIP 52–60°；腕部掌屈约 8°。
- 摊开：手指轻微伸展（-1~-5°），食指/无名指/小指带 4–8° 张开。
- 实现：`curlHands()` 直接写 `baseQuat × Rz(±angle × weight)`，不逐帧累加；`weight=0` 时不写。
- 调用时机：无程序化手势、无交互循环、未被拎起时；行为若自带手部轨道，应在此前判断并跳过，避免叠加。
- 握拳（未来交互/生气）建议 MCP 70–90°、PIP 90–100°、DIP 60–70°，并让拇指扣在食指外侧。

### 4.3 禁忌

- 五指全 0°（站军姿、塑料人）。
- 五指同角度、同相位（像机械爪）。
- 远端反向伸直（PIP 弯、DIP 反折）。
- 手指穿进大腿或裙摆：垂臂目标方向已向内收，新增姿势需检查包围盒。

## 5. 行为姿势约束

| 行为 | 关键约束 | 备注 |
|---|---|---|
| `behavior.idle` | 肘 5–15°、腕微屈、手指半握、呼吸幅度 ≤ 2.6cm | 手臂贴身但不穿模 |
| `behavior.sleep` | 头低 0.12rad、呼吸减半、手指半握 | 闭眼由脸层负责 |
| `behavior.face-away` | 头/视线转向 away，颈部扭转 ≤ 70° | look 轨道优先于背对静默 |
| `behavior.lifted` | 四肢悬空、root 上提 | 落地前先收腿；手指微屈待在 limp 执行器接入后统一 |
| `behavior.land` | 膝 20–35° 缓冲、脚不滑步 | 与 lifted 同优先级排队 |
| `behavior.touch-*`（后续） | 肩不耸过耳、头偏转 ≤ 25° | 手指可短暂张开再收回 |
| 进食/欢呼（后续） | 腕偏 ≤ 30°、肘不锁死 | 手部动作先慢后快 |
| `behavior.head-pat` | 头偏转 ≤ 25°、颈侧弯 ≤ 20°；手不遮脸 | 复用 `pose.react-nuzzle` |
| `behavior.eat-rice` | 手到嘴前但不穿脸；无道具靠手位读意 | 双手端在胸前中线附近 |
| `behavior.work-focus` | 脊柱前倾 ≤ 25°、视线 down；肘不锁死 | 与 `pose.lean-desk` 配合 |
| `behavior.scold-fat` | 提膝 ≤ 35°、跺脚不抬过腰；叉腰不耸肩 | 腿与上身分轨，避免叠加 |
| `behavior.wake` | 双臂 V 形过顶、脊柱后展 ≤ 25° | 与 `pose.stretch-cycle` 共用 |

> 手臂单轴限位：为支持挥手/伸懒腰/端碗，`constraints` 中肩放宽到 ±105°、肘 ±110°（含肩内旋后的“向上折”）；超出仍拦截，新增姿势必须走 `validatePoses`。

## 6. 动作节奏与相位

- 微反馈 0.3–0.6s，手势 0.6–1.2s，完整行为 1.2–2s；除机械/故障演出外不用线性缓动。
- 左右对称动作错开 0.2–0.4s 相位，避免镜像同帧。
- 手指跟随比手臂晚 1–2 帧（后续可用动作层实现）。
- 循环动作首尾姿态必须一致；首尾速度尽量接近，避免接缝抖动。

## 7. 评审 checklist

1. 手指是否有微屈（非 0°）？
2. 肘/膝是否避免完全锁死？
3. 左右是否错相位，而不是完全镜像？
4. 手腕是否超过 30° 侧偏或 80° 屈伸？
5. 颈部扭转是否 ≤ 70°？
6. 手臂/手指是否穿模（大腿、裙摆、尾巴）？
7. 呼吸/摆动是否以基准位为底叠加，而非覆盖 fit 结果？
8. 行为退出时是否回到基准（无残留 morph/look/root）？
9. 体态是否符合人设（慵懒、微胖、不军姿）？
10. 新增常量是否回写本文件与测试？

## 8. 代码落点

| 内容 | 位置 |
|---|---|
| 归一化骨骼名单（17 身体 + 30 手指） | `apps/web/src/features/avatar/animation/mask.ts` |
| 关节限位与姿势校验 | `apps/web/src/features/avatar/animation/constraints/index.ts` |
| 两骨解析 IK | `apps/web/src/features/avatar/animation/ik/`、`adapters/vrm-ik.ts` |
| 离线 BVH → VRMA | `scripts/motion/bvh-to-vrma.mjs` |
| L1 手型（放松/握拳/摊开） | `apps/web/src/features/avatar/animation/poses/hands.ts` |
| L2 手部动作集 | `apps/web/src/features/avatar/animation/motions/hand-fidget.ts` |
| 垂臂/悬空/手指微屈执行器 | `apps/web/src/features/avatar/animation/adapters/vrm-executors.ts` |
| 欧拉兜底姿势 | `apps/web/src/features/avatar/animation/poses/arms.ts` |
| 视线优先级 | `apps/web/src/features/avatar/pose/gaze-resolver.ts` |
| 语义表情通道 | `apps/web/src/features/avatar/animation/bindings/animeart-v1.json` |
| 行为内容 | `apps/web/src/features/avatar/animation/behaviors/*` |

## 9. 参考

- VRM 1.0 Humanoid：<https://vrm.dev/en/vrm1/humanoid/>
- VRM 规范仓库：<https://github.com/vrm-c/vrm-specification>
- 手部解剖与放松手型（MCP/PIP/DIP）：<https://en.wikipedia.org/wiki/Hand>
- 动画十二原则中的跟随与重叠（follow-through / overlapping action）

## 10. 外部动作技术取舍（SMPL-X / AMASS / Kimodo 等）

原则：

1. 运行时唯一标准骨架是 **VRM humanoid normalized rig**，不引入 SMPL-X / SOMA / Mixamo 双骨架。
2. LLM 只负责意图、目标点与编排，**不直接输出全部关节角**；姿势/动作必须是可评审的数据资产。
3. 外部数据集与生成模型只用于**离线产出候选**，人工筛选后烘成 pose / motion / VRMA，不随客户端分发。
4. 客户端不做 Python / MuJoCo / JAX / 大模型推理依赖。
5. Mixamo 只作为离线动作/BVH 来源，重定向进 VRM；运行时骨架仍以 VRM humanoid 为准。

| 方案 | 定位 | 我们的取舍 |
|---|---|---|
| SMPL-X / SMPLify-X | 参数化人体 + 单图/视频拟合 | 离线参考；不运行时。许可、注册与 55 关节→VRM 映射成本高 |
| SOMA | NVIDIA 统一人体/机器人骨架 | 不采用（与 VRM 骨架不兼容） |
| MediaPipe Pose | 轻量 2D/3D 关键点 | 可选离线取样工具，不做运行时 |
| mink / OpenSim / RT-COSMIK | QP/生物力学/实时 IK | 离线姿态校验或未来端点 IK 的选型参考；Python 栈不进客户端 |
| AMASS / Motion-X / BONES / CMU-MoCap | 动捕数据集 | 离线动作先验；不随包分发（许可 + 体积） |
| Kimodo / MotionGPT / MotionDiffusion | 文本→动作 | 离线生成候选，人工筛选后烘成关键帧；不做运行时调用 |
| GMR | 跨骨架运动重定向 | 离线把外部 BVH/动捕转到 VRM；MIT 协议适合工具链 |
| BVH | 动捕交换/预览格式 | 未来做离线导入，运行时仍用 VRMA/关键帧 |
| 两骨解析 IK | 肩→肘→腕 / 髋→膝→踝 | **已落地 `animation/ik`**：零迭代、可钳位、带极点；四肢端点交互首选 |
| FABRIK / CCD | 多骨链/辅链 | 按需再引入；不要用于主手主脚 |

落地顺序：**约束校验（已落地）→ 两骨 IK（已落地）→ 离线 BVH/VRMA 管线（已落地转换器）→ 多骨 FABRIK/CCD → 离线参考/文本动作生成**。

## 11. 离线 BVH → VRMA 管线

```bash
node scripts/motion/bvh-to-vrma.mjs <input.bvh> <output.vrma> \
  [--unit-scale 0.01] [--fps 30] [--range 开始秒:结束秒] [--root-motion] [--lock-yaw] [--no-rest-align] [--ground] [--bone-map map.json]
```

处理链路：

1. 解析 BVH `HIERARCHY` / `MOTION`，支持 Mixamo、CMU 常见命名。
2. 按别名表映射到 VRM humanoid；用 BVH rest offset 计算节点平移，按 VRM 父子关系重建节点。
3. 逐帧把 BVH 局部旋转写成 VRMA rotation 轨道，输出 `VRMC_vrm_animation` 1.0 的 GLB。
4. 默认原地：丢弃 hips 位移；需要根位移时加 `--root-motion`。
5. `--range` 按秒截取片段、`--fps` 降采样（CMU 源为 120fps，就近取帧无插值损失），时间轴从 0 开始。
6. `--lock-yaw` 去掉 Hips 的世界 Y 朝向（`q' = Ry(-yaw) * q`），保留俯仰/侧倾与肢体动作：CMU 片段常带演员转身，不加会让桌宠在待机里一直「打转」。
7. **静息对齐（默认开启）**：源骨架多为 A-pose（CMU 大腿静息外张约 20°），直接套旋转会把「A→竖直」的补偿算进去，导致双腿内旋交叉。转换器按「VRM T-pose 骨骼方向 → 源静息方向」求最短弧四元数右乘到每帧旋转上；确需原样套用时加 `--no-rest-align`。
8. `--ground`：逐帧前向运动学取脚掌/脚趾最低点，把 hips 平移压到地面；同时把 hips 节点静息高度写成整段平均髋高（three-vrm 用 `humanoidY / restHipsPosition.y` 做比例，静息为 0 会除零 → NaN）。
9. 输出文件直接进入现有 VRMA 动作池（导入或放静态目录），运行时不需要新依赖。

限制与约定：

- 源 BVH 默认按 T-pose 处理；A-pose 源（CMU）依赖静息对齐，仍建议先用一条片段验腿部和脚的方向。
- 单位默认按厘米处理（`0.01`）；源为英寸/米时用 `--unit-scale` 调整。
- 未映射关节的旋转会丢失；同名重复骨骼取第一个。
- 不做重心、脚接触、IK 修正；复杂动作仍需人工筛选或 Blender 修。
- 验证：测试会用与运行时相同的 `GLTFLoader + VRMAnimationLoaderPlugin` 解析生成文件。

数据来源（不依赖 Mixamo 官网）：

| 来源 | 用法 | 备注 |
|---|---|---|
| Blender + Mixamo Rig 扩展 | 本地生成 Y-Bot 骨架，K 关键帧后导出 BVH | 最推荐；骨骼命名与 Mixamo 一致，无需联网 |
| GitHub Y-Bot BVH 包 | 直接转 VRMA | 只选 readme 写明原始 Mixamo 命名的包；仅内部使用 |
| CMU MoCap（已实跑） | 直接转 VRMA | 商用可用；120fps；无手指；T-pose 手臂下压 5° |
| LaFAN1 / Bandai Namco / SFU / NUS | 直接转 VRMA | CC BY-NC-ND 或仅限研究，**不可随产品分发** |
| ActorCore / Rokoko / DeepMotion / 千面 | FBX/BVH → Blender 重定向到 Y-Bot → 导出 BVH | 适合补伸手、抓取、弯腰等稀缺基元 |
| 任意自定义骨架 | `--bone-map map.json` | 源骨骼名 → VRM humanoid 名；未映射列表会打印出来 |

### 11.1 CMU MoCap（当前唯一可商用的开源 BVH 来源）

- 原始库：<http://mocap.cs.cmu.edu/>；授权原文：「free for use in research and commercial projects worldwide」，转换者 Bruce Hahne 亦未加限制。
- GitHub BVH 转换版：`una-dinosauria/cmu-mocap`，`data/<编号>/<片段>.bvh`。
- 国内直连 `raw.githubusercontent.com` 会被重置，用 jsDelivr 镜像：
  `https://cdn.jsdelivr.net/gh/una-dinosauria/cmu-mocap@master/data/013/13_27.bvh`
- 骨架事实：MotionBuilder 命名（`Hips/LeftUpLeg/LeftLeg/LeftFoot/LeftToeBase/LeftArm/LeftForeArm`）；无锁骨、无手指数据；`LHipJoint`、`LeftFingerBase`、`LThumb` 等 6 个关节转换时会报未映射，属正常。
- 实跑结果：23 骨骼 / 源 120fps；`--fps 30 --range 3:6` 输出 3s、约 41KB 的 VRMA。
- 适合宠物的片段（索引 `cmu-mocap-index-text.txt`）：
  - `13_26 / 13_27 / 13_28`、`14_24–14_26`：direct traffic, wave, point（挥手 / 指）
  - `42_01`：stretch（转头发、肩、手臂、腿）
  - `40_10 / 40_11`：wait for bus（站立待机）
  - `13_04–13_06`、`14_30`：坐姿、托腮、翘腿（坐窗沿 / 桌面待机）
  - `56_04–56_08`：yawn、stretch、grab、throw punches（打哈欠 / 伸懒腰 / 抓取）

`--bone-map` 示例：

```json
{
  "mixamorig:Hips": "hips",
  "mixamorig:LeftArm": "leftUpperArm",
  "J_CustomHead": "head"
}
```

键会做归一化（去 `mixamorig:`、标点、大小写），值必须是 VRM humanoid 名。
