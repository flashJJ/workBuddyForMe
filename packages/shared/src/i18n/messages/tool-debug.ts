/** toolDebug 命名空间：工具调试台（选工具/填参试跑/结果展示） */
export const zhToolDebug = {
  title: '工具调试台',
  description: '选择工具并填参试跑，不经模型/熔断/权限门控；MCP 工具超时 60s。',
  empty: '暂无可调试工具。内置工具默认可用；MCP 工具需先在「设置 → MCP」中连接服务器。',
  toolLabel: '工具',
  argsSchema: '参数 Schema',
  argsJson: '参数（JSON）',
  execute: '执行',
  executing: '执行中…',
  resultLabel: '结果',
  invalidJson: '参数不是合法 JSON',
  executeFailed: '执行失败',
  format: {
    statusOk: '状态：成功',
    statusFailed: '状态：失败',
    summary: '摘要：{summary}',
    output: '输出：',
  },
};

export const enToolDebug = {
  title: 'Tool debugger',
  description:
    'Pick a tool, fill in args and run it directly — no model, circuit breaker or permission gating; MCP tools time out after 60s.',
  empty:
    'No debuggable tools yet. Built-in tools are available by default; connect servers under “Settings → MCP” first.',
  toolLabel: 'Tool',
  argsSchema: 'Args schema',
  argsJson: 'Args (JSON)',
  execute: 'Execute',
  executing: 'Executing...',
  resultLabel: 'Result',
  invalidJson: 'Args are not valid JSON',
  executeFailed: 'Execution failed',
  format: {
    statusOk: 'Status: ok',
    statusFailed: 'Status: failed',
    summary: 'Summary: {summary}',
    output: 'Output:',
  },
};
