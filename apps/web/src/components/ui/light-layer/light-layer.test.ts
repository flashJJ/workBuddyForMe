// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createLightLayer, type LightLayerOptions } from './light-layer';

function boxAt(left: number, top: number): HTMLElement {
  const element = document.createElement('div');
  document.body.appendChild(element);
  element.getBoundingClientRect = () =>
    ({
      x: left,
      y: top,
      left,
      top,
      right: left + 20,
      bottom: top + 20,
      width: 20,
      height: 20,
      toJSON: () => ({}),
    }) as DOMRect;
  return element;
}

function frameEnv() {
  let time = 0;
  let nextHandle = 1;
  const frames = new Map<number, (value: number) => void>();
  return {
    options: {
      requestFrame: (callback) => {
        const handle = nextHandle++;
        frames.set(handle, callback);
        return handle;
      },
      cancelFrame: (handle) => {
        frames.delete(handle);
      },
      reducedMotion: () => false,
      random: () => 0.5,
    } satisfies LightLayerOptions,
    pending: () => frames.size,
    step(ms = 200) {
      time += ms;
      const first = frames.entries().next();
      if (first.done) return false;
      const [handle, callback] = first.value;
      frames.delete(handle);
      callback(time);
      return true;
    },
    drain(maxSteps = 24) {
      for (let i = 0; i < maxSteps && frames.size > 0; i += 1) this.step();
    },
  };
}

const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');

afterEach(() => {
  if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden);
});

describe('v2.20 M3 Light UI 图层', () => {
  it('reduced motion 直接完成，不创建光线节点', async () => {
    const env = frameEnv();
    const layer = createLightLayer(document.body, { ...env.options, reducedMotion: () => true });
    const flight = layer.emit({
      id: 'reduced',
      source: boxAt(10, 10),
      target: boxAt(110, 110),
      color: 'primary',
    });
    expect(await flight.finished).toBe('arrived');
    expect(document.querySelector('[data-light-id="reduced"]')).toBeNull();
    layer.destroy();
  });

  it('目标缺失等待一帧后返回 missing-anchor', async () => {
    const env = frameEnv();
    const layer = createLightLayer(document.body, env.options);
    const flight = layer.emit({
      id: 'missing',
      source: boxAt(10, 10),
      target: () => null,
      color: 'info',
    });
    expect(env.pending()).toBe(1);
    env.step();
    expect(await flight.finished).toBe('missing-anchor');
    layer.destroy();
  });

  it('同一 id 运行中重复发射返回 cancelled', async () => {
    const env = frameEnv();
    const layer = createLightLayer(document.body, env.options);
    const first = layer.emit({ id: 'dup', source: boxAt(10, 10), target: boxAt(110, 110), color: 'primary' });
    const second = layer.emit({ id: 'dup', source: boxAt(10, 10), target: boxAt(110, 110), color: 'primary' });
    expect(await second.finished).toBe('cancelled');
    expect(document.querySelectorAll('[data-light-id="dup"]')).toHaveLength(1);
    first.cancel();
    expect(await first.finished).toBe('cancelled');
    layer.destroy();
  });

  it('超过 12 条并发时丢弃新发射', async () => {
    const env = frameEnv();
    const layer = createLightLayer(document.body, env.options);
    const flights = Array.from({ length: 13 }, (_, index) =>
      layer.emit({
        id: `cap-${index}`,
        source: boxAt(10, 10),
        target: boxAt(110 + index, 110),
        color: 'success',
      }),
    );
    const overflow = await flights[12]!.finished;
    expect(overflow).toBe('cancelled');
    expect(document.querySelectorAll('[data-light-id]')).toHaveLength(12);
    layer.destroy();
    const results = await Promise.all(flights.slice(0, 12).map((flight) => flight.finished));
    expect(results.every((result) => result === 'cancelled')).toBe(true);
  });

  it('pause 冻结进度，resume 后继续并在到达后清理', async () => {
    const env = frameEnv();
    const layer = createLightLayer(document.body, env.options);
    const flight = layer.emit({ id: 'pause', source: boxAt(10, 10), target: boxAt(210, 110), color: 'warning' });
    env.step();
    env.step();
    layer.pause();
    expect(env.pending()).toBe(0);
    expect(document.querySelector('[data-light-id="pause"]')).not.toBeNull();
    layer.resume();
    expect(env.pending()).toBe(1);
    env.drain();
    expect(await flight.finished).toBe('arrived');
    expect(document.querySelector('[data-light-id="pause"]')).toBeNull();
    layer.destroy();
  });

  it('页面隐藏自动暂停，恢复可见后继续', async () => {
    const env = frameEnv();
    let hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    const layer = createLightLayer(document.body, env.options);
    const flight = layer.emit({ id: 'hidden', source: boxAt(10, 10), target: boxAt(110, 110), color: 'primary' });
    expect(env.pending()).toBe(0);

    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(env.pending()).toBe(1);
    env.drain();
    expect(await flight.finished).toBe('arrived');
    layer.destroy();
  });

  it('destroy 取消未完成光线并移除 SVG', async () => {
    const env = frameEnv();
    const layer = createLightLayer(document.body, env.options);
    const flight = layer.emit({ id: 'destroy', source: boxAt(10, 10), target: boxAt(110, 110), color: 'destructive' });
    layer.destroy();
    expect(await flight.finished).toBe('cancelled');
    expect(document.querySelector('[data-testid="light-layer"]')).toBeNull();
  });
});
