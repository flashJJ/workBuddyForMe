/**
 * 知识编译触发服务（v1.3 M3 即时版；M4 将替换为单并发队列+进度/取消）。
 *
 * 当前语义：在一次调用内顺序编译目标文档集合（顺序即天然单并发），
 * 单文档失败不阻断其余文档，结果逐条返回。规则通道零模型调用；
 * withLlm=true 时挂载可选增强器（任何失败仍在编译器内降级规则）。
 */

import { createDocumentRepository, createKnowledgeRepository } from '@wbfm/database';
import { createSettingsRepository } from '@wbfm/database';
import type { ServiceDeps } from '../services/deps';
import { compileDocument } from './knowledge-compiler';
import { createLlmKnowledgeEnhancer } from './llm-enhancer';

const SETTINGS_KEY = 'app-settings';

export type CompileScope = 'new' | 'all' | 'document';

export interface CompileScopeOptions {
  scope: CompileScope;
  documentId?: string;
  withLlm?: boolean;
  signal?: AbortSignal;
}

export interface CompileDocOutcome {
  documentId: string;
  status: 'ready' | 'failed';
  generation?: number;
  extractor?: 'rule' | 'llm';
  error?: string;
}

export interface CompileScopeResult {
  total: number;
  ready: number;
  failed: number;
  results: CompileDocOutcome[];
}

export function createCompileRunnerService(deps: ServiceDeps) {
  return {
    async compileKnowledgeBase(
      knowledgeBaseId: string,
      options: CompileScopeOptions,
    ): Promise<CompileScopeResult> {
      const kbRepo = createKnowledgeRepository(deps.db);
      if (!kbRepo.findById(knowledgeBaseId)) {
        throw new Error(`knowledge base not found: ${knowledgeBaseId}`);
      }
      const docRepo = createDocumentRepository(deps.db);
      const all = docRepo.listByKnowledgeBase(knowledgeBaseId);

      let targets = all;
      if (options.scope === 'document') {
        if (!options.documentId) throw new Error('document scope requires documentId');
        const target = all.find((d) => d.id === options.documentId);
        if (!target) throw new Error(`document not found in kb: ${options.documentId}`);
        targets = [target];
      } else if (options.scope === 'new') {
        // queued=重摄取/新摄入待编；ready/failed/skipped 不在「新增」范围
        targets = all.filter((d) => d.compileStatus === 'queued');
      } else {
        // all：全部已分片文档（chunk_count>0），无论既有编译状态
        targets = all.filter((d) => d.chunkCount > 0);
      }

      const settings = createSettingsRepository(deps.db).getJson(SETTINGS_KEY, null) as
        | { compileWithLlm?: boolean; compileModelId?: string | null }
        | null;
      const useLlm = options.withLlm === true || settings?.compileWithLlm === true;
      const enhancer = useLlm
        ? createLlmKnowledgeEnhancer(deps, { modelId: settings?.compileModelId ?? null })
        : undefined;

      const results: CompileDocOutcome[] = [];
      for (const doc of targets) {
        try {
          const saved = await compileDocument(deps, doc.id, { enhancer, signal: options.signal });
          results.push({
            documentId: doc.id,
            status: 'ready',
            generation: saved.generation,
            extractor: saved.extractor,
          });
        } catch (error) {
          results.push({
            documentId: doc.id,
            status: 'failed',
            error: error instanceof Error ? error.message.slice(0, 300) : 'compile failed',
          });
        }
      }

      return {
        total: results.length,
        ready: results.filter((r) => r.status === 'ready').length,
        failed: results.filter((r) => r.status === 'failed').length,
        results,
      };
    },
  };
}

export type CompileRunnerService = ReturnType<typeof createCompileRunnerService>;
