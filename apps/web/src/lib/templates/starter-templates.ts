/**
 * v2.4 P0-2（M2）· 内置模板清单（web 侧单一事实源）。
 *
 * 目的：把三套 `ensure*` 已播种的内置条目统一导出为一份清单，供五个列表的模板入口
 * 与（后续）P0-1 的 firstAsk 示例问题复用；**只在 web 侧做映射，不改 packages/* 的播种实现**。
 *
 * 纪律（M0 §3）：
 * - 内置模板**只增不改、不覆盖用户改动**；
 * - 形状冻结为 `StarterTemplate`（见 M0 §3），条目冻结 15 条：知识库 3 + 工作流 6 + 技能 3 + 助手预设 3；
 * - 角色卡 6 张**不进本清单**（沿用既有内置/自建分区与「复制为自建卡」，不重写）。
 *
 * 与播种真源的对应关系（starter-templates.test.ts 做漂移守卫）：
 * - 知识库 id/name ← `STARTER_KNOWLEDGE_BASES`（@wbfm/shared/constants）
 * - 工作流 id/name ← `STARTER_FLOWS`（@wbfm/core/flow）
 * - 技能 name     ← `BUILTIN_SKILLS`（@wbfm/core/skills）
 *
 * 注：这里的 `description` 是「适用场景一句话」（卡片副文案），与内置对象的原始
 * 描述字段不同源；内置对象的**名称**保持中文原名（它就是被创建对象的真名）。
 */

export type StarterTemplateKind = 'knowledge' | 'flow' | 'skill' | 'assistant';

export interface StarterTemplate {
  kind: StarterTemplateKind;
  /** 与内置对象同 id（seed 固定 id） */
  id: string;
  name: string;
  /** 适用场景一句话 */
  description: string;
  /** 该列表「推荐先用」 */
  recommended?: boolean;
  /** 对应 M0 D5 的「以此开始」语义 */
  startAction: 'clone' | 'enable' | 'prefill';
}

/** 研究资料内置知识库固定 id（助手预设「资料研究助手」绑定用） */
export const RESEARCH_KB_ID = 'c0000000-0000-4000-8000-000000000003';

const KNOWLEDGE_TEMPLATES: StarterTemplate[] = [
  {
    kind: 'knowledge',
    id: 'c0000000-0000-4000-8000-000000000001',
    name: '产品需求',
    description: '沉淀 PRD、原型说明与验收口径，便于按需求提问与检索。',
    recommended: true,
    startAction: 'clone',
  },
  {
    kind: 'knowledge',
    id: 'c0000000-0000-4000-8000-000000000002',
    name: '会议纪要',
    description: '收纳会议纪要与逐字稿，按「结论 / 行动项」检索。',
    startAction: 'clone',
  },
  {
    kind: 'knowledge',
    id: RESEARCH_KB_ID,
    name: '研究资料',
    description: '存放行业报告、竞品与技术调研，供研究类工作流检索引用。',
    startAction: 'clone',
  },
];

const FLOW_TEMPLATES: StarterTemplate[] = [
  {
    kind: 'flow',
    id: 'b0000001-0000-4000-8000-000000000001',
    name: '资料研究助手',
    description: '给定研究主题，检索知识库并生成带依据的研究结论。',
    recommended: true,
    startAction: 'clone',
  },
  {
    kind: 'flow',
    id: 'b0000002-0000-4000-8000-000000000002',
    name: '周报流水线',
    description: '把本周零散要点整理成结构化周报草稿。',
    startAction: 'clone',
  },
  {
    kind: 'flow',
    id: 'b0000003-0000-4000-8000-000000000003',
    name: '网页摘要器',
    description: '读取网页正文并用要点总结核心内容。',
    startAction: 'clone',
  },
  {
    kind: 'flow',
    id: 'b0000004-0000-4000-8000-000000000004',
    name: '会议纪要整理',
    description: '把逐字稿整理为议题 / 结论 / 行动项 / 遗留问题。',
    startAction: 'clone',
  },
  {
    kind: 'flow',
    id: 'b0000005-0000-4000-8000-000000000005',
    name: '竞品对比',
    description: '输入对比主题与竞品清单，输出横向对比表与差异结论。',
    startAction: 'clone',
  },
  {
    kind: 'flow',
    id: 'b0000006-0000-4000-8000-000000000006',
    name: '知识库问答',
    description: '基于指定知识库检索作答，未命中时明确说明。',
    startAction: 'clone',
  },
];

