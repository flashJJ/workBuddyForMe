/**
 * v4.3 M5：统一工具描述符。
 *
 * 内置、MCP、流程与后续外部代理都映射到同一组只读字段；
 * 执行入口仍由 ToolRuntime 持有，本契约不参与调用与路由。
 */

import { z } from 'zod';
import { PERMISSION_LEVELS } from '../../constants';

export const toolDescriptorSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(1000).default(''),
  /** OpenAI function-calling 参数 JSON Schema */
  inputSchema: z.record(z.string(), z.unknown()),
  /** 'builtin' | 'mcp:<server>' | 'flow' | 后续外部代理来源 */
  source: z.string().trim().min(1).max(160),
  permissions: z.array(z.enum(PERMISSION_LEVELS)).min(1),
  readOnly: z.boolean(),
  alwaysConfirm: z.boolean().default(false),
});

export type ToolDescriptor = z.infer<typeof toolDescriptorSchema>;
