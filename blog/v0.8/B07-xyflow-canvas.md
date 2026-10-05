---
title: "在 React Flow 上画确定的图：7 类自定义节点、分支双句柄与诊断定位实战"
series: "WorkBuddy For Me v0.8 技术拆解"
number: "B07"
tags: ["workbuddy", "xyflow", "react-flow", "canvas", "dnd", "custom-nodes", "tailwind"]
date: "2026-10"
---

## 为什么是 @xyflow/react 12

可视化节点编辑器自己写是个深坑：缩放/平移坐标系、连线的贝塞尔路径计算、小地图、多选/框选、触屏兼容、海量节点的虚拟化。选型时几乎没有第二个正经候选——Langflow 源码级对照用的也是 reactflow v12，API 稳定、文档完善、只做画布不做状态管理捆绑。

落地时给自己定了两条纪律：

1. **只用官方基础能力**（自定义节点/Handle/BaseEdge/MiniMap/Controls/Background），不引它的额外 examples 状态库；
2. **不引入 zustand**（路线图里白纸黑字）。服务端态归 React Query，画布态用 React Flow 原生受控数组 + 回调，项目状态管理口径保持单一。

最终新增依赖就这一个：`@xyflow/react ^12.12`。

---

## 受控模型：nodes/edges 就是编辑器的状态

React Flow 同时支持受控和非受控。v0.8 全程受控——画布元素是存在编辑器组件里的两个 state：

```tsx
const [nodes, setNodes] = useState<FlowCanvasNode[]>([]);
const [edges, setEdges] = useState<FlowCanvasEdge[]>([]);

<ReactFlow
  nodes={nodes}
  edges={edges}
  onNodesChange={(changes) => setNodes(prev => applyNodeChanges(changes, prev))}
  onEdgesChange={(changes) => setEdges(prev => applyEdgeChanges(changes, prev))}
  onConnect={handleConnect}
  nodeTypes={flowNodeTypes}
  edgeTypes={flowEdgeTypes}
/>
```

`applyNodeChanges/applyEdgeChanges` 是官方提供的纯函数，把「拖动/选择/删除/尺寸变化」一批 change 规范地应用到数组上。受控的好处是所有业务动作（添加节点、改配置、删节点连带删边、加载服务端图）都只是普通的 setState，且「脏检查」可以挂在变化类型上：

```ts
const onNodesChange = (changes) => {
  if (changes.some(c => c.type === 'position' || c.type === 'remove')) setDirty(true);
  setNodes(prev => applyNodeChanges(changes, prev));
};
```

领域图（FlowGraph）和画布元素之间用两个纯函数转换，序列化边界非常干净：

```ts
fromDomain(graph)  // FlowGraph → { nodes, edges }（加载时）
toDomain(nodes, edges, viewport)  // → FlowGraph（保存/校验时）
```

画布节点 data 里只放一样业务东西：`{ config: Record<string, unknown> }`。运行状态**不进 nodes 数组**——这是个重要决定，下一节展开。

---

## 运行态为什么用 Context 下发而不是写进 nodes

试运行时节点要高亮：运行中蓝圈、成功绿圈、失败红圈、跳过变灰、等待人工琥珀色脉冲。最直觉的做法是把 status 合进每个 node.data，每次 SSE 来一个事件就 setNodes 更新对应节点。

但这会和 React Flow 的内部状态打架：SSE 高频 setNodes 会触发受控数组重新协调，可能打断用户正在进行的拖拽/缩放；而且运行态数据混进图数据后，「保存」时还得小心别把状态序列化进 graph_json。

实际方案是开一个 React Context：

```tsx
interface FlowStatusContextValue {
  nodeStatus: Record<string, FlowNodeExecStatus>;
  errorNodeIds: ReadonlySet<string>;
  warningNodeIds: ReadonlySet<string>;
  errorEdgeIds: ReadonlySet<string>;
}
```

Provider 包在 ReactFlow 外层，自定义节点/边用 `useContext` 读自己的状态。试运行事件只更新一个 Context 对象（每秒也就几次更新），**nodes 数组引用完全不变**，React Flow 的拖拽/连线交互零干扰；保存图时 nodes 里也天然没有任何运行时态。诊断红框（校验结果）和运行高亮共用这一个通道，视觉层统一。

