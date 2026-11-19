# v4.15 任务清单

> 状态：已完成（2026-11-19）
> 规格：[spec.md](./spec.md)

## P0 动作契约收口

- [x] 删除 `interaction-actions.ts` 的 `event.fire` / `chat.request` 变体
- [x] `action-executor.ts` 删除两个 case；controller 空判断下移到 controller 类动作
- [x] `recorder.ts` / `recorder.test.ts` 同步删除
- [x] 新增 `action-executor.test.ts`（无 controller 仍出字幕；有 controller 才驱动表现）
- [x] 验证 `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm check`

## P1 桌宠发起聊天

- [x] `packages/shared/src/pet.ts` 新增 `onChatRequest` + 语义键白名单
- [x] `pet-manager.ts` / `pet-menu.ts` 菜单项「聊两句」→ 聚焦主窗 + 发送语义键
- [x] preload 暴露；`chat-page.tsx` 订阅后预填草稿与聚焦，不自动发送
- [x] 单测覆盖「预填但不发送」

## P2 视觉巡检 L1

- [x] `tests/e2e/visual-v415.spec.ts` 覆盖设置页 / 记忆面板 / 上下文洞察面板
- [x] 明确排除 WebGL、VRM/Live2D、透明桌宠窗、会议舞台
- [x] 新增 `test:e2e:visual` 脚本；CI 首月 `continue-on-error: true`
- [x] nightly 上传 diff 产物；稳定后转阻断

## 收尾

- [x] 更新计划索引与路线图状态
- [x] 提交并推送工蜂 `tencent`
