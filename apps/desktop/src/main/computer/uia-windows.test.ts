import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { listUiaElements } from './uia';
import { focusWindow, launchApp, listWindows } from './windows';

const UIA_FIXTURE = JSON.stringify({
  windowTitle: '记事本',
  elements: [
    { name: '文本编辑器', controlType: 'Edit', automationId: '15', rect: { x: 10, y: 40, width: 780, height: 500 }, interactable: true },
  ],
  totalNodes: 12,
});

describe('UIA 控件枚举（PowerShell 桥）', () => {
  it('解析控件清单（数组场景）', async () => {
    const res = await listUiaElements({ maxNodes: 200 }, { runner: async () => UIA_FIXTURE });
    expect(res.windowTitle).toBe('记事本');
    expect(res.elements).toHaveLength(1);
    expect(res.elements[0]!.controlType).toBe('Edit');
    expect(res.totalNodes).toBe(12);
  });

  it('ConvertTo-Json 单元素退化为对象时规整为数组', async () => {
    const single = JSON.stringify({
      windowTitle: '记事本',
      elements: { name: '保存', controlType: 'Button', automationId: '', rect: { x: 1, y: 2, width: 3, height: 4 }, interactable: true },
      totalNodes: 3,
    });
    const res = await listUiaElements({ maxNodes: 100 }, { runner: async () => single });
    expect(res.elements).toHaveLength(1);
    expect(res.elements[0]!.name).toBe('保存');
  });

  it('脚本参数传递 windowTitle 与 maxNodes', async () => {
    let got: string[] = [];
    await listUiaElements({ windowTitle: '记事', maxNodes: 50 }, {
      runner: async (_s, args) => {
        got = args ?? [];
        return UIA_FIXTURE;
      },
    });
    expect(got).toEqual(['记事', '50']);
  });

  it('PowerShell 失败向上抛错', async () => {
    await expect(
      listUiaElements({ maxNodes: 10 }, { runner: async () => Promise.reject(new Error('ps boom')) }),
    ).rejects.toThrow('ps boom');
  });
});

const WINDOWS_FIXTURE = JSON.stringify([
  { handle: '1234', title: '无标题 - 记事本', processName: 'notepad', rect: { x: 0, y: 0, width: 800, height: 600 }, isForeground: true },
  { handle: '5678', title: '设置', processName: 'SystemSettings', rect: { x: 10, y: 10, width: 600, height: 500 }, isForeground: false },
]);

describe('窗口管理桥', () => {
  it('listWindows 解析窗口数组', async () => {
    const res = await listWindows({ runner: async () => WINDOWS_FIXTURE });
    expect(res.windows).toHaveLength(2);
    expect(res.windows[0]!.title).toContain('记事本');
    expect(res.windows[0]!.isForeground).toBe(true);
  });

  it('空输出返回空列表', async () => {
    const res = await listWindows({ runner: async () => '' });
    expect(res.windows).toEqual([]);
  });

  it('focusWindow 按 handle 直接激活', async () => {
    let got: string[] = [];
    await focusWindow({ handle: '1234' }, {
      runner: async (_s, args) => {
        got = args ?? [];
        return '{"ok":true}';
      },
    });
    expect(got).toEqual(['1234']);
  });

  it('focusWindow 按标题子串解析 handle 后激活', async () => {
    const calls: string[][] = [];
    const runner = async (_s: string, args?: string[]) => {
      calls.push(args ?? []);
      return args?.length ? '{"ok":true}' : WINDOWS_FIXTURE;
    };
    await focusWindow({ title: '设置' }, { runner });
    expect(calls[1]).toEqual(['5678']);
  });

  it('focusWindow 标题无匹配抛错', async () => {
    await expect(
      focusWindow({ title: '不存在' }, { runner: async () => WINDOWS_FIXTURE }),
    ).rejects.toThrow('未找到');
  });

  it('launchApp spawn 成功即返回，参数逐个传递', async () => {
    let spawned: { target: string; args: string[] } | null = null;
    const spawnImpl = ((target: string, args: string[]) => {
      spawned = { target, args };
      const child = new EventEmitter() as EventEmitter & { unref(): void };
      child.unref = () => undefined;
      queueMicrotask(() => child.emit('spawn'));
      return child;
    }) as never;
    await launchApp({ target: 'notepad', args: ['a.txt'] }, { spawnImpl });
    expect(spawned).toEqual({ target: 'notepad', args: ['a.txt'] });
  });

  it('launchApp spawn 失败抛错', async () => {
    const spawnImpl = (() => {
      const child = new EventEmitter() as EventEmitter & { unref(): void };
      child.unref = () => undefined;
      queueMicrotask(() => child.emit('error', new Error('ENOENT')));
      return child;
    }) as never;
    await expect(launchApp({ target: 'nope', args: [] }, { spawnImpl })).rejects.toThrow('启动失败');
  });
});
