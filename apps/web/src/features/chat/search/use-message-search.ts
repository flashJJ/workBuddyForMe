'use client';

import * as React from 'react';
import { unwrapEnvelope, type ApiEnvelope } from '@wbfm/shared/api';
import { withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

interface RawEvent {
  id: string;
  scopeId: string;
  type: string;
  payload?: unknown;
  createdAt: string;
}

export interface MessageSearchHit {
  id: string;
  conversationId: string;
  messageId: string;
  role: string;
  snippet: string;
  createdAt: string;
}

const DEBOUNCE_MS = 300;
const SNIPPET_MAX = 120;

function toHit(event: RawEvent): MessageSearchHit | null {
  if (event.type !== 'message_started' && event.type !== 'message_completed') return null;
  const payload = (event.payload ?? {}) as { messageId?: string; content?: string; role?: string };
  if (!payload.messageId || !payload.content) return null;
  return {
    id: event.id,
    conversationId: event.scopeId,
    messageId: payload.messageId,
    role: payload.role ?? 'assistant',
    snippet: payload.content.replace(/\s+/g, ' ').slice(0, SNIPPET_MAX),
    createdAt: event.createdAt,
  };
}

/** v4.17：消息检索（仅本机 /api/search），300ms 防抖 + 请求竞态丢弃 */
export function useMessageSearch(open: boolean) {
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<MessageSearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) {
      setHits([]);
      setFailed(false);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          API.search(q, 'chat'),
          withManagedHeaders({ signal: controller.signal }),
        );
        const rows = unwrapEnvelope(
          (await response.json()) as ApiEnvelope<RawEvent[]>,
        );
        if (controller.signal.aborted) return;
        const byMessage = new Map<string, MessageSearchHit>();
        for (const row of rows ?? []) {
          const hit = toHit(row);
          if (hit) byMessage.set(hit.messageId, hit);
        }
        setHits([...byMessage.values()]);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  return { query, setQuery, hits, loading, failed };
}
