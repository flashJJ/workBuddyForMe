import type { MessageKey } from '@wbfm/shared/i18n';
import type { MeetingMode, MeetingStatus } from '@wbfm/shared/schemas';

/** 会议模式 → i18n 静态键（避免 t() 动态模板字符串绕过 MessageKey 类型检查） */
export const MODE_LABEL_KEY: Record<MeetingMode, MessageKey> = {
  manual: 'meeting.mode.manual',
  all: 'meeting.mode.all',
  auto: 'meeting.mode.auto',
};

export const MODE_HINT_KEY: Record<MeetingMode, MessageKey> = {
  manual: 'meeting.mode.manualHint',
  all: 'meeting.mode.allHint',
  auto: 'meeting.mode.autoHint',
};

export const STATUS_KEY: Record<MeetingStatus, MessageKey> = {
  active: 'meeting.room.statusActive',
  finished: 'meeting.room.statusFinished',
  aborted: 'meeting.room.statusAborted',
};
