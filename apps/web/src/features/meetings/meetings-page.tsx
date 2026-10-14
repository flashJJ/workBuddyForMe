'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { API } from '@/lib/api/endpoints';
import { apiGet, apiPost } from '@/lib/api/client';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { MeetingMode } from '@wbfm/shared/schemas';
import type { Assistant, MeetingRecord } from '@wbfm/shared/types';
import { MODE_HINT_KEY, MODE_LABEL_KEY, STATUS_KEY } from './meeting-keys';

export function MeetingsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const toast = useToast();
  const [assistants, setAssistants] = React.useState<Assistant[]>([]);
  const [meetings, setMeetings] = React.useState<MeetingRecord[]>([]);
  const [topic, setTopic] = React.useState('');
  const [picked, setPicked] = React.useState<string[]>([]);
  const [mode, setMode] = React.useState<MeetingMode>('manual');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    void apiGet<Assistant[]>(API.assistants).then(setAssistants).catch(() => {});
    void apiGet<MeetingRecord[]>(API.meetings).then(setMeetings).catch(() => {});
  }, []);

  const toggle = (id: string) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) {
        toast.error(t('meeting.create.needMembers'));
        return prev;
      }
      return [...prev, id];
    });
  };

  const create = async () => {
    if (!topic.trim()) {
      toast.error(t('meeting.create.needTopic'));
      return;
    }
    if (picked.length < 2) {
      toast.error(t('meeting.create.needMembers'));
      return;
    }
    setSubmitting(true);
    try {
      const meeting = await apiPost<MeetingRecord>(API.meetings, {
        topic: topic.trim(),
        memberIds: picked,
        mode,
      });
      router.push(`/meetings/${meeting.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-6">
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <Users className="h-5 w-5 text-teal-500" />
        {t('meeting.title')}
      </h1>
      <p className="text-sm text-muted-foreground">{t('meeting.subtitle')}</p>

      {/* 创建会议 */}
      <section className="space-y-3 rounded-lg border bg-card p-4" data-testid="meeting-create">
        <h2 className="text-sm font-medium">{t('meeting.create.heading')}</h2>
        <input
          className="w-full rounded border bg-background px-3 py-2 text-sm"
          aria-label={t('meeting.create.topic')}
          data-testid="meeting-topic"
          maxLength={200}
          placeholder={t('meeting.create.topicPlaceholder')}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />

        <div>
          <p className="mb-1 text-xs text-muted-foreground">{t('meeting.create.members')}</p>
          <div className="flex flex-wrap gap-2" data-testid="meeting-member-picker">
            {assistants.map((assistant) => {
              const checked = picked.includes(assistant.id);
              return (
                <button
                  key={assistant.id}
                  type="button"
                  onClick={() => toggle(assistant.id)}
                  data-member-id={assistant.id}
                  aria-pressed={checked}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    checked ? 'border-teal-500 bg-teal-500/15 text-teal-600 dark:text-teal-400' : ''
                  }`}
                >
                  {assistant.emoji ? `${assistant.emoji} ` : ''}
                  {assistant.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded border" role="group" aria-label={t('meeting.create.mode')}>
            {(['manual', 'all', 'auto'] as MeetingMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                data-testid={`create-mode-${m}`}
                data-active={mode === m}
                className={`px-3 py-1.5 text-xs ${mode === m ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400' : ''}`}
              >
                {t(MODE_LABEL_KEY[m])}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {t('meeting.create.costHint', {
              members: picked.length || 2,
              rounds: mode === 'manual' ? 1 : mode === 'all' ? Math.max(picked.length, 2) : '1–8',
            })}
          </span>
          <button
            type="button"
            onClick={() => void create()}
            disabled={submitting}
            data-testid="meeting-submit"
            className="ml-auto rounded bg-teal-600 px-4 py-2 text-xs text-white disabled:opacity-50"
          >
            {t('meeting.create.submit')}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t(MODE_HINT_KEY[mode])}</p>
      </section>

      {/* 历史会议 */}
      <section className="space-y-2">
        {meetings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('meeting.room.empty')}</p>
        ) : (
          meetings.map((meeting) => (
            <Link
              key={meeting.id}
              href={`/meetings/${meeting.id}`}
              className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm hover:bg-accent"
              data-meeting-id={meeting.id}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{meeting.topic}</span>
              <span className="text-[11px] text-muted-foreground">
                {meeting.memberIds.length} · {t(MODE_LABEL_KEY[meeting.mode])}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px]"
                data-status={meeting.status}
              >
                {t(STATUS_KEY[meeting.status])}
              </span>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
