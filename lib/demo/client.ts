import {
  DEMO_USER_ID,
  DEMO_USER_EMAIL,
  DEMO_USER_NAME,
  getDb,
  nextWorkerCode,
} from './store';

type Row = Record<string, unknown>;

function tableRows(table: string): Row[] {
  const db = getDb();
  switch (table) {
    case 'profiles':
      return db.profiles as unknown as Row[];
    case 'user_roles':
      return db.user_roles as unknown as Row[];
    case 'sites':
      return db.sites as unknown as Row[];
    case 'workers':
      return db.workers as unknown as Row[];
    case 'attendance':
      return db.attendance as unknown as Row[];
    case 'salary_advances':
      return db.salary_advances as unknown as Row[];
    case 'salary_payments':
      return db.salary_payments as unknown as Row[];
    case 'documents':
      return db.documents as unknown as Row[];
    case 'company_settings':
      return db.company_settings as unknown as Row[];
    case 'site_incharge_requests':
      return db.site_incharge_requests as unknown as Row[];
    case 'worker_change_requests':
      return db.worker_change_requests as unknown as Row[];
    case 'report_logs':
      return db.report_logs as unknown as Row[];
    default:
      throw new Error(`Demo store: unknown table "${table}"`);
  }
}

type Filter = {
  kind:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'in'
    | 'ilike'
    | 'is'
    | 'not'
    | 'or';
  col?: string;
  value?: unknown;
  op?: string;
  orClauses?: Filter[];
};

function ilikeMatch(value: unknown, pattern: unknown): boolean {
  const text = value == null ? '' : String(value).toLowerCase();
  let pat = String(pattern).toLowerCase();
  let startsWith = false;
  let endsWith = false;
  if (pat.startsWith('%')) {
    startsWith = true;
    pat = pat.slice(1);
  }
  if (pat.endsWith('%')) {
    endsWith = true;
    pat = pat.slice(0, -1);
  }
  if (!startsWith && !endsWith) return text === pat;
  if (startsWith && endsWith) return text.includes(pat);
  if (startsWith) return text.endsWith(pat);
  return text.startsWith(pat);
}

function applyFilter(row: Row, f: Filter): boolean {
  const v = f.col !== undefined ? row[f.col] : undefined;
  switch (f.kind) {
    case 'eq':
      return v === f.value;
    case 'neq':
      return v !== f.value;
    case 'gt':
      return (v as number) > (f.value as number);
    case 'gte':
      return (v as number) >= (f.value as number);
    case 'lt':
      return (v as number) < (f.value as number);
    case 'lte':
      return (v as number) <= (f.value as number);
    case 'in':
      return Array.isArray(f.value) && (f.value as unknown[]).includes(v);
    case 'ilike':
      return ilikeMatch(v, f.value);
    case 'is':
      return f.value === null ? v == null : v === f.value;
    case 'not':
      if (f.op === 'is') return v !== f.value;
      return v === f.value ? false : true;
    case 'or': {
      return (f.orClauses ?? []).some((c) => applyFilter(row, c));
    }
  }
}

const ALIAS_COL: Record<string, string> = {
  worker: 'worker_id',
  site: 'site_id',
  supervisor: 'supervisor_id',
  requested_by_profile: 'requested_by',
  approved_by_profile: 'approved_by',
  uploaded_by_profile: 'uploaded_by',
};

function colFromFkHint(hint: string, alias: string): string {
  const stripped = hint.endsWith('_fkey') ? hint.slice(0, -'_fkey'.length) : hint;
  const parts = stripped.split('_');
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 1];
    if (candidate === 'id' && parts.length >= 3) {
      return parts[parts.length - 2];
    }
    return candidate;
  }
  return ALIAS_COL[alias] ?? '';
}

function joinTableName(name: string): string {
  return name;
}

