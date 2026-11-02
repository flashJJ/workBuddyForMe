/** v2.18 M4：内容包清单结构（静态声明，不含正文；正文运行时按固定 URL 下载） */

export interface ContentPackFile {
  filename: string;
  /** 固定提交下的原始文件 URL */
  url: string;
  sha256: string;
  byteSize: number;
}

export interface ContentPackDefinition {
  id: string;
  name: string;
  description: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  /** 上游固定版本标识（首版为 commit 短哈希） */
  version: string;
  publishedAt: string;
  /** 整包 SHA-256：按 files 顺序拼接字节后计算 */
  sha256: string;
  totalBytes: number;
  /** 导入后的知识库固定 id（同时作为「已导入」判定） */
  targetKnowledgeBaseId: string;
  chunkSize: number;
  chunkOverlap: number;
  disclaimer: string;
  files: readonly ContentPackFile[];
}
