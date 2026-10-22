import { KnowledgePage } from '@/features/knowledge/knowledge-page';

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const autoCreate = params?.new === '1';
  return <KnowledgePage autoCreate={autoCreate} />;
}
