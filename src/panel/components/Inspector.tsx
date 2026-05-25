import React, { useState, useMemo } from 'react';
import {
  MousePointerClick, Copy, Check,
  ChevronsDownUp, ChevronsUpDown, Search, X,
} from 'lucide-react';
import { NetworkRequest } from '../hooks/useNetworkRequests';
import { JsonViewer, JsonViewerControlSignal, getMatchingPaths } from './JsonViewer';
import { GraphQLInspector } from './GraphQLInspector';
import { extractGraphQL } from '../utils/graphql';

interface Props {
  request: NetworkRequest | null;
}

type InnerTab = 'response' | 'request' | 'headers' | 'params' | 'graphql';

function tryParseJson(s: string): unknown | null {
  try { return JSON.parse(s); } catch { return null; }
}

// ─── Header table ─────────────────────────────────────────────────────────────

function HeaderTable({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers);
  if (entries.length === 0) return <p className="text-devlens-muted text-xs p-3">No headers</p>;
  return (
    <table className="w-full text-xs font-mono">
      <tbody>
        {entries.map(([k, v]) => (
          <tr key={k} className="border-b border-devlens-border/50 hover:bg-white/5 group">
            <td className="py-1.5 px-3 text-blue-300 w-2/5 align-top">{k}</td>
            <td className="py-1.5 px-3 text-devlens-text break-all">
              <span className="flex items-start gap-1">
                <span className="flex-1">{v}</span>
                <CopyInline value={v} />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Query params table ───────────────────────────────────────────────────────

function ParamsTable({ url }: { url: string }) {
  let params: [string, string][] = [];
  let pathname = '';
  let origin = '';

  try {
    const u = new URL(url);
    params = [...u.searchParams.entries()];
    pathname = u.pathname;
    origin = u.origin;
  } catch {
    return <p className="text-devlens-muted text-xs p-3">Could not parse URL</p>;
  }

  return (
    <div className="p-3 space-y-3">
      {/* URL breakdown */}
      <div className="panel-section">
        <div className="section-header">URL Breakdown</div>
        <div className="text-xs font-mono p-3 space-y-1.5">
          <div className="flex gap-2">
            <span className="text-devlens-muted w-20 shrink-0">Origin</span>
            <span className="text-blue-300 break-all">{origin}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-devlens-muted w-20 shrink-0">Path</span>
            <span className="text-green-300 break-all">{pathname}</span>
          </div>
        </div>
      </div>

      {/* Query params */}
      <div className="panel-section">
        <div className="section-header">
          Query Parameters
          <span className="text-[10px] font-normal normal-case">{params.length} param{params.length !== 1 ? 's' : ''}</span>
        </div>
        {params.length === 0 ? (
          <p className="text-devlens-muted text-xs p-3">No query parameters</p>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-[10px] text-devlens-muted uppercase border-b border-devlens-border">
                <th className="px-3 py-1.5 text-left font-semibold">Name</th>
                <th className="px-3 py-1.5 text-left font-semibold">Value</th>
              </tr>
            </thead>
            <tbody>
              {params.map(([k, v], i) => (
                <tr key={i} className="border-b border-devlens-border/50 hover:bg-white/5 group">
                  <td className="py-1.5 px-3 text-amber-300 align-top w-2/5">{k}</td>
                  <td className="py-1.5 px-3 text-devlens-text break-all">
                    <span className="flex items-start gap-1">
                      <span className="flex-1">{decodeURIComponent(v)}</span>
                      <CopyInline value={decodeURIComponent(v)} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Inline copy button (shows on row hover) ──────────────────────────────────

function CopyInline({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      title="Copy"
      className="opacity-0 group-hover:opacity-100 shrink-0 transition-opacity p-0.5 rounded hover:bg-white/10 text-devlens-muted hover:text-devlens-text"
      onClick={async e => {
        e.stopPropagation();
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
    >
      {done ? <Check size={10} className="text-green-400" /> : <Copy size={10} />}
    </button>
  );
}

// ─── Toolbar button ───────────────────────────────────────────────────────────

function ToolbarBtn({
  onClick, title, children,
}: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1 rounded text-devlens-muted hover:text-devlens-text hover:bg-white/8 transition-colors text-[11px]"
    >
      {children}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function Inspector({ request }: Props) {
  const [tab, setTab]               = useState<InnerTab>('response');
  const [searchQuery, setSearchQuery] = useState('');
  const [signalId, setSignalId]     = useState(0);
  const [signalAction, setSignalAction] = useState<'expand-all' | 'collapse-all'>('expand-all');
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Compute derived values unconditionally — all hooks must be called before any early return
  const responseJson = request ? tryParseJson(request.responseBody) : null;
  const requestJson  = request ? tryParseJson(request.requestBody)  : null;
  const gqlInfo      = request ? extractGraphQL(request.requestBody) : null;

  const matchCount = useMemo(() => {
    if (!searchQuery.trim() || responseJson === null) return 0;
    return getMatchingPaths(responseJson, searchQuery).size;
  }, [responseJson, searchQuery]);

  const controlSignal: JsonViewerControlSignal = { action: signalAction, id: signalId };

  const fire = (action: 'expand-all' | 'collapse-all') => {
    setSignalAction(action);
    setSignalId(id => id + 1);
  };

  const copyResponse = async () => {
    if (!request) return;
    const text = responseJson !== null
      ? JSON.stringify(responseJson, null, 2)
      : request.responseBody;
    await navigator.clipboard.writeText(text);
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 1800);
  };

  if (!request) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-devlens-muted text-sm gap-2">
        <MousePointerClick size={28} strokeWidth={1.5} />
        <span>Select a request to inspect</span>
      </div>
    );
  }

  const statusCls =
    request.status >= 500 ? 'badge-5xx' :
    request.status >= 400 ? 'badge-4xx' :
    request.status >= 300 ? 'badge-3xx' : 'badge-2xx';

  const tabs: { id: InnerTab; label: string }[] = [
    { id: 'response', label: 'Response' },
    { id: 'request',  label: 'Request' },
    { id: 'headers',  label: 'Headers' },
    { id: 'params',   label: 'Params' },
    ...(gqlInfo ? [{ id: 'graphql' as InnerTab, label: 'GraphQL' }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Request summary bar */}
      <div className="px-4 py-2 border-b border-devlens-border bg-devlens-surface shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-devlens-accent font-bold text-xs uppercase">{request.method}</span>
          <span className={`badge ${statusCls}`}>{request.status}</span>
          <span className="text-devlens-muted text-xs">{request.duration}ms</span>
          <span className="text-devlens-muted text-xs">{(request.size / 1024).toFixed(1)} KB</span>
        </div>
        <p className="text-devlens-text font-mono text-xs truncate" title={request.url}>{request.url}</p>
      </div>

      {/* Inner tabs */}
      <div className="flex border-b border-devlens-border shrink-0 px-2 bg-devlens-bg">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            className={`tab-btn ${tab === id ? 'active' : ''}`}
            onClick={() => { setTab(id); setSearchQuery(''); }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* JSON toolbar — only for response/request JSON tabs */}
      {(tab === 'response' && responseJson !== null) || (tab === 'request' && requestJson !== null) ? (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-devlens-border bg-devlens-bg shrink-0 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-1 flex-1 min-w-0 max-w-xs bg-devlens-surface border border-devlens-border rounded px-2 py-0.5">
            <Search size={11} className="text-devlens-muted shrink-0" />
            <input
              type="text"
              placeholder="Search keys and values…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-[11px] text-devlens-text placeholder-devlens-muted outline-none min-w-0"
            />
            {searchQuery && (
              <>
                {matchCount > 0 && (
                  <span className="text-[10px] text-devlens-accent shrink-0">{matchCount}</span>
                )}
                {matchCount === 0 && (
                  <span className="text-[10px] text-red-400 shrink-0">0</span>
                )}
                <button onClick={() => setSearchQuery('')} className="text-devlens-muted hover:text-devlens-text shrink-0">
                  <X size={10} />
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-0.5 border-l border-devlens-border pl-1 ml-1">
            <ToolbarBtn onClick={() => fire('expand-all')} title="Expand all">
              <ChevronsUpDown size={12} />
              <span>Expand</span>
            </ToolbarBtn>
            <ToolbarBtn onClick={() => fire('collapse-all')} title="Collapse all">
              <ChevronsDownUp size={12} />
              <span>Collapse</span>
            </ToolbarBtn>
          </div>

          {tab === 'response' && (
            <div className="border-l border-devlens-border pl-1 ml-1">
              <ToolbarBtn onClick={copyResponse} title="Copy entire response">
                {copiedResponse
                  ? <><Check size={12} className="text-green-400" /><span className="text-green-400">Copied</span></>
                  : <><Copy size={12} /><span>Copy response</span></>}
              </ToolbarBtn>
            </div>
          )}
        </div>
      ) : null}

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {tab === 'response' && (
          responseJson !== null
            ? <JsonViewer
                data={responseJson}
                searchQuery={searchQuery || undefined}
                controlSignal={controlSignal}
              />
            : <pre className="text-devlens-text font-mono text-xs whitespace-pre-wrap break-all p-2">
                {request.responseBody || '(empty)'}
              </pre>
        )}

        {tab === 'request' && (
          request.requestBody
            ? requestJson !== null
              ? <JsonViewer
                  data={requestJson}
                  searchQuery={searchQuery || undefined}
                  controlSignal={controlSignal}
                />
              : <pre className="text-devlens-text font-mono text-xs whitespace-pre-wrap break-all p-2">
                  {request.requestBody}
                </pre>
            : <p className="text-devlens-muted text-xs p-3">No request body</p>
        )}

        {tab === 'headers' && (
          <div className="space-y-3 p-1">
            <div className="panel-section">
              <div className="section-header">Response Headers</div>
              <HeaderTable headers={request.responseHeaders} />
            </div>
            <div className="panel-section">
              <div className="section-header">Request Headers</div>
              <HeaderTable headers={request.requestHeaders} />
            </div>
          </div>
        )}

        {tab === 'params' && <ParamsTable url={request.url} />}

        {tab === 'graphql' && gqlInfo && (
          <GraphQLInspector info={gqlInfo} />
        )}
      </div>
    </div>
  );
}
