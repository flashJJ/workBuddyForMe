'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Message, MessageFeedback } from '@wbfm/shared';
import { apiPatch } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

/** v0.5 P1-2：消息 👍/👎；再次点击同项发 null 取消 */
export function useMessageFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      conversationId: string;
      messageId: string;
      feedback: MessageFeedback | null;
    }) =>
      apiPatch<Message>(
        API.messageFeedback(input.conversationId, input.messageId),
        { feedback: input.feedback },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'messages' });
    },
  });
}
