/**
 * v0.7 M2 任务级批量授权（remember='task'）：
 * 内存注册表，按任务作用域（对话 id / 任务运行 id）记录已授权工具，
 * 进程重启即失效——区别于 assistant/all 的落库长期授权。
 */
export interface TaskGrantRegistry {
  /** 授权某工具在该作用域内后续调用免确认 */
  grant(toolName: string, scope: string): void;
  isGranted(toolName: string, scope: string): boolean;
  /** 清空指定作用域（任务结束/会话删除时调用）；缺省清空全部 */
  clear(scope?: string): void;
}

export function createTaskGrantRegistry(): TaskGrantRegistry {
  const grants = new Map<string, Set<string>>();
  return {
    grant(toolName, scope) {
      const set = grants.get(scope) ?? new Set<string>();
      set.add(toolName);
      grants.set(scope, set);
    },
    isGranted(toolName, scope) {
      return grants.get(scope)?.has(toolName) ?? false;
    },
    clear(scope) {
      if (scope === undefined) grants.clear();
      else grants.delete(scope);
    },
  };
}
