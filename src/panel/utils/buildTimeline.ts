import { NetworkRequest } from '../hooks/useNetworkRequests';

export interface TimelineEntry {
  request: NetworkRequest;
  offsetMs: number;
  durationMs: number;
  domain: string;
  cascadeFrom: string[]; // IDs of requests this one cascades from
}

export interface TimelineGroup {
  label: string;
  entries: TimelineEntry[];
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.split('/')[0] || 'unknown';
  }
}

export function buildTimeline(requests: NetworkRequest[]): {
  groups: TimelineGroup[];
  totalMs: number;
  startTime: number;
} {
  if (requests.length === 0) return { groups: [], totalMs: 0, startTime: 0 };

  const sorted = [...requests].sort((a, b) => a.startedDateTime - b.startedDateTime);
  const startTime = sorted[0].startedDateTime;
  const totalMs = Math.max(
    ...sorted.map(r => (r.startedDateTime - startTime) + r.duration)
  );

  const entries: TimelineEntry[] = sorted.map(r => ({
    request: r,
    offsetMs: r.startedDateTime - startTime,
    durationMs: r.duration,
    domain: extractDomain(r.url),
    cascadeFrom: [],
  }));

  // Detect cascade relationships: B starts within 200ms of A completing
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      const aEnd = a.offsetMs + a.durationMs;
      const gap = b.offsetMs - aEnd;
      if (gap >= 0 && gap <= 200) {
        b.cascadeFrom.push(a.request.id);
      }
    }
  }

  // Group by domain
  const groupMap = new Map<string, TimelineEntry[]>();
  for (const entry of entries) {
    if (!groupMap.has(entry.domain)) groupMap.set(entry.domain, []);
    groupMap.get(entry.domain)!.push(entry);
  }

  const groups: TimelineGroup[] = [];
  for (const [label, ents] of groupMap) {
    groups.push({ label, entries: ents });
  }

  return { groups, totalMs, startTime };
}
