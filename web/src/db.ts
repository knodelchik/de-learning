import * as duckdb from '@duckdb/duckdb-wasm'
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import { buildCheckSelect, columnKey, evaluate, sha256Hex, type Check, type CheckResult, type Col } from './check'

const TABLES = ['customers', 'products', 'orders', 'order_items', 'payments']
export const MAX_ROWS = 200

let connPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null

export function getConn(): Promise<duckdb.AsyncDuckDBConnection> {
  if (!connPromise) connPromise = boot()
  return connPromise
}

async function boot(): Promise<duckdb.AsyncDuckDBConnection> {
  const bundle = await duckdb.selectBundle({
    mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
    eh: { mainModule: ehWasm, mainWorker: ehWorker },
  })
  const worker = new Worker(bundle.mainWorker!)
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  const conn = await db.connect()
  for (const t of TABLES) {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${t}.parquet`)
    if (!res.ok) throw new Error(`Не вдалося завантажити ${t}.parquet (${res.status}). Запусти: uv run scripts/export_web_data.py`)
    await db.registerFileBuffer(`${t}.parquet`, new Uint8Array(await res.arrayBuffer()))
    await conn.query(`CREATE VIEW ${t} AS SELECT * FROM read_parquet('${t}.parquet')`)
  }
  return conn
}

// Крок 1: розбиття по `;`, без порожніх шматків і шматків лише з коментарів.
export function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.split('\n').some((l) => l.trim() !== '' && !l.trim().startsWith('--')))
}

export interface QueryResult {
  columns: Col[]
  rows: (string | null)[][]
  total: number
  ms: number
  last: string
}

function fmt(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x))
  return String(v)
}

export async function runSql(sql: string): Promise<QueryResult> {
  const conn = await getConn()
  const stmts = splitStatements(sql)
  if (!stmts.length) throw new Error('Порожній запит')
  const t0 = performance.now()
  for (const s of stmts.slice(0, -1)) await conn.query(s)
  const last = stmts[stmts.length - 1]

  let ok = true
  try {
    await conn.query(`CREATE OR REPLACE TEMP TABLE _res AS ${last}\n`)
  } catch {
    ok = false
  }
  if (ok) {
    const desc = await conn.query('DESCRIBE _res')
    const columns: Col[] = desc.toArray().map((r) => ({ name: String(r.column_name), type: String(r.column_type) }))
    const total = Number((await conn.query('SELECT count(*) AS n FROM _res')).getChildAt(0)!.get(0))
    const sel = columns.map((c) => `"${c.name.replace(/"/g, '""')}"::VARCHAR`).join(', ')
    const t = await conn.query(`SELECT ${sel} FROM _res LIMIT ${MAX_ROWS}`)
    const rows: (string | null)[][] = []
    for (let r = 0; r < t.numRows; r++) rows.push(columns.map((_c, i) => fmt(t.getChildAt(i)!.get(r))))
    return { columns, rows, total, ms: performance.now() - t0, last }
  }

  // Не SELECT (або помилка): виконуємо як є, щоб отримати справжнє повідомлення.
  const t = await conn.query(last)
  const columns: Col[] = t.schema.fields.map((f) => ({ name: f.name, type: String(f.type) }))
  const rows: (string | null)[][] = []
  for (let r = 0; r < Math.min(t.numRows, MAX_ROWS); r++) rows.push(columns.map((_c, i) => fmt(t.getChildAt(i)!.get(r))))
  return { columns, rows, total: t.numRows, ms: performance.now() - t0, last }
}

export async function runCheck(last: string, ref: Check): Promise<CheckResult> {
  const conn = await getConn()
  const desc = await conn.query(`DESCRIBE SELECT * FROM (${last}\n) _t`)
  const cols: Col[] = desc.toArray().map((r) => ({ name: String(r.column_name), type: String(r.column_type) }))
  const t = await conn.query(buildCheckSelect(cols, last))
  const hashes: string[] = []
  for (let i = 0; i < cols.length; i++) {
    const values: string[] = []
    const col = t.getChildAt(i)!
    for (let r = 0; r < t.numRows; r++) values.push(String(col.get(r)))
    hashes.push(await sha256Hex(columnKey(values)))
  }
  return evaluate(t.numRows, hashes, ref)
}
