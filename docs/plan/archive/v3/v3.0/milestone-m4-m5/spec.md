# M4 小剧场 / 分享 / 角色包 + M5 发布与验收 Spec

> 阶段：P6-M4 / P6-M5
> 目标：把舞台扩成可深链的小剧场，导出含数据的分享卡；把剧本 lint/golden、合规声明、版本号收成发布门禁。
> 前置：P8.1–P8.8 剧本引擎与 M3 Utility 已完成；现有门禁（单文件 ≤300 行 / 目录直接文件 ≤12 / check:cycles / check:ascii）继续生效。

## 1. M3 结项结论

M3 主线已完成，不再追加范围：

| 项 | 状态 | 位置 |
|---|---|---|
| 角色声线（雪团 sid=18） | 完成 | `packages/shared/src/schemas/media/voice.ts` |
| 用户画像注入剧本生成 | 完成 | `apps/web/src/features/avatar/script/generation/profile/` |
| 主动播放（空闲预算 + claim 去重） | 完成 | `generation/playback/`、`use-proactive-playback.ts` |
| Utility 决策阶段 1–3（选场、触发键排序、theme/tags 去重、弱偏好） | 完成 | `avatar/script/utility/` |
| 决策记录与设置页「最近决策」 | 完成 | `generation/decisions/`、`settings/script/script-decisions.tsx` |
| 低语忙碌静默 | 完成 | `pet/stage/use-pet-ambient-talk.ts` |

保留为可选跟进（不阻塞 M4/M5）：低语池间打分（需台词池补主题/风格元数据）、主动播放关系等级门槛、弱偏好命中率观察。

## 2. 现状结论（已核实，不再重复调研）

- 舞台路由 `/stage`，`stage-root.tsx` 已按 query 分 mock / run / meeting 三模式；query 解析集中在 `useStageTarget()`，只允许 `run`、`meeting` 两个参数。
- 舞台 cast 同时支持 VRM（`isVrmAvatarId`）与 Live2D；`StageDirection` 联合类型与 `applyStageDirection()` 已能表达 cast / focus / speech / expression / motion / exit。
- 截图 `useStageScreenshot()` 先隐藏 UI 一帧，再调 `bridge.capture()`，由桌面主进程保存 PNG；浏览器裸访返回 `unsupported`。
- 角色卡已有 Markdown 导出/导入（`features/character-cards/`、`@wbfm/shared/character-card`），导入只解析 frontmatter 文本、不执行代码，M4 该项只做验收与文档确认。
- 内置场景注册表 `avatar/script/scenes.ts` 聚合 5 个场景模块；已有逐场测试，但没有跨场景 lint，也没有 cue 序列 golden 快照。
- 版本单一事实源是 root `package.json`，`scripts/sync-version.mjs` 同步 web/desktop 与 `packages/shared/src/version.ts`；实施前为 2.35.0（本阶段已升至 3.0.0）。
- 关于面板已有 Live2D 第三方许可，但没有原创角色与二创包合规声明。

## 3. M4-1 小剧场（`/stage?stage=play`）

### 3.1 新增 `apps/web/src/features/stage/theater/theater-script.ts`

```ts
export interface TheaterLine {
  slot: StageSlot;
  text: string;
  expression: ExpressionTag;
  motion: StageMotionGroup;
}
export interface TheaterEpisode {
  id: string;
  title: string;
  cast: StageCastMember[];
  lines: TheaterLine[];
}
export const THEATER_EPISODES: readonly TheaterEpisode[];
export function findTheaterEpisode(id?: string | null): TheaterEpisode;
export function parseTheaterSearch(search: string): { theater: boolean; episodeId: string | null };
export function theaterDirections(episode: TheaterEpisode, index: number): StageDirection[];
```

- 内置 1 集「摸鱼小剧场 · 深夜茶歇」，cast 只用三个内置 VRM 角色（不用 Live2D 样本模型）：
  - center：鲸鱼娘-雪团（`vrm:builtin:xuetuan`，displayName「雪团」）
  - left：运动健将-冉卡露丽（`vrm:builtin:rankaluli`，displayName「冉卡露丽」）
  - right：兔耳娘-菲比（`vrm:builtin:feibi`，displayName「菲比」）
