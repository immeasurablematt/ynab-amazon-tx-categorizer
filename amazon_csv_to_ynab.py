#!/usr/bin/env python3
"""
Convert Amazon Order History Reporter (Chrome extension) CSV to YNAB import format.
Outputs: Date, Payee, Memo, Amount, Category
Usage: python amazon_csv_to_ynab.py <amazon_export.csv> [--output out.csv]
"""
import argparse
import csv
import os
import re
import sys
from datetime import datetime
from typing import Optional

PAYEE = "Amazon.ca"
DEFAULT_CATEGORY = "Uncategorized"

# Budget-ta 2.0 categories + keyword hints for auto-categorization
CATEGORY_KEYWORDS = [
    ("Kids Supplies", ["kid", "baby", "toddler", "diaper", "crib", "stroller", "book", "toy", "magnetic tiles", "pat-a-cake", "oobleck", "bartholomew"]),
    ("Home Maintenance & Decor", ["filter", "furniture", "ottoman", "coffee table", "light bulb", "dimmer", "screwdriver", "scissors", "splatter", "bed rail"]),
    ("Personal Care", ["cerave", "baby wash", "shampoo", "skincare", "makeup", "soap"]),
    ("Wardrobe", ["slipper", "ugg", "shoes", "clothes", "gaiters"]),
    ("Subscriptions (Monthly)", ["prime video", "ad free", "subscription", "appstore", "vimu"]),
    ("Gifts & Giving", ["gift card", "egift", "gingerbread"]),
    ("Retreats", ["buddhism", "vajrayana", "dangerous friend", "dharma"]),
    ("Fitness & Coaching", ["gym", "phone holder", "fitness", "coaching"]),
    ("Groceries", ["glad", "garbage bag", "grocer"]),
]

DATE_COLUMNS = ["order.date", "order date", "order_date", "date", "order placed", "charged on"]
AMOUNT_COLUMNS = ["order.total", "order total", "order_total", "item total", "item.total", "total", "amount", "price"]
MEMO_COLUMNS = ["item.title", "item title", "item_title", "title", "product", "description", "item", "memo", "order.items"]


def _find_column(row_dict: dict, candidates: list[str]) -> Optional[str]:
    keys_lower = {k.strip().lower(): k for k in row_dict.keys()}
    for c in candidates:
        if c.lower() in keys_lower:
            return keys_lower[c.lower()]
    # Partial match
    for c in candidates:
        for k in keys_lower:
            if c.replace(" ", "").replace(".", "") in k.replace(" ", "").replace(".", ""):
                return keys_lower[k]
    return None


def _parse_date(s: str) -> Optional[str]:
    if not s or not str(s).strip():
        return None
    s = str(s).strip()
    for fmt in ["%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%b %d, %Y", "%B %d, %Y", "%d %b %Y", "%d %B %Y"]:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    # Try common patterns
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


def _categorize(memo: str) -> str:
    m = (memo or "").lower()
    for cat, keywords in CATEGORY_KEYWORDS:
        for kw in keywords:
            if kw.lower() in m:
                return cat
    return DEFAULT_CATEGORY


def main():
    parser = argparse.ArgumentParser(
        description="Convert Amazon Order History Reporter CSV to YNAB import format."
    )
    parser.add_argument("input_csv", help="Path to Amazon export CSV from Chrome extension")
    parser.add_argument("-o", "--output", help="Output CSV path (default: amazon_ynab_ready.csv)")
    parser.add_argument("--no-category", action="store_true", help="Skip auto-categorization (leave Category blank)")
    args = parser.parse_args()

    input_path = args.input_csv
    if not os.path.isfile(input_path):
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    output_path = args.output or "amazon_ynab_ready.csv"

    rows_out = []
    date_col = amount_col = memo_col = None

    with open(input_path, mode="r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        for row in reader:
            if date_col is None:
                date_col = _find_column(row, DATE_COLUMNS)
                amount_col = _find_column(row, AMOUNT_COLUMNS)
                memo_col = _find_column(row, MEMO_COLUMNS)
                if not date_col or not amount_col:
                    # Try first row as header
                    print(f"Detected columns: {list(row.keys())[:10]}...")
                    date_col = date_col or (_find_column(row, DATE_COLUMNS) if row else None)
                    amount_col = amount_col or (_find_column(row, AMOUNT_COLUMNS) if row else None)
                    memo_col = memo_col or (_find_column(row, MEMO_COLUMNS) if row else None)
                if date_col:
                    print(f"Using date column: '{date_col}'")
                if amount_col:
                    print(f"Using amount column: '{amount_col}'")
                if memo_col:
                    print(f"Using memo column: '{memo_col}'")
                if not date_col or not amount_col:
                    print("Error: Could not find date and amount columns. Available:", list(row.keys()))
                    sys.exit(1)

            date_str = _parse_date(row.get(date_col, ""))
            amount_val = _parse_amount(row.get(amount_col, ""))
            memo_str = (row.get(memo_col, "") or "").strip()[:500]

            if not date_str or amount_val is None:
                continue

            # YNAB: negative = outflow (spending), positive = inflow (refund)
            if amount_val > 0 and any(
                x in (memo_str or "").lower()
                for x in ["return", "refund", "reimbursement"]
            ):
                amount_ynab = amount_val
            else:
                amount_ynab = -abs(amount_val) if amount_val != 0 else 0

            category = "" if args.no_category else _categorize(memo_str)
            rows_out.append(
                {
                    "Date": date_str,
                    "Payee": PAYEE,
                    "Memo": memo_str or f"Order {date_str}",
                    "Amount": amount_ynab,
                    "Category": category,
                }
            )

    # Deduplicate by (date, amount, memo) - keep first
    seen = set()
    deduped = []
    for r in rows_out:
        key = (r["Date"], r["Amount"], r["Memo"][:100])
        if key not in seen:
            seen.add(key)
            deduped.append(r)

    with open(output_path, mode="w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["Date", "Payee", "Memo", "Amount", "Category"])
        writer.writeheader()
        writer.writerows(deduped)

    print(f"Wrote {len(deduped)} transactions to {output_path}")
    print("Next: Review the CSV, edit Category if needed, then run:")
    print(f"  YNAB_CSV_FILE={output_path} python3 ynab_import.py")


if __name__ == "__main__":
    main()
