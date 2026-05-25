// ─── Types ────────────────────────────────────────────────────────────────────

export type SchemaOutputMode = 'interface' | 'type' | 'zod';

interface InterfaceDef {
  name: string;
  fields: FieldDef[];
}

interface FieldDef {
  key: string;
  tsType: string;
  optional: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}

function inferType(
  value: unknown,
  keyName: string,
  interfaces: Map<string, InterfaceDef>,
  path: string
): string {
  if (value === null)      return 'null';
  if (value === undefined) return 'undefined';

  if (Array.isArray(value)) {
    if (value.length === 0) return 'unknown[]';
    const itemTypes = new Set(value.map(v => inferType(v, keyName, interfaces, `${path}_item`)));
    const unified = itemTypes.size === 1 ? [...itemTypes][0] : [...itemTypes].join(' | ');
    return `(${unified})[]`;
  }

  if (typeof value === 'object') {
    const interfaceName = toPascalCase(keyName) || toPascalCase(path) || 'Unknown';
    buildInterface(value as Record<string, unknown>, interfaceName, interfaces, path);
    return interfaceName;
  }

  return typeof value;
}

function buildInterface(
  obj: Record<string, unknown>,
  name: string,
  interfaces: Map<string, InterfaceDef>,
  path: string
): void {
  if (interfaces.has(name)) return;

  const fields: FieldDef[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const childPath = `${path}_${key}`;
    const rawType = inferType(value, key, interfaces, childPath);
    const optional = value === null || value === undefined;
    const tsType = optional && rawType !== 'null' ? `${rawType} | null` : rawType;
    fields.push({ key, tsType, optional });
  }

  interfaces.set(name, { name, fields });
}

// ─── Renderers ────────────────────────────────────────────────────────────────

function safeKey(key: string): string {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
}

function renderInterface(iface: InterfaceDef): string {
  const fields = iface.fields.map(f => {
    const optMark = f.optional ? '?' : '';
    return `  ${safeKey(f.key)}${optMark}: ${f.tsType};`;
  });
  return `interface ${iface.name} {\n${fields.join('\n')}\n}`;
}

function renderTypeAlias(iface: InterfaceDef): string {
  const fields = iface.fields.map(f => {
    const optMark = f.optional ? '?' : '';
    return `  ${safeKey(f.key)}${optMark}: ${f.tsType};`;
  });
  return `type ${iface.name} = {\n${fields.join('\n')}\n};`;
}

// ─── Zod helpers ──────────────────────────────────────────────────────────────

function tsTypeToZod(tsType: string, interfaces: Map<string, InterfaceDef>): string {
  if (tsType === 'string')    return 'z.string()';
  if (tsType === 'number')    return 'z.number()';
  if (tsType === 'boolean')   return 'z.boolean()';
  if (tsType === 'null')      return 'z.null()';
  if (tsType === 'undefined') return 'z.undefined()';
  if (tsType === 'unknown')   return 'z.unknown()';

  // (X)[] — parenthesised union array
  const parenArr = tsType.match(/^\((.+)\)\[\]$/);
  if (parenArr) return `z.array(${tsTypeToZod(parenArr[1], interfaces)})`;

  // X[] — simple array
  const simpleArr = tsType.match(/^(\w+)\[\]$/);
  if (simpleArr) return `z.array(${tsTypeToZod(simpleArr[1], interfaces)})`;

  // X | Y (union)
  if (tsType.includes(' | ')) {
    const parts = tsType.split(' | ').map(p => tsTypeToZod(p.trim(), interfaces));
    // nullable shorthand: T | null → T.nullable()
    if (parts.length === 2) {
      if (parts[1] === 'z.null()') return `${parts[0]}.nullable()`;
      if (parts[0] === 'z.null()') return `${parts[1]}.nullable()`;
    }
    return `z.union([${parts.join(', ')}])`;
  }

  // Named interface reference → SchemaName
  if (interfaces.has(tsType)) return `${tsType}Schema`;

  return 'z.unknown()';
}

