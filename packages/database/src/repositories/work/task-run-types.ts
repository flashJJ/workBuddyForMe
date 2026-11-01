import type {
  TaskStepKind,
  TaskStepStatus,
  TaskStepView,
} from '@wbfm/shared/schemas';
import type { Citation } from '@wbfm/shared/types';

/** task_steps 表行列镜像 */
export interface TaskStepRow {
  id: string;
  run_id: string;
  step_index: number;
  kind: string;
  tool_name: string | null;
  reason: string;
  args_json: string;
  result_json: string;
  screenshot_path: string;
  /** v1.4：action 步引用 JSON（''=无） */
  citations_json: string;
  status: string;
  error: string;
  duration_ms: number;
  created_at: string;
}

export interface TaskStepAddFields {
  id?: string;
  runId: string;
  stepIndex: number;
  kind: TaskStepKind;
  toolName?: string | null;
  reason?: string;
  argsJson?: string;
  screenshotPath?: string;
}

export interface TaskStepFinishFields {
  status: Exclude<TaskStepStatus, 'running'>;
  resultJson?: string;
  error?: string;
  durationMs?: number;
  /** 观察步截图附件 id（截图落盘在步完成后才可知） */
  screenshotPath?: string;
  /** v1.4：工具命中引用（落 citations_json；未传保留原值） */
  citations?: Citation[];
}

/** 行→视图；citations_json 解析失败降级为无引用（防历史脏数据炸回放） */
export function mapTaskStep(row: TaskStepRow): TaskStepView {
  let citations: Citation[] | undefined;
  if (row.citations_json) {
    try {
      citations = JSON.parse(row.citations_json) as Citation[];
    } catch {
      citations = undefined;
    }
  }
  return {
    id: row.id,
    runId: row.run_id,
    stepIndex: row.step_index,
    kind: row.kind as TaskStepKind,
    toolName: row.tool_name,
    reason: row.reason,
    argsJson: row.args_json,
    resultJson: row.result_json,
    screenshotPath: row.screenshot_path,
    ...(citations ? { citations } : {}),
    status: row.status as TaskStepStatus,
    error: row.error,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}
