/**
 * Minimal Firestore client for Cloudflare Workers, built on the Firestore REST
 * API and shaped like the subset of `firebase-admin/firestore` that the server
 * handlers in apps/functions use. That lets the exact same handler code run in
 * the Worker (see src/shims/*).
 *
 * Guarantees kept from the Admin SDK:
 *  - runTransaction(): beginTransaction → reads bound to the transaction →
 *    one atomic `commit`; retried on contention (ABORTED), rolled back on error.
 *  - WriteBatch.commit() uses `commit` (atomic) — never `batchWrite`, which is
 *    explicitly non-atomic.
 *  - create() fails if the document exists; update() fails if it does not.
 *  - FieldValue.serverTimestamp()/increment() become server-side transforms.
 */

// ───────────────────────────── Configuration ─────────────────────────────

export interface FirestoreConfig {
  projectId: string;
  /** e.g. https://firestore.googleapis.com or http://127.0.0.1:8080 (emulator) */
  origin: string;
  /** Returns the bearer token to use (OAuth access token, or "owner" for the emulator). */
  token: () => Promise<string>;
}

let config: FirestoreConfig | null = null;

export function configureFirestore(c: FirestoreConfig): void {
  config = c;
}

function cfg(): FirestoreConfig {
  if (!config) throw new Error('Firestore client used before configureFirestore()');
  return config;
}

const dbPrefix = () => `projects/${cfg().projectId}/databases/(default)/documents`;
const apiBase = () => `${cfg().origin}/v1/${dbPrefix()}`;

/** Error carrying a gRPC-style status name (e.g. "ABORTED", "ALREADY_EXISTS"). */
export class FirestoreError extends Error {
  constructor(public code: string, message: string, public httpStatus: number) {
    super(message);
    this.name = 'FirestoreError';
  }
}

async function api<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await cfg().token()}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) {
    let status = `HTTP_${res.status}`;
    let message = text.slice(0, 500);
    try {
      const parsed = JSON.parse(text) as { error?: { status?: string; message?: string } } | { error?: { status?: string; message?: string } }[];
      const err = Array.isArray(parsed) ? parsed[0]?.error : parsed.error;
      if (err?.status) status = err.status;
      if (err?.message) message = err.message;
    } catch {
      /* non-JSON error body */
    }
    throw new FirestoreError(status, message, res.status);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// ───────────────────────────── Values ─────────────────────────────

export class Timestamp {
  constructor(public readonly seconds: number, public readonly nanoseconds: number) {}
  static now(): Timestamp {
    return Timestamp.fromMillis(Date.now());
  }
  static fromMillis(ms: number): Timestamp {
    const seconds = Math.floor(ms / 1000);
    return new Timestamp(seconds, Math.round((ms - seconds * 1000) * 1e6));
  }
  static fromDate(d: Date): Timestamp {
    return Timestamp.fromMillis(d.getTime());
  }
  /** Parses RFC 3339 with up to nanosecond precision. */
  static fromRfc3339(s: string): Timestamp {
    const m = /^(.*?)(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(s);
    if (!m) return Timestamp.fromDate(new Date(s));
    const seconds = Math.floor(Date.parse(`${m[1]}${m[3]}`) / 1000);
    return new Timestamp(seconds, Number((m[2] ?? '').padEnd(9, '0')));
  }
  toMillis(): number {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
  toDate(): Date {
    return new Date(this.toMillis());
  }
  toRfc3339(): string {
    const base = new Date(this.seconds * 1000).toISOString().slice(0, 19);
    return `${base}.${String(this.nanoseconds).padStart(9, '0')}Z`;
  }
  isEqual(other: Timestamp): boolean {
    return other instanceof Timestamp && other.seconds === this.seconds && other.nanoseconds === this.nanoseconds;
  }
  valueOf(): string {
    return `${String(this.seconds).padStart(12, '0')}.${String(this.nanoseconds).padStart(9, '0')}`;
  }
  toJSON(): string {
    return this.toDate().toISOString();
  }
}

class Sentinel {
  constructor(public readonly kind: 'serverTimestamp' | 'increment' | 'delete', public readonly operand?: number) {}
}

export const FieldValue = {
  serverTimestamp: () => new Sentinel('serverTimestamp'),
  increment: (n: number) => new Sentinel('increment', n),
  delete: () => new Sentinel('delete'),
};

export type DocumentData = Record<string, any>;
type FsValue = Record<string, unknown>;

function encode(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    if (Number.isSafeInteger(v)) return { integerValue: String(v) };
    return { doubleValue: v };
  }
  if (v instanceof Timestamp) return { timestampValue: v.toRfc3339() };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (v instanceof DocumentReference) return { referenceValue: `${dbPrefix()}/${v.path}` };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (v instanceof Sentinel) throw new Error('FieldValue sentinels are only allowed as field values, not inside arrays');
  if (typeof v === 'object') return { mapValue: { fields: encodeFields(v as DocumentData, '', []).fields } };
  throw new Error(`Unsupported Firestore value: ${typeof v}`);
}

const SIMPLE_SEGMENT = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
const quote = (segment: string) => (SIMPLE_SEGMENT.test(segment) ? segment : `\`${segment.replace(/\\/g, '\\\\').replace(/`/g, '\\`')}\``);

