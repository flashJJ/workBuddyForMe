import { createHash } from 'node:crypto';
import { ApiError } from '@wbfm/shared/errors';
import type { ContentPackImportResult, ContentPackSummary } from '@wbfm/shared/types';
import type { ServiceDeps } from '../base/deps';
import { resolveEmbeddingTarget } from '../../ingestion/embedding-target';
import { createDocumentService } from './document-service';
import { createKnowledgeService } from './knowledge-service';
import { HOW_TO_LIVE_BETTER } from './how-to-live-better';
import type { ContentPackDefinition, ContentPackFile } from './content-pack-types';

export interface ContentPackServiceOptions {
  /** 可替换清单（测试注入小样本） */
  packs?: readonly ContentPackDefinition[];
  fetchFile?: (url: string) => Promise<Uint8Array>;
  /** 测试/预检钩子：默认检查设置中的 embedding 模型 */
  embeddingReady?: () => boolean;
  /** 注册后是否后台摄入；测试关闭以避免异步写库 */
  autoIngest?: boolean;
}

interface DownloadResult {
  file: ContentPackFile;
  bytes: Uint8Array;
}

const ATTRIBUTION_FILENAME = '00-内容包署名与免责声明.md';
const DOWNLOAD_BATCH = 4;
const DOWNLOAD_TIMEOUT_MS = 30_000;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function defaultFetchFile(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: { 'user-agent': 'WorkBuddyForMe content-pack-importer' },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new ApiError('CONTENT_PACK_FETCH_FAILED', `内容包下载失败（HTTP ${response.status}）`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function buildAttribution(pack: ContentPackDefinition, packHash: string): string {
  return [
    '# 高性价比人生指南 · 署名与免责声明',
    '',
    '本文件由 WorkBuddyForMe 自动生成，不属于上游原文。',
    '',
    `- 内容包：${pack.name}`,
    `- 来源：[${pack.sourceUrl}](${pack.sourceUrl})`,
    '- 作者与贡献者：eternity4719/HowToLiveBetter 的作者与贡献者',
    `- 许可：[${pack.license}](${pack.licenseUrl})（署名 4.0 国际）`,
    `- 版本：${pack.version}（上游发布于 ${pack.publishedAt}）`,
    `- 整包 SHA-256：\`${packHash}\``,
    `- 导入日期：${new Date().toISOString().slice(0, 10)}`,
    '',
    '导入说明：应用仅将上游 `book/` 目录的 34 节 Markdown 原样入库，未修改正文；为便于检索按节拆分为多个文档。',
    '引用格式：回答应注明「第 N 节第 M 条」，例如「第 1 节第 1 条（系安全带）」；没有检索到对应条目时不要凭记忆补数字。',
    '',
    '## 免责声明',
    '',
    pack.disclaimer,
    '',
    '本书内容可能过时，各地政策与执行口径不一；办事、看病、打官司时以当地部门、医生和律师的说法为准。',
    '发现原文错误请向上游仓库提 issue；本应用不提供个性化医疗诊断、法律意见或投资建议。',
  ].join('\n');
}

export function createContentPackService(
  deps: ServiceDeps,
  options: ContentPackServiceOptions = {},
) {
  const packs = options.packs ?? [HOW_TO_LIVE_BETTER];
  const fetchFile = options.fetchFile ?? defaultFetchFile;
  const embeddingReady =
    options.embeddingReady ?? (() => resolveEmbeddingTarget(deps) !== null);
  const autoIngest = options.autoIngest ?? true;
  const knowledge = createKnowledgeService(deps);
  const documents = createDocumentService(deps);

  const requirePack = (id: string): ContentPackDefinition => {
    const pack = packs.find((item) => item.id === id);
    if (!pack) throw ApiError.notFound('内容包', id);
    return pack;
  };

  const summaryOf = (pack: ContentPackDefinition): ContentPackSummary => {
    const knowledgeBase = knowledge.list().find((kb) => kb.id === pack.targetKnowledgeBaseId);
    return {
      id: pack.id,
      name: pack.name,
      description: pack.description,
      sourceUrl: pack.sourceUrl,
      license: pack.license,
      licenseUrl: pack.licenseUrl,
      version: pack.version,
      publishedAt: pack.publishedAt,
      fileCount: pack.files.length,
      totalBytes: pack.totalBytes,
      sha256: pack.sha256,
      disclaimer: pack.disclaimer,
      imported: Boolean(knowledgeBase),
      documentCount: knowledgeBase?.documentCount ?? 0,
    };
  };

  /** 下载并逐文件校验；任一失败抛错，调用方不会创建知识库 */
  const downloadAll = async (pack: ContentPackDefinition): Promise<DownloadResult[]> => {
    const downloaded: DownloadResult[] = [];
    for (let start = 0; start < pack.files.length; start += DOWNLOAD_BATCH) {
      const batch = pack.files.slice(start, start + DOWNLOAD_BATCH);
      const results = await Promise.all(
        batch.map(async (file) => {
          let bytes: Uint8Array;
          try {
            bytes = await fetchFile(file.url);
          } catch (error) {
            if (error instanceof ApiError) throw error;
            throw new ApiError('CONTENT_PACK_FETCH_FAILED', `内容包文件下载失败：${file.filename}`);
          }
          if (bytes.byteLength !== file.byteSize) {
            throw new ApiError(
              'CONTENT_PACK_HASH_MISMATCH',
              `内容包文件大小不一致：${file.filename}`,
            );
          }
          if (sha256(bytes) !== file.sha256) {
            throw new ApiError(
              'CONTENT_PACK_HASH_MISMATCH',
              `内容包文件校验失败：${file.filename}`,
            );
          }
          return { file, bytes };
        }),
      );
      downloaded.push(...results);
    }
    const packHash = sha256(
      Buffer.concat(downloaded.map((item) => Buffer.from(item.bytes))),
    );
    if (packHash !== pack.sha256) {
      throw new ApiError('CONTENT_PACK_HASH_MISMATCH', '内容包整包校验失败，未导入任何内容');
    }
    return downloaded;
  };

  const ingestAll = async (
    entries: Array<{ documentId: string; bytes: Uint8Array }>,
  ): Promise<void> => {
    for (const entry of entries) {
      try {
        await documents.ingest(entry.documentId, entry.bytes);
      } catch (error) {
        console.warn('[content-pack] 文档摄入异常', entry.documentId, error);
      }
    }
  };

  const importPack = async (id: string): Promise<ContentPackImportResult> => {
    const pack = requirePack(id);
    if (knowledge.list().some((kb) => kb.id === pack.targetKnowledgeBaseId)) {
      throw ApiError.conflict(`内容包「${pack.name}」已导入，请勿重复导入`);
    }
    if (!embeddingReady()) {
      throw new ApiError(
        'EMBEDDING_NOT_CONFIGURED',
        '未配置可用的 embedding 模型，请先在设置中绑定向量模型',
      );
    }

    const downloaded = await downloadAll(pack);
    const packHash = pack.sha256;
    const knowledgeBase = knowledge.create({
      id: pack.targetKnowledgeBaseId,
      name: pack.name,
      description: `${pack.description}（${pack.license}，版本 ${pack.version}）`,
      chunkSize: pack.chunkSize,
      chunkOverlap: pack.chunkOverlap,
    });

    try {
      const attributionBytes = new TextEncoder().encode(buildAttribution(pack, packHash));
      const attribution = documents.upload(knowledgeBase.id, {
        filename: ATTRIBUTION_FILENAME,
        buffer: attributionBytes,
      });
      const registered = downloaded.map((item) => ({
        document: documents.upload(knowledgeBase.id, {
          filename: item.file.filename,
          buffer: item.bytes,
        }),
        bytes: item.bytes,
      }));

      if (autoIngest) {
        void ingestAll([
          { documentId: attribution.id, bytes: attributionBytes },
          ...registered.map((item) => ({ documentId: item.document.id, bytes: item.bytes })),
        ]);
      }

      return {
        packId: pack.id,
        knowledgeBase: knowledge.get(knowledgeBase.id),
        importedDocuments: registered.length + 1,
        sha256: packHash,
      };
    } catch (error) {
      try {
        knowledge.delete(knowledgeBase.id);
      } catch (cleanupError) {
        console.warn('[content-pack] 导入失败后清理知识库失败', cleanupError);
      }
      throw error;
    }
  };

  return {
    list(): ContentPackSummary[] {
      return packs.map(summaryOf);
    },
    importPack,
  };
}

export type ContentPackService = ReturnType<typeof createContentPackService>;
