import React, { useState } from 'react';
import { ChevronRight, ChevronDown, EyeOff } from 'lucide-react';
import { DiffNode, DiffStatus, diffJson } from '../utils/diffJson';

interface Props {
  left: unknown;
  right: unknown;
  label?: { left: string; right: string };
}

// ─── Collapse-unchanged helpers ───────────────────────────────────────────────

function hasChangedDescendant(node: DiffNode): boolean {
  if (node.status !== 'unchanged') return true;
  return node.children?.some(hasChangedDescendant) ?? false;
}

type ChildGroup =
  | { type: 'node'; node: DiffNode }
  | { type: 'collapsed-unchanged'; count: number; keys: string[] };

function groupChildren(children: DiffNode[], collapseUnchanged: boolean): ChildGroup[] {
  if (!collapseUnchanged) return children.map(n => ({ type: 'node', node: n }));

  const groups: ChildGroup[] = [];
  let pending: DiffNode[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    groups.push({ type: 'collapsed-unchanged', count: pending.length, keys: pending.map(n => n.key) });
    pending = [];
  };

  for (const node of children) {
    if (node.status === 'unchanged' && !hasChangedDescendant(node)) {
      pending.push(node);
    } else {
      flush();
      groups.push({ type: 'node', node });
    }
  }
  flush();
  return groups;
}

// ─── Status styling ───────────────────────────────────────────────────────────

const STATUS_BG: Record<DiffStatus, string> = {
  added:     'diff-added',
  removed:   'diff-removed',
  changed:   'diff-changed',
  unchanged: '',
};

const STATUS_ICON: Record<DiffStatus, { char: string; cls: string }> = {
  added:     { char: '+', cls: 'text-green-400' },
  removed:   { char: '−', cls: 'text-red-400' },
  changed:   { char: '~', cls: 'text-amber-400' },
  unchanged: { char: ' ', cls: 'text-transparent' },
};

// ─── Value span ───────────────────────────────────────────────────────────────

function ValueSpan({ value }: { value: unknown }) {
  if (value === null)             return <span className="json-null">null</span>;
  if (typeof value === 'string')  return <span className="json-str">"{value}"</span>;
  if (typeof value === 'number')  return <span className="json-num">{value}</span>;
  if (typeof value === 'boolean') return <span className="json-bool">{String(value)}</span>;
  if (value === undefined)        return <span className="text-devlens-muted italic">—</span>;
  return <span className="text-devlens-muted">{JSON.stringify(value)}</span>;
}

// ─── Diff node row ────────────────────────────────────────────────────────────

function DiffRow({
  node, depth, side, collapseUnchanged,
}: {
  node: DiffNode;
  depth: number;
  side: 'left' | 'right';
  collapseUnchanged: boolean;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 14;
  const cls   = STATUS_BG[node.status];
  const icon  = STATUS_ICON[node.status];
  const value = side === 'left' ? node.leftValue : node.rightValue;

  return (
    <>
      <div
        className={`flex items-start gap-1 px-2 py-0.5 font-mono text-xs ${cls} hover:brightness-110`}
        style={{ paddingLeft: 8 + indent }}
      >
        <span className={`shrink-0 w-3 ${icon.cls}`}>{icon.char}</span>

        {hasChildren ? (
          <button
            className="flex items-center gap-1 text-devlens-muted hover:text-devlens-text"
            onClick={() => setOpen(o => !o)}
          >
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span className="text-blue-300">{`"${node.key}"`}: {node.isArray ? '[' : '{'}</span>
          </button>
        ) : (
          <span>
            <span className="text-blue-300">{`"${node.key}"`}: </span>
            {node.status === 'changed' ? (
              side === 'left'
                ? <span className="text-red-300">{JSON.stringify(node.leftValue)}</span>
                : <span className="text-green-300">{JSON.stringify(node.rightValue)}</span>
            ) : (
              <ValueSpan value={value} />
            )}
          </span>
        )}
      </div>

      {hasChildren && open && (() => {
        const grouped = groupChildren(node.children!, collapseUnchanged);
        return (
          <>
            {grouped.map((g, i) =>
              g.type === 'collapsed-unchanged'
                ? <CollapsedPlaceholder key={`ph-${i}`} count={g.count} depth={depth + 1} />
                : <DiffRow key={g.node.key} node={g.node} depth={depth + 1} side={side} collapseUnchanged={collapseUnchanged} />
            )}
            <div
              className={`font-mono text-xs text-devlens-muted px-2 py-0.5 ${cls}`}
              style={{ paddingLeft: 8 + indent + 16 }}
            >
              {node.isArray ? ']' : '}'}
            </div>
          </>
        );
      })()}
    </>
  );
}

// ─── Collapsed-unchanged placeholder ─────────────────────────────────────────

function CollapsedPlaceholder({ count, depth }: { count: number; depth: number }) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 font-mono text-[11px] text-devlens-muted italic"
      style={{ paddingLeft: 8 + depth * 14 }}
    >
      <EyeOff size={10} />
      {count} unchanged field{count !== 1 ? 's' : ''} hidden
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function DiffViewer({ left, right, label }: Props) {
  const [collapseUnchanged, setCollapseUnchanged] = useState(false);

  const diff = diffJson(left, right, 'root');
  const children = diff.children || [];

  const stats = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  function countStats(node: DiffNode) {
    stats[node.status]++;
    node.children?.forEach(countStats);
  }
  children.forEach(countStats);

  const grouped = groupChildren(children, collapseUnchanged);

  return (
    <div className="flex flex-col h-full">
      {/* Stats + toggle */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-devlens-border text-xs shrink-0 bg-devlens-surface flex-wrap">
        <span className="text-green-400">+{stats.added} added</span>
        <span className="text-red-400">−{stats.removed} removed</span>
        <span className="text-amber-400">~{stats.changed} changed</span>
        <span className="text-devlens-muted">{stats.unchanged} unchanged</span>

        <button
          className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] transition-colors ${
            collapseUnchanged
              ? 'bg-devlens-accent/15 border-devlens-accent/40 text-devlens-accent'
              : 'border-devlens-border text-devlens-muted hover:text-devlens-text hover:border-devlens-muted'
          }`}
          onClick={() => setCollapseUnchanged(c => !c)}
        >
          <EyeOff size={11} />
          {collapseUnchanged ? 'Unchanged hidden' : 'Hide unchanged'}
        </button>
      </div>

      {/* Split panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left */}
        <div className="flex-1 overflow-auto border-r border-devlens-border">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-devlens-muted bg-devlens-surface border-b border-devlens-border">
            {label?.left ?? 'Left (A)'}
          </div>
          <div className="py-1">
            {grouped.map((g, i) =>
              g.type === 'collapsed-unchanged'
                ? <CollapsedPlaceholder key={`ph-${i}`} count={g.count} depth={0} />
                : <DiffRow key={`${g.node.key}-${i}`} node={g.node} depth={0} side="left" collapseUnchanged={collapseUnchanged} />
            )}
          </div>
        </div>

        {/* Right */}
        <div className="flex-1 overflow-auto">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-devlens-muted bg-devlens-surface border-b border-devlens-border">
            {label?.right ?? 'Right (B)'}
          </div>
          <div className="py-1">
            {grouped.map((g, i) =>
              g.type === 'collapsed-unchanged'
                ? <CollapsedPlaceholder key={`ph-${i}`} count={g.count} depth={0} />
                : <DiffRow key={`${g.node.key}-${i}`} node={g.node} depth={0} side="right" collapseUnchanged={collapseUnchanged} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
