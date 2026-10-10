import { describe, expect, it } from 'vitest';
import {
  buildFtsQuery,
  isCjkChar,
  normalizeForFtsIndex,
  tokenizeForFts,
} from './fts-tokenize';

describe('FTS5 中英混合分词纯函数（v1.3 M0）', () => {
  it('纯中文逐字成 token', () => {
    expect(tokenizeForFts('知识编译层')).toEqual(['知', '识', '编', '译', '层']);
  });

  it('2 字中文词是两个 token（修复 unicode61 整段当一个 token 的问题）', () => {
    expect(tokenizeForFts('混合')).toEqual(['混', '合']);
  });

  it('中英混合：拉丁连续序列保留整词并小写', () => {
    expect(tokenizeForFts('WorkBuddy 知识')).toEqual(['workbuddy', '知', '识']);
  });

  it('型号/编号按字母数字连续段切分，冒号点号作分隔', () => {
    expect(tokenizeForFts('qwen2.5:7b')).toEqual(['qwen2', '5', '7b']);
  });

  it('连字符/下划线/空白均为分隔符', () => {
    expect(tokenizeForFts('bge-m3 v2_test')).toEqual(['bge', 'm3', 'v2', 'test']);
  });

  it('数字与字母相连作为一个 token（型号/单位连写，如 228MB）', () => {
    expect(tokenizeForFts('约228MB')).toEqual(['约', '228mb']);
  });

  it('空串/纯标点/纯空白返回空数组', () => {
    expect(tokenizeForFts('')).toEqual([]);
    expect(tokenizeForFts('   ')).toEqual([]);
    expect(tokenizeForFts('：。，！/\\')).toEqual([]);
  });

  it('isCjkChar 只认单个 CJK 表意文字', () => {
    expect(isCjkChar('混')).toBe(true);
    expect(isCjkChar('a')).toBe(false);
    expect(isCjkChar('1')).toBe(false);
    expect(isCjkChar('混合')).toBe(false);
  });

  it('normalizeForFtsIndex 输出空格连接串', () => {
    expect(normalizeForFtsIndex('知识编译层 WorkBuddy')).toBe('知 识 编 译 层 workbuddy');
    expect(normalizeForFtsIndex('')).toBe('');
  });

  it('buildFtsQuery：多 token OR 连接且每项双引号包裹', () => {
    expect(buildFtsQuery('混合')).toBe('"混" OR "合"');
    expect(buildFtsQuery('qwen2.5')).toBe('"qwen2" OR "5"');
  });

  it('buildFtsQuery：空串/纯标点返回 null（调用方应跳过 FTS）', () => {
    expect(buildFtsQuery('')).toBeNull();
    expect(buildFtsQuery('///')).toBeNull();
  });

  it('buildFtsQuery：FTS 特殊字符（AND/NEAR/*）作为普通文本被分词或丢弃，不产生裸操作符', () => {
    // AND/OR/NEAR 经小写化后若为整词会被当普通 term 用双引号包裹，而非裸操作符
    expect(buildFtsQuery('混合 AND 检索')).toBe('"混" OR "合" OR "and" OR "检" OR "索"');
    // 星号/冒号不匹配 token，直接丢弃，不污染表达式
    expect(buildFtsQuery('qwen*')).toBe('"qwen"');
  });
});
