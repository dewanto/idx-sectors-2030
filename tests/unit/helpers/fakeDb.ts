/**
 * Fake Drizzle query-builder for unit tests — never touches a real database.
 *
 * Identity contract: fixtures are keyed by the REAL table objects exported
 * from `src/db/schema.ts` (`schema.marketIntelScores`, `schema.signals`, …),
 * so a test cannot accidentally wire rows to the wrong table — the mock only
 * matches on the exact object the query builder receives.
 *
 * Wire-up (in a test file):
 *   jest.mock("@/db", () => {
 *     const fake = require("./helpers/fakeDb"); // resolved lazily, mock-safe
 *     return { db: fake.db };
 *   });
 *
 * The builder mirrors the fluent chain used by `src/db/watchlist.ts`:
 *   db.select(…).from(table)[.innerJoin(table, sql…)][.orderBy(…)]  → rows
 *   db.insert(table).values(rows)[.onConflictDoUpdate(…)]           → awaitable
 *   db.delete(table)[.where(…)]                                     → awaitable
 *
 * For joins, supply the already-joined projection rows under the FIRST table
 * of the chain (e.g. `schema.marketIntelScores ⋈ schema.companies` rows go
 * under `schema.marketIntelScores`), because that is the table `.from()` saw.
 */
import * as schema from "@/db/schema";

interface CapturedCall {
  table: unknown;
  values?: unknown;
}

let rowsByTable = new Map<unknown, unknown[]>();

/** insert()/update()/delete() calls captured for assertions. */
export const insertedRows: CapturedCall[] = [];
export const updatedRows: CapturedCall[] = [];
export const deletedTables: unknown[] = [];

/** Re-seed the fake database and clear captured writes. Rows are plain
 *  projection objects shaped like the query's select() projection. */
export function seedFakeDb(rows: Array<[unknown, unknown[]]>): void {
  rowsByTable = new Map(rows);
  insertedRows.length = 0;
  updatedRows.length = 0;
  deletedTables.length = 0;
}

/* Deliberately loose typing: this mirrors drizzle's fluent builder for tests
   only — production code keeps its real types via the actual `@/db` module. */
/* eslint-disable @typescript-eslint/no-explicit-any */
type FakeBuilder = Record<string, any>;

/** Methods that just continue the chain and must stay awaitable. */
const CHAIN_METHODS = [
  "innerJoin",
  "leftJoin",
  "where",
  "orderBy",
  "groupBy",
  "limit",
  "offset",
  "set",
  "values",
  "returning",
  "onConflictDoUpdate",
  "onConflictDoNothing",
] as const;

function makeBuilder(compute: (state: { table?: unknown }) => unknown): FakeBuilder {
  const state: { table?: unknown } = {};
  const builder: FakeBuilder = {};
  builder.from = (table: unknown) => {
    state.table = table;
    return builder;
  };
  for (const method of CHAIN_METHODS) builder[method] = () => builder;
  builder.then = (
    onFulfilled?: (value: unknown) => unknown,
    onRejected?: (error: unknown) => unknown,
  ) =>
    Promise.resolve()
      .then(() => compute(state))
      .then(onFulfilled, onRejected);
  builder.catch = (onRejected: (error: unknown) => unknown) =>
    Promise.resolve()
      .then(() => compute(state))
      .catch(onRejected);
  return builder;
}

export const db = {
  select: (_projection?: unknown): FakeBuilder =>
    makeBuilder((state) => rowsByTable.get(state.table) ?? []),

  insert: (table: unknown): FakeBuilder => {
    const b = makeBuilder(() => []);
    const values = b.values;
    b.values = (rows: unknown) => {
      insertedRows.push({ table, values: rows });
      return values();
    };
    return b;
  },

  update: (table: unknown): FakeBuilder => {
    const b = makeBuilder(() => []);
    const set = b.set;
    b.set = (patch: unknown) => {
      updatedRows.push({ table, values: patch });
      return set();
    };
    return b;
  },

  delete: (table: unknown): FakeBuilder => {
    deletedTables.push(table);
    return makeBuilder(() => []);
  },
};

/** Convenience accessor so tests can assert "the right table was written". */
export const tables = schema;
/* eslint-enable @typescript-eslint/no-explicit-any */