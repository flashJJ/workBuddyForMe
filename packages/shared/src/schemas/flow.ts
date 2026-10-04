import { z } from 'zod';
import {
  FLOW_DESCRIPTION_MAX,
  FLOW_MAX_EDGES,
  FLOW_MAX_NODES,
  FLOW_NAME_MAX,
  FLOW_NODE_ID_PATTERN,
} from '../constants';

/**
 * v0.8 Flow Studio 图结构与 API 请求契约（zod）。
 * 视图模型与 SSE 事件见 types/flow.ts。
 * 节点 config 在 M0 先以开放对象承载；M1 各节点处理器落地时
 * 细化为按 type 判别的 configSchema 联合（前端据此生成配置表单）。
 */

export const FLOW_NODE_TYPES = [
  'start',
  'llm',
  'knowledgeSearch',
  'tool',
  'condition',
  'human',
  'end',
] as const;
export type FlowNodeType = (typeof FLOW_NODE_TYPES)[number];

/** condition 节点的两个输出句柄；其余节点不允许声明 sourceHandle */
export const CONDITION_BRANCHES = ['true', 'false'] as const;
export type ConditionBranch = (typeof CONDITION_BRANCHES)[number];

/** start 节点入参类型（流程被调用时的参数） */
export const FLOW_INPUT_VALUE_TYPES = ['string', 'number', 'boolean'] as const;
export type FlowInputValueType = (typeof FLOW_INPUT_VALUE_TYPES)[number];

export const flowInputFieldSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '参数名不能为空')
    .max(40)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, '参数名需为合法标识符（字母开头）'),
  type: z.enum(FLOW_INPUT_VALUE_TYPES),
  required: z.boolean().default(true),
  default: z.unknown().optional(),
  description: z.string().trim().max(200).optional(),
});
export type FlowInputField = z.infer<typeof flowInputFieldSchema>;

const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const flowNodeSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, '节点 id 不能为空')
    .max(60)
    .regex(FLOW_NODE_ID_PATTERN, '节点 id 仅允许字母/数字/下划线/中划线，且以字母或数字开头'),
  type: z.enum(FLOW_NODE_TYPES),
  position: positionSchema,
  /** 各节点类型的配置（M1 细化为判别联合；start 节点用 inputs 字段声明入参） */
  config: z.record(z.string(), z.unknown()).default({}),
});
export type FlowNode = z.infer<typeof flowNodeSchema>;

export const flowEdgeSchema = z.object({
  id: z.string().trim().min(1).max(80),
  source: z.string().trim().min(1),
  /** 仅 condition 节点允许 true/false 句柄 */
  sourceHandle: z.enum(CONDITION_BRANCHES).optional(),
  target: z.string().trim().min(1),
});
export type FlowEdge = z.infer<typeof flowEdgeSchema>;

export const flowGraphSchema = z.object({
  nodes: z.array(flowNodeSchema).min(2, '至少需要 2 个节点').max(FLOW_MAX_NODES, `节点数上限 ${FLOW_MAX_NODES}`),
  edges: z.array(flowEdgeSchema).max(FLOW_MAX_EDGES, `连线数上限 ${FLOW_MAX_EDGES}`),
  viewport: z
    .object({ x: z.number(), y: z.number(), zoom: z.number().positive() })
    .optional(),
});
export type FlowGraph = z.infer<typeof flowGraphSchema>;

// ── API 请求契约 ──

export const workflowCreateSchema = z.object({
  name: z.string().trim().min(1, '名称不能为空').max(FLOW_NAME_MAX, `名称最长 ${FLOW_NAME_MAX} 字符`),
  description: z.string().trim().max(FLOW_DESCRIPTION_MAX).default(''),
  icon: z.string().trim().max(40).optional(),
  color: z.string().trim().max(20).optional(),
});
export type WorkflowCreateInput = z.infer<typeof workflowCreateSchema>;

/** 更新仅允许元信息；改图走 versions 接口 */
export const workflowUpdateSchema = workflowCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, '至少提供一个更新字段');
export type WorkflowUpdateInput = z.infer<typeof workflowUpdateSchema>;

/** 保存图 → 生成新版本（草稿态自增版本号） */
export const workflowVersionCreateSchema = z.object({
  graph: flowGraphSchema,
});
export type WorkflowVersionCreateInput = z.infer<typeof workflowVersionCreateSchema>;

/** 创建运行（body 即 start 节点入参） */
export const flowRunCreateSchema = z.object({
  input: z.record(z.string(), z.unknown()).default({}),
});
export type FlowRunCreateInput = z.infer<typeof flowRunCreateSchema>;

/** 人工节点提交 */
export const flowHumanSubmitSchema = z.object({
  nodeId: z.string().trim().min(1),
  approved: z.boolean(),
  values: z.record(z.string(), z.unknown()).default({}),
});
export type FlowHumanSubmitInput = z.infer<typeof flowHumanSubmitSchema>;

// ── flow 工具命名（与 mcp:<server>:<tool> 同构，core/前端共用） ──

export const FLOW_TOOL_NAMESPACE = 'flow';

/** 已发布流程在对话中的工具限定名：flow:<workflowId> */
export function buildFlowToolName(workflowId: string): string {
  return `${FLOW_TOOL_NAMESPACE}:${workflowId}`;
}

export function isFlowToolName(name: string): boolean {
  return name.startsWith(`${FLOW_TOOL_NAMESPACE}:`);
}

/** 解析 flow 限定名；非 flow 名或格式非法返回 null */
export function parseFlowToolName(name: string): { workflowId: string } | null {
  const parts = name.split(':');
  if (parts.length !== 2 || parts[0] !== FLOW_TOOL_NAMESPACE) return null;
  const workflowId = parts[1];
  if (!workflowId) return null;
  return { workflowId };
}
