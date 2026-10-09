import {
  appLaunchArgsSchema,
  uiaListArgsSchema,
  windowFocusArgsSchema,
} from '@wbfm/shared/schemas';
import { ChannelUnavailableError, type ComputerChannelClient } from '../../computer/channel-client';
import type { Tool, ToolResult } from '../types';
import { ToolArgError } from '../types';
import { DESKTOP_UNAVAILABLE_OUTPUT } from './input-tools';

/** v0.7 M2 窗口 / UIA / 应用启动工具组（window_list、uia_list 为 read 级，其余 danger） */

function argError(issues: { message: string }[]): ToolArgError {
  return new ToolArgError(issues.map((i) => i.message).join('；'));
}

export function createWindowListTool(client: ComputerChannelClient): Tool {
  return {
    name: 'window_list',
    description: '列出当前所有可见顶层窗口（标题、进程名、物理像素矩形、是否前台）。用于定位目标应用窗口。',
    permission: 'read',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async run(_rawArgs, ctx): Promise<ToolResult> {
      try {
        const { windows } = await client.windowList(ctx.signal);
        if (windows.length === 0) return { ok: true, output: '当前没有可见窗口。', summary: '窗口列表为空' };
        const lines = windows.map(
          (w) =>
            `- "${w.title}"（进程 ${w.processName}，矩形 x=${w.rect.x} y=${w.rect.y} ${w.rect.width}x${w.rect.height}${w.isForeground ? '，前台' : ''}，句柄 ${w.handle}）`,
        );
        return { ok: true, output: `共 ${windows.length} 个可见窗口：\n${lines.join('\n')}`, summary: `${windows.length} 个窗口` };
      } catch (error) {
        if (error instanceof ChannelUnavailableError) {
          return { ok: true, output: DESKTOP_UNAVAILABLE_OUTPUT, summary: '窗口列表不可用（纯 Web 模式）' };
        }
        throw error;
      }
    },
  };
}

export function createUiaListTool(client: ComputerChannelClient): Tool {
  return {
    name: 'uia_list',
    description:
      '枚举目标窗口（缺省前台窗口）的 UIA 控件清单：名称、类型、物理像素矩形、是否可交互。点击前优先用它确定控件中心点坐标，比截图目测更准。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {
        windowTitle: { type: 'string', description: '目标窗口标题子串，缺省取前台窗口' },
        maxNodes: { type: 'integer', minimum: 1, maximum: 500, description: '返回节点数上限，默认 200' },
      },
      additionalProperties: false,
    },
    async run(rawArgs, ctx): Promise<ToolResult> {
      const parsed = uiaListArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw argError(parsed.error.issues);
      try {
        const res = await client.uiaList(parsed.data, ctx.signal);
        if (res.elements.length === 0) {
          return { ok: true, output: `窗口 "${res.windowTitle}" 未枚举到可见控件（可能是自绘 UI，可改用 screen_snapshot 视觉定位）。`, summary: '无 UIA 控件' };
        }
        const lines = res.elements.map((e) => {
          const c = `中心点 (${e.rect.x + Math.round(e.rect.width / 2)}, ${e.rect.y + Math.round(e.rect.height / 2)})`;
          const label = e.name ? `"${e.name}"` : '(无名称)';
          return `- ${e.controlType} ${label}${e.automationId ? ` [${e.automationId}]` : ''} ${c}${e.interactable ? '' : '（禁用）'}`;
        });
        return {
          ok: true,
          output: `窗口 "${res.windowTitle}" 控件清单（${res.elements.length}/${res.totalNodes} 个节点）：\n${lines.join('\n')}`,
          summary: `UIA 控件 ${res.elements.length} 个`,
        };
      } catch (error) {
        if (error instanceof ChannelUnavailableError) {
          return { ok: true, output: DESKTOP_UNAVAILABLE_OUTPUT, summary: 'UIA 不可用（纯 Web 模式）' };
        }
        throw error;
      }
    },
  };
}

export function createWindowFocusTool(client: ComputerChannelClient): Tool {
  return {
    name: 'window_focus',
    description: '把指定窗口激活到前台（最小化则还原）。按标题子串或句柄指定，句柄可先用 window_list 获取。',
    permission: 'read',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '窗口标题子串（不区分大小写），与 handle 二选一' },
        handle: { type: 'string', description: '窗口句柄（十进制字符串）' },
      },
      additionalProperties: false,
    },
    async run(rawArgs, ctx): Promise<ToolResult> {
      const parsed = windowFocusArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw argError(parsed.error.issues);
      try {
        await client.windowFocus(parsed.data, ctx.signal);
        return { ok: true, output: `窗口已激活到前台（${parsed.data.title ?? `句柄 ${parsed.data.handle}`}）。`, summary: '窗口已激活' };
      } catch (error) {
        if (error instanceof ChannelUnavailableError) {
          return { ok: true, output: DESKTOP_UNAVAILABLE_OUTPUT, summary: '窗口激活不可用（纯 Web 模式）' };
        }
        throw error;
      }
    },
  };
}

export function createAppLaunchTool(client: ComputerChannelClient): Tool {
  return {
    name: 'app_launch',
    description: '启动本机应用程序（如 notepad）。target 为可执行文件名或完整路径；args 为启动参数（逐个传递，不经过 shell）。',
    permission: 'danger',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', minLength: 1, description: '可执行文件名或完整路径' },
        args: { type: 'array', items: { type: 'string' }, description: '启动参数（可选）' },
      },
      required: ['target'],
      additionalProperties: false,
    },
    async run(rawArgs, ctx): Promise<ToolResult> {
      const parsed = appLaunchArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw argError(parsed.error.issues);
      try {
        await client.appLaunch(parsed.data, ctx.signal);
        return { ok: true, output: `已启动应用 "${parsed.data.target}"。窗口出现可能需要几秒，可用 window_list 确认后再操作。`, summary: `已启动 ${parsed.data.target}` };
      } catch (error) {
        if (error instanceof ChannelUnavailableError) {
          return { ok: true, output: DESKTOP_UNAVAILABLE_OUTPUT, summary: '应用启动不可用（纯 Web 模式）' };
        }
        throw error;
      }
    },
  };
}

export function createWindowTools(client: ComputerChannelClient): Tool[] {
  return [
    createWindowListTool(client),
    createUiaListTool(client),
    createWindowFocusTool(client),
    createAppLaunchTool(client),
  ];
}
