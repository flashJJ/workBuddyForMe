import { describe, expect, it } from 'vitest';
import { buildWebhookUrl, formatTriggerTime, parseExtensions } from './trigger-dialog-helpers';

describe('v4.25 触发器对话框 helper', () => {
  it('扩展名归一：去点、小写、去重、支持中英文逗号与空格', () => {
    expect(parseExtensions('MD, .txt，md  json')).toEqual(['md', 'txt', 'json']);
    expect(parseExtensions('  ')).toEqual([]);
  });

  it('Webhook URL 拼接去掉重复斜杠', () => {
    expect(buildWebhookUrl('/api/public/flows/triggers/t1', 'http://127.0.0.1:3000/')).toBe(
      'http://127.0.0.1:3000/api/public/flows/triggers/t1',
    );
  });

  it('时间格式化兜底非法值', () => {
    expect(formatTriggerTime(null)).toBe('—');
    expect(formatTriggerTime('not-a-date')).toBe('not-a-date');
  });
});
