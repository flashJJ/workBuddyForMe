'use client';

import { FLOW_DESKTOP_CONTROL_TOOLS } from '@wbfm/shared/schemas';
import { type FlowUnattendedPolicy } from '@wbfm/shared/types';
import type { FlowDangerNode } from '@wbfm/core/serving';

/**
 * 端点对话框中的「无人值守危险操作策略」区块（v0.9 M4）：
 * deny_all / allowlist 二选一；白名单可选范围限定为当前发布图中的危险工具，
 * 桌面控制类永久禁选。
 */
export interface EndpointPolicySectionProps {
  policy: FlowUnattendedPolicy;
  dangerNodes: FlowDangerNode[];
  onChange: (policy: FlowUnattendedPolicy) => void;
}

export function EndpointPolicySection({ policy, dangerNodes, onChange }: EndpointPolicySectionProps) {
  const isBanned = (toolName: string) =>
    FLOW_DESKTOP_CONTROL_TOOLS.includes(toolName as never);

  const toggleTool = (toolName: string, checked: boolean) => {
    const current = policy.mode === 'allowlist' ? policy.allowed : [];
    const allowed = checked
      ? Array.from(new Set([...current, toolName]))
      : current.filter((name) => name !== toolName);
    onChange({ mode: 'allowlist', allowed });
  };

  return (
    <div className="rounded-md border p-2.5 text-[11px] leading-relaxed text-muted-foreground">
      <p className="font-medium text-foreground">无人值守危险操作策略</p>
      <p className="mt-1">
        API/MCP 调用无人在场、不会弹出授权：read 工具始终允许，写入/高危工具按以下策略执行。
      </p>
      <div className="mt-2 flex flex-col gap-1.5">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="unattended-policy"
            checked={policy.mode === 'deny_all'}
            onChange={() => onChange({ mode: 'deny_all' })}
          />
          拒绝全部写入/高危操作（推荐，最安全）
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="unattended-policy"
            checked={policy.mode === 'allowlist'}
            onChange={() =>
              onChange({ mode: 'allowlist', allowed: policy.mode === 'allowlist' ? policy.allowed : [] })
            }
          />
          自定义白名单（仅勾选的工具可自动执行）
        </label>
      </div>
      {dangerNodes.length > 0 && (
        <div className="mt-2 rounded bg-background p-2">
          <p className="text-warning">
            当前发布图含 {dangerNodes.length} 个写入/高危节点：
          </p>
          <div className="mt-1 flex flex-col gap-1">
            {dangerNodes.map((node) => {
              const banned = isBanned(node.toolName);
              const checked = policy.mode === 'allowlist' && policy.allowed.includes(node.toolName);
              return (
                <label
                  key={node.nodeId}
                  className={`flex items-center gap-2 ${banned ? 'opacity-60' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={banned || policy.mode !== 'allowlist'}
                    onChange={(e) => toggleTool(node.toolName, e.target.checked)}
                  />
                  <span className="font-mono">{node.toolName}</span>
                  <span className="rounded bg-muted px-1 text-[10px]">{node.permission}</span>
                  {banned && <span className="text-destructive">桌面控制类，API/MCP 永久禁止</span>}
                </label>
              );
            })}
          </div>
        </div>
      )}
      {policy.mode === 'allowlist' && dangerNodes.length === 0 && (
        <p className="mt-1">当前发布图没有写入/高危工具节点，白名单为空即等价于全部拒绝。</p>
      )}
    </div>
  );
}
