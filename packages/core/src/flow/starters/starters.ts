import type { FlowGraph, FlowNode, FlowEdge } from '@wbfm/shared/schemas';

/**
 * v0.8 P0-7：内置 starter flows（首次启动播种并发布，模式对齐 builtin skills）。
 * 固定 id 保证幂等：已存在则跳过，用户可自行删除/改名，升级不覆盖用户改动。
 */
export interface StarterFlowDef {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  graph: FlowGraph;
}

function node(
  id: string,
  type: FlowNode['type'],
  x: number,
  y: number,
  config: Record<string, unknown>,
): FlowNode {
  return { id, type, position: { x, y }, config };
}

function edge(id: string, source: string, target: string, sourceHandle?: 'true' | 'false'): FlowEdge {
  return { id, source, target, ...(sourceHandle ? { sourceHandle } : {}) };
}

/** ①资料研究助手：检索 → 条件分流（无资料直接提示）→ 生成 → 人工审核 → 输出 */
const researchAssistant: StarterFlowDef = {
  id: 'b0000001-0000-4000-8000-000000000001',
  name: '资料研究助手',
  description:
    '资料研究助手：输入研究主题，先在指定知识库检索资料；未命中时直接提示，命中后基于资料生成研究结论并经人工审核输出。参数：topic（研究主题）。',
  icon: 'library',
  color: 'sky',
  graph: {
    nodes: [
      node('start', 'start', 0, 240, {
        label: '开始',
        inputs: [
          { name: 'topic', type: 'string', required: true, description: '要研究的主题' },
        ],
      }),
      node('search', 'knowledgeSearch', 280, 240, {
        label: '资料检索',
        knowledgeBaseId: '',
        query: '{{$nodes.start.params.topic}}',
        topK: 4,
      }),
      node('check', 'condition', 560, 240, {
        label: '是否命中资料',
        rules: [{ left: '{{$nodes.search.outputs.context}}', op: 'isEmpty' }],
        match: 'all',
      }),
      node('end_empty', 'end', 860, 60, {
        label: '无资料提示',
        output:
          '未检索到与「{{$nodes.start.params.topic}}」相关的资料。请先在「资料检索」节点选择知识库，或更换研究主题后重试。',
      }),
      node('write', 'llm', 860, 340, {
        label: '生成研究结论',
        modelId: '',
        system: '你是严谨的资料研究助手，只能依据给定参考资料作答，不得编造资料之外的事实。',
        user:
          '研究主题：{{$nodes.start.params.topic}}\n\n参考资料：\n{{$nodes.search.outputs.context}}\n\n请输出一份简明的研究结论：先列 3-5 条要点，再给一句总体判断。',
      }),
      node('review', 'human', 1180, 340, {
        label: '人工审核',
        prompt: '研究结论已生成，请确认内容是否可以采纳；驳回后流程仍会输出当前草稿。',
      }),
      node('end_answer', 'end', 1460, 340, {
        label: '输出结论',
        output: '{{$nodes.write.outputs.text}}',
      }),
    ],
    edges: [
      edge('e_start_search', 'start', 'search'),
      edge('e_search_check', 'search', 'check'),
      edge('e_check_empty', 'check', 'end_empty', 'true'),
      edge('e_check_write', 'check', 'write', 'false'),
      edge('e_write_review', 'write', 'review'),
      edge('e_review_answer', 'review', 'end_answer'),
    ],
  },
};

/** ②周报流水线：要点 → 生成草稿 → 人工确认（演示对话调用；无人值守时自动继续） */
const weeklyReport: StarterFlowDef = {
  id: 'b0000002-0000-4000-8000-000000000002',
  name: '周报流水线',
  description:
    '周报流水线：把零散的本周工作要点整理成结构化周报草稿（本周成果/进行中/风险求助/下周计划），并经人工确认。参数：notes（本周工作要点，可留空生成模板）。',
  icon: 'file-text',
  color: 'violet',
  graph: {
    nodes: [
      node('start', 'start', 0, 200, {
        label: '开始',
        inputs: [
          { name: 'notes', type: 'string', required: false, description: '本周工作要点（可留空）' },
        ],
      }),
      node('draft', 'llm', 300, 200, {
        label: '生成周报草稿',
        modelId: '',
        system: '你是资深行政助理，擅长把零散的工作记录整理成结构清晰、表述专业的周报。',
        user:
          '本周工作要点：\n{{$nodes.start.params.notes}}\n\n请整理成一份周报，包含四个小节：本周成果、进行中事项、风险与求助、下周计划。若要点为空，请直接输出一份可填写的周报模板。',
      }),
      node('review', 'human', 620, 200, {
        label: '人工确认',
        prompt: '周报草稿已生成，请确认内容是否准确完整。',
      }),
      node('end', 'end', 900, 200, {
        label: '输出周报',
        output: '{{$nodes.draft.outputs.text}}',
      }),
    ],
    edges: [
      edge('e_start_draft', 'start', 'draft'),
      edge('e_draft_review', 'draft', 'review'),
      edge('e_review_end', 'review', 'end'),
    ],
  },
};

/** ③网页摘要器：fetch_webpage（danger 门控）→ LLM 要点总结 */
const webSummary: StarterFlowDef = {
  id: 'b0000003-0000-4000-8000-000000000003',
  name: '网页摘要器',
  description:
    '网页摘要器：读取指定 URL 的公开网页正文（读取网页为高危操作，试运行时需授权），并用 3-5 条要点总结核心内容。参数：url（完整网页链接）。',
  icon: 'globe',
  color: 'amber',
  graph: {
    nodes: [
      node('start', 'start', 0, 200, {
        label: '开始',
        inputs: [
          { name: 'url', type: 'string', required: true, description: '要摘要的网页链接（http/https）' },
        ],
      }),
      node('fetch', 'tool', 300, 200, {
        label: '读取网页',
        toolName: 'fetch_webpage',
        args: { url: '{{$nodes.start.params.url}}' },
      }),
      node('summarize', 'llm', 620, 200, {
        label: '生成要点摘要',
        modelId: '',
        system: '你是网页内容摘要助手，只依据网页正文总结，不补充页面中没有的信息。',
        user:
          '网页正文：\n{{$nodes.fetch.outputs.output}}\n\n请用 3-5 条要点总结该网页的核心内容，每条不超过 50 字。',
      }),
      node('end', 'end', 940, 200, {
        label: '输出摘要',
        output: '{{$nodes.summarize.outputs.text}}',
      }),
    ],
    edges: [
      edge('e_start_fetch', 'start', 'fetch'),
      edge('e_fetch_summarize', 'fetch', 'summarize'),
      edge('e_summarize_end', 'summarize', 'end'),
    ],
  },
};

export const STARTER_FLOWS: readonly StarterFlowDef[] = [
  researchAssistant,
  weeklyReport,
  webSummary,
];
