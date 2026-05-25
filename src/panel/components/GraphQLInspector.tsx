import React, { useState } from 'react';
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { GraphQLInfo, GqlOperationType, formatGraphQLQuery } from '../utils/graphql';
import { JsonViewer } from './JsonViewer';

// ─── Operation type badge ─────────────────────────────────────────────────────

const OP_COLORS: Record<GqlOperationType, { bg: string; border: string; text: string }> = {
  query:        { bg: '#0ea5e920', border: '#0ea5e940', text: '#38bdf8' },
  mutation:     { bg: '#a855f720', border: '#a855f740', text: '#c084fc' },
  subscription: { bg: '#22c55e20', border: '#22c55e40', text: '#4ade80' },
  unknown:      { bg: '#64748b20', border: '#64748b40', text: '#94a3b8' },
};

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyBtn({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
        done ? 'text-green-400' : 'text-devlens-muted hover:text-devlens-text'
      }`}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check size={10} /> : <Copy size={10} />}
      {done ? 'Copied' : label}
    </button>
  );
}

// ─── GraphQL syntax highlighter ───────────────────────────────────────────────

function GqlHighlighter({ code }: { code: string }) {
  // Tokens matched in priority order:
  // 1. Comments  2. Strings  3. Variables ($foo)  4. Fragment spreads (...)
  // 5. Directives (@foo)  6. Keywords  7. Everything else via colorizeText()
  const TOKEN_RE = /(#[^\n]*)|("""[\s\S]*?"""|"(?:[^"\\]|\\.)*")|(\$\w+)|(\.\.\.\s*(?:on\s+\w+|\w+)?)|(@\w+)|(\b(?:query|mutation|subscription|fragment|on)\b)/g;

  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = TOKEN_RE.exec(code)) !== null) {
    if (m.index > last) {
      parts.push(<React.Fragment key={`d-${last}`}>{colorizeText(code.slice(last, m.index))}</React.Fragment>);
    }
    const [full, comment, str, variable, spread, directive, keyword] = m;
    const k = m.index;

    if (comment) {
      parts.push(<span key={k} className="text-devlens-muted italic">{comment}</span>);
    } else if (str) {
      parts.push(<span key={k} className="json-str">{str}</span>);
    } else if (variable) {
      parts.push(<span key={k} className="text-blue-300">{variable}</span>);
    } else if (spread) {
      // ...on TypeName or ...fragmentName
      const onMatch = spread.match(/^(\.\.\.)\s*(on\s+)(\w+)$/);
      if (onMatch) {
        parts.push(
          <span key={k}>
            <span className="text-devlens-muted">{onMatch[1]}</span>
            <span className="text-purple-400">{onMatch[2]}</span>
            <span className="text-amber-300">{onMatch[3]}</span>
          </span>
        );
      } else {
        const fragMatch = spread.match(/^(\.\.\.)\s*(\w+)?$/);
        parts.push(
          <span key={k}>
            <span className="text-devlens-muted">{fragMatch?.[1] ?? '...'}</span>
            {fragMatch?.[2] && <span className="text-amber-300/80">{fragMatch[2]}</span>}
          </span>
        );
      }
    } else if (directive) {
      parts.push(<span key={k} className="text-teal-400">{directive}</span>);
    } else if (keyword) {
      parts.push(<span key={k} className="text-purple-400 font-medium">{keyword}</span>);
    } else {
      parts.push(<span key={k}>{full}</span>);
    }

    last = m.index + full.length;
  }

  if (last < code.length) {
    parts.push(<React.Fragment key="tail">{colorizeText(code.slice(last))}</React.Fragment>);
  }

  return <>{parts}</>;
}

/** Colour text that isn't a special GQL token: type annotations, numbers, booleans, punctuation. */
function colorizeText(text: string): React.ReactNode {
  const INNER_RE = /(:\s*)([A-Z]\w*[![\]?]*)|(\b(?:true|false|null)\b)|(\b\d+(?:\.\d+)?\b)|([{}()[\]:!|])/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = INNER_RE.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={`c-${last}`} className="text-devlens-text">{text.slice(last, m.index)}</span>);
    }
    const [full, colon, typeName, boolNull, num, punct] = m;
    const k = `c-${m.index}`;

    if (colon && typeName) {
      parts.push(
        <span key={k}>
          <span className="text-devlens-muted">{colon}</span>
          <span className="text-green-300">{typeName}</span>
        </span>
      );
    } else if (boolNull) {
      parts.push(<span key={k} className="json-bool">{boolNull}</span>);
    } else if (num) {
      parts.push(<span key={k} className="json-num">{num}</span>);
    } else if (punct) {
      parts.push(<span key={k} className="text-devlens-muted">{punct}</span>);
    } else {
      parts.push(<span key={k}>{full}</span>);
    }

    last = m.index + full.length;
  }

  if (last < text.length) {
    parts.push(<span key="c-tail" className="text-devlens-text">{text.slice(last)}</span>);
  }

  return parts.length > 0 ? <>{parts}</> : <span className="text-devlens-text">{text}</span>;
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({
  title, defaultOpen = true, action, children,
}: {
  title: string;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel-section">
      <div className="section-header flex items-center justify-between cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <span className="flex items-center gap-1">
          {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          {title}
        </span>
        {action && <span onClick={e => e.stopPropagation()}>{action}</span>}
      </div>
      {open && children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  info: GraphQLInfo;
}

export function GraphQLInspector({ info }: Props) {
  const formatted = formatGraphQLQuery(info.query);
  const opColors  = OP_COLORS[info.operationType];
  const hasVars   = info.variables !== null && info.variables !== undefined
    && typeof info.variables === 'object'
    && Object.keys(info.variables as object).length > 0;

  return (
    <div className="p-3 space-y-2">
      {/* ── Operation header ── */}
      <div className="panel-section">
        <div className="section-header">Operation</div>
        <div className="px-3 py-2 flex items-center gap-2 flex-wrap">
          {/* Type badge */}
          <span
            className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded border"
            style={{ background: opColors.bg, borderColor: opColors.border, color: opColors.text }}
          >
            {info.operationType}
          </span>

          {/* Operation name */}
          {info.operationName ? (
            <span className="font-mono text-sm text-amber-300 font-medium">{info.operationName}</span>
          ) : (
            <span className="font-mono text-xs text-devlens-muted italic">anonymous</span>
          )}
        </div>
      </div>

      {/* ── Query ── */}
      <Section
        title="Query"
        action={<CopyBtn value={info.query} />}
      >
        <pre className="font-mono text-xs whitespace-pre overflow-auto px-3 py-2 leading-relaxed">
          <GqlHighlighter code={formatted} />
        </pre>
      </Section>

      {/* ── Variables ── */}
      {hasVars && (
        <Section
          title="Variables"
          action={<CopyBtn value={JSON.stringify(info.variables, null, 2)} />}
        >
          <div className="p-2">
            <JsonViewer data={info.variables} />
          </div>
        </Section>
      )}

      {/* Empty variables note */}
      {!hasVars && (
        <div className="panel-section">
          <div className="section-header">Variables</div>
          <p className="text-devlens-muted text-xs px-3 py-2">No variables</p>
        </div>
      )}
    </div>
  );
}
