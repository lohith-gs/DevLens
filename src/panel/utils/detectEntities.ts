import { NetworkRequest } from '../hooks/useNetworkRequests';

// ─── Constants ────────────────────────────────────────────────────────────────

export const ENTITY_PALETTE = [
  '#f472b6', '#34d399', '#60a5fa', '#fbbf24', '#a78bfa',
  '#fb923c', '#2dd4bf', '#e879f9', '#86efac', '#93c5fd',
];

const AUTH_KEY_RE = /(token|auth|session|jwt|bearer|secret|password|api_?key|user_?id|account_?id|access_?key|refresh_?token)/i;

const MIN_VALUE_LEN = 4;
const MAX_VALUE_LEN = 200;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isTrivialValue(str: string): boolean {
  if (str.length < MIN_VALUE_LEN || str.length > MAX_VALUE_LEN) return true;
  if (str === 'true' || str === 'false' || str === 'null' || str === 'undefined') return true;
  if (/^\d{1,4}$/.test(str)) return true;          // short pure numbers
  if (/^https?:\/\//.test(str) && str.length > 60) return true; // long URLs
  return false;
}

export function isAuthLikePath(path: string): boolean {
  const segments = path.replace(/\[(\d+)\]/g, '').split('.').filter(Boolean);
  return segments.some(s => AUTH_KEY_RE.test(s));
}

/** Flatten an object/array into leaf path → stringified value entries. */
export function flattenLeaves(obj: unknown, prefix = ''): Map<string, string> {
  const map = new Map<string, string>();
  if (obj === null || obj === undefined) return map;

  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      const p = prefix ? `${prefix}[${i}]` : `[${i}]`;
      flattenLeaves(v, p).forEach((val, path) => map.set(path, val));
    });
    return map;
  }

  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const p = prefix ? `${prefix}.${k}` : k;
      flattenLeaves(v, p).forEach((val, path) => map.set(path, val));
    }
    return map;
  }

  const str = String(obj);
  if (!isTrivialValue(str)) map.set(prefix, str);
  return map;
}

function tryParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return null; }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EntityOccurrence {
  requestId: string;
  url: string;
  method: string;
  status: number;
  /** Paths in response body where the value was found (this request "produces" it). */
  resPaths: string[];
  /** Paths in request body where the value was found (this request "consumes" it). */
  reqPaths: string[];
}

export interface DetectedEntity {
  value: string;
  color: string;
  isAuthLike: boolean;
  /** Each entry = one distinct request that contains this value. Always >= 2. */
  occurrences: EntityOccurrence[];
}

// ─── Main function ────────────────────────────────────────────────────────────

export function detectEntities(requests: NetworkRequest[]): DetectedEntity[] {
  // value → requestId → occurrence data
  type OccInfo = { resPaths: string[]; reqPaths: string[]; url: string; method: string; status: number };
  const valueMap = new Map<string, Map<string, OccInfo>>();

  function addPaths(value: string, req: NetworkRequest, pathsKey: 'resPaths' | 'reqPaths', paths: string[]) {
    if (!valueMap.has(value)) valueMap.set(value, new Map());
    const reqMap = valueMap.get(value)!;
    if (!reqMap.has(req.id)) {
      reqMap.set(req.id, { resPaths: [], reqPaths: [], url: req.url, method: req.method, status: req.status });
    }
    reqMap.get(req.id)![pathsKey].push(...paths);
  }

  for (const req of requests) {
    const resData = tryParse(req.responseBody);
    const reqData = tryParse(req.requestBody);

    if (resData !== null) {
      // Group paths by value to batch-add
      const byValue = new Map<string, string[]>();
      for (const [path, val] of flattenLeaves(resData)) {
        if (!byValue.has(val)) byValue.set(val, []);
        byValue.get(val)!.push(path);
      }
      for (const [val, paths] of byValue) addPaths(val, req, 'resPaths', paths);
    }

    if (reqData !== null) {
      const byValue = new Map<string, string[]>();
      for (const [path, val] of flattenLeaves(reqData)) {
        if (!byValue.has(val)) byValue.set(val, []);
        byValue.get(val)!.push(path);
      }
      for (const [val, paths] of byValue) addPaths(val, req, 'reqPaths', paths);
    }
  }

  const entities: DetectedEntity[] = [];
  let colorIdx = 0;

  for (const [val, reqMap] of valueMap) {
    // Must appear in 2+ distinct requests
    if (reqMap.size < 2) continue;

    let isAuthLike = false;
    const occurrences: EntityOccurrence[] = [];

    for (const [reqId, info] of reqMap) {
      const allPaths = [...info.resPaths, ...info.reqPaths];
      if (allPaths.some(isAuthLikePath)) isAuthLike = true;
      occurrences.push({ requestId: reqId, ...info });
    }

    entities.push({
      value: val,
      color: ENTITY_PALETTE[colorIdx % ENTITY_PALETTE.length],
      isAuthLike,
      occurrences,
    });
    colorIdx++;
  }

  // Sort: most cross-request appearances first, then longer values (more meaningful)
  return entities.sort((a, b) =>
    b.occurrences.length - a.occurrences.length ||
    b.value.length - a.value.length
  );
}
