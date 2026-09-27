#!/usr/bin/env python
"""
RetailIQ - Incremental data top-up.

WHY THIS EXISTS
---------------
generate_synthetic_data.py produces a year of history ending on the day it runs.
Every day afterward, the data's right edge stays fixed while the calendar moves
on. RetailIQ compensates by deriving its reference date from the data (see
app/date_anchor.py), but eventually you want the demo to actually reach today
again - especially before showing it to someone.

This script fills the gap between MAX(transaction_date) and a target date
(default: today) by APPENDING new transactions.

HOW IT DIFFERS FROM THE INITIAL GENERATOR - read before editing
---------------------------------------------------------------
1. It does NOT regenerate dimensions. products, stores, and shoppers are read
   back out of Snowflake and reused, so foreign keys stay valid and the row
   access policies keep filtering correctly. Regenerating them would orphan every
   existing transaction_item.

2. It APPENDS. Writes use write_pandas(..., overwrite=False). The initial
   generator uses CREATE OR REPLACE TABLE and overwrite=True, which is why it is
   destructive - running it again would wipe the year you are trying to extend.

3. It CONTINUES the ID sequences. IDs are zero-padded (TXN 10 digits, ITM 12),
   so the next counter is derived from the existing maximum. Restarting at 1
   would collide on the primary key.

4. Basket composition is NOT reimplemented here. It imports
   generate_transactions_for_dates() from the initial generator, so topped-up
   days are statistically identical to the original history rather than subtly
   different.

USAGE
-----
    python -m scripts.extend_synthetic_data                 # fill gap to today
    python -m scripts.extend_synthetic_data --to 2026-10-01 # fill to a date
    python -m scripts.extend_synthetic_data --dry-run       # report, change nothing

Reads the same .env as the application.
"""

import argparse
import os
import sys
from datetime import date, datetime, timedelta

import pandas as pd
from dotenv import load_dotenv
from snowflake.connector.pandas_tools import write_pandas

load_dotenv()

# Reuse the generator's basket/pricing logic so the two cannot drift apart.
from scripts.generate_synthetic_data import (  # noqa: E402
    get_connection,
    generate_transactions_for_dates,
)

# The probe and the write both need a role with an 'all' entitlement, otherwise
# row access policies hide the existing data and MAX(transaction_date) comes back
# NULL - which would look like an empty database.
WRITE_ROLE = os.getenv("RETAILIQ_ANCHOR_PROBE_ROLE", "RETAILIQ_ROLE_ADMIN")


def _parse_date(s):
    return datetime.strptime(s, "%Y-%m-%d").date()


def get_current_bounds(cursor):
    """Return (min_date, max_date, max_txn_seq, max_item_seq)."""
    cursor.execute("SELECT MIN(transaction_date), MAX(transaction_date) FROM transactions")
    min_d, max_d = cursor.fetchone()

    # TRY_TO_NUMBER on the numeric suffix. Using MAX on the padded string would
    # also work because the padding is fixed width, but parsing is explicit about
    # the intent and survives a future width change.
    cursor.execute("SELECT COALESCE(MAX(TRY_TO_NUMBER(SUBSTR(transaction_id, 4))), 0) FROM transactions")
    max_txn = cursor.fetchone()[0] or 0

    cursor.execute("SELECT COALESCE(MAX(TRY_TO_NUMBER(SUBSTR(item_id, 4))), 0) FROM transaction_items")
    max_item = cursor.fetchone()[0] or 0

    def _as_date(v):
        if v is None:
            return None
        return v.date() if isinstance(v, datetime) else v

    return _as_date(min_d), _as_date(max_d), int(max_txn), int(max_item)


def load_dimensions(cursor):
    """Read existing dimension tables back out of Snowflake.

    Reusing these (rather than regenerating) is what keeps referential integrity
    intact for the appended rows.
    """
    cursor.execute("SELECT upc, product_name, brand, category, subcategory, price FROM products")
    products = pd.DataFrame(
        cursor.fetchall(),
        columns=["UPC", "PRODUCT_NAME", "BRAND", "CATEGORY", "SUBCATEGORY", "PRICE"],
    )

    cursor.execute("SELECT store_id, store_name, region, store_type FROM stores")
    stores = pd.DataFrame(
        cursor.fetchall(), columns=["STORE_ID", "STORE_NAME", "REGION", "STORE_TYPE"]
    )

    cursor.execute("SELECT shopper_id FROM shoppers")
    shoppers = pd.DataFrame(cursor.fetchall(), columns=["SHOPPER_ID"])

    return products, stores, shoppers


