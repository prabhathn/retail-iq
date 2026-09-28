#!/usr/bin/env python
"""
RetailIQ - Extended data model builder.

WHY THIS EXISTS
---------------
The original synthetic data is a sales star schema. This script layers the rest
of a retail model on top of it - calendar, vendors, promotions, inventory,
purchase orders and retail-media delivery - and enriches the existing
dimensions (cost, store attributes, home store, time of day, channel).

HOW IT STAYS CONSISTENT - read before editing
---------------------------------------------
1. It DERIVES, it does not regenerate. Products, stores, shoppers and every
   transaction are kept; new attributes are computed from them, so dashboards,
   IDs and gross revenue do not move.

2. It is deterministic and re-runnable. Attributes come from HASH() of stable
   keys and the simulations use a fixed seed, so running it twice gives the
   same answer. The admin data top-up calls refresh() after appending days so
   the new days get the same treatment.

3. The facts tell one story:
   - Promotions are real windows per UPC. Line discounts are rewritten from the
     promotion that was running that day (quantity and price are untouched, so
     gross revenue is unchanged).
   - Inventory depletes with the actual daily sales and is replenished by the
     purchase orders this script places, so on_hand(d) = max(0, on_hand(d-1) +
     received(d) - sold(d)). Clamping at zero stands in for the negative book
     stock real retailers see when a sale is scanned without recorded stock.
   - Retail-media delivery is generated for the demo campaigns, and the lifetime
     totals on the Postgres campaign rows are then set to the daily sums. The
     Postgres mirror carries them back into Snowflake.

4. Roles. Structure is created as ACCOUNTADMIN (retailiq_data_model.sql).
   Data is read and written as RETAILIQ_ROLE_ADMIN, because the row access
   policies compare CURRENT_ROLE() with ROLE_ENTITLEMENTS and would otherwise
   hide every row - including from the table owner.

USAGE
-----
    python -m scripts.extend_data_model            # build / rebuild everything
    python -m scripts.extend_data_model --skip-ddl # data only

Reads the same .env as the application.
"""

import argparse
import json
import math
import os
import re
import sys
import time
from datetime import date, datetime, timedelta

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from snowflake.connector.pandas_tools import write_pandas

load_dotenv()

from scripts.generate_synthetic_data import get_connection  # noqa: E402

DATA_ROLE = os.getenv("RETAILIQ_ANCHOR_PROBE_ROLE", "RETAILIQ_ROLE_ADMIN")
MIRROR_NAME = "retailiq_app"
DDL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "retailiq_data_model.sql")
SEED = 20260928

# ----------------------------------------------------------------------------
# Reference attributes
# ----------------------------------------------------------------------------

# store_id: (city, state, lat, lon, square_feet, zip3, open_date or None)
# None means the store opened when the data history starts, so it is not yet a
# comparable store (comp status needs 13 full months of trading).
STORE_ATTRS = {
    "STR001": ("Boston", "MA", 42.3601, -71.0589, 38000, "021", date(2009, 4, 1)),
    "STR002": ("Stamford", "CT", 41.0534, -73.5387, 52000, "069", date(2012, 9, 15)),
    "STR003": ("Alpharetta", "GA", 34.0754, -84.2941, 56000, "300", date(2015, 3, 1)),
    "STR004": ("Charleston", "SC", 32.7765, -79.9311, 34000, "294", date(2011, 6, 1)),
    "STR005": ("Dubuque", "IA", 42.5006, -90.6646, 24000, "520", date(2004, 8, 1)),
    "STR006": ("Evanston", "IL", 42.0451, -87.6877, 48000, "602", date(2013, 11, 1)),
    "STR007": ("Phoenix", "AZ", 33.4484, -112.0740, 36000, "850", date(2016, 2, 1)),
    "STR008": ("Henderson", "NV", 36.0395, -114.9817, 58000, "890", date(2018, 5, 1)),
    "STR009": ("San Francisco", "CA", 37.7925, -122.4382, 30000, "941", date(2010, 10, 1)),
    "STR010": ("Irvine", "CA", 33.6846, -117.8265, 54000, "926", date(2017, 7, 1)),
    "STR011": ("Philadelphia", "PA", 39.9526, -75.1652, 40000, "191", date(2008, 3, 1)),
    "STR012": ("New Orleans", "LA", 29.9287, -90.0840, 33000, "701", date(2014, 4, 1)),
    "STR013": ("Salina", "KS", 38.8403, -97.6114, 22000, "674", date(2006, 9, 1)),
    "STR014": ("Santa Fe", "NM", 35.6870, -105.9378, 26000, "875", None),
    "STR015": ("Seattle", "WA", 47.6062, -122.3321, 42000, "981", None),
}