interface Transform {
  fieldPath: string;
  setToServerValue?: 'REQUEST_TIME';
  increment?: FsValue;
}

/** Encodes fields, extracting FieldValue sentinels (at any depth) as transforms. */
function encodeFields(data: DocumentData, prefix: string, transforms: Transform[], deletes: string[] = []): { fields: Record<string, FsValue>; transforms: Transform[]; deletes: string[] } {
  const fields: Record<string, FsValue> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const path = prefix ? `${prefix}.${quote(k)}` : quote(k);
    if (v instanceof Sentinel) {
      if (v.kind === 'serverTimestamp') transforms.push({ fieldPath: path, setToServerValue: 'REQUEST_TIME' });
      else if (v.kind === 'increment') transforms.push({ fieldPath: path, increment: encode(v.operand) });
      else deletes.push(path);
      continue;
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof Date) && !(v instanceof DocumentReference)) {
      fields[k] = { mapValue: { fields: encodeFields(v as DocumentData, path, transforms, deletes).fields } };
    } else {
      fields[k] = encode(v);
    }
  }
  return { fields, transforms, deletes };
}

function decode(v: FsValue): unknown {
  if ('nullValue' in v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return Timestamp.fromRfc3339(v.timestampValue as string);
  if ('arrayValue' in v) return (((v.arrayValue as { values?: FsValue[] }).values) ?? []).map(decode);
  if ('mapValue' in v) return decodeFields((v.mapValue as { fields?: Record<string, FsValue> }).fields);
  if ('referenceValue' in v) return (v.referenceValue as string).slice(dbPrefix().length + 1);
  if ('bytesValue' in v) return v.bytesValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  return null;
}

function decodeFields(fields: Record<string, FsValue> | undefined): DocumentData {
  const out: DocumentData = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = decode(v);
  return out;
}

const randomId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => chars[b % 62]).join('');
};

// ───────────────────────────── References & snapshots ─────────────────────────────

export class DocumentSnapshot {
  constructor(public readonly ref: DocumentReference, private readonly fields: DocumentData | null) {}
  get id(): string {
    return this.ref.id;
  }
  get exists(): boolean {
    return this.fields !== null;
  }
  data(): DocumentData | undefined {
    return this.fields === null ? undefined : this.fields;
  }
  get(field: string): unknown {
    return this.fields?.[field];
  }
}
/** A query result: the document always exists. */
export class QueryDocumentSnapshot extends DocumentSnapshot {
  constructor(ref: DocumentReference, private readonly docFields: DocumentData) {
    super(ref, docFields);
  }
  override data(): DocumentData {
    return this.docFields;
  }
}

export class QuerySnapshot {
  constructor(public readonly docs: QueryDocumentSnapshot[]) {}
  get size(): number {
    return this.docs.length;
  }
  get empty(): boolean {
    return this.docs.length === 0;
  }
  forEach(fn: (d: QueryDocumentSnapshot) => void): void {
    this.docs.forEach(fn);
  }
}

