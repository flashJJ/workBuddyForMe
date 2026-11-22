# 用已有的两张表，重建一个可继续执行的现场

做持久化执行，第一反应往往是「加一张 checkpoint 表」。但在一个已经有运行记录与节点执行记录的本地应用里，现场其实一直都在。

这一版没有新增任何存储，checkpoint 只是一个读取函数。

## 一、先看数据库里有什么

一次流程运行会写两处：

```text
workflow_runs
  input_json      ← start 节点的入参（流程调用参数）
  status          ← queued / running / waiting_human / ...
  version         ← 运行固定使用的图版本

node_executions
  run_id, node_id
  status          ← running / succeeded / failed / skipped
  inputs_json     ← 引用解析后的实际入参
  outputs_json    ← 节点产出
  started_at, finished_at, duration_ms
```

关键在最后一项：节点成功时，产出已经落库。而且落库发生在事件发出之前，所以「事件看到了成功」几乎等价于「数据库里已有成功」。

既然产出都在，缺的只是「怎么读回来」。

## 二、checkpoint 的形状

它被定义得很小：

```ts
interface FlowCheckpoint {
  runId: string;
  nodes: Array<{
    nodeId: string;
    status: 'succeeded' | 'skipped';
    outputs?: Record<string, unknown>;
  }>;
  lastSucceededNodeId: string | null;
}
```

只有两类节点进入检查点：

- `succeeded`：要复用产出；
- `skipped`：要恢复「这条分支不通」的事实。

`running` 不进入——它代表中断时正在执行的节点，是否需要重跑由恢复策略决定，不由 checkpoint 决定。

`failed` 也不进入——失败的运行本来就不该自动续跑，除非用户显式重放。

## 三、同一节点多行怎么办

历史原因，一个节点可能有多条执行记录：重试、续跑、早期的重放都可能复用或新增行。

`loadCheckpoint` 的规则是：按落库顺序遍历，同一 `nodeId` 后者覆盖前者。这样续跑拿到的一定是「最后一次执行的结果」，而不是最早那次。

这看起来是个小细节，但它决定了一个常见 bug 是否会出现：如果取了第一条，续跑可能把已经被修正的旧产出重新注入作用域。

## 四、重建执行现场的三步

引擎拿到 checkpoint 后，只做三件事：

### 1. 恢复节点状态

```text
succeeded → state = succeeded
skipped   → state = skipped
```

状态影响两件事：调度时是否跳过、后继节点的活性判断。

### 2. 恢复作用域

```ts
scope[nodeId] = { outputs }        // 普通节点
scope[start]  = { params, outputs } // start 额外挂入参
```

这一步让下游节点的 `{{$nodes.A.outputs.text}}` 引用可以照常解析。start 的 `params` 来自 `workflow_runs.input_json`，不在节点产出里，所以需要单独补。

### 3. 恢复条件分支

condition 节点的产出里有 `result`。续跑时按它重新激活对应出边：

```text
result === true  → true 分支边
result === false → false 分支边
```

如果没有这一步，续跑会把所有条件分支都当成「未命中」，下游节点被错误跳过。

## 五、为什么要静默

引擎在续跑时不会重发历史事件。已落定节点在循环里直接 `continue`，既不 `node_started`，也不 `node_succeeded`。原因有三个：前端时间线按事件累积，重发会重复；事件流同时用于落库，重发会重复写节点记录；运行详情应反映「这次运行发生过什么」。历史事件已在上一进程发过并落库，订阅方走落库回放即可。

## 六、续跑不产生重复行

有个容易忽略的问题：`run-store` 在收到 `node_started` 时会 `addNodeExecution`，并在内存里维护 `nodeId → executionId` 映射。

新进程启动时这个映射是空的。如果续跑重执行一个中断节点，会插入第二行，导致同一节点出现多条 `running` 记录。

解决方式是：续跑时先把已有执行记录预加载进映射：

```ts
initialIds = listNodeExecutions(runId).map((n) => [n.nodeId, n.id]);
createFlowRunStore(runs, initialIds);
```

这样重执行会更新原行，而不是新增。

## 七、一个边界：end 已经成功

崩溃可能发生在「end 节点成功落库」与「运行终态落库」之间。这时 checkpoint 里有一个成功的 end，但运行还是 running。

续跑时如果只是静默跳过，循环结束会报「未经过任何 end」，把一个实际上成功的运行标成失败。

所以引擎在初始化后先检查：checkpoint 里是否已有成功 end。如果有，直接按拓扑序最早的 end 输出收尾。这是一条很小的分支，但它对应的是真实的时间窗口。

## 八、小结

重建现场不需要新表，只需要回答三个问题：哪些节点已经成功、产出是什么；哪些分支已经确定不通；start 的入参从哪里补。

答案都在现有数据里。checkpoint 的价值不在存储，而在于把「执行进度」变成一种可以读取、可以判断、可以复用的形状。

下一篇讲判断：同样是中断，哪些运行值得自动续跑，哪些必须停下来。
