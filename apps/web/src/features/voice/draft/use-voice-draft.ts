'use client';

import * as React from 'react';
import { appendVoiceText, replaceVoiceSegment } from './voice-draft';
import { requestVoicePolish } from './voice-polish-client';

export interface VoiceDraft {
  /** 识别原文立即写入草稿并聚焦，随后异步润色替换 */
  insert: (text: string) => void;
  /** 仍在润色的条数（>0 时麦克风显示转圈） */
  polishing: number;
}

interface Options {
  draft: string;
  onChange: (next: string) => void;
  requestFocus: () => void;
}

/**
 * PTT 识别 → 输入框草稿 → 模型润色。
 * 原文先落草稿保证零延迟；润色回来后只有原文片段仍存在才替换，
 * 用户中途编辑/发送的内容不会被覆盖。
 */
export function useVoiceDraft({ draft, onChange, requestFocus }: Options): VoiceDraft {
  const draftRef = React.useRef(draft);
  draftRef.current = draft;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const focusRef = React.useRef(requestFocus);
  focusRef.current = requestFocus;
  const aliveRef = React.useRef(true);
  const [polishing, setPolishing] = React.useState(0);

  React.useEffect(
    () => () => {
      aliveRef.current = false;
    },
    [],
  );

  const insert = React.useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;

    const next = appendVoiceText(draftRef.current, clean);
    draftRef.current = next;
    onChangeRef.current(next);
    focusRef.current();

    setPolishing((count) => count + 1);
    void requestVoicePolish(clean).then((polished) => {
      if (!aliveRef.current) return;
      setPolishing((count) => Math.max(0, count - 1));
      if (!polished) return;
      const replaced = replaceVoiceSegment(draftRef.current, clean, polished);
      if (replaced === null) return;
      draftRef.current = replaced;
      onChangeRef.current(replaced);
    });
  }, []);

  return { insert, polishing };
}
