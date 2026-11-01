import { AssistantsPage } from '@/features/assistants';

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const autoCreate = params?.new === '1';
  return <AssistantsPage autoCreate={autoCreate} />;
}
