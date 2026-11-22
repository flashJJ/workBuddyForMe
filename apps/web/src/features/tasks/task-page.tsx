'use client';

import * as React from 'react';
import { PageBody, PageHeader, PageShell } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useConversations } from '@/lib/hooks/chat';
import { useAssistants } from '@/lib/hooks/assistant';
import { useTaskMutations, useTasks } from '@/lib/hooks/tasks';
import { useI18n } from '@/lib/i18n/use-i18n';
import { TaskRow } from './task-row';
import { TaskStartForm } from './task-start-form';
import { AgentTasksSection } from './agent-tasks-section';

export function TaskPage() {
  const { t } = useI18n();
  // v4.20：知识「新建任务」只读取一次 draft 预填目标，不自动提交
  const [initialGoal] = React.useState(() =>
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('draft') ?? '').slice(0, 500),
  );
  const tasksQuery = useTasks();
  const conversationsQuery = useConversations();
  const assistantsQuery = useAssistants();
  const mutations = useTaskMutations();

  const [conversationId, setConversationId] = React.useState<string>('');
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

  const tasks = tasksQuery.data ?? [];

  return (
    <PageShell>
      <PageHeader title={t('tasks.title')} description={t('tasks.description')} />

      <TaskStartForm
        conversations={conversationsQuery.data ?? []}
        conversationId={conversationId}
        onConversationChange={setConversationId}
        onCreated={setExpandedId}
        initialGoal={initialGoal}
      />

      <PageBody>
        {tasksQuery.isLoading ? (
          <Spinner label={t('tasks.loading')} />
        ) : tasksQuery.isError ? (
          <ErrorState message={t('tasks.loadError')} onRetry={() => void tasksQuery.refetch()} />
        ) : tasks.length === 0 ? (
          <EmptyState title={t('tasks.emptyTitle')} description={t('tasks.emptyDescription')} />
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                expanded={expandedId === task.id}
                onToggle={() => setExpandedId((prev) => (prev === task.id ? null : task.id))}
                assistantName={assistantName(task.assistantId)}
                conversationTitle={conversationTitle(task.conversationId)}
                onPause={() => mutations.control.mutate({ id: task.id, action: 'pause' })}
                onResume={() => mutations.control.mutate({ id: task.id, action: 'resume' })}
                onStop={() => mutations.control.mutate({ id: task.id, action: 'stop' })}
              />
            ))}
          </ul>
        )}
        <AgentTasksSection />
      </PageBody>
    </PageShell>
  );
}
