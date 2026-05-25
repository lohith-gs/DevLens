export interface CorrelationMatch {
  value: string;
  color: string;
  leftPaths: string[];
  rightPaths: string[];
}

const PALETTE = [
  '#f472b6', '#34d399', '#60a5fa', '#fbbf24', '#a78bfa',
  '#fb923c', '#2dd4bf', '#e879f9', '#86efac', '#93c5fd',
];

function flattenPaths(obj: unknown, prefix = ''): Map<string, string> {
  const map = new Map<string, string>();
  if (obj === null || obj === undefined) return map;

  if (Array.isArray(obj)) {
    obj.forEach((v, i) => {
      const p = prefix ? `${prefix}[${i}]` : `[${i}]`;
      flattenPaths(v, p).forEach((val, path) => map.set(path, val));
    });
    return map;
  }

  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const p = prefix ? `${prefix}.${k}` : k;
      flattenPaths(v, p).forEach((val, path) => map.set(path, val));
    }
    return map;
  }

  // Leaf value — only include primitives that are non-trivial
  const str = String(obj);
  if (str.length >= 2 && str !== 'true' && str !== 'false' && str !== '0' && str !== '1') {
    map.set(prefix, str);
  }
  return map;
}

export function correlateFields(left: unknown, right: unknown): CorrelationMatch[] {
  const leftFlat = flattenPaths(left);
  const rightFlat = flattenPaths(right);

  // Build reverse maps: value → paths
  const leftByValue = new Map<string, string[]>();
  for (const [path, val] of leftFlat) {
    if (!leftByValue.has(val)) leftByValue.set(val, []);
    leftByValue.get(val)!.push(path);
  }

  const rightByValue = new Map<string, string[]>();
  for (const [path, val] of rightFlat) {
    if (!rightByValue.has(val)) rightByValue.set(val, []);
    rightByValue.get(val)!.push(path);
  }

  const matches: CorrelationMatch[] = [];
  let colorIdx = 0;

  for (const [val, leftPaths] of leftByValue) {
    const rightPaths = rightByValue.get(val);
    if (rightPaths && rightPaths.length > 0) {
      matches.push({
        value: val,
        color: PALETTE[colorIdx % PALETTE.length],
        leftPaths,
        rightPaths,
      });
      colorIdx++;
    }
  }

  return matches;
}

export function buildPathColorMap(matches: CorrelationMatch[], side: 'left' | 'right'): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of matches) {
    const paths = side === 'left' ? m.leftPaths : m.rightPaths;
    for (const p of paths) {
      map.set(p, m.color);
    }
  }
  return map;
}
