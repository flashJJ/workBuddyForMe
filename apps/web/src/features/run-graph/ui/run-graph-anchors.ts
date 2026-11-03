/**
 * v2.20 M3：光线锚点解析。
 * 源优先聊天消息气泡（真实指向），其次图中父节点卡片；目标为节点卡片。
 */
import type { RunGraphNode } from '@wbfm/shared/types';
import type { LightAnchor } from '@/components/ui/light-layer';

const LIGHT_TOKENS = new Set(['primary', 'info', 'success', 'warning', 'destructive']);
const MESSAGE_MARKER = ':message:';

export function nodeElement(nodeId: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(`[data-graph-node-id="${nodeId}"]`);
}

function messageIdOf(node: RunGraphNode): string | null {
  if (node.scope !== 'chat') return null;
  const index = node.id.lastIndexOf(MESSAGE_MARKER);
  return index >= 0 ? node.id.slice(index + MESSAGE_MARKER.length) : null;
}

function chatBubble(messageId: string | null): HTMLElement | null {
  if (!messageId || typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
}

/** 返回惰性锚点：目标/源节点可能在同一帧尚未渲染，由 light layer 重试一次 */
export function resolveSourceAnchor(
  node: RunGraphNode,
  nodes: ReadonlyMap<string, RunGraphNode>,
  rootNodeId: string,
): LightAnchor {
  return () => {
    const parent = node.parentId ? nodes.get(node.parentId) ?? null : null;
    const messageNode =
      node.kind === 'message' ? node : parent?.kind === 'message' ? parent : null;
    const bubble = messageNode ? chatBubble(messageIdOf(messageNode)) : null;
    if (bubble) return bubble;
    if (parent) return nodeElement(parent.id);
    return nodeElement(rootNodeId);
  };
}

export function lightTokenForLane(token: string | undefined): string {
  if (token && LIGHT_TOKENS.has(token)) return token;
  return 'primary';
}
