'use client';

import * as React from 'react';
import { AlertTriangle, ChevronRight, Send } from 'lucide-react';
import type { TaskRunView } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/common/state';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/common/toast';
import { useConversations } from '@/lib/hooks/use-conversations';
import { useAssistants } from '@/lib/hooks/use-assistants';
import {
  useTaskEvents,
  useTaskMutations,
  useTasks,
} from '@/lib/hooks/use-tasks';
import { ApiClientError } from '@/lib/api/client';
import { TaskRunStatusBadge } from './task-status-badge';
import { TaskTimeline } from './task-timeline';
import { TaskControlBar } from './task-control-bar';

const NEW_TASK_PLACEHOLDER = '描述要完成的桌面任务，例如：打开记事本，写一句「你好 WorkBuddy」并保存到桌面。';

export function TaskPage() {
  const tasksQuery = useTasks();
  const conversationsQuery = useConversations();
  const assistantsQuery = useAssistants();
  const mutations = useTaskMutations();
  const toast = useToast();

  const [conversationId, setConversationId] = React.useState<string>('');
  const [goal, setGoal] = React.useState('');
  const [maxSteps, setMaxSteps] = React.useState(20);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!conversationId && conversationsQuery.data && conversationsQuery.data.length > 0) {
      setConversationId(conversationsQuery.data[0]!.id);
    }
  }, [conversationsQuery.data, conversationId]);

  const assistantName = React.useCallback(
    (id: string) => assistantsQuery.data?.find((a) => a.id === id)?.name ?? '—',
    [assistantsQuery.data],
  );

  const conversationTitle = React.useCallback(
    (id: string) => conversationsQuery.data?.find((c) => c.id === id)?.title ?? '—',
    [conversationsQuery.data],
  );

  const submit = async () => {
    if (!conversationId) {
      toast.error('请先选择会话');
      return;
    }
    if (!goal.trim()) {
      toast.error('请填写任务目标');
      return;
    }
    try {
      const run = await mutations.create.mutateAsync({
        conversationId,
        goal: goal.trim(),
        maxSteps,
      });
      setExpandedId(run.id);
      setGoal('');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '任务创建失败');
    }
  };

  const tasks = tasksQuery.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b bg-card px-6 py-4">
        <h1 className="text-lg font-semibold">桌面任务</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          给助手一个桌面目标，它会观察屏幕 → 决策 → 执行，每一步都需授权。急停 Ctrl+Alt+Esc。
        </p>
      </header>

      <section className="border-b bg-card/50 px-6 py-4">
        <div className="grid gap-3 md:grid-cols-[260px_1fr_auto]">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">挂载会话</label>
            <Select
              value={conversationId}
              onChange={(e) => setConversationId(e.target.value)}
              aria-label="选择会话"
            >
              {(conversationsQuery.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || '(未命名会话)'}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">任务目标</label>
            <Textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={NEW_TASK_PLACEHOLDER}
              rows={2}
            />
          </div>
          <div className="flex flex-col items-stretch gap-1">
            <label className="text-xs text-muted-foreground">步数上限</label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                max={50}
                value={maxSteps}
                onChange={(e) => setMaxSteps(Number(e.target.value) || 20)}
                className="w-20"
              />
              <Button onClick={submit} disabled={mutations.create.isPending}>
                <Send className="h-4 w-4" />
                开始
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="flex-1 overflow-auto px-6 py-4">
        {tasksQuery.isLoading ? (
          <Spinner label="加载任务..." />
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有任务运行，先在上方创建一个。</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                expanded={expandedId === task.id}
                onToggle={() =>
                  setExpandedId((prev) => (prev === task.id ? null : task.id))
                }
                assistantName={assistantName(task.assistantId)}
                conversationTitle={conversationTitle(task.conversationId)}
                onPause={() => mutations.control.mutate({ id: task.id, action: 'pause' })}
                onResume={() => mutations.control.mutate({ id: task.id, action: 'resume' })}
                onStop={() => mutations.control.mutate({ id: task.id, action: 'stop' })}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface TaskRowProps {
  task: TaskRunView;
  expanded: boolean;
  onToggle: () => void;
  assistantName: string;
  conversationTitle: string;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

function TaskRow({ task, expanded, onToggle, assistantName, conversationTitle, onPause, onResume, onStop }: TaskRowProps) {
  const live = useTaskEvents(expanded ? task.id : null);
  const displayRun = live.run ?? task;
  const steps = live.steps.length > 0 ? live.steps : [];
  const isActive = displayRun.status === 'running' || displayRun.status === 'paused';

  return (
    <li className="rounded-md border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <TaskRunStatusBadge status={displayRun.status} />
        <span className="flex-1 truncate text-sm font-medium">{displayRun.goal}</span>
        <span className="text-xs text-muted-foreground">
          {displayRun.stepCount}/{displayRun.maxSteps} 步
        </span>
        <span className="text-xs text-muted-foreground">{assistantName}</span>
        <span className="text-xs text-muted-foreground">{conversationTitle}</span>
      </button>
      {expanded && (
        <div className="space-y-3 border-t px-4 py-3">
          {live.status === 'error' && (
            <p className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              任务事件流连接失败，部分步骤可能缺失。
            </p>
          )}
          {isActive && (
            <TaskControlBar
              status={displayRun.status}
              onPause={onPause}
              onResume={onResume}
              onStop={onStop}
            />
          )}
          <TaskTimeline steps={steps} />
        </div>
      )}
    </li>
  );
}