def extend(target_date=None, dry_run=False, progress_cb=None):
    """Append transactions from MAX(transaction_date)+1 through target_date.

    Args:
        target_date: date to fill up to, inclusive. Defaults to today.
        dry_run: report what would happen without writing.
        progress_cb: optional callable(stage: str, pct: int, detail: str) used by
            the admin background job to report progress.

    Returns a dict summary.
    """
    target_date = target_date or date.today()

    def report(stage, pct, detail=""):
        print(f"[{pct:3d}%] {stage} {detail}".rstrip(), flush=True)
        if progress_cb:
            progress_cb(stage, pct, detail)

    # The connection role matters twice over. Row access policies compare against
    # CURRENT_ROLE(), so a role without an 'all' entitlement sees no existing rows
    # and we would compute a wrong starting sequence. The role also needs CREATE
    # STAGE on the schema, because write_pandas stages the data in a temporary
    # internal stage before COPY.

    conn = get_connection(role=WRITE_ROLE)
    cursor = conn.cursor()

    try:
        report("inspecting", 5, "reading current data bounds")
        min_d, max_d, max_txn, max_item = get_current_bounds(cursor)

        if max_d is None:
            return {
                "status": "error",
                "error": (
                    "transactions table is empty (or invisible to "
                    f"{WRITE_ROLE}). Run generate_synthetic_data first."
                ),
            }

        first_new = max_d + timedelta(days=1)
        if first_new > target_date:
            return {
                "status": "noop",
                "message": f"Data already reaches {max_d}; nothing to add for target {target_date}.",
                "data_min_date": str(min_d),
                "data_max_date": str(max_d),
                "target_date": str(target_date),
                "days_added": 0,
                "transactions_added": 0,
                "items_added": 0,
            }

        dates = []
        d = first_new
        while d <= target_date:
            dates.append(datetime(d.year, d.month, d.day))
            d += timedelta(days=1)

        summary = {
            "status": "planned" if dry_run else "running",
            "data_min_date": str(min_d),
            "data_max_date": str(max_d),
            "target_date": str(target_date),
            "days_to_add": len(dates),
            "first_new_date": str(first_new),
            "next_transaction_seq": max_txn + 1,
            "next_item_seq": max_item + 1,
        }

        if dry_run:
            # ~750 txns/weekday and ~1150/weekend on average, ~9 items each.
            summary["estimated_transactions"] = len(dates) * 900
            summary["estimated_items"] = len(dates) * 900 * 9
            report("planned", 100, f"{len(dates)} days would be added")
            return summary

        report("loading dimensions", 15, "reading products, stores, shoppers")
        products_df, stores_df, shoppers_df = load_dimensions(cursor)
        if products_df.empty or stores_df.empty or shoppers_df.empty:
            return {
                "status": "error",
                "error": "one or more dimension tables came back empty; aborting rather than writing orphaned rows",
            }

        report("generating", 30, f"{len(dates)} days from {first_new} to {target_date}")
        txn_df, items_df, _, _ = generate_transactions_for_dates(
            products_df,
            stores_df=stores_df,
            shoppers_df=shoppers_df,
            dates=dates,
            transaction_counter=max_txn + 1,
            item_counter=max_item + 1,
            progress_every=0,
        )

        report("writing transactions", 60, f"{len(txn_df):,} rows")
        ok, _, nrows, _ = write_pandas(
            conn, txn_df, "TRANSACTIONS", overwrite=False, auto_create_table=False
        )
        if not ok:
            return {"status": "error", "error": "write_pandas failed for TRANSACTIONS"}

        report("writing transaction items", 80, f"{len(items_df):,} rows")
        ok, _, nrows_items, _ = write_pandas(
            conn, items_df, "TRANSACTION_ITEMS", overwrite=False, auto_create_table=False
        )
        if not ok:
            return {"status": "error", "error": "write_pandas failed for TRANSACTION_ITEMS"}

        # Confirm the new right edge rather than trusting the write.
        _, new_max, _, _ = get_current_bounds(cursor)

        summary.update(
            {
                "status": "success",
                "days_added": len(dates),
                "transactions_added": int(len(txn_df)),
                "items_added": int(len(items_df)),
                "new_data_max_date": str(new_max),
            }
        )
        report("done", 100, f"data now reaches {new_max}")
        return summary

    finally:
        try:
            cursor.close()
        finally:
            conn.close()


def main():
    ap = argparse.ArgumentParser(description="Append synthetic transactions up to a target date")
    ap.add_argument("--to", dest="to_date", help="Target date YYYY-MM-DD (default: today)")
    ap.add_argument("--dry-run", action="store_true", help="Report the plan without writing")
    args = ap.parse_args()

    target = _parse_date(args.to_date) if args.to_date else date.today()

    print("=" * 60)
    print("RetailIQ - Incremental Data Top-Up")
    print("=" * 60)

    result = extend(target_date=target, dry_run=args.dry_run)

    print("-" * 60)
    for k, v in result.items():
        print(f"  {k}: {v}")
    print("-" * 60)

    return 0 if result.get("status") in ("success", "noop", "planned") else 1


if __name__ == "__main__":
    sys.exit(main())
