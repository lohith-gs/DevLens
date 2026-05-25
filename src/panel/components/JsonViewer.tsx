import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, ChevronDown, Copy, Check, Fingerprint, Crosshair } from 'lucide-react';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface JsonViewerControlSignal {
  action: 'expand-all' | 'collapse-all';
  id: number;
}

interface Props {
  data: unknown;
  path?: string;
  highlightPaths?: Map<string, string>;
  searchQuery?: string;
  controlSignal?: JsonViewerControlSignal;
  /** When provided, branch nodes show a "Compare from here" button on hover */
  onSubtreeSelect?: (path: string, value: unknown) => void;
  /** When provided, clicking a primitive leaf fires this with its string value */
  onValueClick?: (value: string) => void;
  /** Value currently selected via onValueClick — adds ring highlight */
  activeValue?: string | null;
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function childPath(parent: string, key: string | number, isArray: boolean): string {
  if (isArray) return parent ? `${parent}[${key}]` : `[${key}]`;
  return parent ? `${parent}.${key}` : String(key);
}

export function toJsonPath(path: string): string {
  return path ? `$.${path}` : '$';
}

function collectBranchPaths(data: unknown, path: string): Set<string> {
  const out = new Set<string>();
  function walk(v: unknown, p: string) {
    if (v !== null && typeof v === 'object') {
      out.add(p);
      if (Array.isArray(v)) v.forEach((item, i) => walk(item, `${p}[${i}]`));
      else for (const [k, child] of Object.entries(v as Record<string, unknown>))
        walk(child, p ? `${p}.${k}` : k);
    }
  }
  walk(data, path);
  return out;
}

export function getMatchingPaths(data: unknown, query: string, rootPath = ''): Set<string> {
  const matches = new Set<string>();
  if (!query.trim()) return matches;
  const q = query.toLowerCase();
  function walk(v: unknown, p: string, key?: string | number) {
    if (key !== undefined && String(key).toLowerCase().includes(q)) matches.add(p);
    if (Array.isArray(v)) v.forEach((item, i) => walk(item, `${p}[${i}]`, i));
    else if (v !== null && typeof v === 'object')
      for (const [k, child] of Object.entries(v as Record<string, unknown>))
        walk(child, p ? `${p}.${k}` : k, k);
    else {
      const str = v === null ? 'null' : String(v);
      if (str.toLowerCase().includes(q)) matches.add(p);
    }
  }
  walk(data, rootPath);
  return matches;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm px-0.5" style={{ background: '#f59e0b55', color: '#fcd34d' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function CopyBtn({ getValue, title, icon: Icon }: { getValue: () => string; title: string; icon: React.ElementType }) {
  const [done, setDone] = useState(false);
  return (
    <button title={title} onClick={async e => {
      e.stopPropagation();
      await navigator.clipboard.writeText(getValue());
      setDone(true); setTimeout(() => setDone(false), 1200);
    }}
      className="opacity-0 group-hover/node:opacity-100 transition-opacity rounded p-0.5 hover:bg-white/10 text-devlens-muted hover:text-devlens-text"
    >
      {done ? <Check size={10} className="text-green-400" /> : <Icon size={10} />}
    </button>
  );
}

function PrimitiveValue({ value, query }: { value: unknown; query?: string }) {
  if (value === null)             return <span className="json-null">null</span>;
  if (typeof value === 'string')  return <span className="json-str">"<Highlight text={value} query={query} />"</span>;
  if (typeof value === 'number')  return <span className="json-num"><Highlight text={String(value)} query={query} /></span>;
  if (typeof value === 'boolean') return <span className="json-bool"><Highlight text={String(value)} query={query} /></span>;
  if (value === undefined)        return <span className="text-devlens-muted italic">undefined</span>;
  return <span className="json-null">{String(value)}</span>;
}

// ─── Recursive node ───────────────────────────────────────────────────────────

interface NodeProps {
  data: unknown;
  depth: number;
  path: string;
  keyName?: string | number;
  highlightPaths?: Map<string, string>;
  searchQuery?: string;
  matchedPaths: Set<string>;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  onSubtreeSelect?: (path: string, value: unknown) => void;
  onValueClick?: (value: string) => void;
  activeValue?: string | null;
}

function JsonNode({ data, depth, path, keyName, highlightPaths, searchQuery, matchedPaths, collapsed, onToggle, onSubtreeSelect, onValueClick, activeValue }: NodeProps) {
  const indent = depth * 14;
  const correlationColor = highlightPaths?.get(path);
  const isSearchMatch = searchQuery ? matchedPaths.has(path) : false;

  // Check if this leaf's value matches the actively-clicked value
  const leafStr = !Array.isArray(data) && (data === null || typeof data !== 'object')
    ? (data === null ? 'null' : String(data))
    : null;
  const isActiveValueMatch = !!activeValue && leafStr === activeValue;

  const rowStyle: React.CSSProperties = {
    paddingLeft: indent,
    ...(correlationColor ? { boxShadow: `inset 3px 0 0 ${correlationColor}`, background: `${correlationColor}15` } : {}),
    ...(isSearchMatch && !correlationColor ? { background: '#f59e0b0d', boxShadow: 'inset 3px 0 0 #f59e0b' } : {}),
    ...(isActiveValueMatch && !correlationColor ? { background: '#f59e0b18', boxShadow: 'inset 3px 0 0 #f59e0b' } : {}),
  };

  const isArr    = Array.isArray(data);
  const isObj    = !isArr && data !== null && typeof data === 'object';
  const isBranch = isArr || isObj;

  if (isBranch) {
    const entries = isArr
      ? (data as unknown[]).map((v, i) => [i, v] as [number, unknown])
      : Object.entries(data as Record<string, unknown>);
    const isCollapsed  = collapsed.has(path);
    const openB  = isArr ? '[' : '{';
    const closeB = isArr ? ']' : '}';
    const summary = isArr
      ? `${(data as unknown[]).length} item${(data as unknown[]).length !== 1 ? 's' : ''}`
      : `${entries.length} key${entries.length !== 1 ? 's' : ''}`;

    return (
      <div>
        <div
          className="flex items-center gap-1 hover:bg-white/5 rounded cursor-pointer group/node font-mono text-xs select-none"
          style={rowStyle}
          onClick={() => onToggle(path)}
        >
          <span className="shrink-0 flex items-center" style={{ width: 14 }}>
            {isCollapsed
              ? <ChevronRight size={11} className="text-devlens-muted" />
              : <ChevronDown size={11} className="text-devlens-muted" />}
          </span>

          {keyName !== undefined && (
            <span className="json-key shrink-0">
              {typeof keyName === 'number'
                ? <span className="text-devlens-muted">{keyName}</span>
                : <Highlight text={`"${keyName}"`} query={searchQuery} />}
              <span className="text-devlens-muted">: </span>
            </span>
          )}

          <span className="text-devlens-muted">{openB}</span>
          {isCollapsed && <span className="text-devlens-muted text-[10px] italic ml-1">{summary}</span>}
          {isCollapsed && <span className="text-devlens-muted">{closeB}</span>}

          <span className="ml-auto flex items-center gap-0.5 pr-1" onClick={e => e.stopPropagation()}>
            {onSubtreeSelect && (
              <button
                title="Focus diff on this subtree"
                onClick={e => { e.stopPropagation(); onSubtreeSelect(path, data); }}
                className="opacity-0 group-hover/node:opacity-100 transition-opacity rounded p-0.5 hover:bg-white/10 text-devlens-muted hover:text-devlens-accent"
              >
                <Crosshair size={10} />
              </button>
            )}
            <CopyBtn title="Copy value"     icon={Copy}        getValue={() => JSON.stringify(data, null, 2)} />
            <CopyBtn title="Copy JSON path" icon={Fingerprint} getValue={() => toJsonPath(path)} />
          </span>
        </div>

        {!isCollapsed && (
          <>
            {entries.map(([k, v]) => (
              <JsonNode
                key={String(k)}
                data={v} depth={depth + 1}
                path={childPath(path, k, isArr)}
                keyName={k}
                highlightPaths={highlightPaths}
                searchQuery={searchQuery}
                matchedPaths={matchedPaths}
                collapsed={collapsed}
                onToggle={onToggle}
                onSubtreeSelect={onSubtreeSelect}
                onValueClick={onValueClick}
                activeValue={activeValue}
              />
            ))}
            <div className="font-mono text-xs text-devlens-muted select-none" style={{ paddingLeft: indent }}>
              {closeB}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Leaf ──
  const leafClickable = !!onValueClick && data !== null && data !== undefined && typeof data !== 'object';
  return (
    <div
      className={`flex items-center gap-1 hover:bg-white/5 rounded font-mono text-xs group/node ${leafClickable ? 'cursor-pointer' : ''}`}
      style={rowStyle}
      onClick={leafClickable ? () => onValueClick!(leafStr!) : undefined}
    >
      <span style={{ width: 14, flexShrink: 0 }} />
      {keyName !== undefined && (
        <span className="json-key shrink-0">
          {typeof keyName === 'number'
            ? <span className="text-devlens-muted">{keyName}</span>
            : <Highlight text={`"${keyName}"`} query={searchQuery} />}
          <span className="text-devlens-muted">: </span>
        </span>
      )}
      <span className="flex-1 min-w-0">
        <PrimitiveValue value={data} query={isSearchMatch ? searchQuery : undefined} />
      </span>
      <span className="ml-auto flex items-center gap-0.5 pr-1 shrink-0">
        <CopyBtn title="Copy value"     icon={Copy}        getValue={() => (typeof data === 'string' ? data : JSON.stringify(data))} />
        <CopyBtn title="Copy JSON path" icon={Fingerprint} getValue={() => toJsonPath(path)} />
      </span>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function JsonViewer({ data, path = '', highlightPaths, searchQuery, controlSignal, onSubtreeSelect, onValueClick, activeValue }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const prevSignalId = useRef(0);

  useEffect(() => {
    if (!controlSignal || controlSignal.id === prevSignalId.current) return;
    prevSignalId.current = controlSignal.id;
    setCollapsed(controlSignal.action === 'expand-all' ? new Set() : collectBranchPaths(data, path));
  }, [controlSignal?.id]);

  const prevCollapsed = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (searchQuery?.trim()) {
      if (prevCollapsed.current === null) {
        prevCollapsed.current = new Set(collapsed);
        setCollapsed(new Set());
      }
    } else {
      if (prevCollapsed.current !== null) {
        setCollapsed(prevCollapsed.current);
        prevCollapsed.current = null;
      }
    }
  }, [!!searchQuery?.trim()]);

  const matchedPaths = React.useMemo(
    () => getMatchingPaths(data, searchQuery || '', path),
    [data, searchQuery, path]
  );

  const toggle = useCallback((p: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }, []);

  return (
    <JsonNode
      data={data} depth={0} path={path}
      highlightPaths={highlightPaths}
      searchQuery={searchQuery}
      matchedPaths={matchedPaths}
      collapsed={collapsed}
      onToggle={toggle}
      onSubtreeSelect={onSubtreeSelect}
      onValueClick={onValueClick}
      activeValue={activeValue}
    />
  );
}
