import { KnowledgePage } from '@/features/knowledge/knowledge-page';

export default function Page({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const autoCreate = searchParams?.new === '1';
  return <KnowledgePage autoCreate={autoCreate} />;
}