export class DocumentReference {
  constructor(public readonly path: string) {}
  get id(): string {
    return this.path.slice(this.path.lastIndexOf('/') + 1);
  }
  get parent(): CollectionReference {
    return new CollectionReference(this.path.slice(0, this.path.lastIndexOf('/')));
  }
  collection(name: string): CollectionReference {
    return new CollectionReference(`${this.path}/${name}`);
  }
  async get(): Promise<DocumentSnapshot> {
    return getDocument(this, null);
  }
  async set(data: DocumentData, opts?: { merge?: boolean }): Promise<void> {
    await commitWrites([setWrite(this, data, opts)], null);
  }
  async update(data: DocumentData): Promise<void> {
    await commitWrites([updateWrite(this, data)], null);
  }
  async create(data: DocumentData): Promise<void> {
    await commitWrites([createWrite(this, data)], null);
  }
  async delete(): Promise<void> {
    await commitWrites([{ delete: `${dbPrefix()}/${this.path}` }], null);
  }
}

type Op = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'not-in' | 'array-contains' | 'array-contains-any';
const OPS: Record<Op, string> = {
  '==': 'EQUAL', '!=': 'NOT_EQUAL', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL', '>': 'GREATER_THAN', '>=': 'GREATER_THAN_OR_EQUAL',
  in: 'IN', 'not-in': 'NOT_IN', 'array-contains': 'ARRAY_CONTAINS', 'array-contains-any': 'ARRAY_CONTAINS_ANY',
};

interface QueryState {
  parentPath: string; // '' for root
  collectionId: string;
  allDescendants: boolean;
  filters: { field: string; op: Op; value: unknown }[];
  orders: { field: string; direction: 'asc' | 'desc' }[];
  limit: number | null;
}

export class Query {
  constructor(protected readonly state: QueryState) {}
  where(field: string, op: Op, value: unknown): Query {
    return new Query({ ...this.state, filters: [...this.state.filters, { field, op, value }] });
  }
  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): Query {
    return new Query({ ...this.state, orders: [...this.state.orders, { field, direction }] });
  }
  limit(n: number): Query {
    return new Query({ ...this.state, limit: n });
  }
  async get(): Promise<QuerySnapshot> {
    return runQuery(this, null);
  }
  count(): { get(): Promise<{ data(): { count: number } }> } {
    return {
      get: async () => {
        const count = await runCount(this);
        return { data: () => ({ count }) };
      },
    };
  }
  /** @internal */
  toStructuredQuery(): { parent: string; structuredQuery: Record<string, unknown> } {
    const s = this.state;
    const filters = s.filters.map((f) => ({
      fieldFilter: { field: { fieldPath: f.field.split('.').map(quote).join('.') }, op: OPS[f.op], value: encode(f.value) },
    }));
    const structuredQuery: Record<string, unknown> = { from: [{ collectionId: s.collectionId, allDescendants: s.allDescendants }] };
    if (filters.length === 1) structuredQuery.where = filters[0];
    if (filters.length > 1) structuredQuery.where = { compositeFilter: { op: 'AND', filters } };
    if (s.orders.length) structuredQuery.orderBy = s.orders.map((o) => ({ field: { fieldPath: o.field }, direction: o.direction === 'desc' ? 'DESCENDING' : 'ASCENDING' }));
    if (s.limit !== null) structuredQuery.limit = s.limit;
    return { parent: s.parentPath, structuredQuery };
  }
}

export class CollectionReference extends Query {
  constructor(public readonly path: string) {
    const slash = path.lastIndexOf('/');
    super({ parentPath: slash < 0 ? '' : path.slice(0, slash), collectionId: path.slice(slash + 1), allDescendants: false, filters: [], orders: [], limit: null });
  }
  get id(): string {
    return this.state.collectionId;
  }
  doc(id?: string): DocumentReference {
    return new DocumentReference(`${this.path}/${id ?? randomId()}`);
  }
  async add(data: DocumentData): Promise<DocumentReference> {
    const ref = this.doc();
    await ref.create(data);
    return ref;
  }
}

// ───────────────────────────── Operations ─────────────────────────────

const docName = (ref: DocumentReference) => `${dbPrefix()}/${ref.path}`;

interface Write {
  update?: { name: string; fields: Record<string, FsValue> };
  delete?: string;
  updateMask?: { fieldPaths: string[] };
  updateTransforms?: Transform[];
  currentDocument?: { exists: boolean };
}

function withTransforms(w: Write, transforms: Transform[]): Write {
  return transforms.length ? { ...w, updateTransforms: transforms } : w;
}

