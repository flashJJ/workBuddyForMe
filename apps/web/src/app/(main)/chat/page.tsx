import { ChatPage } from '@/features/chat/chat-page';

/** v2.6 M4：支持 /chat?conversation=<id>&message=<id> 记忆来源深链 */
export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ conversation?: string; message?: string }>;
}) {
  const params = (await searchParams) ?? {};
  return (
    <ChatPage
      deepLinkConversationId={params.conversation ?? null}
      deepLinkMessageId={params.message ?? null}
    />
  );
}
