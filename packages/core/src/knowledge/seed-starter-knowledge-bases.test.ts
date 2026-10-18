import { describe, expect, it } from 'vitest';
import type { KnowledgeBase } from '@wbfm/shared/types';
import { STARTER_KNOWLEDGE_BASES } from '@wbfm/shared/constants';
import {
  ensureStarterKnowledgeBases,
  type KnowledgeSeedFields,
  type KnowledgeSeeder,
} from './seed-starter-knowledge-bases';

/** 内存假仓储：按传入 id 落库（缺省生成自增 id），语义对齐真实仓储 */
function makeRepo(): {
  repo: KnowledgeSeeder;
  rows: Map<string, KnowledgeBase>;
} {
  const rows = new Map<string, KnowledgeBase>();
  return {
    rows,
    repo: {
      findById: (id) => rows.get(id) ?? null,
      create: (fields: KnowledgeSeedFields) => {
        const id = fields.id ?? `generated-${rows.size + 1}`;
        const kb: KnowledgeBase = {
          id,
          name: fields.name,
          description: fields.description ?? '',
          chunkSize: fields.chunkSize,
          chunkOverlap: fields.chunkOverlap,
          documentCount: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        };
        rows.set(id, kb);
        return kb;
      },
    },
  };
}

describe('ensureStarterKnowledgeBases 内置知识库播种', () => {
  it('首次播种返回模板数量，且写入推荐分块参数', () => {
    const { repo, rows } = makeRepo();
    const count = ensureStarterKnowledgeBases(repo);
    expect(count).toBe(STARTER_KNOWLEDGE_BASES.length);
    expect(rows.size).toBe(STARTER_KNOWLEDGE_BASES.length);
    for (const kb of rows.values()) {
      expect(kb.chunkSize).toBeGreaterThan(0);
      expect(kb.chunkOverlap).toBeGreaterThanOrEqual(0);
    }
  });

  it('幂等：第二次播种返回 0，行数不变（固定 id 命中）', () => {
    const { repo, rows } = makeRepo();
    ensureStarterKnowledgeBases(repo);
    const before = rows.size;
    expect(ensureStarterKnowledgeBases(repo)).toBe(0);
    expect(rows.size).toBe(before);
  });

  it('用户删除某个模板后重启：该模板按固定 id 重新播种', () => {
    const { repo, rows } = makeRepo();
    ensureStarterKnowledgeBases(repo);
    const firstId = STARTER_KNOWLEDGE_BASES[0]!.id;
    rows.delete(firstId);
    expect(ensureStarterKnowledgeBases(repo)).toBe(1);
    expect(rows.has(firstId)).toBe(true);
  });
});