---

## 7 类节点：一个 Shell 工厂 + 一个特化组件

7 类节点的外观 90% 相同：图标 + 标题 + 配置摘要 + 状态描边 + 左入右出的连接点。所以抽象出一个 NodeShell，再用工厂生成 6 个标准节点：

```tsx
function makeNode(type: FlowNodeType) {
  return function FlowNode({ id, data, selected }: NodeProps) {
    return (
      <NodeShell id={id} type={type} config={data.config} selected={selected}>
        {type !== 'start' && <TargetHandle />}   {/* start 无入边 */}
        {type !== 'end' && <SourceHandle />}     {/* end 无出边 */}
      </NodeShell>
    );
  };
}
export const flowNodeTypes = {
  start: makeNode('start'), end: makeNode('end'), llm: makeNode('llm'),
  knowledgeSearch: makeNode('knowledgeSearch'), tool: makeNode('tool'),
  condition: ConditionNode, human: makeNode('human'),
};
```

Shell 里的摘要行（`configSummary`）让节点在画布上自带「配置好了没」的信息密度：llm 显示提示词前 30 字、knowledgeSearch 显示检索词、tool 显示工具名、condition 显示「全部 · 2 条规则」、human 显示审核说明。不用选中节点就能扫出整张图哪里还空着。

节点标题取 `config.label || 类型默认名`——作者可以给节点起业务名（「生成研究结论」），这个名字同时出现在画布、试运行时间线、对话工具卡片的子步骤上，是跨三层的同一份展示数据。

唯一需要特化的是 condition，它右侧有**两个带 id 的 Handle**：

```tsx
<Handle id="true" type="source" position={Position.Right}
        style={{ top: '32%' }} className="!bg-emerald-500" />
<Handle id="false" type="source" position={Position.Right}
        style={{ top: '72%' }} className="!bg-red-400" />
```

Handle 的 id（'true'/'false'）就是连线 sourceHandle 的来源，和编译器要求的分支句柄同名——前端拖出的边无需任何转换就能满足图契约。

---

## 分支边：自定义 BaseEdge + 标签渲染器

普通边用 React Flow 默认贝塞尔即可；分支边要带颜色和「是/否」标签，自定义一个 edge type：

```tsx
export function BranchEdge(props: EdgeProps) {
  const isTrue = props.sourceHandleId === 'true';
  const color = hasError ? '#ef4444' : isTrue ? '#10b981' : '#f87171';
  const [path, labelX, labelY] = getBezierPath({ ... });
  return (
    <>
      <BaseEdge path={path} style={{ stroke: color, strokeDasharray: hasError ? '6 3' : undefined }} />
      <EdgeLabelRenderer>
        <span style={{ transform: `translate(${labelX}px,${labelY}px)`, color, borderColor: color }}>
          {isTrue ? '是' : '否'}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}
```

连线建立时根据 source 节点是不是 condition 决定要不要给边打上 `type: 'branch'`，以及 sourceHandle 透传。EdgeLabelRenderer 把标签渲染在 SVG 坐标系外的普通 div 层，能用 Tailwind 正常排版且不拦截连线交互（pointer-events-none）。

---

## 拖拽建图：HTML5 DnD 与 React Flow 屏幕坐标

左侧面板节点用原生 HTML5 dragstart 写 MIME，画布 onDrop 时换算坐标：

```tsx
// 面板
onDragStart={(e) => e.dataTransfer.setData('application/x-wbfm-flow-node', type)}

// 画布
onDrop={(event) => {
  const type = event.dataTransfer.getData(MIME);
  const bounds = wrapper.getBoundingClientRect();
  onDropNode(type, {
    x: event.clientX - bounds.left - 100,  // 减去节点宽度一半，落点居中
    y: event.clientY - bounds.top - 30,
  });
}}
```

React Flow 的坐标在无缩放平移时等于相对画布容器的像素坐标；v0.8 不做缩放补偿（落点精度对这种积木摆放足够，且官方 useReactFlow.screenToFlowCenter 是备选）。面板同时支持**单击添加**（落在视口中心加一点随机抖动），降低不会拖拽的新用户门槛。start/end 不出现在面板里——它们由新建画布时自动生成且不可删除（删除键和按钮都拦），保证编译器的端点要求在交互层就难以被破坏。

