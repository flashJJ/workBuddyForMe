# v4.16 任务清单

> 状态：已完成（2026-11-20，CI `44712778585` 全绿）
> 规格：[spec.md](./spec.md)

## P0 验收进程收口

- [x] `scripts/acceptance/run.mjs`：POSIX 子进程独立进程组 + 整组终止
- [x] 验收结束后显式退出，避免残留句柄挂起步骤
- [x] 本地验证：验收完成后进程立即退出，无残留 Next 进程

## P1 CI 超时与顺序

- [x] `ci.yml` 增加 `concurrency`（同分支取消旧运行）
- [x] 准备、验收、评测、E2E、视觉步骤增加 `timeout-minutes`
- [x] 视觉与 E2E 调整到验收之前，产物不再被长链路阻塞

## P2 E2E 稳定性

- [x] Playwright CI 开启 `retries: 2`
- [x] 设置锚点 / Live2D / VAD 超时放宽到 60 秒
- [x] CI 与视觉工作流缓存 Playwright Chromium

## P3 视觉基线

- [x] 提交三张 Linux 基线截图
- [x] 专用 `visual.yml` 增加并发取消与缓存
- [x] 触发视觉工作流验证通过

## 收尾

- [x] `pnpm check` 全绿
- [x] 更新计划索引与路线图状态
- [x] 提交并推送 `tencent` 与 `origin`

## 附：同期缺陷排查

- [x] 按「异常路径 / 资源生命周期 / 协议边界 / 环境差异」逐模块排查，修复 30 条并归档到 [Bug 记录表](../../wiki/bug-registry.md)
- [x] 新增 [验收清单](../../wiki/acceptance-checklist.md)：把取消、超时、重启、拔设备等场景纳入常规验收
- [x] 同步修复工具评测 / eval 包装器的进程组回收与显式退出（同 P0 类问题）
