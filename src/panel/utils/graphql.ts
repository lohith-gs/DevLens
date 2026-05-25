// ─── Types ────────────────────────────────────────────────────────────────────

export type GqlOperationType = 'query' | 'mutation' | 'subscription' | 'unknown';

export interface GraphQLInfo {
  query: string;
  operationName?: string;
  variables?: unknown;
  operationType: GqlOperationType;
}

// ─── Extraction ───────────────────────────────────────────────────────────────

export function extractGraphQL(requestBody: string): GraphQLInfo | null {
  if (!requestBody) return null;
  try {
    const parsed = JSON.parse(requestBody);
    if (typeof parsed?.query !== 'string') return null;
    const query = parsed.query as string;
    const nameFromBody = typeof parsed.operationName === 'string' ? parsed.operationName : null;
    return {
      query,
      operationName: nameFromBody || parseOperationName(query) || undefined,
      variables: parsed.variables ?? undefined,
      operationType: getOperationType(query),
    };
  } catch {
    return null;
  }
}

function parseOperationName(query: string): string | null {
  return query.match(/(?:query|mutation|subscription)\s+(\w+)/i)?.[1] ?? null;
}

export function getOperationType(query: string): GqlOperationType {
  const t = query.trim();
  if (/^mutation\b/i.test(t))     return 'mutation';
  if (/^subscription\b/i.test(t)) return 'subscription';
  if (/^(query\b|\{)/i.test(t))   return 'query';
  return 'unknown';
}

// ─── Formatter ────────────────────────────────────────────────────────────────

/**
 * Pretty-prints a GraphQL query string.
 * Handles both already-formatted and minified (single-line) queries.
 */
export function formatGraphQLQuery(raw: string): string {
  let braceDepth = 0;
  let parenDepth = 0;
  let inString   = false;
  let result     = '';

  // Normalise internal whitespace but preserve any existing newlines
  const src = raw.replace(/[ \t]+/g, ' ').replace(/\n[ \t]*/g, '\n').trim();

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    // ── String literal — pass through verbatim ──
    if (inString) {
      result += ch;
      if (ch === '"' && src[i - 1] !== '\\') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; result += ch; continue; }

    // ── Comment — copy to end of line ──
    if (ch === '#') {
      let j = i;
      while (j < src.length && src[j] !== '\n') j++;
      result += src.slice(i, j);
      i = j - 1;
      continue;
    }

    // ── Parens (argument lists) — track depth, no special indentation ──
    if (ch === '(') { parenDepth++; result += ch; continue; }
    if (ch === ')') { parenDepth--; result += ch; continue; }

    // ── Opening brace ──
    if (ch === '{') {
      result = result.trimEnd() + ' {\n' + '  '.repeat(braceDepth + 1);
      braceDepth++;
      while (i + 1 < src.length && src[i + 1] === ' ') i++;
      continue;
    }

    // ── Closing brace ──
    if (ch === '}') {
      braceDepth--;
      result = result.trimEnd() + '\n' + '  '.repeat(braceDepth) + '}';
      continue;
    }

    // ── Existing newline — re-indent ──
    if (ch === '\n') {
      result = result.trimEnd() + '\n' + '  '.repeat(braceDepth);
      while (i + 1 < src.length && (src[i + 1] === ' ' || src[i + 1] === '\n')) i++;
      continue;
    }

    // ── Comma — field separator inside selection sets ──
    if (ch === ',') {
      if (parenDepth === 0 && braceDepth > 0) {
        result = result.trimEnd() + '\n' + '  '.repeat(braceDepth);
        while (i + 1 < src.length && src[i + 1] === ' ') i++;
      } else {
        result += ', ';
      }
      continue;
    }

    // ── Space inside a selection set (not inside parens) ──
    // If the next non-space char starts a field name or fragment spread,
    // treat this as a field separator → newline.
    if (ch === ' ' && parenDepth === 0 && braceDepth > 0) {
      const rest = src.slice(i + 1);
      if (/^[a-zA-Z_$.]/.test(rest) || rest.startsWith('...')) {
        result = result.trimEnd() + '\n' + '  '.repeat(braceDepth);
        while (i + 1 < src.length && src[i + 1] === ' ') i++;
        continue;
      }
    }

    result += ch;
  }

  return result.trim().replace(/\n{3,}/g, '\n\n');
}
