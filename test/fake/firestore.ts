// Fausse implémentation minimale de 'firebase/firestore' (uniquement les fonctions utilisées par
// l'app), pour tester une partie complète à plusieurs joueurs sans Firebase.
// - en mémoire (Vitest) ;
// - synchronisée entre onglets/iframes via localStorage (aperçu visuel, test/e2e).

type Data = Record<string, unknown>;
type Ref = { type: 'doc' | 'collection'; path: string; id: string };
type Query = { type: 'query'; col: Ref; filters: [string, unknown][] };

const SYNC_KEY = 'bacito.fakeDb';
const sync = typeof window !== 'undefined' && (window as unknown as { __BAC_FAKE_SYNC__?: boolean }).__BAC_FAKE_SYNC__;

let store = new Map<string, Data>();
let autoId = 0;

function load() {
  if (!sync) return;
  try {
    store = new Map(Object.entries(JSON.parse(localStorage.getItem(SYNC_KEY) ?? '{}') as Record<string, Data>));
  } catch {
    store = new Map();
  }
}
function persist() {
  if (sync) localStorage.setItem(SYNC_KEY, JSON.stringify(Object.fromEntries(store)));
}
load();
if (sync) {
  window.addEventListener('storage', (e) => {
    if (e.key !== SYNC_KEY) return;
    load();
    notify();
  });
}

export function _reset() {
  store = new Map();
  persist();
  notify();
}
export function _dump() {
  return Object.fromEntries(store);
}

/** Simule un refus du serveur sur les écritures (test des messages d'erreur). */
export let _denyWrites = false;
export function _setDeny(v: boolean) {
  _denyWrites = v;
}

// ---------- Références ----------

export function collection(_db: unknown, ...segments: string[]): Ref {
  const path = segments.join('/');
  return { type: 'collection', path, id: segments[segments.length - 1] };
}

