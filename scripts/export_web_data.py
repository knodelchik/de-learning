"""Експортує data/raw/*.csv у web/public/data/*.parquet для веб-інтерфейсу (DuckDB-WASM).

  uv run scripts/export_web_data.py
"""

import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "web" / "public" / "data"

if not RAW.exists() or not any(RAW.glob("*.csv")):
    sys.exit("Немає даних. Спершу: uv run scripts/generate_data.py")

OUT.mkdir(parents=True, exist_ok=True)
con = duckdb.connect()
for csv in sorted(RAW.glob("*.csv")):
    target = OUT / f"{csv.stem}.parquet"
    con.execute(
        f"COPY (SELECT * FROM read_csv_auto('{csv}')) TO '{target}' (FORMAT parquet)"
    )
    print(f"{csv.name} -> {target.relative_to(ROOT)}")
