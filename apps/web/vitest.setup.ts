import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom 未实现滚动 API
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// v2.3：Radix Select/Popper 依赖指针捕获与尺寸观察，jsdom 均未实现。
// 缺失会让下拉在测试中无法展开（pointerdown 触发 setPointerCapture 抛错）。
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => undefined;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom 未实现 blob 对象 URL（图片附件预览/回流依赖；原生实现存在但会抛 Not implemented）
if (typeof URL !== 'undefined') {
  URL.createObjectURL = () => `blob:mock-${Math.random().toString(36).slice(2)}`;
  URL.revokeObjectURL = () => undefined;
}

// jsdom 未实现 EventSource（编译进度/任务/Flow 的 SSE 订阅）；
// 组件测试只验证挂载不崩与查询失效，不做真实流行为，故提供空实现。
if (typeof globalThis.EventSource === 'undefined') {
  class EventSourceStub {
    addEventListener(): void {}
    removeEventListener(): void {}
    close(): void {}
  }
  globalThis.EventSource = EventSourceStub as unknown as typeof EventSource;
}

afterEach(() => {
  cleanup();
  // Radix Presence 在 jsdom 下可能遗留 portal 节点（动画不触发 unmount），
  // 统一清空 body，避免全屏 overlay 拦截后续用例的指针事件。
  if (typeof document !== 'undefined') {
    document.body.innerHTML = '';
  }
});
