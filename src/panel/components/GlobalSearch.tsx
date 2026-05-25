import React, { useState, useMemo, useCallback } from 'react';
import { Search, ChevronDown, ChevronRight, ExternalLink, KeyRound, Hash } from 'lucide-react';
import { NetworkRequest } from '../hooks/useNetworkRequests';

interface Props {
  requests: NetworkRequest[];
  onNavigate: (req: NetworkRequest) => void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchMode = 'all' | 'keys' | 'values';

interface Match {
  path: string;
  key: string;
  value: unknown;
  matchOn: 'key' | 'value' | 'both';
}

interface Result {
  request: NetworkRequest;
  matches: Match[];
}

// ─── Search logic ─────────────────────────────────────────────────────────────

const MAX_MATCHES_PER_REQUEST = 40;

function searchPayload(data: unknown, query: string, mode: SearchMode, rootPath = ''): Match[] {
  const results: Match[] = [];
  const q = query.toLowerCase();

  function walk(v: unknown, path: string, key?: string | number) {
    if (results.length >= MAX_MATCHES_PER_REQUEST) return;

    const keyStr   = key !== undefined ? String(key) : '';
    const keyMatch = mode !== 'values' && keyStr.toLowerCase().includes(q);

    if (Array.isArray(v)) {
      if (keyMatch) results.push({ path, key: keyStr, value: v, matchOn: 'key' });
      v.forEach((item, i) => walk(item, path ? `${path}[${i}]` : `[${i}]`, i));
    } else if (v !== null && typeof v === 'object') {
      if (keyMatch) results.push({ path, key: keyStr, value: v, matchOn: 'key' });
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        walk(child, path ? `${path}.${k}` : k, k);
      }
    } else {
      // Primitive leaf
      const strVal   = v === null ? 'null' : String(v);
      const valMatch = mode !== 'keys' && strVal.toLowerCase().includes(q);
      if (keyMatch && valMatch) results.push({ path, key: keyStr, value: v, matchOn: 'both' });
      else if (keyMatch)        results.push({ path, key: keyStr, value: v, matchOn: 'key' });
      else if (valMatch)        results.push({ path, key: keyStr, value: v, matchOn: 'value' });
    }
  }

  walk(data, rootPath);
  return results;
}

function tryParse(s: string): unknown | null {
  try { return JSON.parse(s); } catch { return null; }
}

function shortUrl(url: string) {
  try {
    const u = new URL(url);
    return u.pathname.length > 40 ? '…' + u.pathname.slice(-39) : u.pathname;
  } catch { return url.slice(0, 40); }
}

function previewValue(v: unknown): string {
  if (v === null)            return 'null';
  if (typeof v === 'string') return `"${v.length > 60 ? v.slice(0, 60) + '…' : v}"`;
  if (typeof v === 'object') return Array.isArray(v) ? `[…${(v as unknown[]).length}]` : '{…}';
  return String(v);
}

// ─── Match badge ──────────────────────────────────────────────────────────────

function MatchBadge({ on }: { on: Match['matchOn'] }) {
  if (on === 'key')   return <span title="Key matched"  ><KeyRound size={9} className="text-blue-400 shrink-0" /></span>;
  if (on === 'value') return <span title="Value matched"><Hash     size={9} className="text-green-400 shrink-0" /></span>;
  return (
    <span className="flex items-center gap-0 shrink-0" title="Key + value matched">
      <KeyRound size={9} className="text-blue-400" />
      <Hash     size={9} className="text-green-400" />
    </span>
  );
}

// ─── Result row ───────────────────────────────────────────────────────────────

