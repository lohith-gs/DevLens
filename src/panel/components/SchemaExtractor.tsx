import React, { useState, useMemo } from 'react';
import { Copy, Check, Braces, TreePine, RotateCcw, Pencil } from 'lucide-react';
import { NetworkRequest } from '../hooks/useNetworkRequests';
import { generateSchema, SchemaOutputMode, toPascalCase } from '../utils/generateSchema';
import { JsonViewer } from './JsonViewer';

interface Props {
  request: NetworkRequest | null;
}

function tryParse(s: string): unknown | null {
  try { return JSON.parse(s); } catch { return null; }
}

function getDefaultRootName(url: string): string {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || 'Response';
    return last.charAt(0).toUpperCase() + last.slice(1).replace(/[^a-zA-Z0-9]/g, '');
  } catch {
    return 'Response';
  }
}

function getAtPath(data: unknown, path: string): unknown {
  if (!path) return data;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur: unknown = data;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

// ─── Mode toggle ──────────────────────────────────────────────────────────────

function ModeToggle({ value, onChange }: { value: SchemaOutputMode; onChange: (v: SchemaOutputMode) => void }) {
  const opts: { id: SchemaOutputMode; label: string }[] = [
    { id: 'interface', label: 'Interface' },
    { id: 'type',      label: 'Type' },
    { id: 'zod',       label: 'Zod' },
  ];
  return (
    <div className="flex rounded overflow-hidden border border-devlens-border shrink-0">
      {opts.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`px-2 py-1 text-[11px] transition-colors ${
            value === id
              ? 'bg-devlens-accent text-white'
              : 'text-devlens-muted hover:text-devlens-text bg-devlens-bg'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Syntax highlighter ───────────────────────────────────────────────────────

function SchemaHighlighter({ code }: { code: string }) {
  return (
    <>
      {code.split('\n').map((line, i) => (
        <span key={i}>
          <HighlightLine line={line} />
          {'\n'}
        </span>
      ))}
    </>
  );
}

function HighlightLine({ line }: { line: string }) {
  // import statement
  if (line.startsWith('import ')) {
    return <span className="text-devlens-muted italic">{line}</span>;
  }

  // interface Foo {
  const ifaceMatch = line.match(/^(interface\s+)(\w+)(.*)$/);
  if (ifaceMatch) {
    return (
      <>
        <span className="text-purple-400">{ifaceMatch[1]}</span>
        <span className="text-amber-300">{ifaceMatch[2]}</span>
        <span className="text-devlens-muted">{ifaceMatch[3]}</span>
      </>
    );
  }

  // export? type Foo = ...
  const typeMatch = line.match(/^(export\s+)?(type\s+)(\w+)(\s*=\s*)(.*)$/);
  if (typeMatch) {
    return (
      <>
        {typeMatch[1] && <span className="text-purple-400">{typeMatch[1]}</span>}
        <span className="text-purple-400">{typeMatch[2]}</span>
        <span className="text-amber-300">{typeMatch[3]}</span>
        <span className="text-devlens-muted">{typeMatch[4]}</span>
        <span className="text-blue-300">{typeMatch[5]}</span>
      </>
    );
  }

  // const FooSchema = z.object({
  const zodConstMatch = line.match(/^(const\s+)(\w+)(\s*=\s*)(.*)$/);
  if (zodConstMatch) {
    return (
      <>
        <span className="text-purple-400">{zodConstMatch[1]}</span>
        <span className="text-amber-300">{zodConstMatch[2]}</span>
        <span className="text-devlens-muted">{zodConstMatch[3]}</span>
        <span className="text-green-300">{zodConstMatch[4]}</span>
      </>
    );
  }

  // Zod field: fieldName: z.string(),
  const zodField = line.match(/^(\s+)("?[\w$]+"?)(:)(\s+)(z\..+)(,)$/);
  if (zodField) {
    return (
      <>
        <span>{zodField[1]}</span>
        <span className="text-blue-300">{zodField[2]}</span>
        <span className="text-devlens-muted">{zodField[3]}</span>
        <span>{zodField[4]}</span>
        <span className="text-green-300">{zodField[5]}</span>
        <span className="text-devlens-muted">{zodField[6]}</span>
      </>
    );
  }

  // Interface/type field: fieldName?: TypeName;
  const fieldMatch = line.match(/^(\s+)("?[\w$]+"?\??)(:)(\s+)(.+)(;)$/);
  if (fieldMatch) {
    return (
      <>
        <span>{fieldMatch[1]}</span>
        <span className="text-blue-300">{fieldMatch[2]}</span>
        <span className="text-devlens-muted">{fieldMatch[3]}</span>
        <span>{fieldMatch[4]}</span>
        <span className="text-green-300">{fieldMatch[5]}</span>
        <span className="text-devlens-muted">{fieldMatch[6]}</span>
      </>
    );
  }

  return <span className="text-devlens-muted">{line}</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SchemaExtractor({ request }: Props) {
  const [copied, setCopied]         = useState(false);
  const [mode, setMode]             = useState<SchemaOutputMode>('interface');
  const [rootName, setRootName]     = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput]   = useState('');
  const [showTree, setShowTree]     = useState(false);
  const [subtreePath, setSubtreePath] = useState<string | null>(null);
  const [subtreeData, setSubtreeData] = useState<unknown>(null);

  const parsed = useMemo(() => {
    if (!request) return null;
    return tryParse(request.responseBody);
  }, [request?.id]);

  // When request changes, reset subtree + custom name
  useMemo(() => {
    setSubtreePath(null);
    setSubtreeData(null);
    setRootName('');
    setEditingName(false);
  }, [request?.id]);

  const defaultRoot = request ? getDefaultRootName(request.url) : 'Response';
  const effectiveRoot = rootName.trim() || defaultRoot;

  const schemaData = subtreeData !== null ? subtreeData : parsed;
  const schemaRoot = subtreePath
    ? toPascalCase(subtreePath.split('.').pop() || effectiveRoot) || effectiveRoot
    : effectiveRoot;
  // Allow user-set name to override subtree-derived name too
  const finalRoot = rootName.trim() || schemaRoot;

  const schema = useMemo(() => {
    if (schemaData === null || schemaData === undefined) return null;
    return generateSchema(schemaData, finalRoot, mode);
  }, [schemaData, finalRoot, mode]);

  const handleSubtreeSelect = (path: string, data: unknown) => {
    setSubtreePath(path || null);
    setSubtreeData(path ? data : null);
    setShowTree(false); // collapse tree after selection
  };

  const clearSubtree = () => {
    setSubtreePath(null);
    setSubtreeData(null);
  };

  const startEdit = () => {
    setNameInput(rootName || defaultRoot);
    setEditingName(true);
  };

  const commitEdit = () => {
    setRootName(nameInput.trim());
    setEditingName(false);
  };

  const copy = async () => {
    if (!schema) return;
    await navigator.clipboard.writeText(schema);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!request) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-devlens-muted text-sm gap-2">
        <Braces size={28} strokeWidth={1.5} />
        <span>Select a request to extract its schema</span>
      </div>
    );
  }

  if (parsed === null) {
    return (
      <div className="flex items-center justify-center h-full text-devlens-muted text-sm">
        Response body is not valid JSON
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ── */}
      <div className="px-3 py-2 border-b border-devlens-border bg-devlens-surface shrink-0 flex items-center gap-2 flex-wrap">
        <ModeToggle value={mode} onChange={setMode} />

        {/* Editable root name */}
        <div className="flex items-center gap-1 shrink-0">
          {editingName ? (
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingName(false); }}
              className="bg-devlens-bg border border-devlens-accent rounded px-2 py-0.5 text-[11px] font-mono text-devlens-text outline-none w-28"
            />
          ) : (
            <button
              onClick={startEdit}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-devlens-border text-[11px] font-mono text-devlens-muted hover:text-devlens-text hover:border-devlens-accent transition-colors"
              title="Edit root name"
            >
              <span className="text-devlens-text">{finalRoot}</span>
              <Pencil size={9} className="text-devlens-muted" />
            </button>
          )}
        </div>

        {/* Subtree breadcrumb */}
        {subtreePath && (
          <div className="flex items-center gap-1 bg-devlens-accent/10 border border-devlens-accent/30 rounded px-2 py-0.5 shrink-0">
            <span className="font-mono text-[11px] text-devlens-accent max-w-[140px] truncate" title={`$.${subtreePath}`}>
              $.{subtreePath}
            </span>
            <button onClick={clearSubtree} className="text-devlens-muted hover:text-devlens-text ml-0.5">
              <RotateCcw size={10} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-1.5 ml-auto">
          {/* Browse tree toggle */}
          <button
            onClick={() => setShowTree(t => !t)}
            className={`flex items-center gap-1 px-2 py-1 rounded border text-[11px] transition-colors ${
              showTree
                ? 'bg-devlens-accent/15 border-devlens-accent/40 text-devlens-accent'
                : 'border-devlens-border text-devlens-muted hover:text-devlens-text'
            }`}
            title="Browse JSON tree to select a subtree"
          >
            <TreePine size={11} />
            Browse
          </button>

          {/* Copy */}
          <button
            className={`btn flex items-center gap-1.5 ${copied ? 'bg-green-700 text-white' : 'btn-primary'}`}
            onClick={copy}
            disabled={!schema}
          >
            {copied
              ? <><Check size={12} /> Copied</>
              : <><Copy size={12} /> Copy</>}
          </button>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* JSON tree panel */}
        {showTree && (
          <div className="w-2/5 shrink-0 border-r border-devlens-border overflow-auto p-2">
            <p className="text-[10px] text-devlens-muted uppercase tracking-wider px-1 pb-1.5">
              Click <span className="text-devlens-accent">⊕</span> on any branch to extract its schema
            </p>
            <JsonViewer
              data={parsed}
              onSubtreeSelect={handleSubtreeSelect}
            />
          </div>
        )}

        {/* Schema output */}
        <div className="flex-1 overflow-auto p-4">
          {schema ? (
            <pre className="text-sm font-mono text-devlens-text whitespace-pre leading-relaxed">
              <SchemaHighlighter code={schema} />
            </pre>
          ) : (
            <p className="text-devlens-muted text-xs">Could not generate schema.</p>
          )}
        </div>
      </div>
    </div>
  );
}
