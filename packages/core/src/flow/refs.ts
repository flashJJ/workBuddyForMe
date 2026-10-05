import type { FlowScope } from './types';

/**
 * 工作流节点间数据引用解析（M0）。
 * 两种形态：
 * - 字符串插值：`{{$nodes.<id>.outputs.<字段路径>}}`（start 入参用 `nodes.start.params.<字段>`）；
 *   整串为单个引用时保留原始值类型，否则按字符串拼接。
 * - 整字段绑定：`{ "$ref": "nodes.<id>.outputs.<路径>" }`，对象/数组/数字原样透传。
 */

/** token：节点 id 允许 字母数字_-，字段路径为点分标识符（至少一段） */
const REF_TOKEN = /\{\{\$nodes\.([a-zA-Z0-9][\w-]*)((?:\.[a-zA-Z_][\w]*)+)\}\}/g;
/** 整串恰好一个 token（前后允许空白），命中则保留原始类型 */
const SOLE_TOKEN = /^\s*\{\{\$nodes\.[a-zA-Z0-9][\w-]*(?:\.[a-zA-Z_][\w]*)+\}\}\s*$/;
const REF_KEY = '$ref';

export class RefResolutionError extends Error {
  readonly code = 'flow/ref-resolution';
  readonly ref: string;
  constructor(ref: string, reason: string) {
    super(`工作流引用 ${ref} 无法解析：${reason}`);
    this.name = 'RefResolutionError';
    this.ref = ref;
  }
}

function deepGet(
  obj: unknown,
  keys: string[],
): { ok: true; value: unknown } | { ok: false } {
  let cur = obj;
  for (const key of keys) {
    if (cur !== null && typeof cur === 'object' && key in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      return { ok: false };
    }
  }
  return { ok: true, value: cur };
}

/** 解析裸路径（nodes.<id>.outputs|params[.<字段>]）并从作用域取值 */
function lookupPath(rawPath: string, scope: FlowScope): unknown {
  const parts = rawPath.split('.');
  if (parts.length < 3 || parts[0] !== 'nodes') {
    throw new RefResolutionError(rawPath, '路径格式应为 nodes.<节点id>.outputs|params[.<字段>]');
  }
  const nodeId = parts[1]!;
  const bucket = parts[2]!;
  if (bucket !== 'outputs' && bucket !== 'params') {
    throw new RefResolutionError(rawPath, `作用域段必须是 outputs 或 params（实际：${bucket}）`);
  }
  const nodeOutputs = scope.get(nodeId);
  if (!nodeOutputs) {
    throw new RefResolutionError(rawPath, `节点「${nodeId}」不存在或尚未执行`);
  }
  const bucketValue = (nodeOutputs as Record<string, unknown>)[bucket];
  if (bucketValue === undefined) {
    throw new RefResolutionError(rawPath, `节点「${nodeId}」没有 ${bucket} 输出`);
  }
  // 无后续字段：整体引用该作用域段（如 $ref: nodes.start.params）
  if (parts.length === 3) return bucketValue;
  const result = deepGet(bucketValue, parts.slice(3));
  if (!result.ok) {
    throw new RefResolutionError(rawPath, `字段路径在节点「${nodeId}」输出中不存在`);
  }
  return result.value;
}

function tokenToPath(nodeId: string, dottedKeys: string): string {
  return `nodes.${nodeId}.${dottedKeys.slice(1)}`;
}

/** 递归解析配置中的全部引用；未命中引用抛 RefResolutionError */
export function resolveFlowRefs(value: unknown, scope: FlowScope): unknown {
  if (typeof value === 'string') {
    if (SOLE_TOKEN.test(value)) {
      const match = REF_TOKEN.exec(value.trim());
      REF_TOKEN.lastIndex = 0;
      if (match) return lookupPath(tokenToPath(match[1]!, match[2]!), scope);
      return value;
    }
    return value.replace(REF_TOKEN, (_full, nodeId: string, dottedKeys: string) => {
      const resolved = lookupPath(tokenToPath(nodeId, dottedKeys), scope);
      return typeof resolved === 'string' ? resolved : JSON.stringify(resolved);
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveFlowRefs(item, scope));
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (REF_KEY in record && Object.keys(record).length === 1) {
      const refPath = record[REF_KEY];
      if (typeof refPath !== 'string') {
        throw new RefResolutionError(String(refPath), '$ref 必须是字符串路径');
      }
      return lookupPath(refPath, scope);
    }
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) {
      output[key] = resolveFlowRefs(item, scope);
    }
    return output;
  }
  return value;
}

/** 收集值中出现的全部引用裸路径（编译期/前端「插入变量」可复用） */
export function extractReferences(value: unknown): string[] {
  const found: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === 'string') {
      for (const match of v.matchAll(new RegExp(REF_TOKEN.source, 'g'))) {
        found.push(tokenToPath(match[1]!, match[2]!));
      }
    } else if (Array.isArray(v)) {
      v.forEach(visit);
    } else if (v !== null && typeof v === 'object') {
      const record = v as Record<string, unknown>;
      if (REF_KEY in record && Object.keys(record).length === 1 && typeof record[REF_KEY] === 'string') {
        found.push(record[REF_KEY] as string);
      } else {
        Object.values(record).forEach(visit);
      }
    }
  };
  visit(value);
  return found;
}
