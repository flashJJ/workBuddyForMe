import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_MANIFEST_FILENAME } from '@wbfm/shared/constants';
import { type SkillManifest } from '@wbfm/shared/types';

/**
 * 内置示例技能（v0.6 M3）：随包分发的模板示范。
 * 首次启动播种到数据根 skills/ 目录；用户可直接编辑/删除磁盘上的 manifest，
 * 播种只在文件缺失时写入，不覆盖用户改动。
 */

export const BUILTIN_WEEKLY_REPORT: SkillManifest = {
  name: 'weekly-report',
  description: '按「本周进展 / 数据与结果 / 问题与风险 / 下周计划」四段结构生成中文周报，可结合知识库检索工作素材。',
  version: '1.0.0',
  permissions: ['read'],
  promptTemplates: [
    {
      name: '周报生成流程',
      order: 0,
      content: [
        '当用户要求生成周报（或本周工作总结）时，按以下流程执行：',
        '1. 若助手绑定了知识库，先用 knowledge_search 检索本周相关的文档与记录作为素材；',
        '2. 按固定结构输出：## 本周进展（按事项分条，突出结果）→ ## 数据与结果（可量化的指标）→ ## 问题与风险（阻塞点与应对）→ ## 下周计划（按优先级排序）；',
        '3. 语言风格：简洁、结果导向，每条不超过两句，避免流水账；',
        '4. 素材不足的小节明确标注「（待补充）」，不要编造数据或事实。',
      ].join('\n'),
    },
  ],
  allowedTools: ['knowledge_search'],
  examples: [
    {
      title: '生成周报',
      userQuery: '帮我写一份本周周报',
      expectedBehavior: '先检索知识库素材，再按四段结构输出周报，素材缺失处标注待补充',
    },
  ],
  author: 'WorkBuddyForMe 内置',
};

export const BUILTIN_MEETING_NOTES: SkillManifest = {
  name: 'meeting-notes',
  description: '把会议逐字稿或散乱笔记整理为结构化纪要：议题 / 结论 / 行动项（负责人+截止时间）/ 遗留问题。',
  version: '1.0.0',
  permissions: ['read'],
  promptTemplates: [
    {
      name: '纪要整理流程',
      order: 0,
      content: [
        '当用户提供会议逐字稿、聊天记录或散乱笔记并要求整理纪要时，按以下结构输出：',
        '## 会议议题（列出讨论的主题）',
        '## 结论与共识（已达成一致的结论，逐条列出）',
        '## 行动项（Markdown 表格：事项 / 负责人 / 截止时间；未明确的标「待定」）',
        '## 遗留问题（未解决、需后续讨论的问题）',
        '整理原则：忠于原始内容，不臆造结论；口语表达改写为书面语；行动项必须能追溯到原文。',
      ].join('\n'),
    },
  ],
  allowedTools: [],
  examples: [
    {
      title: '整理纪要',
      userQuery: '这是今天的会议记录，帮我整理成纪要：……',
      expectedBehavior: '输出议题/结论/行动项/遗留问题四段结构，行动项含负责人与截止时间',
    },
  ],
  author: 'WorkBuddyForMe 内置',
};

export const BUILTIN_FILE_SEARCH: SkillManifest = {
  name: 'file-search',
  description: '在本地指定目录中查找与读取文件。需先在「设置 → MCP」中添加 filesystem MCP 服务器并指向目标根目录，再在助手表单的「技能」里勾选本技能（不勾选=跟随全局启用）。',
  version: '1.0.0',
  permissions: ['read'],
  promptTemplates: [
    {
      name: '文件检索流程',
      order: 0,
      content: [
        '当用户要求查找或阅读本地文件时，按以下流程执行：',
        '1. 若助手已启用 filesystem MCP 工具（list_directory / read_file / search_files 等），先调用列出目标目录；',
        '2. 根据文件名、扩展名与关键词匹配用户意图，必要时用 read_file 读取候选文件；',
        '3. 汇总结果：返回命中文件路径与片段，不整份输出大文件；超出上下文时按摘要+片段裁剪；',
        '4. 若未挂载 filesystem MCP 服务器，明确提示用户在「设置 → MCP」中添加后再试，不要假装能访问磁盘。',
      ].join('\n'),
    },
  ],
  allowedTools: [],
  examples: [
    {
      title: '查找文件',
      userQuery: '帮我找一下 D 盘 docs 目录下的 README',
      expectedBehavior: '调用 list_directory/read_file，返回命中文件路径与片段；未挂载时提示用户去设置中添加',
    },
  ],
  author: 'WorkBuddyForMe 内置',
};

