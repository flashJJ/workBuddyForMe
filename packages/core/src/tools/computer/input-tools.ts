import {
  keyboardPressArgsSchema,
  keyboardTypeArgsSchema,
  KEY_NAMES,
  mouseClickArgsSchema,
  mouseMoveArgsSchema,
  mouseScrollArgsSchema,
} from '@wbfm/shared/schemas';
import { ChannelUnavailableError, type ComputerChannelClient } from '../../computer/channel-client';
import type { Tool, ToolResult } from '../types';
import { ToolArgError } from '../types';

/**
 * v0.7 M2 键鼠工具组（全部 danger 级，走 HITL 确认）。
 * 坐标为真实屏幕物理像素（通常由 screen_snapshot 换算或 UIA 矩形中心点得出）。
 * 纯 Web 模式（通道不可用）返回 ok:true 降级说明，避免误计熔断失败。
 */
export const DESKTOP_UNAVAILABLE_OUTPUT =
  '当前为纯 Web 模式（无桌面端运行）或桌面端控制通道未就绪，该桌面操作不可用。请告知用户：桌面 Agent 能力仅在桌面端运行时提供。';

function argError(issues: { message: string }[]): ToolArgError {
  return new ToolArgError(issues.map((i) => i.message).join('；'));
}

async function guard(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    if (error instanceof ChannelUnavailableError) return DESKTOP_UNAVAILABLE_OUTPUT;
    throw error;
  }
}

function degraded(summary: string): ToolResult {
  return { ok: true, output: DESKTOP_UNAVAILABLE_OUTPUT, summary };
}

export function createMouseMoveTool(client: ComputerChannelClient): Tool {
  return {
    name: 'mouse_move',
    description: '把鼠标移动到屏幕指定坐标（物理像素）。通常作为点击前的定位步骤。',
    permission: 'danger',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'integer', minimum: 0, description: '目标横坐标（物理像素）' },
        y: { type: 'integer', minimum: 0, description: '目标纵坐标（物理像素）' },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    },
    async run(rawArgs, ctx): Promise<ToolResult> {
      const parsed = mouseMoveArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw argError(parsed.error.issues);
      const unavailable = await guard(() => client.mouseMove(parsed.data, ctx.signal));
      if (unavailable) return degraded('鼠标移动不可用（纯 Web 模式）');
      return { ok: true, output: `鼠标已移动到 (${parsed.data.x}, ${parsed.data.y})。`, summary: '鼠标已移动' };
    },
  };
}

export function createMouseClickTool(client: ComputerChannelClient): Tool {
  return {
    name: 'mouse_click',
    description:
      '在屏幕指定坐标（物理像素）点击鼠标：先移动到位，显示点击指示圈后执行点击。坐标可来自 screen_snapshot 截图换算或 UIA 控件矩形中心点。',
    permission: 'danger',
    parameters: {
      type: 'object',
      properties: {
        x: { type: 'integer', minimum: 0 },
        y: { type: 'integer', minimum: 0 },
        button: { type: 'string', enum: ['left', 'right', 'middle'], description: '按键，默认 left' },
        double: { type: 'boolean', description: '是否双击，默认 false' },
      },
      required: ['x', 'y'],
      additionalProperties: false,
    },
    async run(rawArgs, ctx): Promise<ToolResult> {
      const parsed = mouseClickArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw argError(parsed.error.issues);
      const unavailable = await guard(() => client.mouseClick(parsed.data, ctx.signal));
      if (unavailable) return degraded('鼠标点击不可用（纯 Web 模式）');
      const { x, y, button, double } = parsed.data;
      return {
        ok: true,
        output: `已在 (${x}, ${y}) 执行${double ? '双击' : '单击'}（${button}）。`,
        summary: `点击 (${x}, ${y})`,
      };
    },
  };
}

export function createMouseScrollTool(client: ComputerChannelClient): Tool {
  return {
    name: 'mouse_scroll',
    description: '在当前鼠标位置滚动滚轮。dy 正数向上、负数向下（行数）；dx 正数向右、负数向左。',
    permission: 'danger',
    parameters: {
      type: 'object',
      properties: {
        dy: { type: 'integer', description: '垂直滚动量（行），正上负下' },
        dx: { type: 'integer', description: '水平滚动量，正右负左' },
      },
      additionalProperties: false,
    },
    async run(rawArgs, ctx): Promise<ToolResult> {
      const parsed = mouseScrollArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw argError(parsed.error.issues);
      const unavailable = await guard(() => client.mouseScroll(parsed.data, ctx.signal));
      if (unavailable) return degraded('滚动不可用（纯 Web 模式）');
      return { ok: true, output: `已滚动（dy=${parsed.data.dy}, dx=${parsed.data.dx}）。`, summary: '滚轮已滚动' };
    },
  };
}

export function createKeyboardTypeTool(client: ComputerChannelClient): Tool {
  return {
    name: 'keyboard_type',
    description:
      '在当前焦点处输入一段文本（支持中文等非 ASCII，内部走剪贴板粘贴）。输入前请确保目标输入框已获得焦点（先用 mouse_click 点击它）。',
    permission: 'danger',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1, maxLength: 4000, description: '要输入的文本' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    async run(rawArgs, ctx): Promise<ToolResult> {
      const parsed = keyboardTypeArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw argError(parsed.error.issues);
      const unavailable = await guard(() => client.keyboardType(parsed.data, ctx.signal));
      if (unavailable) return degraded('键盘输入不可用（纯 Web 模式）');
      const preview = parsed.data.text.length > 50 ? `${parsed.data.text.slice(0, 50)}…` : parsed.data.text;
      return { ok: true, output: `已输入 ${parsed.data.text.length} 个字符："${preview}"`, summary: `输入 ${parsed.data.text.length} 字符` };
    },
  };
}

export function createKeyboardPressTool(client: ComputerChannelClient): Tool {
  return {
    name: 'keyboard_press',
    description: `按下组合键（如 Ctrl+S 保存）。keys 为键名数组，可用键：${KEY_NAMES.slice(0, 16).join('/')}、f1-f12、a-z、0-9。`,
    permission: 'danger',
    parameters: {
      type: 'object',
      properties: {
        keys: {
          type: 'array',
          items: { type: 'string', enum: [...KEY_NAMES] },
          minItems: 1,
          maxItems: 5,
          description: '按键序列，如 ["control","s"]',
        },
      },
      required: ['keys'],
      additionalProperties: false,
    },
    async run(rawArgs, ctx): Promise<ToolResult> {
      const parsed = keyboardPressArgsSchema.safeParse(rawArgs);
      if (!parsed.success) throw argError(parsed.error.issues);
      const unavailable = await guard(() => client.keyboardPress(parsed.data, ctx.signal));
      if (unavailable) return degraded('组合键不可用（纯 Web 模式）');
      return { ok: true, output: `已按下组合键：${parsed.data.keys.join('+')}。`, summary: `按键 ${parsed.data.keys.join('+')}` };
    },
  };
}

export function createInputTools(client: ComputerChannelClient): Tool[] {
  return [
    createMouseMoveTool(client),
    createMouseClickTool(client),
    createMouseScrollTool(client),
    createKeyboardTypeTool(client),
    createKeyboardPressTool(client),
  ];
}
