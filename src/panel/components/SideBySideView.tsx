import React, { useState, useCallback } from 'react';
import { X, Sparkles, Crosshair, RotateCcw, MousePointerClick } from 'lucide-react';
import { NetworkRequest } from '../hooks/useNetworkRequests';
import { DiffViewer } from './DiffViewer';
import { JsonViewer } from './JsonViewer';
import { correlateFields, buildPathColorMap, CorrelationMatch } from '../utils/correlateFields';
import { flattenLeaves } from '../utils/detectEntities';

interface Props {
  pinned: [NetworkRequest | null, NetworkRequest | null];
  onUnpin: (slot: 0 | 1) => void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CompareMode   = 'side-by-side' | 'diff';
type CompareSource = 'response' | 'request' | 'headers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tryParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s || null; }
}

/** Walk a dot/bracket path and return the value, or undefined if not found. */
function getAtPath(data: unknown, path: string): unknown {
  if (!path) return data;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur: unknown = data;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function shortUrl(url: string) {
  try { return new URL(url).pathname || '/'; } catch { return url; }
}

// ─── Header panel (flat key/value for diffing) ────────────────────────────────

function headersAsJson(req: NetworkRequest): Record<string, string> {
  return { ...req.requestHeaders, ...Object.fromEntries(
    Object.entries(req.responseHeaders).map(([k, v]) => [`response:${k}`, v])
  ) };
}

// ─── Slot header bar ──────────────────────────────────────────────────────────

function SlotBar({
  req, label, labelColor, onUnpin,
}: { req: NetworkRequest; label: string; labelColor: string; onUnpin: () => void }) {
  const statusCls =
    req.status >= 500 ? 'badge-5xx' :
    req.status >= 400 ? 'badge-4xx' :
    req.status >= 300 ? 'badge-3xx' : 'badge-2xx';
  return (
    <div className="px-3 py-1.5 bg-devlens-surface border-b border-devlens-border flex items-center gap-2 shrink-0">
      <span className="text-[10px] font-semibold shrink-0" style={{ color: labelColor }}>{label}</span>
      <span className={`badge ${statusCls}`}>{req.status}</span>
      <span className="text-[10px] text-devlens-accent font-medium uppercase">{req.method}</span>
      <span className="flex-1 font-mono text-[11px] text-devlens-text truncate" title={req.url}>
        {shortUrl(req.url)}
      </span>
      <button className="text-devlens-muted hover:text-red-400 transition-colors shrink-0" onClick={onUnpin}>
        <X size={13} />
      </button>
    </div>
  );
}

// ─── Empty slot ───────────────────────────────────────────────────────────────

function EmptySlot({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-full text-devlens-muted text-xs">
      Pin slot {label} — click the pin icon on a request
    </div>
  );
}

// ─── Source toggle ────────────────────────────────────────────────────────────

function SourceToggle({ value, onChange, hasRequest }: {
  value: CompareSource;
  onChange: (v: CompareSource) => void;
  hasRequest: boolean;
}) {
  const opts: { id: CompareSource; label: string }[] = [
    { id: 'response', label: 'Response' },
    { id: 'request',  label: 'Request' },
    { id: 'headers',  label: 'Headers' },
  ];
  return (
    <div className="flex rounded overflow-hidden border border-devlens-border">
      {opts.map(({ id, label }) => (
        <button
          key={id}
          disabled={id === 'request' && !hasRequest}
          className={`px-3 py-1 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
            value === id
              ? 'bg-devlens-accent text-white'
              : 'text-devlens-muted hover:text-devlens-text bg-devlens-bg'
          }`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SideBySideView({ pinned, onUnpin }: Props) {
  const [mode, setMode]               = useState<CompareMode>('side-by-side');
  const [source, setSource]           = useState<CompareSource>('response');
  const [showCorrelation, setShowCorrelation] = useState(false);
  const [subtreePath, setSubtreePath] = useState<string | null>(null);
  const [clickedValue, setClickedValue] = useState<string | null>(null);

  const [left, right] = pinned;
  const bothPinned = left !== null && right !== null;

  // ── Derive working data from source + subtree ──
  function getRaw(req: NetworkRequest | null, src: CompareSource): unknown {
    if (!req) return null;
    if (src === 'response') return tryParse(req.responseBody);
    if (src === 'request')  return tryParse(req.requestBody);
    if (src === 'headers')  return headersAsJson(req);
    return null;
  }

  const leftFull  = getRaw(left,  source);
  const rightFull = getRaw(right, source);

  const leftData  = subtreePath ? getAtPath(leftFull,  subtreePath) : leftFull;
  const rightData = subtreePath ? getAtPath(rightFull, subtreePath) : rightFull;

  // ── Correlation ──
  let correlations: CorrelationMatch[] = [];
  let leftColorMap  = new Map<string, string>();
  let rightColorMap = new Map<string, string>();

  if (bothPinned && showCorrelation && source !== 'headers' && leftData !== null && rightData !== null) {
    correlations    = correlateFields(leftData, rightData);
    leftColorMap    = buildPathColorMap(correlations, 'left');
    rightColorMap   = buildPathColorMap(correlations, 'right');
  }

  // ── Click-to-highlight ──
  // Builds amber highlight maps for all occurrences of the clicked value in each panel.
  // These are merged on top of correlation colors (click takes precedence per path).
  const CLICK_COLOR = '#f59e0b';

  function buildClickMap(data: unknown): Map<string, string> {
    if (!clickedValue || data === null || data === undefined) return new Map();
    const map = new Map<string, string>();
    for (const [path, val] of flattenLeaves(data)) {
      if (val === clickedValue) map.set(path, CLICK_COLOR);
    }
    return map;
  }

  const leftClickMap  = buildClickMap(leftData);
  const rightClickMap = buildClickMap(rightData);

  // Merge: correlation first, click overrides
  function mergedMap(corrMap: Map<string, string>, clickMap: Map<string, string>): Map<string, string> | undefined {
    if (clickMap.size === 0 && corrMap.size === 0) return undefined;
    if (clickMap.size === 0) return corrMap.size > 0 ? corrMap : undefined;
    const result = new Map(corrMap);
    for (const [k, v] of clickMap) result.set(k, v);
    return result;
  }

  const effectiveLeftMap  = mergedMap(showCorrelation ? leftColorMap  : new Map(), leftClickMap);
  const effectiveRightMap = mergedMap(showCorrelation ? rightColorMap : new Map(), rightClickMap);

  const handleValueClick = (val: string) => {
    setClickedValue(prev => prev === val ? null : val);
  };

  // ── Subtree selection callback ──
  const handleSubtreeSelect = useCallback((path: string) => {
    setSubtreePath(path || null);
  }, []);

  const clearSubtree = () => setSubtreePath(null);

  // ── Source change resets subtree + click ──
  const handleSourceChange = (s: CompareSource) => {
    setSource(s);
    setSubtreePath(null);
    setShowCorrelation(false);
    setClickedValue(null);
  };

  // ── Diff labels ──
  const diffLabel = {
    left:  left  ? shortUrl(left.url)  : 'A',
    right: right ? shortUrl(right.url) : 'B',
  };

  const hasRequest = !!(
    (left?.requestBody && left.requestBody.trim()) ||
    (right?.requestBody && right.requestBody.trim())
  );

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-devlens-border shrink-0 bg-devlens-surface flex-wrap">
        {/* Mode */}
        <div className="flex rounded overflow-hidden border border-devlens-border">
          {(['side-by-side', 'diff'] as CompareMode[]).map(m => (
            <button
              key={m}
              disabled={!bothPinned && m === 'diff'}
              className={`px-3 py-1 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                mode === m ? 'bg-devlens-accent text-white' : 'text-devlens-muted hover:text-devlens-text bg-devlens-bg'
              }`}
              onClick={() => setMode(m)}
            >
              {m === 'side-by-side' ? 'Side by Side' : 'Diff'}
            </button>
          ))}
        </div>

        {/* Source */}
        <SourceToggle value={source} onChange={handleSourceChange} hasRequest={hasRequest} />

        {/* Correlation — only for JSON side-by-side */}
        {bothPinned && mode === 'side-by-side' && source !== 'headers' && (
          <button
            className={`btn flex items-center gap-1.5 ${showCorrelation ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setShowCorrelation(c => !c)}
          >
            <Sparkles size={12} />
            {showCorrelation ? 'Correlation On' : 'Field Correlation'}
          </button>
        )}

        {/* Subtree breadcrumb */}
        {subtreePath && (
          <div className="flex items-center gap-1.5 bg-devlens-accent/10 border border-devlens-accent/30 rounded px-2 py-0.5">
            <Crosshair size={11} className="text-devlens-accent shrink-0" />
            <span className="font-mono text-[11px] text-devlens-accent max-w-[200px] truncate" title={`$.${subtreePath}`}>
              $.{subtreePath}
            </span>
            <button
              className="text-devlens-muted hover:text-devlens-text transition-colors ml-1"
              onClick={clearSubtree}
              title="Reset to full document"
            >
              <RotateCcw size={11} />
            </button>
          </div>
        )}

        {/* Click-highlight badge */}
        {clickedValue && (
          <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-0.5 shrink-0">
            <MousePointerClick size={10} className="text-amber-400 shrink-0" />
            <span className="font-mono text-[11px] text-amber-300 max-w-[140px] truncate" title={clickedValue}>
              {clickedValue.length > 18 ? clickedValue.slice(0, 18) + '…' : clickedValue}
            </span>
            <button
              className="text-devlens-muted hover:text-devlens-text transition-colors ml-0.5"
              onClick={() => setClickedValue(null)}
              title="Clear highlight"
            >
              <X size={10} />
            </button>
          </div>
        )}

        {/* Correlation match chips */}
        {bothPinned && showCorrelation && correlations.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap ml-auto">
            <span className="text-devlens-muted text-[10px]">{correlations.length} matches</span>
            {correlations.slice(0, 5).map((m, i) => (
              <span
                key={i}
                className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                style={{ background: m.color + '30', color: m.color, border: `1px solid ${m.color}50` }}
                title={`Value: "${m.value}"\nLeft: ${m.leftPaths.join(', ')}\nRight: ${m.rightPaths.join(', ')}`}
              >
                {m.value.length > 14 ? m.value.slice(0, 14) + '…' : m.value}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Content ── */}
      {mode === 'diff' && bothPinned ? (
        <div className="flex-1 overflow-hidden">
          <DiffViewer left={leftData} right={rightData} label={diffLabel} />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-devlens-border overflow-hidden">
            {left
              ? <>
                  <SlotBar req={left} label="A" labelColor="var(--color-devlens-accent)" onUnpin={() => onUnpin(0)} />
                  <div className="flex-1 overflow-auto p-2">
                    <PanelContent
                      data={leftData}
                      source={source}
                      raw={left.responseBody}
                      highlightPaths={effectiveLeftMap}
                      onSubtreeSelect={bothPinned ? p => handleSubtreeSelect(p) : undefined}
                      onValueClick={mode === 'side-by-side' ? handleValueClick : undefined}
                      activeValue={clickedValue}
                    />
                  </div>
                </>
              : <EmptySlot label="A" />
            }
          </div>

          {/* Right panel */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {right
              ? <>
                  <SlotBar req={right} label="B" labelColor="#a78bfa" onUnpin={() => onUnpin(1)} />
                  <div className="flex-1 overflow-auto p-2">
                    <PanelContent
                      data={rightData}
                      source={source}
                      raw={right.responseBody}
                      highlightPaths={effectiveRightMap}
                      onSubtreeSelect={bothPinned ? p => handleSubtreeSelect(p) : undefined}
                      onValueClick={mode === 'side-by-side' ? handleValueClick : undefined}
                      activeValue={clickedValue}
                    />
                  </div>
                </>
              : <EmptySlot label="B" />
            }
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Panel content ────────────────────────────────────────────────────────────

function PanelContent({
  data, source, raw, highlightPaths, onSubtreeSelect, onValueClick, activeValue,
}: {
  data: unknown;
  source: CompareSource;
  raw: string;
  highlightPaths?: Map<string, string>;
  onSubtreeSelect?: (path: string, value: unknown) => void;
  onValueClick?: (value: string) => void;
  activeValue?: string | null;
}) {
  if (source === 'headers' && data !== null && typeof data === 'object') {
    return <HeadersPanel headers={data as Record<string, string>} />;
  }

  if (data !== null && typeof data === 'object') {
    return (
      <JsonViewer
        data={data}
        highlightPaths={highlightPaths}
        onSubtreeSelect={onSubtreeSelect}
        onValueClick={onValueClick}
        activeValue={activeValue}
      />
    );
  }

  return (
    <pre className="text-devlens-text font-mono text-xs whitespace-pre-wrap break-all p-2">
      {raw || '(empty)'}
    </pre>
  );
}

// ─── Flat headers panel ───────────────────────────────────────────────────────

function HeadersPanel({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  const req  = entries.filter(([k]) => !k.startsWith('response:'));
  const res  = entries.filter(([k]) =>  k.startsWith('response:')).map(([k, v]) => [k.replace('response:', ''), v] as [string, string]);

  return (
    <div className="space-y-3">
      <HeaderSection title="Request Headers" entries={req} />
      <HeaderSection title="Response Headers" entries={res} />
    </div>
  );
}

function HeaderSection({ title, entries }: { title: string; entries: [string, string][] }) {
  if (entries.length === 0) return null;
  return (
    <div className="panel-section">
      <div className="section-header">{title}</div>
      <table className="w-full text-xs font-mono">
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="border-b border-devlens-border/50 hover:bg-white/5">
              <td className="py-1.5 px-3 text-blue-300 w-2/5 align-top">{k}</td>
              <td className="py-1.5 px-3 text-devlens-text break-all">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
