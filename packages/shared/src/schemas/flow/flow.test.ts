import { describe, expect, it } from 'vitest';
import { FLOW_AGENT_KNOWLEDGE_BASES_MAX, FLOW_INPUTS_MAX } from '../../constants';
import {
  buildFlowInputJsonSchema,
  buildFlowToolName,
  flowAgentConfigSchema,
  flowGraphSchema,
  flowStartConfigSchema,
  isFlowToolName,
  parseFlowToolName,
  workflowCreateSchema,
} from './flow';

describe('flow 图契约（v0.8）', () => {
  it('合法最小图通过校验，config 默认空对象', () => {
    const parsed = flowGraphSchema.parse({
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 } },
        { id: 'end', type: 'end', position: { x: 1, y: 2 } },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'end' }],
    });
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.nodes[0]?.config).toEqual({});
  });

  it('condition 出边必须带合法句柄', () => {
    const good = flowGraphSchema.safeParse({
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 } },
        { id: 'cond', type: 'condition', position: { x: 0, y: 0 } },
        { id: 'end', type: 'end', position: { x: 0, y: 0 } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'cond' },
        { id: 'e2', source: 'cond', sourceHandle: 'maybe', target: 'end' },
      ],
    });
    expect(good.success).toBe(false);
  });

  it('v4.23 节点重试/超时策略：合法值通过，越界拒绝', () => {
    const base = {
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 } },
        {
          id: 'end',
          type: 'end',
          position: { x: 1, y: 2 },
          config: { retry: { maxAttempts: 3, backoffMs: 500 }, timeoutMs: 5_000 },
        },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'end' }],
    };
    expect(flowGraphSchema.safeParse(base).success).toBe(true);
    const withRetry = (retry: unknown) => ({
      ...base,
      nodes: [base.nodes[0], { ...base.nodes[1], config: { retry } }],
    });
    expect(flowGraphSchema.safeParse(withRetry({ maxAttempts: 0 })).success).toBe(false);
    expect(flowGraphSchema.safeParse(withRetry({ maxAttempts: 6 })).success).toBe(false);
    expect(flowGraphSchema.safeParse(withRetry({ backoffMs: 50 })).success).toBe(false);
    const withTimeout = (timeoutMs: unknown) => ({
      ...base,
      nodes: [base.nodes[0], { ...base.nodes[1], config: { timeoutMs } }],
    });
    expect(flowGraphSchema.safeParse(withTimeout(500)).success).toBe(false);
    expect(flowGraphSchema.safeParse(withTimeout(1_000)).success).toBe(true);
  });

  it('节点 id 必须标识符安全，节点数少于 2 拒绝', () => {
    const badId = flowGraphSchema.safeParse({
      nodes: [{ id: 'bad id', type: 'start', position: { x: 0, y: 0 } }],
      edges: [],
    });
    expect(badId.success).toBe(false);
  });

  it('v4.22 并行度：缺省省略，1–4 整数合法，越界拒绝', () => {
    const base = {
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 } },
        { id: 'end', type: 'end', position: { x: 1, y: 2 } },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'end' }],
    };
    expect(flowGraphSchema.parse(base).parallelism).toBeUndefined();
    expect(flowGraphSchema.safeParse({ ...base, parallelism: 1 }).success).toBe(true);
    expect(flowGraphSchema.safeParse({ ...base, parallelism: 4 }).success).toBe(true);
    expect(flowGraphSchema.safeParse({ ...base, parallelism: 0 }).success).toBe(false);
    expect(flowGraphSchema.safeParse({ ...base, parallelism: 5 }).success).toBe(false);
    expect(flowGraphSchema.safeParse({ ...base, parallelism: 1.5 }).success).toBe(false);
  });

  it('工作流创建请求：名称必填，描述默认空串', () => {
    const wf = workflowCreateSchema.parse({ name: '研究助手' });
    expect(wf.description).toBe('');
    expect(workflowCreateSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('start 节点入参契约', () => {
  it('inputs 缺省为空数组', () => {
    expect(flowStartConfigSchema.parse({}).inputs).toEqual([]);
  });

  it('入参字段转 function JSON Schema：类型映射 + 必填收集', () => {
    const config = flowStartConfigSchema.parse({
      inputs: [
        { name: 'topic', type: 'string', required: true, description: '主题' },
        { name: 'count', type: 'number', required: false, default: 3 },
        { name: 'urgent', type: 'boolean', required: true },
      ],
    });
    const schema = buildFlowInputJsonSchema(config.inputs);
    expect(schema).toMatchObject({
      type: 'object',
      properties: {
        topic: { type: 'string', description: '主题' },
        count: { type: 'number' },
        urgent: { type: 'boolean' },
      },
      required: ['topic', 'urgent'],
      additionalProperties: false,
    });
  });

  it('非法参数名被拒', () => {
    expect(
      flowStartConfigSchema.safeParse({ inputs: [{ name: '1bad', type: 'string' }] }).success,
    ).toBe(false);
  });

  it('入参数量上限来自共享常量（B-62）', () => {
    const inputs = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ name: `arg${i}`, type: 'string' as const }));
    expect(flowStartConfigSchema.safeParse({ inputs: inputs(FLOW_INPUTS_MAX) }).success).toBe(true);
    expect(flowStartConfigSchema.safeParse({ inputs: inputs(FLOW_INPUTS_MAX + 1) }).success).toBe(
      false,
    );
  });
});

describe('agent 节点配置契约', () => {
  it('知识库数量上限来自共享常量（B-62）', () => {
    const kbs = (n: number) => Array.from({ length: n }, (_, i) => `kb-${i}`);
    expect(
      flowAgentConfigSchema.safeParse({
        goal: '整理资料',
        knowledgeBaseIds: kbs(FLOW_AGENT_KNOWLEDGE_BASES_MAX),
      }).success,
    ).toBe(true);
    expect(
      flowAgentConfigSchema.safeParse({
        goal: '整理资料',
        knowledgeBaseIds: kbs(FLOW_AGENT_KNOWLEDGE_BASES_MAX + 1),
      }).success,
    ).toBe(false);
  });
});

describe('flow 工具命名', () => {
  it('构建/识别/解析往返', () => {
    const name = buildFlowToolName('abc-123');
    expect(name).toBe('flow:abc-123');
    expect(isFlowToolName(name)).toBe(true);
    expect(isFlowToolName('current_time')).toBe(false);
    expect(parseFlowToolName(name)).toEqual({ workflowId: 'abc-123' });
    expect(parseFlowToolName('mcp:x:y')).toBeNull();
    expect(parseFlowToolName('flow:')).toBeNull();
  });
});