- 6 句台词，按人设分工：雪团摸鱼/干饭、冉卡露丽拉人运动、菲比劝休息；首句与末句由雪团收束；每句带表情与动作分组。
- 三席全部走 `isVrmAvatarId === true` 的 VRM 渲染分支；不做 Live2D/VRM 混排。
- `theaterDirections()` 是纯函数：返回 `focus` + `speech(seq=index)` + 该句 `expression` + 该句 `motion`；越界时回到第 0 句。
- `parseTheaterSearch()` 校验 `stage=play`，`ep` 只接受 `^[a-z0-9-]{1,40}$`，未知 id 回落默认集。

### 3.2 新增 `apps/web/src/features/stage/theater/use-stage-theater.ts`

```ts
export function useStageTheater(args: {
  enabled: boolean;
  episode: TheaterEpisode;
  applyDirection: (d: StageDirection) => void;
}): {
  index: number;
  total: number;
  playing: boolean;
  current: TheaterLine;
  restart: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
};
```

- `enabled` 首次为真时派发一次 `cast` 指令（换 cast 会重置表情/动作）。
- 播放间隔 5200ms，播完自动回到第 0 句循环；组件卸载清理 interval。
- 每次 `index` 变化派发 `theaterDirections(episode, index)`。

### 3.3 改造 `stage-root.tsx`

- `useStageTarget()` 增加 `theater` 与 `episodeId`（读 `stage=play` / `ep`）。
- 模式判定改为 `theater ? 'theater' : meeting ? ...`。
- 始终调用 `useStageTheater`（`enabled = mode === 'theater'`），避免条件 Hook。
- 传给 `StageToolbar` 剧场控制（重播 / 上一句 / 下一句 / 分享卡）。
- 渲染 `StageShareCard`，仅 `mode === 'theater' && shareOpen`；分享卡不受 `uiHidden` 影响（截图时只隐藏按钮）。
- 根节点新增 `data-mode="theater"`。

### 3.4 改造 `use-stage-controller.ts` 与 `stage-toolbar.tsx`

- `StageMode` 增加 `'theater'`。
- 工具栏标题 key 增加 `stage.modeTitle.theater`；演示区仍只对 mock 显示。
- 新增剧场区（仅 theater 显示）：`上一句 / 下一句 / 重播 / 分享卡`。

### 3.5 i18n

`packages/shared/src/i18n/messages/stage.ts` 与 `stage-en.ts` 增加：

- `modeTitle.theater`
- `theater.{title,prev,next,restart,share,lineHint}`
- `shareCard.{title,save,close,date,episode,playing,generated,footer,unsupported}`

## 4. M4-2 分享卡（本机生成 PNG）

### 4.1 新增 `apps/web/src/features/stage/theater/stage-share-card.tsx`

```tsx
export function StageShareCard(props: {
  episode: TheaterEpisode;
  line: TheaterLine;
  index: number;
  total: number;
  uiHidden: boolean;
  onSave: () => void;
  onClose: () => void;
});
```

- 固定 420×560 卡片：标题、日期、当前台词、席位名单、今日数据、页脚。
- 今日数据失败可缺失（fail-open，显示 `--`）：
  - `GET /api/pet/script/playback` → 今日主动播放 `plays/limit`
  - `GET /api/pet/script` → 生成队列 `scenes.length` 与线索数
- M2 养成已取消，分享卡用「今日主动播放 / 今日生成」替代原「投喂 / 亲密度」；关系等级留到有轻量查询接口再加。
- 「保存 PNG」调用 `controller.requestScreenshot()`：先 `uiHidden=true` 隐藏按钮，一帧后 `bridge.capture()` 保存，再恢复；浏览器无桥时沿用现有 unsupported toast。
- 卡片本身不因 `uiHidden` 隐藏，保证截到卡面。

## 5. M4-3 角色包（验收，无代码改动）

- 已具备 Markdown 导出/导入与内置卡只读区；导入只解析 frontmatter，不执行代码。
- 新增验收说明：导出内容仅文本；导入非法 frontmatter 报错且不落库；不引入脚本/可执行字段。

## 6. M5-1 剧本 lint + golden 门禁

