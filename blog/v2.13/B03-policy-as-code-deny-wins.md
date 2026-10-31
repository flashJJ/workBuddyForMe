# 策略即代码：把「谁在什么范围能做什么」写成一份可求值的 JSON

早期的权限规则散落在三处：工具自己的级别标注、权限服务里的授权记录、门控里的 if 分支。想调整「这个团队不允许访问某类域名」，得改代码、发版；想解释「刚才为什么被拒绝」，只能翻日志猜。

这一版把规则收进设置里的一份 JSON——`agentPolicy`。它不引入新表，不做表达式语言，只做五类白名单 / 黑名单与一组限额。目标很朴素：**规则可读、可求值、可哈希、可审计**。

## 策略的形状

精简后的结构如下（字段名即设置里的键）：

```ts
interface AgentPolicy {
  version: 1;
  defaultMode: AgentPermissionMode;
  unattended: {
    allowedModes: AgentPermissionMode[];
    maxConcurrentRuns: number;        // 1..3
  };
  tools: {
    deny: string[];                   // 精确名或后缀 *
    allow: string[];                  // 仅对 write 生效
    dangerAllow: string[];            // 仅 smart_approve 下对 danger 生效
  };
  paths: {
    allowedRoots: string[];
    deniedRoots: string[];
    sensitiveNames: string[];
  };
  domains: { allow: string[]; deny: string[] };
  exec: { allowCommands: string[]; denyCommands: string[] };
  limits: {
    maxSteps: number;                 // 1..50
    maxRuntimeMs: number;
    maxWritesPerRun: number;
    maxExternalCallsPerRun: number;
  };
}
```

默认值很克制：默认模式 `confirm_each`，所有 allow / deny 列表为空，敏感目录带一份默认清单，步数上限沿用旧口径不放大。

## 七层求值，deny 永远优先

策略不是唯一输入。一次工具调用要穿过七层，顺序固定：

```text
1. 系统硬拒绝
2. 策略 deny（工具 / 路径 / 域名 / 命令）
3. 权限记录 deny
4. 模式处置（allow / ask / deny）
5. 策略 allow（仅 write；danger 仅 smart_approve + dangerAllow）
6. 持久授权（助手 / 全局 / 本任务）
7. 默认：read 允许，write / danger 询问
```

任何一层返回 deny，直接短路，后面不再求值。这就是「deny wins」的全部含义，也解释了为什么策略 allow 不能把 `confirm_each` 下对 danger 的询问变成允许——第 4 层已经给出了 ask，第 5 层没有权限覆盖它。

反过来，策略 deny 可以压过一切放宽：即使本次是 `full_access`，命中了工具 deny 也照样拒绝。放宽的是模式，不是治理。

## 匹配语法：只做最小的一层

规则语言刻意保持最小，避免变成半个防火墙配置语言：

| 维度 | 匹配方式 | 明确不支持 |
|---|---|---|
| 工具 | 精确名，或后缀 `*`（如 `mcp:*`） | 正则、中间通配 |
| 域名 | 完整域名，或 `*.` 前缀；端口必须显式 | 隐式端口、路径级规则 |
| 命令 | 可执行文件名或绝对路径 | 参数级匹配 |
| 路径 | 根目录前缀；敏感目录按名称识别 | 通配符表达式 |

「参数级匹配」不做，是权衡后的选择：参数是模型生成的，规则一旦细到参数，维护成本会超过收益，而且很容易写出「看起来禁止、实际绕得过」的规则。参数层面的同一性交给审批绑定。

## 求值结果是一等对象

每次求值不返回一个布尔值，而是返回一个结构化决策：

```ts
interface PolicyDecision {
  decision: 'allow' | 'deny' | 'ask';
  reasonCode: string;   // POLICY_DENY / MODE_ASK / GRANT_ALLOW ...
  layer: 'hard' | 'policy' | 'permission' | 'mode' | 'grant' | 'default';
  matchedRule?: string;
}
```

这三个字段直接决定两件事：界面能显示「是策略拒绝，还是模式要求确认」；审计能记录命中的规则与所在层。没有它们，所有拒绝在用户眼里都是同一句「不允许」，排查等于从零开始。审计只记录 `policy_hash` 与 `matchedRule`，不写完整参数值。参数可能含路径、查询词甚至敏感内容，账本不应该变成第二份业务数据。

## 哈希与运行快照

策略保存时做三件事：Zod 校验、计算 `policyHash`、写入变更审计。

```text
policyHash = sha256(canonicalJson(policy))
```

这里的关键不是 sha256，而是 canonicalJson。普通 `JSON.stringify` 的输出依赖对象键的构造顺序：同一个策略，从设置页保存和从 JSON 导入，键顺序可能不同，字节串就不同，哈希也就不同。一旦哈希不稳定，审批绑定会把「同一个策略」误判成漂移。

所以规范化函数必须满足：键递归排序、数组保持原序、拒绝非有限数字与函数。它被抽成 shared 包里的纯函数，能力包签名也改为复用它，原有域前缀与签名字段剔除逻辑保持不变；黄金向量覆盖键序、数组、Unicode、转义、数字与缺省字段。哈希计算本身留在 core 与 database 侧，shared 只提供纯函数。

运行创建时，当前策略快照写进任务记录。任务详情对外只暴露 `policyHash`，不直接吐快照内容——需要复现时，拿快照重放求值即可。

## 读取钳制：坏配置不能把求值器打挂

设置是用户可编辑的 JSON，也可能是旧版本留下的。读取时做三层兜底：

- 非法值回落默认（比如 `maxSteps` 写成字符串，按默认值处理）；
- 未知字段直接丢弃，不进入求值；
- 规则总数超过 50 条，或单条超过 256 字符，保存直接拒绝。

保存路径还要过 Zod；JSON 导入失败不落盘。这一套「读时宽松、写时严格」的组合，保证求值器永远拿到一个形状合法的策略，不会因为一条手写错的规则让整个 Agent 无法启动。

## 策略变更也要留痕

策略保存成功后追加一条 `policy_updated` 事件，带旧哈希与新哈希。它不保存完整策略快照——设置页随时能查当前值，审计只需要证明「什么时候、从哪个版本变到了哪个版本」。

这条事件属于旁路：写入失败只告警，不阻断保存。原因是策略保存是用户主动操作，fail-closed 会让一个审计故障变成「设置改不了」。与之相对，策略拒绝、审批结果、绑定漂移这些事件写入失败会直接拒绝操作，因为它们是治理判断本身。这个差异必须写清楚，否则「fail-closed」会变成一句万能口号：不同事件的失败代价不同，策略也应该不同。

## 一个反直觉的结论

策略 allow 看起来是「放行名单」，但它只放宽 write；对 danger 基本无效。高危操作的放宽只有两条路径：`smart_approve` 命中 `dangerAllow`，或本次 `full_access`。桌面控制类工具连第一条都不适用。这个设计让 `dangerAllow` 的语义变得很窄：它是一份「可以在智能审批下自动执行的高危工具」清单，不是「所有高危都放行」。窄有窄的好处——配置错了，后果有上限。

## 收口

策略即代码的价值不在「把 if 搬到 JSON」，而在于四个可验证的性质：求值顺序固定、deny 优先、哈希稳定、变更留痕。它们共同回答一个问题——当一次调用被拒绝时，能不能准确说出是哪一层、哪条规则、哪个版本的策略拒绝了它。

下一篇讲审批绑定：策略决定「允许不允许」，绑定决定「批准的和执行的是不是同一个操作」。
