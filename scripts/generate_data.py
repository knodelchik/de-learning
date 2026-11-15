"""Генерує навчальний датасет інтернет-магазину «Комора» у data/raw/.

Дані навмисно «брудні», як у житті: дублікати, NULL-и, різні написання міст,
скасовані й повернені замовлення, тестові акаунти. Детерміновано (seed=42),
тож у всіх однакові результати.

Запуск: uv run scripts/generate_data.py
"""

import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

random.seed(42)
OUT = Path(__file__).resolve().parent.parent / "data" / "raw"
OUT.mkdir(parents=True, exist_ok=True)

START = datetime(2025, 1, 1)
END = datetime(2026, 10, 31)

CITIES = {
    "Київ": ["Київ", "Київ", "Київ", "Kyiv", "київ", " Київ"],
    "Львів": ["Львів", "Львів", "Lviv"],
    "Одеса": ["Одеса", "Одеса", "Odesa"],
    "Харків": ["Харків", "Kharkiv"],
    "Дніпро": ["Дніпро", "Dnipro"],
    "Вінниця": ["Вінниця"],
}
CITY_WEIGHTS = [40, 18, 14, 12, 10, 6]
CHANNELS = ["organic", "google_ads", "instagram", "tiktok", "email", "referral"]
CHANNEL_WEIGHTS = [30, 25, 20, 10, 10, 5]

CATEGORIES = {
    "Кава": (180, 900),
    "Чай": (90, 600),
    "Посуд": (250, 3500),
    "Солодощі": (60, 450),
    "Техніка": (1500, 18000),
}


def rand_date(a: datetime, b: datetime) -> datetime:
    return a + timedelta(seconds=random.randint(0, int((b - a).total_seconds())))


def write(name: str, header: list[str], rows: list[list]) -> None:
    with open(OUT / f"{name}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"{name}.csv: {len(rows)} рядків")


# --- products ---
products = []
pid = 1
for cat, (lo, hi) in CATEGORIES.items():
    for i in range(random.randint(20, 40)):
        price = round(random.uniform(lo, hi), -1)
        products.append([pid, f"{cat} #{i + 1:03d}", cat, price, random.random() > 0.08])
        pid += 1
write("products", ["product_id", "name", "category", "price_uah", "is_active"], products)

# --- customers ---
customers = []
for cid in range(1, 3001):
    city_key = random.choices(list(CITIES), CITY_WEIGHTS)[0]
    city = random.choice(CITIES[city_key]) if random.random() > 0.04 else None
    signup = rand_date(START, END - timedelta(days=5))
    email = f"user{cid}@example.com"
    if random.random() < 0.01:
        email = f"test{cid}@komora.test"  # тестові акаунти розробників
    customers.append([cid, email, city, random.choices(CHANNELS, CHANNEL_WEIGHTS)[0],
                      signup.strftime("%Y-%m-%d %H:%M:%S")])
write("customers", ["customer_id", "email", "city", "acquisition_channel", "signed_up_at"], customers)

# --- orders, order_items, payments ---
orders, items, payments = [], [], []
oid = 1
item_id = 1
pay_id = 1
for c in customers:
    cid, signup = c[0], datetime.strptime(c[4], "%Y-%m-%d %H:%M:%S")
    n = random.choices([0, 1, 2, 3, 5, 8, 15], [25, 30, 18, 12, 8, 5, 2])[0]
    for _ in range(n):
        created = rand_date(signup, END)
        status = random.choices(["delivered", "cancelled", "refunded", "shipped"], [82, 9, 4, 5])[0]
        orders.append([oid, cid, created.strftime("%Y-%m-%d %H:%M:%S"), status])
        total = 0.0
        for p in random.sample(products, random.choices([1, 2, 3, 4], [50, 30, 15, 5])[0]):
            qty = random.choices([1, 2, 3], [75, 20, 5])[0]
            unit = p[3] * random.choice([1, 1, 1, 0.9, 0.8])  # знижки
            items.append([item_id, oid, p[0], qty, round(unit, 2)])
            total += qty * unit
            item_id += 1
        if status != "cancelled":
            paid = created + timedelta(minutes=random.randint(1, 120))
            payments.append([pay_id, oid, round(total, 2), random.choice(["card", "card", "apple_pay", "cod"]),
                             paid.strftime("%Y-%m-%d %H:%M:%S")])
            pay_id += 1
            if random.random() < 0.015:  # дубль вебхука платіжки
                payments.append([pay_id, oid, round(total, 2), payments[-1][3], payments[-1][4]])
                pay_id += 1
        oid += 1

random.shuffle(orders)
write("orders", ["order_id", "customer_id", "created_at", "status"], orders)
write("order_items", ["order_item_id", "order_id", "product_id", "quantity", "unit_price_uah"], items)
write("payments", ["payment_id", "order_id", "amount_uah", "method", "paid_at"], payments)
