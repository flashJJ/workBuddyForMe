'use client';

import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import { copyText } from '@/lib/utils/clipboard';
import { useI18nOptional } from '@/lib/i18n/i18n-context';
import { MARKDOWN_BLOCK_THRESHOLD, splitMarkdownBlocks } from './markdown-blocks';
import { CitationRef } from './citation/citation-ref';
import { linkifyCitationMarkers } from './citation/citation-markers';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

/** 从 `<code className="hljs language-ts">` 中取语言名，取不到回退 text */
function detectLanguage(children: React.ReactNode): string {
  const first = React.Children.toArray(children)[0];
  if (!React.isValidElement<{ className?: string }>(first)) return '';
  const match = /language-([\w+#.-]+)/.exec(first.props.className ?? '');
  return match?.[1] ?? '';
}

/**
 * v2.23 代码块：标题栏（语言 + 复制）+ 无边框 pre。
 * 复制内容直接读 DOM textContent，兼容高亮后的 span 结构。
 */
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const i18n = useI18nOptional();
  const preRef = React.useRef<HTMLPreElement>(null);
  const timerRef = React.useRef<number | null>(null);
  const [copied, setCopied] = React.useState(false);
  const language = detectLanguage(children) || 'text';
  const label = copied
    ? (i18n?.t('chatMessages.copied') ?? '已复制')
    : (i18n?.t('common.actions.copy') ?? '复制');

  React.useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const copy = async () => {
    const text = preRef.current?.textContent ?? '';
    if (!text) return;
    await copyText(text);
    setCopied(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="code-block">
      <div className="code-block-bar">
        <span className="code-block-lang">{language}</span>
        <button
          type="button"
          className="code-block-copy"
          onClick={() => void copy()}
          aria-label={label}
          title={label}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
      <pre ref={preRef}>{children}</pre>
    </div>
  );
}

const MARKDOWN_COMPONENTS: Components = {
  a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
  // 表格外包一层滚动容器：整表横向滚动时首列可粘性固定
  table: ({ children }) => (
    <div className="markdown-table-wrap">
      <table>{children}</table>
    </div>
  ),
  pre: CodeBlock,
};

/** v2.27：带引用角标的组件表——#citation-n 链接替换为可点击角标 */
function withCitationComponents(indexes: ReadonlySet<number>): Components {
  return {
    ...MARKDOWN_COMPONENTS,
    a: ({ href, children, ...props }) => {
      const match = /^#citation-(\d{1,3})$/.exec(href ?? '');
      if (!match) {
        return (
          <a {...props} href={href} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        );
      }
      const index = Number(match[1]);
      return <CitationRef index={index} available={indexes.has(index)} />;
    },
  };
}

/** 单块渲染：块文本不变时整块跳过重解析（流式期间仅最后一块变化） */
const MarkdownBlock = React.memo(function MarkdownBlock({
  text,
  components,
}: {
  text: string;
  components: Components;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={components}
    >
      {text}
    </ReactMarkdown>
  );
});

/**
 * 助手消息 Markdown 渲染：GFM 表格/任务列表 + 代码高亮。
 * v2.4 M5 / P1-4：长回复按标题切块并逐块 memo，流式增量只重解析末尾块。
 * v2.27：传入 citations 时把正文 `[n]` 渲染为可点击角标（仅在消息完成后启用）。
 */
export const MarkdownContent = React.memo(function MarkdownContent({
  content,
  citations,
}: {
  content: string;
  citations?: ReadonlySet<number>;
}) {
  const prepared = React.useMemo(
    () => (citations ? linkifyCitationMarkers(content) : content),
    [content, citations],
  );
  const components = React.useMemo(
    () => (citations ? withCitationComponents(citations) : MARKDOWN_COMPONENTS),
    [citations],
  );
  const blocks = React.useMemo(
    () =>
      content.length >= MARKDOWN_BLOCK_THRESHOLD
        ? splitMarkdownBlocks(prepared)
        : [prepared],
    [content.length, prepared],
  );
  return (
    <div
      className="markdown-body text-sm leading-relaxed"
      data-testid="markdown-body"
      data-block-count={blocks.length}
    >
      {blocks.map((block, index) => (
        <MarkdownBlock key={index} text={block} components={components} />
      ))}
    </div>
  );
});
