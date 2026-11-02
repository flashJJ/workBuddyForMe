/**
 * 工具名：v0.6 起为开放式字符串（内置名或 mcp:<server>:<tool> 命名空间），
 * TOOL_NAMES 枚举仅供内置工具的 UI 标签映射使用。
 */

import type { ArtifactFormat } from '../constants/tools';
import type { PermissionLevel } from './permission';

/** v2.18 产物引用：只暴露展示/下载所需元数据，不含磁盘路径 */
export interface ArtifactRef {
  attachmentId: string;
  title: string;
  filename: string;
  format: ArtifactFormat;
  mimeType: string;
  byteSize: number;
}

/** 写入产物（工具/服务层共用；content 为 UTF-8 文本） */
export interface ArtifactWriteInput {
  title: string;
  filename: string;
  format: ArtifactFormat;
  content: string;
}

/**
 * v2.18 M4：可运行时下载导入的示例内容包（正文不随应用分发）。
 * 与产物同属「可交付」领域，类型并入本文件以守 types 目录行数/文件数门禁。
 */
export interface ContentPackSummary {
  id: string;
  name: string;
  description: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  version: string;
  publishedAt: string;
  fileCount: number;
  totalBytes: number;
  /** 整包 SHA-256（按文件顺序拼接后计算） */
  sha256: string;
  disclaimer: string;
  /** 目标知识库已存在即视为已导入 */
  imported: boolean;
  documentCount: number;
}

export interface ContentPackImportResult {
  packId: string;
  /** 新建知识库的最小引用（避免 types/tool ↔ domain 反向类型环） */
  knowledgeBase: { id: string; name: string; documentCount: number };
  /** 含署名页在内的入库文档数 */
  importedDocuments: number;
  sha256: string;
}

/** 工具调用状态（running 仅用于前端流式过程，落库后只会是 ok/error） */
export type ToolCallStatus = 'running' | 'ok' | 'error';

/**
 * v0.8：工具内部子步骤状态（flow 工具逐节点执行时映射为对话工具卡片子步骤）。
 */
export type ToolSubstepStatus = 'running' | 'ok' | 'error' | 'skipped';

export interface ToolSubstep {
  /** 子步骤稳定 id（flow 工具内为节点 id） */
  id: string;
  /** 展示名（节点标题） */
  label: string;
  status: ToolSubstepStatus;
  /** 附加说明（错误信息 / 结果摘要，可选） */
  detail?: string;
}

/**
 * 落库的工具调用轨迹（messages.tool_trace JSON）。
 * 只存展示与审计所需摘要，不存完整网页正文等大块内容。
 */
export interface ToolTraceEntry {
  callId: string;
  tool: string;
  argsSummary: string;
  status: ToolCallStatus;
  durationMs: number;
  resultSummary: string;
  error?: string;
  startedAt: string;
  /** v0.6 M4：工具来源标识（'builtin' | 'mcp:<server>' | 'flow'） */
  source?: string;
  /** v0.6 M4：权限级别（'read' | 'write' | 'danger'） */
  permission?: PermissionLevel;
  /** v0.8：工具内部子步骤（flow 工具的逐节点时间线，落库快照） */
  substeps?: ToolSubstep[];
  /** v1.1：入模 output 是否经中央压缩层裁剪（完整 output 仍只在执行期/trace 摘要可查） */
  compacted?: boolean;
  /** v1.1：压缩前 output 的估算 token（compacted=true 时记录） */
  originalTokens?: number;
  /** v1.1：实际入模视图的估算 token */
  modelTokens?: number;
  /** v2.18：本次工具调用产出的可交付文件（产物卡片展示） */
  artifacts?: ArtifactRef[];
}

/** SSE tool 事件载荷：start / substep（v0.8 流式子步骤）/ end 三阶段 */
export type ToolEventPayload =
  | {
      phase: 'start';
      callId: string;
      tool: string;
      argsSummary: string;
      source?: string;
      permission?: PermissionLevel;
    }
  | {
      /** v0.8：flow 工具执行中逐节点推进；substeps 为截至当前的完整快照 */
      phase: 'substep';
      callId: string;
      substeps: ToolSubstep[];
    }
  | {
      phase: 'end';
      callId: string;
      tool: string;
      status: ToolCallStatus;
      durationMs: number;
      resultSummary: string;
      error?: string;
      source?: string;
      permission?: PermissionLevel;
      substeps?: ToolSubstep[];
      /** v2.18：产物卡片数据 */
      artifacts?: ArtifactRef[];
    };
