import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createReportWidgetRepository,
  createTaskRunRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET } from './route';

const DAY = '2026-10-20';

describe('运行报告 API（v2.6 M5）', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-report-api-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
    const runs = createTaskRunRepository(db);
    const run = runs.createRun({
      conversationId: null,
      assistantId: 'a1',
      goal: '报告任务',
      maxSteps: 5,
    });
    runs.updateRunStatus(run.id, 'completed', 'completed');
    db.prepare(`UPDATE task_runs SET created_at=?, finished_at=? WHERE id=?`).run(
      `${DAY}T01:00:00.000Z`,
      `${DAY}T01:00:02.000Z`,
      run.id,
    );
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('JSON：时间窗与链路筛选返回汇总', async () => {
    const res = await GET(
      new Request(`http://x/api/reports/runs?from=${DAY}&to=${DAY}&chain=task`),
      { params: Promise.resolve({}) },
    );
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.totals).toMatchObject({ total: 1, succeeded: 1, successRate: 100, medianDurationMs: 2000 });
    expect(data.chains).toHaveLength(1);
  });

  it('JSON：附带能力包卡片，复用运行汇总口径', async () => {
    createReportWidgetRepository(db).create({
      id: 'com.example.sample.report-widget',
      packId: 'com.example.sample.report-widget',
      title: '近 7 天任务数',
      configJson: JSON.stringify({
        title: '近 7 天任务数',
        chain: 'task',
        metric: 'run_count',
        windowDays: 7,
      }),
    });
    db.prepare(
      `INSERT INTO report_widgets(id, pack_id, title, config_json, enabled, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
    ).run('broken', 'com.example.sample.report-widget', '坏卡片', '{}', '2026-01-01T00:00:00.000Z');

    const now = new Date();
    db.prepare('UPDATE task_runs SET created_at=?, finished_at=?').run(
      new Date(now.getTime() - 60_000).toISOString(),
      new Date(now.getTime() - 30_000).toISOString(),
    );
    const res = await GET(
      new Request(`http://x/api/reports/runs?from=${DAY}&to=${DAY}&chain=task`),
      { params: Promise.resolve({}) },
    );
    const { data } = await res.json();
    expect(data.widgets).toHaveLength(1);
    expect(data.widgets[0]).toMatchObject({
      id: 'com.example.sample.report-widget',
      title: '近 7 天任务数',
      chain: 'task',
      metric: 'run_count',
      windowDays: 7,
      value: 1,
      failureCode: null,
    });
  });

  it('Markdown / CSV：附件名与 content-type', async () => {
    const markdown = await GET(
      new Request(`http://x/api/reports/runs?from=${DAY}&to=${DAY}&format=markdown&locale=en`),
      { params: Promise.resolve({}) },
    );
    expect(markdown.status).toBe(200);
    expect(markdown.headers.get('content-type')).toContain('text/markdown');
    expect(markdown.headers.get('content-disposition')).toContain(`run-report-${DAY}_${DAY}.md`);
    expect(await markdown.text()).toContain('# Run report');

    const csv = await GET(
      new Request(`http://x/api/reports/runs?from=${DAY}&to=${DAY}&format=csv`),
      { params: Promise.resolve({}) },
    );
    expect(csv.headers.get('content-type')).toContain('text/csv');
    expect(csv.headers.get('content-disposition')).toContain('.csv');
  });
});
