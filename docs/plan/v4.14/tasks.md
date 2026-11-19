# v4.14 任务清单

> 状态：待评审
> 规格：[spec.md](./spec.md)

## 本版执行（文档）

- [x] T1 新增 `docs/plan/v4.14/spec.md`（选型结论与 v4.15 蓝图）
- [x] T2 新增 `docs/plan/v4.14/tasks.md`（本文件）
- [x] T3 新增 `docs/plan/README.md`：按 v0 / v1 / v2 / v3 / v4 分组，列出全部顶层子目录链接与跨版本专题
- [x] T4 `README.md`「文档」章节增加 `[方案与版本归档（按大版本）](docs/plan/README.md)`
- [x] T5 校验：`docs/plan` 子目录集合与索引集合一致；索引内链接全部存在
- [x] T6 `pnpm check` 通过；提交并推送 `tencent`

## v4.15 候选（需另行确认）

### 动作契约收口

- [ ] 删除 `interaction-actions.ts` 的 `event.fire` / `chat.request` 变体
- [ ] `action-executor.ts` 删除两个 case；controller 空判断下移到 controller 类动作
- [ ] `recorder.ts` / `recorder.test.ts` 同步删除
- [ ] 新增 `action-executor.test.ts`（无 controller 仍出字幕；有 controller 才驱动表现）
- [ ] 验证 `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm check`

### 桌宠发起聊天（可选）

- [ ] `packages/shared/src/pet.ts` 新增 `onChatRequest` + 语义键白名单
- [ ] `pet-manager.ts` / `pet-menu.ts` 菜单项「聊两句」→ 聚焦主窗 + 发送语义键
- [ ] preload 暴露；`chat-page.tsx` 订阅后预填草稿与聚焦，不自动发送
- [ ] 单测覆盖「预填但不发送」

### 视觉巡检 L1

- [ ] `tests/e2e/visual-v414.spec.ts` 覆盖设置页 / 记忆面板 / 上下文洞察面板
- [ ] 明确排除 WebGL、VRM/Live2D、透明桌宠窗、会议舞台
- [ ] 新增 `test:e2e:visual` 脚本；CI 首月 `continue-on-error: true`
- [ ] nightly 上传 diff 产物；稳定后转阻断
