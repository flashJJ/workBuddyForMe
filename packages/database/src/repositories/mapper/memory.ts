import type {
  Memory,
  MemoryKind,
  MemoryScope,
  MemorySource,
  MemoryStatus,
} from '@wbfm/shared/types';

export interface MemoryRow {
  id: number;
  kind: MemoryKind;
  content: string;
  importance: number;
  source_conversation_id: string | null;
  source_message_id: string | null;
  recall_count: number;
  status: MemoryStatus;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  scope: MemoryScope;
  assistant_id: string | null;
  source: MemorySource;
  pinned: number;
  confidence: number;
  subject_key: string | null;
  version: number;
  superseded_by: number | null;
  valid_from: string | null;
  valid_to: string | null;
  ttl_at: string | null;
  last_confirmed_at: string | null;
}

export function mapMemory(row: MemoryRow): Memory {
  return {
    id: String(row.id),
    kind: row.kind,
    content: row.content,
    importance: row.importance,
    sourceConversationId: row.source_conversation_id,
    sourceMessageId: row.source_message_id,
    recallCount: row.recall_count,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at,
    scope: row.scope,
    assistantId: row.assistant_id,
    source: row.source,
    pinned: row.pinned === 1,
    confidence: row.confidence,
    subjectKey: row.subject_key,
    version: row.version,
    supersededBy: row.superseded_by === null ? null : String(row.superseded_by),
    validFrom: row.valid_from,
    validTo: row.valid_to,
    ttlAt: row.ttl_at,
    lastConfirmedAt: row.last_confirmed_at,
  };
}