STORE_FORMATS = {"Urban": "Urban Market", "Suburban": "Supermarket", "Rural": "Neighborhood Market"}

# Cost as a share of shelf price by category (grocery-typical gross margins).
COST_RATIO = {
    "Produce": 0.60, "Dairy": 0.72, "Bakery": 0.58, "Meat & Seafood": 0.70, "Frozen": 0.65,
    "Beverages": 0.63, "Snacks": 0.57, "Pantry": 0.64, "Household": 0.67, "Health & Beauty": 0.55,
}

# Retail-media placements: base daily impressions, click-through rate,
# conversion rate, and pricing (CPC for search, CPM otherwise).
PLACEMENTS = {
    "onsite_search": {"imps": 18000, "ctr": 0.018, "cvr": 0.11, "cpc": 0.70},
    "onsite_display": {"imps": 32000, "ctr": 0.0045, "cvr": 0.06, "cpm": 8.0},
    "offsite_social": {"imps": 55000, "ctr": 0.009, "cvr": 0.035, "cpm": 10.0},
    "offsite_programmatic": {"imps": 42000, "ctr": 0.0018, "cvr": 0.03, "cpm": 6.5},
}
PLACEMENTS_BY_TYPE = {
    "sponsored_listing": ["onsite_search"],
    "display_ad_onsite": ["onsite_display"],
    "display_ad_offsite": ["offsite_social", "offsite_programmatic"],
}


def _log(stage, pct, detail, progress_cb):
    print(f"[{pct:3d}%] {stage} {detail}".rstrip(), flush=True)
    if progress_cb:
        progress_cb(stage, pct, detail)


# ----------------------------------------------------------------------------
# Structure
# ----------------------------------------------------------------------------

def run_ddl():
    """Run retailiq_data_model.sql statement by statement as ACCOUNTADMIN.

    Attaching a row access policy is not idempotent, so "already attached"
    errors on re-runs are expected and skipped.
    """
    sql = open(DDL_FILE, encoding="utf-8").read()
    # Drop full-line comments and trailing "-- ..." comments (the file never uses
    # "--" inside a string literal), then split on statement-ending semicolons.
    lines = [re.sub(r"\s--\s.*$", "", line) for line in sql.splitlines() if not line.strip().startswith("--")]
    statements = [s.strip() for s in re.split(r";\s*(?:\n|$)", "\n".join(lines)) if s.strip()]

    conn = get_connection()
    cur = conn.cursor()
    try:
        for stmt in statements:
            try:
                cur.execute(stmt)
            except Exception as exc:  # noqa: BLE001
                if "ADD ROW ACCESS POLICY" in stmt.upper() and "already" in str(exc).lower():
                    continue
                raise
    finally:
        cur.close()
        conn.close()
    return len(statements)


# ----------------------------------------------------------------------------
# Calendar
# ----------------------------------------------------------------------------

def _fiscal_year_start(year):
    """Sunday nearest February 1 (NRF 4-5-4 convention)."""
    feb1 = date(year, 2, 1)
    since_sunday = (feb1.weekday() + 1) % 7
    return feb1 - timedelta(days=since_sunday) if since_sunday <= 3 else feb1 + timedelta(days=7 - since_sunday)


def _nth_weekday(year, month, weekday, n):
    d = date(year, month, 1)
    d += timedelta(days=(weekday - d.weekday()) % 7)
    return d + timedelta(weeks=n - 1)


def _last_weekday(year, month, weekday):
    d = date(year, month + 1, 1) - timedelta(days=1) if month < 12 else date(year, 12, 31)
    return d - timedelta(days=(d.weekday() - weekday) % 7)


def _holidays(year):
    thanksgiving = _nth_weekday(year, 11, 3, 4)
    return {
        date(year, 1, 1): "New Year's Day",
        _nth_weekday(year, 2, 6, 2): "Super Bowl Sunday",
        date(year, 2, 14): "Valentine's Day",
        _nth_weekday(year, 5, 6, 2): "Mother's Day",
        _last_weekday(year, 5, 0): "Memorial Day",
        date(year, 7, 4): "Independence Day",
        _nth_weekday(year, 9, 0, 1): "Labor Day",
        date(year, 10, 31): "Halloween",
        thanksgiving: "Thanksgiving",
        thanksgiving + timedelta(days=1): "Black Friday",
        date(year, 12, 24): "Christmas Eve",
        date(year, 12, 25): "Christmas Day",
        date(year, 12, 31): "New Year's Eve",
    }


