import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createInstalledEventScriptRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { __buildContainerForTest, __setContainerForTest } from '@/lib/server/container';
import { GET } from './route';

function payloadOf(id: string, title: string): string {
  return JSON.stringify({
    definition: {
      id,
      title,
      priority: 1,
      interruptPolicy: 'ignore',
      cooldownMs: 3_600_000,
      maxPerDay: 2,
      speechLock: 'queue',
      steps: [
        { kind: 'expression', tag: 'joy' },
        { kind: 'speech', text: '今天也辛苦了，早点休息。' },
      ],
    },
    trigger: { kind: 'phrase', phrases: ['晚安', '睡觉了'] },
  });
}

describe('v2.11 能力包剧本 API', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-web-script-')));
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  it('只返回启用剧本；停用与损坏 payload 跳过', async () => {
    const repo = createInstalledEventScriptRepository(db);
    repo.create({
      id: 'usr.goodnight',
      packId: 'com.example.sample.event-script',
      name: '晚安小仪式',
      definitionJson: payloadOf('usr.goodnight', '晚安小仪式'),
    });
    repo.create({
      id: 'usr.nightoff',
      packId: 'com.example.sample.event-script',
      name: '已停用剧本',
      definitionJson: payloadOf('usr.nightoff', '已停用剧本'),
    });
    repo.setEnabled('usr.nightoff', false);
    db.prepare(
      `INSERT INTO installed_event_scripts(id, pack_id, name, definition_json, enabled, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
    ).run('usr.broken', 'com.example.sample.event-script', '坏剧本', 'not-json', '2026-01-01T00:00:00.000Z');

    const res = await GET(new Request('http://127.0.0.1/x/api/event-scripts'));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({
      id: 'usr.goodnight',
      name: '晚安小仪式',
      packId: 'com.example.sample.event-script',
      phrases: ['晚安', '睡觉了'],
    });
    expect(data[0].definition.steps).toHaveLength(2);
  });
});
