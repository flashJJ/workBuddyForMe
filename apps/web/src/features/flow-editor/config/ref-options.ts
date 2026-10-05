import type { FlowInputField } from '@wbfm/shared';
import { NODE_META, nodeTitle, buildRefToken } from '../node-meta';
import type { FlowCanvasNode } from '../graph-utils';

export interface RefOption {
  /** 下拉展示 */
  label: string;
  /** 插入到文本的 token */
  token: string;
  /** 分组名（节点标题） */
  group: string;
}

/**
 * 基于当前画布节点构造可引用变量：
 * - start.params.<入参字段>
 * - 其他节点 outputs.<字段>（按节点元数据）
 * 仅列出当前节点之外的节点（不能引用自己）。
 */
export function buildRefOptions(nodes: FlowCanvasNode[], currentNodeId: string): RefOption[] {
  const options: RefOption[] = [];
  for (const node of nodes) {
    if (node.id === currentNodeId) continue;
    const title = nodeTitle(node.type, node.data.config);
    const group = `${title} · ${node.id}`;

    if (node.type === 'start') {
      const inputs = Array.isArray(node.data.config.inputs)
        ? (node.data.config.inputs as FlowInputField[])
        : [];
      for (const field of inputs) {
        if (!field?.name) continue;
        options.push({
          group,
          label: `入参 ${field.name}`,
          token: buildRefToken(node.id, 'params', field.name),
        });
      }
      continue;
    }

    for (const field of NODE_META[node.type].outputFields) {
      options.push({
        group,
        label: field.hint,
        token: buildRefToken(node.id, 'outputs', field.key),
      });
    }
  }
  return options;
}