### 6.1 新增 `apps/web/src/features/avatar/script/scenes/lint.test.ts`

对 `BUILT_IN_SCENES` 逐条断言：

- `id` 非空且全局唯一。
- `triggers` 全部命中 `GENERATED_SCENE_TRIGGERS` 或内置触发键注册表。
- `priority` 整数 0–100；`cooldownMs ≥ 0`；`interrupt` 属于允许枚举。
- `beats` 非空、`at` 单调不减、末拍 ≤ 240000ms。
- 至少 1 个 `line` cue；`prop` 的 attach/detach 成对。
- `validateScene(scene)` 不丢弃任何 beat（丢弃数 0）。
- branch 递归同样满足上述时间与白名单约束。

### 6.2 新增 `apps/web/src/features/avatar/script/scenes/golden.test.ts`

- 用纯函数把每个内置场景压成 `id → [{ at, kind }]`，`toMatchSnapshot()` 落 `__snapshots__`。
- 快照只记录时间与 cue 类别，不记录随机/环境相关字段。
- 新增/修改场景必须显式更新快照，避免无声漂移。

### 6.3 根脚本

`package.json` 增加：

```json
"check:scenes": "pnpm --filter @wbfm/web exec vitest run src/features/avatar/script/scenes"
```

## 7. M5-2 合规声明

`about-panel.tsx` 新增原创角色声明块（两个渲染分支都渲染，沿用 `Live2DLicenseNotice` 位置）：

- 内置角色「雪团」「冉卡露丽」「菲比」的模型与贴图统一 CC BY-NC-SA 4.0（署名 / 禁商用 / 衍生同协议）；雪团由 AI Agent 按「大肥鱼」主题独立生成参考图、经 Neural4D 图生 3D 后二次制作，冉卡露丽 / 菲比经项目二次制作与优化。
- 与 DeepSeek 官方及「溟月」无关联，仓库不含官方素材。
- 二创角色包只含 Markdown 与资源，不含可执行代码。
- i18n `about.compliance.{title,character,disclaimer,pack}` 中英文。

## 8. M5-3 版本与发布

- root `package.json` 版本 2.35.0 → 3.0.0，执行 `pnpm sync-version`，再 `pnpm sync-version:check`。
- 新增 `docs/plan/archive/v3/v3.0/release-notes.md`：版本范围、M0–M5 要点、门禁结果、已知限制、发布物料清单（短片/博客/截图由用户产出，文档给大纲）。
- 更新 `execution-roadmap.md` 状态表与 `progress-log.md` 工作日志。

## 9. 验证

1. `pnpm --filter @wbfm/web test -- src/features/stage src/features/avatar/script/scenes`
2. `pnpm check:scenes`
3. `pnpm typecheck`
4. `pnpm lint`
5. `pnpm check:lines` / `pnpm check:structure` / `pnpm check:cycles` / `pnpm check:ascii`
6. 真机：`WBFM_PET_SCRIPT=1` 启动桌面端，打开 `/stage?stage=play`：
   - 三席均为内置 VRM 角色（雪团 / 冉卡露丽 / 菲比），模型渲染正常；
   - 台词每 5.2s 推进并循环；
   - 上一句/下一句/重播可用；
   - 分享卡显示标题、日期、台词、今日数据；
   - 保存 PNG 成功且卡面在截图内、按钮不在截图内；
   - 浏览器裸访分享卡提示 unsupported。
7. 角色卡：导出一张自建卡 → 删除 → 导入同一 Markdown，内容一致；导入含代码块的非法 frontmatter 报错。

## 10. 风险与不做

- 分享卡统计接口失败时不阻断卡面（显示 `--`）。
- 舞台无 API 鉴权问题（同源本地）。
- M2 已取消：不恢复投喂/亲密度，分享卡数据口径以剧情播放为准。
- 不做运行时代码插件、不做云分享上传；分享卡只在本机导出。
- 发布短片与博客不由代码生成，只提供物料清单与大纲。

## 11. 审批

请确认本 Spec 后进入执行；若需要调整分享卡数据口径（是否必须先补关系等级接口）或版本号（是否直接 3.0.0），请在审批时指出。
