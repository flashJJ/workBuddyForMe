import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendBootTiming, createBootTimer, formatTimingLine } from './splash-timing';

describe('createBootTimer', () => {
  it('按顺序记录阶段耗时，重复 mark 不覆盖', () => {
    let now = 0;
    const timer = createBootTimer(() => now);
    now = 100;
    timer.mark('app-ready');
    now = 250;
    timer.mark('server-forked');
    now = 400;
    timer.mark('app-ready');
    expect(timer.elapsed('app-ready')).toBe(100);
    expect(timer.elapsed('server-forked')).toBe(250);
    expect(timer.snapshot({ version: '4.5.0', mode: 'compact' })).toEqual({
      version: '4.5.0',
      mode: 'compact',
      stages: { 'app-ready': 100, 'server-forked': 250 },
      totalMs: 400,
    });
  });
});

describe('formatTimingLine', () => {
  it('单行 JSON，含时间戳与阶段', () => {
    const line = formatTimingLine({
      version: '4.5.0',
      mode: 'full',
      stages: { 'main-ready': 1234 },
      totalMs: 1300,
    });
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toMatchObject({ version: '4.5.0', mode: 'full', totalMs: 1300 });
  });
});

describe('appendBootTiming', () => {
  it('只保留最近 N 行，文件可解析', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wbfm-boot-timing-'));
    for (let i = 0; i < 30; i += 1) {
      appendBootTiming(dir, formatTimingLine({
        version: '4.5.0',
        mode: 'compact',
        stages: { 'main-ready': i },
        totalMs: i,
      }), { maxLines: 20 });
    }
    const file = path.join(dir, 'boot-timing.log');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(20);
    expect(JSON.parse(lines.at(-1)!)).toMatchObject({ totalMs: 29 });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
