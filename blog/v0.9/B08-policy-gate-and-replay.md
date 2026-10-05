# 无人值守策略门控与祖先闭包重放

v0.9 最后一个、也是安全分量最重的一块：当流程由 API/MCP 触发，屏幕前没有任何人可以点「允许」时，write/danger 工具能不能执行，谁说了算？以及失败的外部运行，怎么以最小成本续跑？这篇讲策略门控和重放两块的设计。

## 门控：同一个引擎，两条授权支路

v0.8 的工具节点授权逻辑是：read 直接放行；write/danger 先查权限记忆，没有就挂起等内联确认（HITL）。这套逻辑对 manual 成立，但 api/mcp 触发时**不能挂起**——没有人在等。

我们没有另写一个「无人值守执行器」，而是在引擎的同一个工具门控点分了一条支路：

```ts
if (permission !== 'read') {
  if ((trigger === 'api' || trigger === 'mcp') && ctx.evaluateUnattended) {
    // 无人值守：纯策略裁决，永不挂起
    const d = ctx.evaluateUnattended(toolName, permission);
    allowed = d.allowed;
    if (!allowed) denyReason = policyDenyText(d.reason, toolName);
  } else {
    // v0.8：权限记忆 + 交互式确认（manual）；chat 保持非交互拒绝
  }
}
```

裁决是一个零依赖纯函数（`policy-gate.ts`）：

```ts
function evaluateUnattendedPolicy(policy, toolName, permission) {
  if (permission === 'read') return allow('read_allowed');
  if (DESKTOP_BAN_LIST.includes(toolName)) return deny('desktop_control_banned');
  if (policy.mode === 'allowlist' && policy.allowed.includes(toolName))
    return allow('policy_allow');
  return deny('policy_deny');
}
```

三层判断的优先级是刻意的：

1. **read 始终放行**——纯读工具（current_time 这类）不消耗用户授权；
2. **桌面控制永久禁单先于白名单**——screen_snapshot、mouse_*、keyboard_*、window_*、uia_list、app_launch 这 10 个 GUI 操控工具，即使端点策略把它加进白名单也拒绝。无人值守链路操作真实鼠标键盘的风险不可接受，这类需求必须走画布人工试运行；
3. **白名单次之，默认 deny_all 兜底**。

## 策略快照随 run 固化

端点策略是可以随时改的（UI 里勾两个复选框、保存即生效）。但一条已经入队/在途的 run 该用哪份策略？答案是**建 run 那一刻快照**：

```ts
// createRun 时
overrides.unattendedPolicy =
  endpoints.getById(endpointId)?.policy ?? { mode: 'deny_all' };
```

快照跟着执行参数走，不落库版本（端点/仓储异常时安全兜底 deny_all）。执行期间用户改了策略，在途 run 不受影响，新 run 才用新策略。这和「发布版本固定当前图」是同一种确定性哲学。

拒绝不是让流程崩掉：工具节点产出 `ok:false`，output 里带可检索的审计标记，流程继续（和 v0.8 人工拒绝的行为一致）：

```text
无人值守策略拒绝：工具 fetch_webpage 不在端点白名单（默认拒绝写入/高危操作）。
[policy_deny:not_allowlisted]
```

终态仍是 run_succeeded，end 节点引用到的 summary 会如实显示「无人值守策略拒绝」——调用方能从输出和节点记录两层读到原因。

## 发布新版本 → 409 要求重新确认

危险节点集合可能随发布改变（v1 加了个发邮件的工具，v2 又加了个改文件的）。如果策略默认沿用，等于让用户在不知情的情况下授权了新工具。

机制：

1. 发布新版本时，如果该流程已有端点，置 `policy_revalidation_required=1`；
2. 此后所有 api/mcp 调用（在鉴权通过之后）返回 `409 policy_revalidation_required`；
3. 用户打开端点对话框看到红色警告条，重新核对白名单并保存 → 清位，调用恢复。

实测序列：allowlist 正常调用 200 → 发新版本 → 409 → 保存确认 → 200，闭环成立。

## 重放：祖先闭包，而不是断点续传

失败/中断运行怎么续跑，有两个方向：

- **断点续跑**：缓存已成功节点的 outputs，从失败节点继续——但跨版本图变化时引用完整性是噩梦，还得决定人工节点怎么补批；
- **重放式重跑**：从目标节点沿入边求全部祖先，在当前发布图上把这段子图重跑一遍。

v0.9 选后者，自洽得多。闭包计算就是一次反向可达：

```ts
function computeReplayClosure(compiled, targetNodeId) {
  const closure = new Set();
  const stack = [targetNodeId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (closure.has(cur)) continue;
    closure.add(cur);
    for (const pred of compiled.predecessors.get(cur) ?? []) stack.push(pred);
  }
  return closure;
}
```

引擎加两个可选参数支持子图执行：`onlyNodeIds`（闭包外节点直接发 skipped，不执行）和 `replayTargetId`（目标节点跑完直接 run_succeeded，输出取目标节点——节点重放不一定连通到 end）。

新 run 记录与原 run 的关联：

```text
parent_run_id      → 原 run
resumed_from_node  → 重放起点（整体重跑为 null）
```

运行记录中心据此展示「重放自 fetch」/「整体重跑」的来源链。内部 API `POST /api/flows/runs/:id/replay { nodeId? }`：整体重跑省略 nodeId，从失败节点重放时由运行列表自动给出失败节点 id（只对 failed/interrupted 行暴露入口）。重放始终是 **manual 触发**——人从 UI 发起、可走内联审批，不复用原 api 调用的无人值守身份，权限语义清晰。

## 运行记录中心

`/flows/runs` 把所有运行收进一张表：来源徽章（人工/对话/API/MCP）、状态（含 interrupted 独立样式）、版本、时间、重放关联、行内操作（失败/中断行显示「重放节点」，所有行可「重跑」）。列表 3 秒轮询，queued/running 行会自动收敛。行点击跳编辑器并带 `?run=<id>` 深链，自动打开执行面板回放节点时间线。

## 一条贯穿始终的安全原则

回看这四块——门控、快照、重确认、重放身份——背后是同一条原则：**权限决策必须在有人（或有人早先明确授权）的时刻做出，执行链路本身不拥有任何危险工具的默认通行证。** read 放行是因为读无害；白名单是用户逐项点过的；桌面工具永远要活人；重放要回到 manual 链路。默认值一律朝最保守方向，能力需要显式打开。

至此 v0.9 的功能闭环完整：执行可恢复、调用有标准协议、危险操作有闸门、失败运行可重放。