function renderZodSchema(iface: InterfaceDef, interfaces: Map<string, InterfaceDef>): string {
  const fields = iface.fields.map(f => {
    const base = tsTypeToZod(f.tsType, interfaces);
    const zodType = f.optional ? `${base}.optional()` : base;
    return `  ${safeKey(f.key)}: ${zodType},`;
  });
  return [
    `const ${iface.name}Schema = z.object({`,
    fields.join('\n'),
    `});`,
    `export type ${iface.name} = z.infer<typeof ${iface.name}Schema>;`,
  ].join('\n');
}

// ─── Topological sort ─────────────────────────────────────────────────────────

function sortInterfaces(interfaces: Map<string, InterfaceDef>, rootName: string): string[] {
  const deps = new Map<string, Set<string>>();
  for (const [name, iface] of interfaces) {
    const d = new Set<string>();
    for (const f of iface.fields) {
      f.tsType.replace(/[[\]()| ]/g, ' ').split(' ')
        .filter(t => interfaces.has(t))
        .forEach(t => d.add(t));
    }
    deps.set(name, d);
  }

  const result: string[] = [];
  const visited = new Set<string>();

  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    for (const dep of deps.get(name) || []) visit(dep);
    result.push(name);
  }

  for (const name of interfaces.keys()) {
    if (name !== rootName) visit(name);
  }
  if (interfaces.has(rootName)) visit(rootName);

  return result;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function generateSchema(
  json: unknown,
  rootName = 'Root',
  mode: SchemaOutputMode = 'interface'
): string {
  const interfaces = new Map<string, InterfaceDef>();

  const render = (iface: InterfaceDef): string => {
    if (mode === 'zod')  return renderZodSchema(iface, interfaces);
    if (mode === 'type') return renderTypeAlias(iface);
    return renderInterface(iface);
  };

  const zodHeader = mode === 'zod' ? `import { z } from 'zod';\n\n` : '';

  // ── Array root ──
  if (Array.isArray(json)) {
    if (json.length === 0) {
      if (mode === 'zod') return `${zodHeader}const ${rootName}Schema = z.array(z.unknown());\nexport type ${rootName} = z.infer<typeof ${rootName}Schema>;`;
      return `type ${rootName} = unknown[];`;
    }
    const first = json[0];
    if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
      const itemName = rootName + 'Item';
      buildInterface(first as Record<string, unknown>, itemName, interfaces, itemName);
      const sorted = sortInterfaces(interfaces, itemName);
      const lines = sorted.map(n => render(interfaces.get(n)!));
      if (mode === 'zod') {
        lines.push(`\nconst ${rootName}Schema = z.array(${itemName}Schema);\nexport type ${rootName} = z.infer<typeof ${rootName}Schema>;`);
      } else {
        lines.push(`\ntype ${rootName} = ${itemName}[];`);
      }
      return zodHeader + lines.join('\n\n');
    }
    const itemType = inferType(json[0], rootName, interfaces, rootName);
    if (mode === 'zod') {
      return `${zodHeader}const ${rootName}Schema = z.array(${tsTypeToZod(itemType, interfaces)});\nexport type ${rootName} = z.infer<typeof ${rootName}Schema>;`;
    }
    return `type ${rootName} = ${itemType}[];`;
  }

  // ── Object root ──
  if (typeof json === 'object' && json !== null) {
    buildInterface(json as Record<string, unknown>, rootName, interfaces, rootName);
    const sorted = sortInterfaces(interfaces, rootName);
    return zodHeader + sorted.map(n => render(interfaces.get(n)!)).join('\n\n');
  }

  // ── Primitive root ──
  if (mode === 'zod') {
    return `${zodHeader}const ${rootName}Schema = ${tsTypeToZod(typeof json, interfaces)};\nexport type ${rootName} = z.infer<typeof ${rootName}Schema>;`;
  }
  return `type ${rootName} = ${typeof json};`;
}