type SelectToken =
  | { type: 'star' }
  | { type: 'field'; name: string }
  | { type: 'embed'; alias: string; table: string; fkCol: string; fields: string[] };

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  const nbsp = input.replace(/ +/g, ' ');
  for (const ch of nbsp) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function parseSelect(select: string | undefined): SelectToken[] {
  if (!select) return [{ type: 'star' }];
  const tokens: SelectToken[] = [];
  for (const raw of splitTopLevel(select)) {
    const token = raw.trim();
    if (!token) continue;
    if (token === '*') {
      tokens.push({ type: 'star' });
      continue;
    }
    const colon = token.indexOf(':');
    if (colon >= 0) {
      const alias = token.slice(0, colon).trim();
      const rest = token.slice(colon + 1).trim();
      const m = rest.match(/^(\w+)(?:!([\w]+))?(?:\(([\w\s,]+)\))?$/);
      if (m) {
        const table = m[1];
        const hint = m[2];
        const fields = splitTopLevel(m[3] ?? '').map((x) => x.trim()).filter(Boolean);
        const fkCol = hint ? colFromFkHint(hint, alias) : (ALIAS_COL[alias] ?? '');
        tokens.push({ type: 'embed', alias, table: joinTableName(table), fkCol, fields });
        continue;
      }
    }
    tokens.push({ type: 'field', name: token });
  }
  return tokens;
}

function embedFields(target: Row | undefined, fields: string[]): Row {
  const out: Row = {};
  for (const f of fields) out[f] = (target ?? {})[f];
  return out;
}

function resolveEmbed(
  tableName: string,
  parent: Row,
  e: { table: string; fkCol: string; fields: string[] }
): Row | null {
  if (!e.fkCol) return null;
  const fkValue = parent[e.fkCol];
  if (fkValue == null) return null;
  const target = tableRows(e.table).find((r) => r.id === fkValue);
  if (!target) return null;
  return embedFields(target, e.fields);
}

function projectRow(
  tableName: string,
  row: Row,
  tokens: SelectToken[]
): Row {
  const out: Row = {};
  for (const t of tokens) {
    if (t.type === 'star') {
      const { site, worker, supervisor, requested_by_profile, approved_by_profile, uploaded_by_profile, site_incharge, ...own } = row;
      Object.assign(out, own);
    } else if (t.type === 'field') {
      out[t.name] = row[t.name];
    } else {
      const embedded = resolveEmbed(tableName, row, t);
      out[t.alias] = embedded ?? null;
    }
  }
  return out;
}

