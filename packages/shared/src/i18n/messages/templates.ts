/**
 * templates 命名空间（v2.4 P0-2 模板可触达）：统一模板入口的骨架文案。
 *
 * 只承载「界面骨架」文案（标题/徽标/按钮/提示）；模板的名称与一句说明是**数据**
 * （与内置对象同名同源，见 apps/web/src/lib/templates/starter-templates.ts），不走本字典。
 */
export const zhTemplates = {
  title: '内置模板',
  badge: '内置',
  recommended: '推荐先用',
  launcher: '内置模板（{count}）',
  start: '以此开始',
  /** 复制类模板（知识库 / 工作流）的副本命名 */
  cloneSuffix: '{name} 副本',
  group: {
    research: '研究',
    office: '办公',
  },
  toast: {
    cloned: '已复制「{name}」，可在副本上继续修改',
    cloneFailed: '复制模板失败',
    enabled: '已启用「{name}」',
    enabledAlready: '「{name}」已处于启用状态',
    enableFailed: '启用失败',
    missing: '模板「{name}」已不存在，请重新扫描技能目录',
  },
};

export const enTemplates = {
  title: 'Built-in templates',
  badge: 'Built-in',
  recommended: 'Recommended',
  launcher: 'Built-in templates ({count})',
  start: 'Start with this',
  cloneSuffix: '{name} copy',
  group: {
    research: 'Research',
    office: 'Office',
  },
  toast: {
    cloned: 'Copied “{name}”; edit the copy freely',
    cloneFailed: 'Failed to copy the template',
    enabled: 'Enabled “{name}”',
    enabledAlready: '“{name}” is already enabled',
    enableFailed: 'Failed to enable',
    missing: 'Template “{name}” no longer exists — rescan the skills directory',
  },
};
