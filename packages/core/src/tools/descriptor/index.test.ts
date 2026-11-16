import { describe, expect, it } from 'vitest';
import type { Tool } from '../types';
import { describeMcpTool, describeTool } from './index';

const tool = {
  name: 'demo_tool',
  description: '演示工具',
  parameters: { type: 'object', properties: { q: { type: 'string' } } },
  permission: 'write',
  alwaysConfirm: true,
  run: async () => ({ ok: true, output: '', summary: '' }),
} satisfies Tool;

describe('工具描述符适配（v4.3 M5）', () => {
  it('内置工具映射为统一字段', () => {
    const descriptor = describeTool(tool);
    expect(descriptor).toMatchObject({
      name: 'demo_tool',
      source: 'builtin',
      permissions: ['write'],
      readOnly: false,
      alwaysConfirm: true,
    });
    expect(descriptor.inputSchema).toEqual(tool.parameters);
  });

  it('未标注权限默认 read，流程来源透传', () => {
    const { permission: _permission, alwaysConfirm: _confirm, ...readOnly } = tool;
    const descriptor = describeTool({ ...readOnly, run: tool.run }, 'flow');
    expect(descriptor.source).toBe('flow');
    expect(descriptor.permissions).toEqual(['read']);
    expect(descriptor.readOnly).toBe(true);
    expect(descriptor.alwaysConfirm).toBe(false);
  });

  it('MCP 工具映射为只读描述符', () => {
    const descriptor = describeMcpTool({
      serverName: 'fs',
      name: 'read_file',
      qualifiedName: 'mcp:fs:read_file',
      description: '',
      inputSchema: { type: 'object', properties: {} },
    });
    expect(descriptor).toMatchObject({
      name: 'mcp:fs:read_file',
      source: 'mcp:fs',
      permissions: ['read'],
      readOnly: true,
      description: 'MCP 工具',
    });
  });
});
