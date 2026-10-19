import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, createSettingsRepository, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { recordMilestone } from './milestones';
import { createSettingsService } from './settings-service';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';

describe('v2.4 M1 T7 TTFV 里程碑', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-milestone-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  it('首写优先：重复记录不覆盖第一次时间戳（幂等）', () => {
    recordMilestone(db, 'firstLaunchAt', 1000);
    recordMilestone(db, 'firstLaunchAt', 2000);
    expect(createSettingsService({ db, cipher }).get().firstLaunchAt).toBe(1000);
  });

  it('启动与首答齐备后补算 ttfv_ms', () => {
    recordMilestone(db, 'firstAnswerAt', 5000); // 先有首答也允许
    recordMilestone(db, 'firstLaunchAt', 1000);
    const settings = createSettingsService({ db, cipher }).get();
    expect(settings.firstAnswerAt).toBe(5000);
    expect(settings.ttfvMs).toBe(4000);
  });

  it('只有启动、没有首答时不写 ttfv_ms', () => {
    recordMilestone(db, 'firstLaunchAt', 1000);
    expect(createSettingsService({ db, cipher }).get().ttfvMs).toBeNull();
  });

  it('清除：settings.update 显式传 null 即清空（不影响其他设置）', () => {
    recordMilestone(db, 'firstLaunchAt', 1000);
    recordMilestone(db, 'firstAnswerAt', 5000);
    const service = createSettingsService({ db, cipher });
    expect(service.get().ttfvMs).toBe(4000);

    service.update({ firstLaunchAt: null, firstModelReadyAt: null, firstAnswerAt: null, ttfvMs: null });
    const cleared = service.get();
    expect(cleared.ttfvMs).toBeNull();
    expect(cleared.firstLaunchAt).toBeNull();
    // 里程碑清空不影响其他设置项
    expect(cleared.themeId).toBe('stellar');
  });

  it('里程碑只落时间戳，settings_kv 中不含任何对话内容字段', () => {
    recordMilestone(db, 'firstLaunchAt', 1000);
    const raw = createSettingsRepository(db).getJson<Record<string, unknown>>('app-settings', {});
    expect(Object.keys(raw).sort()).toEqual(['firstLaunchAt']);
  });
});
