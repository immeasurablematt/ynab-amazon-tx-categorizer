#!/usr/bin/env python3
"""
UNDO: Revert transactions that were mistakenly moved to Uncategorized
back to their original hidden category [OLD] Garage Reno.
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
from ynab.models.existing_transaction import ExistingTransaction
from ynab.models.put_transaction_wrapper import PutTransactionWrapper

ACCESS_TOKEN = os.environ.get("YNAB_ACCESS_TOKEN")
BUDGET_ID = os.environ.get("YNAB_BUDGET_ID")

# The 3 transactions we incorrectly moved to Uncategorized
REVERT_KEYS = [
    ("2025-11-10", -60000, "Restore St Catharine"),
    ("2025-11-26", -1000000, "E-Transfer to Kristian"),
    ("2025-11-27", -142370, "Amazon"),
]


def main():
    if not ACCESS_TOKEN or not BUDGET_ID:
        print("Error: Set YNAB_ACCESS_TOKEN and YNAB_BUDGET_ID in .env")
        sys.exit(1)

    configuration = ynab.Configuration(access_token=ACCESS_TOKEN)
    with ynab.ApiClient(configuration) as api_client:
        categories_api = ynab.CategoriesApi(api_client)
        transactions_api = ynab.TransactionsApi(api_client)

        # Find [OLD] Garage Reno category ID
        garage_reno_id = None
        cat_response = categories_api.get_categories(BUDGET_ID)
        for group in cat_response.data.category_groups or []:
            for cat in group.categories or []:
                if "[OLD] Garage Reno" in (getattr(cat, "name", "") or ""):
                    garage_reno_id = getattr(cat, "id", None)
                    break
            if garage_reno_id:
                break
        if not garage_reno_id:
            print("Error: [OLD] Garage Reno category not found")
            sys.exit(1)

        since = (date.today() - timedelta(days=730)).isoformat()
        resp = transactions_api.get_transactions(BUDGET_ID, since_date=since)
        all_txs = resp.data.transactions or []

        key_set = {(dt, amt): payee for dt, amt, payee in REVERT_KEYS}
        reverted = 0
        for tx in all_txs:
            if getattr(tx, "deleted", False):
                continue
            dt = getattr(tx, "var_date", None) or getattr(tx, "date", None)
            dt_str = dt.isoformat()[:10] if hasattr(dt, "isoformat") else str(dt)[:10]
            amt = getattr(tx, "amount", 0) or 0
            payee = (getattr(tx, "payee_name", None) or "").strip()
            key = (dt_str, amt)
            if key in key_set and key_set[key] in payee:
                existing = ExistingTransaction(
                    account_id=tx.account_id,
                    var_date=dt,
                    amount=amt,
                    payee_id=getattr(tx, "payee_id", None),
                    payee_name=getattr(tx, "payee_name", None),
                    category_id=garage_reno_id,
                    memo=getattr(tx, "memo", None),
                    cleared=getattr(tx, "cleared", None),
                    approved=getattr(tx, "approved", None),
                    flag_color=getattr(tx, "flag_color", None),
                    subtransactions=None,
                )
                try:
                    transactions_api.update_transaction(BUDGET_ID, tx.id, PutTransactionWrapper(transaction=existing))
                    reverted += 1
                    print(f"  Reverted: {dt_str} ${amt/1000:,.2f} {payee} -> [OLD] Garage Reno")
                except ApiException as e:
                    print(f"  Failed {tx.id}: {e}")
        print(f"\nReverted {reverted} transaction(s).")


if __name__ == "__main__":
    main()
