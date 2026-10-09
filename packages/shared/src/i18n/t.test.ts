import { describe, expect, it, vi } from 'vitest';
import { createTranslator, lookup, translate } from './t';
import { PLURAL_RULES } from './plural-rules';
import type { MessageNode } from './types';

const dict: MessageNode = {
  simple: '你好',
  greet: '你好，{name}',
  multi: '{a} + {a} + {b}',
  num: '数量：{n}',
  empty: '',
  nested: { deep: { leaf: '深层叶子' } },
  items: '{count, plural, one {# item} other {# items}}',
  itemsZh: '{count, plural, one {# 项} other {# 项}}',
  pluralVar: '{count, plural, one {# message from {user}} other {# messages from {user}}}',
  passthrough: '100% {',
};

const fallbackDict: MessageNode = {
  onlyInFallback: '回退文案',
  fallbackGreet: '回退打招呼 {name}',
  greet: '回退打招呼 {name}',
};

describe('i18n translate 纯函数内核', () => {
  it('1. 简单键直接返回文案', () => {
    expect(translate(dict, 'simple')).toBe('你好');
  });

  it('2. 嵌套点路径寻址', () => {
    expect(translate(dict, 'nested.deep.leaf')).toBe('深层叶子');
  });

  it('3. lookup 直接暴露点路径查询', () => {
    expect(lookup(dict, 'nested.deep.leaf')).toBe('深层叶子');
    expect(lookup(dict, 'nested.deep')).toBeUndefined();
    expect(lookup(undefined, 'x')).toBeUndefined();
  });

  it('4. 路径穿过中间叶子（string）返回 undefined', () => {
    expect(lookup(dict, 'simple.oops')).toBeUndefined();
  });

  it('5. 空字符串是合法翻译，不触发缺键', () => {
    const onMissing = vi.fn();
    expect(translate(dict, 'empty', undefined, { onMissing })).toBe('');
    expect(onMissing).not.toHaveBeenCalled();
  });

  it('6. 单变量插值', () => {
    expect(translate(dict, 'greet', { name: 'Ada' })).toBe('你好，Ada');
  });

  it('7. 同一变量可重复插值且多变量共存', () => {
    expect(translate(dict, 'multi', { a: 1, b: 'x' })).toBe('1 + 1 + x');
  });

  it('8. 数字变量按字符串渲染', () => {
    expect(translate(dict, 'num', { n: 42 })).toBe('数量：42');
  });

  it('9. 无 vars 时插值占位符原样保留', () => {
    expect(translate(dict, 'greet')).toBe('你好，{name}');
  });

  it('10. 缺变量保留占位符并上报 missingVar', () => {
    const onMissing = vi.fn();
    const out = translate(dict, 'greet', undefined, { onMissing });
    expect(out).toBe('你好，{name}');
    expect(onMissing).toHaveBeenCalledWith('missingVar', { key: 'greet', varName: 'name' });
  });

  it('11. 英文复数：count=1 取 one，# 替换为计数', () => {
    const t = createTranslator(dict, { pluralRule: PLURAL_RULES['en-US'] });
    expect(t('items', { count: 1 })).toBe('1 item');
  });

  it('12. 英文复数：count=0/2 取 other', () => {
    const t = createTranslator(dict, { pluralRule: PLURAL_RULES['en-US'] });
    expect(t('items', { count: 0 })).toBe('0 items');
    expect(t('items', { count: 2 })).toBe('2 items');
    expect(t('items', { count: 100 })).toBe('100 items');
  });

  it('13. 中文恒取 other（即便 count=1）', () => {
    const t = createTranslator(dict, { pluralRule: PLURAL_RULES['zh-CN'] });
    expect(t('itemsZh', { count: 1 })).toBe('1 项');
    expect(t('itemsZh', { count: 7 })).toBe('7 项');
  });

  it('14. 复数选项内可再插普通变量', () => {
    const t = createTranslator(dict, { pluralRule: PLURAL_RULES['en-US'] });
    expect(t('pluralVar', { count: 3, user: 'Ada' })).toBe('3 messages from Ada');
    expect(t('pluralVar', { count: 1, user: 'Ada' })).toBe('1 message from Ada');
  });

  it('15. 复数计数缺失：按 0 走 other 并上报 missingVar', () => {
    const onMissing = vi.fn();
    const out = translate(dict, 'items', undefined, {
      pluralRule: PLURAL_RULES['en-US'],
      onMissing,
    });
    expect(out).toBe('0 items');
    expect(onMissing).toHaveBeenCalledWith('missingVar', { key: 'items', varName: 'count' });
  });

  it('16. 缺键回退 fallback 字典并上报 missingKey', () => {
    const onMissing = vi.fn();
    const out = translate(dict, 'onlyInFallback', undefined, { fallbackDict, onMissing });
    expect(out).toBe('回退文案');
    expect(onMissing).toHaveBeenCalledWith('missingKey', { key: 'onlyInFallback' });
  });

  it('17. 回退字典命中的模板同样参与插值', () => {
    const onMissing = vi.fn();
    expect(
      translate(dict, 'fallbackGreet', { name: 'Bo' }, { fallbackDict, onMissing }),
    ).toBe('回退打招呼 Bo');
    expect(onMissing).toHaveBeenCalledWith('missingKey', { key: 'fallbackGreet' });
  });

  it('17b. 主字典命中时不使用回退字典同名键', () => {
    expect(translate(dict, 'greet', { name: 'Bo' }, { fallbackDict })).toBe('你好，Bo');
  });

  it('18. 主备字典都缺键：返回 key 本身，missingKey 只上报一次', () => {
    const onMissing = vi.fn();
    const out = translate(dict, 'not.exist.key', undefined, { fallbackDict, onMissing });
    expect(out).toBe('not.exist.key');
    expect(onMissing).toHaveBeenCalledTimes(1);
    expect(onMissing).toHaveBeenCalledWith('missingKey', { key: 'not.exist.key' });
  });

  it('19. 无 fallback 时缺键直接返回 key', () => {
    expect(translate(dict, 'nope')).toBe('nope');
  });

  it('20. createTranslator 绑定字典与规则后可重复使用', () => {
    const t = createTranslator(dict, {
      fallbackDict,
      pluralRule: PLURAL_RULES['en-US'],
    });
    expect(t('simple')).toBe('你好');
    expect(t('items', { count: 1 })).toBe('1 item');
    expect(t('onlyInFallback')).toBe('回退文案');
  });

  it('21. 未配置 pluralRule 时默认恒 other', () => {
    expect(translate(dict, 'items', { count: 1 })).toBe('1 items');
  });

  it('22. 不含插值的花括号文本不被破坏', () => {
    expect(translate(dict, 'passthrough')).toBe('100% {');
  });

  it('23. 多余变量不产生副作用', () => {
    const onMissing = vi.fn();
    expect(translate(dict, 'simple', { unused: 'x' }, { onMissing })).toBe('你好');
    expect(onMissing).not.toHaveBeenCalled();
  });
});
