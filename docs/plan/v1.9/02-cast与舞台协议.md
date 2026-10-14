# v1.9 M0 冻结 · cast 协议与舞台只读渲染契约

> 适用 M1（舞台骨架）与 M2（协作 run 适配器）。本文件只冻结**形状与边界**，具体组件实现留到各里程碑。

## 1. 不可变边界

1. 舞台是**只读渲染器**：不调执行类 API、不放审批/返工/工具确认按钮；v1.4 run 的唯一控制面仍是任务中心泳道，两者互链不互替。
2. 订阅只读：M2 通过既有 `GET /api/agent/runs/[id]/events` SSE 订阅（run 状态在服务端，允许第二客户端只读订阅），舞台不写 run 状态。
3. 队列所有方在主会话：关舞台窗不取消 run、不退会议（与 v1.7 桌宠「关窗不退队列」同构）。
4. 主窗唯一 AudioContext：舞台不建音频管线（v1.0 宪法，见 [v1.9 概念稿 §3.2](../v1.6-v2.0/v1.9-多智能体会议舞台.md)）。

## 2. cast（角色分配）形状

```ts
/** 舞台槽位：M1 固定左/中/右三槽，数字索引预留给 P1 自由站位 */
type StageSlot = 'left' | 'center' | 'right';

interface StageCastMember {
  slot: StageSlot;
  /** 协作角色（v1.4 固定三角色）或会议成员（真实助手 id） */
  kind: 'agent-role' | 'assistant';
  /** kind=agent-role 时为 'planner'|'executor'|'reviewer'；否则为 assistants.id */
  refId: string;
  /** 名字牌强内容：助手 name；协作角色未映射助手时用角色中文名 */
  displayName: string;
  /** avatar 注册表 id（haru/hiyori/mark/mao/wanko），解析顺序见 §3 */
  avatarModelId: string;
  /** 表情标签（沿用 v1.6 ExpressionTag 八分类），初始 neutral */
  expression: string;
  /** 名字牌副线：当前动作的 i18n key（思考/倾听/执行中…），由适配器填 */
  actionLabelKey?: string;
  /** M3 语音映射占位：voice 仍走主窗 TTS，这里只声明角色→声线偏好 */
  voicePreference?: { ttsModel: 'kokoro' | 'melo'; speakerSid: number | null };
}
```

### 2.1 avatarModelId 解析顺序（M1 冻结）

1. 场景保存的 cast 覆盖（stage scene 内逐槽指定）；
2. 全局语音设置 `voiceSettings.avatarModelId`（现有字段，设置面板可选的 5 套模型）；
3. 回落 `haru`（`DEFAULT_AVATAR_MODEL_ID`）。

**v1.9 P0 不给 assistants 表加形象列**：助手目前没有 per-assistant Live2D 模型字段（现有 Assistant 结构只有 emoji/color/cardId）。协作三角色在 M2 提供「角色→槽位形象」一次性映射（存场景），P1 候选再议 `assistants.avatar_model_id`。

## 3. 舞台指令（StageDirection）——适配器唯一输出

舞台 UI 只消费一个**严格串行**的指令队列；core 提供 agent run → 指令数组/流的**纯映射适配器**（不碰模型、不重放请求）。

```ts
type StageDirection =
  | { t: 'cast'; members: StageCastMember[] }          // 本场演员表（开场一次）
  | { t: 'focus'; slot: StageSlot | null }             // 当前发言/主角聚焦，null=散焦
  | { t: 'speech'; slot: StageSlot; text: string; seq: number }  // 一句台词（已摘要化）
  | { t: 'expression'; slot: StageSlot; tag: string }
  | { t: 'motion'; slot: StageSlot; group: 'listening' | 'thinking' | 'working' | 'idle' }
  | { t: 'exit'; slot: StageSlot };
```

队列规则：

- `speech` 必须等前一句的**播放完成事件**（主窗 TTS 结束或文本打字完成，二者取晚到者）才出队下一句；网络/计算等待期间绝不允许角色僵住——等待角色挂 `listening`/`thinking` 微动作（复用 v1.6 Live2dMicrodynamics）。
- 指令是时间序列，天然支持 P1 回放（落表后按时间戳重播，不重新请求模型）。

## 4. 现有 agent SSE → 舞台指令映射（M2 实现依据）

真源：`packages/shared/src/api/sse.ts` 已定义的帧类型，适配器只做映射，不新增帧：

| 现有 SSE 帧 | 舞台指令 | 台词策略 |
|---|---|---|
| `agent_phase { phase: 'planning'|'executing'|'reviewing', role }` | `focus` 对应槽 + 其余槽 `motion:listening`；主角 `thinking/working` | 无台词 |
| `agent_handoff { handoff }` | 源角色短 `speech` + `focus` 转移 | planner 宣读子任务 title/brief（≤1 句，不念 acceptance 全文）；reviewer 念裁决短台词（approve/revise/reject + 一句理由） |
| `agent_delta { role, content }` | 该角色 `speech`（seq 按帧序） | 规划/审查文本可念；**executor 的工具流不逐字念**（工具调用只驱动 working 动作） |
| `agent_budget { usage }` | 不上舞台台词；只在调试角标/回看信息里可见 | — |
| `agent_tool_confirm` | 舞台无交互（不放假按钮）；executor 挂 `thinking` | 审批仍发生在任务中心 |
| phase `done`/`failed` | `focus:null` + 谢幕/失败短台词 | 一句固定文案，不新编内容 |

协作三角色默认站位：planner 左、executor 中、reviewer 右（handoff 顺序即视觉动线）；槽位可在场景里覆盖。

## 5. 语音与口型归属

- 语音合成与播放**留在主会话**（现有 voice runtime + `use-voice-playback` 队列、唯一 AudioContext）。
- 舞台窗只通过现有桥（桌宠同款：本地 BroadcastChannel / Electron IPC relay）收**电平与播放状态**做口型，与 `Live2dStage` 现有 `getLevel()` rAF 泵对接。
- 无语音（TTS 关/未下载）时纯文本舞台必须完整可用：speech 指令驱动打字字幕与表情，口型电平恒 0。

## 6. 舞台窗口与场景（M1）

- Web：`/stage` 全屏路由；Electron：主进程开独立全屏 BrowserWindow 承载同一路由（复用桌宠窗口管理模式）。
- 桌宠 ↔ 舞台互斥切换，保存/恢复原窗几何；H 隐 UI、F11 全屏、Esc 逐级退出（退聚焦→关窗）、保存无 UI 截图。
- 背景：纯色/渐变/内置原创背景/本地图片（≤20MB，复制进数据目录，不引用原路径）；「灯光」=暖色滤镜层 + 亮度，不做三维光照。
- 场景（背景+站位+cast 覆盖+显隐+滤镜）命名保存，本地 SQLite 新表（M1 迁移 v027）：

```sql
CREATE TABLE IF NOT EXISTS stage_scenes (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  is_builtin  INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,   -- 背景/站位/cast 覆盖/滤镜/显隐
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
```

场景进备份（M2 并档时备份 schema v5，与会议同批，见 03 文档 §6）；背景图片默认只备份引用不备份文件，恢复缺失回落默认背景（体积策略）。

## 7. M2 验收（提前冻结，防实现漂移）

- 同一 run 在任务中心与舞台同时打开：操作仅能在任务中心发生；舞台操作控件为 0。
- e2e：run 进行中关闭舞台窗 → run 在后台跑完且状态落库；重新打开可从当前进度续看。
- 适配器为纯函数单测：喂录制 SSE 帧序列，断言指令顺序/focus 转移/工具帧不产生台词。
