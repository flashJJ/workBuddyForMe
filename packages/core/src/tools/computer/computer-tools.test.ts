import { describe, expect, it } from 'vitest';
import type {
  ComputerChannelClient,
} from '../../computer/channel-client';
import { ChannelUnavailableError } from '../../computer/channel-client';
import { createInputTools } from './input-tools';
import { createWindowTools } from './window-tools';
import { ToolArgError, type ToolContext } from '../types';

const CTX: ToolContext = {
  knowledgeBaseId: null,
  retrieve: async () => [],
};

interface Call {
  route: string;
  args: unknown;
}

function fakeClient(behavior: 'ok' | 'unavailable' = 'ok'): { client: ComputerChannelClient; calls: Call[] } {
  const calls: Call[] = [];
  const record = (route: string) => (args: unknown) => {
    calls.push({ route, args });
    if (behavior === 'unavailable') throw new ChannelUnavailableError('no channel');
    return Promise.resolve({ ok: true });
  };
  const client: ComputerChannelClient = {
    getInfo: () => null,
    snapshot: record('/screen/snapshot') as never,
    mouseMove: record('/input/mouse-move') as never,
    mouseClick: record('/input/mouse-click') as never,
    mouseScroll: record('/input/mouse-scroll') as never,
    keyboardType: record('/input/keyboard-type') as never,
    keyboardPress: record('/input/keyboard-press') as never,
    windowList: (async () => {
      if (behavior === 'unavailable') throw new ChannelUnavailableError('no channel');
      return { windows: [{ handle: '1', title: '记事本', processName: 'notepad', rect: { x: 0, y: 0, width: 100, height: 100 }, isForeground: true }] };
    }) as never,
    windowFocus: record('/windows/focus') as never,
    appLaunch: record('/app/launch') as never,
    uiaList: (async () => {
      if (behavior === 'unavailable') throw new ChannelUnavailableError('no channel');
      return {
        windowTitle: '记事本',
        elements: [{ name: '保存', controlType: 'Button', automationId: '', rect: { x: 10, y: 10, width: 60, height: 20 }, interactable: true }],
        totalNodes: 5,
      };
    }) as never,
  };
  return { client, calls };
}

describe('键鼠工具组（danger 级）', () => {
  it('mouse_click 默认补全 button/double 并调用通道', async () => {
    const { client, calls } = fakeClient();
    const tool = createInputTools(client).find((t) => t.name === 'mouse_click')!;
    expect(tool.permission).toBe('danger');
    const res = await tool.run({ x: 5, y: 6 }, CTX);
    expect(res.ok).toBe(true);
    expect(calls[0]).toEqual({ route: '/input/mouse-click', args: { x: 5, y: 6, button: 'left', double: false } });
  });

  it('keyboard_press 组合键透传', async () => {
    const { client, calls } = fakeClient();
    const tool = createInputTools(client).find((t) => t.name === 'keyboard_press')!;
    const res = await tool.run({ keys: ['control', 's'] }, CTX);
    expect(res.summary).toContain('control+s');
    expect(calls[0]!.args).toEqual({ keys: ['control', 's'] });
  });

  it('通道不可用时返回 ok:true 降级说明（不误计熔断）', async () => {
    const { client } = fakeClient('unavailable');
    for (const tool of createInputTools(client)) {
      const args = tool.name === 'keyboard_type' ? { text: 'x' } : tool.name === 'keyboard_press' ? { keys: ['enter'] } : { x: 1, y: 1 };
      const res = await tool.run(args, CTX);
      expect(res.ok).toBe(true);
      expect(res.output).toContain('纯 Web 模式');
    }
  });

  it('非法参数抛 ToolArgError（未知键名）', async () => {
    const { client } = fakeClient();
    const tool = createInputTools(client).find((t) => t.name === 'keyboard_press')!;
    await expect(tool.run({ keys: ['win'] }, CTX)).rejects.toBeInstanceOf(ToolArgError);
  });
});

describe('窗口 / UIA / 启动工具组', () => {
  it('window_list 为 read 级并输出窗口清单', async () => {
    const { client } = fakeClient();
    const tool = createWindowTools(client).find((t) => t.name === 'window_list')!;
    expect(tool.permission).toBe('read');
    const res = await tool.run({}, CTX);
    expect(res.output).toContain('记事本');
    expect(res.output).toContain('前台');
  });

  it('uia_list 输出控件中心点坐标', async () => {
    const { client } = fakeClient();
    const tool = createWindowTools(client).find((t) => t.name === 'uia_list')!;
    const res = await tool.run({}, CTX);
    // rect(10,10,60,20) → 中心 (40,20)
    expect(res.output).toContain('中心点 (40, 20)');
    expect(res.output).toContain('Button');
  });

  it('app_launch 为 danger 级', async () => {
    const { client, calls } = fakeClient();
    const tool = createWindowTools(client).find((t) => t.name === 'app_launch')!;
    expect(tool.permission).toBe('danger');
    await tool.run({ target: 'notepad' }, CTX);
    expect(calls[0]!.args).toEqual({ target: 'notepad', args: [] });
  });

  it('window_focus 通道不可用时降级 ok:true', async () => {
    const { client } = fakeClient('unavailable');
    const tool = createWindowTools(client).find((t) => t.name === 'window_focus')!;
    const res = await tool.run({ title: '记事本' }, CTX);
    expect(res.ok).toBe(true);
    expect(res.output).toContain('纯 Web 模式');
  });
});
