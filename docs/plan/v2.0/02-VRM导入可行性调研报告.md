# VRM 自定义模型导入可行性调研报告（v2.0 M0 预研）

> 日期：2026-10-15 · 状态：**调研草案（结论 GO，待 M0 真机工装复核）**
> 触发：评审决策点 5——「很多用户有自己的 VRM 虚拟形象，不可导入会使竞争力大打折扣」
> 方法：官方规范/许可证为 P0 源，竞品官方站点为 P1，技术社区为 P2；核心结论均 ≥2 源交叉。
> 本文是技术与产品调研，不构成法律意见；免责声明定稿前需经法务或合规模板复核。

## 1. 结论（先行）

**建议 GO，但形态严格限定为「用户自助导入器」，应用不内置、不分发、不托管任何第三方 VRM 模型。**

- **技术可行**：VRM 是基于 glTF 的开放格式，官方生态库 `@pixiv/three-vrm` 为 MIT 许可，同时支持 VRM 0.x 与 1.0；库本体仅约 148 kB（gzip 34.7 kB），three.js 本体 680 kB（gzip 170 kB），可动态加载、不进首屏包。[cite:1][cite:2][cite:15][cite:16]
- **授权可行**：VRM 格式在规范层就把「谁能演绎这个人格、能否商用、能否再分发」写进文件 meta，导入器可以**读取并强制展示**这些许可字段，把合规判断与责任留在模型所有者一侧；这与 VSeeFace、Warudo 等成熟 VTuber 软件的责任框架一致。[cite:4][cite:8][cite:9]
- **并存有行业先例**：Animaze、3tene 等商业软件在同一应用内同时支持 Live2D 与 VRM；Live2D Cubism SDK 的出版许可约束的是「使用 SDK 发布的应用」，未发现禁止应用支持其他模型格式的排他性条款（条款阅读结论，非法律意见）。[cite:11][cite:12][cite:13]
- **排期建议**：VRM 导入是「形象资产能力」，与 v2.0「关系闭环」主题不相关。建议 **v2.0 M0 只做真机工装 spike（不写产品代码），结论复核 GO 后单立 v2.1「形象开放：VRM 导入」**，紧跟 v2.0 发布，避免大版本主题杂糅与封版拖期。

## 2. VRM 是什么：开放格式 + 内嵌许可

VRM 是 VRM Consortium（pixiv 等发起）定义的、基于 glTF 2.0 的人形 3D 头像格式，定位就是跨应用互操作。[cite:7] 与纯几何格式（FBX/glTF）的关键差异是：**许可元数据是格式的一部分**。

### 2.1 文件内嵌的许可字段（导入器可直接读取）

VRM 0.x 的 meta 与 VRM 1.0 的 metaLicense 均包含两组许可：[cite:4][cite:5][cite:6]

| 分组 | 字段 | 取值 |
|---|---|---|
| 人格演绎许可（Personation） | 谁可以使用此头像演绎 | 仅作者本人 / 仅明确授权者 / 所有人 |
| | 暴力表现 | 允许 / 不允许 |
| | 性表现 | 允许 / 不允许 |
| | 商用 | 允许 / 不允许 |
| | 其他许可 URL | 作者自定义条款链接 |
| 再分发/修改许可（Redistribution） | 许可类型 | 再分发禁止 / CC0 / CC BY 系列（NC/SA/ND 组合）/ 其他 |
| 归属信息 | 模型名、作者、联系方式、版本、缩略图 | 文本与图片 |

VRoid Hub 上的实际模型页即按此渲染条件清单（Avatar Use / Violent / Sexual / Political-Religious / Corporate use / Individual commercial / Redistribution / Alterations / Attribution 逐项 Do not allow 或 Allow），证明这套字段是流通中实际使用的机器可读许可。[cite:21]

### 2.2 对产品的含义

- 应用做的是「本地渲染器」：用户在**自己机器上**加载自己的模型，不触发再分发——这正是 VRM 许可设计的典型场景（VRM 规范专门区分了「模型数据再分发」与「使用模型演绎人格」两类授权）。[cite:4][cite:6]
- 合规动作不是替作者执法（本地单机无法也不应判断用户是否被授权），而是：**导入时展示模型自带许可 → 用户确认已获授权 → 应用不分发文件**。这三点做到，责任框架与成熟竞品一致。

## 3. 技术方案

### 3.1 依赖与体积

