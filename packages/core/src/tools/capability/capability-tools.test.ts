import { describe, expect, it, vi } from 'vitest';
import type { CapabilityCatalogEntry, CapabilityView } from '@wbfm/shared/schemas';
import type { CapabilityInventoryItem } from '../../capabilities/catalog/types';
import type { ToolContext } from '../types';
import { ToolArgError } from '../types';
import { capabilityInstallTool, capabilityListTool, capabilitySearchTool } from './capability-tools';

const entry: CapabilityCatalogEntry = {
  id: 'com.example.sample.workflow',
  name: '示例工作流：一页摘要',
  kind: 'workflow',
  description: '安装后立即发布',
  tags: ['示例', '工作流'],
  permissions: ['workflow:install'],
  effects: ['发布为工作流工具'],
  source: 'bundled',
  version: '1.0.0',
  toolNames: [],
  installStrategy: 'bundled-pack',
};

const view: CapabilityView = {
  id: entry.id,
  version: '1.0.0',
  kind: 'workflow',
  name: entry.name,
  description: entry.description,
  permissions: entry.permissions,
  status: 'enabled',
  effectRef: 'wf-1',
  lastError: null,
  installedAt: '2026-11-02T00:00:00.000Z',
  updatedAt: '2026-11-02T00:00:00.000Z',
};

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    knowledgeBaseIds: [],
    retrieve: async () => [],
    ...overrides,
  };
}

describe('capability_search 工具', () => {
  it('只读权限；未装配目录时明确拒绝', async () => {
    expect(capabilitySearchTool.permission).toBe('read');
    const result = await capabilitySearchTool.run({ query: '工作流' }, context());
    expect(result.ok).toBe(false);
    expect(result.output).toContain('能力目录不可用');
  });

  it('输出候选的名称、id、权限、效果与状态', async () => {
    const searchCapabilities = vi.fn(() => [
      { ...entry, installed: false, status: null },
      {
        ...entry,
        id: 'com.example.sample.event-script',
        name: '示例剧本：晚安小仪式',
        installed: true,
        status: 'enabled' as const,
      },
    ]);
    const result = await capabilitySearchTool.run(
      { query: '示例' },
      context({ searchCapabilities }),
    );
    expect(result.ok).toBe(true);
    expect(searchCapabilities).toHaveBeenCalledWith({ query: '示例' });
    expect(result.output).toContain('示例工作流：一页摘要（workflow）');
    expect(result.output).toContain('权限：workflow:install');
    expect(result.output).toContain('状态：未安装');
    expect(result.output).toContain('状态：已安装并启用');
    expect(result.summary).toBe('2 个候选');
  });

  it('kind 过滤参数透传；无匹配返回可继续的建议', async () => {
    const searchCapabilities = vi.fn(() => []);
    const result = await capabilitySearchTool.run(
      { query: '示例', kind: 'skill' },
      context({ searchCapabilities }),
    );
    expect(searchCapabilities).toHaveBeenCalledWith({ query: '示例', kind: 'skill' });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('没有匹配');
  });

  it('参数非法抛 ToolArgError', async () => {
    await expect(capabilitySearchTool.run({ query: '' }, context())).rejects.toBeInstanceOf(
      ToolArgError,
    );
    await expect(
      capabilitySearchTool.run({ query: '示例', kind: 'unknown' }, context()),
    ).rejects.toBeInstanceOf(ToolArgError);
  });
});

