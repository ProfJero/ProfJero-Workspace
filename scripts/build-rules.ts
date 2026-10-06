/**
 * Generates firebase/firestore.rules and firebase/storage.rules from:
 *   - packages/shared/src/permissions.ts   (role lists per permission)
 *   - packages/shared/src/collections.ts   (which collections exist, who reads/writes them)
 *   - packages/shared/src/schemas.ts       (document shapes → field validators)
 *
 * Run `npm run rules` after changing any of those. `--check` exits non-zero if
 * the committed rules are stale (used in CI).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  CLIENT_COLLECTIONS,
  DOCUMENT_CONTENT_TYPES,
  FUNCTION_COLLECTIONS,
  MAX_DOCUMENT_BYTES,
  METADATA_FIELDS,
  PERMISSIONS,
  userProfileSchema,
  type Permission,
} from '../packages/shared/src/index';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

type JsonSchema = {
  type?: string;
  anyOf?: JsonSchema[];
  enum?: unknown[];
  const?: unknown;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, JsonSchema>;
  required?: string[];
};

const lit = (v: unknown) => (typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : JSON.stringify(v));
const roles = (p: Permission) => `[${PERMISSIONS[p].map((r) => `'${r}'`).join(', ')}]`;

/** Compile a JSON-schema node into a rules boolean expression over `v`. */
function compile(node: JsonSchema, v: string): string {
  if (node.anyOf) return `(${node.anyOf.map((n) => compile(n, v)).join(' || ')})`;
  if (node.const !== undefined) return `${v} == ${lit(node.const)}`;
  const parts: string[] = [];
  switch (node.type) {
    case 'null':
      return `${v} == null`;
    case 'string':
      parts.push(`${v} is string`);
      if (node.enum) parts.push(`${v} in [${node.enum.map(lit).join(', ')}]`);
      if (node.minLength !== undefined && node.minLength > 0) parts.push(`${v}.size() >= ${node.minLength}`);
      if (node.maxLength !== undefined) parts.push(`${v}.size() <= ${node.maxLength}`);
      // Only backslash-free patterns are portable to RE2 string literals; others are validated by the app/functions.
      if (node.pattern && !node.pattern.includes('\\')) parts.push(`${v}.matches(${lit(node.pattern)})`);
      break;
    case 'integer':
      parts.push(`${v} is int`);
      if (node.minimum !== undefined) parts.push(`${v} >= ${node.minimum}`);
      if (node.maximum !== undefined) parts.push(`${v} <= ${node.maximum}`);
      break;
    case 'number':
      parts.push(`${v} is number`);
      if (node.minimum !== undefined) parts.push(`${v} >= ${node.minimum}`);
      if (node.maximum !== undefined) parts.push(`${v} <= ${node.maximum}`);
      break;
    case 'boolean':
      parts.push(`${v} is bool`);
      break;
    case 'array':
      parts.push(`${v} is list`);
      if (node.minItems) parts.push(`${v}.size() >= ${node.minItems}`);
      if (node.maxItems !== undefined) parts.push(`${v}.size() <= ${node.maxItems}`);
      break;
    case 'object': {
      const keys = Object.keys(node.properties ?? {});
      parts.push(`${v} is map`, `${v}.keys().hasOnly([${keys.map(lit).join(', ')}])`, `${v}.keys().hasAll([${(node.required ?? []).map(lit).join(', ')}])`);
      for (const k of keys) parts.push(compile(node.properties![k]!, `${v}.${k}`));
      break;
    }
    default:
      throw new Error(`Unsupported JSON schema node: ${JSON.stringify(node)}`);
  }
  return parts.length === 1 ? parts[0]! : `(${parts.join(' && ')})`;
}

function validator(name: string, schema: z.ZodObject, extraKeys: readonly string[]): string {
  const json = z.toJSONSchema(schema) as JsonSchema;
  const keys = [...Object.keys(json.properties ?? {}), ...extraKeys];
  const required = [...(json.required ?? []), ...extraKeys];
  const checks = Object.entries(json.properties ?? {}).map(([k, n]) => compile(n, `d.${k}`));
  return [
    `    function valid_${name}(d) {`,
    `      return d.keys().hasOnly([${keys.map(lit).join(', ')}])`,
    `        && d.keys().hasAll([${required.map(lit).join(', ')}])`,
    ...checks.map((c) => `        && ${c}`),
    `;`,
    `    }`,
  ].join('\n');
}

