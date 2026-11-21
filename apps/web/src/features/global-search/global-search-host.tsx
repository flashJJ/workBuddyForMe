'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { GlobalSearchDialog } from './global-search-dialog';
import { GLOBAL_SEARCH_EVENT } from './bus';

/** v4.18：全局检索宿主（命令面板 / 顶栏 / 侧栏通过事件唤起） */
export function GlobalSearchHost() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener(GLOBAL_SEARCH_EVENT, onOpen);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener(GLOBAL_SEARCH_EVENT, onOpen);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <GlobalSearchDialog
      open={open}
      onOpenChange={setOpen}
      onOpenHit={(hit) => router.push(hit.deepLink)}
    />
  );
}