def build_dim_date(start, end):
    # 4-5-4: each quarter is periods of 4, 5 and 4 weeks. A 53rd week joins period 12.
    period_of_week = []
    for weeks in [4, 5, 4] * 4:
        period_of_week += [len(set(period_of_week)) + 1] * weeks

    holidays = {}
    for y in range(start.year - 1, end.year + 2):
        holidays.update(_holidays(y))

    rows = []
    d = start
    while d <= end:
        fy = d.year if d >= _fiscal_year_start(d.year) else d.year - 1
        fy_start = _fiscal_year_start(fy)
        week = (d - fy_start).days // 7 + 1
        period = period_of_week[min(week, 52) - 1]
        rows.append({
            "CALENDAR_DATE": d,
            "DAY_NAME": d.strftime("%A"),
            "DAY_OF_WEEK": (d.weekday() + 1) % 7,
            "IS_WEEKEND": d.weekday() >= 5,
            "CALENDAR_MONTH": d.month,
            "CALENDAR_YEAR": d.year,
            "FISCAL_YEAR": fy,
            "FISCAL_QUARTER": (period - 1) // 3 + 1,
            "FISCAL_PERIOD": period,
            "FISCAL_WEEK": week,
            "FISCAL_WEEK_START": fy_start + timedelta(weeks=week - 1),
            "IS_HOLIDAY": d in holidays,
            "HOLIDAY_NAME": holidays.get(d),
            "SAME_DAY_LAST_YEAR": d - timedelta(days=364),
        })
        d += timedelta(days=1)
    return pd.DataFrame(rows)


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------

def _replace(conn, cur, table, df):
    cur.execute(f"TRUNCATE TABLE {table}")
    if df.empty:
        return 0
    ok, _, nrows, _ = write_pandas(conn, df, table, auto_create_table=False, overwrite=False)
    if not ok:
        raise RuntimeError(f"write_pandas failed for {table}")
    return nrows


def _bounds(cur):
    cur.execute("SELECT MIN(transaction_date), MAX(transaction_date) FROM transactions")
    mn, mx = cur.fetchone()
    if mn is None:
        raise RuntimeError(f"transactions is empty or invisible to {DATA_ROLE}")
    return mn, mx


# ----------------------------------------------------------------------------
# Dimensions and sales enrichment
# ----------------------------------------------------------------------------

def enrich_dimensions(cur, mn):
    cost_case = " ".join(f"WHEN '{c}' THEN {r}" for c, r in COST_RATIO.items())
    cur.execute("UPDATE products p SET vendor_id = vb.vendor_id FROM vendor_brands vb WHERE vb.brand = p.brand")
    cur.execute(f"""
        UPDATE products SET
            unit_cost = ROUND(price * (CASE category {cost_case} ELSE 0.65 END
                                       + MOD(ABS(HASH(upc, 'cost')), 9) / 100.0), 2),
            pack_size = COALESCE(REGEXP_SUBSTR(product_name, '[0-9]+ ?(ct|pk|oz|lb|ft|Gallon)'), 'each'),
            launch_date = DATEADD(day, -(365 + MOD(ABS(HASH(upc, 'launch')), 2500)), '{mn}'::DATE)
    """)

    values = ",\n".join(
        f"('{sid}', '{city}', '{st}', {lat}, {lon}, {sqft}, "
        f"{('DATE ' + repr(str(od))) if od else 'NULL'})"
        for sid, (city, st, lat, lon, sqft, _zip, od) in STORE_ATTRS.items()
    )
    fmt_case = " ".join(f"WHEN '{t}' THEN '{f}'" for t, f in STORE_FORMATS.items())
    cur.execute(f"""
        UPDATE stores s SET
            city = v.city, state = v.state, latitude = v.lat, longitude = v.lon,
            square_feet = v.sqft,
            store_format = CASE s.store_type {fmt_case} END,
            open_date = COALESCE(v.open_date, '{mn}'::DATE),
            comp_start_date = DATEADD(month, 13, COALESCE(v.open_date, '{mn}'::DATE))
        FROM (SELECT column1 store_id, column2 city, column3 state, column4 lat, column5 lon,
                     column6 sqft, column7 open_date
              FROM VALUES {values}) v
        WHERE v.store_id = s.store_id
    """)

    zip_values = ", ".join(f"('{sid}', '{a[5]}')" for sid, a in STORE_ATTRS.items())
    # Home store = the store a shopper visits most. Loyalty enrolment is spread
    # over four years before the history plus its first six months, so some
    # members join mid-history (pre/post enrolment analysis).
    cur.execute(f"""
        UPDATE shoppers s SET
            home_store_id = h.store_id,
            zip3 = z.zip3,
            loyalty_enroll_date = IFF(s.loyalty_member,
                DATEADD(day, 180 - MOD(ABS(HASH(s.shopper_id, 'enroll')), 1640), '{mn}'::DATE), NULL)
        FROM (SELECT shopper_id, store_id FROM transactions GROUP BY shopper_id, store_id
              QUALIFY ROW_NUMBER() OVER (PARTITION BY shopper_id ORDER BY COUNT(*) DESC, store_id) = 1) h
        JOIN (SELECT column1 store_id, column2 zip3 FROM VALUES {zip_values}) z ON z.store_id = h.store_id
        WHERE h.shopper_id = s.shopper_id
    """)


