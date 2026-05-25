import { useState, useEffect, useRef } from 'react';

export interface NetworkRequest {
  id: string;
  method: string;
  url: string;
  status: number;
  statusText: string;
  duration: number;
  startedDateTime: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: string;
  responseBody: string;
  mimeType: string;
  size: number;
  /** Chrome-specific initiator info (not always present). */
  initiator?: {
    type: 'parser' | 'script' | 'other';
    /** The source file or page URL that triggered this request. */
    sourceUrl?: string;
    lineNumber?: number;
  };
}

interface HarHeader { name: string; value: string; }

interface HarInitiator {
  type: 'parser' | 'script' | 'other';
  url?: string;
  lineNumber?: number;
  stack?: { callFrames: Array<{ url: string; lineNumber: number; functionName: string }> };
}

interface HarEntry {
  request: {
    method: string;
    url: string;
    headers: HarHeader[];
    postData?: { text?: string };
  };
  response: {
    status: number;
    statusText: string;
    headers: HarHeader[];
    content: { mimeType: string; size: number };
  };
  startedDateTime: string;
  time: number;
  /** Chrome-specific extension to HAR spec. */
  _initiator?: HarInitiator;
}

function headersToMap(headers: HarHeader[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers) {
    map[h.name.toLowerCase()] = h.value;
  }
  return map;
}

let idCounter = 0;

export function useNetworkRequests() {
  const [requests, setRequests] = useState<NetworkRequest[]>([]);
  const requestsRef = useRef<NetworkRequest[]>([]);

  useEffect(() => {
    const listener = (entry: chrome.devtools.network.Request) => {
      entry.getContent((body: string) => {
        const har = entry as unknown as HarEntry;

        // Extract Chrome-specific initiator info if present
        const rawInitiator = har._initiator;
        let initiator: NetworkRequest['initiator'];
        if (rawInitiator) {
          const sourceUrl = rawInitiator.type === 'script'
            ? rawInitiator.stack?.callFrames?.[0]?.url
            : rawInitiator.url;
          initiator = {
            type: rawInitiator.type,
            sourceUrl: sourceUrl || undefined,
            lineNumber: rawInitiator.type === 'script'
              ? rawInitiator.stack?.callFrames?.[0]?.lineNumber
              : rawInitiator.lineNumber,
          };
        }

        const req: NetworkRequest = {
          id: `req-${++idCounter}-${Date.now()}`,
          method: har.request.method,
          url: har.request.url,
          status: har.response.status,
          statusText: har.response.statusText,
          duration: Math.round(har.time),
          startedDateTime: new Date(har.startedDateTime).getTime(),
          requestHeaders: headersToMap(har.request.headers),
          responseHeaders: headersToMap(har.response.headers),
          requestBody: har.request.postData?.text || '',
          responseBody: body || '',
          mimeType: har.response.content.mimeType,
          size: har.response.content.size,
          initiator,
        };

        requestsRef.current = [...requestsRef.current, req];
        setRequests([...requestsRef.current]);
      });
    };

    chrome.devtools.network.onRequestFinished.addListener(listener);
    return () => chrome.devtools.network.onRequestFinished.removeListener(listener);
  }, []);

  const clear = () => {
    requestsRef.current = [];
    setRequests([]);
  };

  return { requests, clear };
}
