# Тиждень 1. SQL як мова аналітики

Ти вже пишеш SQL для застосунку: `select * from users where id = ?`, insert, update.
Аналітичний SQL — інший спосіб мислення: ти питаєш не «дай рядок», а «порахуй щось по
мільйону рядків». Помилки тут не валять запит, а тихо дають неправильну цифру.

---

## 1. Grain — найважливіше слово тижня

**Grain (зернистість)** — що означає *один рядок* таблиці.

| Таблиця | Grain |
|---|---|
| `orders` | одне замовлення |
| `order_items` | одна позиція (товар) в замовленні |
| `payments` | одна оплата (*має* бути одна на замовлення, але чи так це?) |
| `customers` | один клієнт |

Перед кожним запитом запитуй себе: **який grain у мене на вході і який мені потрібен на
виході?** 80% помилок аналітики виникають через те, що людина не знала grain.

## 2. Fan-out: як join тихо множить гроші

```sql
-- ❌ Хочемо виручку по замовленнях і кількість позицій
select o.order_id, sum(p.amount_uah) as revenue, count(oi.order_item_id) as items
from orders o
join payments p     on p.order_id = o.order_id
join order_items oi on oi.order_id = o.order_id
group by 1;
```

Якщо в замовленні 3 позиції, join з `order_items` перетворює 1 рядок оплати на 3. Тоді
`sum(amount)` множиться на 3. Помилки немає, просто виручка втричі більша.

**Правило:** агрегуй кожну таблицю до потрібного grain *окремо* (у CTE), а потім
з'єднуй таблиці, у яких grain однаковий.

```sql
-- ✅
with pay as (
  select order_id, sum(amount_uah) as revenue from payments group by 1
),
it as (
  select order_id, count(*) as items from order_items group by 1
)
select o.order_id, pay.revenue, it.items
from orders o
left join pay using (order_id)
left join it  using (order_id);
```

## 3. CTE (`with ...`)

Це «змінні» для SQL. Пиши запит зверху вниз, як пайплайн: кожен CTE — один крок
трансформації з одним зрозумілим grain. У dbt (тиждень 4) кожен такий CTE часто
перетворюється на окрему модель.

## 4. NULL — третє значення логіки

- `NULL = NULL` дає не `true`, а `NULL`. Тому `where city = null` нічого не знайде,
  правильно писати `where city is null`.
- `count(*)` рахує рядки, `count(city)` рахує тільки не-NULL значення.
- `avg`, `sum` ігнорують NULL.
- `left join` дає NULL там, де пари немає. Саме цим шукають «клієнтів без замовлень».
- `coalesce(x, 0)` означає «якщо NULL, підстав 0».

## 5. Window functions — головний інструмент аналітика

Звичайний `group by` згортає рядки. Window function рахує по групі, **не згортаючи**:
кожен рядок лишається, а поруч з'являється пораховане значення.

```sql
select
  customer_id,
  order_id,
  created_at,
  row_number() over (partition by customer_id order by created_at) as order_seq,   -- 1, 2, 3… для кожного клієнта
  lag(created_at) over (partition by customer_id order by created_at) as prev_order_at,
  count(*)     over (partition by customer_id) as total_orders_of_customer
from orders;
```

- `partition by` — як `group by`, але без згортання.
- `order by` всередині `over` задає порядок у вікні (потрібен для `row_number`, `lag`,
  накопичувальних сум).
- Основні функції: `row_number`, `rank`, `lag`/`lead`, `sum(...) over (order by ...)`
  (накопичувальна сума), `first_value`.

**Аналогія для фронтендера:** `group by` — це `reduce`, який повертає один об'єкт на
групу. Window function — це `map`, де кожен елемент бачить свою групу.

## 6. Дедуплікація — щоденна робота

Дублікати приходять завжди: повторні вебхуки, перезапуски завантаження, баги
джерела. Стандартний патерн:

```sql
select * from (
  select *, row_number() over (partition by <ключ> order by <що лишити першим>) as rn
  from t
) where rn = 1;
-- у DuckDB/BigQuery/Snowflake є скорочення: qualify row_number() over (...) = 1
```

## 7. Дати

- `date_trunc('month', created_at)` — округлити до місяця, щоб групувати по місяцях.
- `created_at::date` — тільки дата.
- `date_diff('day', a, b)` — різниця в днях (у DuckDB).
- Пастка: місяць, у якому немає жодного замовлення, **не з'явиться** в `group by`.
  Якщо в графіку потрібні всі місяці, генеруй календар (`generate_series`) і роби до
  нього left join.

## 8. Бізнес-визначення — не технічне питання

«Виручка» — це сума оплат? Замовлень? Чи враховувати скасовані й повернені? Тестових
клієнтів? Дубль оплати? **Дата інженер не вгадує, а фіксує визначення письмово.**
У завданнях нижче визначення дані. У житті їх треба питати в клієнта.

---

## Відео (за бажанням, якщо щось не зайшло)

- DataTalksClub Data Engineering Zoomcamp, модуль 1: SQL refresher.
- Mode Analytics «SQL Tutorial», розділ Advanced (window functions). Найкраще
  безкоштовне пояснення window functions.

Далі `tasks.md`.
