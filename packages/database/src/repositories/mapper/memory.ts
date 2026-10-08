import type {
  Memory,
  MemoryKind,
  MemoryStatus,
} from '@wbfm/shared/types';

export interface MemoryRow {
  id: number;
  kind: MemoryKind;
  content: string;
  importance: number;
  source_conversation_id: string | null;
  status: MemoryStatus;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
}

export function mapMemory(row: MemoryRow): Memory {
  return {
    id: String(row.id),
    kind: row.kind,
    content: row.content,
    importance: row.importance,
    sourceConversationId: row.source_conversation_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at,
  };
}
