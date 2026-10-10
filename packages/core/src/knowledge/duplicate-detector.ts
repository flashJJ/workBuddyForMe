/**
 * 疑似重复文档建议（v1.3 M3/T3.4，纯函数、只建议不删除）。
 *
 * 两个信号：
 * - title：文件名归一化后相同（去扩展名/空白、去 "(1)"/「副本」/copy 等复制痕迹）；
 * - content：跨文档 chunk 近邻聚合（近邻由服务层用已有向量 KNN 提供，
 *   本模块不接触数据库/模型），达到最小近似片对数才建议。
 * 两信号合并标注 reason；输出确定性排序，供 UI 仅展示与跳转。
 */

export interface DuplicateDoc {
  documentId: string;
  filename: string;
}

export type DuplicateReason = 'title' | 'content';

export interface ChunkNeighborHit {
  sourceChunkId: number;
  sourceDocumentId: string;
  neighborChunkId: number;
  neighborDocumentId: string;
  /** 相似度 0-1（单位向量 1-distance/2） */
  similarity: number;
}

export interface DuplicatePair {
  documentA: DuplicateDoc;
  documentB: DuplicateDoc;
  reasons: DuplicateReason[];
  /** content 信号：近似分片对数（去重无序片对） */
  matchedChunks: number;
  /** content 信号：片对中的最高相似度 */
  maxSimilarity: number;
}

export interface DuplicateOptions {
  /** content 信号成立所需的最小跨文档近似片对数 */
  minChunkPairs?: number;
}

const COPY_PATTERNS = [
  /[（(]\s*\d{1,3}\s*[)）]\s*$/, // 报告 (1).pdf / 报告（2）
  /[-_\s]*(?:副本|copy)\s*\d*$/i, // 报告-副本 / report copy 2
];

/**
 * 文件名归一化：去扩展名、NFKC、小写、去复制痕迹与空白标点。
 * 过短（<2 字符）返回空串（不参与标题分组）。
 */
export function normalizeDocumentTitle(filename: string): string {
  let name = filename.normalize('NFKC').toLowerCase().trim();
  const dot = name.lastIndexOf('.');
  if (dot > 0 && /^\.[a-z0-9]{1,6}$/.test(name.slice(dot))) name = name.slice(0, dot);
  for (const pattern of COPY_PATTERNS) name = name.replace(pattern, '');
  return name
    .replace(/[\s·・,，.。:：;；/\\|[\]()（）【】{}'"’“”_-]+/g, '')
    .trim();
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}${b}` : `${b}${a}`;
}

/**
 * 纯检测：标题归一化分组 + 跨文档近邻片对聚合。
 * 同文档的近邻命中自动忽略；片对按无序 (chunkA,chunkB) 去重由调用层保证，
 * 本函数按「文档对 + 命中次数」聚合（同向重复不重复计数）。
 */
export function detectDuplicatePairs(
  docs: DuplicateDoc[],
  neighborHits: ChunkNeighborHit[],
  options: DuplicateOptions = {},
): DuplicatePair[] {
  const minChunkPairs = options.minChunkPairs ?? 2;
  const docById = new Map(docs.map((d) => [d.documentId, d]));
  const pairs = new Map<
    string,
    { a: string; b: string; reasons: Set<DuplicateReason>; hits: number; maxSim: number }
  >();

  const ensure = (a: string, b: string) => {
    const key = pairKey(a, b);
    let pair = pairs.get(key);
    if (!pair) {
      const [x, y] = a < b ? [a, b] : [b, a];
      pair = { a: x, b: y, reasons: new Set(), hits: 0, maxSim: 0 };
      pairs.set(key, pair);
    }
    return pair;
  };

  // title 信号
  const byTitle = new Map<string, DuplicateDoc[]>();
  for (const doc of docs) {
    const title = normalizeDocumentTitle(doc.filename);
    if (title.length < 2) continue;
    const group = byTitle.get(title);
    if (group) group.push(doc);
    else byTitle.set(title, [doc]);
  }
  for (const group of byTitle.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        ensure(group[i]!.documentId, group[j]!.documentId).reasons.add('title');
      }
    }
  }

  // content 信号：按无序分片对去重后计数（服务层对每个源片只取预算内近邻）
  const chunkPairs = new Set<string>();
  for (const hit of neighborHits) {
    if (hit.sourceDocumentId === hit.neighborDocumentId) continue;
    const lo = Math.min(hit.sourceChunkId, hit.neighborChunkId);
    const hi = Math.max(hit.sourceChunkId, hit.neighborChunkId);
    const chunkKey = `${lo} ${hi}`;
    if (chunkPairs.has(chunkKey)) continue;
    chunkPairs.add(chunkKey);
    const pair = ensure(hit.sourceDocumentId, hit.neighborDocumentId);
    pair.hits += 1;
    pair.maxSim = Math.max(pair.maxSim, hit.similarity);
  }
  for (const pair of pairs.values()) {
    if (pair.hits >= minChunkPairs) pair.reasons.add('content');
  }

  return [...pairs.values()]
    .filter((p) => p.reasons.size > 0)
    .map((p) => ({
      documentA: docById.get(p.a)!,
      documentB: docById.get(p.b)!,
      reasons: [...p.reasons],
      matchedChunks: p.reasons.has('content') ? p.hits : 0,
      maxSimilarity: p.reasons.has('content') ? Number(p.maxSim.toFixed(4)) : 0,
    }))
    .sort((x, y) =>
      x.documentA.documentId === y.documentA.documentId
        ? x.documentB.documentId.localeCompare(y.documentB.documentId)
        : x.documentA.documentId.localeCompare(y.documentA.documentId),
    );
}
