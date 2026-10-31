import {
  BROWSER_BLOCKED_OUTPUT,
  BROWSER_READ_DEFAULT_CHARS,
  BROWSER_READ_MAX_CHARS,
} from '@wbfm/shared/schemas';
import type { ComputerChannelClient } from '../../computer/channel-client';
import { assertSafeUrlLiteral, ipv4ToInt, resolveAndAssertHost, SsrfBlockedError } from '../ssrf-guard';
import type { Tool, ToolResult } from '../types';
import {
  argError,
  auditBlocked,
  browserFailure,
  call,
  clickArgsSchema,
  degraded,
  emptyArgsSchema,
  noRun,
  noSession,
  openArgsSchema,
  readArgsSchema,
  summaryOfOpen,
  typeArgsSchema,
} from './browser-tool-shared';

/**
 * v2.13 M5：隔离网页工具组。
 * - 仅桌面端（控制通道）可用；纯 Web 模式降级不误计熔断失败；
 * - 会话按 runId 隔离（desktop 临时 session 分区）；
 * - 域名策略由门控与 desktop 导航复核双重执行；SSRF 在 core 侧先校验。
 */

export function createBrowserOpenTool(client: ComputerChannelClient): Tool {
  return {
    name: 'browser_open',
    description:
      '在隔离浏览器窗口打开 http/https 网页（每次任务运行使用独立临时会话，不共享主浏览器登录态）。仅桌面端可用；域名受策略限制。',
    permission: 'danger',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'http/https 完整 URL' },
      },
      required: ['url'],
      additionalProperties: false,
    },
    async run(rawArgs, ctx): Promise<ToolResult> {
      if (!ctx.runId) return noRun();
      const parsed = openArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw argError(parsed.error.issues);

      let safeUrl: URL;
      try {
        safeUrl = assertSafeUrlLiteral(parsed.data.url);
        const host = safeUrl.hostname.replace(/^\[|\]$/g, '');
        // 域名需 DNS 校验；IP 字面量已在 assertSafeUrlLiteral 中判定
        if (ipv4ToInt(host) === null && !host.includes(':')) await resolveAndAssertHost(host);
      } catch (error) {
        const reason = error instanceof SsrfBlockedError ? error.message : '网页目标被拒绝';
        auditBlocked(ctx, error instanceof SsrfBlockedError ? 'SSRF_BLOCKED' : 'URL_REJECTED');
        return { ok: false, output: `${BROWSER_BLOCKED_OUTPUT}（${reason}）`, summary: '网页目标被拒绝' };
      }

      const response = await call(() =>
        client.browserOpen(
          {
            runId: ctx.runId!,
            url: safeUrl.toString(),
            allowDomains: ctx.policyDomains?.allow ?? [],
            denyDomains: ctx.policyDomains?.deny ?? [],
          },
          ctx.signal,
        ),
      );
      if (!response) return degraded();
      if (!response.ok) {
        auditBlocked(ctx, response.error ?? 'URL_REJECTED', response.blockedDomain);
        return browserFailure(response.error, response.blockedDomain);
      }
      return {
        ok: true,
        output:
          `已打开网页：${response.domain ?? ''}（标题：${response.title ?? '—'}，状态 ${response.status ?? 0}）。` +
          `会话 ${response.sessionId ?? ''}；URL 哈希 ${response.urlHash ?? ''}。页面内容请用 browser_read / browser_snapshot 获取。`,
        summary: summaryOfOpen(response),
      };
    },
  };
}

export function createBrowserReadTool(client: ComputerChannelClient): Tool {
  return {
    name: 'browser_read',
    description: '读取隔离网页当前页面的纯文本内容（默认 8000 字符，最多 20000）。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {
        maxChars: {
          type: 'integer',
          minimum: 1,
          maximum: BROWSER_READ_MAX_CHARS,
          description: `返回字符上限，默认 ${BROWSER_READ_DEFAULT_CHARS}`,
        },
      },
      additionalProperties: false,
    },
    async run(rawArgs, ctx): Promise<ToolResult> {
      if (!ctx.runId) return noRun();
      const parsed = readArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw argError(parsed.error.issues);
      const response = await call(() =>
        client.browserRead(
          { runId: ctx.runId!, maxChars: parsed.data.maxChars ?? BROWSER_READ_DEFAULT_CHARS },
          ctx.signal,
        ),
      );
      if (!response) return degraded();
      if (!response.ok) {
        return response.error === 'NO_SESSION' ? noSession() : browserFailure(response.error);
      }
      return {
        ok: true,
        output: `${response.text ?? ''}${response.truncated ? '\n（内容已截断）' : ''}`,
        summary: `读取 ${response.domain ?? '网页'}${response.truncated ? '（截断）' : ''}`,
      };
    },
  };
}

