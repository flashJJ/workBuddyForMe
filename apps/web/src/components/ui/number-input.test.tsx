// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NumberInput } from './number-input';

describe('NumberInput 数值输入', () => {
  it('点加减号按步进回传新值', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput value={5} onValueChange={onValueChange} data-testid="n" />);

    await user.click(screen.getByLabelText('增加'));
    expect(onValueChange).toHaveBeenCalledWith(6);

    await user.click(screen.getByLabelText('减少'));
    expect(onValueChange).toHaveBeenCalledWith(4);
  });

  it('达到上下限时对应按钮禁用', () => {
    render(<NumberInput value={1} min={1} max={1} onValueChange={() => undefined} data-testid="n" />);
    expect(screen.getByLabelText('减少')).toBeDisabled();
    expect(screen.getByLabelText('增加')).toBeDisabled();
  });

  it('输入超限值失焦后回退到钳制值，不上报非法值', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <NumberInput value={1} min={1} max={50} onValueChange={onValueChange} aria-label="步数" />,
    );

    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '999');
    await user.tab();

    expect(onValueChange).toHaveBeenCalledWith(50);
    expect(input).toHaveValue('50');
  });

  it('清空后失焦回退当前值，不上报 NaN', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput value={20} onValueChange={onValueChange} aria-label="步数" />);

    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.tab();

    expect(onValueChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('20');
  });

  it('allowEmpty：未设置时显示为空，清空后失焦回调 onClear', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onClear = vi.fn();
    render(
      <NumberInput
        value={null}
        allowEmpty
        min={1}
        onValueChange={onValueChange}
        onClear={onClear}
        aria-label="上下文"
      />,
    );

    const input = screen.getByRole('spinbutton');
    expect(input).toHaveValue('');

    await user.type(input, '8');
    await user.clear(input);
    await user.tab();

    expect(onClear).toHaveBeenCalled();
    expect(onValueChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
  });

  it('allowEmpty：未设置时点加号落到下限', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<NumberInput value={null} allowEmpty min={1} onValueChange={onValueChange} />);

    await user.click(screen.getByLabelText('增加'));
    expect(onValueChange).toHaveBeenCalledWith(1);
  });
});