def enrich_transactions(cur):
    # Two shopping peaks (late morning, early evening) plus a flat tail from 7am
    # to 10pm; 85% in store, 10% pickup, 5% delivery.
    cur.execute("""
        UPDATE transactions SET
            transaction_ts = TIMESTAMPADD(minute,
                60 * CASE
                    WHEN MOD(ABS(HASH(transaction_id, 'hr')), 100) < 45 THEN 10 + MOD(ABS(HASH(transaction_id, 'h2')), 5)
                    WHEN MOD(ABS(HASH(transaction_id, 'hr')), 100) < 85 THEN 16 + MOD(ABS(HASH(transaction_id, 'h2')), 4)
                    ELSE 7 + MOD(ABS(HASH(transaction_id, 'h2')), 15)
                END + MOD(ABS(HASH(transaction_id, 'mi')), 60),
                transaction_date::TIMESTAMP_NTZ),
            channel = CASE
                WHEN MOD(ABS(HASH(transaction_id, 'ch')), 100) < 85 THEN 'in_store'
                WHEN MOD(ABS(HASH(transaction_id, 'ch')), 100) < 95 THEN 'pickup'
                ELSE 'delivery'
            END
    """)
    cur.execute("UPDATE transaction_items ti SET unit_cost = p.unit_cost FROM products p WHERE p.upc = ti.upc")


# ----------------------------------------------------------------------------
# Promotions
# ----------------------------------------------------------------------------

def build_promotions(cur, mn, mx):
    """Two-week promotion windows every 13 weeks per UPC (~15% of days, the same
    share of discounted lines the original generator produced), then re-derive
    every line's discount from the promotion running that day."""
    cur.execute(f"""
        INSERT OVERWRITE INTO promotions
        WITH k AS (SELECT SEQ4() - 1 AS k FROM TABLE(GENERATOR(ROWCOUNT => 12))),
        w AS (
            SELECT p.upc, p.brand, p.category,
                   DATEADD(day, MOD(ABS(HASH(p.upc, 'promo')), 91) + 91 * k.k, '{mn}'::DATE) AS start_date
            FROM products p CROSS JOIN k
        ),
        t AS (
            SELECT w.*, DATEADD(day, 13, start_date) AS end_date,
                   MOD(ABS(HASH(upc, start_date, 'type')), 100) AS t_hash,
                   MOD(ABS(HASH(upc, start_date, 'pct')), 5) AS p_hash,
                   MOD(ABS(HASH(upc, start_date, 'fund')), 100) AS f_hash
            FROM w
            WHERE start_date <= '{mx}'::DATE
        )
        SELECT 'PRM' || upc || '_' || TO_CHAR(start_date, 'YYYYMMDD'),
               brand || ' ' || CASE WHEN t_hash < 50 THEN 'Price Cut' WHEN t_hash < 70 THEN 'Digital Coupon'
                                    WHEN t_hash < 90 THEN 'Loyalty Price' ELSE 'BOGO' END
                     || ' ' || TO_CHAR(start_date, 'Mon DD'),
               CASE WHEN t_hash < 50 THEN 'TPR' WHEN t_hash < 70 THEN 'DIGITAL_COUPON'
                    WHEN t_hash < 90 THEN 'LOYALTY_PRICE' ELSE 'BOGO' END,
               upc, brand, category, start_date, end_date,
               CASE WHEN t_hash >= 90 THEN 0.25 ELSE 0.10 + 0.05 * p_hash END,
               IFF(f_hash < 60, 'vendor', 'retailer')
        FROM t
    """)
    # Loyalty prices only apply to loyalty members; everyone else pays shelf price.
    cur.execute("""
        UPDATE transaction_items ti SET
            discount = IFF(m.promotion_id IS NULL, 0, ROUND(ti.unit_price * m.discount_pct, 2)),
            promotion_id = m.promotion_id
        FROM (
            SELECT ti2.item_id, pr.promotion_id, pr.discount_pct
            FROM transaction_items ti2
            JOIN transactions t ON t.transaction_id = ti2.transaction_id
            JOIN shoppers s ON s.shopper_id = t.shopper_id
            LEFT JOIN promotions pr
              ON pr.upc = ti2.upc
             AND t.transaction_date BETWEEN pr.start_date AND pr.end_date
             AND (pr.promotion_type <> 'LOYALTY_PRICE' OR s.loyalty_member)
        ) m
        WHERE m.item_id = ti.item_id
    """)
    cur.execute("SELECT COUNT(*) FROM promotions")
    return cur.fetchone()[0]


