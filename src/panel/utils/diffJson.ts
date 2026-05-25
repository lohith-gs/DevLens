export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffNode {
  key: string;
  leftValue: unknown;
  rightValue: unknown;
  status: DiffStatus;
  children?: DiffNode[];
  isArray?: boolean;
}

export function diffJson(left: unknown, right: unknown, key = 'root'): DiffNode {
  if (left === undefined && right !== undefined) {
    return { key, leftValue: undefined, rightValue: right, status: 'added', children: flattenAsAdded(right, key) };
  }
  if (left !== undefined && right === undefined) {
    return { key, leftValue: left, rightValue: undefined, status: 'removed', children: flattenAsRemoved(left, key) };
  }

  const leftIsObj = isObject(left);
  const rightIsObj = isObject(right);
  const leftIsArr = Array.isArray(left);
  const rightIsArr = Array.isArray(right);

  if ((leftIsArr || rightIsArr) && (leftIsArr || !leftIsObj) && (rightIsArr || !rightIsObj)) {
    const la = leftIsArr ? (left as unknown[]) : [];
    const ra = rightIsArr ? (right as unknown[]) : [];
    const len = Math.max(la.length, ra.length);
    const children: DiffNode[] = [];
    for (let i = 0; i < len; i++) {
      children.push(diffJson(la[i], ra[i], String(i)));
    }
    const status = children.every(c => c.status === 'unchanged') ? 'unchanged' : 'changed';
    return { key, leftValue: left, rightValue: right, status, children, isArray: true };
  }

  if (leftIsObj && rightIsObj) {
    const leftObj = left as Record<string, unknown>;
    const rightObj = right as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(leftObj), ...Object.keys(rightObj)]);
    const children: DiffNode[] = [];
    for (const k of allKeys) {
      children.push(diffJson(leftObj[k], rightObj[k], k));
    }
    const status = children.every(c => c.status === 'unchanged') ? 'unchanged' : 'changed';
    return { key, leftValue: left, rightValue: right, status, children };
  }

  if (left === right) {
    return { key, leftValue: left, rightValue: right, status: 'unchanged' };
  }

  return { key, leftValue: left, rightValue: right, status: 'changed' };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function flattenAsAdded(value: unknown, key: string): DiffNode[] | undefined {
  if (!isObject(value) && !Array.isArray(value)) return undefined;
  if (Array.isArray(value)) {
    return value.map((v, i) => ({ key: String(i), leftValue: undefined, rightValue: v, status: 'added' as DiffStatus, children: flattenAsAdded(v, String(i)) }));
  }
  const obj = value as Record<string, unknown>;
  return Object.keys(obj).map(k => ({ key: k, leftValue: undefined, rightValue: obj[k], status: 'added' as DiffStatus, children: flattenAsAdded(obj[k], k) }));
}

function flattenAsRemoved(value: unknown, key: string): DiffNode[] | undefined {
  if (!isObject(value) && !Array.isArray(value)) return undefined;
  if (Array.isArray(value)) {
    return value.map((v, i) => ({ key: String(i), leftValue: v, rightValue: undefined, status: 'removed' as DiffStatus, children: flattenAsRemoved(v, String(i)) }));
  }
  const obj = value as Record<string, unknown>;
  return Object.keys(obj).map(k => ({ key: k, leftValue: obj[k], rightValue: undefined, status: 'removed' as DiffStatus, children: flattenAsRemoved(obj[k], k) }));
}
