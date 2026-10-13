/**
 * A table-aware stand-in for the Supabase client.
 *
 * Every query-builder method returns the same thenable builder, so any chain the
 * code under test writes (`.from('X').select().eq().order().limit()` ...) works,
 * and awaiting it — or calling `.single()` / `.maybeSingle()` — resolves with
 * whatever the test's handler returns for that query.
 *
 *   const sb = createSupabaseMock();
 *   sb.handle(({ table, op }) => (table === 'Rule' && op === 'select' ? { data: [rule] } : undefined));
 *
 * A handler that returns `undefined` falls through to the next handler; with none
 * left the query resolves to `{ data: [], error: null }` (or `data: null` for
 * `.single()`/`.maybeSingle()`), i.e. "no rows".
 */

import { vi } from 'vitest';

export type Op = 'select' | 'insert' | 'update' | 'upsert' | 'delete' | 'rpc';

export interface QueryContext {
  table: string;
  op: Op;
  /** Columns passed to the *first* select(); '*' if none. */
  columns: string;
  /** Every `.eq/.neq/.in/.is/.not/.or` call, as [method, column, value]. */
  filters: Array<[string, string, unknown]>;
  payload?: unknown;
  single: boolean;
  limit?: number;
  order?: Array<[string, unknown]>;
}

export interface Result {
  data?: unknown;
  error?: unknown;
}

export type Handler = (ctx: QueryContext) => Result | undefined | Promise<Result | undefined>;

/** The fluent query builder; filter methods (eq, in, ...) are attached dynamically. */
interface Builder extends PromiseLike<{ data: unknown; error: unknown }> {
  select(columns?: string): Builder;
  order(column: string, opts?: unknown): Builder;
  limit(n: number): Builder;
  single(): Builder;
  maybeSingle(): Builder;
  [filter: string]: unknown;
}

export function createSupabaseMock() {
  const handlers: Handler[] = [];
  const calls: QueryContext[] = [];

  async function resolve(ctx: QueryContext): Promise<{ data: unknown; error: unknown }> {
    calls.push(ctx);
    for (let i = handlers.length - 1; i >= 0; i--) {
      const result = await handlers[i](ctx);
      if (result !== undefined) return { data: result.data ?? null, error: result.error ?? null };
    }
    return { data: ctx.single ? null : [], error: null };
  }

  function makeBuilder(table: string, op: Op, payload?: unknown) {
    const ctx: QueryContext = { table, op, columns: '*', filters: [], payload, single: false };
    let selectedOnce = false;
    // The real client's builder is fluent: every method hands back the same object.
    const builder = {} as Builder;

    builder.select = (columns?: string) => {
      if (!selectedOnce && op === 'select') ctx.columns = columns ?? '*';
      selectedOnce = true;
      return builder;
    };
    for (const m of ['eq', 'neq', 'in', 'is', 'not', 'or', 'gt', 'gte', 'lt', 'lte', 'ilike', 'like', 'contains']) {
      builder[m] = (column: string, ...rest: unknown[]) => {
        ctx.filters.push([m, column, rest.length > 1 ? rest : rest[0]]);
        return builder;
      };
    }
    builder.order = (column: string, opts?: unknown) => {
      (ctx.order ||= []).push([column, opts]);
      return builder;
    };
    builder.limit = (n: number) => {
      ctx.limit = n;
      return builder;
    };
    builder.single = () => {
      ctx.single = true;
      return builder;
    };
    builder.maybeSingle = builder.single;
    builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      resolve(ctx).then(onFulfilled, onRejected);
    return builder;
  }

  // Storage: spies with working defaults; tests override per case with mockResolvedValueOnce etc.
  const storage = {
    upload: vi.fn(),
    download: vi.fn(),
    remove: vi.fn(),
    createSignedUrl: vi.fn(),
    getPublicUrl: vi.fn(),
    from: vi.fn(),
  };
  const installStorageDefaults = () => {
    storage.upload.mockImplementation(async (path: string) => ({ data: { path }, error: null }));
    storage.download.mockImplementation(async () => ({ data: new Blob(['file bytes']), error: null }));
    storage.remove.mockImplementation(async () => ({ data: [], error: null }));
    storage.createSignedUrl.mockImplementation(async (path: string) => ({
      data: { signedUrl: `https://signed.example/${path}?token=t` },
      error: null,
    }));
    storage.getPublicUrl.mockImplementation((path: string) => ({
      data: { publicUrl: `https://public.example/${path}` },
    }));
    storage.from.mockImplementation(() => storage);
  };
  installStorageDefaults();

  const client = {
    from: (table: string) => ({
      select: (columns?: string) => makeBuilder(table, 'select').select(columns),
      insert: (payload: unknown) => makeBuilder(table, 'insert', payload),
      update: (payload: unknown) => makeBuilder(table, 'update', payload),
      upsert: (payload: unknown) => makeBuilder(table, 'upsert', payload),
      delete: () => makeBuilder(table, 'delete'),
    }),
    rpc: (name: string, args?: unknown) => makeBuilder(`rpc:${name}`, 'rpc', args),
    storage,
  };

  return {
    client,
    calls,
    /** The storage spies (`upload`, `download`, ...) behind `client.storage.from(bucket)`. */
    storage,
    /** Add a handler; later handlers take precedence over earlier ones. */
    handle(handler: Handler) {
      handlers.push(handler);
    },
    /** Forget handlers and recorded calls, and restore the default storage behaviour. */
    reset() {
      handlers.length = 0;
      calls.length = 0;
      for (const spy of Object.values(storage)) spy.mockReset();
      installStorageDefaults();
    },
    /** Recorded calls matching a table (and optionally an op). */
    callsFor(table: string, op?: Op) {
      return calls.filter((c) => c.table === table && (!op || c.op === op));
    },
  };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;
