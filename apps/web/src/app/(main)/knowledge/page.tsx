import { KnowledgePage } from '@/features/knowledge';

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const autoCreate = params?.new === '1';
  const kb = typeof params?.kb === 'string' ? params.kb : null;
  return <KnowledgePage autoCreate={autoCreate} initialKbId={kb} />;
}
