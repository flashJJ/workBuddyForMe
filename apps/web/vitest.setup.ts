import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom 未实现滚动 API
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// jsdom 未实现 blob 对象 URL（图片附件预览/回流依赖；原生实现存在但会抛 Not implemented）
if (typeof URL !== 'undefined') {
  URL.createObjectURL = () => `blob:mock-${Math.random().toString(36).slice(2)}`;
  URL.revokeObjectURL = () => undefined;
}

afterEach(() => {
  cleanup();
  // Radix Presence 在 jsdom 下可能遗留 portal 节点（动画不触发 unmount），
  // 统一清空 body，避免全屏 overlay 拦截后续用例的指针事件。
  if (typeof document !== 'undefined') {
    document.body.innerHTML = '';
  }
});
