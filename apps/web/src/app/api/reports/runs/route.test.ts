import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, createTaskRunRepository, type DatabaseInstance } from '@wbfm/database';
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
