import { describe, expect, it } from 'vitest';
import { MCP_CATALOG, catalogByTier, missingCatalogFields } from '../mcp-presets';

const TOKEN_PATTERN = /\{\{[a-zA-Z0-9_]+\}\}/g;

function tokensOf(text: string): string[] {
  return text.match(TOKEN_PATTERN) ?? [];
}

describe('MCP 能力目录', () => {
  it('id 与服务器名唯一，传输字段完整', () => {
    expect(new Set(MCP_CATALOG.map((entry) => entry.id)).size).toBe(MCP_CATALOG.length);
    expect(new Set(MCP_CATALOG.map((entry) => entry.name)).size).toBe(MCP_CATALOG.length);
    for (const entry of MCP_CATALOG) {
      expect(entry.title.trim()).not.toBe('');
      expect(entry.docsUrl.startsWith('https://')).toBe(true);
      if (entry.transport === 'stdio') expect(entry.command?.trim()).toBeTruthy();
      if (entry.transport === 'http') expect(entry.url?.startsWith('https://')).toBe(true);
    }
  });

  it('所有占位符都有对应字段声明', () => {
    for (const entry of MCP_CATALOG) {
      const declared = new Set((entry.fields ?? []).map((field) => field.token));
      const used = [
        ...(entry.args ?? []).flatMap(tokensOf),
        ...Object.values(entry.env ?? {}).flatMap(tokensOf),
        ...Object.values(entry.headers ?? {}).flatMap(tokensOf),
        ...tokensOf(entry.url ?? ''),
      ];
      for (const token of used) expect(declared.has(token)).toBe(true);
      for (const token of declared) expect(used).toContain(token);
    }
  });

  it('Node 依赖条目声明最低主版本，且执行参数不再写死盘符路径', () => {
    for (const entry of MCP_CATALOG) {
      if (entry.requires.includes('node')) expect(entry.nodeMinMajor).toBeGreaterThan(0);
      const executable = JSON.stringify({
        command: entry.command,
        args: entry.args,
        env: entry.env,
        headers: entry.headers,
        url: entry.url,
      });
      expect(executable).not.toContain('D:/');
    }
  });

  it('必填字段缺失时能被检出', () => {
    const filesystem = MCP_CATALOG.find((entry) => entry.id === 'filesystem')!;
    expect(missingCatalogFields(filesystem, {})).toEqual(['允许访问的目录']);
    expect(missingCatalogFields(filesystem, { '{{dir}}': 'D:/docs' })).toEqual([]);
  });

  it('OAuth 条目必须是远程 HTTP 且不写静态 Authorization', () => {
    const oauthEntries = MCP_CATALOG.filter((entry) => entry.auth === 'oauth');
    expect(oauthEntries.length).toBeGreaterThan(0);
    for (const entry of oauthEntries) {
      expect(entry.transport).toBe('http');
      expect(entry.url?.startsWith('https://')).toBe(true);
      expect(entry.headers?.Authorization).toBeUndefined();
    }
  });

  it('推荐档至少包含三个零凭证能力', () => {
    const recommended = catalogByTier('recommended');
    expect(recommended.length).toBeGreaterThanOrEqual(3);
    expect(recommended.every((entry) => entry.tier === 'recommended')).toBe(true);
  });
});
