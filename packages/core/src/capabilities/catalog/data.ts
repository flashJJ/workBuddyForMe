import type { CapabilityCatalogEntry } from '@wbfm/shared/schemas';

/**
 * v2.17 M4：内置精选能力目录。
 * 与 samples.ts 的示例包 id 一一对应，不开放任意远程下载；
 * MCP 预置安装留待后续版本（目录当前只收 bundled-pack）。
 */
export const BUNDLED_CAPABILITY_CATALOG: readonly CapabilityCatalogEntry[] = [
  {
    id: 'com.wbfm.sample.capability-demo',
    name: '能力包示例技能',
    kind: 'skill',
    description: '安装后出现一个可用 current_time 的示例技能；停用即移除。',
    tags: ['示例', '技能', '时间', '提示词', 'current_time'],
    permissions: ['skill:install'],
    effects: ['注册技能与提示词模板（对话时注入 system 提示）'],
    source: 'bundled',
    version: '1.0.0',
    toolNames: ['current_time'],
    installStrategy: 'bundled-pack',
  },
  {
    id: 'com.example.sample.workflow',
    name: '示例工作流：一页摘要',
    kind: 'workflow',
    description: '安装后立即发布，可在工作流列表试运行；停用后保留运行历史。',
    tags: ['示例', '工作流', '摘要', '文本'],
    permissions: ['workflow:install'],
    effects: ['发布为工作流工具（自动出现在对话工具表）'],
    source: 'bundled',
    version: '1.0.0',
    toolNames: [],
    installStrategy: 'bundled-pack',
  },
  {
    id: 'com.example.sample.pet-action',
    name: '示例动作：打招呼',
    kind: 'pet-action',
    description: '安装后进入动作池；停用即移除。',
    tags: ['示例', '动作', '桌宠', '形象', '打招呼'],
    permissions: ['pet:action'],
    effects: ['加入桌宠动作池（播放内置示例动作）'],
    source: 'bundled',
    version: '1.0.0',
    toolNames: [],
    installStrategy: 'bundled-pack',
  },
  {
    id: 'com.example.sample.event-script',
    name: '示例剧本：晚安小仪式',
    kind: 'event-script',
    description: '安装后短语触发剧本；停用后不再触发。',
    tags: ['示例', '剧本', '事件', '晚安', '短语触发'],
    permissions: ['events:write'],
    effects: ['注册短语触发剧本（命中「晚安」等短语时播报）'],
    source: 'bundled',
    version: '1.0.0',
    toolNames: [],
    installStrategy: 'bundled-pack',
  },
  {
    id: 'com.example.sample.report-widget',
    name: '示例卡片：任务成功率',
    kind: 'report-widget',
    description: '安装后报告页出现卡片；停用即移除。',
    tags: ['示例', '报告', '卡片', '指标', '成功率'],
    permissions: ['report:widget'],
    effects: ['报告页新增声明式指标卡片'],
    source: 'bundled',
    version: '1.0.0',
    toolNames: [],
    installStrategy: 'bundled-pack',
  },
];
