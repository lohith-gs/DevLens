import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, ArrowLeftRight, Braces, GanttChart, TextSearch, Waypoints } from 'lucide-react';
import './styles.css';

import { useNetworkRequests, NetworkRequest } from './hooks/useNetworkRequests';
import { usePinnedRequests } from './hooks/usePinnedRequests';

import { RequestList } from './components/RequestList';
import { Inspector } from './components/Inspector';
import { SideBySideView } from './components/SideBySideView';
import { SchemaExtractor } from './components/SchemaExtractor';
import { TimelineView } from './components/TimelineView';
import { GlobalSearch } from './components/GlobalSearch';
import { EntityTracker } from './components/EntityTracker';

type MainTab = 'inspector' | 'compare' | 'schema' | 'timeline' | 'search' | 'entities';

const TAB_CONFIG: { id: MainTab; label: string; Icon: React.ElementType }[] = [
  { id: 'inspector', label: 'Inspector', Icon: Search },
  { id: 'compare',   label: 'Compare',   Icon: ArrowLeftRight },
  { id: 'schema',    label: 'Schema',    Icon: Braces },
  { id: 'timeline',  label: 'Timeline',  Icon: GanttChart },
  { id: 'search',    label: 'Search',    Icon: TextSearch },
  { id: 'entities',  label: 'Entities',  Icon: Waypoints },
];

function App() {
  const { requests, clear } = useNetworkRequests();
  const { pinned, pin, unpin, clearPinned, isPinned } = usePinnedRequests();
  const [selectedRequest, setSelectedRequest] = useState<NetworkRequest | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>('inspector');

  const handlePin = (req: NetworkRequest) => {
    pin(req);
    setActiveTab('compare');
  };

  const handleSelect = (req: NetworkRequest) => {
    setSelectedRequest(req);
    if (activeTab === 'compare') setActiveTab('inspector');
  };

  // Navigate from GlobalSearch / EntityTracker → Inspector
  const handleGlobalNavigate = (req: NetworkRequest) => {
    setSelectedRequest(req);
    setActiveTab('inspector');
  };

  const pinnedCount = (pinned[0] ? 1 : 0) + (pinned[1] ? 1 : 0);

  return (
    <div className="flex h-screen overflow-hidden bg-devlens-bg text-devlens-text text-xs">
      {/* Sidebar */}
      <div className="w-72 shrink-0 flex flex-col overflow-hidden border-r border-devlens-border">
        <RequestList
          requests={requests}
          selectedId={selectedRequest?.id ?? null}
          onSelect={handleSelect}
          onPin={handlePin}
          isPinned={isPinned}
          onClear={() => { clear(); setSelectedRequest(null); clearPinned(); }}
        />
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center border-b border-devlens-border bg-devlens-bg shrink-0 px-2">
          {TAB_CONFIG.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`tab-btn flex items-center gap-1.5 ${activeTab === id ? 'active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={13} strokeWidth={1.75} />
              {label}
              {id === 'compare' && pinnedCount > 0 && (
                <span
                  className="ml-0.5 text-[9px] text-white rounded-full w-3.5 h-3.5 flex items-center justify-center"
                  style={{ background: 'var(--color-devlens-accent)' }}
                >
                  {pinnedCount}
                </span>
              )}
              {id === 'search' && requests.length > 0 && (
                <span className="ml-0.5 text-[9px] text-devlens-muted">{requests.length}</span>
              )}
              {id === 'entities' && requests.length > 0 && (
                <span className="ml-0.5 text-[9px] text-devlens-muted">{requests.length}</span>
              )}
            </button>
          ))}

          {/* Pinned slot pills */}
          {(pinned[0] || pinned[1]) && (
            <div className="ml-auto flex items-center gap-1.5 pr-2">
              {pinned[0] && (
                <span
                  className="text-[10px] rounded px-1.5 py-0.5 font-mono truncate max-w-[120px]"
                  style={{
                    background: 'color-mix(in srgb, var(--color-devlens-accent) 15%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--color-devlens-accent) 35%, transparent)',
                    color: 'var(--color-devlens-accent)',
                  }}
                  title={pinned[0].url}
                >
                  A: {(() => { try { return new URL(pinned[0].url).pathname.split('/').pop() || '/'; } catch { return '/'; } })()}
                </span>
              )}
              {pinned[1] && (
                <span
                  className="text-[10px] rounded px-1.5 py-0.5 font-mono truncate max-w-[120px] bg-purple-500/20 border border-purple-500/40 text-purple-400"
                  title={pinned[1].url}
                >
                  B: {(() => { try { return new URL(pinned[1].url).pathname.split('/').pop() || '/'; } catch { return '/'; } })()}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'inspector' && <Inspector request={selectedRequest} />}
          {activeTab === 'compare'   && <SideBySideView pinned={pinned} onUnpin={unpin} />}
          {activeTab === 'schema'    && <SchemaExtractor request={selectedRequest} />}
          {activeTab === 'timeline'  && <TimelineView requests={requests} />}
          {activeTab === 'search'    && (
            <GlobalSearch requests={requests} onNavigate={handleGlobalNavigate} />
          )}
          {activeTab === 'entities'  && (
            <EntityTracker requests={requests} onNavigate={handleGlobalNavigate} />
          )}
        </div>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<App />);
