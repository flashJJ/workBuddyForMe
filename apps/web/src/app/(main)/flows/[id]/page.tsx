import { Suspense } from 'react';
import { FlowEditor } from '@/features/flow-editor/flow-editor';

export default function Page({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={null}>
      <FlowEditor flowId={params.id} />
    </Suspense>
  );
}