describe('capability_list 工具（v2.30）', () => {
  const inventory: CapabilityInventoryItem[] = [
    {
      id: 'com.example.sample.skill',
      name: '示例技能：日报',
      kind: 'skill',
      version: '1.0.0',
      status: 'enabled',
      permissions: ['skill:install'],
      effects: ['新增技能提示词'],
      toolNames: ['current_time'],
      source: 'bundled',
      installStrategy: 'bundled-pack',
      signatureStatus: 'valid',
      installedAt: '2026-11-02T00:00:00.000Z',
    },
    {
      id: 'com.example.sample.mcp',
      name: '示例 MCP',
      kind: 'mcp',
      version: '0.9.0',
      status: 'disabled',
      permissions: ['mcp:connect'],
      effects: [],
      toolNames: [],
      source: 'local',
      installStrategy: 'manual',
      installedAt: '2026-11-03T00:00:00.000Z',
    },
  ];

  it('只读权限；未装配能力服务时明确拒绝', async () => {
    expect(capabilityListTool.permission).toBe('read');
    const result = await capabilityListTool.run({}, context());
    expect(result.ok).toBe(false);
    expect(result.output).toContain('能力清单不可用');
  });

  it('输出已安装能力的 id、状态、版本、权限、效果、工具与签名', async () => {
    const listCapabilities = vi.fn(() => inventory);
    const result = await capabilityListTool.run({}, context({ listCapabilities }));
    expect(result.ok).toBe(true);
    expect(result.output).toContain('示例技能：日报（skill）');
    expect(result.output).toContain('id: com.example.sample.skill');
    expect(result.output).toContain('状态：已启用 · 版本：1.0.0');
    expect(result.output).toContain('权限：skill:install');
    expect(result.output).toContain('效果：新增技能提示词');
    expect(result.output).toContain('工具：current_time');
    expect(result.output).toContain('签名：valid');
    expect(result.output).toContain('签名：未检查');
    expect(result.summary).toBe('2 个能力');
  });

  it('kind / status 过滤生效；无匹配返回可读说明', async () => {
    const listCapabilities = vi.fn(() => inventory);
    const enabled = await capabilityListTool.run(
      { status: 'enabled' },
      context({ listCapabilities }),
    );
    expect(enabled.output).toContain('示例技能：日报');
    expect(enabled.output).not.toContain('示例 MCP');
    expect(enabled.summary).toBe('1 个能力');

    const mcp = await capabilityListTool.run({ kind: 'mcp' }, context({ listCapabilities }));
    expect(mcp.output).toContain('示例 MCP');
    expect(mcp.output).not.toContain('示例技能：日报');

    const none = await capabilityListTool.run(
      { kind: 'report-widget' },
      context({ listCapabilities }),
    );
    expect(none.ok).toBe(true);
    expect(none.output).toContain('当前没有匹配的已安装能力');
  });

  it('超过 30 条截断并提示缩小范围', async () => {
    const many = Array.from({ length: 31 }, (_, index) => ({
      ...inventory[0]!,
      id: `com.example.sample.${index}`,
      name: `示例 ${index}`,
    }));
    const result = await capabilityListTool.run({}, context({ listCapabilities: () => many }));
    expect(result.ok).toBe(true);
    expect(result.summary).toBe('31 个能力');
    expect(result.output).toContain('另有 1 项未展示');
  });

  it('参数非法抛 ToolArgError', async () => {
    await expect(
      capabilityListTool.run({ status: 'unknown' }, context({ listCapabilities: () => [] })),
    ).rejects.toBeInstanceOf(ToolArgError);
  });
});

describe('capability_install 工具', () => {
  it('write 权限；未装配能力服务时明确拒绝', async () => {
    expect(capabilityInstallTool.permission).toBe('write');
    const result = await capabilityInstallTool.run({ catalogId: entry.id }, context());
    expect(result.ok).toBe(false);
    expect(result.output).toContain('能力安装不可用');
  });

  it('安装成功后把只读工具加入下一轮白名单', async () => {
    const installCapability = vi.fn(() => ({ entry, capability: view }));
    const bindTools = vi.fn(() => ({ added: ['current_time'], skipped: ['mouse_click'] }));
    const result = await capabilityInstallTool.run(
      { catalogId: entry.id, reason: '需要时间工具' },
      context({ installCapability, bindTools }),
    );
    expect(result.ok).toBe(true);
    expect(installCapability).toHaveBeenCalledWith({
      catalogId: entry.id,
      reason: '需要时间工具',
    });
    expect(bindTools).toHaveBeenCalledWith(entry.toolNames);
    expect(result.output).toContain('已安装并启用');
    expect(result.output).toContain('已加入当前助手（下一轮可用）：current_time');
    expect(result.output).toContain('未自动绑定（write/danger 需手动勾选）：mouse_click');
    expect(result.summary).toContain('已安装');
  });

  it('无 bindTools 时提示手动勾选', async () => {
    const entryWithTools = { ...entry, toolNames: ['current_time'] };
    const installCapability = vi.fn(() => ({ entry: entryWithTools, capability: view }));
    const result = await capabilityInstallTool.run(
      { catalogId: entry.id },
      context({ installCapability }),
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain('请到助手设置手动勾选新增工具：current_time');
  });

  it('绑定失败不影响安装成功结论', async () => {
    const installCapability = vi.fn(() => ({ entry, capability: view }));
    const bindTools = vi.fn(() => {
      throw new Error('助手不存在');
    });
    const result = await capabilityInstallTool.run(
      { catalogId: entry.id },
      context({ installCapability, bindTools }),
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain('已安装并启用');
    expect(result.output).toContain('工具自动绑定失败（能力已安装）：助手不存在');
  });

  it('安装失败返回 ok=false 且不抛出', async () => {
    const installCapability = vi.fn(() => {
      throw new Error('依赖未安装：x');
    });
    const result = await capabilityInstallTool.run({ catalogId: entry.id }, context({ installCapability }));
    expect(result.ok).toBe(false);
    expect(result.output).toContain('安装失败：依赖未安装：x');
  });
});
