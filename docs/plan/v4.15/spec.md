# v4.15 桌宠动作契约收口、发起聊天与视觉巡检

> 状态：已完成（2026-11-19）
> 上游：[v4.14 选型](../v4.14/spec.md)
> 关联：[开发与测试指南](../../development.md)

## 1. 范围

| 优先级 | 事项 | 来源 | 本版动作 |
|---|---|---|---|
| P0 | `event.fire` / `chat.request` 动作变体不可达，且执行器存在「无 controller 时字幕也被跳过」缺陷 | v4.14 D1 | 删除变体与分支，修复早退，补执行器单测 |
| P1 | 桌宠发起聊天 | v4.14 D2 | 右键菜单「聊两句」→ 聚焦主窗 + 按语义键预填草稿，**不自动发送** |
| P2 | 视觉巡检 L1 | v4.14 D3 | Playwright 截图基线（稳定 2D 面），CI 首月非阻断 |

不做：桌宠本地演出事件、动作链新增 IPC、视觉语义断言（L2 Midscene）与 Playwright MCP（L3 仅人工）。

## 2. P0：动作契约收口

### 2.1 改动

- `packages/shared/src/schemas/interaction/interaction-actions.ts`：删除 `event.fire` 与 `chat.request` 两个联合成员。
- `apps/web/src/features/interaction/action-executor.ts`：删除两个 `case`；把 `controllerRef.current` 的空判断下移到仅 controller 类动作，`subtitle.*` 不再受模型是否加载影响。
- `apps/web/src/features/avatar/script/recorder.ts`：删除两个 `case`，保持 switch 穷尽。
- `apps/web/src/features/avatar/script/recorder.test.ts`：删除「空实现动作返回 null」断言。
- 新增 `apps/web/src/features/interaction/action-executor.test.ts`：覆盖「无 controller 仍触发字幕」「有 controller 才调用交互/表情」。

### 2.2 为什么只删不加

动作链是用户可配置的表达，但这两个动作既无入口也无参数来源；v4.14 已复核类型、动作目录、配置校验、触发器与执行器五条路径，均不可达。先铺 IPC 只会扩大死代码面。事件能力仍由主窗 `EventDirector` 的触发器与试演菜单覆盖。

## 3. P1：桌宠发起聊天

### 3.1 交互

右键菜单新增「聊两句」：聚焦主窗并预填草稿，用户可改可删，**不自动发送**。入口不走动作链，避免绕过 CONV 锁、勿扰、冷却与每日上限。

### 3.2 改动

- `packages/shared/src/pet.ts`：新增 `onChatRequest(cb: (promptKey: string) => void): () => void` 与语义键白名单 `PET_CHAT_PROMPT_KEYS`。
- `apps/desktop/src/main/pet/pet-manager.ts` + `pet-menu.ts`：菜单项 → `focusMain('/chat')` + `main.webContents.send('pet:chat-request', key)`。
- `apps/desktop/src/preload/index.ts`：暴露 `onChatRequest`。
- `apps/web/src/features/chat/page/chat-page.tsx`：订阅 → `setDraft(t(key))` + `setComposerFocus(v => v + 1)`，不调用 `session.send`。
- 测试：shared 白名单单测；chat-page 订阅单测（预填但不发送）。

IPC 只传语义键，不传自由文本，避免注入与超长载荷。

## 4. P2：视觉巡检 L1

- 新增 `tests/e2e/visual-v415.spec.ts`，只覆盖稳定 2D 面：设置页、记忆面板、上下文洞察面板。
- 明确排除 WebGL/VRM/Live2D、透明桌宠窗、会议舞台。
- 基线只在 Linux/CI 生成并提交；本地默认跳过，`WBFM_VISUAL=1` 才跑。
- `toHaveScreenshot(..., { animations: 'disabled', maxDiffPixelRatio: 0.02 })`。
- 新增 `test:e2e:visual` 脚本；CI 首月 `continue-on-error: true`，nightly 上传 diff 产物；稳定后转阻断。

## 5. 验收

- `pnpm typecheck`、`pnpm lint`、`pnpm test:unit`、`pnpm check` 全绿。
- 全仓无 `event.fire` / `chat.request` 生产引用；执行器单测覆盖字幕与 controller 两类路径。
- P1 单测证明「预填但不发送」。
- `test:e2e:visual` 在 Linux CI 可生成/比对基线；本地默认跳过。

## 6. 风险与回退

| 风险 | 缓解 |
|---|---|
| 删除动作变体影响未知调用方 | 全仓检索确认无生产方；shared 为内部包 |
| 桌宠跨 IPC 误触发发送 | 只传语义键；主窗仅预填草稿，永不调用发送 |
| 截图基线在 Linux 生成、Windows 本地不一致 | 本地默认跳过；基线只在 CI 生成与比对 |
| 视觉巡检拖慢 CI | 首月 `continue-on-error`，nightly 单独跑 |