export function createBrowserSnapshotTool(client: ComputerChannelClient): Tool {
  return {
    name: 'browser_snapshot',
    description: '截取隔离网页当前窗口画面，供视觉模型观察页面布局。',
    permission: 'read',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async run(rawArgs, ctx): Promise<ToolResult> {
      if (!ctx.runId) return noRun();
      const parsed = emptyArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw argError(parsed.error.issues);
      const response = await call(() => client.browserSnapshot({ runId: ctx.runId! }, ctx.signal));
      if (!response) return degraded();
      if (!response.ok) {
        return response.error === 'NO_SESSION' ? noSession() : browserFailure(response.error);
      }
      const meta = `隔离网页截图 ${response.width ?? 0}x${response.height ?? 0}（${response.domain ?? ''}）。`;
      if (!ctx.visionCapable || !response.imageBase64) {
        return {
          ok: true,
          output: `${meta}当前模型不具备视觉能力或截图不可用，请改用 browser_read。`,
          summary: '网页截图（当前模型无视觉能力）',
        };
      }
      return {
        ok: true,
        output: `${meta}截图已作为图片注入本轮对话。`,
        summary: '网页截图',
        images: [{ mimeType: 'image/png', dataBase64: response.imageBase64 }],
      };
    },
  };
}

export function createBrowserClickTool(client: ComputerChannelClient): Tool {
  return {
    name: 'browser_click',
    description: '在隔离网页中按 CSS selector 或可见文本点击元素（两者至少提供一个）。',
    permission: 'danger',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector' },
        text: { type: 'string', description: '元素可见文本（精确或包含匹配）' },
      },
      additionalProperties: false,
    },
    async run(rawArgs, ctx): Promise<ToolResult> {
      if (!ctx.runId) return noRun();
      const parsed = clickArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw argError(parsed.error.issues);
      const response = await call(() =>
        client.browserClick({ runId: ctx.runId!, ...parsed.data }, ctx.signal),
      );
      if (!response) return degraded();
      if (!response.ok) {
        return response.error === 'NO_SESSION' ? noSession() : browserFailure(response.error);
      }
      return {
        ok: true,
        output: response.matched ? '已点击目标元素。' : '未找到匹配元素，未执行点击。',
        summary: response.matched ? '网页点击成功' : '网页点击未命中',
      };
    },
  };
}

export function createBrowserTypeTool(client: ComputerChannelClient): Tool {
  return {
    name: 'browser_type',
    description: '向隔离网页的输入框写入文本（按 selector 或可见文本定位，可先清空）。',
    permission: 'danger',
    parameters: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector' },
        text: { type: 'string', description: '输入框标签 / 占位文本' },
        value: { type: 'string', description: '要写入的文本' },
        clear: { type: 'boolean', description: '写入前是否清空，默认 false' },
      },
      required: ['value'],
      additionalProperties: false,
    },
    async run(rawArgs, ctx): Promise<ToolResult> {
      if (!ctx.runId) return noRun();
      const parsed = typeArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw argError(parsed.error.issues);
      const response = await call(() =>
        client.browserType(
          { runId: ctx.runId!, ...parsed.data, clear: parsed.data.clear ?? false },
          ctx.signal,
        ),
      );
      if (!response) return degraded();
      if (!response.ok) {
        return response.error === 'NO_SESSION' ? noSession() : browserFailure(response.error);
      }
      return {
        ok: true,
        output: response.matched ? '已写入目标输入框。' : '未找到匹配输入框，未写入。',
        summary: response.matched ? '网页输入成功' : '网页输入未命中',
      };
    },
  };
}

export function createBrowserCloseTool(client: ComputerChannelClient): Tool {
  return {
    name: 'browser_close',
    description: '关闭当前运行的隔离网页会话并清理临时缓存。',
    permission: 'read',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async run(rawArgs, ctx): Promise<ToolResult> {
      if (!ctx.runId) return noRun();
      const parsed = emptyArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw argError(parsed.error.issues);
      const response = await call(() => client.browserClose({ runId: ctx.runId! }, ctx.signal));
      if (!response) return degraded();
      return {
        ok: true,
        output: response.ok ? '隔离网页会话已关闭。' : '没有可关闭的网页会话。',
        summary: response.ok ? '网页会话已关闭' : '无网页会话',
      };
    },
  };
}

export function createBrowserTools(client: ComputerChannelClient): Tool[] {
  return [
    createBrowserOpenTool(client),
    createBrowserReadTool(client),
    createBrowserSnapshotTool(client),
    createBrowserClickTool(client),
    createBrowserTypeTool(client),
    createBrowserCloseTool(client),
  ];
}
