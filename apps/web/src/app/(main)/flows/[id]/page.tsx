import { Suspense } from 'react';
import { FlowEditor } from '@/features/flow-editor/flow-editor';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <FlowEditor flowId={id} />
    </Suspense>
  );
}