const extraDocumentChecks: Record<string, string> = {
  // Uploaded files must live under this tenant's and this document's storage prefix.
  documents:
    `request.resource.data.storagePath.matches('tenants/' + tenantId + '/documents/' + docId + '/source[.](pdf|txt|docx)')` +
    ` && (request.resource.data.textPath == null || request.resource.data.textPath == 'tenants/' + tenantId + '/documents/' + docId + '/text.json')`,
};

function collectionBlock(c: (typeof CLIENT_COLLECTIONS)[number]): string {
  const extra = extraDocumentChecks[c.name] ? `\n          && ${extraDocumentChecks[c.name]}` : '';
  return `      match /${c.name}/{docId} {
        allow read: if hasPerm(tenantId, ${roles(c.read)});
        allow create: if hasPerm(tenantId, ${roles(c.write)})
          && valid_${c.name}(request.resource.data) && createMeta()${extra};
        allow update: if hasPerm(tenantId, ${roles(c.write)})
          && valid_${c.name}(request.resource.data) && updateMeta()${extra};
        allow delete: if hasPerm(tenantId, ${roles(c.deleteAny)})
          || (hasPerm(tenantId, ${roles(c.write)}) && resource.data.createdBy == request.auth.uid);
      }`;
}

function functionBlock(name: string, perm: Permission): string {
  return `      match /${name}/{docId} {
        allow read: if hasPerm(tenantId, ${roles(perm)});
        allow write: if false; // written only by Cloud Functions (Admin SDK)
      }`;
}

const header = `// ─────────────────────────────────────────────────────────────────────────────
// GENERATED FILE — do not edit. Source: firebase/*.rules.template and
// packages/shared (permissions, collections, schemas). Run \`npm run rules\`.
// ─────────────────────────────────────────────────────────────────────────────
`;

function render(templateFile: string, replacements: Record<string, string>): string {
  let out = readFileSync(join(root, 'firebase', templateFile), 'utf8');
  for (const [k, v] of Object.entries(replacements)) {
    if (!out.includes(k)) throw new Error(`Marker ${k} missing from ${templateFile}`);
    out = out.split(k).join(v);
  }
  out = out.replace(/\{\{roles:([a-zA-Z.]+)\}\}/g, (_, p: string) => {
    if (!(p in PERMISSIONS)) throw new Error(`Unknown permission ${p} in ${templateFile}`);
    return roles(p as Permission);
  });
  if (/\{\{|@@/.test(out)) throw new Error(`Unresolved marker in ${templateFile}`);
  return header + out;
}

const firestore = render('firestore.rules.template', {
  '@@VALIDATORS@@': [
    ...CLIENT_COLLECTIONS.map((c) => validator(c.name, c.schema, METADATA_FIELDS)),
    validator('userProfile', userProfileSchema, ['email', 'createdAt', 'updatedAt']),
  ].join('\n\n'),
  '@@CLIENT_COLLECTIONS@@': CLIENT_COLLECTIONS.map(collectionBlock).join('\n\n'),
  '@@FUNCTION_COLLECTIONS@@': Object.entries(FUNCTION_COLLECTIONS)
    .map(([n, p]) => functionBlock(n, p))
    .join('\n\n'),
});

const storage = render('storage.rules.template', {
  '@@CONTENT_TYPES@@': [...DOCUMENT_CONTENT_TYPES, 'application/json'].map(lit).join(', '),
  '@@MAX_BYTES@@': String(MAX_DOCUMENT_BYTES),
});

const outputs: [string, string][] = [
  ['firebase/firestore.rules', firestore],
  ['firebase/storage.rules', storage],
];
let stale = false;
for (const [file, content] of outputs) {
  const path = join(root, file);
  let current = '';
  try {
    current = readFileSync(path, 'utf8');
  } catch {
    /* new file */
  }
  if (current === content) continue;
  if (check) {
    console.error(`${file} is out of date. Run \`npm run rules\`.`);
    stale = true;
  } else {
    writeFileSync(path, content);
    console.log(`wrote ${file}`);
  }
}
if (stale) process.exit(1);
