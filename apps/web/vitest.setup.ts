import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom 未实现滚动 API
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

afterEach(() => {
  cleanup();
  // Radix Presence 在 jsdom 下可能遗留 portal 节点（动画不触发 unmount），
  // 统一清空 body，避免全屏 overlay 拦截后续用例的指针事件。
  if (typeof document !== 'undefined') {
    document.body.innerHTML = '';
  }
});
