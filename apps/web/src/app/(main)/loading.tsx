import { Spinner } from '@/components/common/state';

/** 路由级加载骨架（App Router Suspense 兜底） */
export default function MainLoading() {
  return <Spinner label="页面加载中…" />;
}
