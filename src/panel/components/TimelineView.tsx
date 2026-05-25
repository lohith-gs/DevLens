import React, { useRef, useState, useEffect, useMemo } from 'react';
import { BarChart2, GitCommitHorizontal, Code2, Globe, AlertTriangle, Gauge } from 'lucide-react';
import { NetworkRequest } from '../hooks/useNetworkRequests';
import { buildTimeline, TimelineEntry } from '../utils/buildTimeline';

interface Props {
  requests: NetworkRequest[];
}

const BAR_HEIGHT  = 22;
const ROW_GAP     = 4;
const LABEL_WIDTH = 200;
const MIN_BAR_WIDTH = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return '#22c55e';
  if (status >= 300 && status < 400) return '#3b82f6';
  if (status >= 400 && status < 500) return '#f59e0b';
  if (status >= 500) return '#ef4444';
  return '#64748b';
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortPath(url: string, maxLen = 28): string {
  try {
    const u = new URL(url);
    const p = u.pathname;
    return p.length > maxLen ? '…' + p.slice(-(maxLen - 1)) : p;
  } catch {
    return url.slice(0, maxLen);
  }
}

function shortFile(url: string | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    return segs[segs.length - 1] || u.hostname;
  } catch {
    return url.split('/').pop() || url;
  }
}

function isFailed(status: number): boolean {
  return status >= 400;
}

// ─── Slow threshold options ───────────────────────────────────────────────────