# ----------------------------------------------------------------------------
# Inventory and purchase orders
# ----------------------------------------------------------------------------

def simulate_inventory(cur, mn, mx):
    """Daily order-up-to replenishment per store x UPC against actual sales.

    Reorder when on hand + on order falls below (lead time + 2) days of trailing
    demand, ordering up to (lead time + 10) days in cases of 6. Deliveries are
    usually on time and complete; the late and short ones are what create
    out-of-stocks.
    """
    rng = np.random.default_rng(SEED)
    dates = [mn + timedelta(days=i) for i in range((mx - mn).days + 1)]
    n_days = len(dates)

    cur.execute("""
        SELECT p.upc, p.vendor_id, p.unit_cost, v.lead_time_days
        FROM products p JOIN vendors v ON v.vendor_id = p.vendor_id
    """)
    prod = pd.DataFrame(cur.fetchall(), columns=["UPC", "VENDOR_ID", "UNIT_COST", "LEAD"])
    cur.execute("SELECT store_id FROM stores ORDER BY store_id")
    stores = [r[0] for r in cur.fetchall()]

    series = pd.MultiIndex.from_product([stores, prod["UPC"]], names=["STORE_ID", "UPC"])
    n = len(series)
    lead = np.tile(prod["LEAD"].to_numpy(dtype=int), len(stores))
    vendor = np.tile(prod["VENDOR_ID"].to_numpy(), len(stores))
    cost = np.tile(prod["UNIT_COST"].astype(float).to_numpy(), len(stores))

    cur.execute("""
        SELECT t.store_id, ti.upc, t.transaction_date, SUM(ti.quantity)
        FROM transaction_items ti JOIN transactions t ON t.transaction_id = ti.transaction_id
        GROUP BY 1, 2, 3
    """)
    sales = pd.DataFrame(cur.fetchall(), columns=["STORE_ID", "UPC", "D", "Q"])
    sold = np.zeros((n, n_days), dtype=np.int64)
    s_idx = series.get_indexer(pd.MultiIndex.from_frame(sales[["STORE_ID", "UPC"]]))
    d_idx = np.array([(d - mn).days for d in sales["D"]])
    sold[s_idx, d_idx] = sales["Q"].to_numpy(dtype=np.int64)

    cumsum = np.concatenate([np.zeros((n, 1)), np.cumsum(sold, axis=1)], axis=1)
    window = np.minimum(np.arange(1, n_days + 1), 28)
    avg = (cumsum[:, 1:] - cumsum[:, np.maximum(np.arange(1, n_days + 1) - 28, 0)]) / window
    avg = np.maximum(avg, 0.05)

    horizon = n_days + 16
    arrive_recv = np.zeros((n, horizon), dtype=np.int64)
    arrive_ord = np.zeros((n, horizon), dtype=np.int64)
    on_hand = np.ceil(avg[:, min(27, n_days - 1)] * (lead + 7)).astype(np.int64)
    on_order = np.zeros(n, dtype=np.int64)

    inv = {k: np.zeros((n, n_days)) for k in ("recv", "oh", "oo")}
    orders = []

    for d in range(n_days):
        received = arrive_recv[:, d]
        on_order -= arrive_ord[:, d]
        on_hand = np.maximum(on_hand + received - sold[:, d], 0)

        rop = avg[:, d] * (lead + 2)
        need = np.nonzero(on_hand + on_order < rop)[0]
        if need.size:
            target = avg[need, d] * (lead[need] + 10)
            qty = (np.ceil(np.maximum(target - on_hand[need] - on_order[need], 1) / 6) * 6).astype(np.int64)
            delay = rng.choice([-1, 0, 1, 2, 3], size=need.size, p=[0.05, 0.75, 0.12, 0.05, 0.03])
            arrive = d + np.maximum(lead[need] + delay, 1)
            short = rng.random(need.size) >= 0.92
            got = np.where(short, np.floor(qty * rng.uniform(0.7, 0.95, need.size)), qty).astype(np.int64)
            arrive_recv[need, arrive] += got
            arrive_ord[need, arrive] += qty
            on_order[need] += qty
            orders.append(pd.DataFrame({
                "S": need, "ORDER_D": d, "PROMISED_D": d + lead[need], "ARRIVE_D": arrive,
                "ORDERED_UNITS": qty, "RECEIVED_UNITS": got,
            }))

        inv["recv"][:, d] = received
        inv["oh"][:, d] = on_hand
        inv["oo"][:, d] = on_order

    store_col = np.repeat(series.get_level_values(0).to_numpy(), n_days)
    upc_col = np.repeat(series.get_level_values(1).to_numpy(), n_days)
    date_col = np.tile(np.array(dates, dtype=object), n)
    oh = inv["oh"].ravel().astype(np.int64)
    inventory_df = pd.DataFrame({
        "SNAPSHOT_DATE": date_col,
        "STORE_ID": store_col,
        "UPC": upc_col,
        "UNITS_SOLD": sold.ravel(),
        "UNITS_RECEIVED": inv["recv"].ravel().astype(np.int64),
        "ON_HAND_UNITS": oh,
        "ON_ORDER_UNITS": inv["oo"].ravel().astype(np.int64),
        "IS_OUT_OF_STOCK": oh == 0,
        "DAYS_OF_SUPPLY": np.round(oh / avg.ravel(), 1),
    })

    po = pd.concat(orders, ignore_index=True)
    po["STORE_ID"] = series.get_level_values(0).to_numpy()[po["S"]]
    po["UPC"] = series.get_level_values(1).to_numpy()[po["S"]]
    po["VENDOR_ID"] = vendor[po["S"]]
    po["UNIT_COST"] = np.round(cost[po["S"]], 2)
    # One purchase order per vendor, store and order day; one line per UPC.
    po = po.sort_values(["ORDER_D", "STORE_ID", "VENDOR_ID", "UPC"]).reset_index(drop=True)
    header = po.groupby(["ORDER_D", "STORE_ID", "VENDOR_ID"], sort=False).ngroup()
    po["PO_ID"] = "PO" + (header + 1).astype(str).str.zfill(8)
    po["PO_LINE"] = po.groupby("PO_ID").cumcount() + 1
    open_ = po["ARRIVE_D"] >= n_days
    day = lambda i: mn + timedelta(days=int(i))  # noqa: E731
    po_df = pd.DataFrame({
        "PO_ID": po["PO_ID"],
        "PO_LINE": po["PO_LINE"],
        "VENDOR_ID": po["VENDOR_ID"],
        "STORE_ID": po["STORE_ID"],
        "UPC": po["UPC"],
        "ORDER_DATE": po["ORDER_D"].map(day),
        "PROMISED_DATE": po["PROMISED_D"].map(day),
        "RECEIVED_DATE": [None if o else day(a) for o, a in zip(open_, po["ARRIVE_D"])],
        "ORDERED_UNITS": po["ORDERED_UNITS"],
        "RECEIVED_UNITS": po["RECEIVED_UNITS"].astype("Int64").mask(open_),
        "UNIT_COST": po["UNIT_COST"],
    })
    return inventory_df, po_df


