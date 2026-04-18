#!/usr/bin/env python3
"""
Find and print transactions assigned to hidden categories in YNAB.
Uses YNAB_ACCESS_TOKEN, YNAB_BUDGET_ID from .env
"""
import os
import sys
from datetime import date, timedelta

try:
    from dotenv import load_dotenv
    _dir = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(_dir, ".env"))
except ImportError:
    pass

import ynab
from ynab.rest import ApiException

ACCESS_TOKEN = os.environ.get("YNAB_ACCESS_TOKEN")
BUDGET_ID = os.environ.get("YNAB_BUDGET_ID")


def main():
    if not ACCESS_TOKEN or not BUDGET_ID:
        print("Error: Set YNAB_ACCESS_TOKEN and YNAB_BUDGET_ID in .env")
        sys.exit(1)

    configuration = ynab.Configuration(access_token=ACCESS_TOKEN)
    with ynab.ApiClient(configuration) as api_client:
        categories_api = ynab.CategoriesApi(api_client)
        transactions_api = ynab.TransactionsApi(api_client)

        # Build set of hidden category IDs and names (include hidden groups + hidden categories)
        hidden_category_ids = set()
        category_id_to_name = {}
        try:
            cat_response = categories_api.get_categories(BUDGET_ID)
            for group in cat_response.data.category_groups or []:
                group_hidden = getattr(group, "hidden", False) or getattr(group, "deleted", False)
                for cat in group.categories or []:
                    cat_hidden = getattr(cat, "hidden", False) or getattr(cat, "deleted", False)
                    cat_id = getattr(cat, "id", None)
                    cat_name = getattr(cat, "name", "") or ""
                    if cat_id:
                        category_id_to_name[cat_id] = f"{group.name} › {cat_name}"
                        if group_hidden or cat_hidden:
                            hidden_category_ids.add(cat_id)
        except ApiException as e:
            print(f"Error fetching categories: {e}")
            sys.exit(1)

        if not hidden_category_ids:
            print("No hidden categories found.")
            return

        print(f"Hidden category IDs: {len(hidden_category_ids)}")
        for cid in hidden_category_ids:
            print(f"  - {category_id_to_name.get(cid, cid)}")

        # Fetch all transactions (last 2 years)
        since = (date.today() - timedelta(days=730)).isoformat()
        all_txs = []
        try:
            resp = transactions_api.get_transactions(BUDGET_ID, since_date=since)
            all_txs = resp.data.transactions or []
        except ApiException as e:
            print(f"Error fetching transactions: {e}")
            sys.exit(1)

        # Filter transactions in hidden categories
        in_hidden = []
        for tx in all_txs:
            if getattr(tx, "deleted", False):
                continue
            cat_id = getattr(tx, "category_id", None)
            if cat_id and cat_id in hidden_category_ids:
                in_hidden.append(tx)

        # Check subtransactions for splits
        for tx in all_txs:
            if getattr(tx, "deleted", False):
                continue
            subs = getattr(tx, "subtransactions", None) or []
            for sub in subs:
                cat_id = getattr(sub, "category_id", None)
                if cat_id and cat_id in hidden_category_ids:
                    if tx not in in_hidden:
                        in_hidden.append(tx)
                    break

        print(f"\nTransactions in hidden categories: {len(in_hidden)}")
        print("-" * 70)
        for tx in sorted(in_hidden, key=lambda t: (getattr(t, "date", "") or "", getattr(t, "amount", 0) or 0)):
            dt = getattr(tx, "var_date", None) or getattr(tx, "date", None)
            dt_str = dt.isoformat()[:10] if hasattr(dt, "isoformat") else str(dt)[:10]
            amt = getattr(tx, "amount", 0) or 0
            amt_dec = amt / 1000
            payee = (getattr(tx, "payee_name", None) or "").strip() or "(no payee)"
            memo = (getattr(tx, "memo", None) or "").strip()[:60] or ""
            cat_id = getattr(tx, "category_id", None)
            cat_name = category_id_to_name.get(cat_id, cat_id or "Split")
            print(f"  {dt_str}  ${amt_dec:>10,.2f}  {payee}")
            print(f"      Memo: {memo}")
            print(f"      Category: {cat_name}")
            print()


if __name__ == "__main__":
    main()