function createWrite(ref: DocumentReference, data: DocumentData): Write {
  const { fields, transforms } = encodeFields(data, '', []);
  return withTransforms({ update: { name: docName(ref), fields }, currentDocument: { exists: false } }, transforms);
}

function setWrite(ref: DocumentReference, data: DocumentData, opts?: { merge?: boolean }): Write {
  const { fields, transforms, deletes } = encodeFields(data, '', []);
  if (!opts?.merge) return withTransforms({ update: { name: docName(ref), fields } }, transforms);
  // Merge: only the provided (non-sentinel) leaf fields are written.
  const paths: string[] = [...deletes];
  const collect = (obj: DocumentData, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined || v instanceof Sentinel) continue;
      const p = prefix ? `${prefix}.${quote(k)}` : quote(k);
      if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp) && !(v instanceof Date) && !(v instanceof DocumentReference) && Object.keys(v).length) collect(v, p);
      else paths.push(p);
    }
  };
  collect(data, '');
  return withTransforms({ update: { name: docName(ref), fields }, updateMask: { fieldPaths: paths } }, transforms);
}

/** update(): top-level keys (dotted keys are field paths) replace their values; the document must exist. */
function updateWrite(ref: DocumentReference, data: DocumentData): Write {
  const nested: DocumentData = {};
  for (const [k, v] of Object.entries(data)) {
    // Expand "a.b" paths into nested objects so they encode as a map with mask "a.b".
    const parts = k.split('.');
    let cur = nested;
    parts.slice(0, -1).forEach((p) => {
      cur[p] = cur[p] && typeof cur[p] === 'object' ? cur[p] : {};
      cur = cur[p];
    });
    cur[parts[parts.length - 1]!] = v;
  }
  const { fields, transforms, deletes } = encodeFields(nested, '', []);
  const mask = [
    ...Object.entries(data).filter(([, v]) => v !== undefined && !(v instanceof Sentinel)).map(([k]) => k.split('.').map(quote).join('.')),
    ...deletes,
  ];
  return withTransforms({ update: { name: docName(ref), fields }, updateMask: { fieldPaths: mask }, currentDocument: { exists: true } }, transforms);
}

async function getDocument(ref: DocumentReference, transaction: string | null): Promise<DocumentSnapshot> {
  const [snap] = await batchGet([ref], transaction);
  return snap!;
}

async function batchGet(refs: DocumentReference[], transaction: string | null): Promise<DocumentSnapshot[]> {
  if (refs.length === 0) return [];
  const res = await api<{ found?: { name: string; fields?: Record<string, FsValue> }; missing?: string }[]>(
    'POST',
    `${apiBase()}:batchGet`,
    { documents: refs.map(docName), ...(transaction ? { transaction } : {}) },
  );
  const byName = new Map<string, DocumentData | null>();
  for (const r of res) {
    if (r.found) byName.set(r.found.name, decodeFields(r.found.fields));
    else if (r.missing) byName.set(r.missing, null);
  }
  return refs.map((ref) => new DocumentSnapshot(ref, byName.get(docName(ref)) ?? null));
}

async function runQuery(q: Query, transaction: string | null): Promise<QuerySnapshot> {
  const { parent, structuredQuery } = q.toStructuredQuery();
  const url = parent ? `${apiBase()}/${parent}:runQuery` : `${apiBase()}:runQuery`;
  const res = await api<{ document?: { name: string; fields?: Record<string, FsValue> } }[]>('POST', url, {
    structuredQuery,
    ...(transaction ? { transaction } : {}),
  });
  const docs = res
    .filter((r) => r.document)
    .map((r) => new QueryDocumentSnapshot(new DocumentReference(r.document!.name.slice(dbPrefix().length + 1)), decodeFields(r.document!.fields)));
  return new QuerySnapshot(docs);
}

async function runCount(q: Query): Promise<number> {
  const { parent, structuredQuery } = q.toStructuredQuery();
  const url = parent ? `${apiBase()}/${parent}:runAggregationQuery` : `${apiBase()}:runAggregationQuery`;
  const res = await api<{ result?: { aggregateFields?: Record<string, { integerValue?: string }> } }[]>('POST', url, {
    structuredAggregationQuery: { structuredQuery, aggregations: [{ alias: 'count', count: {} }] },
  });
  return Number(res.find((r) => r.result)?.result?.aggregateFields?.count?.integerValue ?? 0);
}

