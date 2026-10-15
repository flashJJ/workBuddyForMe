'use client';

/**
 * 舞台对话框：当前发言者台词（M1 直接淡入整句；M2 串行队列的打字效果在适配器层做）。
 * 可由场景 showDialog 与 H 键隐藏。
 */
export function StageDialogBox(props: {
  speakerName: string;
  text: string | null;
  visible: boolean;
}) {
  if (!props.visible || !props.text) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-[6%] flex justify-center px-[12%]"
      data-testid="stage-dialog"
    >
      <div className="max-w-3xl rounded-lg border border-white/15 bg-black/55 px-5 py-3 text-center shadow-lg backdrop-blur-sm">
        <span className="mr-2 text-sm font-semibold text-amber-200">{props.speakerName}</span>
        <span className="text-sm leading-6 text-white/95">{props.text}</span>
      </div>
    </div>
  );
}
