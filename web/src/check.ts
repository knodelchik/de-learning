// Автоперевірка. Кроки 3 і 5–6 алгоритму — чисті функції, без доступу до БД.

export interface Col {
  name: string
  type: string
}

export interface Check {
  rows: number
  columns: string[]
}

export interface CheckResult {
  ok: boolean
  rowCount: number
  expectedRows: number
  rowsOk: boolean
  matched: number
  total: number
}

const NUMERIC = new Set([
  'TINYINT', 'SMALLINT', 'INTEGER', 'BIGINT', 'HUGEINT',
  'UTINYINT', 'USMALLINT', 'UINTEGER', 'UBIGINT', 'UHUGEINT',
  'FLOAT', 'REAL', 'DOUBLE',
])

export const quoteIdent = (n: string) => '"' + n.replace(/"/g, '""') + '"'

// Крок 3: вираз нормалізації для однієї колонки.
export function columnExpr(col: Col): string {
  const c = quoteIdent(col.name)
  const t = col.type.toUpperCase()
  if (NUMERIC.has(t) || t.startsWith('DECIMAL')) return `printf('%.2f', round(${c}::DOUBLE, 2))`
  if (t === 'DATE') return `strftime(${c}, '%Y-%m-%d')`
  if (t.startsWith('TIMESTAMP')) {
    return `CASE WHEN ${c}::TIME = TIME '00:00:00' THEN strftime(${c}::TIMESTAMP, '%Y-%m-%d') ELSE strftime(${c}::TIMESTAMP, '%Y-%m-%d %H:%M:%S') END`
  }
  return `trim(${c}::VARCHAR)`
}

// Крок 3–4: SQL, що повертає всі колонки як рядки k0, k1, ...
export function buildCheckSelect(cols: Col[], q: string): string {
  const exprs = cols.map((c, i) => `coalesce(${columnExpr(c)}, '∅') AS "k${i}"`)
  return `SELECT ${exprs.join(', ')} FROM (${q}\n) _t`
}

// Крок 5 (до хешування): відсортовані за code point значення, з'єднані '\n'.
export function columnKey(values: string[]): string {
  return [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join('\n')
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Крок 6: кількість рядків + мультимножина хешів колонок.
export function evaluate(rowCount: number, studentHashes: string[], ref: Check): CheckResult {
  const pool = [...studentHashes]
  let matched = 0
  for (const h of ref.columns) {
    const i = pool.indexOf(h)
    if (i >= 0) {
      pool.splice(i, 1)
      matched++
    }
  }
  const rowsOk = rowCount === ref.rows
  return {
    ok: rowsOk && matched === ref.columns.length,
    rowCount,
    expectedRows: ref.rows,
    rowsOk,
    matched,
    total: ref.columns.length,
  }
}