const SLOW_OPTIONS: { label: string; ms: number }[] = [
  { label: 'All speeds', ms: 0 },
  { label: '> 500ms',    ms: 500 },
  { label: '> 1s',       ms: 1000 },
  { label: '> 2s',       ms: 2000 },
  { label: '> 5s',       ms: 5000 },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function TimelineView({ requests }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [hovered, setHovered]   = useState<string | null>(null);
  const [groupBy, setGroupBy]   = useState<'domain' | 'none'>('domain');
  const [slowMs, setSlowMs]     = useState(0);
  const [failedOnly, setFailedOnly] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      setContainerWidth(entries[0].contentRect.width - LABEL_WIDTH - 20);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-devlens-muted text-sm gap-2">
        <BarChart2 size={28} strokeWidth={1.5} />
        <span>No requests captured yet</span>
      </div>
    );
  }

  const { groups, totalMs } = buildTimeline(requests);
  const trackWidth = Math.max(containerWidth, 200);

  // Flatten all entries for cascade line drawing + row indexing
  const allEntries: TimelineEntry[] = groups.flatMap(g => g.entries);
  const entryById = new Map(allEntries.map(e => [e.request.id, e]));

  // Per-entry active state (filter check)
  function isActive(entry: TimelineEntry): boolean {
    if (failedOnly && !isFailed(entry.request.status)) return false;
    if (slowMs > 0 && entry.durationMs < slowMs) return false;
    return true;
  }

  const activeCount = useMemo(
    () => allEntries.filter(e => isActive(e)).length,
    [allEntries, failedOnly, slowMs]
  );

  const filtersOn = failedOnly || slowMs > 0;

  // Assign row index
  const rowIndex = new Map<string, number>();
  let row = 0;
  for (const group of groups) {
    for (const entry of group.entries) rowIndex.set(entry.request.id, row++);
    row++; // group gap
  }
  const totalRows = row;
  const svgHeight = totalRows * (BAR_HEIGHT + ROW_GAP);

  function xOf(offsetMs: number)    { return (offsetMs / totalMs) * trackWidth; }
  function widthOf(durationMs: number) { return Math.max(MIN_BAR_WIDTH, (durationMs / totalMs) * trackWidth); }
  function yOf(r: number)           { return r * (BAR_HEIGHT + ROW_GAP); }

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ── */}
      <div className="px-4 py-2 border-b border-devlens-border bg-devlens-surface flex items-center gap-3 shrink-0 flex-wrap">
        {/* Summary */}
        <span className="text-xs text-devlens-muted shrink-0">
          {filtersOn
            ? `${activeCount} / ${requests.length} requests · ${formatMs(totalMs)} total`
            : `${requests.length} requests · ${formatMs(totalMs)} total`}
        </span>

        <div className="flex items-center gap-2 ml-auto">
          {/* Slow filter */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Gauge size={12} className="text-devlens-muted" />
            <select
              className={`bg-devlens-bg border rounded px-2 py-0.5 text-xs outline-none transition-colors ${
                slowMs > 0
                  ? 'border-amber-500/60 text-amber-300'
                  : 'border-devlens-border text-devlens-muted'
              }`}
              value={slowMs}
              onChange={e => setSlowMs(Number(e.target.value))}
            >
              {SLOW_OPTIONS.map(o => (
                <option key={o.ms} value={o.ms}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Failed filter */}
          <button
            onClick={() => setFailedOnly(f => !f)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] transition-colors shrink-0 ${
              failedOnly
                ? 'bg-red-500/15 border-red-500/50 text-red-400'
                : 'border-devlens-border text-devlens-muted hover:text-devlens-text'
            }`}
            title="Show only failed requests (4xx / 5xx)"
          >
            <AlertTriangle size={11} />
            Failed{failedOnly && activeCount > 0 ? ` (${activeCount})` : ''}
          </button>

          {/* Group by */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] text-devlens-muted">Group:</span>
            <select
              className="bg-devlens-bg border border-devlens-border rounded px-2 py-0.5 text-xs text-devlens-text outline-none"
              value={groupBy}
              onChange={e => setGroupBy(e.target.value as 'domain' | 'none')}
            >
              <option value="domain">Domain</option>
              <option value="none">None</option>
            </select>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 shrink-0">
          {[['2xx', '#22c55e'], ['3xx', '#3b82f6'], ['4xx', '#f59e0b'], ['5xx', '#ef4444']].map(([label, color]) => (
            <span key={label} className="flex items-center gap-1 text-[10px] text-devlens-muted">
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Timeline ── */}
      <div className="flex-1 overflow-auto" ref={containerRef}>
        <div className="flex" style={{ minWidth: LABEL_WIDTH + trackWidth + 20 }}>

          {/* Labels column */}
          <div className="shrink-0" style={{ width: LABEL_WIDTH }}>
            <div style={{ height: 24 }} /> {/* ruler spacer */}
            {groups.map(group => (
              <div key={group.label}>
                {groupBy === 'domain' && (
                  <div
                    className="px-2 py-0.5 text-[10px] font-semibold text-devlens-accent uppercase tracking-wider truncate"
                    style={{ height: BAR_HEIGHT + ROW_GAP }}
                  >
                    {group.label}
                  </div>
                )}
                {group.entries.map(entry => {
                  const active = isActive(entry);
                  const init = entry.request.initiator;
                  return (
                    <div
                      key={entry.request.id}
                      className={`flex items-center gap-1 px-2 text-[11px] font-mono cursor-default transition-all ${
                        hovered === entry.request.id ? 'text-devlens-text' : 'text-devlens-muted'
                      }`}
                      style={{
                        height: BAR_HEIGHT + ROW_GAP,
                        opacity: filtersOn && !active ? 0.18 : 1,
                      }}
                      onMouseEnter={() => setHovered(entry.request.id)}
                      onMouseLeave={() => setHovered(null)}
                    >
                      {/* Initiator icon */}
                      {init && (
                        <span className="shrink-0" title={
                          init.type === 'script'
                            ? `Script-initiated${init.sourceUrl ? ` · ${shortFile(init.sourceUrl)}${init.lineNumber != null ? `:${init.lineNumber}` : ''}` : ''}`
                            : init.type === 'parser'
                            ? `Parser-initiated${init.sourceUrl ? ` · ${shortFile(init.sourceUrl)}` : ''}`
                            : 'Initiated by unknown'
                        }>
                          {init.type === 'script'
                            ? <Code2 size={9} className="text-purple-400" />
                            : init.type === 'parser'
                            ? <Globe size={9} className="text-blue-400" />
                            : null}
                        </span>
                      )}
                      <span className="truncate flex-1" title={entry.request.url}>
                        {shortPath(entry.request.url)}
                      </span>
                    </div>
                  );
                })}
                <div style={{ height: BAR_HEIGHT + ROW_GAP }} /> {/* group gap */}
              </div>
            ))}
          </div>

          {/* SVG track */}
          <div className="flex-1 relative" style={{ minWidth: trackWidth }}>
            {/* Time ruler */}
            <div className="relative border-b border-devlens-border" style={{ height: 24 }}>
              {[0, 0.25, 0.5, 0.75, 1].map(f => (
                <div
                  key={f}
                  className="absolute top-0 bottom-0 flex flex-col justify-end"
                  style={{ left: f * trackWidth }}
                >
                  <span className="text-[9px] text-devlens-muted pb-0.5 pl-0.5">{formatMs(f * totalMs)}</span>
                  <div className="w-px h-2 bg-devlens-border" />
                </div>
              ))}
            </div>

            <svg width={trackWidth} height={svgHeight}>
              {/* Grid lines */}
              {[0.25, 0.5, 0.75].map(f => (
                <line
                  key={f}
                  x1={f * trackWidth} y1={0}
                  x2={f * trackWidth} y2={svgHeight}
                  stroke="#2a2d3a" strokeWidth={1}
                />
              ))}

              {/* Cascade bezier lines — always shown at reduced opacity */}
              {allEntries.map(entry =>
                entry.cascadeFrom.map(fromId => {
                  const from = entryById.get(fromId);
                  if (!from) return null;
                  const fromRow = rowIndex.get(fromId)!;
                  const toRow   = rowIndex.get(entry.request.id)!;
                  const x1 = xOf(from.offsetMs + from.durationMs);
                  const y1 = yOf(fromRow) + BAR_HEIGHT / 2;
                  const x2 = xOf(entry.offsetMs);
                  const y2 = yOf(toRow) + BAR_HEIGHT / 2;
                  const lineOpacity = filtersOn && (!isActive(from) || !isActive(entry)) ? 0.08 : 0.5;
                  return (
                    <g key={`${fromId}-${entry.request.id}`}>
                      <path
                        d={`M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`}
                        fill="none"
                        stroke="var(--color-devlens-accent)"
                        strokeWidth={1}
                        strokeDasharray="3 2"
                        opacity={lineOpacity}
                      />
                      <circle cx={x2} cy={y2} r={2.5} fill="var(--color-devlens-accent)" opacity={lineOpacity} />
                    </g>
                  );
                })
              )}

              {/* Bars */}
              {allEntries.map(entry => {
                const r       = rowIndex.get(entry.request.id)!;
                const x       = xOf(entry.offsetMs);
                const w       = widthOf(entry.durationMs);
                const y       = yOf(r);
                const color   = statusColor(entry.request.status);
                const isHov   = hovered === entry.request.id;
                const active  = isActive(entry);
                const barOpacity = filtersOn && !active ? 0.12 : isHov ? 1 : 0.75;

                return (
                  <g
                    key={entry.request.id}
                    onMouseEnter={() => setHovered(entry.request.id)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: 'default' }}
                  >
                    <rect
                      x={x} y={y} width={w} height={BAR_HEIGHT}
                      fill={color}
                      opacity={barOpacity}
                      rx={2}
                    />
                    {isHov && active && (
                      <rect x={x} y={y} width={w} height={BAR_HEIGHT}
                        fill="none" stroke="white" strokeWidth={1} rx={2} opacity={0.8}
                      />
                    )}
                    {/* Slow indicator stripe */}
                    {slowMs > 0 && active && entry.durationMs >= slowMs && (
                      <rect
                        x={x} y={y} width={4} height={BAR_HEIGHT}
                        fill="white" opacity={0.35} rx={2}
                      />
                    )}
                    {w > 30 && active && (
                      <text
                        x={x + (slowMs > 0 && entry.durationMs >= slowMs ? 8 : 4)}
                        y={y + BAR_HEIGHT / 2 + 4}
                        fill="white" fontSize={9} opacity={0.9}
                      >
                        {formatMs(entry.durationMs)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* ── Hover tooltip ── */}
        {hovered && (() => {
          const entry = allEntries.find(e => e.request.id === hovered);
          if (!entry) return null;
          const init = entry.request.initiator;
          const statusBadge = entry.request.status >= 500 ? 'badge-5xx'
            : entry.request.status >= 400 ? 'badge-4xx'
            : entry.request.status >= 300 ? 'badge-3xx' : 'badge-2xx';
          return (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-devlens-surface border border-devlens-border rounded px-3 py-2 text-xs shadow-lg z-50 pointer-events-none max-w-sm">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-devlens-accent uppercase">{entry.request.method}</span>
                <span className={`badge ${statusBadge}`}>{entry.request.status}</span>
                <span className="text-devlens-muted">{formatMs(entry.durationMs)}</span>
                {entry.cascadeFrom.length > 0 && (
                  <span className="flex items-center gap-0.5 text-devlens-accent text-[10px]">
                    <GitCommitHorizontal size={11} />
                    cascade ({entry.cascadeFrom.length})
                  </span>
                )}
                {slowMs > 0 && entry.durationMs >= slowMs && (
                  <span className="flex items-center gap-0.5 text-amber-400 text-[10px]">
                    <Gauge size={10} /> slow
                  </span>
                )}
              </div>
              <p className="font-mono text-devlens-text truncate">{entry.request.url}</p>
              <p className="text-devlens-muted text-[10px] mt-0.5">
                start: +{formatMs(entry.offsetMs)} · size: {(entry.request.size / 1024).toFixed(1)} KB
              </p>
              {/* Initiator info */}
              {init && (
                <p className="text-devlens-muted text-[10px] mt-0.5 flex items-center gap-1">
                  {init.type === 'script'
                    ? <Code2 size={9} className="text-purple-400 shrink-0" />
                    : init.type === 'parser'
                    ? <Globe size={9} className="text-blue-400 shrink-0" />
                    : null}
                  <span>
                    {init.type === 'script' ? 'Script' : init.type === 'parser' ? 'Parser' : 'Unknown'}-initiated
                    {init.sourceUrl && (
                      <span className="text-devlens-text ml-1">
                        {shortFile(init.sourceUrl)}
                        {init.lineNumber != null ? `:${init.lineNumber}` : ''}
                      </span>
                    )}
                  </span>
                </p>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