# ----------------------------------------------------------------------------
# Retail media
# ----------------------------------------------------------------------------

def _demo_campaigns(mx):
    """Demo campaigns relative to the end of the data history."""
    d = lambda days: datetime.combine(mx + timedelta(days=days), datetime.min.time())  # noqa: E731
    return [
        ("Kraft Mac & Cheese Back to School", "sponsored_listing", "brand", "Kraft", None, d(-50), d(-6), 1,
         {"keywords": ["mac and cheese", "kraft", "back to school"]}),
        ("Kraft Always-On Search", "sponsored_listing", "brand", "Kraft", None, d(-20), d(25), None,
         {"keywords": ["cheese", "kraft", "mayo"]}),
        ("Coca-Cola Summer Refresh", "display_ad_offsite", "brand", "Coca-Cola", None, d(-120), d(-61), None,
         {"ad_networks": ["facebook", "trade_desk"]}),
        ("Coca-Cola Game Day", "display_ad_onsite", "brand", "Coca-Cola", None, d(-30), d(10), None,
         {"keywords": ["soda", "game day"]}),
        ("Dairy Aisle Awareness", "display_ad_onsite", "category", None, "Dairy", d(-75), d(-45), None,
         {"keywords": ["milk", "yogurt", "cheese"]}),
        ("Fresh Produce Weekly", "display_ad_offsite", "category", None, "Produce", d(-40), d(20), None,
         {"ad_networks": ["facebook"]}),
        ("Snack Attack", "sponsored_listing", "category", None, "Snacks", d(-90), d(-61), None,
         {"keywords": ["chips", "snacks"]}),
    ]


