'use client';

import * as React from 'react';

export interface StageTarget {
  runId: string | null;
  meetingId: string | null;
  theater: boolean;
  episodeId: string | null;
}

/**
 * 舞台深链解析：run / meeting / play（M4）。
 * effect 内读 window，首帧恒等于 SSR 避免水合错配。
 */
export function useStageTarget(): StageTarget {
  const [target, setTarget] = React.useState<StageTarget>({
    runId: null,
    meetingId: null,
    theater: false,
    episodeId: null,
  });
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clean = (v: string | null) => (v && /^[a-zA-Z0-9_-]{1,80}$/.test(v) ? v : null);
    setTarget({
      runId: clean(params.get('run')),
      meetingId: clean(params.get('meeting')),
      theater: params.get('stage') === 'play',
      episodeId: clean(params.get('ep')),
    });
  }, []);
  return target;
}
