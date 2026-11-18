import { describe, expect, it } from 'vitest';
import { parseIntentJson } from './intent-classifier';

describe('parseIntentJson（v4.8 小模型分类器）', () => {
  it('解析合法 JSON 并归一字段', () => {
    const intent = parseIntentJson(
      '{"kind":"knowledge","confidence":0.86,"signals":["question"],"suggestedTaskMode":false}',
    );
    expect(intent).toMatchObject({
      kind: 'knowledge',
      confidence: 0.86,
      signals: ['question'],
      source: 'classifier',
    });
  });

  it('容忍代码块与前后废话', () => {
    const intent = parseIntentJson(
      '分类结果如下：\n```json\n{"kind":"tool_task","confidence":0.9,"signals":[],"suggestedTaskMode":true}\n```',
    );
    expect(intent?.kind).toBe('tool_task');
    expect(intent?.signals).toEqual(['small-model']);
    expect(intent?.suggestedTaskMode).toBe(true);
  });

  it('非法 kind 或置信度返回 null', () => {
    expect(parseIntentJson('{"kind":"unknown","confidence":0.9}')).toBeNull();
    expect(parseIntentJson('{"kind":"knowledge","confidence":1.4}')).toBeNull();
    expect(parseIntentJson('{"kind":"knowledge"}')).toBeNull();
    expect(parseIntentJson('不是 JSON')).toBeNull();
  });
});