def seed_campaigns(mx):
    """Insert the demo campaigns into Postgres if they are not there yet."""
    from app.database import SessionLocal
    from app.models import Campaign, ShopperCohort, User

    db = SessionLocal()
    try:
        owner = db.query(User).filter(User.email == "admin@retailiq.com").first() or db.query(User).first()
        if owner is None:
            raise RuntimeError("no Postgres users; run init_postgres.py first")
        existing = {c.name for c in db.query(Campaign.name).all()}
        cohort_ids = {c.id for c in db.query(ShopperCohort.id).all()}
        added = 0
        for name, ctype, ttype, brand, category, start, end, cohort, config in _demo_campaigns(mx):
            if name in existing:
                continue
            db.add(Campaign(
                user_id=owner.id, name=name, campaign_type=ctype,
                status="completed" if end.date() < mx else "active",
                start_date=start, end_date=end, target_type=ttype,
                target_brand=brand, target_category=category,
                cohort_id=cohort if cohort in cohort_ids else None,
                configuration=json.dumps(config),
            ))
            added += 1
        db.commit()
        return added
    finally:
        db.close()


def refresh_mirror(expected_min_rows, timeout_s=300):
    """Apply pending Postgres changes now and wait until the campaigns land."""
    conn = get_connection()
    cur = conn.cursor()
    try:
        deadline = time.time() + timeout_s
        while True:
            cur.execute(f"CALL SNOWFLAKE.POSTGRES.REFRESH_MIRROR('{MIRROR_NAME}')")
            cur.execute("SELECT COUNT(*) FROM RETAILIQ_PG_MIRROR.PUBLIC.CAMPAIGNS")
            if cur.fetchone()[0] >= expected_min_rows or time.time() > deadline:
                return
            time.sleep(15)
    finally:
        cur.close()
        conn.close()


def build_ad_delivery(cur, mn, mx):
    rng = np.random.default_rng(SEED + 1)
    cur.execute("""
        SELECT campaign_id, campaign_type, target_brand, target_category, start_date, end_date
        FROM campaigns WHERE campaign_type IN ('sponsored_listing', 'display_ad_onsite', 'display_ad_offsite')
    """)
    campaigns = cur.fetchall()

    # Daily gross sales of each campaign's target, to cap attributed sales at a
    # plausible share of what was actually sold.
    cur.execute("""
        SELECT c.campaign_id, t.transaction_date, SUM(ti.quantity * ti.unit_price)
        FROM campaigns c
        JOIN products p ON (c.target_brand IS NOT NULL AND p.brand = c.target_brand)
                        OR (c.target_brand IS NULL AND p.category = c.target_category)
        JOIN transaction_items ti ON ti.upc = p.upc
        JOIN transactions t ON t.transaction_id = ti.transaction_id
        WHERE t.transaction_date BETWEEN c.start_date AND c.end_date
        GROUP BY 1, 2
    """)
    target_sales = {(r[0], r[1]): float(r[2]) for r in cur.fetchall()}

    rows = []
    for cid, ctype, brand, category, start, end in campaigns:
        roas = rng.uniform(2.5, 5.5)
        days = [k for k in target_sales if k[0] == cid]
        # Size delivery to the target: a one-product brand gets a fraction of the
        # impressions a whole category does, so ROAS stays in a believable range.
        scale = min(max(np.mean([target_sales[k] for k in days]) / 6000.0, 0.08), 1.5) if days else 0.1
        d = max(start, mn)
        while d <= min(end, mx):
            weekday_lift = 1.25 if d.weekday() >= 4 else 1.0
            for placement in PLACEMENTS_BY_TYPE[ctype]:
                p = PLACEMENTS[placement]
                imps = int(p["imps"] * scale * weekday_lift * rng.uniform(0.8, 1.2))
                clicks = int(rng.binomial(imps, p["ctr"]))
                conv = int(rng.binomial(clicks, p["cvr"]))
                spend = clicks * p["cpc"] if "cpc" in p else imps / 1000 * p["cpm"]
                attributed = min(spend * roas * rng.uniform(0.8, 1.2), 0.5 * target_sales.get((cid, d), 0.0))
                rows.append({
                    "CAMPAIGN_ID": cid, "DELIVERY_DATE": d, "PLACEMENT": placement,
                    "TARGET_BRAND": brand, "TARGET_CATEGORY": category,
                    "IMPRESSIONS": imps, "CLICKS": clicks, "CONVERSIONS": conv,
                    "SPEND": round(spend, 2), "ATTRIBUTED_SALES": round(attributed, 2),
                })
            d += timedelta(days=1)
    return pd.DataFrame(rows)