| 依赖 | 许可 | 体积（min / gzip） | 说明 |
|---|---|---|---|
| `three` | MIT | 680 kB / 170 kB | WebGL 渲染器；tree-shakeable，可按需裁剪[cite:15] |
| `@pixiv/three-vrm`（当前 v3.5.x） | MIT（包内附 LICENSE） | 148 kB / 34.7 kB | VRM 加载、humanoid 骨骼、弹簧骨、表情管理；0.x/1.0 双兼容[cite:2][cite:16] |
| `@pixiv/three-vrm-animation`（可选 P2） | MIT | 约 797 kB（含 VRMA 播放器） | VRMA 动作回放，非首期必需 |

合计 gzip 约 **205 kB**。Electron 桌面端无包体压力；Web 侧采用**路由级动态 import**（仅在用户选择/预览 VRM 形象时拉取），不进首屏与不使用 3D 的用户的包。

### 3.2 与现有 Live2D 舞台的渲染架构

现状（v1.9）：舞台是 PIXI（WebGL 2D）+ pixi-live2d-display，cast 槽位经纯函数帧映射驱动；主窗唯一 AudioContext，舞台只收电平中继。VRM 接入**不改舞台协议**：

- **双 canvas 分层**：three.js 独立 `<canvas>` 与 PIXI canvas 叠放，按每个 cast 成员的形象类型（`live2d:*` / `vrm:*`）分配到对应渲染层；同屏混排（如 1 个 VRM + 2 个 Live2D 开会）是目标形态，z-index/背景层/对话框层沿用现有舞台分层。
- **StageDirection 不变**：focus/motion/speech 仍是舞台唯一指令语言；新增的只是渲染器后端。
- **口型映射**：VRM 表情管理器提供 `setValue(name, weight)`，预设口型为 5 元音 `aa/ih/ou/ee/oh`，另有 `blink`、`lookAt` 与情绪预设。[cite:17][cite:23] 首期把现有音频电平单通道映射到 `aa` 权重（社区有相同做法：以波形平均音量驱动口型开合）[cite:18][cite:22]，不做音素识别。
- **表情映射**：舞台四表情（neutral/joy/sadness/anger）映射 VRM 预设表情名；模型缺预设时回落 neutral，与 Live2D 缺表情回落同策略。
- **动作边界**：不解析任何 Live2D `.motion3.json`；待机动画来自 VRM humanoid T-pose 归一 + 弹簧骨（头发/衣物摆动，three-vrm 内置）。VRMA 动作库列为 P2。

### 3.3 导入、校验与存储

- 接受格式：仅 `.vrm`（glTF GLB 魔数 `glTF` **且**包含 VRM 扩展标记），拒绝任意 `.glb/.gltf`、伪造后缀与嵌套压缩包；大小上限建议 **60 MB**（对齐 VRoid Hub 实际流通上限样本，VRoid 常见导出 8–25 MB、复杂模型约 60 MB；官方给的基础构成为 5 万面约 3.4 MB + 贴图）。[cite:19][cite:20]
- 存储：复制到 `data/vrm-avatars/vrm-<uuid>.vrm`，沿用 v1.9 背景图的文件名白名单/路径穿越防护；cast 引用存 `vrm:<id>`，元数据（模型名/作者/许可快照 JSON）入小表，**原始文件不入数据库**。
- 备份：延续 v1.9 背景图「**只备份引用不备份二进制**」策略——.wbfm-pack 与备份归档均不含 .vrm；跨机恢复缺失时回落默认形象并在 UI 标注，避免备份包变成模型再分发通道。

### 3.4 性能风险与 M0 工装指标（待实测，非历史经验拍板）

3D 渲染开销高于 2D 立绘，但 VRM 单角色与 Live2D 三实例同台不是同一量级问题。M0 用 `WBFM_SPIKE=1` 门控工装（不进安装包，沿用 v1.9 M0 spike 先例）实测核显机：

| 指标 | 建议阈值（不达标即降级或缩减同屏 VRM 数） |
|---|---|
| 1 VRM 单角色稳态帧率 | ≥30 FPS（v1.9 舞台口径） |
| 1 VRM + 2 Live2D 混排稳态帧率 | ≥25 FPS |
| 8 MB / 60 MB 模型首帧时间 | 分别 ≤0.8 s / ≤2.5 s（本地文件，含解析） |
| 稳态增量内存 | 单 VRM ≤300 MB |
| 省电档行为 | VRM 槽同规则降帧/静态截图，与 Live2D 档统一 |

