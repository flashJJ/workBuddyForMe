import { describe, expect, it } from 'vitest';
import type { BrowserOpenRequest } from '@wbfm/shared/schemas';
import { ChannelUnavailableError, type ComputerChannelClient } from '../../computer/channel-client';
import type { ToolContext } from '../types';
import {
  createBrowserOpenTool,
  createBrowserReadTool,
  createBrowserSnapshotTool,
  createBrowserTools,
} from './browser-tools';

const unavailable = async () => {
  throw new ChannelUnavailableError('no channel');
};

function fakeClient(overrides: Partial<ComputerChannelClient> = {}): {
  client: ComputerChannelClient;
  calls: Array<{ route: string; args: unknown }>;
} {
  const calls: Array<{ route: string; args: unknown }> = [];
  const client: ComputerChannelClient = {
    getInfo: () => null,
    snapshot: unavailable as never,
    mouseMove: unavailable as never,
    mouseClick: unavailable as never,
    mouseScroll: unavailable as never,
    keyboardType: unavailable as never,
    keyboardPress: unavailable as never,
    windowList: unavailable as never,
    windowFocus: unavailable as never,
    appLaunch: unavailable as never,
    uiaList: unavailable as never,
    browserOpen: (async (args: BrowserOpenRequest) => {
      calls.push({ route: 'open', args });
      return { ok: true, sessionId: 's1', domain: '8.8.8.8', urlHash: 'hash', title: 'T', status: 200 };
    }) as never,
    browserRead: (async (args: unknown) => {
      calls.push({ route: 'read', args });
      return { ok: true, domain: '8.8.8.8', urlHash: 'hash', text: '页面正文', truncated: false };
    }) as never,
    browserSnapshot: (async (args: unknown) => {
      calls.push({ route: 'snapshot', args });
      return {
        ok: true,
        domain: '8.8.8.8',
        urlHash: 'hash',
        imageBase64: 'cG5n',
        mimeType: 'image/png',
        width: 800,
        height: 600,
      };
    }) as never,
    browserClick: unavailable as never,
    browserType: unavailable as never,
    browserClose: unavailable as never,
    ...overrides,
  };
  return { client, calls };
}

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    knowledgeBaseIds: [],
    retrieve: async () => [],
    runId: 'run-1',
    policyDomains: { allow: ['8.8.8.8'], deny: [] },
    ...overrides,
  };
}

describe('隔离网页工具（v2.13 M5）', () => {
  it('缺少 runId：返回任务运行上下文提示且不调用通道', async () => {
    const { client, calls } = fakeClient();
    const result = await createBrowserOpenTool(client).run(
      { url: 'https://8.8.8.8' },
      ctx({ runId: undefined }),
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain('任务运行');
    expect(calls).toHaveLength(0);
  });

  it('通道不可用：降级 ok:true，不误计熔断', async () => {
    const { client } = fakeClient({ browserRead: unavailable as never });
    const result = await createBrowserReadTool(client).run({}, ctx());
    expect(result.ok).toBe(true);
    expect(result.output).toContain('纯 Web 模式');
  });

  it('私网 / 非法协议在 core 侧直接拒绝并写审计', async () => {
    const audits: string[] = [];
    const { client, calls } = fakeClient();
    const tool = createBrowserOpenTool(client);
    const blocked = await tool.run(
      { url: 'http://127.0.0.1' },
      ctx({ governanceAudit: (input) => audits.push(input.reasonCode) }),
    );
    expect(blocked.ok).toBe(false);
    expect(audits).toContain('SSRF_BLOCKED');
    expect(calls).toHaveLength(0);

    const file = await tool.run({ url: 'file:///C:/secret.txt' }, ctx());
    expect(file.ok).toBe(false);
  });

  it('browser_open 传递 runId 与域名规则并返回域名与哈希', async () => {
    const { client, calls } = fakeClient();
    const result = await createBrowserOpenTool(client).run({ url: 'https://8.8.8.8' }, ctx());
    expect(result.ok).toBe(true);
    expect(calls[0]!.route).toBe('open');
    expect(calls[0]!.args).toMatchObject({
      runId: 'run-1',
      allowDomains: ['8.8.8.8'],
      denyDomains: [],
    });
    expect(result.output).toContain('8.8.8.8');
  });

  it('browser_snapshot 视觉模型注入图片，非视觉降级为文字', async () => {
    const { client } = fakeClient();
    const vision = await createBrowserSnapshotTool(client).run({}, ctx({ visionCapable: true }));
    expect(vision.images).toHaveLength(1);
    const text = await createBrowserSnapshotTool(client).run({}, ctx({ visionCapable: false }));
    expect(text.images).toBeUndefined();
    expect(text.output).toContain('browser_read');
  });

  it('完整工具组包含六个浏览器工具', () => {
    const { client } = fakeClient();
    expect(createBrowserTools(client).map((tool) => tool.name)).toEqual([
      'browser_open',
      'browser_read',
      'browser_snapshot',
      'browser_click',
      'browser_type',
      'browser_close',
    ]);
  });
});
