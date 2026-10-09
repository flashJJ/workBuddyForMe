import { describe, expect, it } from 'vitest';
import { zhCN } from './zh-CN';
import { enUS } from './en-US';
import type { MessageNode } from './types';

/** 收集字典全部叶子键（点路径） */
function leafKeys(node: MessageNode, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.push(path);
    else out.push(...leafKeys(v, path));
  }
  return out.sort();
}

/**
 * zh-CN 是结构唯一真源：
 * - en-US 不允许出现 zh 中不存在的键（防止陈旧/拼写错误翻译）
 * - 当前所有 namespace 均为 P0，en 必须 100% 覆盖；
 *   将来 P1 域允许缺键时，在 EN_ALLOWED_MISSING_PREFIXES 登记（T4.6）。
 */
const EN_ALLOWED_MISSING_PREFIXES: string[] = [];

describe('i18n 字典 zh/en 结构对齐', () => {
  const zhKeys = leafKeys(zhCN as MessageNode);
  const enKeys = leafKeys(enUS as MessageNode);
  const zhSet = new Set(zhKeys);
  const enSet = new Set(enKeys);

  it('en 不包含 zh 中不存在的键', () => {
    const extras = enKeys.filter((k) => !zhSet.has(k));
    expect(extras).toEqual([]);
  });

  it('P0 命名空间 en 100% 覆盖（缺键须在豁免表登记）', () => {
    const missing = zhKeys.filter(
      (k) =>
        !enSet.has(k) &&
        !EN_ALLOWED_MISSING_PREFIXES.some((p) => k === p || k.startsWith(`${p}.`)),
    );
    expect(missing).toEqual([]);
  });

  it('每个叶子值都是非空字符串（含纯空格视为不合格）', () => {
    const bad: string[] = [];
    const walk = (node: MessageNode, dictName: string, prefix = '') => {
      for (const [k, v] of Object.entries(node)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (typeof v === 'string') {
          if (v.trim() === '') bad.push(`${dictName}:${path}`);
        } else {
          walk(v, dictName, path);
        }
      }
    };
    walk(zhCN as MessageNode, 'zh');
    walk(enUS as MessageNode, 'en');
    expect(bad).toEqual([]);
  });
});
