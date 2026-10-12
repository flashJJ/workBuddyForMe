import { describe, expect, it } from 'vitest';
import {
  extractEmotionSignal,
  stripEmotionSignalBlock,
} from './emotion-signal-text';

const FENCED =
  '好的，我们继续。\n```json\n{"emotion":"joy","intensity":0.7,"soulEvent":"praise"}\n```';
const BARE = '没问题，交给我。\n{"emotion":"neutral","soulEvent":"chat"}';

describe('extractEmotionSignal 完整尾块', () => {
  it('围栏块：剥离并解析', () => {
    const result = extractEmotionSignal(FENCED);
    expect(result).not.toBeNull();
    expect(result?.cleaned).toBe('好的，我们继续。');
    expect(result?.signal).toEqual({ emotion: 'joy', intensity: 0.7, soulEvent: 'praise' });
  });

  it('无语言标记围栏/大小写/尾随空白容忍', () => {
    const text = '正文\n```\n{"emotion":"anger","soulEvent":"belittle"}\n```\n\n  \n';
    const result = extractEmotionSignal(text);
    expect(result?.cleaned).toBe('正文');
    expect(result?.signal.emotion).toBe('anger');
    expect(result?.signal.intensity).toBe(0.6);
  });

  it('裸 JSON 对象：剥离并解析', () => {
    const result = extractEmotionSignal(BARE);
    expect(result?.cleaned).toBe('没问题，交给我。');
    expect(result?.signal.soulEvent).toBe('chat');
  });

  it('词表外/越界逐叶回落但仍识别（弱模型脏尾块）', () => {
    const text = '正文\n```json\n{"emotion":"dance","intensity":9,"soulEvent":"hug"}\n```';
    const result = extractEmotionSignal(text);
    expect(result?.signal).toEqual({ emotion: 'neutral', intensity: 0.6, soulEvent: 'chat' });
  });

  it('无尾块返回 null', () => {
    expect(extractEmotionSignal('普通回复，没有任何 JSON。')).toBeNull();
    expect(extractEmotionSignal('')).toBeNull();
  });

  it('普通 JSON 代码示例不被误吞（含协议外根键）', () => {
    const code = '示例：\n```json\n{"name":"test","emotion":"joy"}\n```';
    expect(extractEmotionSignal(code)).toBeNull();
  });

  it('行内/句中 JSON 不被误吞（裸对象前必须是句末空白）', () => {
    const inline = '配置写成 {"emotion":"joy"} 即可';
    expect(extractEmotionSignal(inline)).toBeNull();
  });

  it('只含 intensity 一个键不被承认为协议对象', () => {
    const text = '计算结果：\n{"intensity":0.5}';
    expect(extractEmotionSignal(text)).toBeNull();
  });

  it('损坏 JSON 围栏不剥离（保留原文）', () => {
    const text = '正文\n```json\n{"emotion":"joy",\n```';
    expect(extractEmotionSignal(text)).toBeNull();
  });
});

describe('stripEmotionSignalBlock 流式安全', () => {
  it('完整块等同 extract 的 cleaned', () => {
    expect(stripEmotionSignalBlock(FENCED)).toBe('好的，我们继续。');
    expect(stripEmotionSignalBlock('普通文本')).toBe('普通文本');
  });

  it('半截围栏（含协议键记号）流式中隐藏', () => {
    const partial = '正文\n```json\n{"emotion":"joy","intensity":0.';
    expect(stripEmotionSignalBlock(partial)).toBe('正文');
  });

  it('半截围栏尚无协议键记号时不误隐藏（普通 json 代码片段）', () => {
    const partial = '看这个配置：\n```json\n{"name":"x"';
    expect(stripEmotionSignalBlock(partial)).toBe(partial);
  });

  it('半截裸对象残段（含 soulEvent 记号、前为空白）隐藏', () => {
    const partial = '正文\n{"emotion":"sadness","soulEvent":';
    expect(stripEmotionSignalBlock(partial)).toBe('正文');
  });

  it('普通句子中未闭合花括号不误伤', () => {
    const text = '公式可以写成 { 这样，例如';
    expect(stripEmotionSignalBlock(text)).toBe(text);
  });

  it('超长半截残段不隐藏（超出尾块预算视为普通内容）', () => {
    const long = '正文\n{"emotion":"joy"' + 'x'.repeat(220);
    expect(stripEmotionSignalBlock(long)).toBe(long);
  });
});
