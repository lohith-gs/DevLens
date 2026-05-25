import React, { useState, useMemo } from 'react';
import {
  Waypoints, ChevronDown, ChevronRight, Shield, Search, X,
  ArrowRight, ArrowLeft, ArrowLeftRight,
} from 'lucide-react';
import { NetworkRequest } from '../hooks/useNetworkRequests';
import { detectEntities, DetectedEntity, EntityOccurrence } from '../utils/detectEntities';

interface Props {
  requests: NetworkRequest[];
  onNavigate?: (req: NetworkRequest) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.length > 36 ? '…' + u.pathname.slice(-35) : u.pathname;
  } catch { return url.slice(0, 36); }
}

function statusCls(status: number): string {
  if (status >= 500) return 'badge-5xx';
  if (status >= 400) return 'badge-4xx';
  if (status >= 300) return 'badge-3xx';
  return 'badge-2xx';
}

// ─── Flow node ────────────────────────────────────────────────────────────────

function FlowNode({
  occ, role, color, onNavigate,
}: {
  occ: EntityOccurrence;
  role: 'producer' | 'consumer' | 'both';
  color: string;
  onNavigate?: () => void;
}) {
  const paths = role === 'producer' ? occ.resPaths
    : role === 'consumer' ? occ.reqPaths
    : [...occ.resPaths, ...occ.reqPaths];

  const RoleIcon = role === 'producer' ? ArrowRight
    : role === 'consumer' ? ArrowLeft
    : ArrowLeftRight;

  return (
    <div
      className={`flex items-start gap-2 px-2 py-1.5 rounded border ${onNavigate ? 'cursor-pointer hover:brightness-110' : ''}`}
      style={{ borderColor: color + '40', background: color + '0d' }}
      onClick={onNavigate}
      title={onNavigate ? 'Open in Inspector' : undefined}
    >
      {/* Role icon */}
      <span className="shrink-0 mt-0.5" title={
        role === 'producer' ? 'Produces this value in response'
          : role === 'consumer' ? 'Consumes this value in request'
          : 'Both produces and consumes'
      }>
        <RoleIcon size={11} style={{ color }} />
      </span>

      {/* Request info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={`badge ${statusCls(occ.status)} shrink-0`}>{occ.status}</span>
          <span className="text-[10px] font-semibold uppercase text-devlens-muted shrink-0 w-10">{occ.method}</span>
          <span className="font-mono text-[11px] text-devlens-text truncate flex-1" title={occ.url}>
            {shortUrl(occ.url)}
          </span>
        </div>

        {/* Paths */}
        <div className="flex flex-wrap gap-1">
          {paths.slice(0, 5).map((p, i) => (
            <span
              key={i}
              className="text-[10px] font-mono px-1 py-0.5 rounded"
              style={{ background: color + '20', color }}
            >
              $.{p}
            </span>
          ))}
          {paths.length > 5 && (
            <span className="text-[10px] text-devlens-muted">+{paths.length - 5} more</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Entity row ───────────────────────────────────────────────────────────────

function EntityRow({
  entity, requests, onNavigate,
}: {
  entity: DetectedEntity;
  requests: NetworkRequest[];
  onNavigate?: (req: NetworkRequest) => void;
}) {
  const [open, setOpen] = useState(false);

  const producers = entity.occurrences.filter(o => o.resPaths.length > 0 && o.reqPaths.length === 0);
  const consumers = entity.occurrences.filter(o => o.reqPaths.length > 0 && o.resPaths.length === 0);
  const both      = entity.occurrences.filter(o => o.resPaths.length > 0 && o.reqPaths.length > 0);

  const navigate = (occ: EntityOccurrence) => {
    if (!onNavigate) return;
    const req = requests.find(r => r.id === occ.requestId);
    if (req) onNavigate(req);
  };

  const hasFlow = producers.length > 0 && consumers.length > 0;

  return (
    <div className="border-b border-devlens-border last:border-b-0">
      {/* Summary row */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-devlens-surface transition-colors group"
        onClick={() => setOpen(o => !o)}
      >
        <span className="shrink-0 text-devlens-muted">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </span>

        {/* Color swatch */}
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entity.color }} />

        {/* Value */}
        <span
          className="font-mono text-[11px] flex-1 truncate text-devlens-text"
          title={entity.value}
        >
          {entity.value.length > 52 ? entity.value.slice(0, 52) + '…' : entity.value}
        </span>

        {/* Auth badge */}
        {entity.isAuthLike && (
          <span title="Looks like an auth/session value">
            <Shield size={11} className="text-amber-400 shrink-0" />
          </span>
        )}

        {/* Flow indicator */}
        {hasFlow && (
          <span title="Flow detected: some requests produce, others consume">
            <Waypoints size={11} className="text-devlens-accent shrink-0" />
          </span>
        )}

        {/* Count */}
        <span className="text-[10px] text-devlens-muted shrink-0">
          {entity.occurrences.length} req{entity.occurrences.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="bg-devlens-bg/60 border-t border-devlens-border/50 px-3 py-2 space-y-2.5">
          {/* Producers */}
          {producers.length > 0 && (
            <div>
              <p className="text-[10px] text-devlens-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <ArrowRight size={9} style={{ color: entity.color }} />
                Produced in response
              </p>
              <div className="space-y-1">
                {producers.map((occ, i) => (
                  <FlowNode key={i} occ={occ} role="producer" color={entity.color}
                    onNavigate={onNavigate ? () => navigate(occ) : undefined} />
                ))}
              </div>
            </div>
          )}

          {/* Flow arrow between producers and consumers */}
          {hasFlow && (
            <div className="flex items-center gap-2 pl-2">
              <div className="h-px flex-1" style={{ background: entity.color + '50' }} />
              <span className="text-[10px] text-devlens-muted italic">then used by</span>
              <div className="h-px flex-1" style={{ background: entity.color + '50' }} />
            </div>
          )}

          {/* Consumers */}
          {consumers.length > 0 && (
            <div>
              {!hasFlow && (
                <p className="text-[10px] text-devlens-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <ArrowLeft size={9} style={{ color: entity.color }} />
                  Consumed in request
                </p>
              )}
              <div className="space-y-1">
                {consumers.map((occ, i) => (
                  <FlowNode key={i} occ={occ} role="consumer" color={entity.color}
                    onNavigate={onNavigate ? () => navigate(occ) : undefined} />
                ))}
              </div>
            </div>
          )}

          {/* Both (produce + consume in same request) */}
          {both.length > 0 && (
            <div>
              <p className="text-[10px] text-devlens-muted uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <ArrowLeftRight size={9} style={{ color: entity.color }} />
                In both request and response
              </p>
              <div className="space-y-1">
                {both.map((occ, i) => (
                  <FlowNode key={i} occ={occ} role="both" color={entity.color}
                    onNavigate={onNavigate ? () => navigate(occ) : undefined} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EntityTracker({ requests, onNavigate }: Props) {
  const [query, setQuery]     = useState('');
  const [authOnly, setAuthOnly] = useState(false);

  const entities = useMemo(() => detectEntities(requests), [requests]);

  const filtered = useMemo(() => entities.filter(e => {
    if (authOnly && !e.isAuthLike) return false;
    if (query && !e.value.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [entities, query, authOnly]);

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-devlens-muted text-sm gap-3">
        <Waypoints size={28} strokeWidth={1.5} />
        <p>No requests captured yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-devlens-border bg-devlens-surface shrink-0 space-y-2">
        <div className="flex items-center gap-2 bg-devlens-bg border border-devlens-border rounded px-3 py-1.5 focus-within:border-devlens-accent transition-colors">
          <Search size={13} className="text-devlens-muted shrink-0" />
          <input
            type="text"
            placeholder="Filter entity values…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-devlens-text placeholder-devlens-muted outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-devlens-muted hover:text-devlens-text">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAuthOnly(a => !a)}
            className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] transition-colors ${
              authOnly
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                : 'border-devlens-border text-devlens-muted hover:text-devlens-text'
            }`}
          >
            <Shield size={11} />
            Auth / session only
          </button>
          <span className="text-[11px] text-devlens-muted">
            {entities.length === 0
              ? 'No repeated values found'
              : filtered.length === 0
              ? 'No matches'
              : `${filtered.length} entit${filtered.length !== 1 ? 'ies' : 'y'} · ${requests.length} requests`}
          </span>
        </div>
      </div>

      {/* Legend */}
      {entities.length > 0 && (
        <div className="px-4 py-1.5 border-b border-devlens-border flex items-center gap-4 text-[10px] text-devlens-muted bg-devlens-bg shrink-0">
          <span className="flex items-center gap-1"><ArrowRight size={9} className="text-green-400" /> produces (in response)</span>
          <span className="flex items-center gap-1"><ArrowLeft size={9} className="text-blue-400" /> consumes (in request)</span>
          <span className="flex items-center gap-1"><Waypoints size={9} className="text-devlens-accent" /> flow detected</span>
          <span className="flex items-center gap-1"><Shield size={9} className="text-amber-400" /> auth-like</span>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-auto">
        {entities.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-devlens-muted text-sm gap-3 px-4">
            <Waypoints size={28} strokeWidth={1.5} />
            <div className="text-center space-y-1">
              <p>No repeated values found</p>
              <p className="text-[11px]">Capture more requests — entities that appear in 2+ responses or flow between APIs will appear here</p>
            </div>
          </div>
        )}
        {filtered.map((entity, i) => (
          <EntityRow
            key={i}
            entity={entity}
            requests={requests}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  );
}
