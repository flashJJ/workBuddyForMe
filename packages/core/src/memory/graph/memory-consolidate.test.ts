import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, createMemoryEdgeRepository, type DatabaseInstance } from '@wbfm/database';
import type { Memory } from '@wbfm/shared/types';
import type { SecretCipher } from '../../secrets/cipher';
import { createWebCipher } from '../../secrets/cipher';
import { createMemoryService } from '../memory-service';
import {
  normalizeMemoryContent,
  normalizeSubjectKey,
  planDuplicateArchive,
  planSubjectMerge,
} from './memory-consolidate';

function memoryOf(id: string, patch: Partial<Memory> = {}): Memory {
  return {
    id,
    kind: 'fact',
    content: `记忆 ${id}`,
    importance: 0.5,
    status: 'active',
    pinned: false,
    scope: 'global',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch,
  } as Memory;
}

describe('空闲整理纯函数（v2.31）', () => {
  it('主体键归一：去空白、全角、大小写与标点', () => {
    expect(normalizeSubjectKey(' 工作 地点 ')).toBe('工作地点');
    expect(normalizeSubjectKey('City。')).toBe('city');
    expect(normalizeSubjectKey('ＡＢＣ')).toBe('ａｂｃ');
  });

  it('同义主体合并到最常见写法，置顶与约束不参与', () => {
    const plan = planSubjectMerge([
      memoryOf('1', { subjectKey: 'City' }),
      memoryOf('2', { subjectKey: 'city' }),
      memoryOf('3', { subjectKey: 'CITY' }),
      memoryOf('4', { subjectKey: 'city ', pinned: true }),
    ]);
    expect(plan.get('2')).toBe('City');
    expect(plan.get('3')).toBe('City');
    expect(plan.has('1')).toBe(false);
    expect(plan.has('4')).toBe(false);
  });

  it('重复内容保留 importance 最高的一条', () => {
    const archive = planDuplicateArchive([
      memoryOf('1', { content: '用户喜欢猫。', importance: 0.4 }),
      memoryOf('2', { content: '用户 喜欢 猫', importance: 0.9 }),
      memoryOf('3', { content: '用户喜欢猫', importance: 0.5, pinned: true }),
    ]);
    expect(archive).toEqual(['1']);
    expect(normalizeMemoryContent('用户喜欢猫。')).toBe(normalizeMemoryContent('用户 喜欢猫'));
  });
});

describe('空闲整理服务（v2.31）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;

  beforeEach(() => {
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    vi.clearAllMocks();
  });

  it('归档重复内容、合并同义主体、清理悬空边并写入摘要', async () => {
    const service = createMemoryService({ db, cipher });
    const keep = await service.createManual({
      kind: 'fact',
      content: '用户喜欢猫',
      importance: 0.9,
      subjectKey: 'City',
    });
    const duplicate = await service.createManual({
      kind: 'fact',
      content: '用户喜欢猫。',
      importance: 0.3,
      subjectKey: 'city',
    });
    await service.createManual({
      kind: 'fact',
      content: '用户常去杭州',
      importance: 0.6,
      subjectKey: 'city',
    });
    createMemoryEdgeRepository(db).link([
      { fromId: '999999', toId: keep.id, relation: 'same_source', weight: 0.8 },
    ]);

    const summary = service.consolidate();
    expect(summary.scanned).toBe(3);
    expect(summary.archived).toBe(1);
    expect(summary.mergedSubjects).toBe(1);
    expect(summary.edgesRemoved).toBe(1);

    const archived = service.get(duplicate.id);
    expect(archived?.status).toBe('archived');
    expect(service.get(keep.id)?.subjectKey).toBe('city');

    const stats = service.getStats();
    expect(stats.lastConsolidate?.archived).toBe(1);
    expect(stats.edgeTotal).toBe(0);
  });
});