function ResultRow({
  result, query, onNavigate,
}: { result: Result; query: string; onNavigate: (req: NetworkRequest) => void }) {
  const [open, setOpen] = useState(false);
  const { request, matches } = result;

  const statusCls =
    request.status >= 500 ? 'badge-5xx' :
    request.status >= 400 ? 'badge-4xx' :
    request.status >= 300 ? 'badge-3xx' : 'badge-2xx';

  return (
    <div className="border-b border-devlens-border last:border-b-0">
      {/* Request header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-devlens-surface transition-colors group"
        onClick={() => setOpen(o => !o)}
      >
        <span className="shrink-0 text-devlens-muted">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>
        <span className={`badge ${statusCls} shrink-0`}>{request.status}</span>
        <span className="badge badge-method-GET shrink-0" style={{
          background: request.method === 'POST' ? 'rgb(88 28 135 / 0.4)' : undefined,
          color:      request.method === 'POST' ? '#d8b4fe' : undefined,
        }}>
          {request.method}
        </span>
        <span className="flex-1 font-mono text-[11px] text-devlens-text truncate" title={request.url}>
          {shortUrl(request.url)}
        </span>
        <span
          className="text-[10px] font-semibold shrink-0 rounded px-1.5 py-0.5"
          style={{ background: 'var(--color-devlens-accent)25', color: 'var(--color-devlens-accent)' }}
        >
          {matches.length}{matches.length >= MAX_MATCHES_PER_REQUEST ? '+' : ''} match{matches.length !== 1 ? 'es' : ''}
        </span>
        <button
          className="opacity-0 group-hover:opacity-100 shrink-0 text-devlens-muted hover:text-devlens-text transition-all"
          title="Open in Inspector"
          onClick={e => { e.stopPropagation(); onNavigate(request); }}
        >
          <ExternalLink size={12} />
        </button>
      </div>

      {/* Match list */}
      {open && (
        <div className="bg-devlens-bg/60 border-t border-devlens-border/50">
          {matches.map((m, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-4 py-1.5 hover:bg-devlens-surface/60 cursor-pointer group/match border-b border-devlens-border/30 last:border-b-0"
              onClick={() => onNavigate(request)}
              title="Open in Inspector"
            >
              <MatchBadge on={m.matchOn} />
              <span className="font-mono text-[10px] text-devlens-muted shrink-0">
                $.{m.path}
              </span>
              <span className="font-mono text-[11px] flex-1 truncate" style={{
                color: typeof m.value === 'string' ? '#86efac'
                  : typeof m.value === 'number' ? '#fcd34d'
                  : typeof m.value === 'boolean' ? '#d8b4fe'
                  : m.value === null ? '#94a3b8'
                  : 'var(--color-devlens-text)',
              }}>
                {highlightQuery(previewValue(m.value), query)}
              </span>
            </div>
          ))}
          {matches.length >= MAX_MATCHES_PER_REQUEST && (
            <div className="px-4 py-1.5 text-[10px] text-devlens-muted italic">
              Showing first {MAX_MATCHES_PER_REQUEST} matches — open in Inspector for full search
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Query highlight helper ───────────────────────────────────────────────────

function highlightQuery(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
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

// ─── Mode toggle ──────────────────────────────────────────────────────────────

function ModeToggle({ value, onChange }: { value: SearchMode; onChange: (v: SearchMode) => void }) {
  const opts: { id: SearchMode; label: string }[] = [
    { id: 'all',    label: 'Keys + Values' },
    { id: 'keys',   label: 'Keys' },
    { id: 'values', label: 'Values' },
  ];
  return (
    <div className="flex rounded overflow-hidden border border-devlens-border shrink-0">
      {opts.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-2 py-1 text-[11px] transition-colors ${
            value === id
              ? 'bg-devlens-accent text-white'
              : 'text-devlens-muted hover:text-devlens-text bg-devlens-bg'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GlobalSearch({ requests, onNavigate }: Props) {
  const [query, setQuery]   = useState('');
  const [mode, setMode]     = useState<SearchMode>('all');

  const results: Result[] = useMemo(() => {
    const q = query.trim();
    if (q.length < 2) return [];

    const out: Result[] = [];
    for (const req of requests) {
      const parsed = tryParse(req.responseBody);
      if (parsed === null || typeof parsed !== 'object') continue;
      const matches = searchPayload(parsed, q, mode);
      if (matches.length > 0) out.push({ request: req, matches });
    }
    return out;
  }, [requests, query, mode]);

  const totalMatches = results.reduce((s, r) => s + r.matches.length, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-devlens-border bg-devlens-surface shrink-0 space-y-2">
        <div className="flex items-center gap-2 bg-devlens-bg border border-devlens-border rounded px-3 py-1.5 focus-within:border-devlens-accent transition-colors">
          <Search size={13} className="text-devlens-muted shrink-0" />
          <input
            type="text"
            autoFocus
            placeholder="Search across all captured responses…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-devlens-text placeholder-devlens-muted outline-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle value={mode} onChange={setMode} />
          {query.trim().length >= 2 && (
            <span className="text-[11px] text-devlens-muted">
              {results.length === 0
                ? 'No matches'
                : `${results.length} request${results.length !== 1 ? 's' : ''} · ${totalMatches} match${totalMatches !== 1 ? 'es' : ''}`}
            </span>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto">
        {query.trim().length < 2 && (
          <div className="flex flex-col items-center justify-center h-full text-devlens-muted text-sm gap-3">
            <Search size={28} strokeWidth={1.5} />
            <div className="text-center space-y-1">
              <p>Search keys and values across all responses</p>
              <p className="text-[11px]">Type at least 2 characters to begin</p>
            </div>
            <div className="flex gap-3 text-[11px] mt-1">
              <span className="flex items-center gap-1"><KeyRound size={10} className="text-blue-400" /> key match</span>
              <span className="flex items-center gap-1"><Hash size={10} className="text-green-400" /> value match</span>
            </div>
          </div>
        )}

        {query.trim().length >= 2 && results.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-devlens-muted text-sm gap-2">
            <Search size={28} strokeWidth={1.5} />
            <p>No matches for <span className="font-mono text-devlens-text">"{query}"</span></p>
            <p className="text-[11px]">Try switching the search mode or a broader query</p>
          </div>
        )}

        {results.map(result => (
          <ResultRow
            key={result.request.id}
            result={result}
            query={query.trim()}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}
