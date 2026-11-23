import { describe, expect, it } from 'vitest';
import { flowTriggerCreateSchema, flowTriggerUpdateSchema } from './trigger';

describe('v4.25 触发器 schema', () => {
  it('webhook 创建只需 kind，名称可选', () => {
    expect(flowTriggerCreateSchema.parse({ kind: 'webhook' })).toEqual({ kind: 'webhook' });
    expect(flowTriggerCreateSchema.parse({ kind: 'webhook', name: '  回调  ' })).toEqual({
      kind: 'webhook',
      name: '回调',
    });
  });

  it('file 创建要求绝对路径与合法扩展名', () => {
    const ok = flowTriggerCreateSchema.safeParse({
      kind: 'file',
      config: { path: 'E:\\notes', extensions: ['md', 'txt'] },
    });
    expect(ok.success).toBe(true);

    const bad = flowTriggerCreateSchema.safeParse({
      kind: 'file',
      config: { path: 'E:\\notes', extensions: ['.MD'] },
    });
    expect(bad.success).toBe(false);
  });

  it('更新至少提供一个字段', () => {
    expect(flowTriggerUpdateSchema.safeParse({}).success).toBe(false);
    expect(flowTriggerUpdateSchema.safeParse({ enabled: false }).success).toBe(true);
    expect(flowTriggerUpdateSchema.safeParse({ name: '' }).success).toBe(true);
  });
});
