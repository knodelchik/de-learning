"""Запускає SQL-файл (або рядок) у DuckDB поверх data/raw/*.csv і друкує результат.

Таблиці customers, products, orders, order_items, payments доступні одразу.

  uv run scripts/sql.py weeks/01-sql/solutions/task01.sql
  uv run scripts/sql.py "select count(*) from orders"
"""

import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"

if not RAW.exists() or not any(RAW.glob("*.csv")):
    sys.exit("Немає даних. Спершу: uv run scripts/generate_data.py")

con = duckdb.connect()
for csv in sorted(RAW.glob("*.csv")):
    con.execute(f"create view {csv.stem} as select * from read_csv_auto('{csv}')")

arg = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
query = Path(arg).read_text() if arg.endswith(".sql") else arg

for stmt in [s for s in query.split(";") if s.strip() and not all(
        line.strip().startswith("--") or not line.strip() for line in s.splitlines())]:
    con.sql(stmt).show(max_rows=40, max_width=200)
