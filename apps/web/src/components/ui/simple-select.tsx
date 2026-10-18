'use client';

import * as React from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './select';
import { useI18nOptional } from '@/lib/i18n/i18n-context';

/** Radix Select 的 value 不能为空字符串：用哨兵值承载「未选择 / 不限」 */
const EMPTY_VALUE = '__wbfm_empty__';
const toRadixValue = (value: string) => (value === '' ? EMPTY_VALUE : value);
const fromRadixValue = (value: string) => (value === EMPTY_VALUE ? '' : value);

export interface SimpleSelectOption {
  value: string;
  label: React.ReactNode;
}

type OptionElement = React.ReactElement<{ value?: unknown; children?: React.ReactNode }>;
type GroupElement = React.ReactElement<{ label?: React.ReactNode; children?: React.ReactNode }>;

type ParsedNode =
  | { kind: 'group'; label: React.ReactNode; options: SimpleSelectOption[] }
  | { kind: 'option'; option: SimpleSelectOption };

const isOptionNode = (node: React.ReactNode): node is OptionElement =>
  React.isValidElement(node) && node.type === 'option';
const isGroupNode = (node: React.ReactNode): node is GroupElement =>
  React.isValidElement(node) && node.type === 'optgroup';

const toOption = (node: OptionElement): SimpleSelectOption => ({
  value: String(node.props.value ?? ''),
  label: node.props.children,
});

/** 把 `<option>` / `<optgroup>` 子节点解析为可渲染结构（保持旧调用点的 JSX 形态） */
function parseChildren(children: React.ReactNode): ParsedNode[] {
  const nodes: ParsedNode[] = [];
  React.Children.forEach(children, (child) => {
    if (child === null || child === undefined || typeof child === 'boolean') return;
    if (isGroupNode(child)) {
      const options: SimpleSelectOption[] = [];
      React.Children.forEach(child.props.children, (opt) => {
        if (isOptionNode(opt)) options.push(toOption(opt));
      });
      nodes.push({ kind: 'group', label: child.props.label, options });
      return;
    }
    if (isOptionNode(child)) nodes.push({ kind: 'option', option: toOption(child) });
  });
  return nodes;
}

export interface SimpleSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  /** 兼容旧原生写法：`<option>` / `<optgroup>` 子节点 */
  children?: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}

/**
 * v2.3 简易选择器：Radix Select 的「原生语义」外观层。
 *
 * 与旧原生封装对齐——受控 `value` + `<option>` 子节点；空字符串既可作为当前值
 * （此时显示 placeholder）也可作为某个选项值（选中后回传 `''`）。
 * 下拉改由 Radix 渲染，选项有内边距、柔和高亮与选中勾选。
 */
export function SimpleSelect({
  value,
  onValueChange,
  children,
  placeholder,
  disabled,
  id,
  className,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: SimpleSelectProps) {
  const i18n = useI18nOptional();
  const nodes = React.useMemo(() => parseChildren(children), [children]);

  const hasEmptyOption = nodes.some((node) =>
    node.kind === 'option' ? node.option.value === '' : node.options.some((option) => option.value === ''),
  );
  // 空值且没有对应的空值选项时，用自定义占位文案（Radix 始终受控，避免受控/非受控切换告警）
  const showPlaceholder = value === '' && !hasEmptyOption;
  const radixValue = toRadixValue(value);
  const placeholderText = placeholder ?? i18n?.t('common.controls.selectPlaceholder') ?? '请选择';

  return (
    <Select
      value={radixValue}
      onValueChange={(next) => onValueChange(fromRadixValue(next))}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className} aria-label={ariaLabel} data-testid={testId}>
        {showPlaceholder ? (
          <span className="text-muted-foreground">{placeholderText}</span>
        ) : (
          <SelectValue placeholder={placeholderText} />
        )}
      </SelectTrigger>
      <SelectContent>
        {nodes.map((node, index) =>
          node.kind === 'option' ? (
            <SelectItem key={`opt-${index}`} value={toRadixValue(node.option.value)}>
              {node.option.label}
            </SelectItem>
          ) : (
            <SelectGroup key={`group-${index}`}>
              {node.label !== null && node.label !== undefined && <SelectLabel>{node.label}</SelectLabel>}
              {node.options.map((option, optionIndex) => (
                <SelectItem key={`group-${index}-${optionIndex}`} value={toRadixValue(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ),
        )}
      </SelectContent>
    </Select>
  );
}
