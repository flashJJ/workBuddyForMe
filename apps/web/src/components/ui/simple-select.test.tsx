// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SimpleSelect } from './simple-select';

/**
 * jsdom 下 Radix Select 的稳定驱动方式：`pointerdown`/`user-event click` 都打不开面板，
 * 键盘 `ArrowDown` 能打开，随后对选项 `click` 即触发选择（真机与 E2E 覆盖指针路径）。
 */
function openDropdown(testId: string): void {
  fireEvent.keyDown(screen.getByTestId(testId), { key: 'ArrowDown' });
}

function chooseOption(name: string): void {
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('SimpleSelect 统一选择器', () => {
  it('展示当前值，点选新项后回传该值', () => {
    const onValueChange = vi.fn();
    render(
      <SimpleSelect value="a" onValueChange={onValueChange} aria-label="示例" data-testid="sel">
        <option value="a">选项 A</option>
        <option value="b">选项 B</option>
      </SimpleSelect>,
    );

    expect(screen.getByTestId('sel')).toHaveTextContent('选项 A');
    openDropdown('sel');
    chooseOption('选项 B');
    expect(onValueChange).toHaveBeenCalledWith('b');
  });

  it('空字符串 value：有对应空值选项时显示其文案', () => {
    render(
      <SimpleSelect value="" onValueChange={() => undefined} aria-label="示例" data-testid="sel">
        <option value="">不限</option>
        <option value="x">X</option>
      </SimpleSelect>,
    );
    expect(screen.getByTestId('sel')).toHaveTextContent('不限');
  });

  it('选中空值选项时回传空字符串（哨兵值适配）', () => {
    const onValueChange = vi.fn();
    render(
      <SimpleSelect value="x" onValueChange={onValueChange} aria-label="示例" data-testid="sel">
        <option value="">不限</option>
        <option value="x">X</option>
      </SimpleSelect>,
    );
    openDropdown('sel');
    chooseOption('不限');
    expect(onValueChange).toHaveBeenCalledWith('');
  });

  it('optgroup 分组渲染为带标签的选项组', () => {
    const onValueChange = vi.fn();
    render(
      <SimpleSelect value="k1" onValueChange={onValueChange} aria-label="示例" data-testid="sel">
        <optgroup label="触摸">
          <option value="k1">k1</option>
          <option value="k2">k2</option>
        </optgroup>
      </SimpleSelect>,
    );
    openDropdown('sel');
    expect(screen.getByText('触摸')).toBeInTheDocument();
    chooseOption('k2');
    expect(onValueChange).toHaveBeenCalledWith('k2');
  });

  it('无对应空值选项时显示 placeholder', () => {
    render(
      <SimpleSelect
        value=""
        placeholder="请选择助手"
        onValueChange={() => undefined}
        aria-label="示例"
        data-testid="sel"
      >
        <option value="a">选项 A</option>
      </SimpleSelect>,
    );
    expect(screen.getByTestId('sel')).toHaveTextContent('请选择助手');
  });
});
