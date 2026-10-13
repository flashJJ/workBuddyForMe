import { describe, expect, it } from 'vitest';
import { parseReminderRequest } from './reminder-parse';

/** 固定「现在」：2026-10-14（周三）上海时间 10:00 = UTC 02:00 */
const NOW = Date.UTC(2026, 9, 14, 2, 0, 0);

describe('parseReminderRequest（v1.7 对话创建提醒）', () => {
  it('无起词/否定式：none', () => {
    expect(parseReminderRequest('明天好像要下雨', NOW).outcome).toBe('none');
    expect(parseReminderRequest('不用提醒我吃药', NOW).outcome).toBe('none');
    expect(parseReminderRequest('别提醒他开会', NOW).outcome).toBe('none');
    expect(parseReminderRequest('', NOW).outcome).toBe('none');
  });

  it('今天未来时刻：once + 今天', () => {
    const r = parseReminderRequest('提醒我今天下午3点半开会', NOW);
    expect(r.outcome).toBe('create');
    if (r.outcome !== 'create') throw new Error('expected create');
    expect(r.reminder).toMatchObject({
      kind: 'once',
      hour: 15,
      minute: 30,
      atDate: '2026-10-14',
      text: '开会',
    });
  });

  it('今天已过的裸钟点：自动排到明天', () => {
    const r = parseReminderRequest('提醒我早上8点吃药' /* 现在 10 点 */, NOW);
    expect(r.outcome).toBe('create');
    if (r.outcome !== 'create') throw new Error('expected create');
    expect(r.reminder).toMatchObject({ kind: 'once', hour: 8, minute: 0, atDate: '2026-10-15' });
  });

  it('明天/后天 + HH:MM', () => {
    const r1 = parseReminderRequest('叫我明天9:00交周报', NOW);
    expect(r1.outcome).toBe('create');
    if (r1.outcome !== 'create') throw new Error('expected create');
    expect(r1.reminder).toMatchObject({ kind: 'once', hour: 9, minute: 0, atDate: '2026-10-15', text: '交周报' });

    const r2 = parseReminderRequest('通知我后天晚上7点30分吃饭', NOW);
    expect(r2.outcome).toBe('create');
    if (r2.outcome !== 'create') throw new Error('expected create');
    expect(r2.reminder).toMatchObject({ kind: 'once', hour: 19, minute: 30, atDate: '2026-10-16', text: '吃饭' });
  });

  it('每周 X：weekly + weekday（JS getDay 口径，周日=0）', () => {
    const fri = parseReminderRequest('提醒我每周五下午6点复盘', NOW);
    expect(fri.outcome).toBe('create');
    if (fri.outcome !== 'create') throw new Error('expected create');
    expect(fri.reminder).toMatchObject({ kind: 'weekly', weekday: 5, hour: 18, minute: 0, text: '复盘' });

    const sun = parseReminderRequest('提醒我周日10点给家里打电话', NOW);
    expect(sun.outcome).toBe('create');
    if (sun.outcome !== 'create') throw new Error('expected create');
    expect(sun.reminder.weekday).toBe(0);
  });

  it('每天 X点：daily', () => {
    const r = parseReminderRequest('提醒我每天晚上11点睡觉', NOW);
    expect(r.outcome).toBe('create');
    if (r.outcome !== 'create') throw new Error('expected create');
    expect(r.reminder).toMatchObject({ kind: 'daily', hour: 23, minute: 0, text: '睡觉' });
  });

  it('相对时间：N 小时/分钟后', () => {
    const r1 = parseReminderRequest('30分钟后提醒我看烤箱', NOW);
    expect(r1.outcome).toBe('create');
    if (r1.outcome !== 'create') throw new Error('expected create');
    expect(r1.reminder).toMatchObject({ kind: 'once', hour: 10, minute: 30, atDate: '2026-10-14' });

    const r2 = parseReminderRequest('提醒我2小时后喝水', NOW);
    expect(r2.outcome).toBe('create');
    if (r2.outcome !== 'create') throw new Error('expected create');
    expect(r2.reminder).toMatchObject({ kind: 'once', hour: 12, minute: 0, atDate: '2026-10-14', text: '喝水' });
  });

  it('缺时间或缺正文：needTime 追问，不猜时间', () => {
    expect(parseReminderRequest('提醒我明天交报告', NOW).outcome).toBe('needTime');
    expect(parseReminderRequest('提醒我下午', NOW).outcome).toBe('needTime');
    expect(parseReminderRequest('提醒我每天喝水', NOW).outcome).toBe('needTime');
  });

  it('时段词独立出现给默认钟点（今晚 20 点）', () => {
    const r = parseReminderRequest('提醒我今晚上传日志', NOW);
    expect(r.outcome).toBe('create');
    if (r.outcome !== 'create') throw new Error('expected create');
    expect(r.reminder).toMatchObject({ kind: 'once', hour: 20, minute: 0, atDate: '2026-10-14' });
  });
});
