#!/usr/bin/env python3
"""
Import transactions from a CSV into YNAB with category assignment.
Uses .env for YNAB_ACCESS_TOKEN, YNAB_BUDGET_ID, YNAB_ACCOUNT_ID.
Skips duplicates: same amount, date within +/- DAYS_TOLERANCE of an existing transaction.
"""
import csv
import os
import sys
from datetime import datetime, timedelta

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import ynab
from ynab.rest import ApiException

# --- Configuration (env vars; override CSV path here if needed) ---
ACCESS_TOKEN = os.environ.get("YNAB_ACCESS_TOKEN")
BUDGET_ID = os.environ.get("YNAB_BUDGET_ID")
ACCOUNT_ID = os.environ.get("YNAB_ACCOUNT_ID")
CSV_FILE = os.environ.get("YNAB_CSV_FILE", "transactions.csv")

# Payee (lowercase) -> Category name (must match a category in your budget)
CATEGORY_MAPPING = {
    "amazon.ca": "Online Shopping",
    "sobeys": "Groceries",
    "tim hortons": "Dining Out",
    "payroll - employer name": "Income",
}
DEFAULT_CATEGORY_NAME = "Uncategorized"

# Duplicate check: skip if existing tx has same amount and date within +/- N days
DAYS_TOLERANCE = int(os.environ.get("YNAB_DUPLICATE_DAYS", "5"))


def main():
    if not ACCESS_TOKEN or not BUDGET_ID or not ACCOUNT_ID:
        print("Error: Set YNAB_ACCESS_TOKEN, YNAB_BUDGET_ID, and YNAB_ACCOUNT_ID in .env")
        print("  Run: python get_ynab_ids.py to see your budget and account IDs.")
        sys.exit(1)

    if not os.path.isfile(CSV_FILE):
        print(f"Error: CSV file not found: {CSV_FILE}")
        sys.exit(1)

    configuration = ynab.Configuration(access_token=ACCESS_TOKEN)
    with ynab.ApiClient(configuration) as api_client:
        categories_api = ynab.CategoriesApi(api_client)
        transactions_api = ynab.TransactionsApi(api_client)

        # Fetch categories: name -> id
        try:
            categories_response = categories_api.get_categories(BUDGET_ID)
            category_groups = categories_response.data.category_groups
            category_id_map = {}
            for group in category_groups:
                for cat in group.categories:
                    if not getattr(cat, "deleted", True) and not getattr(cat, "hidden", False):
                        category_id_map[cat.name.lower()] = cat.id
            print("Categories fetched successfully.")
        except ApiException as e:
            print(f"Error fetching categories: {e}")
            sys.exit(1)

        # First pass: read CSV rows to get date range for duplicate check
        csv_rows = []
        min_csv_date = None
        max_csv_date = None
        with open(CSV_FILE, mode="r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                date_str = row.get("Date", "").strip()
                if not date_str:
                    continue
                try:
                    date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
                except ValueError:
                    try:
                        date_obj = datetime.strptime(date_str, "%m/%d/%Y").date()
                    except ValueError:
                        continue
                amount_str = row.get("Amount", "0").strip().replace(",", "")
                try:
                    amount = int(float(amount_str) * 1000)
                except ValueError:
                    continue
                csv_rows.append((date_obj, amount, row))
                if min_csv_date is None or date_obj < min_csv_date:
                    min_csv_date = date_obj
                if max_csv_date is None or date_obj > max_csv_date:
                    max_csv_date = date_obj

        # Fetch existing transactions for duplicate check
        existing_by_amount = {}  # amount -> [date, ...]
        if min_csv_date is not None:
            since = (min_csv_date - timedelta(days=DAYS_TOLERANCE)).isoformat()
            try:
                existing_response = transactions_api.get_transactions_by_account(
                    BUDGET_ID, ACCOUNT_ID, since_date=since
                )
                for tx in (existing_response.data.transactions or []):
                    amt = tx.amount
                    tx_date = getattr(tx, "var_date", None) or getattr(tx, "date", None)
                    if tx_date is None:
                        continue
                    dt_str = tx_date.isoformat() if hasattr(tx_date, "isoformat") else str(tx_date)
                    try:
                        dt_obj = datetime.strptime(dt_str[:10], "%Y-%m-%d").date()
                    except (ValueError, TypeError):
                        continue
                    if amt not in existing_by_amount:
                        existing_by_amount[amt] = []
                    existing_by_amount[amt].append(dt_obj)
                print(f"Loaded {sum(len(v) for v in existing_by_amount.values())} existing transaction(s) for duplicate check.")
            except ApiException as e:
                print(f"Warning: Could not fetch existing transactions for duplicate check: {e}")

        def is_duplicate(import_date, import_amount):
            if import_amount not in existing_by_amount:
                return False
            for existing_date in existing_by_amount[import_amount]:
                if abs((import_date - existing_date).days) <= DAYS_TOLERANCE:
                    return True
            return False

        # Build list of NewTransaction, skipping duplicates
        transactions_to_import = []
        skipped_duplicates = 0
        for date_obj, amount, row in csv_rows:
            if is_duplicate(date_obj, amount):
                skipped_duplicates += 1
                continue

            payee = (row.get("Payee") or "").strip()
            memo = (row.get("Memo") or "").strip()[:500]

            # Use per-row Category column if present and non-empty; else payee mapping
            row_category = (row.get("Category") or "").strip()
            if row_category:
                category_name = row_category
            else:
                payee_lower = payee.lower()
                category_name = CATEGORY_MAPPING.get(payee_lower, DEFAULT_CATEGORY_NAME)
            category_id = category_id_map.get(category_name.lower()) if category_name else None
            if category_name and not category_id:
                print(f"Warning: Category '{category_name}' not found for payee '{payee}'. Leaving uncategorized.")

            tx = ynab.NewTransaction(
                account_id=ACCOUNT_ID,
                date=date_obj,
                amount=amount,
                payee_name=payee or None,
                memo=memo or None,
                category_id=category_id,
                cleared="uncleared",
                approved=False,
            )
            transactions_to_import.append(tx)

        if skipped_duplicates:
            print(f"Skipped {skipped_duplicates} duplicate(s) (same amount, date within ±{DAYS_TOLERANCE} days).")

        if not transactions_to_import:
            print("No transactions to import.")
            return

        try:
            wrapper = ynab.PostTransactionsWrapper(transactions=transactions_to_import)
            response = transactions_api.create_transaction(BUDGET_ID, wrapper)
            created = response.data.transactions or []
            duplicate = getattr(response.data, "duplicate_import_ids", None) or []
            print(f"Imported {len(created)} transaction(s).")
            if duplicate:
                print(f"Skipped {len(duplicate)} duplicate(s).")
        except ApiException as e:
            print(f"Error importing transactions: {e}")
            sys.exit(1)


if __name__ == "__main__":
    main()