连线合法性用 `isValidConnection` 兜底：不可连入 start、不可从 end 连出、不可自连。这些规则编译器也会查，但在拖线那一刻就禁止（连线视觉上不吸附）比保存时再报错体验好得多——**能在交互层阻止的错误，不要留给校验层**。

---

## 选中即配置：右侧抽屉与节点删除的连带清理

点节点 → onNodeClick 设置 selectedId → 右侧 ConfigPanel 渲染该类型的专属表单（7 种表单按类型分派）。配置表单的每次 onChange 直接写回 `nodes[i].data.config`，并置 dirty=true。这里没有「编辑草稿 → 应用」两步——画布上的节点摘要实时反映输入，所见即所得。

删除走两条路径（键盘 Delete / React Flow 的 onNodesDelete / 面板删除按钮），统一做连带清理：

```ts
const deleteNodes = (ids) => {
  const set = new Set(ids);
  setNodes(prev => prev.filter(n => !set.has(n.id)));
  setEdges(prev => prev.filter(e => !set.has(e.source) && !set.has(e.target))); // 边级联
};
```

节点没了边必须一起没，否则立刻制造一批「端点不存在」的编译错误让用户困惑。start/end 的删除在 `onBeforeDelete` 钩子里过滤掉。

---

## 校验结果在画布上发光

编译器诊断（B03）到前端后变成三个 Set 下发进 FlowStatusContext：

```tsx
errorNodeIds: new Set(diagnostics.filter(d => d.severity === 'error' && d.nodeId).map(d => d.nodeId!)),
errorEdgeIds: new Set(diagnostics.filter(d => d.edgeId).map(d => d.edgeId!)),
```

NodeShell 命中 errorNodeIds 就加 `border-dashed border-red-500 ring-1`；BranchEdge 命中 errorEdgeIds 变红虚线。底部悬浮诊断条列出全部问题，点任意一条：

```ts
const node = nodes.find(n => n.id === d.nodeId);
setCenter(node.position.x + 104, node.position.y + 40, { zoom: 1.1, duration: 400 });
onSelectNode(d.nodeId);  // 顺带打开配置抽屉
```

`useReactFlow().setCenter` 做 400ms 平滑飞行动画，错误节点居中、自动选中打开配置——「校验」从一个静态结果变成了一次导航。没有 nodeId 的全局诊断（如 start 数量错误）只在列表展示，不显示定位箭头。

---

## 视觉与交互的几个小决定

- 每类节点一个强调色（start 绿 / llm 紫 / 检索天蓝 / tool 琥珀 / condition 粉 / human 橙 / end 灰），节点图标、小地图配色、面板图标三处共用同一张元数据表，颜色语言全应用一致；
- 节点固定宽 208px，内容超出一律 truncate——画布信息密度优先，详情在抽屉里看，避免节点大小参差导致连线丑陋；
- 引入 `@xyflow/react/dist/style.css` 后用 Tailwind 类覆盖其默认主题（Handle 大小、attribution 用 proOptions 隐藏），不写全局 CSS 覆盖文件；
- 画布容器 flex 布局占满工具栏与试运行面板之间的区域，MiniMap 放右下角不挡 Controls。

---

## 小结

- @xyflow/react 只用基础能力，nodes/edges 全程受控、apply*Changes 落状态，不引入 zustand；
- 运行态与诊断态走 Context 而非 node.data，避免高频 SSE 更新干扰 React Flow 交互、污染保存数据；
- 6 个标准节点一个 Shell 工厂 + condition 特化双 Handle；Handle id 与图契约的分支句柄同名；
- 分支边自定义 BaseEdge/EdgeLabelRenderer，颜色与标签直接映射 sourceHandle；
- 拖拽 MIME + 点击添加双通道；连接规则、端点保护尽量在交互层拦截；删节点级联清边；
- 诊断变 Set 下发描边，点击诊断 setCenter 飞行定位并打开配置，校验成为导航。

画得出、连得对之后，下一篇 B08 讲底部的试运行面板：怎么把 B06 的 SSE 事件流组织成可调试的时间线、人工/危险工具怎样在面板里原地处理，以及那两个真机踩出来的 EventSource 坑在 UI 侧的连锁反应。
