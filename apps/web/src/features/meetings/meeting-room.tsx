'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, MonitorPlay, OctagonX, Square, Users } from 'lucide-react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useToast } from '@/components/common/toast';
import { getStageBridge } from '@/features/stage/stage-bridge';
import type { MeetingMode } from '@wbfm/shared/schemas';
import { useMeetingRoom } from './use-meeting-room';
import { MODE_LABEL_KEY, STATUS_KEY } from './meeting-keys';

/** 在舞台观看（Electron 舞台窗；裸浏览器新标签） */
function watchOnStage(meetingId: string): void {
  const bridge = getStageBridge();
  if (bridge) {
    void bridge.openMeeting(meetingId);
    return;
  }
  window.open(`/stage?meeting=${encodeURIComponent(meetingId)}`, '_blank', 'noopener,noreferrer');
}

const MODE_ORDER: MeetingMode[] = ['manual', 'all', 'auto'];

export function MeetingRoom({ meetingId }: { meetingId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const { state, sendTurn, setMode, abort, finish } = useMeetingRoom(meetingId);
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const transcriptRef = React.useRef<HTMLDivElement>(null);

  const { meeting, members, messages, speaking, loading } = state;
  const active = meeting?.status === 'active';
  const memberName = (id: string | null, fallback: string) =>
    members.find((m) => m.id === id)?.name ?? fallback;

  React.useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [messages.length, speaking?.text]);

  const submit = async (mode: MeetingMode) => {
    const content = draft.trim();
    if (!content) {
      toast.error(t('meeting.create.needTopic'));
      return;
    }
    setBusy(true);
    try {
      await sendTurn(content, mode);
      setDraft('');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!meeting) {
    return (
      <div className="p-8 text-sm">
        <Link href="/meetings" className="text-teal-600 hover:underline dark:text-teal-400">
          {t('meeting.room.back')}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col gap-3">
      {/* 头部：议题/状态/控制 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
        <Link
          href="/meetings"
          className="rounded p-1 text-muted-foreground hover:bg-accent"
          aria-label={t('meeting.room.back')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Users className="h-4 w-4 text-teal-500" />
        <span className="max-w-md truncate text-sm font-semibold">{meeting.topic}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px]"
          data-testid="meeting-status-badge"
          data-status={meeting.status}
          style={{
            background:
              meeting.status === 'active' ? 'rgba(20,184,166,.12)' : 'rgba(120,120,120,.15)',
          }}
        >
          {t(STATUS_KEY[meeting.status])}
          {meeting.mode === 'auto' ? ` · ${t('meeting.room.autoRound', { used: meeting.autoRounds, max: 8 })}` : ''}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <div className="flex overflow-hidden rounded border" role="group" aria-label="schedule">
            {MODE_ORDER.map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={!active}
                data-testid={`meeting-mode-${mode}`}
                data-active={meeting.mode === mode}
                onClick={() => void setMode(mode)}
                className={`px-2 py-1 text-[11px] disabled:opacity-50 ${
                  meeting.mode === mode ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400' : ''
                }`}
                title={t(MODE_LABEL_KEY[mode])}
              >
                {t(MODE_LABEL_KEY[mode])}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => watchOnStage(meetingId)}
            data-testid="meeting-watch-stage"
            className="flex items-center gap-1 rounded border border-teal-500/40 px-2 py-1 text-[11px] text-teal-600 hover:bg-teal-500/10 disabled:opacity-50 dark:text-teal-400"
            disabled={!active}
          >
            <MonitorPlay className="h-3.5 w-3.5" />
            {t('meeting.room.watch')}
          </button>
          <button
            type="button"
            onClick={() => void abort()}
            disabled={!active}
            data-testid="meeting-abort"
            className="flex items-center gap-1 rounded border border-red-500/40 px-2 py-1 text-[11px] text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400"
          >
            <OctagonX className="h-3.5 w-3.5" />
            {t('meeting.room.abort')}
          </button>
          <button
            type="button"
            onClick={() => void finish()}
            disabled={!active}
            data-testid="meeting-finish"
            className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] disabled:opacity-50"
          >
            <Square className="h-3.5 w-3.5" />
            {t('meeting.room.finish')}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        {/* 成员席 */}
        <aside className="w-48 shrink-0 overflow-y-auto rounded-lg border bg-card p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t('meeting.room.members')}</p>
          <ul className="space-y-1" data-testid="meeting-members">
            {members.map((member) => (
              <li
                key={member.id}
                className={`truncate rounded px-2 py-1 text-xs ${
                  speaking?.speakerId === member.id ? 'bg-teal-500/15 font-medium' : ''
                } ${member.missing ? 'text-muted-foreground line-through' : ''}`}
                data-speaker={member.id}
              >
                {member.missing ? `${member.name} ${t('meeting.room.missingMember')}` : member.name}
              </li>
            ))}
          </ul>
        </aside>

        {/* 转录 */}
        <div
          ref={transcriptRef}
          className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border bg-card p-4"
          data-testid="meeting-transcript"
        >
          {messages.map((message) => (
            <div
              key={message.id}
              className={message.speakerKind === 'user' ? 'text-right' : 'text-left'}
              data-seq={message.seq}
            >
              <div className="mb-0.5 text-[10px] text-muted-foreground">
                {message.speakerKind === 'user'
                  ? t('meeting.room.you')
                  : memberName(message.speakerId, message.speakerName)}
              </div>
              <div
                className={`inline-block max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-1.5 text-sm ${
                  message.speakerKind === 'user'
                    ? 'bg-teal-600 text-white'
                    : 'bg-muted'
                } ${message.truncated ? 'border-l-2 border-amber-400' : ''}`}
              >
                {message.content}
              </div>
            </div>
          ))}
          {/* 流式发言中（未落库） */}
          {speaking && (
            <div className="text-left" data-testid="meeting-speaking">
              <div className="mb-0.5 text-[10px] text-teal-500">
                {memberName(speaking.speakerId, '')} · {t('meeting.room.speaking')}
              </div>
              <div className="inline-block max-w-[80%] whitespace-pre-wrap rounded-lg border border-teal-400/40 px-3 py-1.5 text-sm">
                {speaking.text || '…'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 输入区：manual @ 点名；all/auto 一键触发整轮 */}
      <div className="flex items-center gap-2 rounded-lg border bg-card p-2">
        <input
          className="min-w-0 flex-1 rounded border bg-background px-3 py-2 text-sm"
          aria-label="meeting-input"
          data-testid="meeting-input"
          value={draft}
          disabled={!active || busy}
          placeholder={t('meeting.room.inputPlaceholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit(meeting.mode);
            }
          }}
        />
        <button
          type="button"
          onClick={() => void submit(meeting.mode)}
          disabled={!active || busy}
          data-testid="meeting-send"
          className="rounded bg-teal-600 px-3 py-2 text-xs text-white disabled:opacity-50"
        >
          {meeting.mode === 'all' ? t('meeting.room.everyoneOnce') : meeting.mode === 'auto' ? t('meeting.room.chain') : t('meeting.room.send')}
        </button>
      </div>
    </div>
  );
}