const SKILL_TEMPLATES: StarterTemplate[] = [
  {
    kind: 'skill',
    id: 'weekly-report',
    name: 'weekly-report 周报生成',
    description: '按四段结构生成中文周报，可结合知识库素材。',
    recommended: true,
    startAction: 'enable',
  },
  {
    kind: 'skill',
    id: 'meeting-notes',
    name: 'meeting-notes 纪要整理',
    description: '把会议记录整理为结构化纪要（议题 / 结论 / 行动项）。',
    startAction: 'enable',
  },
  {
    kind: 'skill',
    id: 'file-search',
    name: 'file-search 文件检索',
    description: '在本地目录查找与读取文件（需先接入 filesystem MCP）。',
    startAction: 'enable',
  },
];

const ASSISTANT_TEMPLATES: StarterTemplate[] = [
  {
    kind: 'assistant',
    id: 'assistant-research',
    name: '资料研究助手',
    description: '调研先锋人设 + 研究资料知识库，适合做资料研究。',
    recommended: true,
    startAction: 'prefill',
  },
  {
    kind: 'assistant',
    id: 'assistant-weekly',
    name: '周报助手',
    description: '干练同事人设，适合把零散进展整理成周报。',
    startAction: 'prefill',
  },
  {
    kind: 'assistant',
    id: 'assistant-meeting',
    name: '会议助手',
    description: '沉稳顾问人设，适合整理会议纪要与行动项。',
    startAction: 'prefill',
  },
];

/** 冻结 15 条（顺序即列表内展示顺序，首条为「推荐先用」） */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  ...KNOWLEDGE_TEMPLATES,
  ...FLOW_TEMPLATES,
  ...SKILL_TEMPLATES,
  ...ASSISTANT_TEMPLATES,
];

/** 按类取该列表的模板（D6：模板按所属列表展示，不做跨类全局分组） */
export function templatesOfKind(kind: StarterTemplateKind): StarterTemplate[] {
  return STARTER_TEMPLATES.filter((template) => template.kind === kind);
}

/** 助手预设的绑定（M0 §3 冻结表）：角色卡 + 关联知识库 (+ 技能 name) */
export interface AssistantPresetBinding {
  /** 绑定角色卡 id（预填到新建表单） */
  cardId: string;
  /** 绑定知识库 id（预填到新建表单，可选） */
  knowledgeBaseId?: string;
  /**
   * 绑定技能 name。助手表单暂未支持「助手级技能」（P1-2 补齐），
   * 故当前仅登记、不落到表单；file-search 依赖 MCP filesystem，不作默认绑定。
   */
  skillNames: string[];
}

export const ASSISTANT_PRESET_BINDINGS: Record<string, AssistantPresetBinding> = {
  'assistant-research': { cardId: 'research-scout', knowledgeBaseId: RESEARCH_KB_ID, skillNames: [] },
  'assistant-weekly': { cardId: 'capable-colleague', skillNames: ['weekly-report'] },
  'assistant-meeting': { cardId: 'calm-advisor', skillNames: ['meeting-notes'] },
};

/** 该 id 是否为内置模板（列表内来源徽标 / 只读判定用） */
export function isStarterTemplateId(kind: StarterTemplateKind, id: string): boolean {
  return templatesOfKind(kind).some((template) => template.id === id);
}
