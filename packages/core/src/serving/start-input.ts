import {
  flowStartConfigSchema,
  type FlowGraph,
  type FlowInputField,
} from '@wbfm/shared';

/**
 * v0.9 公开调用入参校验：请求体即 start 节点入参记录。
 * 与对话链路同一套字段声明（flowStartConfigSchema），但公开入口必须严格：
 * 必填缺失/类型不符 → 调用方错误（路由层转 422），默认值补全，未声明字段剥离。
 */
export class StartInputValidationError extends Error {
  readonly details: Array<{ path: string; message: string }>;

  constructor(details: Array<{ path: string; message: string }>) {
    super('流程入参校验失败');
    this.name = 'StartInputValidationError';
    this.details = details;
  }
}

/** 从发布图读取 start 节点声明的入参字段（无 start 节点/坏配置视为零入参） */
export function readFlowStartFields(graph: FlowGraph): FlowInputField[] {
  const start = graph.nodes.find((node) => node.type === 'start');
  if (!start) return [];
  const parsed = flowStartConfigSchema.safeParse(start.config);
  return parsed.success ? parsed.data.inputs : [];
}

function typeOf(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

/**
 * 校验并归一化公开 invoke 请求体：
 * - 仅保留 start 节点声明的字段；
 * - required 且无默认值的字段必须出现且类型正确；
 * - 缺省字段回填 default；类型与声明不符（含 null）一律拒绝。
 */
export function validateFlowStartInput(
  fields: FlowInputField[],
  body: unknown,
): Record<string, unknown> {
  const args = (body !== undefined && body !== null && typeof body === 'object'
    ? body
    : {}) as Record<string, unknown>;
  const details: Array<{ path: string; message: string }> = [];
  const input: Record<string, unknown> = {};

  for (const field of fields) {
    const present = Object.prototype.hasOwnProperty.call(args, field.name);
    if (!present) {
      if (field.default !== undefined) {
        input[field.name] = field.default;
      } else if (field.required) {
        details.push({ path: field.name, message: `缺少必填参数：${field.name}` });
      }
      continue;
    }
    const value = args[field.name];
    if (value === null || typeOf(value) !== field.type) {
      details.push({
        path: field.name,
        message: `参数 ${field.name} 类型应为 ${field.type}，实际为 ${typeOf(value)}`,
      });
      continue;
    }
    if (field.type === 'string' && typeof value === 'string' && value.length > 100_000) {
      details.push({ path: field.name, message: `参数 ${field.name} 超出长度上限（100000 字符）` });
      continue;
    }
    input[field.name] = value;
  }

  if (details.length > 0) throw new StartInputValidationError(details);
  return input;
}
