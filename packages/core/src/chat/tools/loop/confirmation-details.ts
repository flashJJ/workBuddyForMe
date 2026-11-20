import type { ToolContext } from '../../../tools/types';
import type { ToolConfirmationDetails } from '../tool-gate-types';

/** capability_install 的审批目录快照（v2.30）；其余工具无需详情 */
export function confirmationDetailsOf(
  toolCtx: ToolContext,
  name: string,
  args: unknown,
): ToolConfirmationDetails | undefined {
  if (name !== 'capability_install' || !toolCtx.listCapabilities) return undefined;
  // 模型可传 "null"：JSON.parse 得到 null，直接取属性会抛错并中断整轮
  if (!args || typeof args !== 'object') return undefined;
  const catalogId = (args as { catalogId?: unknown }).catalogId;
  if (typeof catalogId !== 'string') return undefined;
  const item = toolCtx.listCapabilities().find((candidate) => candidate.id === catalogId);
  if (!item) return undefined;
  return {
    catalogId: item.id,
    name: item.name,
    kind: item.kind,
    version: item.version,
    source: item.source,
    installStrategy: item.installStrategy,
    ...(item.signatureStatus ? { signatureStatus: item.signatureStatus } : {}),
    permissions: item.permissions,
    effects: item.effects,
    toolNames: item.toolNames,
  };
}
