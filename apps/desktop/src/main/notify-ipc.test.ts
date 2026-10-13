import { describe, expect, it, vi } from 'vitest';
import { normalizeNotifyPayload, registerNotifyIpc, type IpcMainLike } from './notify-ipc';

describe('notify-ipc（v1.7 通知兜底）', () => {
  it('normalizeNotifyPayload：裁空白、拒非字符串、限长', () => {
    expect(normalizeNotifyPayload({ title: ' 小助 ', body: '喝水' })).toEqual({
      title: '小助',
      body: '喝水',
    });
    expect(normalizeNotifyPayload({ title: '', body: 'x' })).toBeNull();
    expect(normalizeNotifyPayload({ title: 'x' })).toBeNull();
    expect(normalizeNotifyPayload('nope')).toBeNull();
    expect(normalizeNotifyPayload(null)).toBeNull();

    const long = normalizeNotifyPayload({ title: 'x'.repeat(80), body: 'y'.repeat(300) });
    expect(long?.title).toHaveLength(60);
    expect(long?.body).toHaveLength(200);
  });

  it('registerNotifyIpc：注册 notify:show，合法负载弹通知，非法/异常静默', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const ipc: IpcMainLike = {
      handle: (channel, listener) => handlers.set(channel, listener),
    };
    const show = vi.fn();
    const ctor = vi.fn(() => ({ show }));
    registerNotifyIpc(ipc, ctor);

    await handlers.get('notify:show')?.(null, { title: '提醒', body: '该休息了' });
    expect(ctor).toHaveBeenCalledWith({ title: '提醒', body: '该休息了' });
    expect(show).toHaveBeenCalledTimes(1);

    // 非法负载：不构造通知
    await handlers.get('notify:show')?.(null, { title: 1, body: 2 });
    expect(show).toHaveBeenCalledTimes(1);

    // show 抛错被吞掉（系统通知不可用）：处理器同步返回 undefined，不抛错
    const boom = vi.fn(() => ({ show: () => { throw new Error('dnd'); } }));
    registerNotifyIpc({ handle: (c, l) => handlers.set(c, l) }, boom);
    expect(() => handlers.get('notify:show')?.(null, { title: 't', body: 'b' })).not.toThrow();
    expect(boom).toHaveBeenCalledTimes(1);
  });
});