降级手段预备：渲染像素比钳制（≤设备 DPR 上限）、非聚焦角色降帧、弹簧骨按距离关停、同屏 VRM 数限制为 1（Live2D 其余槽不受影响）。

## 4. 免责声明与责任框架（产品设计）

### 4.1 三层责任划分

| 层 | 归属 | 产品动作 |
|---|---|---|
| 渲染库 | pixiv（MIT） | 保留版权声明（about 页/开源许可清单）；MIT 无 copyleft，可商用可闭源 |
| 模型 | 模型作者（VRM meta 许可） | 导入时强制渲染许可面板，用户勾选确认；作者署名常驻形象详情 |
| 导入行为 | 用户 | 首次导入前免责勾选；应用不提供模型下载/市场/传输 |

竞品参照：VSeeFace 明确软件可商用、不提供担保，用户自行加载 VRM；Warudo 的免费使用前提是「你的 VTuber IP 版权完全归你」，EULA 单列用户内容与知识产权条款。[cite:8][cite:9][cite:10]

### 4.2 导入确认流（建议）

1. 选择 `.vrm` 后先本地解析 meta，展示：缩略图、模型名、作者/联系、**许可清单**（演绎者范围/商用/暴力/性表现/再分发类型/otherLicenseUrl 可点击）；
2. 对「仅作者本人」「不可商用」「禁止再分发」等受限项给**醒目警示**（但不阻止本地导入——单机使用场景由用户自负判断）；
3. 勾选「我拥有该模型或已获得作者授权，自行承担使用责任」后方可入库；
4. 设置→形象详情可随时复查许可与重新确认；舞台名字牌旁可展示作者署名（归属提示，弱化匿名滥用动机）；
5. 截图/分享/导出功能不含模型文件本体。

### 4.3 免责声明草案（措辞需法务复核）

> 你可以导入自己拥有或已获得合法授权的 VRM 模型。WorkBuddy For Me 仅提供本地渲染能力，不提供模型下载，也不主张任何第三方模型的权利。模型的著作权、人格演绎许可与商用许可归模型作者所有，具体许可以模型文件内声明及作者给出的条款为准。请仅在授权范围内使用；因导入模型引发的版权或授权争议，由你自行承担责任。

### 4.4 与 Live2D 红线的不对称（必须显式区分）

- **VRM 开放导入**（glTF 开放格式 + MIT 生态 + 内嵌许可字段）；
- **Live2D 外部模型导入继续永久禁止**（Cubism SDK 专有许可与授权模型分发边界，全版本红线不变）。
- 导入入口 UI 必须分开命名（「导入 VRM 模型」），避免用户误以为 Live2D 模型也可导入；设置文案说明这一差异。
- Live2D SDK 出版许可的费用门槛按企业最近销售收入划分，个人/小规模主体在年销售收入 1000 万日元以内免除出版许可费；本产品为免费发行，现状处于免除区间，但该判断需随营收变化复审。[cite:13][cite:14]

## 5. 风险登记

| 风险 | 等级 | 缓解 |
|---|---|---|
| 用户上传无授权模型并公开使用（直播/截图传播） | 中 | meta 许可强制展示+确认+作者署名；产品本身不提供传播模型文件的通道；EULA 用户内容条款 |
| 模型文件超大/恶意构造导致渲染崩溃 | 中 | 大小上限、扩展魔数双校验、加载沙箱化 try/catch、单模型隔离；M0 工装用损坏/畸形文件压测 |
| 核显机 3D 性能不达标 | 中 | M0 真机数据拍板；预备像素比/降帧/同屏 VRM≤1 三级降级；不达标则只在桌宠/单槽开 VRM |
| Live2D 并存授权被误读 | 低-中 | 行业已有同应用双格式商业先例（3tene/Animaze）；发布前以书面问询或律师意见复核 Cubism 条款，不凭推断发布[cite:11][cite:12][cite:13] |
| 范围蔓延拖垮 v2.0 | 中 | v2.0 只做 M0 工装；功能实现排 v2.1；VRMA/物理调参/模型市场全部不进 v2.1 首期 |
| 政治/宗教组织利用字段（VRM 1.0 meta 含此项） | 低 | 许可面板原样展示该字段，应用不做任何云审核（本地优先），责任随免责声明归属用户 |

## 6. 建议排期与 M0 出口物

