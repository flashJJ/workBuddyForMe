# 批量重放：多选、上限与逐条隔离

失败十条，逐条点十次，是自动化产品最劝退的体验之一。

v5.0 在运行中心加了多选与批量重放：一次最多 20 条，可以整体重放，也可以从失败节点重放，结果逐条返回。

## 一、请求契约

```ts
{
  runIds: string[],          // 1..20
  mode?: 'snapshot' | 'latest',
  nodeMode?: 'whole' | 'failed_node'
}
```

返回：

```ts
{
  batchId: string,
  results: [{ runId, ok, newRunId?, reason? }],
  summary: { requested, started, skipped, failed }
}
```

`batchId` 写入新运行的 `replay_batch_id`，用于追溯「这批运行是一起重放的」。它不承担幂等职责：同一批请求重复发送，仍会创建新运行。

## 二、上限为什么是 20

- 每条重放都会创建运行并入队，本地 SQLite 与单进程队列不适合一次灌太多；
- 20 条足够覆盖「夜里失败一批」的常见规模；
- 上限在 schema 层强制，服务层再兜一次，避免绕过 API 直调。

超过上限直接 422，不做静默截断。截断会让用户以为全部重放了。

## 三、逐条隔离

批量重放最忌讳「一条失败，整批回滚」。实现上每条单独 `try/catch`：

```ts
for (const runId of runIds) {
  try {
    const { runId: newRunId } = replay.replayOne({ runId, mode, nodeMode, batchId });
    results.push({ runId, ok: true, newRunId });
  } catch (error) {
    results.push({ runId, ok: false, reason: messageOf(error) });
  }
}
```

- 不存在的运行：该条 `ok:false`，其余继续；
- 版本不可用：该条失败，其余继续；
- 不满足重放条件（例如 `latest` 下失败节点被删）：该条失败；
- 全部参数非法（空数组、超上限）才整体 4xx。

## 四、与补偿的关系

批量重放**不创建补偿行**。补偿是系统自动兜底，批量重放是用户显式操作；两者共用重放服务，但入口语义不同。

重放产生的运行 `parentRunId` 指向原运行，不再进入补偿，避免「重放失败又被自动重放」的循环。

## 五、版本差异提示

批量重放前，运行详情已经返回 `versionCheck`：

- `same`：图未变化；
- `version_changed`：节点有增删或类型变化；
- `node_removed`：失败节点已删除，节点级重放不可用；
- `graph_unavailable`：原版本图与快照都不可用。

UI 根据 `canResumeFromFailedNode` 决定「从失败节点重放」是否可点；用户也可显式选择「按新版本重放」，此时用当前生产图整体重跑。

## 六、结果汇总

对话框展示四类计数：请求数、已启动、跳过、失败。每行保留 `reason`，用户可以直接看出哪条因为什么没重放，而不是只看到「部分失败」。

## 七、边界

- 批量重放不保证顺序执行，队列按自身节奏消费；
- 不做跨批次去重；
- 不做「失败自动再批」；
- 批次 id 只用于追溯，不是幂等键。
