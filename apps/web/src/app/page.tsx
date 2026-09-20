import { redirect } from 'next/navigation';

/** 根路径统一进入对话模块 */
export default function HomePage() {
  redirect('/chat');
}
