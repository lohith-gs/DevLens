import React, { useState, useMemo } from 'react';
import { Pin, Wifi, Trash2, FileSearch, X } from 'lucide-react';
import { NetworkRequest } from '../hooks/useNetworkRequests';
import { extractGraphQL } from '../utils/graphql';

interface Props {
  requests: NetworkRequest[];
  selectedId: string | null;
  onSelect: (req: NetworkRequest) => void;
  onPin: (req: NetworkRequest) => void;
  isPinned: (id: string) => boolean;
  onClear: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusClass(status: number) {
  if (status >= 200 && status < 300) return 'badge-2xx';
  if (status >= 300 && status < 400) return 'badge-3xx';
  if (status >= 400 && status < 500) return 'badge-4xx';
  if (status >= 500) return 'badge-5xx';
  return 'badge-pending';
}

function methodClass(method: string) {
  const m = method.toUpperCase();
  return ['GET','POST','PUT','PATCH','DELETE'].includes(m) ? `badge-method-${m}` : 'badge-method-OTHER';
}

function shortUrl(url: string) {
  try {
    const u = new URL(url);
    const q = u.search.length > 20 ? u.search.slice(0, 20) + '…' : u.search;
    return u.pathname + q;
  } catch {
    return url.length > 50 ? url.slice(0, 50) + '…' : url;
  }
}

function formatDuration(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function getDomain(url: string) {
  try { return new URL(url).hostname; } catch { return 'unknown'; }
}

function isGraphQL(req: NetworkRequest): boolean {
  if (req.url.toLowerCase().includes('/graphql')) return true;
  if (req.requestHeaders['content-type']?.includes('application/graphql')) return true;
  try {
    const body = JSON.parse(req.requestBody);
    return typeof body?.query === 'string';
  } catch { return false; }
}

// ─── Chip button ──────────────────────────────────────────────────────────────

function Chip({
  label, active, onClick, color,
}: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide transition-colors border shrink-0"
      style={active && color
        ? { background: color + '25', borderColor: color + '60', color }
        : active
        ? { background: 'var(--color-devlens-accent)', borderColor: 'var(--color-devlens-accent)', color: 'white' }
        : { background: 'transparent', borderColor: 'var(--color-devlens-border)', color: 'var(--color-devlens-muted)' }
      }
    >
      {label}
    </button>
  );
}

// ─── Status group check ───────────────────────────────────────────────────────

function matchesStatusGroup(status: number, group: string): boolean {
  if (group === '2xx') return status >= 200 && status < 300;
  if (group === '3xx') return status >= 300 && status < 400;
  if (group === '4xx') return status >= 400 && status < 500;
  if (group === '5xx') return status >= 500;
  return false;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RequestList({ requests, selectedId, onSelect, onPin, isPinned, onClear }: Props) {
  const [text, setText]           = useState('');
  const [methods, setMethods]     = useState<Set<string>>(new Set());
  const [statuses, setStatuses]   = useState<Set<string>>(new Set());
  const [domain, setDomain]       = useState('');
  const [gqlOnly, setGqlOnly]     = useState(false);
  const [inBody, setInBody]       = useState(false);
  const [opFilter, setOpFilter]   = useState('');

  // Unique domains across all requests
  const domains = useMemo(() => {
    const set = new Set(requests.map(r => getDomain(r.url)));
    return ['', ...Array.from(set).sort()];
  }, [requests]);

  // GraphQL operation metadata: op name per request + repeat counts
  const gqlMeta = useMemo(() => {
    const opNames = new Map<string, string>();   // requestId → opName
    const counts  = new Map<string, number>();   // opName → count across ALL requests
    for (const req of requests) {
      if (!isGraphQL(req)) continue;
      const info = extractGraphQL(req.requestBody);
      const name = info?.operationName ?? '(anonymous)';
      opNames.set(req.id, name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return { opNames, counts };
  }, [requests]);

  const toggleMethod = (m: string) => {
    setMethods(prev => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n; });
  };
  const toggleStatus = (s: string) => {
    setStatuses(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  };

  const filtered = useMemo(() => {
    return requests.filter(r => {
      // Text search
      if (text) {
        const t = text.toLowerCase();
        const inUrl    = r.url.toLowerCase().includes(t);
        const inMethod = r.method.toLowerCase().includes(t);
        const inStatus = String(r.status).includes(t);
        const inResp   = inBody && r.responseBody.toLowerCase().includes(t);
        if (!inUrl && !inMethod && !inStatus && !inResp) return false;
      }
      // Method filter
      if (methods.size > 0 && !methods.has(r.method.toUpperCase())) return false;
      // Status group filter
      if (statuses.size > 0 && ![...statuses].some(s => matchesStatusGroup(r.status, s))) return false;
      // Domain filter
      if (domain && getDomain(r.url) !== domain) return false;
      // GraphQL filter
      if (gqlOnly && !isGraphQL(r)) return false;
      // Operation filter
      if (opFilter && gqlMeta.opNames.get(r.id) !== opFilter) return false;
      return true;
    });
  }, [requests, text, methods, statuses, domain, gqlOnly, inBody, opFilter, gqlMeta]);

  const hasFilters = methods.size > 0 || statuses.size > 0 || domain || gqlOnly || !!opFilter;

  const clearFilters = () => {
    setText(''); setMethods(new Set()); setStatuses(new Set());
    setDomain(''); setGqlOnly(false); setInBody(false); setOpFilter('');
  };

  return (
    <div className="flex flex-col h-full bg-devlens-bg border-r border-devlens-border">

      {/* Header */}
      <div className="px-3 py-2 border-b border-devlens-border flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-devlens-accent font-bold text-sm tracking-tight">DevLens</span>
          <span className="text-devlens-muted text-[10px]">
            {filtered.length !== requests.length
              ? `${filtered.length} / ${requests.length}`
              : `${requests.length}`} reqs
          </span>
        </div>
        <div className="flex items-center gap-1">
          {hasFilters && (
            <button className="text-[10px] text-devlens-muted hover:text-amber-400 transition-colors px-1" onClick={clearFilters}>
              Reset
            </button>
          )}
          <button className="btn-danger flex items-center gap-1" onClick={onClear} title="Clear all requests">
            <Trash2 size={11} /> Clear
          </button>
        </div>
      </div>

      {/* Text search */}
      <div className="px-2 pt-1.5 pb-1 border-b border-devlens-border shrink-0 space-y-1.5">
        <div className="flex items-center gap-1 bg-devlens-surface border border-devlens-border rounded px-2 py-1">
          <input
            type="text"
            placeholder="URL, method, status…"
            value={text}
            onChange={e => setText(e.target.value)}
            className="flex-1 bg-transparent text-xs text-devlens-text placeholder-devlens-muted outline-none"
          />
          <button
            title={inBody ? 'Also searching response bodies' : 'Click to search response bodies too'}
            onClick={() => setInBody(b => !b)}
            className="flex items-center gap-0.5 shrink-0 transition-colors"
            style={{ color: inBody ? 'var(--color-devlens-accent)' : 'var(--color-devlens-muted)' }}
          >
            <FileSearch size={12} />
          </button>
        </div>
        {inBody && (
          <p className="text-[10px] text-devlens-accent px-1">Searching response bodies</p>
        )}
      </div>

      {/* Filter chips */}
      <div className="px-2 py-1.5 border-b border-devlens-border shrink-0 space-y-1.5">
        {/* Method chips */}
        <div className="flex gap-1 flex-wrap">
          {['GET','POST','PUT','PATCH','DELETE'].map(m => (
            <Chip
              key={m} label={m} active={methods.has(m)} onClick={() => toggleMethod(m)}
              color={m === 'GET' ? '#60a5fa' : m === 'POST' ? '#c084fc' : m === 'PUT' ? '#fcd34d' : m === 'PATCH' ? '#fb923c' : '#f87171'}
            />
          ))}
          <Chip label="GQL" active={gqlOnly} onClick={() => setGqlOnly(g => !g)} color="#e879f9" />
        </div>

        {/* Status chips + domain */}
        <div className="flex items-center gap-1 flex-wrap">
          {[
            { label: '2xx', color: '#4ade80' },
            { label: '3xx', color: '#60a5fa' },
            { label: '4xx', color: '#fbbf24' },
            { label: '5xx', color: '#f87171' },
          ].map(({ label, color }) => (
            <Chip key={label} label={label} active={statuses.has(label)} onClick={() => toggleStatus(label)} color={color} />
          ))}

          {domains.length > 2 && (
            <select
              value={domain}
              onChange={e => setDomain(e.target.value)}
              className="ml-auto text-[10px] bg-devlens-surface border rounded px-1.5 py-0.5 outline-none max-w-[110px] truncate transition-colors"
              style={{
                borderColor: domain ? 'var(--color-devlens-accent)' : 'var(--color-devlens-border)',
                color: domain ? 'var(--color-devlens-accent)' : 'var(--color-devlens-muted)',
              }}
            >
              <option value="">All domains</option>
              {domains.filter(Boolean).map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}
        </div>
        {/* Active operation filter chip */}
        {opFilter && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-devlens-muted">Op:</span>
            <button
              onClick={() => setOpFilter('')}
              className="flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded text-[10px] font-mono border"
              style={{ background: '#e879f920', borderColor: '#e879f950', color: '#e879f9' }}
            >
              {opFilter}
              <X size={9} />
            </button>
          </div>
        )}
      </div>

      {/* Request list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-devlens-muted text-xs gap-2">
            <Wifi size={22} strokeWidth={1.5} />
            <span>{requests.length === 0 ? 'Waiting for requests…' : 'No matches'}</span>
          </div>
        )}
        {filtered.map(req => {
          const opName  = gqlMeta.opNames.get(req.id);
          const opCount = opName ? (gqlMeta.counts.get(opName) ?? 1) : 0;
          return (
            <div
              key={req.id}
              className={`request-row group ${selectedId === req.id ? 'selected' : ''}`}
              onClick={() => onSelect(req)}
            >
              <span className={`badge ${methodClass(req.method)} shrink-0 whitespace-nowrap`}>
                {req.method}
              </span>
              <span className={`badge ${statusClass(req.status)} shrink-0 whitespace-nowrap`}>
                {req.status || '—'}
              </span>
              <span className="flex-1 truncate text-devlens-text font-mono text-[11px]" title={req.url}>
                {shortUrl(req.url)}
              </span>

              {/* Operation name + repeat count (GQL requests only) */}
              {opName && (
                <button
                  className="shrink-0 flex items-center gap-0.5 max-w-[80px] text-[10px] font-mono px-1.5 py-0.5 rounded border truncate"
                  style={{
                    background: opFilter === opName ? '#e879f930' : '#e879f915',
                    borderColor: '#e879f940',
                    color: '#e879f9',
                  }}
                  title={`Filter by operation: ${opName}`}
                  onClick={e => {
                    e.stopPropagation();
                    setOpFilter(prev => prev === opName ? '' : opName);
                  }}
                >
                  <span className="truncate">{opName}</span>
                  {opCount > 1 && (
                    <span className="shrink-0 ml-0.5 opacity-70">×{opCount}</span>
                  )}
                </button>
              )}

              <span className="text-devlens-muted shrink-0 w-12 text-right">
                {formatDuration(req.duration)}
              </span>
              <button
                className={`shrink-0 rounded p-1 transition-colors ${
                  isPinned(req.id)
                    ? 'text-devlens-accent bg-devlens-accent/10'
                    : 'opacity-0 group-hover:opacity-100 text-devlens-muted hover:text-devlens-accent bg-devlens-surface border border-devlens-border'
                }`}
                onClick={e => { e.stopPropagation(); onPin(req); }}
                title={isPinned(req.id) ? 'Pinned' : 'Pin for comparison'}
              >
                <Pin size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
