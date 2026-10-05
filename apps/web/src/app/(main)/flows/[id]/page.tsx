import { FlowEditor } from '@/features/flow-editor/flow-editor';

export default function Page({ params }: { params: { id: string } }) {
  return <FlowEditor flowId={params.id} />;
}
