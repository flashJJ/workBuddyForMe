# 触发器对话框与运行中心文案

后端能力再完整，如果用户找不到入口，功能等于不存在。这一版在流程编辑器工具栏加了一个「触发」按钮，并把三种事件来源写进运行中心。

## 一、入口

工具栏原本已有「服务」（端点）与「定时」。新增 Zap 图标的「触发」，未发布时禁用并提示先发布。三个入口形成清晰的分层：

- 服务：同步调用；
- 定时：按时间；
- 触发：按事件。

## 二、对话框结构

`TriggerDialog` 只做四件事：

1. 列出当前触发器：名称、类型图标、启停、最近触发时间、删除；
2. 新建 Webhook：只填名称，创建成功后展示完整 URL 与一次性 Secret；
3. 新建文件监听：目录、扩展名、是否递归；
4. 错误与成功提示统一走 toast。

Secret 展示区有明确的警示文案：「仅显示一次，关闭后无法再次查看」，并提供复制按钮。这个区域只在本次创建成功后出现，刷新或重新打开对话框就不再显示。

## 三、为什么不做乐观更新

启停与删除都走请求成功后再 invalidate 查询。触发器状态会影响后台监听器，乐观更新会让 UI 短暂显示与真实监听不一致的状态；本地请求很快，没必要用一致性换那几十毫秒。

## 四、运行中心补齐历史缺口

运行中心的 trigger 文案此前只有 `manual/chat/api/mcp`，`schedule` 一直显示原始值。这一版统一补齐：

```ts
const TRIGGER_KEYS = {
  manual: 'flows.runs.trigger.manual',
  chat: 'flows.runs.trigger.chat',
  api: 'flows.runs.trigger.api',
  mcp: 'flows.runs.trigger.mcp',
  schedule: 'flows.runs.trigger.schedule',
  webhook: 'flows.runs.trigger.webhook',
  file: 'flows.runs.trigger.file',
};
```

中英文案同步增加「定时 / Webhook / 文件」。这类「新增枚举忘了补前端映射」的问题很难被类型系统发现，因为映射表通常声明为 `Record<string, MessageKey>`。更稳妥的做法是让映射表用 `Record<FlowTrigger, MessageKey>`，新增枚举值会直接编译失败。

## 五、i18n 组织

触发器文案单独成文件，再合并进 `flowEditor` 命名空间：

```ts
import { zhFlowEditorTrigger } from './flow-editor-trigger';
export const zhFlowEditor = {
  // ...
  trigger: zhFlowEditorTrigger,
};
```

这样文案与功能同目录演进，避免主文案文件继续膨胀。
