#!/usr/bin/env python3
"""
Convert Amazon Order History Reporter (by transaction + by item) CSVs to YNAB import format.
Uses both reports for full context, AI to split only when necessary and categorize.
Output: Date, Payee, Memo, Amount, Category, OrderId.
Usage: python amazon_reports_to_ynab.py <transactions_csv> <items_csv> [-o output.csv] [--no-ai]
"""
import argparse
import csv
import json
import logging
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

try:
    from dotenv import load_dotenv
    _script_dir = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(_script_dir, ".env"))
except ImportError:
    pass

try:
    import anthropic
except ImportError:
    anthropic = None

try:
    import ynab
    from ynab.rest import ApiException
except ImportError:
    ynab = None
    ApiException = None

PAYEE = "Amazon.ca"
DEFAULT_CATEGORY = "Uncategorized"

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


# --- Parsing ---


def _is_valid_amount(value: str) -> bool:
    """Return True if value is a valid numeric amount (not formula)."""
    if value is None or not str(value).strip():
        return False
    s = str(value).strip()
    if s.startswith("="):
        return False
    try:
        s = s.replace(",", "").replace("$", "").replace("£", "").replace("CAD", "").strip()
        float(s)
        return True
    except ValueError:
        return False


def _parse_amount(value: str) -> Optional[float]:
    if value is None or not str(value).strip():
        return None
    s = str(value).strip().replace(",", "").replace("$", "").replace("£", "").replace("CAD", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def _parse_date(s: str) -> Optional[str]:
    if not s or not str(s).strip():
        return None
    s = str(s).strip()
    for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%d-%m-%Y", "%b %d, %Y", "%B %d, %Y"]:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        return f"{m.group(3)}-{m.group(1).zfill(2)}-{m.group(2).zfill(2)}"
    return None


def _find_column(row: dict, candidates: list[str]) -> Optional[str]:
    keys_lower = {k.strip().lower(): k for k in row.keys()}
    for c in candidates:
        if c.lower() in keys_lower:
            return keys_lower[c.lower()]
    for c in candidates:
        c_norm = c.replace(" ", "").replace(".", "")
        for k, v in keys_lower.items():
            if c_norm in k.replace(" ", "").replace(".", ""):
                return v
    return None


def load_transactions_csv(path: Path) -> list[dict]:
    """Load transactions CSV. Skip footer rows where amount is non-numeric."""
    transactions = []
    required = ["date", "amount", "order ids", "order id"]
    with open(path, mode="r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    if not rows:
        raise ValueError(f"No rows in {path}")
    first = rows[0]
    date_col = _find_column(first, ["date"])
    amt_col = _find_column(first, ["amount"])
    order_col = _find_column(first, ["order ids", "order id", "order_id"])
    vendor_col = _find_column(first, ["vendor", "payee"])
    if not date_col or not amt_col or not order_col:
        raise ValueError(f"Missing required columns. Found: {list(first.keys())}. Need: date, amount, order id(s)")
    for row in rows:
        amt_val = row.get(amt_col)
        if not _is_valid_amount(amt_val):
            continue
        amount = _parse_amount(amt_val)
        if amount is None:
            continue
        date_str = _parse_date(row.get(date_col, ""))
        if not date_str:
            continue
        order_id = (row.get(order_col, "") or "").strip()
        if not order_id:
            continue
        vendor = (row.get(vendor_col, "") or "").strip()
        transactions.append({
            "date": date_str,
            "amount": amount,
            "order_id": order_id,
            "vendor": vendor or PAYEE,
        })
    return transactions


def load_items_csv(path: Path) -> dict[str, list[dict]]:
    """Load items CSV and group by order id."""
    items_by_order: dict[str, list[dict]] = defaultdict(list)
    with open(path, mode="r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    if not rows:
        return dict(items_by_order)
    first = rows[0]
    order_col = _find_column(first, ["order id", "order_id", "order ids"])
    desc_col = _find_column(first, ["description", "item", "title", "memo"])
    price_col = _find_column(first, ["price", "amount"])
    qty_col = _find_column(first, ["quantity", "qty"])
    if not order_col:
        raise ValueError(f"Missing order id column in {path}. Found: {list(first.keys())}")
    for row in rows:
        order_id = (row.get(order_col, "") or "").strip()
        if not order_id:
            continue
        price = _parse_amount(row.get(price_col, "") if price_col else "")
        if price is None:
            price = 0.0
        qty = 1
        if qty_col:
            try:
                qty = int(float(str(row.get(qty_col, 1)).strip() or 1))
            except (ValueError, TypeError):
                qty = 1
        desc = (row.get(desc_col, "") if desc_col else "") or ""
        items_by_order[order_id].append({
            "description": desc[:500],
            "price": price,
            "quantity": qty,
        })
    return dict(items_by_order)


def enrich_transactions(transactions: list[dict], items_by_order: dict[str, list[dict]]) -> list[dict]:
    """Attach items to each transaction. Log missing order_ids."""
    enriched = []
    for tx in transactions:
        order_id = tx["order_id"]
        items = items_by_order.get(order_id, [])
        if not items:
            logger.warning("No items for order %s (date=%s, amount=%s)", order_id, tx["date"], tx["amount"])
        enriched.append({**tx, "items": items})
    return enriched


# --- Amount allocation ---


def allocate_amounts(total_amount: float, items: list[dict]) -> list[float]:
    """Allocate total_amount proportionally across items by price."""
    if not items:
        return []
    prices = [abs(item["price"]) * item.get("quantity", 1) for item in items]
    total_price = sum(prices)
    if total_price == 0:
        n = len(items)
        return [round(total_amount / n, 2)] * n
    allocated = [round(total_amount * (p / total_price), 2) for p in prices]
    diff = round(total_amount - sum(allocated), 2)
    if abs(diff) > 0.001:
        max_idx = max(range(len(prices)), key=lambda i: prices[i])
        allocated[max_idx] += diff
    return allocated


# --- YNAB categories ---


def fetch_ynab_categories() -> list[str]:
    if not ynab:
        return [DEFAULT_CATEGORY]
    access_token = os.environ.get("YNAB_ACCESS_TOKEN")
    budget_id = os.environ.get("YNAB_BUDGET_ID")
    if not access_token or not budget_id:
        logger.warning("YNAB credentials not set; using default category.")
        return [DEFAULT_CATEGORY]
    try:
        configuration = ynab.Configuration(access_token=access_token)
        with ynab.ApiClient(configuration) as api_client:
            api = ynab.CategoriesApi(api_client)
            resp = api.get_categories(budget_id)
        categories = []
        for group in resp.data.category_groups or []:
            if getattr(group, "deleted", False) or getattr(group, "hidden", False):
                continue
            for cat in group.categories or []:
                if getattr(cat, "deleted", False) or getattr(cat, "hidden", False):
                    continue
                categories.append(cat.name)
        return categories if categories else [DEFAULT_CATEGORY]
    except Exception as e:
        logger.warning("Could not fetch YNAB categories: %s", e)
        return [DEFAULT_CATEGORY]


def _resolve_category(ai_response: str, valid: list[str]) -> str:
    ai_response = (ai_response or "").strip()
    if ai_response in valid:
        return ai_response
    import unicodedata
    def norm(s): return "".join(c for c in s if unicodedata.category(c) != "So").strip().lower()
    ai_n = norm(ai_response)
    for c in valid:
        if norm(c) == ai_n or ai_n in norm(c) or norm(c) in ai_n:
            return c
    return DEFAULT_CATEGORY


# --- Rule-based categorization (no AI) ---


def categorize_rule_based(tx: dict) -> tuple[str, str]:
    """Simple rule-based category and memo when --no-ai."""
    vendor = (tx.get("vendor") or "").lower()
    items = tx.get("items", [])
    if not items:
        if "prime" in vendor or "primevideo" in vendor or "ad free" in vendor:
            return "Subscriptions (Monthly)", vendor or "Amazon"
        if "channels" in vendor or "amazon channels" in vendor:
            return "Subscriptions (Monthly)", "Amazon Channels"
        if "kindle" in vendor or "kindle svcs" in vendor:
            return "Subscriptions (Monthly)", "Kindle"
        return DEFAULT_CATEGORY, vendor or "Amazon"
    desc = items[0].get("description", "")[:200]
    memo = desc or vendor or "Amazon"
    if "gift" in desc.lower() or "egift" in desc.lower():
        return "Gifts & Giving", memo
    if "kids" in desc.lower() or "toddler" in desc.lower() or "children" in desc.lower():
        return "Kids Supplies", memo
    return DEFAULT_CATEGORY, memo


# --- AI categorization ---


def categorize_with_ai_batch(enriched: list[dict], categories: list[str], start_idx: int = 0) -> list[dict]:
    """
    AI decides: split or not; category(ies). Returns list of {idx, split, category, memo} or {idx, split, item_categories}.
    We allocate amounts proportionally when split.
    """
    if not anthropic or not os.environ.get("ANTHROPIC_API_KEY"):
        return []

    client = anthropic.Anthropic()
    cat_list = "\n".join(f"- {c}" for c in categories)
    batch_text = ""
    for j, tx in enumerate(enriched):
        i = start_idx + j
        items = tx.get("items", [])
        items_str = "; ".join(f"{it.get('description', '')[:80]} (${abs(it.get('price', 0)):.2f})" for it in items[:5])
        batch_text += f"{i}. date={tx['date']} amount={tx['amount']} vendor={tx.get('vendor','')} items=[{items_str}]\n"

    prompt = f"""For each Amazon charge below, decide:
1. split: true ONLY if items clearly belong in DIFFERENT YNAB categories (e.g. Kids Supplies vs Wardrobe). If same category or one dominates, use split: false.
2. If split: false: return category and memo (short description).
3. If split: true: return one category per item (same order as items), comma-separated. We will allocate the charge proportionally.

AVAILABLE CATEGORIES (use EXACT names):
{cat_list}

CHARGES:
{batch_text}

Return JSON array, one object per charge. Use the SAME index numbers as in the list above:
[{{"idx": 0, "split": false, "category": "Kids Supplies", "memo": "Toddler pajamas"}},
 {{"idx": 1, "split": true, "item_categories": ["Kids Supplies", "Home Maintenance & Decor"]}}]

JSON:"""

    try:
        resp = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        text = (resp.content[0].text or "").strip()
        if text.startswith("```"):
            text = re.sub(r"```json?\s*", "", text).replace("```", "").strip()
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            text = text[start:end]
        data = json.loads(text)
        result = [None] * len(enriched)
        for obj in data:
            idx = obj.get("idx", obj.get("i", -1))
            local_idx = idx - start_idx
            if 0 <= local_idx < len(enriched):
                result[local_idx] = obj
        return result
    except Exception as e:
        logger.warning("AI categorization failed: %s", e)
        return []


# --- Build output rows ---


def build_output_rows(enriched: List[dict], ai_results: Optional[List[dict]], categories: List[str]) -> List[dict]:
    """Build final output rows. Validate split sums; fall back to no-split if invalid."""
    output = []
    for i, tx in enumerate(enriched):
        ai_res = ai_results[i] if ai_results and i < len(ai_results) else None
        use_rule = not ai_res
        if use_rule:
            cat, memo = categorize_rule_based(tx)
            output.append({
                "Date": tx["date"],
                "Payee": PAYEE,
                "Memo": memo[:500],
                "Amount": tx["amount"],
                "Category": _resolve_category(cat, categories),
                "OrderId": tx["order_id"],
            })
            continue
        split = ai_res.get("split", False)
        if not split:
            cat = ai_res.get("category", DEFAULT_CATEGORY)
            memo = ai_res.get("memo", "") or (tx.get("items", [{}])[0].get("description", "")[:200] if tx.get("items") else tx.get("vendor", "Amazon"))
            output.append({
                "Date": tx["date"],
                "Payee": PAYEE,
                "Memo": str(memo)[:500],
                "Amount": tx["amount"],
                "Category": _resolve_category(cat, categories),
                "OrderId": tx["order_id"],
            })
        else:
            item_cats = ai_res.get("item_categories", [])
            items = tx.get("items", [])
            if not items or len(item_cats) != len(items):
                cat, memo = categorize_rule_based(tx)
                output.append({
                    "Date": tx["date"],
                    "Payee": PAYEE,
                    "Memo": memo[:500],
                    "Amount": tx["amount"],
                    "Category": _resolve_category(cat, categories),
                    "OrderId": tx["order_id"],
                })
                continue
            allocated = allocate_amounts(tx["amount"], items)
            if len(allocated) != len(items):
                cat, memo = categorize_rule_based(tx)
                output.append({
                    "Date": tx["date"],
                    "Payee": PAYEE,
                    "Memo": memo[:500],
                    "Amount": tx["amount"],
                    "Category": _resolve_category(cat, categories),
                    "OrderId": tx["order_id"],
                })
                continue
            total_check = sum(allocated)
            if abs(total_check - tx["amount"]) > 0.02:
                cat, memo = categorize_rule_based(tx)
                output.append({
                    "Date": tx["date"],
                    "Payee": PAYEE,
                    "Memo": memo[:500],
                    "Amount": tx["amount"],
                    "Category": _resolve_category(cat, categories),
                    "OrderId": tx["order_id"],
                })
                continue
            for j, (item, amt, cat) in enumerate(zip(items, allocated, item_cats)):
                memo = item.get("description", "")[:500] or f"Item {j+1}"
                output.append({
                    "Date": tx["date"],
                    "Payee": PAYEE,
                    "Memo": memo,
                    "Amount": amt,
                    "Category": _resolve_category(cat, categories),
                    "OrderId": tx["order_id"],
                })
    return output


# --- Date range check ---


def _date_range(dates: List[str]) -> Tuple[Optional[str], Optional[str]]:
    if not dates:
        return None, None
    valid = [d for d in dates if d]
    if not valid:
        return None, None
    return min(valid), max(valid)


# --- Main ---


def main():
    parser = argparse.ArgumentParser(
        description="Convert Amazon Order History Reporter (txs + items) CSVs to YNAB format.",
        epilog="Example: python amazon_reports_to_ynab.py txs.csv items.csv -o amazon_ynab_ready.csv",
    )
    parser.add_argument("transactions_csv", type=Path, help="Path to transactions CSV (by transaction)")
    parser.add_argument("items_csv", type=Path, help="Path to items CSV (by item)")
    parser.add_argument("-o", "--output", type=Path, default=Path("amazon_ynab_ready.csv"), help="Output CSV path")
    parser.add_argument("--no-ai", action="store_true", help="Use rule-based categorization (no API)")
    args = parser.parse_args()

    if not args.transactions_csv.is_file():
        logger.error("Transactions file not found: %s", args.transactions_csv)
        sys.exit(1)
    if not args.items_csv.is_file():
        logger.error("Items file not found: %s", args.items_csv)
        sys.exit(1)

    transactions = load_transactions_csv(args.transactions_csv)
    logger.info("Loaded %d transactions", len(transactions))
    if not transactions:
        logger.error("No valid transactions found")
        sys.exit(1)

    items_by_order = load_items_csv(args.items_csv)
    logger.info("Loaded items for %d orders", len(items_by_order))

    enriched = enrich_transactions(transactions, items_by_order)
    unmatched = sum(1 for e in enriched if not e.get("items"))
    if unmatched:
        logger.info("Transactions without items: %d", unmatched)

    tx_dates = [e["date"] for e in enriched]
    item_dates = []
    for items in items_by_order.values():
        for it in items:
            pass  # items don't have date in our structure; order date is in tx
    tx_min, tx_max = _date_range(tx_dates)
    if tx_min and tx_max:
        logger.info("Transaction date range: %s to %s", tx_min, tx_max)

    categories = fetch_ynab_categories()
    logger.info("Using %d YNAB categories", len(categories))

    ai_results = None
    if not args.no_ai:
        batch_size = 25
        all_results = []
        for i in range(0, len(enriched), batch_size):
            batch = enriched[i : i + batch_size]
            batch_res = categorize_with_ai_batch(batch, categories, start_idx=i)
            for r in batch_res:
                if r is not None:
                    idx = r.get("idx", -1)
                    if 0 <= idx < len(enriched):
                        all_results.append((idx, r))
        if all_results:
            ai_results = [None] * len(enriched)
            for idx, r in all_results:
                ai_results[idx] = r
            ai_count = sum(1 for r in ai_results if r is not None)
            logger.info("AI categorized %d/%d transactions", ai_count, len(enriched))
        else:
            logger.warning("AI returned no results; using rule-based for all")
    else:
        logger.info("Using rule-based categorization (--no-ai)")

    output_rows = build_output_rows(enriched, ai_results, categories)
    split_extra_rows = len(output_rows) - len(transactions)

    with open(args.output, mode="w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["Date", "Payee", "Memo", "Amount", "Category", "OrderId"])
        writer.writeheader()
        writer.writerows(output_rows)

    logger.info("Wrote %d rows to %s", len(output_rows), args.output)
    print("\nSummary:")
    print(f"  Transactions processed: {len(transactions)}")
    print(f"  Output rows: {len(output_rows)}")
    print(f"  Extra rows from splits: {split_extra_rows}")
    print(f"  Unmatched orders (no items): {unmatched}")

    # Category report: abs amount and % of total
    cat_totals: dict[str, float] = defaultdict(float)
    for row in output_rows:
        amt = row.get("Amount", 0)
        try:
            amt_val = float(amt) if not isinstance(amt, (int, float)) else amt
        except (TypeError, ValueError):
            amt_val = 0.0
        cat_totals[row.get("Category", DEFAULT_CATEGORY)] += abs(amt_val)
    grand_total = sum(cat_totals.values())
    print("\nCategory Report (by absolute value):")
    print("-" * 50)
    for cat, amt in sorted(cat_totals.items(), key=lambda x: -x[1]):
        pct = (amt / grand_total * 100) if grand_total else 0
        print(f"  {cat}: ${amt:,.2f} ({pct:.1f}%)")
    print("-" * 50)
    print(f"  TOTAL: ${grand_total:,.2f} (100.0%)")

    print("\nNext: YNAB_CSV_FILE=%s python3 ynab_apply_csv_categories.py" % args.output)


if __name__ == "__main__":
    main()