function demoUser() {
  return {
    id: DEMO_USER_ID,
    email: DEMO_USER_EMAIL,
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: {},
    user_metadata: { full_name: DEMO_USER_NAME },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function demoSession() {
  return {
    access_token: 'demo-access-token',
    refresh_token: 'demo-refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: demoUser(),
  };
}

function clearDemoCookie() {
  if (typeof document !== 'undefined') {
    document.cookie = 'cwms_demo=; Max-Age=0; path=/';
  }
}

function joinRequests() {
  const db = getDb();
  const profiles = db.profiles;
  const sites = db.sites;
  return db.site_incharge_requests
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((r) => {
      const prof = profiles.find((p) => p.id === r.user_id);
      const site = r.site_id ? sites.find((s) => s.id === r.site_id) : undefined;
      return {
        ...r,
        full_name: prof?.full_name ?? null,
        email: prof?.email ?? null,
        site_name: site?.site_name ?? null,
      };
    });
}

function joinWorkerChanges() {
  const db = getDb();
  const profiles = db.profiles;
  const sites = db.sites;
  const workers = db.workers;
  return db.worker_change_requests
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((r) => {
      const worker = r.worker_id ? workers.find((w) => w.id === r.worker_id) : undefined;
      const site = r.site_id ? sites.find((s) => s.id === r.site_id) : undefined;
      const requester = r.requested_by ? profiles.find((p) => p.id === r.requested_by) : undefined;
      return {
        ...r,
        worker_name: worker?.name ?? (r.payload?.name as string | undefined) ?? null,
        site_name: site?.site_name ?? null,
        requester_name: requester?.full_name ?? null,
      };
    });
}

function runRpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: null }> {
  if (name === 'has_role') {
    const p_role = String(args.p_role ?? '');
    const isAdminQuery = p_role === 'admin';
    return Promise.resolve({ data: isAdminQuery, error: null });
  }
  if (name === 'list_site_incharge_requests') {
    return Promise.resolve({ data: joinRequests(), error: null });
  }
  if (name === 'list_worker_change_requests') {
    return Promise.resolve({ data: joinWorkerChanges(), error: null });
  }
  if (name === 'generate_worker_code') {
    return Promise.resolve({ data: nextWorkerCode(getDb()), error: null });
  }
  return Promise.resolve({ data: null, error: null });
}

interface MutationInfo {
  kind: 'insert' | 'upsert' | 'update' | 'delete';
  payload?: Row | Row[];
  onConflict?: string;
}

class DemoQuery {
  private table: string;
  private filters: Filter[] = [];
  private selectString: string | undefined;
  private selectOptions: { count?: string; head?: boolean } | undefined;
  private orderCol: string | undefined;
  private orderAsc = true;
  private rangeStart: number | undefined;
  private rangeEnd: number | undefined;
  private limitCount: number | undefined;
  private resultMode: 'data' | 'single' | 'maybeSingle' = 'data';
  private mutation: MutationInfo | undefined;

  constructor(table: string) {
    this.table = table;
  }

  select(cols: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    this.selectString = cols;
    this.selectOptions = opts as { count?: string; head?: boolean } | undefined;
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending ?? true;
    return this;
  }

  range(from: number, to: number) {
    this.rangeStart = from;
    this.rangeEnd = to;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  eq(col: string, value: unknown) {
    this.filters.push({ kind: 'eq', col, value });
    return this;
  }

  neq(col: string, value: unknown) {
    this.filters.push({ kind: 'neq', col, value });
    return this;
  }

  gt(col: string, value: unknown) {
    this.filters.push({ kind: 'gt', col, value });
    return this;
  }

  gte(col: string, value: unknown) {
    this.filters.push({ kind: 'gte', col, value });
    return this;
  }

  lt(col: string, value: unknown) {
    this.filters.push({ kind: 'lt', col, value });
    return this;
  }

  lte(col: string, value: unknown) {
    this.filters.push({ kind: 'lte', col, value });
    return this;
  }

  in(col: string, values: unknown[]) {
    this.filters.push({ kind: 'in', col, value: values });
    return this;
  }

  ilike(col: string, pattern: unknown) {
    this.filters.push({ kind: 'ilike', col, value: pattern });
    return this;
  }

  is(col: string, value: unknown) {
    this.filters.push({ kind: 'is', col, value });
    return this;
  }

  not(col: string, op: string, value: unknown) {
    this.filters.push({ kind: 'not', col, value, op });
    return this;
  }

  or(clauses: string) {
    const orClauses: Filter[] = [];
    for (const part of splitTopLevel(clauses)) {
      const t = part.trim();
      const m = t.match(/^([\w_]+)\.(\w+)\.(.*)$/);
      if (!m) continue;
      const [, col, opRaw, rawValue] = m;
      let value: unknown = rawValue;
      if (opRaw === 'ilike' || opRaw === 'like') {
        orClauses.push({ kind: 'ilike', col, value });
      } else if (opRaw === 'is') {
        orClauses.push({ kind: 'is', col, value: rawValue === 'null' ? null : rawValue });
      } else if (opRaw === 'in') {
        const vals = splitTopLevel(rawValue.replace(/^\(/, '').replace(/\)$/, ''));
        orClauses.push({ kind: 'in', col, value: vals });
      } else {
        orClauses.push({ kind: 'eq', col, value });
      }
    }
    this.filters.push({ kind: 'or', orClauses });
    return this;
  }

  single() {
    this.resultMode = 'single';
    return this;
  }

  maybeSingle() {
    this.resultMode = 'maybeSingle';
    return this;
  }

  insert(rows: Row | Row[]) {
    this.mutation = { kind: 'insert', payload: rows };
    return this;
  }

  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.mutation = { kind: 'upsert', payload: rows, onConflict: opts?.onConflict };
    return this;
  }

  update(payload: Row) {
    this.mutation = { kind: 'update', payload };
    return this;
  }

  delete() {
    this.mutation = { kind: 'delete' };
    return this;
  }

  private applyFilters(rows: Row[]): Row[] {
    if (!this.filters.length) return rows;
    return rows.filter((r) => this.filters.every((f) => applyFilter(r, f)));
  }

  private async execute(): Promise<{
    data: unknown;
    error: null;
    count?: number;
  }> {
    const rows = tableRows(this.table);
    let baseRows: Row[] = [];
    let affectedRows: Row[] = [];

    if (this.mutation) {
      const m = this.mutation;
      if (m.kind === 'insert' || m.kind === 'upsert') {
        const incoming = Array.isArray(m.payload) ? m.payload : m.payload ? [m.payload] : [];
        for (const raw of incoming) {
          const row: Row = { ...raw };
          const now = new Date().toISOString();
          if (!row.id) row.id = `${this.table}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
          if (!row.created_at) row.created_at = now;
          if (!row.updated_at) row.updated_at = now;
          if (m.kind === 'upsert' && m.onConflict) {
            const keys = m.onConflict.split(',').map((k) => k.trim());
            const idx = rows.findIndex((r) => keys.every((k) => r[k] === row[k]));
            if (idx >= 0) {
              rows[idx] = row;
              affectedRows.push(row);
              continue;
            }
          }
          rows.push(row);
          affectedRows.push(row);
        }
      } else if (m.kind === 'update') {
        const targets = this.applyFilters(rows);
        for (const r of targets) {
          Object.assign(r, m.payload ?? {}, { updated_at: new Date().toISOString() });
        }
        affectedRows = targets;
      } else if (m.kind === 'delete') {
        const targets = this.applyFilters(rows);
        const ids = new Set(targets.map((r) => r.id as string));
        for (let i = rows.length - 1; i >= 0; i--) {
          if (ids.has(rows[i].id as string)) rows.splice(i, 1);
        }
        affectedRows = targets;
      }

      // insert/upsert without .select() -> data null like supabase-js
      if (!this.selectString) {
        return { data: null, error: null };
      }
      baseRows = affectedRows;
    } else {
      baseRows = rows.slice();
    }

    const filtered = this.applyFilters(baseRows.map((r) => ({ ...r })));

    if (this.selectOptions?.head) {
      return { data: [], error: null, count: filtered.length };
    }

    const count = this.selectOptions?.count ? filtered.length : undefined;

    let ordered = filtered;
    if (this.orderCol) {
      const col = this.orderCol;
      ordered = ordered.slice().sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number') {
          return this.orderAsc ? av - bv : bv - av;
        }
        const aS = String(av);
        const bS = String(bv);
        return this.orderAsc ? aS.localeCompare(bS) : bS.localeCompare(aS);
      });
    }

    let sliced = ordered;
    if (this.rangeStart !== undefined && this.rangeEnd !== undefined) {
      sliced = sliced.slice(this.rangeStart, this.rangeEnd + 1);
    } else if (this.limitCount !== undefined) {
      sliced = sliced.slice(0, this.limitCount);
    }

    const tokens = parseSelect(this.selectString);
    const projected = sliced.map((r) => projectRow(this.table, r, tokens));

    if (this.resultMode === 'single') {
      if (projected.length === 0) {
        return { data: null, error: null, count };
      }
      return { data: projected[0], error: null, count };
    }
    if (this.resultMode === 'maybeSingle') {
      return { data: projected[0] ?? null, error: null, count };
    }
    return { data: projected, error: null, count };
  }

  then<TResult1 = unknown, TResult2 = never>(
    resolve?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(resolve, reject);
  }
}

export function createDemoClient() {
  const db = getDb();
  void db;

  const auth = {
    getSession: async () => ({ data: { session: demoSession() }, error: null }),
    getUser: async () => ({ data: { user: demoUser() }, error: null }),
    signInWithPassword: async () => ({
      data: { session: demoSession(), user: demoUser() },
      error: { message: 'Demo mode: use the Demo View button to explore the app with sample data.' },
    }),
    signUp: async () => ({
      data: { session: null, user: null },
      error: { message: 'Demo mode: registration is disabled.' },
    }),
    signOut: async () => {
      clearDemoCookie();
      if (typeof window !== 'undefined') {
        window.location.assign('/login');
      }
      return { error: null };
    },
    onAuthStateChange: () => ({
      data: {
        subscription: {
          unsubscribe: () => undefined,
        },
      },
      error: null,
    }),
    updateUser: async () => ({ data: { user: demoUser() }, error: null }),
  };

  const from = (table: string) => new DemoQuery(table);

  const rpc = (name: string, args: Record<string, unknown> = {}) =>
    runRpc(name, args);

  const storage = {
    from: (bucket: string) => ({
      upload: async (path: string) => ({
        data: { path, id: path, fullPath: `${bucket}/${path}` },
        error: null,
      }),
      getPublicUrl: (path: string) => ({
        data: { publicUrl: `/demo-storage/${bucket}/${encodeURIComponent(path)}` },
        error: null,
      }),
      remove: async () => ({ data: [{ name: '' }], error: null }),
    }),
  };

  return { from, rpc, auth, storage };
}