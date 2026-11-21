'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MessageSearchDialog } from './message-search-dialog';
import { MESSAGE_SEARCH_EVENT } from './search-bus';

/** v4.17：全局检索弹层宿主（命令面板 / 顶栏 / 侧栏都通过事件唤起） */
export function MessageSearchHost() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(MESSAGE_SEARCH_EVENT, onOpen);
    return () => window.removeEventListener(MESSAGE_SEARCH_EVENT, onOpen);
  }, []);

  return (
    <MessageSearchDialog
      open={open}
      onOpenChange={setOpen}
      onOpenHit={(hit) => {
        setOpen(false);
        router.push(
          `/chat?conversation=${encodeURIComponent(hit.conversationId)}&message=${encodeURIComponent(hit.messageId)}`,
        );
      }}
    />
  );
}
