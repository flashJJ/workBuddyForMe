import { describe, expect, it } from 'vitest';
import { createTaskGrantRegistry } from './task-grants';

describe('任务级批量授权（remember=task）', () => {
  it('授权后同作用域免确认，跨作用域不共享', () => {
    const reg = createTaskGrantRegistry();
    reg.grant('mouse_click', 'conv-1');
    expect(reg.isGranted('mouse_click', 'conv-1')).toBe(true);
    expect(reg.isGranted('mouse_click', 'conv-2')).toBe(false);
    expect(reg.isGranted('keyboard_type', 'conv-1')).toBe(false);
  });

  it('clear(scope) 只清该作用域；clear() 清空全部', () => {
    const reg = createTaskGrantRegistry();
    reg.grant('a', 's1');
    reg.grant('b', 's2');
    reg.clear('s1');
    expect(reg.isGranted('a', 's1')).toBe(false);
    expect(reg.isGranted('b', 's2')).toBe(true);
    reg.clear();
    expect(reg.isGranted('b', 's2')).toBe(false);
  });
});
