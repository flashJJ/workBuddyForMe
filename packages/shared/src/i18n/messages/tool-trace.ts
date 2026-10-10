/** toolTrace 命名空间：对话消息内的工具调用徽章与过程明细 */
export const zhToolTrace = {
  tools: {
    currentTime: '查询当前时间',
    knowledgeSearch: '检索知识库',
    fetchWebpage: '读取网页',
    screenSnapshot: '屏幕截图',
    mouseMove: '鼠标移动',
    mouseClick: '鼠标点击',
    mouseScroll: '鼠标滚轮',
    keyboardType: '键盘输入',
    keyboardPress: '组合键',
    windowList: '列出窗口',
    uiaList: '枚举窗口控件',
    windowFocus: '激活窗口',
    appLaunch: '启动应用',
  },
  flow: '工作流',
  source: {
    builtin: '内置',
    unknown: '未知',
    flow: '流程',
  },
  permission: {
    read: '读',
    write: '写',
    danger: '危险',
  },
  substepsAria: '{name}子步骤',
  detail: {
    toolName: '工具名',
    source: '来源',
    permission: '权限',
    args: '参数',
    result: '结果',
  },
};

export const enToolTrace = {
  tools: {
    currentTime: 'Get current time',
    knowledgeSearch: 'Search knowledge base',
    fetchWebpage: 'Fetch webpage',
    screenSnapshot: 'Screen snapshot',
    mouseMove: 'Move mouse',
    mouseClick: 'Click mouse',
    mouseScroll: 'Scroll mouse',
    keyboardType: 'Type text',
    keyboardPress: 'Key combo',
    windowList: 'List windows',
    uiaList: 'List UI controls',
    windowFocus: 'Focus window',
    appLaunch: 'Launch app',
  },
  flow: 'Workflow',
  source: {
    builtin: 'Built-in',
    unknown: 'Unknown',
    flow: 'Flow',
  },
  permission: {
    read: 'Read',
    write: 'Write',
    danger: 'Danger',
  },
  substepsAria: '{name} substeps',
  detail: {
    toolName: 'Tool',
    source: 'Source',
    permission: 'Permission',
    args: 'Args',
    result: 'Result',
  },
};
