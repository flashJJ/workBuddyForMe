'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { DocumentStructureView } from '@wbfm/core/services';
import { useI18n } from '@/lib/i18n/use-i18n';
import { sameSectionPath } from './types';

type Section = DocumentStructureView['sections'][number];

interface TreeNode {
  path: string[];
  label: string;
  blockCount: number;
  children: TreeNode[];
}

/** 章节路径 → 可折叠树（按路径前缀合并父子节点） */
export function buildSectionTree(sections: readonly Section[]): TreeNode[] {
  const roots: TreeNode[] = [];
  for (const section of sections) {
    let level = roots;
    section.path.forEach((label, index) => {
      let node = level.find((item) => item.label === label);
      if (!node) {
        node = { path: section.path.slice(0, index + 1), label, blockCount: 0, children: [] };
        level.push(node);
      }
      if (index === section.path.length - 1) node.blockCount = section.blockIds.length;
      level = node.children;
    });
  }
  return roots;
}

function TreeRow({
  node,
  depth,
  selectedPath,
  collapsed,
  onToggle,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string[];
  collapsed: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onSelect: (path: string[]) => void;
}) {
  const { t } = useI18n();
  const key = node.path.join(' › ');
  const selected = sameSectionPath(node.path, selectedPath);
  const isCollapsed = collapsed.has(key);
  const hasChildren = node.children.length > 0;
  const ref = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  return (
    <li>
      <div
        className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-sm ${
          selected ? 'bg-accent font-medium' : 'hover:bg-accent/40'
        }`}
        data-testid="section-node"
        data-path={key}
        data-selected={selected ? 'true' : undefined}
        style={{ paddingLeft: 6 + depth * 14 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={`${isCollapsed ? t('documentViewer.expand') : t('documentViewer.collapse')} ${node.label}`}
            aria-expanded={!isCollapsed}
            data-testid="section-toggle"
            onClick={() => onToggle(key)}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" aria-hidden />
        )}
        <button
          ref={selected ? ref : undefined}
          type="button"
          className="min-w-0 flex-1 truncate text-left hover:underline"
          onClick={() => onSelect(node.path)}
          data-testid="section-select"
        >
          {node.label}
        </button>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {t('documentViewer.sectionBlocks', { count: node.blockCount })}
        </span>
      </div>
      {hasChildren && !isCollapsed && (
        <ul className="space-y-0.5">
          {node.children.map((child) => (
            <TreeRow
              key={child.path.join(' › ')}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              collapsed={collapsed}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function ChapterTree({
  sections,
  selectedPath,
  onSelect,
}: {
  sections: readonly Section[];
  selectedPath: string[];
  onSelect: (path: string[]) => void;
}) {
  const { t } = useI18n();
  const tree = React.useMemo(() => buildSectionTree(sections), [sections]);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (tree.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('documentViewer.noSections')}</p>;
  }

  return (
    <ul className="space-y-0.5" data-testid="structure-sections">
      {tree.map((node) => (
        <TreeRow
          key={node.path.join(' › ')}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          collapsed={collapsed}
          onToggle={toggle}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
}
