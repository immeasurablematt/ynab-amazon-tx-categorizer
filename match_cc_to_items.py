#!/usr/bin/env python3
"""
Match credit card transactions to itemized Amazon orders and output a categorized CSV.
Splits transactions when an order has multiple items with different categories.
Usage: python match_cc_to_items.py <orders_csv> <items_csv> [-o output.csv]
"""
import argparse
import csv
import os
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

PAYEE = "Amazon.ca"
DEFAULT_CATEGORY = "Uncategorized"

# Amount tolerance: order_total <= abs(cc_amount) <= order_total * (1 + TAX_TOLERANCE)
TAX_TOLERANCE = 0.25  # ~15-20% for Canadian tax
# Also allow exact match or slight under (items may include tax in some exports)
DATE_TOLERANCE_DAYS = 5
MIN_AMOUNT_MATCH = 0.01  # Minimum difference for fuzzy match


def _parse_date(s: str) -> Optional[str]:
    if not s or not str(s).strip():
        return None
    s = str(s).strip()
    for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%b %d, %Y", "%B %d, %Y", "%d %b %Y", "%d %B %Y"]:
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


def _parse_amount(s) -> Optional[float]:
    if s is None or (isinstance(s, str) and not s.strip()):
        return None
    s = str(s).strip().replace(",", "").replace("$", "").replace("CAD", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def _date_to_ordinal(date_str: str) -> int:
    """Convert YYYY-MM-DD to days since epoch for date diff."""
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt.toordinal()
    except ValueError:
        return 0


def _days_between(date_str1: str, date_str2: str) -> int:
    return abs(_date_to_ordinal(date_str1) - _date_to_ordinal(date_str2))


def _is_non_order_payee(payee: str) -> bool:
    """True if this payee is PAYMENT, subscriptions, etc. that won't match items."""
    if not payee:
        return False
    payee_lower = payee.lower()
    if "payment" in payee_lower and "amazon" not in payee_lower:
        return True
    if "primevideo" in payee_lower or "prime video" in payee_lower:
        return True
    if "amazon channels" in payee_lower:
        return True
    if "ad free for prime" in payee_lower or "ad-free for prime" in payee_lower:
        return True
    return False


@dataclass
class CCTransaction:
    posted_date: str
    payee: str
    amount: float
    raw_row: dict


@dataclass
class OrderGroup:
    order_id: str
    items: list[dict]
    order_total: float  # sum of item amounts (negative for purchases)
    order_date: str


def load_orders_csv(path: str) -> list[CCTransaction]:
    """Load credit card transactions from orders CSV."""
    rows = []
    with open(path, mode="r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            date_col = row.get("Posted Date") or row.get("posted date") or row.get("Date")
            amt_col = row.get("Amount") or row.get("amount")
            payee_col = row.get("Payee") or row.get("payee") or ""
            date_str = _parse_date(str(date_col or ""))
            amount = _parse_amount(amt_col)
            if date_str is not None and amount is not None:
                rows.append(CCTransaction(
                    posted_date=date_str,
                    payee=str(payee_col or "").strip(),
                    amount=amount,
                    raw_row=row,
                ))
    return rows


def load_items_csv(path: str) -> list[dict]:
    """Load itemized purchases from items CSV."""
    rows = []
    with open(path, mode="r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            date_str = _parse_date(str(row.get("Date", "")))
            amount = _parse_amount(row.get("Amount"))
            order_id = (row.get("OrderId") or row.get("orderid") or "").strip()
            if date_str is not None and amount is not None and order_id:
                rows.append({
                    "Date": date_str,
                    "Payee": row.get("Payee", PAYEE),
                    "Memo": (row.get("Memo") or "").strip(),
                    "Amount": amount,
                    "Category": (row.get("Category") or DEFAULT_CATEGORY).strip(),
                    "OrderId": order_id,
                })
    return rows


def build_order_index(items: list[dict]) -> dict[str, OrderGroup]:
    """Group items by OrderId, compute totals and earliest date."""
    by_order: dict[str, list[dict]] = defaultdict(list)
    for item in items:
        by_order[item["OrderId"]].append(item)

    index = {}
    for order_id, order_items in by_order.items():
        total = sum(it["Amount"] for it in order_items)
        dates = [it["Date"] for it in order_items]
        order_date = min(dates) if dates else ""
        index[order_id] = OrderGroup(
            order_id=order_id,
            items=order_items,
            order_total=abs(total),
            order_date=order_date,
        )
    return index


def find_best_match(
    cc: CCTransaction,
    order_index: dict[str, OrderGroup],
    matched_order_ids: set[str],
) -> Optional[OrderGroup]:
    """
    Find best-matching order for a credit card transaction.
    Uses amount tolerance + date proximity. Returns None if no match.
    """
    cc_abs = abs(cc.amount)
    candidates = []

    for order_id, group in order_index.items():
        if order_id in matched_order_ids:
            continue
        # Amount: order_total (pre-tax) <= cc_amount <= order_total * (1 + tax)
        # Or cc_amount within small tolerance of order_total
        if group.order_total <= 0:
            continue
        if cc_abs < group.order_total * 0.8:
            continue
        if cc_abs > group.order_total * (1 + TAX_TOLERANCE) + MIN_AMOUNT_MATCH:
            continue
        days = _days_between(cc.posted_date, group.order_date)
        if days > DATE_TOLERANCE_DAYS:
            continue
        # Prefer: 1) exact amount match, 2) closer date, 3) smaller amount diff
        amount_diff = abs(cc_abs - group.order_total)
        candidates.append((days, amount_diff, group))

    if not candidates:
        return None
    # Sort by: date proximity, then amount proximity
    candidates.sort(key=lambda x: (x[0], x[1]))
    return candidates[0][2]


def generate_output_rows(
    orders: list[CCTransaction],
    order_index: dict[str, OrderGroup],
) -> list[dict]:
    """Generate output rows: matched (split when needed), tax remainder, unmatched."""
    output = []
    matched_order_ids = set()

    for cc in orders:
        # Skip PAYMENT and non-order payees - output as single Uncategorized row
        if _is_non_order_payee(cc.payee):
            output.append({
                "Date": cc.posted_date,
                "Payee": PAYEE,
                "Memo": cc.payee,
                "Amount": cc.amount,
                "Category": DEFAULT_CATEGORY,
                "OrderId": "",
            })
            continue

        # Refunds (positive amount): output as single row unless we add refund matching
        if cc.amount > 0:
            output.append({
                "Date": cc.posted_date,
                "Payee": PAYEE,
                "Memo": cc.payee,
                "Amount": cc.amount,
                "Category": DEFAULT_CATEGORY,
                "OrderId": "",
            })
            continue

        # Purchases: try to match
        match = find_best_match(cc, order_index, matched_order_ids)
        if match is None:
            output.append({
                "Date": cc.posted_date,
                "Payee": PAYEE,
                "Memo": cc.payee,
                "Amount": cc.amount,
                "Category": DEFAULT_CATEGORY,
                "OrderId": "",
            })
            continue

        matched_order_ids.add(match.order_id)

        # Output one row per item (split)
        cc_abs = abs(cc.amount)
        items_total = match.order_total
        remainder = cc_abs - items_total

        for item in match.items:
            output.append({
                "Date": cc.posted_date,
                "Payee": item.get("Payee", PAYEE),
                "Memo": item.get("Memo", ""),
                "Amount": item["Amount"],
                "Category": item.get("Category", DEFAULT_CATEGORY),
                "OrderId": match.order_id,
            })

        # Tax/Shipping remainder (Option A from plan)
        if remainder > MIN_AMOUNT_MATCH:
            output.append({
                "Date": cc.posted_date,
                "Payee": PAYEE,
                "Memo": "Tax/Shipping",
                "Amount": -round(remainder, 2),
                "Category": DEFAULT_CATEGORY,
                "OrderId": match.order_id,
            })

    return output


def main():
    parser = argparse.ArgumentParser(
        description="Match credit card transactions to itemized Amazon orders and output categorized CSV."
    )
    parser.add_argument("orders_csv", help="Path to credit card/orders CSV")
    parser.add_argument("items_csv", help="Path to itemized items CSV")
    parser.add_argument("-o", "--output", default="categorized_transactions.csv", help="Output CSV path")
    args = parser.parse_args()

    if not os.path.isfile(args.orders_csv):
        print(f"Error: Orders file not found: {args.orders_csv}", file=sys.stderr)
        sys.exit(1)
    if not os.path.isfile(args.items_csv):
        print(f"Error: Items file not found: {args.items_csv}", file=sys.stderr)
        sys.exit(1)

    cc_transactions = load_orders_csv(args.orders_csv)
    items = load_items_csv(args.items_csv)
    order_index = build_order_index(items)

    print(f"Loaded {len(cc_transactions)} credit card transactions, {len(items)} items in {len(order_index)} orders.")

    output_rows = generate_output_rows(cc_transactions, order_index)

    # Write CSV
    with open(args.output, mode="w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["Date", "Payee", "Memo", "Amount", "Category", "OrderId"],
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writeheader()
        writer.writerows(output_rows)

    # Summary
    matched = sum(1 for r in output_rows if r.get("OrderId"))
    unmatched = sum(1 for r in output_rows if not r.get("OrderId"))
    tax_rows = sum(1 for r in output_rows if r.get("Memo") == "Tax/Shipping")

    print(f"\nWrote {len(output_rows)} rows to {args.output}")
    print(f"  Matched (with OrderId): {matched}")
    print(f"  Unmatched: {unmatched}")
    if tax_rows:
        print(f"  Tax/Shipping rows: {tax_rows}")
    print("\nNext: Review the CSV, then run:")
    print(f"  YNAB_CSV_FILE={args.output} python3 ynab_import.py")


if __name__ == "__main__":
    main()