export function doc(parentOrDb: Ref | unknown, ...segments: string[]): Ref {
  const p = parentOrDb as Ref;
  if (p && p.type === 'collection') {
    const id = segments[0] ?? `id${Date.now().toString(36)}${(autoId++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    return { type: 'doc', path: `${p.path}/${id}`, id };
  }
  const path = segments.join('/');
  return { type: 'doc', path, id: segments[segments.length - 1] };
}

export function where(field: string, _op: '==', value: unknown): [string, unknown] {
  return [field, value];
}
export function query(col: Ref, ...filters: [string, unknown][]): Query {
  return { type: 'query', col, filters };
}

// ---------- Valeurs spéciales ----------

const TS = { __op: 'ts' };
export const serverTimestamp = () => TS;
export const deleteField = () => ({ __op: 'del' });
export const arrayUnion = (...vals: unknown[]) => ({ __op: 'union', vals });

function isOp(v: unknown, op: string): v is { __op: string; vals?: unknown[] } {
  return !!v && typeof v === 'object' && (v as { __op?: string }).__op === op;
}

function resolve(value: unknown, previous: unknown): unknown {
  if (isOp(value, 'ts')) return Date.now();
  if (isOp(value, 'union')) {
    const arr = Array.isArray(previous) ? previous.slice() : [];
    for (const v of value.vals ?? []) if (!arr.includes(v)) arr.push(v);
    return arr;
  }
  return value;
}

function plain(v: unknown): v is Data {
  return !!v && typeof v === 'object' && !Array.isArray(v) && !('__op' in (v as object));
}

function mergeInto(target: Data, src: Data) {
  for (const [k, v] of Object.entries(src)) {
    if (isOp(v, 'del')) delete target[k];
    else if (plain(v)) {
      const t = plain(target[k]) ? (target[k] as Data) : {};
      mergeInto(t, v);
      target[k] = t;
    } else target[k] = resolve(v, target[k]);
  }
}

function replace(src: Data): Data {
  const out: Data = {};
  mergeInto(out, src);
  return out;
}

// ---------- Écritures ----------

function check() {
  if (_denyWrites) return Promise.reject(Object.assign(new Error('denied'), { code: 'permission-denied' }));
  return null;
}

function applySet(ref: Ref, data: Data, opts?: { merge?: boolean }) {
  const cur = store.get(ref.path);
  if (opts?.merge && cur) {
    const copy = structuredClone(cur);
    mergeInto(copy, data);
    store.set(ref.path, copy);
  } else store.set(ref.path, replace(data));
}

function applyUpdate(ref: Ref, data: Data) {
  const cur = store.get(ref.path);
  if (!cur) throw Object.assign(new Error('not found'), { code: 'not-found' });
  const copy = structuredClone(cur);
  for (const [k, v] of Object.entries(data)) {
    const parts = k.split('.');
    let t = copy;
    for (const p of parts.slice(0, -1)) t = (t[p] = plain(t[p]) ? t[p] : {}) as Data;
    const last = parts[parts.length - 1];
    if (isOp(v, 'del')) delete t[last];
    else t[last] = resolve(v, t[last]);
  }
  store.set(ref.path, copy);
}

function commit() {
  persist();
  notify();
}

export function setDoc(ref: Ref, data: Data, opts?: { merge?: boolean }): Promise<void> {
  const denied = check();
  if (denied) return denied;
  applySet(ref, data, opts);
  commit();
  return Promise.resolve();
}

export function updateDoc(ref: Ref, data: Data): Promise<void> {
  const denied = check();
  if (denied) return denied;
  try {
    applyUpdate(ref, data);
  } catch (e) {
    return Promise.reject(e);
  }
  commit();
  return Promise.resolve();
}

export function writeBatch(_db: unknown) {
  const ops: (() => void)[] = [];
  return {
    set(ref: Ref, data: Data, opts?: { merge?: boolean }) {
      ops.push(() => applySet(ref, data, opts));
    },
    update(ref: Ref, data: Data) {
      ops.push(() => applyUpdate(ref, data));
    },
    delete(ref: Ref) {
      ops.push(() => store.delete(ref.path));
    },
    commit(): Promise<void> {
      const denied = check();
      if (denied) return denied;
      const backup = new Map(store);
      try {
        ops.forEach((op) => op());
      } catch (e) {
        store = backup;
        return Promise.reject(e);
      }
      commit();
      return Promise.resolve();
    },
  };
}

export async function runTransaction(_db: unknown, fn: (tx: unknown) => Promise<void>): Promise<void> {
  const denied = check();
  if (denied) return denied;
  const writes: (() => void)[] = [];
  await fn({
    get: async (ref: Ref) => snapDoc(ref),
    update: (ref: Ref, data: Data) => writes.push(() => applyUpdate(ref, data)),
  });
  writes.forEach((w) => w());
  if (writes.length) commit();
}

// ---------- Lectures ----------

function snapDoc(ref: Ref) {
  const d = store.get(ref.path);
  return {
    id: ref.id,
    ref,
    exists: () => d !== undefined,
    data: () => (d ? structuredClone(d) : undefined),
    metadata: { fromCache: false, hasPendingWrites: false },
  };
}

function runQuery(q: Query) {
  const prefix = q.col.path + '/';
  const docs = [...store.keys()]
    .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
    .sort()
    .map((p) => snapDoc({ type: 'doc', path: p, id: p.slice(prefix.length) }))
    .filter((s) => q.filters.every(([f, v]) => (s.data() as Data)[f] === v));
  return { docs, size: docs.length, metadata: { fromCache: false, hasPendingWrites: false } };
}

type Listener = { target: Ref | Query; next: (s: unknown) => void; last: string };
const listeners = new Set<Listener>();
let scheduled = false;

function emit(l: Listener) {
  const snap = l.target.type === 'query' ? runQuery(l.target) : l.target.type === 'collection' ? runQuery({ type: 'query', col: l.target, filters: [] }) : snapDoc(l.target);
  const key = JSON.stringify('docs' in snap ? snap.docs.map((d) => [d.id, d.data()]) : [snap.exists(), snap.data()]);
  if (key === l.last) return;
  l.last = key;
  l.next(snap);
}

function notify() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    listeners.forEach(emit);
  });
}

export function onSnapshot(target: Ref | Query, ...args: unknown[]): () => void {
  const fns = args.filter((a) => typeof a === 'function') as ((s: unknown) => void)[];
  const l: Listener = { target, next: fns[0], last: '' };
  listeners.add(l);
  queueMicrotask(() => listeners.has(l) && emit(l));
  return () => listeners.delete(l);
}

export type DocumentData = Data;
export type DocumentSnapshot<_T = Data> = ReturnType<typeof snapDoc>;
export type CollectionReference<_T = Data> = Ref;
