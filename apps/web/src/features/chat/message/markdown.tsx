'use client';

import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { MARKDOWN_BLOCK_THRESHOLD, splitMarkdownBlocks } from './markdown-blocks';

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [rehypeHighlight];

const MARKDOWN_COMPONENTS: Components = {
  a: ({ ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
  code: ({ className, children, ...props }) => (
    <code className={className} {...props}>
      {children}
    </code>
  ),
};

/** 单块渲染：块文本不变时整块跳过重解析（流式期间仅最后一块变化） */
const MarkdownBlock = React.memo(function MarkdownBlock({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={MARKDOWN_COMPONENTS}
    >
      {text}
    </ReactMarkdown>
  );
});

/**
 * 助手消息 Markdown 渲染：GFM 表格/任务列表 + 代码高亮。
 * v2.4 M5 / P1-4：长回复按标题切块并逐块 memo，流式增量只重解析末尾块。
 */
export const MarkdownContent = React.memo(function MarkdownContent({ content }: { content: string }) {
  const blocks = React.useMemo(
    () =>
      content.length >= MARKDOWN_BLOCK_THRESHOLD
        ? splitMarkdownBlocks(content)
        : [content],
    [content],
  );
  return (
    <div
      className="markdown-body text-sm leading-relaxed"
      data-testid="markdown-body"
      data-block-count={blocks.length}
    >
      {blocks.map((block, index) => (
        <MarkdownBlock key={index} text={block} />
      ))}
    </div>
  );
});
