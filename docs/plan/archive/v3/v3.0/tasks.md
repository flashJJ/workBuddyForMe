# P4 M0b 运行时补齐 Tasks

> 规格见 [spec.md](./spec.md)。按顺序执行，每步完成后勾选并跑对应验证。

## T1 Web 运行时热替换（P4-1a）

- [x] 新建 `vrm/session/release-model.ts`：固定释放顺序 + 幂等
- [x] 新建 `vrm/session/vrm-session.ts`：renderer/scene/rAF 常驻，`loadModel` 热替换，失败保留旧模型
- [x] `vrm-fit.ts`：`createCanvasFit` 增加 `reset()`
- [x] `vrm-canvas.tsx` 改为薄包装：mount effect 建 session、`[fileRef]` effect 调 `loadModel`
- [x] `vrm-debug.ts`：探针增加 `resources()`，`installVrmDebugProbe` 增加 `getResources`
- [x] `pnpm --filter @wbfm/web test -- src/features/avatar/vrm`

## T2 桌面同窗口换模型（P4-1b）

- [x] `packages/shared/src/pet.ts`：桥增加 `onModelChange` / `confirmModel`
- [x] `pet-constants.ts`：`MODEL_CHANGED_CHANNEL` / `MODEL_APPLIED_CHANNEL`
- [x] `preload/index.ts`：桥接两通道
- [x] `pet-ipc.ts`：`confirmModel` 动作 + `pet:model-applied` 监听（仅 fromPet）
- [x] `pet-manager.ts`：`swapModel` 先 IPC + 1500ms 超时回退 `recreateWindow`；关闭/退出取消 pending
- [x] `pet-types.ts`：注入 `setTimeout/clearTimeout`
- [x] `apps/web/src/app/pet/page.tsx`：订阅模型变更 → setState + 回执 + 同步 query
- [x] 更新 `pet-manager.test.ts`：IPC 换模型用例 + 超时回退用例
- [x] `pnpm --filter @wbfm/desktop test -- src/main/pet`

## T3 资源回收审计（P4-2）

- [x] session 全部换模型/卸载统一走 `releaseVrmModel`
- [x] 新增 `vrm/session/release-model.test.ts`：顺序 + 幂等
- [x] 真机 `__vrmDebug.resources()`：连续切换 3 次后回基线（实测 4 次切换：B 28/66/5 ×2、A 24/57/6 ×2，无增长）

## T4 Q 版开关（P4-3）

- [x] `voice.ts`：`avatarChibi` 进 update schema / required / 默认值
- [x] i18n `voice.ts` + `voice-en.ts`：`chibiLabel` / `chibiHint`
- [x] `avatar-section.tsx`：开关 UI
- [x] 新建 `vrm/chibi/apply-chibi.ts`：幂等缩放 + 还原
- [x] `vrm-seating.ts`：`refreshRig()`
- [x] `vrm-pose-layer.ts` / `vrm-controller.ts`：`setChibi`
- [x] `vrm-canvas.tsx` + `avatar-canvas-router.tsx`：`chibi` 透传并 refit
- [x] 新建 `avatar/ui/use-avatar-chibi.ts`，接线 `avatar-host.tsx` / `pet-stage.tsx`
- [x] 新增 `vrm/chibi/apply-chibi.test.ts`
- [x] 真机开关截图（开/关各一次；CDP 截图验证骨架 1.35/0.7 与还原，临时图已清理）

## T5 验证与门禁

- [x] `pnpm typecheck`
- [x] `pnpm --filter @wbfm/web lint`
- [x] `pnpm check:lines` / `pnpm check:structure` / `pnpm check:cycles`
- [x] 真机：雪团 ↔ 导入模型连续切换，无黑帧、窗口不移位、穿透/悬停正常（窗口标记存活=未重建，位置恒定，canvas 260×340；穿透/悬停对象随窗口保留）
- [x] 更新 `docs/plan/archive/v3/v3.0/progress-log.md`（P4 工作日志与结论）
- [x] 更新 `docs/plan/archive/v3/v3.0/execution-roadmap.md`（P4 状态）
- [x] 清理临时脚本与调试产物（本轮未新增；`.tmp/` 为 P3 座位道具验证留存，不属于 P4）
