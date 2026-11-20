# v4.16 任务清单

> 状态：执行中（2026-11-20）
> 规格：[spec.md](./spec.md)

## P0 验收进程收口

- [ ] `scripts/acceptance/run.mjs`：POSIX 子进程独立进程组 + 整组终止
- [ ] 验收结束后显式退出，避免残留句柄挂起步骤
- [ ] 本地验证：验收完成后进程立即退出，无残留 Next 进程

## P1 CI 超时与顺序

- [ ] `ci.yml` 增加 `concurrency`（同分支取消旧运行）
- [ ] 准备、验收、评测、E2E、视觉步骤增加 `timeout-minutes`
- [ ] 视觉与 E2E 调整到验收之前，产物不再被长链路阻塞

## P2 E2E 稳定性

- [ ] Playwright CI 开启 `retries: 2`
- [ ] 设置锚点 / Live2D / VAD 超时放宽到 60 秒
- [ ] CI 与视觉工作流缓存 Playwright Chromium

## P3 视觉基线

- [ ] 提交三张 Linux 基线截图
- [ ] 专用 `visual.yml` 增加并发取消与缓存
- [ ] 触发视觉工作流验证通过

## 收尾

- [ ] `pnpm check` 全绿
- [ ] 更新计划索引与路线图状态
- [ ] 提交并推送 `tencent` 与 `origin`