/**
 * v2.18 M2：图表技能（精简自 Diagram Design，MIT）。
 * 只负责选类型/整理数据/设计规则；SVG 由 `diagram_render` 模板生成，模型不手写 SVG。
 */
export const BUILTIN_DIAGRAM_DESIGN: SkillManifest = {
  name: 'diagram-design',
  description:
    '把结构与数据画成图表：架构/流程/时序/状态机/ER/时间线/四象限/泳道/柱状图/折线图。基于 Diagram Design（MIT）精简，输出自包含 HTML。',
  version: '1.0.0',
  permissions: ['write'],
  promptTemplates: [
    {
      name: '图表生成流程',
      order: 0,
      content: [
        '当用户要求画图、做架构图/流程图/时序图/状态图/ER 图/时间线/四象限/泳道/柱状图/折线图时：',
        '1. 先判断意图：结构关系用 architecture/flow/sequence/state/er/swimlane；时间用 timeline；比较/定位用 quadrant/bar/line。',
        '2. 用一句话说明选择的类型、画布尺寸与主要节点/数据；用户没有指定时用 doc-inline。',
        '3. 只调用 diagram_render，传 type、title、size（可选）、data；不要手写 SVG/HTML，也不要自己计算布局。',
        '4. data 要完整：结构图的 nodes 必须有唯一 id 与 label，edges 的 from/to 必须引用已存在的节点；时序图 actors/messages、ER entities/relations、泳道 lanes/steps 同理。',
        '5. 数据图必须是有限数字：bar 的 categories/value、line 的 labels 与每条 series.values 长度一致；空数组、缺值、NaN/Infinity 不要提交。',
        '6. 若 diagram_render 报“数据不合法”，按错误提示修正后重试一次；仍失败就如实说明，不要伪造图表。',
        '7. 超出 10 类的图表先说明本版不支持，建议改用表格/文字；不要用 diagram_render 硬套类型。',
      ].join('\n'),
    },
    {
      name: '图表设计规范',
      order: 1,
      content: [
        '设计规则（来自 Diagram Design，MIT，已精简）：',
        '- 删减优先：每个节点只表达一个概念；两个总是一起出现的节点应合并。',
        '- 密度 4/10：超过 9 个节点优先拆成两张图；超过 20 个节点直接拒绝并建议拆分。',
        '- 焦点色只用 1–2 个节点；其余用中性色。不要暗色+青紫光、不要给所有节点同尺寸卡片、不要阴影。',
        '- 文字要短：节点 label ≤18 字、边 label ≤12 字；长说明放 description 或图外正文。',
        '- 图必须有标题；标题写“这张图回答什么问题”，不要写“架构图示例”。',
        '- 产物是自包含 HTML（内联 SVG），不依赖外链字体/图片/脚本；中文字体走系统字体栈。',
        '- 归因：技能基于 Diagram Design v2.6（MIT）精简，保留上游版权与许可声明。',
      ].join('\n'),
    },
  ],
  allowedTools: ['diagram_render'],
  examples: [
    {
      title: '画架构图',
      userQuery: '画一张当前系统的架构图：Web、Core、Database 三层',
      expectedBehavior: '选择 architecture，调用 diagram_render 传 nodes/edges，返回可预览/下载的 HTML 产物',
    },
    {
      title: '画季度销量柱状图',
      userQuery: '把 Q1-Q4 的销量画成柱状图：120、150、180、210',
      expectedBehavior: '选择 bar，传 categories，数值校验后生成图表产物',
    },
  ],
  author: 'WorkBuddyForMe 内置（基于 Diagram Design, MIT）',
};

export const BUILTIN_SKILLS: SkillManifest[] = [
  BUILTIN_WEEKLY_REPORT,
  BUILTIN_MEETING_NOTES,
  BUILTIN_FILE_SEARCH,
  BUILTIN_DIAGRAM_DESIGN,
];

/** 幂等播种：内置示例技能写入技能目录（manifest 已存在则跳过，保留用户改动） */
export function ensureBuiltinSkills(skillsDir: string): void {
  for (const skill of BUILTIN_SKILLS) {
    const manifestPath = join(skillsDir, skill.name, SKILL_MANIFEST_FILENAME);
    if (existsSync(manifestPath)) continue;
    mkdirSync(join(skillsDir, skill.name), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(skill, null, 2) + '\n', 'utf8');
  }
}