def sync_campaign_totals(ad_df):
    """Set the Postgres lifetime totals to the sum of daily delivery."""
    from app.database import SessionLocal
    from app.models import Campaign

    if ad_df.empty:
        return
    totals = ad_df.groupby("CAMPAIGN_ID")[["IMPRESSIONS", "CLICKS", "CONVERSIONS", "SPEND"]].sum()
    db = SessionLocal()
    try:
        for cid, t in totals.iterrows():
            c = db.get(Campaign, int(cid))
            if c:
                c.impressions = int(t["IMPRESSIONS"])
                c.clicks = int(t["CLICKS"])
                c.conversions = int(t["CONVERSIONS"])
                c.spend = round(float(t["SPEND"]), 2)
        db.commit()
    finally:
        db.close()


# ----------------------------------------------------------------------------
# Entry point
# ----------------------------------------------------------------------------

def refresh(skip_ddl=False, progress_cb=None):
    """Build or rebuild every extended-model table from the current sales data."""
    summary = {}
    if not skip_ddl:
        _log("structure", 3, "applying retailiq_data_model.sql", progress_cb)
        summary["ddl_statements"] = run_ddl()

    conn = get_connection(role=DATA_ROLE)
    cur = conn.cursor()
    try:
        mn, mx = _bounds(cur)
        summary.update(data_min_date=str(mn), data_max_date=str(mx))

        _log("calendar", 10, "", progress_cb)
        summary["dim_date_rows"] = _replace(
            conn, cur, "DIM_DATE", build_dim_date(mn - timedelta(days=400), mx + timedelta(days=400)))

        _log("dimensions", 18, "products, stores, shoppers", progress_cb)
        enrich_dimensions(cur, mn)

        _log("transactions", 30, "time of day, channel, cost", progress_cb)
        enrich_transactions(cur)

        _log("promotions", 45, "windows and line discounts", progress_cb)
        summary["promotions"] = build_promotions(cur, mn, mx)

        _log("inventory", 60, "replenishment simulation", progress_cb)
        inventory_df, po_df = simulate_inventory(cur, mn, mx)
        summary["inventory_rows"] = _replace(conn, cur, "INVENTORY_DAILY", inventory_df)
        summary["purchase_order_lines"] = _replace(conn, cur, "PURCHASE_ORDER_LINES", po_df)

        _log("retail media", 85, "demo campaigns and delivery", progress_cb)
        summary["campaigns_seeded"] = seed_campaigns(mx)
        refresh_mirror(expected_min_rows=len(_demo_campaigns(mx)))
        ad_df = build_ad_delivery(cur, mn, mx)
        summary["ad_delivery_rows"] = _replace(conn, cur, "AD_DELIVERY_DAILY", ad_df)
        sync_campaign_totals(ad_df)
        refresh_mirror(expected_min_rows=0)

        _log("done", 100, "", progress_cb)
        summary["status"] = "success"
        return summary
    finally:
        cur.close()
        conn.close()


def main():
    ap = argparse.ArgumentParser(description="Build the RetailIQ extended data model")
    ap.add_argument("--skip-ddl", action="store_true", help="Only rebuild data, not structure")
    args = ap.parse_args()

    print("=" * 60)
    print("RetailIQ - Extended Data Model")
    print("=" * 60)
    result = refresh(skip_ddl=args.skip_ddl)
    print("-" * 60)
    for k, v in result.items():
        print(f"  {k}: {v}")
    print("-" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