- **v2.0 M0（本期）**：完成上述真机工装（3 个样本模型 × 5 项指标 + 校验链负例），产出正式 spike 报告与 GO/NO-GO 复核；同步把免责声明草案交法务/合规模板复核；**不合并产品代码**。
- **v2.1「形象开放：VRM 导入」（GO 后单立版本）**：导入向导+meta 许可面板、three 渲染后端与双 canvas 分层、口型/表情映射、数据目录与备份引用、舞台/桌宠双形态、e2e 与真机验收、双语；P2 再议 VRMA 动作。
- 不做：内置模型库、模型市场/下载器、模型云同步、任意 glb 导入、Live2D 模型导入。

## Sources

- [cite:1] @pixiv/three-vrm 官方文档（LICENSE: MIT；v1 支持 VRM1.0 与旧版）— https://pixiv.github.io/three-vrm/packages/three-vrm/docs/
- [cite:2] @pixiv/three-vrm@3.5.3 npm 包内 LICENSE 头（MIT, Copyright pixiv Inc.）— https://unpkg.com/@pixiv/three-vrm@3.5.3/lib/nodes/index.cjs
- [cite:3] pixiv 株式会社 three-vrm 开源新闻稿（MIT 许可公告）— https://www.pixiv.co.jp/news/press-release/article/7361/
- [cite:4] VRM 官方文档：ライセンス（人格演绎/再分发许可字段）— https://vrm.dev/vrm/meta/license/
- [cite:5] VRM 官方文档：Model information / Permission-License information（英文）— https://vrm.dev/en/univrm/meta/univrm_meta/
- [cite:6] VRM PUBLIC LICENSE 1.0 全文 — https://vrm.dev/licenses/1.0/pdf/en.pdf
- [cite:7] VRM Consortium 官方站点 — https://vrm-consortium.org/index.html
- [cite:8] VSeeFace 官方条款（免费/商用/担保条款）— https://www.vseeface.icu/#vsfavatar
- [cite:9] Warudo Handbook：免费使用与用户 IP 归属条件 — https://docs.warudo.app/
- [cite:10] Warudo EULA（知识产权与用户内容定义）— https://www.warudo.app/eula
- [cite:11] 3tene 官网：VRM 1.0/VRMA 与 Live2D 双格式支持 — https://3tene.com/en/
- [cite:12] 配信問屋：Animaze by FaceRig 支持 Live2D・VRM・Ready Player Me（P2 社区介绍）— https://haishindonya.jp/tool/animaze
- [cite:13] Live2D 官方：SDK Release License 说明（收费结构与无前期费用）— https://www.live2d.com/en/sdk/license/
- [cite:14] Live2D 官方中文：一般用户/小规模主体出版许可免除（年销售收入 1000 万日元门槛）— https://www.live2d.com/zh-CHS/sdk/download/native/
- [cite:15] Bundlephobia：three@0.180.0 体积（680.1 kB min / 170.1 kB gzip）— https://bundlephobia.com/package/three@0.180.0
- [cite:16] Bundlephobia：@pixiv/three-vrm@3.5.3 体积（148 kB min / 34.7 kB gzip）— https://bundlephobia.com/package/@pixiv/three-vrm@3.5.3
- [cite:17] VRMExpressionManager API（setValue 与 aa 等预设表情）— https://pixiv.github.io/three-vrm/packages/three-vrm/docs/classes/VRMExpressionManager.html
- [cite:18] gabber.dev：three.js VRM 实时口型 setValue(Aa/Oh/Ee) 实操（P2 技术博客）— https://gabber.dev/blog/build-a-threejs-3d-avatar-with-realtime-ai-vision-voice-lip-sync-nextjs
- [cite:19] VRM 官方：VRM file size（5 万面基础构成 3.4 MB+贴图）— https://vrm-c.github.io/vrm.dev.en/univrm/export/vrm_size/
- [cite:20] VR Me Up：VRoid VRM 导出优化实例（17.7 MB→7.9 MB，面数对比）— https://vrmeup.com/devlog/devlog_7_vrm_vroid_studio_export_optimization.html
- [cite:21] VRoid Hub 模型页实例（逐项 Conditions of use 许可清单）— https://hub.vroid.com/en/characters/6359399377964543304/models/5283231030208645113
- [cite:22] Qiita：音频波形均值映射 VRM 口型开合的社区实践（P2）— https://qiita.com/noujiru/items/901306d5147339166789
- [cite:23] VRM 官方：BlendShape 设置（BLINK/JOY 等预设，0–1 权重）— https://vrm-c.github.io/vrm.dev.en/univrm/blendshape/univrm_blendshape/