async function commitWrites(writes: Write[], transaction: string | null): Promise<void> {
  if (writes.length === 0 && !transaction) return;
  await api('POST', `${apiBase()}:commit`, { writes, ...(transaction ? { transaction } : {}) });
}

// ───────────────────────────── Transactions & batches ─────────────────────────────

export class Transaction {
  private writes: Write[] = [];
  constructor(private readonly id: string) {}

  get(target: DocumentReference): Promise<DocumentSnapshot>;
  get(target: Query): Promise<QuerySnapshot>;
  async get(target: DocumentReference | Query): Promise<DocumentSnapshot | QuerySnapshot> {
    if (this.writes.length) throw new Error('Firestore transactions require all reads to be executed before all writes.');
    return target instanceof DocumentReference ? getDocument(target, this.id) : runQuery(target, this.id);
  }
  async getAll(...refs: DocumentReference[]): Promise<DocumentSnapshot[]> {
    if (this.writes.length) throw new Error('Firestore transactions require all reads to be executed before all writes.');
    return batchGet(refs, this.id);
  }
  create(ref: DocumentReference, data: DocumentData): this {
    this.writes.push(createWrite(ref, data));
    return this;
  }
  set(ref: DocumentReference, data: DocumentData, opts?: { merge?: boolean }): this {
    this.writes.push(setWrite(ref, data, opts));
    return this;
  }
  update(ref: DocumentReference, data: DocumentData): this {
    this.writes.push(updateWrite(ref, data));
    return this;
  }
  delete(ref: DocumentReference): this {
    this.writes.push({ delete: docName(ref) });
    return this;
  }
  /** @internal */
  pending(): Write[] {
    return this.writes;
  }
}

export class WriteBatch {
  private writes: Write[] = [];
  create(ref: DocumentReference, data: DocumentData): this {
    this.writes.push(createWrite(ref, data));
    return this;
  }
  set(ref: DocumentReference, data: DocumentData, opts?: { merge?: boolean }): this {
    this.writes.push(setWrite(ref, data, opts));
    return this;
  }
  update(ref: DocumentReference, data: DocumentData): this {
    this.writes.push(updateWrite(ref, data));
    return this;
  }
  delete(ref: DocumentReference): this {
    this.writes.push({ delete: docName(ref) });
    return this;
  }
  /** Atomic: all writes apply or none do. */
  async commit(): Promise<void> {
    if (this.writes.length > 500) throw new Error('A batch can contain at most 500 writes');
    await commitWrites(this.writes, null);
  }
}

const MAX_ATTEMPTS = 6;
const isContention = (e: unknown) => e instanceof FirestoreError && (e.code === 'ABORTED' || e.httpStatus === 409 && e.code !== 'ALREADY_EXISTS');

export class Firestore {
  collection(path: string): CollectionReference {
    return new CollectionReference(path);
  }
  doc(path: string): DocumentReference {
    return new DocumentReference(path);
  }
  collectionGroup(collectionId: string): Query {
    return new Query({ parentPath: '', collectionId, allDescendants: true, filters: [], orders: [], limit: null });
  }
  batch(): WriteBatch {
    return new WriteBatch();
  }
  async runTransaction<T>(fn: (t: Transaction) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const { transaction } = await api<{ transaction: string }>('POST', `${apiBase()}:beginTransaction`, { options: { readWrite: {} } });
      const t = new Transaction(transaction);
      let result: T;
      try {
        result = await fn(t);
      } catch (e) {
        await api('POST', `${apiBase()}:rollback`, { transaction }).catch(() => undefined);
        if (isContention(e)) {
          lastError = e;
          await backoff(attempt);
          continue;
        }
        throw e;
      }
      try {
        await commitWrites(t.pending(), transaction);
        return result;
      } catch (e) {
        if (!isContention(e)) throw e;
        lastError = e;
        await backoff(attempt);
      }
    }
    throw lastError instanceof FirestoreError ? Object.assign(lastError, { code: 'ABORTED' }) : lastError;
  }
}

const backoff = (attempt: number) => new Promise((r) => setTimeout(r, Math.min(1000, 25 * 2 ** attempt) + Math.random() * 50));

export const db = new Firestore();
