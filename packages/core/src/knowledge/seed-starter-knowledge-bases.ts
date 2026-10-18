import { DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE, STARTER_KNOWLEDGE_BASES } from '@wbfm/shared/constants';
import type { KnowledgeBase } from '@wbfm/shared/types';

export interface KnowledgeSeedFields {
  /** 固定 id（内置模板播种用；缺省由仓储生成） */
  id?: string;
  name: string;
  description?: string;
  chunkSize: number;
  chunkOverlap: number;
}

/** 播种所需的最小仓储能力（结构类型，便于单测注入假实现） */
export interface KnowledgeSeeder {
  findById(id: string): KnowledgeBase | null;
  create(fields: KnowledgeSeedFields): KnowledgeBase;
}

/**
 * 启动幂等播种内置知识库模板（对齐内置工作流 / 技能「只增不改」策略）：
 * - 固定 id 已存在则跳过（仅启动播种一次；用户改名/删除后进程内不复活，重启会重新播种）；
 * - 模板默认不带样本文档，只落名称 / 描述 / 推荐分块参数；
 * - 返回本次新播种的知识库数。
 */
export function ensureStarterKnowledgeBases(repo: KnowledgeSeeder): number {
  let seeded = 0;
  for (const starter of STARTER_KNOWLEDGE_BASES) {
    if (repo.findById(starter.id)) continue;
    repo.create({
      id: starter.id,
      name: starter.name,
      description: starter.description,
      chunkSize: starter.chunkSize ?? DEFAULT_CHUNK_SIZE,
      chunkOverlap: starter.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP,
    });
    seeded += 1;
  }
  return seeded;
}
