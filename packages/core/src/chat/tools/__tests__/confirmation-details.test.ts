import { describe, expect, it } from 'vitest';
import type { ToolContext } from '../../../tools/types';
import { confirmationDetailsOf } from '../loop/confirmation-details';

function context(): ToolContext {
  return {
    knowledgeBaseIds: [],
    retrieve: async () => [],
    listCapabilities: () => [],
  };
}

describe('confirmationDetailsOf（审批详情边界）', () => {
  it('模型传入 null / 标量参数时不抛错，返回 undefined', () => {
    // JSON.parse('null') 会得到 null；直接取属性会中断整轮对话
    expect(confirmationDetailsOf(context(), 'capability_install', null)).toBeUndefined();
    expect(confirmationDetailsOf(context(), 'capability_install', 'null')).toBeUndefined();
    expect(confirmationDetailsOf(context(), 'capability_install', 42)).toBeUndefined();
    expect(confirmationDetailsOf(context(), 'capability_install', undefined)).toBeUndefined();
  });

  it('缺少 catalogId 或目录未命中时返回 undefined', () => {
    expect(confirmationDetailsOf(context(), 'capability_install', {})).toBeUndefined();
    expect(
      confirmationDetailsOf(context(), 'capability_install', { catalogId: 'missing' }),
    ).toBeUndefined();
  });

  it('目录命中时返回审批快照', () => {
    const ctx = context();
    ctx.listCapabilities = () => [
      {
        id: 'cap-1',
        name: '演示能力',
        kind: 'skill',
        version: '1.0.0',
        status: 'enabled',
        installedAt: '2026-01-01T00:00:00.000Z',
        source: 'bundled',
        installStrategy: 'manual',
        permissions: ['skill:install'],
        effects: ['登记技能'],
        toolNames: ['demo_tool'],
      },
    ];
    expect(confirmationDetailsOf(ctx, 'capability_install', { catalogId: 'cap-1' })).toMatchObject({
      catalogId: 'cap-1',
      name: '演示能力',
      version: '1.0.0',
    });
  });
});
