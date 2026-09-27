"""
Data-derived reference date ("anchor") for RetailIQ.

WHY THIS EXISTS
---------------
The synthetic data generator anchors its output to wall-clock now, so a fresh
load produces a year of history ending *today*. Every day that passes afterward,
the data's right edge stays put while CURRENT_DATE advances - so "last 30 days",
the 90-day cohort windows, and the 4-week assortment velocity window all slowly
drain until charts go empty. That decay is invisible until a demo looks broken.

The fix is to stop asking the wall clock what "today" is and ask the data
instead: the anchor is MAX(transaction_date). Every relative window is computed
backward from that point.

The important property is that this is a no-op when the data is fresh. If the
data reaches today, the anchor equals today and behaviour is identical to using
CURRENT_DATE. It only diverges once the data falls behind - exactly when you
want it to.

CACHING
-------
A single probe at startup is not enough. The server often stays up for days, and
the admin data top-up changes MAX(transaction_date) while the process is live -
so a boot-time-only value would be stale immediately after the very operation
meant to fix it. The cache therefore refreshes:

  * at startup (via the FastAPI lifespan handler in main.py)
  * when the TTL expires
  * on explicit admin request
  * when a data top-up job completes (which calls invalidate())

FAIL-SOFT
---------
If the probe fails or the tables are empty, we fall back to CURRENT_DATE and log
a warning. A Snowflake hiccup degrades to the old behaviour rather than taking
the whole application down.
"""

import os
import threading
import time
from datetime import date, datetime
from typing import Any, Dict, Optional

# The probe MUST run as a role with an 'all' entitlement. Row access policies on
# transactions compare role_entitlements.role_name against CURRENT_ROLE(), so
# probing under a restricted role (or the user's unrelated default role) would
# return zero rows and yield a wrong anchor - or worse, a different anchor per
# user. RETAILIQ_ROLE_ADMIN is the role seeded with tenant_type='all'.
PROBE_ROLE = os.getenv("RETAILIQ_ANCHOR_PROBE_ROLE", "RETAILIQ_ROLE_ADMIN")

# How long a probed value stays trusted before we re-probe.
TTL_SECONDS = int(os.getenv("RETAILIQ_ANCHOR_TTL_SECONDS", "900"))

_lock = threading.Lock()
_cache: Dict[str, Any] = {
    "min_date": None,      # date | None
    "max_date": None,      # date | None
    "probed_at": None,     # float epoch | None
    "available": False,    # True once a probe has succeeded
    "error": None,         # str | None - last probe failure
}


def _log(msg: str) -> None:
    print(f"[DATE_ANCHOR] {msg}", flush=True)


def _coerce_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def refresh() -> Dict[str, Any]:
    """Re-probe Snowflake for the data's date coverage. Never raises."""
    # Imported lazily so that importing this module does not pull in the database
    # layer (and therefore a config/env read) at import time.
    from .database import execute_snowflake_query
    from .table_config import tables

    query = f"""
        SELECT MIN(transaction_date) AS min_date,
               MAX(transaction_date) AS max_date
        FROM {tables.TRANSACTIONS}
    """
    try:
        rows = execute_snowflake_query(query, role_name=PROBE_ROLE)
        row = rows[0] if rows else {}
        min_d = _coerce_date(row.get("MIN_DATE") or row.get("min_date"))
        max_d = _coerce_date(row.get("MAX_DATE") or row.get("max_date"))

        with _lock:
            _cache["min_date"] = min_d
            _cache["max_date"] = max_d
            _cache["probed_at"] = time.time()
            _cache["available"] = max_d is not None
            _cache["error"] = None if max_d is not None else "no transaction rows"

        if max_d is None:
            _log("probe returned no data (empty transactions table); using CURRENT_DATE")
        else:
            gap = (date.today() - max_d).days
            _log(f"coverage {min_d} .. {max_d} (gap vs today: {gap}d)")
    except Exception as exc:  # noqa: BLE001 - fail soft by design
        with _lock:
            _cache["probed_at"] = time.time()
            _cache["available"] = False
            _cache["error"] = str(exc)
        _log(f"probe failed, falling back to CURRENT_DATE: {exc}")

    return status()


def invalidate() -> None:
    """Force the next resolve()/status() call to re-probe.

    Called after a data top-up job so the new data date takes effect without a
    server restart.
    """
    with _lock:
        _cache["probed_at"] = None
    _log("cache invalidated")


def _ensure_fresh() -> None:
    with _lock:
        probed_at = _cache["probed_at"]
    if probed_at is None or (time.time() - probed_at) > TTL_SECONDS:
        refresh()


def resolve() -> date:
    """The application's notion of 'today'.

    Returns MAX(transaction_date) when known, else the real current date.
    """
    _ensure_fresh()
    with _lock:
        max_d = _cache["max_date"] if _cache["available"] else None
    return max_d or date.today()


def anchor_sql() -> str:
    """A SQL expression to substitute wherever CURRENT_DATE used to appear.

    Returns a DATE literal when the anchor is known, otherwise the literal string
    'CURRENT_DATE' so behaviour degrades to the pre-anchor default.
    """
    _ensure_fresh()
    with _lock:
        available = _cache["available"]
        max_d = _cache["max_date"]
    if available and max_d:
        return f"'{max_d.isoformat()}'::DATE"
    return "CURRENT_DATE"


def status() -> Dict[str, Any]:
    """Coverage and freshness, for the config endpoint and the admin panel."""
    _ensure_fresh()
    with _lock:
        min_d = _cache["min_date"]
        max_d = _cache["max_date"]
        probed_at = _cache["probed_at"]
        available = _cache["available"]
        error = _cache["error"]

    today = date.today()
    anchor = (max_d or today) if available else today
    return {
        "anchor_date": anchor.isoformat(),
        "data_min_date": min_d.isoformat() if min_d else None,
        "data_max_date": max_d.isoformat() if max_d else None,
        "today": today.isoformat(),
        # How far behind wall-clock today the data is. 0 means fresh.
        "gap_days": (today - max_d).days if max_d else None,
        "using_data_date": bool(available and max_d and max_d != today),
        "available": available,
        "probed_at": (
            datetime.fromtimestamp(probed_at).isoformat() if probed_at else None
        ),
        "ttl_seconds": TTL_SECONDS,
        "error": error,
    }
